import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { type RequiredCouncilConfig, runCouncil } from "../council/index.js"

export function createCouncilTool(
  // deno-lint-ignore no-explicit-any
  client: any,
  getCouncilConfig: () => RequiredCouncilConfig,
  getEligibility?: () => { eligible: boolean; reason?: string },
): ToolDefinition {
  return tool({
    description:
      "Run a multi-LLM council session. Multiple models independently analyze the same question, then return results for synthesis. Use for high-risk decisions, ambiguous bugs, or architectural choices with long-term impact.",
    args: {
      prompt: tool.schema.string().describe("The question or task for council members"),
      preset: tool.schema.string().optional().describe(
        "Council preset name (configured in lazyopencode.council.presets)",
      ),
    },
    execute: async (args, context) => {
      const councilConfig = getCouncilConfig()
      if (!councilConfig.enabled) {
        return { output: "Council error: Council is disabled by config", metadata: { error: true } }
      }
      const eligibility = getEligibility?.() ?? { eligible: true }
      if (!eligibility.eligible) {
        return {
          output: eligibility.reason ??
            'Council blocked: not eligible for current workflow. Run /lazy start for risk classification, enter debug, or set council.eligibility = "always".',
          metadata: { error: true },
        }
      }
      await context.ask?.({
        permission: "Run a multi-LLM council session",
        patterns: ["council_session"],
        always: [],
        metadata: { preset: args.preset, prompt: args.prompt },
      })
      const result = await runCouncil(
        args.prompt,
        client,
        councilConfig,
        args.preset,
        context.sessionID,
        context.abort,
      )
      if (!result.success) {
        return {
          output: result.formatted || `Council error: ${result.error || "unknown"}`,
          metadata: { error: true },
        }
      }
      return { output: result.formatted }
    },
  })
}
