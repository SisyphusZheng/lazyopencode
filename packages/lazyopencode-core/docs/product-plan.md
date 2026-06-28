# LazyOpenCode 0.0.1 Governed Runtime Plan

LazyOpenCode 0.0.1 ships a minimum complete governed team runtime for OpenCode:

`/lazy start <task>` -> classify -> gate or allow -> track -> close with review or simplification.

The long-term product shape is OpenCode-native: core provides the governed team
runtime, and Desktop becomes the preinstalled distribution in `0.1.0`.

## Product Contract

- Classify task risk and ambiguity.
- Gate high-risk or ambiguous work until scope is clear.
- Track background jobs, terminal jobs, reusable sessions, and stale sessions.
- Budget message context and council escalation.
- Ask before destructive commands.
- Close implementation work with review, simplify, and verification.

## 0.0.1 Boundaries

Included:

- Governed team runtime positioning and docs.
- `/lazy` command namespace.
- Runtime config and persistence.
- Rule-based workflow classifier.
- Shared runtime for hooks.
- Token-control layer for bounded messages, image redirects, skill filtering, summarized job state, and mini job board status.
- Council eligibility guard for high-risk, ambiguous, or debug escalation.
- Permission guard for destructive OpenCode permission requests.
- Hardened job board semantics.
- Skill output contracts.
- Verification scripts and tests.
- deepwork mode for focused single-goal sessions.
- OpenCode v2 default registration with legacy hook adapter.
- `/lazy doctor`, close evidence capture, and Desktop health snapshot support.

Not included:

- UI.
- Desktop fork implementation.
- MCP marketplace.
- GitHub issue automation.
- Provider marketplace.
- Full worktree automation.
- Model-based classification.
- Deno as user runtime requirement.
- Desktop copying core governance rules.

## Release Criteria

- README and docs describe governed team runtime positioning.
- `/lazy start`, `status`, `reset`, `mode`, `explain`, `review`, `simplify`, `debug`, `close`, `doctor`, and `deepwork` work in integration tests.
- Runtime state survives save/load and marks previously running jobs as stale.
- Permission guard and zero-config merge tests pass.
- `npm run verify` passes.
