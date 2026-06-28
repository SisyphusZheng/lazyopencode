# Desktop Distribution

LazyOpenCode Desktop is a preinstalled OpenCode Desktop distribution.

This is the `0.1.0` stage, not the current core hardening stage. The intended
relationship is OpenCode-native: upstream OpenCode remains the runtime,
LazyOpenCode Desktop ships the governed defaults and health surface.

## Strategy

The plugin remains the source of truth. Desktop bundles and enables
`@lazyopencode/core`; it does not duplicate LazyOpenCode governance logic.

## First-Run Defaults

Desktop should merge the defaults from
`apps/lazyopencode-desktop/lazyopencode.default.jsonc` into the user's generated
OpenCode config:

- Add `@lazyopencode/core` to `plugin` if absent.
- Add `lazyopencode` defaults only where the user has not set values.
- Preserve provider, auth, model, MCP, session, and project settings.

## Branding

- App name: `LazyOpenCode Desktop`
- Positioning: zero-config governed team runtime for OpenCode
- Attribution: based on OpenCode; not the official OpenCode project

## Out Of Scope For 0.0.1

- Lazy visual dashboard
- Deep Desktop workflow fork
- Provider marketplace
- MCP marketplace
- Reimplementing plugin runtime behavior in Desktop
