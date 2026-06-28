/**
 * Task session management — track subagent dispatch via BackgroundJobBoard.
 *
 * Matches slim's full state machine:
 *   - Launch registration (tool.execute.before)
 *   - Completion parsing (tool.execute.after)
 *   - Context file accumulation (tool.execute.after read)
 *   - Late-cancel normalization
 */

import { jobBoard } from "./background-job-board.js"
import type { LazyRuntime } from "./runtime.js"

// ---------------------------------------------------------------------------
// Max active subagent launches per session
// ---------------------------------------------------------------------------

const sessionDepth = new Map<string, number>()
const trackedTaskCalls = new Set<string>()

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolBeforeInput {
  tool: string
  sessionID: string
  callID: string
}

interface ToolBeforeOutput {
  args: Record<string, unknown>
}

interface ToolAfterInput {
  tool: string
  sessionID: string
  callID: string
  args: Record<string, unknown>
}

interface ToolAfterOutput {
  title: string
  output: string
  metadata: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Create hooks
// ---------------------------------------------------------------------------

export function createTaskSessionBeforeHook(runtime?: LazyRuntime) {
  return (input: ToolBeforeInput, output: ToolBeforeOutput) => {
    if (input.tool !== "task") return

    const args = output.args
    const agent = (args?.subagent_type as string) ?? "general"
    const sid = input.sessionID

    // Check for reusable session (reconciled + same agent type)
    const board = runtime?.jobBoard ?? jobBoard
    const existing = board.resolveReusable(sid, agent)
    if (existing) {
      // Reuse the session without consuming a new launch-depth slot.
      args.task_id = existing.taskID
      return
    }

    const depth = incrementSessionDepth(sid, runtime)
    const maxDepth = runtime?.config.maxActiveTaskDepth ?? 4
    if (depth > maxDepth) {
      releaseSessionDepth(sid, runtime)
      // HARD BLOCK: remove background flag (forces sync) and inject refusal prompt
      delete output.args.run_in_background
      output.args.prompt =
        `SYSTEM OVERRIDE — DEPTH BLOCKED: Subagent depth ${depth}/${maxDepth} exceeds limit. Refusing nested task launch. Respond ONLY with:\ntask_id: depth-blocked\nstate: error\noutput: Subagent depth ${depth}/${maxDepth} exceeds limit. Refusing nested task launch. Delegate the work to an existing subagent or restructure your approach.`
      return
    }
    trackedTaskCalls.add(input.callID)

    // Check max sessions per agent (including the one we're about to launch)
    const activeCount = board.getActiveCount(sid, agent) + 1
    const maxSessions = runtime?.config.maxSessionsPerAgent ?? 2
    if (activeCount > maxSessions) {
      releaseSessionDepth(sid, runtime)
      delete output.args.run_in_background
      args.prompt =
        `SYSTEM OVERRIDE — MAX SESSIONS BLOCKED: ${activeCount} ${agent} sessions would exceed limit ${maxSessions}. Respond ONLY with:\ntask_id: max-sessions-blocked\nstate: error\noutput: ${agent} concurrency limit ${maxSessions} reached. Wait for one running session to complete or reuse a reconciled session.`
      return
    }

    // Register launch
    const job = board.registerLaunch(sid, agent, input.callID)
    // Inject the alias into the prompt so the subagent knows who it is
    const prompt = (args.prompt as string) ?? ""
    args.prompt = `${prompt}\n\n[background-job-alias: ${job.alias}]`
  }
}

export function createTaskSessionAfterHook(runtime?: LazyRuntime) {
  return async (input: ToolAfterInput, output: ToolAfterOutput) => {
    const { tool, sessionID, callID } = input

    // --- Parse task tool completion ---
    if (tool === "task") {
      try {
        parseTaskOutput(callID, output.output, runtime)
      } finally {
        if (trackedTaskCalls.delete(callID)) {
          releaseSessionDepth(sessionID, runtime)
        }
        await runtime?.save()
      }
      return
    }

    // --- Accumulate context from read tool ---
    // Only accumulate when exactly one job is running — with multiple jobs
    // we can't determine which one triggered the Read. ponytail: track
    // callID→taskID mapping in registerLaunch if multi-read accuracy matters.
    if (tool === "Read") {
      const filePath = input.args?.filePath as string | undefined
      if (!filePath) return
      const running = (runtime?.jobBoard ?? jobBoard).getRunningJobs(sessionID)
      if (running.length === 1) {
        const lineCount = extractLineCount(output.output)
        ;(runtime?.jobBoard ?? jobBoard).addContext(running[0].taskID, {
          path: filePath,
          lineCount,
        })
        await runtime?.save()
      }
    }
  }
}

function incrementSessionDepth(sessionID: string, runtime?: LazyRuntime): number {
  const map = runtime?.sessionDepth ?? sessionDepth
  // Prune to prevent memory leaks
  if (map.size > 1000) {
    const firstKey = map.keys().next().value as string
    map.delete(firstKey)
  }
  const depth = (map.get(sessionID) ?? 0) + 1
  map.set(sessionID, depth)
  return depth
}

function releaseSessionDepth(sessionID: string, runtime?: LazyRuntime): void {
  const map = runtime?.sessionDepth ?? sessionDepth
  const depth = map.get(sessionID)
  if (!depth) return
  if (depth <= 1) {
    map.delete(sessionID)
    return
  }
  map.set(sessionID, depth - 1)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse task tool output to extract task_id + state.
 */
function parseTaskOutput(callID: string, output: string, runtime?: LazyRuntime): void {
  const board = runtime?.jobBoard ?? jobBoard
  const taskID = extractTaskID(output)
  const state = extractState(output)
  const summary = extractSummary(output)

  // Late-cancel check
  if (board.isLateCancelledTaskError(callID) && state === "error") {
    board.updateStatus(callID, taskID ?? callID, "cancelled")
    return
  }

  if (state && taskID) {
    board.updateStatus(callID, taskID, state, summary)
  } else if (state) {
    // Use callID as fallback taskID
    board.updateStatus(callID, callID, state, summary)
  }
}

function extractTaskID(output: string): string | null {
  const match = output.match(/task_id:\s*(\S+)/)
  return match ? match[1] : null
}

function extractState(output: string): "completed" | "error" | "cancelled" | null {
  if (output.includes("state: cancelled")) return "cancelled"
  if (output.includes("state: error")) return "error"
  if (output.includes("state: completed")) return "completed"
  // Heuristic based on output
  if (/error|fail|crash/i.test(output.slice(0, 200))) return "error"
  if (/completed|done|finished/i.test(output.slice(0, 200))) return "completed"
  return null
}

function extractSummary(output: string): string | undefined {
  // First non-empty line after "result:" or "summary:" or the first output line
  const lines = output.split("\n").map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return undefined

  const resultIdx = lines.findIndex((l) => /^(result|summary|output)\s*:/i.test(l))
  if (resultIdx >= 0 && resultIdx + 1 < lines.length) {
    return lines[resultIdx + 1]
  }
  // Fallback: first line up to 200 chars
  return lines[0].slice(0, 200)
}

function extractLineCount(output: string): number {
  const lines = output.split("\n").filter((l) => l.trim()).length
  return lines
}
