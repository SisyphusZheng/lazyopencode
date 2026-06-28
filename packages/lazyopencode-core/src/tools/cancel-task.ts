import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { BackgroundJobBoard } from "../hooks/background-job-board.js"

export function createCancelTaskTool(jobBoard: BackgroundJobBoard): ToolDefinition {
  return tool({
    description:
      "Cancel a running background job by task ID. Use when a subagent is no longer needed or a running lane becomes obsolete.",
    args: {
      task_id: tool.schema.string().describe(
        "The task ID of the running job to cancel (e.g. 'lazy-oracle-3' or the session ID shown in the Background Job Board).",
      ),
      reason: tool.schema.string().optional().describe(
        "Optional reason for cancellation (logged for traceability).",
      ),
    },
    execute: async (args, context) => {
      const { task_id, reason } = args

      await context.ask?.({
        permission: "Cancel a running background job",
        patterns: ["cancel_task"],
        always: [],
        metadata: { task_id, reason },
      })

      const job = jobBoard.findJobByTaskID(task_id) ?? jobBoard.findJobByAlias(task_id)
      if (!job) {
        return {
          output: `No job found with task ID: ${task_id}`,
          metadata: { error: true },
        }
      }
      if (job.state !== "running") {
        return {
          output:
            `Job ${task_id} is already in state: ${job.state} (not running). No action taken.`,
          metadata: { state: job.state },
        }
      }

      jobBoard.cancelJob(task_id)
      return {
        output: `Cancelled: ${job.alias} (${task_id})${reason ? ` — ${reason}` : ""}`,
        metadata: { task_id, alias: job.alias, state: "cancelled" },
      }
    },
  })
}
