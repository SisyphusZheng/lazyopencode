import type { Model, UserMessage } from "@opencode-ai/sdk"
import type { ProviderContext } from "@opencode-ai/plugin"
import type { LazyRuntime } from "./runtime.js"

/**
 * Per-agent LLM parameter configuration.
 * Sets temperature and other params based on agent role.
 *
 * ponytail: hardcoded defaults. Designer gets 0.7 for creativity, rest 0.1-0.2.
 */

const AGENT_TEMPERATURES: Record<string, number> = {
  lazy: 0.1,
  "lazy-explorer": 0.1,
  "lazy-oracle": 0.1,
  "lazy-librarian": 0.2,
  "lazy-designer": 0.7,
  "lazy-fixer": 0.2,
  "lazy-observer": 0.1,
}

export function createChatParamsHook(runtime?: LazyRuntime) {
  return async (
    input: {
      sessionID: string
      agent: string
      model: Model
      provider: ProviderContext
      message: UserMessage
    },
    output: {
      temperature: number
      topP: number
      topK: number
      maxOutputTokens: number | undefined
      options: Record<string, unknown>
    },
  ) => {
    const temp = AGENT_TEMPERATURES[input.agent] ?? 0.2
    output.temperature = temp
    const map = runtime?.sessionAgentMap
    if (map) {
      map.set(input.sessionID, input.agent)
      // Prune to prevent memory leaks
      if (map.size > 1000) {
        const firstKey = map.keys().next().value as string
        map.delete(firstKey)
      }
    }
  }
}
