import type { AgentConfig } from "@opencode-ai/sdk"
import { LAZY_PROMPT } from "./lazy.js"
import { EXPLORER_PROMPT } from "./explorer.js"
import { ORACLE_PROMPT } from "./oracle.js"
import { LIBRARIAN_PROMPT } from "./librarian.js"
import { DESIGNER_PROMPT } from "./designer.js"
import { FIXER_PROMPT } from "./fixer.js"
import { OBSERVER_PROMPT } from "./observer.js"
import { COUNCILLOR_PROMPT } from "./councillor.js"

export function createAgents(): Record<string, AgentConfig> {
  return {
    lazy: {
      prompt: LAZY_PROMPT,
      description:
        "Runtime coordinator: classify, gate, delegate, track, and close AI coding work. Ponytail philosophy default.",
      mode: "primary",
      tools: { cancel_task: true },
    },
    "lazy-explorer": {
      prompt: EXPLORER_PROMPT,
      description:
        "Fast codebase reconnaissance via glob, grep, AST search. Returns compressed context.",
      mode: "subagent",
    },
    "lazy-oracle": {
      prompt: ORACLE_PROMPT,
      description:
        "Strategic technical advisor for architecture, debugging, review, simplification. YAGNI-first.",
      mode: "subagent",
      tools: { council_session: true },
    },
    "lazy-councillor": {
      prompt: COUNCILLOR_PROMPT,
      description: "Single-model independent judgment worker for council sessions.",
      mode: "subagent",
    },
    "lazy-librarian": {
      prompt: LIBRARIAN_PROMPT,
      description:
        "External documentation, API references, configured docs MCPs, and GitHub code search.",
      mode: "subagent",
    },
    "lazy-designer": {
      prompt: DESIGNER_PROMPT,
      temperature: 0.7,
      description:
        "Visual and interaction design specialist. Layout, hierarchy, motion, responsive systems.",
      mode: "subagent",
    },
    "lazy-fixer": {
      prompt: FIXER_PROMPT,
      description: "Fast mechanical code execution. Ponytail: stdlib first, one line over fifty.",
      mode: "subagent",
    },
    "lazy-observer": {
      prompt: OBSERVER_PROMPT,
      description:
        "Reads images, screenshots, PDFs, diagrams. Returns structured objective observations.",
      mode: "subagent",
    },
  }
}
