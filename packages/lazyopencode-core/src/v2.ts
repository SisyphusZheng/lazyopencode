import { define } from "@opencode-ai/plugin/v2/promise"
import { createAgents } from "./agents/index.js"
import { getSkillsDir } from "./skills/index.js"

type TransformRegistration<T> = {
  transform(callback: (draft: T) => void | Promise<void>): void
}

type AgentDraftLike = {
  get?(id: string): unknown
  update?(id: string, update: (agent: Record<string, unknown>) => void): void
  default?(id: string | undefined): void
}

type CommandDraftLike = {
  get?(name: string): unknown
  update?(name: string, update: (command: Record<string, unknown>) => void): void
}

type SkillDraftLike = {
  source?(source: unknown): void
}

type ReferenceDraftLike = {
  add?(name: string, source: unknown): void
}

export const LazyOpenCodeV2Plugin = define({
  id: "lazyopencode-core",
  setup(context) {
    const ctx = context as unknown as {
      agent?: TransformRegistration<AgentDraftLike>
      command?: TransformRegistration<CommandDraftLike>
      skill?: TransformRegistration<SkillDraftLike>
      reference?: TransformRegistration<ReferenceDraftLike>
    }

    ctx.agent?.transform((draft) => {
      for (const [id, defaults] of Object.entries(createAgents())) {
        draft.update?.(id, (agent) => {
          Object.assign(agent, { ...defaults, ...agent })
        })
      }
      draft.default?.("lazy")
    })

    ctx.command?.transform((draft) => {
      draft.update?.("lazy", (command) => {
        Object.assign(command, {
          template:
            "Scope-govern a task: start/status/reset/mode/explain/review/simplify/debug/close/doctor/verify/risk/behavior/deepwork",
          description: "Classify, gate, track, and close AI coding work",
          ...command,
        })
      })
      draft.update?.("deepwork", (command) => {
        Object.assign(command, {
          template: "Alias for /lazy deepwork <task>",
          description: "Compatibility alias for lazy deepwork mode",
          ...command,
        })
      })
    })

    ctx.skill?.transform((draft) => {
      draft.source?.({ type: "local", path: getSkillsDir() })
    })

    ctx.reference?.transform((draft) => {
      draft.add?.("lazyopencode", {
        type: "local",
        path: getSkillsDir(),
      })
    })
  },
})
