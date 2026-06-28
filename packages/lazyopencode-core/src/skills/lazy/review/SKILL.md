---
name: lazy/review
description: Code review focused on bugs, missing cases, and deletion opportunities — not additions.
---

Review code for correctness and simplicity. Default stance: **what can we delete?**

## Process

1. Read the diff. Understand the problem it solves.
2. Find bugs: logic errors, off-by-one, null/undefined risks, edge cases, broken tests.
3. Find deletions: unused code, dead branches, one-use abstractions, stdlib-replaceable code, "for later" scaffolding.
4. Check `ponytail:` comments — do they name the ceiling and upgrade path? Mark unmarked debt.
5. Produce review output.

## Output Contract

| Priority | Label         | What                                            |
| -------- | ------------- | ----------------------------------------------- |
| 1        | 🔴 Must fix   | real bugs, security issues                      |
| 2        | 🟡 Should fix | code quality, simplifications                   |
| 3        | 🟢 Can delete | removable dead code                             |
| 4        | ponytail:     | unmarked shortcuts needing `ponytail:` comments |

## Rules

- Default to "delete" over "add validation/abstraction/logging."
- Unsure if a bug is real → mark 🟡 not 🔴.
- One finding per bullet. No essays.
