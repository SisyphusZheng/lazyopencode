# Work Plan

## Product Direction

LazyOpenCode should ship as an OpenCode-native governed team runtime.

The core package must be complete without requiring another OpenCode plugin:
primary agent, subagents, workflow gates, job tracking, budget visibility,
permission guard, close report, doctor, and workflow skills are all part of the
same product.

Desktop is a later distribution stage. It should package and visualize the core,
not recreate core rules.

## Phase 0: 0.0.1 Release Lock

Goal: ship the current core as a clean, zero-config OpenCode plugin.

Tasks:

1. Keep public positioning consistent:
   - README uses governed team runtime.
   - Docs avoid borrowed product metaphors.
   - Desktop is clearly marked as later work.

2. Lock package health:
   - `npm run verify` passes.
   - `npm pack --dry-run` includes docs, README, license, attribution, `dist`,
     and `dist/skills/lazy`.
   - No stale renamed agent files in `dist`.
   - No JS test duplicates.

3. Stabilize public surface:
   - Keep agent names stable.
   - Keep `/lazy` command namespace stable.
   - Keep `LazyOpenCodePluginV1` named export for legacy hook loading.
   - Keep default export on v2 registration surface.

Acceptance criteria:

- Fresh checkout can run `npm run verify` inside `packages/lazyopencode-core`.
- README first screen clearly explains team runtime + governance.
- `/lazy start`, `/lazy status`, `/lazy close`, and `/lazy doctor` are tested.

## Phase 1: 0.0.2 Runtime Deepening

Goal: split the working runtime into deeper modules without changing user
behavior.

Tasks:

1. Split `src/hooks/runtime.ts`:
   - `runtime/config.ts`
   - `runtime/persistence.ts`
   - `runtime/workflow-trace.ts`
   - `runtime/close-report.ts`
   - `runtime/doctor.ts`
   - `runtime/opencode-snapshot.ts`
   - `runtime/status-format.ts`
   - `runtime/index.ts`

2. Split `messages-transform.ts`:
   - pruning
   - image redirect
   - job-board prompt injection
   - workflow gate injection
   - skill filtering

3. Add narrow tests:
   - close report evidence dedupe
   - doctor checks
   - persistence roundtrip
   - status formatting
   - image path and cleanup path

4. Make OpenCode plugin version baseline explicit:
   - set package dependency to the tested baseline
   - document minimum supported version
   - keep v1 legacy adapter until equivalent v2 hooks exist

Acceptance criteria:

- No public behavior changes.
- `runtime/index.ts` exposes a small facade.
- Module-level tests cover the new internals.
- `npm run verify` remains green.

## Phase 2: 0.0.3 Close Evidence And Worktree Policy

Goal: make close and risk isolation more useful without pretending to know
things that were not observed.

Tasks:

1. Improve close evidence:
   - record latest test commands
   - record latest verify command
   - summarize diff when OpenCode exposes it
   - show manual overrides separately from auto-collected evidence
   - mark missing evidence as `none recorded`

2. Improve status:
   - separate OpenCode snapshot freshness from persisted state
   - show last snapshot time
   - show control-plane capability degradation clearly

3. Improve isolation policy:
   - high-risk/ambiguous tasks produce explicit isolation advice
   - if stable worktree/project-copy APIs exist, use them behind a guard
   - otherwise stay advisory

Acceptance criteria:

- `/lazy close` remains truthful and does not invent changed files or tests.
- `/lazy status` makes stale snapshot state visible.
- Worktree automation is never attempted unless capability is detected.

## Phase 3: 0.1.0 Desktop Distribution

Goal: create the Desktop distribution layer around the core plugin.

Tasks:

1. Import or fork upstream OpenCode Desktop.
2. Add first-run config merge:
   - add `@lazyopencode/core` if absent
   - add `lazyopencode` defaults only when not user-set
   - preserve provider, auth, model, MCP, project, and session settings
3. Add Lazy Health panel:
   - plugin loaded
   - v2 capabilities
   - jobs
   - pending permissions
   - token budget
   - close report
   - doctor warnings
4. Add attribution:
   - clearly based on OpenCode
   - clearly not official OpenCode
5. Add Desktop verification:
   - config merge tests
   - health snapshot tests
   - package/build smoke test

Acceptance criteria:

- Desktop starts with LazyOpenCode enabled by default.
- Existing user OpenCode config is preserved.
- Health panel reads core snapshots instead of duplicating governance logic.
- Core remains usable as a standalone npm plugin.

## Phase 4: Presets And Profiles

Goal: make the governed runtime adaptable without turning it into a config maze.

Tasks:

1. Team profiles:
   - solo
   - balanced
   - review-heavy
   - low-cost
   - high-risk

2. Model profiles:
   - primary model
   - fast explorer
   - reviewer
   - designer
   - council preset

3. Project profiles:
   - library
   - app
   - infra
   - security-sensitive

Acceptance criteria:

- Profiles are optional.
- Defaults stay zero-config.
- Profiles compose with user OpenCode config without overwriting provider/auth.

## Current Priority

Do not start Desktop until `0.0.1` is locked and `0.0.2` runtime deepening is
planned clearly.

The next best engineering task is Phase 1: split `LazyRuntime` into deeper
modules while preserving behavior and tests.
