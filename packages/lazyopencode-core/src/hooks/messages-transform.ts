/**
 * Context pruning + image redirect + job board + workflow gate via messages.transform.
 *
 * Features:
 *   1. Enhanced pruning: keep system + last N user turns + everything between
 *   2. Image processing (strip images, inject @lazy-observer redirect)
 *   3. Job board injection for lazy primary (terminal unreconciled jobs only)
 *   4. Workflow gate: detect skipped steps, inject STOP message
 *   5. Skill filtering per-agent
 *
 * ponytail: Don't remind — gate. Only inject when a condition is met.
 */

import { mkdir, writeFile } from "node:fs/promises"
import { jobBoard } from "./background-job-board.js"
import type { LazyRuntime } from "./runtime.js"
import { classifyWorkflow, formatWorkflowDecision } from "./workflow-classifier.js"

const DEFAULT_MAX_MESSAGES = 80

// Agent → skills allowed. Empty = all allowed.
// ponytail: hardcoded. Upgrade: load from config.
const AGENT_SKILL_ALLOWLIST: Record<string, Set<string>> = {
  lazy: new Set([
    "lazy/grill",
    "lazy/specify",
    "lazy/plan",
    "lazy/build",
    "lazy/review",
    "lazy/debug",
    "lazy/simplify",
    "lazy/worktree",
  ]),
  // All others: unrestricted by default
}

// ponytail: hardcoded. Upgrade: load from agent config.
const _AGENT_DESCRIPTIONS: Record<string, string> = {
  lazy: "Runtime coordinator: classify → gate → delegate → track → close. Ponytail-first.",
  "lazy-explorer": "Fast codebase recon: glob, grep, AST search.",
  "lazy-oracle": "Architecture, risk, debugging, simplification review.",
  "lazy-fixer": "Mechanical code: stdlib first, one line over fifty.",
  "lazy-librarian": "External docs, API references, web research.",
  "lazy-designer": "UI/UX design, visual polish, responsive layouts.",
  "lazy-observer": "Visual analysis of images, screenshots, PDFs.",
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MessagePart {
  type: string
  text?: string
  tool_call?: { name: string; arguments: string }
  tool_result?: { tool_use_id: string; content: unknown[] }
}

interface ChatMessage {
  info: { role: string; agent?: string }
  parts: MessagePart[]
}

interface TransformInput {
  sessionID?: string
  agent?: string
}

// ---------------------------------------------------------------------------
// Workflow gate detection (ponytail: hook-detected, not prompt-based)
// ---------------------------------------------------------------------------

const BUILD_KEYWORDS = [
  "implement",
  "build",
  "code",
  "write",
  "add",
  "fix",
  "change",
]
const PRD_INDICATORS = [
  "PRD",
  "spec",
  "requirement",
  "issue #",
  "grill",
  "specify",
]
const SPECIFY_KEYWORDS = [
  "specify",
  "write a spec",
  "create a PRD",
]
const GRILL_INDICATORS = [
  "grill",
  "what does success look like",
  "what must not break",
  "alignment",
]
const REVIEW_KEYWORDS = [
  "review this",
  "code review",
  "review my",
  "review the",
]
const DEBUG_KEYWORDS = [
  "debug this",
  "debugging",
  "diagnose",
]

function detectWorkflowSkip(msgs: ChatMessage[]): string | null {
  const userTexts = msgs
    .filter((m) => m.info.role === "user")
    .map((m) => m.parts.filter((p) => p.type === "text" && p.text).map((p) => p.text!).join(" "))
    .filter(Boolean)

  // Last 5 user messages for trigger, last 10 for context
  const recent5 = userTexts.slice(-5).join(" ")
  const recent10 = userTexts.slice(-10).join(" ")

  // BUILD without PRD → "grill first"
  const hasBuild = BUILD_KEYWORDS.some((kw) => new RegExp(`\\b${kw}\\b`, "i").test(recent5))
  if (hasBuild) {
    const hasPrd = PRD_INDICATORS.some((kw) => new RegExp(kw, "i").test(recent10))
    if (!hasPrd) {
      return "STOP. No alignment (grill) done yet. What does success look like? What must not break?"
    }
  }

  // SPECIFY without GRILL → "align first"
  const hasSpecify = SPECIFY_KEYWORDS.some((kw) => new RegExp(kw, "i").test(recent5))
  if (hasSpecify) {
    const hasGrill = GRILL_INDICATORS.some((kw) => new RegExp(kw, "i").test(recent10))
    if (!hasGrill) {
      return "STOP. No alignment done yet. Run lazy/grill first."
    }
  }

  // REVIEW without BUILD → "build first"
  const hasReview = REVIEW_KEYWORDS.some((kw) => new RegExp(kw, "i").test(recent5))
  if (hasReview) {
    const hasBuildRecent = BUILD_KEYWORDS.some((kw) =>
      new RegExp(`\\b${kw}\\b`, "i").test(recent10)
    )
    const hasToolResults = msgs.filter((m) => m.info.role === "tool_result").length > 2
    if (!hasBuildRecent && !hasToolResults) {
      return "STOP. Nothing to review yet. Build something first."
    }
  }

  // DEBUG without repro info → "gather repro first"
  const hasDebug = DEBUG_KEYWORDS.some((kw) => new RegExp(`\\b${kw}\\b`, "i").test(recent5))
  if (hasDebug) {
    const hasRepro =
      /repro|steps? to reproduce|logs?|error message|stack trace|expected.*actual|input.*output/i
        .test(recent10)
    if (!hasRepro) {
      return "STOP. Debugging without repro info. Gather: exact steps, logs, error message, or minimal test case."
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Image processing (ponytail: strip images, inject @lazy-observer redirect)
// ---------------------------------------------------------------------------

/**
 * Detect image/file parts that need redirecting to @lazy-observer.
 * ponytail: match slim's isImagePart but simpler — no MIME map needed.
 */
function isImagePart(p: MessagePart): boolean {
  if (p.type === "image") return true
  if (p.type === "file") {
    // deno-lint-ignore no-explicit-any
    const mime = (p as any).mime
    if (mime?.startsWith("image/")) return true
    // deno-lint-ignore no-explicit-any
    const filename = (p as any).filename ?? (p as any).name
    if (filename && /\.(png|jpg|jpeg|gif|bmp|webp|svg|ico|tiff?|heic)$/i.test(filename)) return true
  }
  return false
}

/**
 * Strip image parts from user messages, save to disk, inject @lazy-observer redirect.
 * Models without vision (DeepSeek, open-source) can't process images.
 */
async function processImageAttachments(
  msgs: ChatMessage[],
  workdir: string,
  sessionID: string,
): Promise<void> {
  const saveDir = `${workdir}/.opencode/lazy/images/${sessionID || "unknown"}`

  for (const msg of msgs) {
    if (msg.info.role !== "user") continue
    const imageParts = msg.parts.filter(isImagePart)
    if (imageParts.length === 0) continue

    const savedPaths: string[] = []

    for (const p of imageParts) {
      // deno-lint-ignore no-explicit-any
      const url = (p as any).url as string | undefined
      if (!url) continue
      const match = url.match(/^data:([^;]+);base64,(.+)$/)
      if (!match) continue

      const mime = match[1]
      const ext = extFromMime(mime)
      // Web Standard: atob is available in Deno, Bun, and Node.js
      const binary = atob(match[2])
      const data = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        data[i] = binary.charCodeAt(i)
      }
      const hash = Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6)
      const filename = `image-${hash}${ext}`

      try {
        await mkdir(saveDir, { recursive: true })
        await writeFile(`${saveDir}/${filename}`, data)
        savedPaths.push(`${saveDir}/${filename}`)
      } catch {
        // silent fail
      }
    }

    // Strip image parts
    msg.parts = msg.parts.filter((p) => !isImagePart(p))

    if (savedPaths.length === 0) continue

    // Inject redirect text
    msg.parts.push({
      type: "text",
      text: `[Image attachment detected. Saved to: ${
        savedPaths.join(", ")
      } Your model may not support image input. Delegate to @lazy-observer with the file path(s) above so it can read the file with its read tool.]`,
    })
  }
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/bmp": ".bmp",
  }
  return map[mime] ?? ".png"
}

// ---------------------------------------------------------------------------
// Hook factory
// ---------------------------------------------------------------------------

export function createMessagesTransformHook(runtime?: LazyRuntime) {
  return async (
    input: TransformInput,
    output: { messages: ChatMessage[] },
  ) => {
    const msgs = output.messages
    const agent = input.agent ?? "lazy"
    const sessionID = input.sessionID ?? ""
    if (sessionID && input.agent) {
      runtime?.sessionAgentMap.set(sessionID, input.agent)
    }

    // 1. Enhanced context pruning
    // Keep: system + last N user turns + everything between them and end
    const maxMessages = runtime?.config.maxMessages ?? DEFAULT_MAX_MESSAGES
    if (msgs.length > maxMessages) {
      const beforePrune = msgs.length
      const system = msgs.find((m) => m.info.role === "system") ?? msgs[0]
      const systemIdx = msgs.indexOf(system)
      const keepTurns = Math.floor(maxMessages / 2)

      const keepIndices = new Set<number>([systemIdx])
      let turns = keepTurns

      // Walk from end, collect last N user messages and everything after each
      for (let i = msgs.length - 1; i > systemIdx && turns > 0; i--) {
        keepIndices.add(i)
        if (msgs[i].info.role === "user") turns--
      }

      let kept = Array.from(keepIndices).sort((a, b) => a - b).map((i) => msgs[i])
      const maxTotal = maxMessages + (systemIdx >= 0 ? 1 : 0)
      if (kept.length > maxTotal) {
        const tail = msgs.filter((_msg, i) => i !== systemIdx).slice(-maxMessages)
        kept = systemIdx >= 0 ? [system, ...tail] : tail
      }
      msgs.splice(0, msgs.length, ...kept)
      await runtime?.recordPruning(beforePrune, msgs.length)
    }

    // 2. Image processing (save to disk and strip, inject @lazy-observer redirect)
    await processImageAttachments(msgs, runtime?.scope.projectRoot ?? process.cwd(), sessionID)

    // 2.5. Detect injected background completions and mark them
    for (const msg of msgs) {
      // deno-lint-ignore no-explicit-any
      const role = (msg as any).role ?? msg.info?.role
      if (role !== "tool_result") continue
      // deno-lint-ignore no-explicit-any
      const meta = (msg as any).metadata
      if (!meta || meta.background_job !== true) continue
      const taskID = meta.task_id as string | undefined
      if (!taskID) continue
      ;(runtime?.jobBoard ?? jobBoard).markInjectedCompletionSeen(taskID)
    }

    // 3. Job board injection (lazy primary only)
    if (agent === "lazy" && sessionID) {
      const board = runtime?.jobBoard ?? jobBoard
      if (board.isDirty()) {
        const full = board.formatForPrompt(sessionID)
        if (full) injectIntoLastUserMessage(msgs, `\n\n${full}`)
        board.markClean()
      } else {
        const mini = board.formatMini(sessionID)
        if (mini) injectIntoLastUserMessage(msgs, `\n\n${mini}`)
      }
    }

    // 4. Workflow gate (lazy primary only)
    if (agent === "lazy" && runtime?.config.workflowGate !== false) {
      const recentText = getRecentUserText(msgs)
      if (recentText) {
        const decision = classifyWorkflow({
          text: recentText,
          mode: runtime?.config.mode ?? "governor",
        })
        await runtime?.recordDecision(decision)
        if (decision.action !== "allow") {
          injectIntoLastUserMessage(msgs, `\n\n${formatWorkflowDecision(decision)}`)
        } else if (decision.level !== "trivial" && decision.level !== "small") {
          // classifyWorkflow allowed — still check for skipped workflow steps
          const gate = detectWorkflowSkip(msgs)
          if (gate) injectIntoLastUserMessage(msgs, `\n\n${gate}`)
        }
      }
    }

    // 5. Skill filtering
    filterSkills(msgs, agent)
  }
}

function getRecentUserText(msgs: ChatMessage[]): string {
  return msgs
    .filter((m) => m.info.role === "user")
    .slice(-5)
    .map((m) =>
      m.parts
        .filter((p) => p.type === "text" && p.text)
        .map((p) => p.text!)
        .join(" ")
    )
    .filter(Boolean)
    .join(" ")
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function injectIntoLastUserMessage(
  msgs: ChatMessage[],
  text: string,
): void {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const msg = msgs[i]
    if (msg.info.role !== "user") continue
    // Append to last text part if one exists, otherwise push new part
    for (let j = msg.parts.length - 1; j >= 0; j--) {
      if (msg.parts[j].type === "text" && msg.parts[j].text !== undefined) {
        msg.parts[j].text += text
        return
      }
    }
    msg.parts.push({ type: "text", text })
    return
  }
}

/**
 * Filter `<available_skills>` blocks in system messages per-agent permissions.
 */
function filterSkills(msgs: ChatMessage[], agent: string): void {
  const allowed = AGENT_SKILL_ALLOWLIST[agent]
  if (!allowed) return // unrestricted

  for (const msg of msgs) {
    for (const part of msg.parts) {
      if (part.type !== "text" || !part.text) continue
      part.text = part.text.replace(
        /<available_skills>([\s\S]*?)<\/available_skills>/g,
        (_full: string, inner: string) => {
          const filtered = filterSkillList(inner, allowed)
          return `<available_skills>\n${filtered}</available_skills>`
        },
      )
    }
  }
}

function filterSkillList(inner: string, allowed: Set<string>): string {
  // Match <skill> blocks that may span multiple lines
  return inner.replace(
    /<skill>[\s\S]*?<\/skill>/g,
    (block: string) => {
      const nameMatch = block.match(/<name>([^<]+)<\/name>/)
      if (nameMatch && !allowed.has(nameMatch[1])) {
        return "" // remove entire block
      }
      return block
    },
  )
}
