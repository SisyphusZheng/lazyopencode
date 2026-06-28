# LazyOpenCode

Zero-config governed team runtime for AI coding in OpenCode.

LazyOpenCode turns OpenCode into a governed AI coding team. It includes a primary
runtime coordinator, focused subagents, workflow skills, risk gates, background
job tracking, context budgets, destructive-action guardrails, and close reports.
The product goal is simple: keep AI coding scoped, visible, budgeted, and
reviewed without making users assemble their own OpenCode setup.

> Full manual: [docs/user-manual.md](docs/user-manual.md)
> Architecture: [docs/architecture.md](docs/architecture.md)
> Product audit: [docs/product-audit.md](docs/product-audit.md)
> Work plan: [docs/work-plan.md](docs/work-plan.md)
> Council: [docs/council.md](docs/council.md)
> OpenCode integration: [docs/opencode-integration.md](docs/opencode-integration.md)
> Desktop distribution: [docs/desktop-distribution.md](docs/desktop-distribution.md)

## Why

AI coding often overbuilds, drifts away from the request, launches work that is hard to reconcile, and stops before review. LazyOpenCode makes those failure modes explicit:

- classify the task before implementation
- gate vague or high-risk work until scope is clear
- track background jobs and reusable sessions
- close work with review, simplify, and verification
- ask before destructive commands

## Is It Zero Config?

Yes for the core plugin. After OpenCode loads `lazyopencode-core`, LazyOpenCode
registers its primary agent, subagents, workflow skills, `/lazy` commands,
permission guard, job board, token budget, council guard, persistence, doctor,
and close report defaults.

You do **not** need to configure providers, models, auth, MCP, or project
settings for LazyOpenCode. It preserves your existing OpenCode setup.

Desktop is not required. LazyOpenCode Desktop is a later `0.1.0` distribution
stage.

## Install From npm

Prerequisite: OpenCode is installed and connected to at least one model provider.

Add the plugin to your OpenCode config:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["lazyopencode-core"]
}
```

Use a global config if you want LazyOpenCode everywhere:

```text
~/.config/opencode/opencode.jsonc
```

Use a project config if you want it only for one repo:

```text
opencode.json
```

OpenCode installs npm plugins automatically on startup. Scoped npm packages are
supported.

OpenCode also accepts `~/.config/opencode/opencode.json` if you prefer JSON
without comments.

Then start OpenCode in your project:

```bash
opencode
```

Run the health check:

```text
/lazy doctor
```

## Try From This Repository

Use this path before the package is published, or when developing LazyOpenCode
itself.

Build the package:

```bash
cd packages/lazyopencode-core
npm run build
```

Create a local OpenCode plugin file in the project where you want to test it:

```bash
mkdir -p .opencode/plugins
```

```js
// .opencode/plugins/lazyopencode.js
import { LazyOpenCodePlugin } from "/absolute/path/to/lazyopencode/packages/lazyopencode-core/dist/index.js"

export const LazyOpenCode = LazyOpenCodePlugin
```

Replace `/absolute/path/to/lazyopencode` with your local checkout path.

Then start OpenCode:

```bash
opencode
```

Check it loaded:

```text
/lazy doctor
```

## First Run

Start a task through LazyOpenCode instead of asking OpenCode to immediately
build:

```text
/lazy start add user registration
```

LazyOpenCode classifies the task and chooses the next workflow stage:

```text
LAZY START
Task: add user registration
Decision: nudge medium
Stage: plan
Next: lazy/specify
```

During work, inspect state:

```text
/lazy status
```

Before finishing, close the loop:

```text
/lazy close
```

If LazyOpenCode did not observe a fact automatically, record it explicitly:

```text
/lazy behavior Registration now validates email before submit
/lazy risk Password reset flow not touched
/lazy verify pass
```

## Optional Config

No `lazyopencode` config block is required. The block below only customizes
defaults. LazyOpenCode Desktop will preinstall the plugin and defaults in the
future distribution.

Full optional config:

```json
{
  "lazyopencode": {
    "sdk": {
      "mode": "v2",
      "legacyHookAdapter": true
    },
    "takeover": "governed",
    "mode": "governor",
    "maxSessionsPerAgent": 2,
    "maxActiveTaskDepth": 4,
    "maxMessages": 80,
    "permissionGuard": true,
    "persistence": {},
    "workflowGate": true,
    "ponytailMode": true,
    "opencode": {
      "sessionStatus": true,
      "vcsDiff": true,
      "todos": true,
      "permissions": true,
      "worktreeIsolation": "risky-only",
      "revertCheckpoints": true,
      "context7": "suggest",
      "sdkControlPlane": true,
      "sdkTelemetry": true,
      "tuiNotifications": true
    },
    "models": {
      "mode": "preserve",
      "primary": "openai/o3",
      "defaultSubagent": "deepseek/ds-v4-flash-free-max",
      "escalation": {
        "oracle": "openai/o3",
        "council": "deepseek/ds-v4-flash-free-max"
      },
      "byAgent": {}
    },
    "closeReport": {
      "autoCollect": true,
      "maxItems": 5
    },
    "council": {
      "enabled": true,
      "eligibility": "guarded",
      "default_preset": "code-review",
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

## What You Get

Install one line and get a governed AI coding workspace: one primary runtime
coordinator, focused subagents, workflow skills, destructive-action guardrails,
token budget controls, and optional council escalation.

### Trivial fix → direct execution

```
> fix the typo in footer.ts line 12
[Lazy scope: trivial. Goes straight to build.]
```

LazyOpenCode detects well-bounded work and lets it run without ceremony.

### Medium feature → grilling + spec + plan + build + review

```
> /lazy start add user registration
[Lazy nudge: medium. Suggested next step: load lazy/specify.]
```

Each stage gates the next — no build before spec, no review before build.

### Broad/risky request → blocked until scoped

```
> 全面优化这个项目
[Lazy gate: ambiguous. Need scope, success criteria, must-not-break list.]
```

The gate stays closed until the task is sharpened. Say "just do it" to override.

## Deepwork Mode

```
> /lazy deepwork refactor auth service
```

Injects a focused, single-goal system prompt: no ponytail philosophy, no delegation rules, no job board — just one agent, one task, zero context noise. Use for deep maintenance or audit work.

## Commands

```
/lazy start <task>           Classify and gate a task
/lazy status                 Show mode, workflow stage, jobs, sessions
/lazy reset                  Clear runtime state for current scope
/lazy mode <mode>            Change governance mode
/lazy explain                Explain last gate decision
/lazy review                 Start review closure
/lazy simplify               Start simplification pass
/lazy debug <msg>            Start systematic debugging
/lazy close                  Produce close report and shutdown checklist
/lazy doctor                 Check plugin health and OpenCode integration
/lazy verify <pass|fail|pending>
/lazy risk <text>            Add remaining risk to close report
/lazy behavior <text>        Add changed behavior to close report
/lazy deepwork <task>        Start deepwork flow
```

## Agents

| Agent | Mode | Role |
|-------|------|------|
| `lazy` | primary | Runtime coordinator — classify, gate, delegate, track, close |
| `lazy-explorer` | subagent | Fast codebase recon (glob, grep, AST) |
| `lazy-oracle` | subagent | Judgment-only escalation for architecture, debugging, review, simplification |
| `lazy-councillor` | subagent | Independent judgment for council sessions |
| `lazy-librarian` | subagent | External docs, API references, web research |
| `lazy-fixer` | subagent | Bounded mechanical implementation |
| `lazy-designer` | subagent | UI/UX design, layout, responsive systems |
| `lazy-observer` | subagent | Image, screenshot, PDF, diagram analysis |

## Skills

Nine built-in workflow skills (load via `load lazy/<name>`):

| Skill | Purpose |
|-------|---------|
| `lazy/grill` | Interview to sharpen requirements |
| `lazy/specify` | Turn discussion into PRD |
| `lazy/plan` | Break PRD into tracer-bullet issues |
| `lazy/build` | Implement one issue, test-first, YAGNI-gated |
| `lazy/review` | Code review — find bugs, suggest deletions |
| `lazy/debug` | Systematic diagnosis for hard bugs |
| `lazy/simplify` | Find what to delete |
| `lazy/worktree` | Git worktrees for isolation |
| `lazy/security` | OWASP audit |

## Council

The **council** system runs multiple LLM agents independently on the same question,
then the oracle synthesizes a final recommendation. Use for high-risk decisions,
ambiguous bugs, or architecture with long-term impact.

Council is an optional escalation path. It is not part of the default happy path,
and it is guarded by workflow eligibility plus `maxCouncillors`.

See [docs/council.md](docs/council.md).

## Model Profiles

By default LazyOpenCode preserves the model you selected in OpenCode. The
primary agent and oracle use that same model unless you opt into a profile.

To reduce cost, enable `lazyopencode.models.mode = "profile"` and assign a
cheap or free OpenCode model string to `defaultSubagent`. LazyOpenCode will use
the expensive model for `lazy` and `lazy-oracle`, while bounded subagents can use
the cheaper model. Model strings must match your local OpenCode provider setup.

## Context7

LazyOpenCode does not inject context7 by default. Set
`lazyopencode.opencode.context7 = "inject"` only if you want the plugin to add a
context7 MCP entry when one is not already configured.

## Modes

- `off`: track state only
- `coach`: nudge, never block
- `governor`: block high-risk and ambiguous work, nudge medium (default)
- `strict`: block medium, high-risk, and ambiguous work

## How It Differs

Ponytail is the engineering philosophy: YAGNI, deletion first, stdlib first, fewer lines. LazyOpenCode is the runtime governor that applies that philosophy to OpenCode sessions.

Compared with lightweight agent-routing plugins, LazyOpenCode includes the team
runtime but treats routing as one part of a larger lifecycle: classify, gate,
delegate, track, budget, review, and close.

Compared with autonomous coding assistants, LazyOpenCode stays OpenCode-native
and optimizes for controlled engineering work: smaller scope, clearer gates,
bounded budgets, visible delegation, and reliable closure.

## Token Control

- sliding-window message pruning with `lazyopencode.maxMessages` (default `80`)
- image attachments are saved to files and replaced with paths for `@lazy-observer`
- available skills are filtered for the `lazy` primary agent
- background job status is summarized instead of pasting full subagent context
- `/lazy status` shows message-count budget, last prune, and job board mode

## OpenCode Integration

The npm package defaults to the OpenCode v2 registration surface and keeps the
legacy hook adapter enabled for current chat, message, permission, command, and
tool governance. Deno is only the maintainer toolchain; OpenCode still loads
`dist/index.js` from the npm package.

`0.0.4` uses the OpenCode SDK control plane for status, doctor, and close
evidence when available: session status, child sessions, todos, pending
permissions, diffs, changed files, configured providers/models, app logging, and
TUI notifications. Missing SDK capabilities degrade to warnings instead of
blocking work.

## OpenCode Desktop

LazyOpenCode Desktop is the planned `0.1.0` distribution stage: OpenCode Desktop
with `lazyopencode-core` bundled and enabled by default. The plugin remains the
source of truth; Desktop handles defaults, health, packaging, and discoverability.

## Status

`0.0.4` is an early, opinionated runtime. Internal module paths are not stable. The public surface is the OpenCode plugin, bundled lazy skills, and `/lazy` command namespace.
