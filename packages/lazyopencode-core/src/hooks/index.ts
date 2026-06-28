import type { Hooks } from "@opencode-ai/plugin"
import type { LazyRuntime } from "./runtime.js"
import { createSystemTransformHook } from "./system-transform.js"
import { createMessagesTransformHook } from "./messages-transform.js"
import { createChatParamsHook } from "./chat-params.js"
import { createTaskSessionAfterHook, createTaskSessionBeforeHook } from "./task-session.js"
import { createErrorRecoveryHook } from "./error-recovery.js"
import { createSessionEventsHook } from "./session-events.js"
import { jobBoard } from "./background-job-board.js"
import { createApplyPatchRescueHook } from "./apply-patch-rescue.js"
import { createLazyCommandHandler } from "./lazy-command.js"
import { createPermissionGuardHook } from "./permission-guard.js"

// Compose tool.execute.before: patch rescue before task session manager
const applyPatchRescue = createApplyPatchRescueHook()

export function createHooks(runtime?: LazyRuntime): Pick<
  Hooks,
  | "experimental.chat.system.transform"
  | "experimental.chat.messages.transform"
  | "experimental.session.compacting"
  | "experimental.compaction.autocontinue"
  | "chat.params"
  | "command.execute.before"
  | "permission.ask"
  | "tool.execute.before"
  | "tool.execute.after"
  | "event"
> {
  const taskSessionBefore = createTaskSessionBeforeHook(runtime)
  const taskSessionAfter = createTaskSessionAfterHook(runtime)
  const errorRecovery = createErrorRecoveryHook(runtime)
  const commandHandler = runtime ? createLazyCommandHandler(runtime) : undefined
  const permissionGuard = createPermissionGuardHook(runtime)
  const sessionEvents = createSessionEventsHook(
    (sid: string) =>
      (runtime?.jobBoard ?? jobBoard).getTerminalUnreconciledJobs(sid).map((j) => j.taskID),
    runtime,
  )

  return {
    "experimental.chat.system.transform": createSystemTransformHook(runtime),
    "experimental.chat.messages.transform": createMessagesTransformHook(runtime),
    "experimental.session.compacting": async (_input, output) => {
      const stage = runtime?.workflow.stage
      const decision = runtime?.workflow.lastDecision
      if (stage && stage !== "idle") {
        output.context.push(`Current workflow stage: ${stage}`)
      }
      if (decision) {
        output.context.push(
          `Last workflow decision: ${decision.action} (${decision.level}) — ${decision.reason}`,
        )
      }
      const recentEvents = runtime?.workflow.recentEvents.slice(-5)
      if (recentEvents && recentEvents.length > 0) {
        output.context.push(`Recent events: ${recentEvents.map((e) => e.summary).join("; ")}`)
      }
    },
    "experimental.compaction.autocontinue": async (_input, output) => {
      const stage = runtime?.workflow.stage
      // Disable auto-continue during user-interaction stages
      if (stage === "grill" || stage === "specify" || stage === "plan") {
        output.enabled = false
      }
    },
    "chat.params": createChatParamsHook(runtime),
    "command.execute.before": async (input, output) => {
      if (commandHandler) await commandHandler(input, output)
    },
    "permission.ask": permissionGuard,
    "tool.execute.before": async (input, output) => {
      await taskSessionBefore(input, output)
      await applyPatchRescue(input, output)
    },
    "tool.execute.after": async (input, output) => {
      await taskSessionAfter(input, output)
      await runtime?.recordToolEvidence(
        input as unknown as Record<string, unknown>,
        output as unknown as Record<string, unknown>,
      )
      await errorRecovery(input, output)
    },
    "event": sessionEvents,
  }
}
