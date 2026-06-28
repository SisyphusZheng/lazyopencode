# LazyOpenCode Desktop

Preinstalled OpenCode Desktop distribution for LazyOpenCode.

This app is intentionally a distribution shell at this stage. The governance
logic lives in `lazyopencode-core`; Desktop should bundle and enable that plugin
by default rather than reimplement workflow rules.

## Product Contract

- App name: `LazyOpenCode Desktop`
- Base: OpenCode Desktop upstream
- Bundled plugin: `lazyopencode-core`
- Runtime entry: npm ESM package loaded from `dist/index.js`
- Toolchain: Deno for maintainers only, not a user runtime requirement
- First-run config includes LazyOpenCode without requiring users to edit
  `opencode.json`
- OpenCode provider, auth, project, and session behavior remains upstream-owned
- Health panel reads core snapshots: plugin loaded, v2 capabilities, jobs,
  permissions, token budget, and close report

## First-Run Config

See `lazyopencode.default.jsonc`. A Desktop build should merge that config into
the generated user config when no explicit user choice exists.

## Current Boundary

This folder does not yet vendor OpenCode Desktop source. Import or fork upstream
Desktop here before implementing app packaging. Keep LazyOpenCode-specific
changes small and documented so upstream sync stays boring.

## Attribution

LazyOpenCode Desktop is based on OpenCode. It must retain upstream attribution
and clearly state that LazyOpenCode is not the official OpenCode project.
