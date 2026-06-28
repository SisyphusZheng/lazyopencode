# LazyOpenCode User Manual

Version 0.0.1

---

## 1. Overview

LazyOpenCode is a **zero-config governed team runtime** for AI coding in OpenCode. It wraps AI sessions
with a governance layer: classify the task, gate risky work, track background agents,
and close with review.

One plugin install gives you:

- **8 agents** (1 primary + 7 subagents) with role-specific prompts
- **9 workflow skills** (`lazy/grill`, `lazy/specify`, `lazy/plan`, `lazy/build`, ...)
- **Council** multi-LLM parallel analysis
- **Ponytail philosophy** system injection (YAGNI, deletion-first, stdlib-first)
- **Job board** — track, reuse, and reconcile background subagents
- **Token control** — message pruning, image-to-file replacement, skill filtering
- **Permission guard** — ask before destructive commands
- **Optional council escalation** — high-risk, ambiguous, or debug-only by default

---

## 2. Quick Start

### Install

Add to `opencode.json`:

```json
{
  "plugin": ["@lazyopencode/core"]
}
```

No other configuration is required. Default mode is `governor`.
LazyOpenCode Desktop preinstalls this plugin line on first run.

### First Session

After installing, start a session:

```
> /lazy start add sorting to the user list
[Lazy scope: medium. Suggested next step: load lazy/specify.]
```

The workflow gate classifies your request and suggests the next step. You can
override with `just do it` to skip gating.

---

## 3. Agents

| Agent | Mode | Role |
|-------|------|------|
| `lazy` | primary | Runtime coordinator — workflow governance |
| `lazy-explorer` | subagent | Fast codebase recon (glob, grep, AST) |
| `lazy-oracle` | subagent | Architecture, debugging, review, simplification |
| `lazy-librarian` | subagent | External docs, API references, web research |
| `lazy-fixer` | subagent | Bounded implementation, mechanical changes |
| `lazy-designer` | subagent | UI/UX design (temp 0.7) |
| `lazy-observer` | subagent | Image/screenshot analysis |
| `lazy-councillor` | subagent | Single-model judgment for council sessions |

The primary agent (`lazy`) is the entry point. It delegates to subagents as needed.

### Agent Configuration

Each agent is registered by the plugin via the `config` hook. Override in
`opencode.json`:

```json
{
  "agent": {
    "lazy-oracle": {
      "temperature": 0.3
    }
  }
}
```

---

## 4. Skills

Skills are Markdown files loaded by OpenCode. They provide workflow instructions
that the model follows step by step.

### Built-in Skills

| Skill | Purpose | When to Load |
|-------|---------|-------------|
| `lazy/grill` | Interview to sharpen requirements | Ambiguous requests |
| `lazy/specify` | Turn discussion into PRD + tracking issue | After grilling |
| `lazy/plan` | Break PRD into tracer-bullet issues | After spec |
| `lazy/build` | Implement one issue, test-first, YAGNI-gated | After plan |
| `lazy/review` | Code review — find bugs, suggest deletions | After build |
| `lazy/debug` | Systematic diagnosis for hard bugs | Bug investigation |
| `lazy/simplify` | Find what to delete | Code cleanup |
| `lazy/worktree` | Git worktrees for isolation | Multi-branch work |
| `lazy/security` | OWASP audit with PoC | Security review |

### Loading a Skill

In any session, ask the model to load one:

```
load lazy/grill and grill me on the auth rewrite plan
```

The model will read the SKILL.md and follow its instructions.

---

## 5. Commands

### `/lazy start <task>`

Classifies and gates a task. The workflow classifier determines scope:

| Classification | Behavior |
|---------------|----------|
| `trivial` | Passes through directly |
| `medium` | Nudges toward workflow steps |
| `high_risk` | Blocks until scoped |
| `ambiguous` | Blocks until clarified |

### `/lazy status`

Shows:
- Current mode
- Workflow stage
- Install health
- Active background jobs
- Reusable sessions
- Stale sessions
- Token control pruning stats
- Recent gate events

### `/lazy mode <mode>`

Change governance mode:

| Mode | Behavior |
|------|----------|
| `off` | Track state only, no interference |
| `coach` | Nudge, never block |
| `governor` | Block high-risk + ambiguous, nudge medium (default) |
| `strict` | Block medium + high-risk + ambiguous |

### `/lazy deepwork <task>`

Injects a focused, single-goal system prompt. Disables ponytail, delegation, job
board — one agent, one task.

### Other Commands

- `/lazy reset` — Clear runtime state for current scope
- `/lazy explain` — Explain last gate decision
- `/lazy review` — Start review closure
- `/lazy simplify` — Start simplification pass
- `/lazy debug <msg>` — Start systematic debugging
- `/lazy close` — Produce close report and shutdown checklist

---

## 6. Council

See [council.md](council.md) for full documentation.

The council system runs multiple LLMs independently on the same question. The
`lazy-oracle` agent calls `council_session` when it needs diverse perspectives.
By default, council is guarded and only runs for high-risk, ambiguous, or debug
workflows.

Example config:

```json
{
  "lazyopencode": {
    "council": {
      "enabled": true,
      "eligibility": "guarded",
      "maxCouncillors": 3,
      "presets": {
        "code-review": {
          "reasoner": { "model": "openai/o3" },
          "critic": { "model": "anthropic/claude-opus-4" }
        }
      }
    }
  }
}
```

---

## 7. Configuration Reference

Complete `opencode.json` structure:

```jsonc
{
  "plugin": ["@lazyopencode/core"],

  "lazyopencode": {
    // OpenCode SDK surface
    "sdk": {
      "mode": "v2",
      "legacyHookAdapter": true
    },
    "takeover": "governed",

    // Governance mode
    "mode": "governor",

    // Agent limits
    "maxSessionsPerAgent": 2,
    "maxActiveTaskDepth": 4,

    // Context window
    "maxMessages": 80,

    // Destructive action guard
    "permissionGuard": true,

    // Persistence
    "persistence": {},

    // Workflow gate
    "workflowGate": true,

    // Ponytail philosophy
    "ponytailMode": true,

    // OpenCode control-plane collection
    "opencode": {
      "sessionStatus": true,
      "vcsDiff": true,
      "todos": true,
      "permissions": true,
      "worktreeIsolation": "risky-only",
      "revertCheckpoints": true
    },

    // Close report collection
    "closeReport": {
      "autoCollect": true,
      "maxItems": 5
    },

    // Commands
    "commands": {
      "lazy": true,
      "deepworkAlias": true
    },

    // Council (optional)
    "council": {
      "enabled": true,
      "eligibility": "guarded",
      "default_preset": "code-review",
      "timeout": 180000,
      "execution_mode": "parallel",
      "retries": 2,
      "maxCouncillors": 3,
      "presets": {
        "code-review": {
          "reasoner":  { "model": "openai/o3", "prompt": "Find logic defects and edge cases." },
          "critic":    { "model": "anthropic/claude-opus-4" }
        }
      }
    }
  }
}
```

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `sdk.mode` | `"v2"` | Use OpenCode v2 registration surface |
| `sdk.legacyHookAdapter` | `true` | Keep legacy hooks for governance behavior |
| `takeover` | `"governed"` | Governed takeover without provider/auth override |
| `mode` | `"governor"` | `"off"`, `"coach"`, `"governor"`, or `"strict"` |
| `maxSessionsPerAgent` | `2` | Concurrent sessions per subagent role |
| `maxActiveTaskDepth` | `4` | Max nested task depth before blocking |
| `maxMessages` | `80` | Sliding window message count for pruning |
| `permissionGuard` | `true` | Ask before destructive commands |
| `persistence` | `{}` | Persist state to disk (`false` to disable) |
| `workflowGate` | `true` | Enable/disable the workflow classifier gate |
| `ponytailMode` | `true` | Inject ponytail philosophy in system prompt |
| `opencode.worktreeIsolation` | `"risky-only"` | Suggest isolated workspaces for risky tasks |
| `opencode.vcsDiff` | `true` | Collect diff summary when available |
| `opencode.todos` | `true` | Collect todo summary when available |
| `opencode.permissions` | `true` | Include pending permission state in status |
| `closeReport.autoCollect` | `true` | Collect close evidence from tool results |
| `closeReport.maxItems` | `5` | Max remembered close evidence per section |
| `commands.lazy` | `true` | Enable `/lazy` commands |
| `commands.deepworkAlias` | `true` | Enable `/lazy deepwork` alias |
| `council.enabled` | `true` | Enable council escalation |
| `council.eligibility` | `"guarded"` | `"guarded"` or `"always"` council access |
| `council.presets` | `{}` | Council preset definitions |
| `council.timeout` | `180000` | Council timeout in ms |
| `council.execution_mode` | `"parallel"` | `"parallel"` or `"serial"` |
| `council.retries` | `2` | Failed councillor retry count |
| `council.maxCouncillors` | `3` | Hard cap on model calls per council run |

---

## 8. Token Control

### Message Pruning

When a session exceeds `maxMessages` (default 80), older messages are dropped.
System messages and the most recent user+assistant turns are preserved.

### Image Handling

Image attachments in user messages are:
1. Written to `.opencode/lazy/images/<sessionID>/<hash>.png`
2. Replaced with a text reference: `Image saved to <path>`
3. Available for `@lazy-observer` to read

Images are cleaned up when the session is deleted or errors. Clear
`.opencode/lazy/images/` manually if OpenCode exits before lifecycle cleanup runs.

### Job Board in Context

The job board status is injected into the last user message as a compact summary:
- Active jobs: `Jobs: 2r/0u` (2 running, 0 unresolved)
- Completed jobs
- Reusable session IDs

## 8.1 Permission Guard

When `permissionGuard` is enabled, destructive commands stay at `ask` even if the
main workflow mode is `off`. Set `permissionGuard: false` only when another
policy layer owns destructive-action approval.

---

## 9. Workflow Gating

The workflow classifier (`workflow-classifier.ts`) uses rule-based pattern matching:

### Classification Rules

| Level | Pattern Examples |
|-------|-----------------|
| `trivial` | Typo, rename, format, comment, log |
| `medium` | (>80 chars) or feature, refactor, migrate |
| `high_risk` | Delete, drop, rewrite, auth, payment, security |
| `ambiguous` | Optimize, improve, upgrade, fix all |

### Gate Behavior

```
trivial    → pass through (no gate)
medium     → nudge: "Suggested next step: load lazy/specify"
high_risk  → block: "Need scope, success criteria, must-not-break list"
ambiguous  → block: "Sharpen the task with lazy/grill"
```

To override a gate, say `just do it`.

---

## 10. Troubleshooting

### Plugin not loading

Check:
- Plugin name matches exactly: `"@lazyopencode/core"`
- Package is installed (`ls node_modules/@lazyopencode/core`)
- OpenCode version is compatible (requires SDK `^1.2.6`)

### Skills not found

Run:
```
/lazy status
```

If skills are missing from the status output, check:
- `src/skills/lazy/` directory exists
- Path is correctly resolved (see `dist/skills/index.js` in installed package)

### Council fails

Check configuration:
- Preset names match (`default_preset` must exist in `presets`)
- Model IDs are valid (`providerID/modelID` format)
- API keys for specified providers are configured in OpenCode

### Workflow gate too aggressive

Lower the mode:
```
/lazy mode coach
```

This keeps state tracking but passes all gates.

---

## 11. Internal Architecture

For the module-level architecture, see [architecture.md](architecture.md).

Key modules:

| Module | Responsibility |
|--------|---------------|
| `src/index.ts` | Plugin entry, wires runtime + hooks + tools |
| `src/hooks/runtime.ts` | LazyRuntime: config, scope, persistence, state machine |
| `src/hooks/background-job-board.ts` | Job state machine (6 states, reuse, prompt injection) |
| `src/hooks/messages-transform.ts` | Pruning, image→file, job board, gate, skill filter |
| `src/hooks/system-transform.ts` | Ponytail + lazy system prompt injection |
| `src/hooks/workflow-classifier.ts` | Rule-based risk classification |
| `src/council/council-manager.ts` | Multi-LLM parallel analysis engine |
| `src/agents/` | 8 agent prompt definitions |
| `src/skills/lazy/` | 9 SKILL.md workflow files |

---

## 12. Limits and Known Issues

| Area | Limitation |
|------|-----------|
| Sessions | No cross-session state sharing |
| Image cleanup | `.opencode/lazy/images/<sessionID>` is cleaned on session delete/error; manual cleanup may be needed after hard exits |
| Council cost | N councillors = N model invocations; use selectively |
| Workflow gate | Rule-based classifier, may misclassify complex but safe tasks |
| Persistence | File-based, no encryption, no remote sync |
| Skill loading | Unicode characters in SKILL.md filenames may cause issues on Windows |
