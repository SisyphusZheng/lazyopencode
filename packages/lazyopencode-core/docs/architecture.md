# Architecture

LazyOpenCode is an OpenCode plugin with a shared runtime.

## Plugin Entry

The npm package default export uses OpenCode v2 promise registration for agents,
commands, skills, and references. The named `LazyOpenCodePluginV1` export keeps
the legacy hook adapter for chat, message, command, permission, and tool
governance until v2 exposes equivalent hook surfaces.

## Runtime

`LazyRuntime` owns config, scope, job board, workflow trace, OpenCode snapshot,
close report state, persistence, reset, doctor output, and status formatting.

Default persistence writes to `~/.lazyopencode/state/<scopeID>.json`, never to the project repository unless explicitly configured.

## Token Control

The messages hook keeps context bounded with `lazyopencode.maxMessages` (default `80`), records message-pruning stats for `/lazy status`, strips image payloads into file references for `@lazy-observer`, filters available skills for the `lazy` primary agent, and injects summarized job-board state instead of raw subagent output.

## Hooks

Hooks receive the runtime:

- system transform injects Ponytail and lazy scope-governor behavior
- messages transform injects job board status and workflow gate nudges
- permission guard keeps destructive commands at ask
- task hooks track launches, completions, context files, reuse, and depth
- session events reconcile, clean up, and record 429 fallback state
- command hook handles `/lazy`

## Classifier

The workflow classifier is local and rule-based. It emits a `WorkflowDecision` with level, action, required stages, reason, bypass flag, and suggested command.

## Commands

`/lazy start` is the canonical product entry. Other commands are control and
closure surfaces: status, reset, mode, explain, review, simplify, debug, close,
doctor, verify, risk, behavior, and deepwork.

## Desktop Distribution

LazyOpenCode Desktop should bundle and enable this plugin by default. Desktop is
a distribution layer, not a duplicate implementation of runtime governance.
