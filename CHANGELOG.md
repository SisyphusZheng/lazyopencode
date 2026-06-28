# Changelog

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
