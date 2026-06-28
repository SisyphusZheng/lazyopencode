import type { Config } from "@opencode-ai/plugin"
import type { LazyRuntime, TraceStage } from "./runtime.js"
import { DEEPWORK_ACTIVATION } from "./deepwork.js"
import {
  classifyWorkflow,
  formatWorkflowDecision,
  type LazyMode,
  type WorkflowDecision,
} from "./workflow-classifier.js"

type CommandOutput = {
  parts: { type: string; text?: string; [key: string]: unknown }[]
}

const MODES = new Set(["off", "coach", "governor", "strict"])

export function registerLazyCommands(opencodeConfig: Config, runtime: LazyRuntime): void {
  if (!opencodeConfig.command) opencodeConfig.command = {}

  if (runtime.config.commands.lazy && !opencodeConfig.command.lazy) {
    opencodeConfig.command.lazy = {
      template:
        "Scope-govern a task: start/status/reset/mode/explain/review/simplify/debug/close/doctor/verify/risk/behavior/deepwork",
      description: "Classify, gate, track, and close AI coding work",
    }
  }

  if (runtime.config.commands.deepworkAlias && !opencodeConfig.command.deepwork) {
    opencodeConfig.command.deepwork = {
      template: "Alias for /lazy deepwork <task>",
      description: "Compatibility alias for lazy deepwork mode",
    }
  }
}

export function createLazyCommandHandler(runtime: LazyRuntime) {
  return async (
    input: { command: string; arguments?: string; sessionID?: string },
    output: CommandOutput,
  ): Promise<void> => {
    if (input.command === "deepwork" && runtime.config.commands.deepworkAlias) {
      writeText(output, handleDeepwork(input.arguments ?? ""))
      return
    }

    if (input.command !== "lazy") return

    const raw = input.arguments?.trim() ?? ""
    const [subcommand, ...rest] = raw.split(/\s+/)
    const args = rest.join(" ").trim()

    switch (subcommand || "status") {
      case "start":
        await runtime.refreshOpenCodeSnapshot(input.sessionID)
        writeText(output, await handleStart(runtime, args))
        return
      case "status":
        await runtime.refreshOpenCodeSnapshot(input.sessionID)
        writeText(output, runtime.formatStatus(input.sessionID))
        return
      case "reset":
        await runtime.reset()
        writeText(output, "Lazy runtime reset. Stage: idle.")
        return
      case "mode":
        writeText(output, await handleMode(runtime, args))
        return
      case "explain":
        writeText(output, handleExplain(runtime))
        return
      case "review":
        runtime.setStage("review")
        await runtime.save()
        writeText(
          output,
          "Load `lazy/review`. Review current changes for must-fix bugs first, then deletion opportunities and test gaps.",
        )
        return
      case "simplify":
        runtime.setStage("simplify")
        await runtime.save()
        writeText(
          output,
          "Load `lazy/simplify`. Find what to delete, collapse, or replace with stdlib. One finding per line.",
        )
        return
      case "debug":
        writeText(output, await handleDebug(runtime, args))
        return
      case "close":
        await runtime.refreshOpenCodeSnapshot(input.sessionID)
        writeText(output, await handleClose(runtime, input.sessionID))
        return
      case "doctor":
        writeText(output, runtime.formatDoctorReport())
        await runtime.save()
        return
      case "verify":
        writeText(output, await handleVerify(runtime, args))
        return
      case "risk":
        writeText(output, await handleEvidence(runtime, "risk", args, "Remaining risk recorded."))
        return
      case "behavior":
        writeText(
          output,
          await handleEvidence(runtime, "behavior", args, "Changed behavior recorded."),
        )
        return
      case "deepwork":
        writeText(output, handleDeepwork(args))
        return
      default:
        writeText(
          output,
          "Usage: /lazy start <task> | status | reset | mode <off|coach|governor|strict> | explain | review | simplify | debug <msg> | close | doctor | verify <pass|fail|pending> | risk <text> | behavior <text> | deepwork <task>",
        )
    }
  }
}

async function handleStart(runtime: LazyRuntime, task: string): Promise<string> {
  if (!task) return "Usage: /lazy start <task>"

  const decision = classifyWorkflow({ text: task, mode: runtime.config.mode })
  await runtime.recordDecision(decision)
  runtime.setStage(stageForDecision(decision))
  await runtime.save()

  return [
    "LAZY START",
    `Task: ${task}`,
    formatWorkflowDecision(decision),
    `Stage: ${runtime.workflow.stage}`,
    runtime.formatIsolationAdvice(decision),
    `Next: ${decision.suggestedCommand ?? "proceed"}`,
  ].filter(Boolean).join("\n")
}

async function handleMode(runtime: LazyRuntime, mode: string): Promise<string> {
  if (!MODES.has(mode)) {
    return `Current mode: ${runtime.config.mode}. Usage: /lazy mode <off|coach|governor|strict>`
  }
  await runtime.setMode(mode as LazyMode)
  return `Lazy mode set to ${mode}.`
}

function handleExplain(runtime: LazyRuntime): string {
  const decision = runtime.workflow.lastDecision
  if (!decision) return "No lazy decision has been recorded yet."
  return [
    `Last lazy decision: ${decision.action} ${decision.level}`,
    `Reason: ${decision.reason}`,
    `Required stages: ${decision.requiredStages.join(" -> ") || "none"}`,
    `Bypassed: ${decision.bypassedByUser ? "yes" : "no"}`,
  ].join("\n")
}

async function handleDebug(runtime: LazyRuntime, args: string): Promise<string> {
  runtime.setStage("debug")
  await runtime.save()
  return [
    "LAZY DEBUG",
    `Context: ${args || "(no additional context)"}`,
    "",
    "Load `lazy/debug`. Systematic diagnosis loop: reproduce → isolate → hypothesize → test → fix.",
    "Available: @lazy-oracle for escalation, context7 for library API checks.",
  ].join("\n")
}

function handleDeepwork(task: string): string {
  if (!task.trim()) {
    return "What task should deepwork manage? Run `/lazy deepwork <task description>`."
  }
  return DEEPWORK_ACTIVATION(task.trim())
}

async function handleClose(runtime: LazyRuntime, sessionID?: string): Promise<string> {
  runtime.setStage("close")
  await runtime.save()
  return [
    "LAZY CLOSE",
    "Close contract: review, simplify, verify, reconcile.",
    "Manual corrections: /lazy behavior <text>, /lazy risk <text>, /lazy verify <pass|fail|pending>.",
    "",
    runtime.formatCloseReport(sessionID),
  ].join("\n")
}

async function handleVerify(runtime: LazyRuntime, result: string): Promise<string> {
  if (result !== "pass" && result !== "fail" && result !== "pending") {
    return "Usage: /lazy verify <pass|fail|pending>"
  }
  await runtime.recordCloseEvidence("verification", result)
  return `Verification result recorded: ${result}.`
}

async function handleEvidence(
  runtime: LazyRuntime,
  kind: "risk" | "behavior",
  text: string,
  ok: string,
): Promise<string> {
  if (!text.trim()) {
    return kind === "risk" ? "Usage: /lazy risk <text>" : "Usage: /lazy behavior <text>"
  }
  await runtime.recordCloseEvidence(kind, text.trim())
  return ok
}

function stageForDecision(decision: WorkflowDecision): TraceStage {
  if (decision.requiredStages.includes("grill")) return "grill"
  if (decision.requiredStages.includes("debug")) return "debug"
  if (decision.requiredStages.includes("plan")) return "plan"
  if (decision.requiredStages.includes("build")) return "build"
  return "idle"
}

function writeText(output: CommandOutput, text: string): void {
  output.parts.length = 0
  output.parts.push({ type: "text", text })
}
