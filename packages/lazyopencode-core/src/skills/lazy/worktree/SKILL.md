---
name: lazy/worktree
description: Manage Git worktrees as isolated coding lanes for parallel or risky work.
---

Create, manage, and clean up Git worktrees for isolated coding lanes.

All worktrees live under `.worktrees/<slug>/`.

## Safety rules

Before any Git mutation:

- [ ] Confirm current dir is inside a Git repo
- [ ] Check current branch, base branch, dirty state
- [ ] Run `git worktree list` to avoid conflicts
- [ ] Ensure branch name doesn't already exist locally or remote
- [ ] Ensure `.worktrees/` is gitignored

**Always ask user confirmation before:**

- `git worktree add` or `remove`
- Branch creation/deletion
- Merges, rebases, cherry-picks
- `git reset --hard`, `git clean`, `git push --force`

## Workflow

### Setup

```bash
git worktree add -b <branch> .worktrees/<slug> <base>
```

### Execute

Run sub-agents with `workdir` set to `.worktrees/<slug>`. Do not modify the main checkout for lane work.

### Integrate

1. Run lint + build + tests inside the worktree
2. Show diff against base branch
3. Ask user confirmation to merge/cherry-pick

### Cleanup

```bash
git worktree remove .worktrees/<slug>
```

### State tracking

If `.worktrees/worktrees.json` exists, update it with lane metadata (slug, branch, path, base, purpose, status).

## When to use

- Risky refactoring that could break the active environment
- Parallel tasks requiring context switching
- Prototyping that may be discarded
- Complex upgrades

## When NOT to use

- Single-file changes or minor bug fixes
- Documentation updates
- User didn't ask for it
