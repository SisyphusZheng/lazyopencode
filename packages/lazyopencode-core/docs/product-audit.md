# Product Audit

## Verdict

LazyOpenCode should be positioned as an OpenCode-native governed team runtime.

It should not be framed as only a scope gate, only an agent pack, or only a
prompt toolbox. The product combines three things:

- A zero-config OpenCode team runtime.
- A governance layer for scope, risk, budget, permissions, and closure.
- A future Desktop distribution that makes those defaults visible and easy.

The current `0.0.x` core is close to a usable kernel: commands, agents, skills,
runtime state, job board, council guard, token control, doctor output, and close
report all exist and pass verification. The next work is mostly deepening,
simplifying, and making the boundaries sharper.

## Product Positioning

### Category

OpenCode-native governed team runtime.

### Promise

Turn OpenCode into a small, visible, budgeted, reviewable AI coding team.

### Audience

- OpenCode users who want a complete default setup.
- Users who want subagents, but do not want unmanaged agent sprawl.
- Developers who care about risk control, review, and closure.
- Future Desktop users who expect the system to work without hand-assembling
  config.

### Enemy

- Vague requests entering implementation.
- Agent work that cannot be reconciled.
- Background jobs that disappear from working memory.
- Large changes without success criteria or must-not-break constraints.
- “Done” responses without tests, review, simplification, or risk notes.
- Tooling that requires users to assemble too many pieces manually.

### North Star

Small scope, visible work, bounded context, reviewed output.

## Product Capabilities

### Current Strengths

- `lazy` primary agent plus focused subagents.
- `/lazy start` classification and workflow gate.
- `/lazy status` with mode, workflow, jobs, token control, OpenCode snapshot,
  and recent decisions.
- `/lazy close` with a structured close report.
- `/lazy doctor` for install and runtime health.
- Background job state machine with running, terminal, reusable, and stale jobs.
- Guarded council escalation for high-risk, ambiguous, or debug work.
- Message-count context budget with pruning stats.
- Permission guard for destructive operations.
- Zero-config defaults with optional `lazyopencode` config.
- Deno maintainer toolchain with npm ESM runtime output.

### Current Gaps

- `LazyRuntime` is too broad and owns too many responsibilities.
- Close evidence collection is useful but heuristic.
- OpenCode control-plane integration is best-effort and needs real-client
  hardening as OpenCode v2 surfaces mature.
- Worktree isolation is advice/policy, not full automation.
- Doctor output checks the important basics, but should become a deeper module
  with structured checks.
- Desktop is intentionally not implemented in `0.0.x`.

## Project Design

### Desired Layers

1. OpenCode adapter layer:
   - v2 registration
   - legacy hook adapter
   - control-plane snapshot
   - tool/session/permission/event bridge

2. Governance core:
   - classifier
   - gate
   - delegation discipline
   - job board
   - token budget
   - close report
   - doctor

3. Distribution layer:
   - default config
   - documentation
   - Desktop packaging and health UI in `0.1.0`

### Current Structure

The current package layout is understandable:

- `src/agents`
- `src/hooks`
- `src/council`
- `src/skills`
- `src/tools`
- `src/opencode-control-plane.ts`
- `src/v2.ts`

The main structural issue is that `src/hooks/runtime.ts` has become a central
god module. It works, but future changes will be easier if runtime becomes a
small facade over deeper modules.

## Framework And Technical Choices

### Keep

- npm ESM package as the user runtime.
- Deno as the maintainer all-in-one toolchain.
- TypeScript strict mode.
- Local rule-based classifier for `0.0.x`.
- Message-count budget instead of provider-specific token accounting.
- No new runtime dependencies unless a feature truly requires one.
- Legacy hook adapter while v2 lacks equivalent governance hook coverage.

### Revisit

- The minimum supported `@opencode-ai/plugin` version should be explicit.
- Runtime internals should be split before adding more features.
- Close report evidence should eventually use stronger sources such as diff,
  test command results, and OpenCode todos when available.
- Worktree isolation should remain advisory until OpenCode exposes a stable
  project-copy/worktree control plane.

## Code Quality Audit

### Good

- `npm run verify` passes.
- Generated package includes `dist`, docs, README, license, attribution, and
  lazy skills.
- Old JS test copies are removed; TS/Deno tests are the authority.
- Stale renamed agent files are absent from `dist`.
- Public agent names avoid known collision-prone generic names.
- Persistence stays outside the project repo by default.

### Needs Work

- `runtime.ts` is approximately 900 lines and mixes config, persistence,
  workflow state, doctor, OpenCode snapshot, close report, and formatting.
- `messages-transform.ts` mixes pruning, image handling, job-board injection,
  workflow gate, and skill filtering.
- `background-job-board.ts` is large but more cohesive; it can stay until runtime
  is split.
- Tests are integration-heavy; after module split, add narrower tests for
  doctor, close report, status formatting, and persistence.

## Product Boundary

LazyOpenCode should not require another OpenCode plugin to provide its core team
runtime. It can learn from adjacent products, but the public product should feel
complete on its own.

Compared with lightweight agent-routing plugins, LazyOpenCode includes routing
but adds governance and closure.

Compared with autonomous coding assistants, LazyOpenCode stays OpenCode-native
and prioritizes controlled engineering workflow over long independent runs.

Compared with future Desktop distributions, `lazyopencode-core` is the source
of truth. Desktop should package and visualize core behavior, not duplicate it.

## Release Readiness

`0.0.4` is releaseable once these stay true:

- `npm run verify` passes.
- README and docs use governed team runtime positioning.
- No stale renamed agents are packed.
- No JS test duplicates remain.
- `/lazy start`, `/lazy status`, `/lazy close`, and `/lazy doctor` remain covered
  by tests.
- Desktop work is documented as a later stage, not implied as complete.
