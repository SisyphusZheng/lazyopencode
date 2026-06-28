# OpenCode Integration

LazyOpenCode is an OpenCode-native workflow governor. The plugin should work
with no `lazyopencode` config block; configuration only customizes defaults.

OpenCode loads `dist/index.js` from the npm package. The default export remains
the legacy hook adapter because current governance depends on chat, message,
command, permission, and tool hooks. The named `LazyOpenCodeV2Plugin` export
keeps the v2 promise registration surface available for agents, commands,
skills, and references while v2 hook coverage matures.

## Hook Boundaries

- `config`: registers lazy agents, skills, commands, and tools without
  overwriting user-owned config.
- `permission.ask`: asks before destructive commands when `permissionGuard` is
  enabled.
- `command.execute.before`: implements `/lazy` and `/deepwork`.
- `tool.execute.before/after`: tracks subagent launches, completions, reuse, and
  error recovery.
- chat transforms: inject workflow guidance, job-board status, token-control
  pruning, image redirects, and Ponytail behavior.

## SDK Control Plane

`0.0.4` uses the OpenCode SDK as a best-effort control plane for status, doctor,
and close reports. The adapter prefers real SDK groups such as `session`,
`config`, `file`, `find`, `app`, `tui`, and v2 session permission/fs APIs.

Collected evidence includes:

- session status, child sessions, todos, messages, diffs, wait, and revert
- pending session permissions from v2 permission APIs when available
- configured providers and models for model profile validation
- file status / changed file counts
- app logging and TUI notifications when available

Missing SDK APIs degrade to warnings. They should never block normal governance.

## Zero Config

Outside Desktop, users still install/load the plugin through OpenCode's normal
plugin mechanism. Once loaded, LazyOpenCode defaults are complete:

- `mode: "governor"`
- `permissionGuard: true`
- `maxMessages: 80`
- `workflowGate: true`
- `council.eligibility: "guarded"`
- `sdk.mode: "v2"`
- `sdk.legacyHookAdapter: true`
- `takeover: "governed"`
- `opencode.worktreeIsolation: "risky-only"`
- `opencode.sdkControlPlane: true`
- `opencode.sdkTelemetry: true`
- `opencode.tuiNotifications: true`
- `closeReport.autoCollect: true`

## Config Merge Contract

LazyOpenCode preserves user config:

- Existing non-lazy agents are untouched.
- Existing lazy agent overrides win over plugin defaults.
- Existing commands are not overwritten.
- Skills paths are deduplicated.

## Permission Guard

`permissionGuard` is intentionally independent from workflow mode. Even
`mode: "off"` keeps destructive actions at `ask` unless the user explicitly sets
`permissionGuard: false`.
