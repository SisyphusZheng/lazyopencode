# Attribution

@lazyopencode/core is a hard fork and fusion of multiple open-source projects. We thank the original authors.

## Agent orchestration

Forked and rewritten from **[oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim)** by Alvin Unreal (MIT).

The original project provided a lightweight multi-agent routing shape. LazyOpenCode renames the public surface under the `lazy-*` namespace and rewrites the prompts around scope governance, ponytail discipline, and workflow closure.

## Workflow skills

Forked and rewritten from **[Matt Pocock skills](https://github.com/mattpocock)** (MIT):
- `grilling` → `lazy/grill`
- `to-prd` → `lazy/specify`
- `to-issues` → `lazy/plan`
- `tdd` + `implement` → `lazy/build`
- `diagnosing-bugs` → `lazy/debug`

Forked from **oh-my-opencode-slim** (MIT):
- `simplify` → `lazy/simplify`
- `worktrees` → `lazy/worktree`

Forked and rewritten from **[opencode-power-pack](https://github.com/waybarrios/opencode-power-pack)** by Way Barrios (MIT), originally ported from Anthropic's Claude Code plugins:
- `code-review` → `lazy/review`
- `security-review` → `lazy/security`

## Philosophy

The ponytail philosophy and constraint system is from **[ponytail](https://github.com/ponytail)**.

## Hook infrastructure

Hook patterns (system transform, messages transform, chat routing, task session management, error recovery) are adapted from oh-my-opencode-slim's plugin architecture, with significant simplification.

## License

MIT — same as all upstream projects.
