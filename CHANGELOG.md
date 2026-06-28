# Changelog

## 0.0.4 (2026-06-28)

- Consolidated the local governance and OpenCode SDK work into the next npm release after 0.0.3.
- Package identity: standardized on `lazyopencode-core` and kept root `deno.json` as workspace-only config.
- Runtime governance: context7 is opt-in, model profiles support expensive primary plus cheaper subagents, and `lazy-oracle` is judgment-only escalation.
- OpenCode integration: added SDK-backed control plane for status, doctor, close evidence, provider/model validation, app logging, and TUI notifications when available.
- Release hardening: CI now runs full `deno task verify`, package smoke test imports `dist/index.js`, and GitHub Actions release workflow publishes to npm with provenance.

## 0.0.3 (2026-06-28)

- Repo infrastructure: README, CI, GitHub topics, branch protection
- Moved planning docs to docs/archive/
- Deleted legacy artifacts (package-lock.json, session images, root node_modules)
- deno.json version synced to 0.0.3
- Close evidence improvements: test/verify command recording, diff summary, manual vs auto separation
- `/lazy status` now shows snapshot freshness and control-plane capability degradation
- Isolation policy: explicit advice for high-risk tasks, worktree guard

## 0.0.2 (2026-06-28)

- Fixed default export format for opencode V1 plugin compatibility
- Removed LazyOpenCodeV2Plugin from named exports to avoid getLegacyPlugins crash

## 0.0.1 (2026-06-28)

- Initial release: governed team runtime for AI coding in OpenCode
- 8 agents, 9 workflow skills, council system, permission guard
- npm plugin: lazyopencode-core
