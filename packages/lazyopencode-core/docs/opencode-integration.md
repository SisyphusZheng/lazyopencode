# OpenCode Integration

LazyOpenCode is an OpenCode-native workflow governor. The plugin should work
with no `lazyopencode` config block; configuration only customizes defaults.

OpenCode loads `dist/index.js` from the npm package. The default export uses the
v2 promise registration surface for agents, commands, skills, and references.
The named `LazyOpenCodePluginV1` export remains available for legacy hook
registration and existing tests. The legacy adapter stays enabled by default
because current governance still depends on chat, message, command, permission,
and tool hooks.

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
