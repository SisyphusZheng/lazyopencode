import type { Config, Plugin } from "@opencode-ai/plugin"
import type { AgentConfig } from "@opencode-ai/sdk"
import { createAgents } from "./agents/index.js"
import { createHooks } from "./hooks/index.js"
import { registerLazyCommands } from "./hooks/lazy-command.js"
import { createLazyRuntime, type LazyConfig } from "./hooks/runtime.js"
import { getSkillsDir } from "./skills/index.js"
import { createCancelTaskTool, createCouncilTool } from "./tools/index.js"
import { createOpenCodeControlPlane } from "./opencode-control-plane.js"

/** Runtime config shape with skills (present at runtime, missing from v1 SDK types) */
interface RuntimeConfig extends Config {
  lazyopencode?: LazyConfig
  skills?: { paths?: string[]; urls?: string[] }
}

/**
 * @lazyopencode/core — Governed team runtime for AI coding in OpenCode.
 *
 * One plugin. Zero config. Total takeover.
 *
 * Install: { "plugin": ["@lazyopencode/core"] }
 */
const LazyOpenCodePluginV1: Plugin = async (ctx) => {
  const agents = createAgents()
  const runtime = createLazyRuntime({
    project: ctx.project,
    directory: ctx.directory,
    worktree: ctx.worktree,
  })
  runtime.setControlPlane(createOpenCodeControlPlane(ctx.client))
  const hooks = createHooks(runtime)
  const councilTool = createCouncilTool(
    ctx.client,
    () => runtime.config.council,
    () => {
      const council = runtime.config.council
      if (council.eligibility === "always") return { eligible: true }
      const level = runtime.workflow.lastDecision?.level
      if (level === "high_risk" || level === "ambiguous") return { eligible: true }
      if (runtime.workflow.stage === "debug") return { eligible: true }
      return {
        eligible: false,
        reason:
          'Council blocked: not eligible for current workflow. Run /lazy start for risk classification, enter debug, or set council.eligibility = "always".',
      }
    },
  )
  const cancelTaskTool = createCancelTaskTool(runtime.jobBoard)

  return {
    runtime,
    tool: {
      council_session: councilTool,
      cancel_task: cancelTaskTool,
    },
    config: async (config: Config) => {
      const cfg = config as RuntimeConfig
      runtime.configure(cfg.lazyopencode)
      await runtime.load()
      cfg.agent = mergeAgents(cfg.agent ?? {}, agents)
      cfg.skills = cfg.skills || {}
      const paths = cfg.skills.paths || []
      const skillsDir = getSkillsDir()
      if (!paths.includes(skillsDir)) {
        paths.push(skillsDir)
      }
      cfg.skills.paths = paths
      // deno-lint-ignore no-explicit-any
      const mcp = (cfg as any).mcp as Record<string, unknown> | undefined
      if (!mcp?.context7) {
        // deno-lint-ignore no-explicit-any
        ;(cfg as any).mcp = {
          ...(mcp || {}),
          context7: { command: ["npx", "-y", "@agentdesk/context7-mcp"] },
        }
      }
      registerLazyCommands(cfg, runtime)
    },
    dispose: async () => {
      await runtime.save()
    },
    ...hooks,
  }
}

const LazyOpenCodePlugin = LazyOpenCodePluginV1

export { LazyOpenCodePlugin, LazyOpenCodePluginV1 }
export default LazyOpenCodePluginV1

function mergeAgents(
  existing: NonNullable<RuntimeConfig["agent"]>,
  lazyAgents: ReturnType<typeof createAgents>,
): NonNullable<RuntimeConfig["agent"]> {
  const merged = { ...existing }
  for (const [name, defaults] of Object.entries(lazyAgents)) {
    merged[name] = { ...(defaults as object), ...(merged[name] as object) } as AgentConfig
  }
  return merged
}
