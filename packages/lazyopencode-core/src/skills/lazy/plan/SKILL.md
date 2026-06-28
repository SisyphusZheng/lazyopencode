---
name: lazy/plan
description: Break a PRD or spec into independently-grabbable tracer-bullet issues.
---

Break a spec or PRD into vertical-slice issues. Each issue is a thin, end-to-end path through ALL layers — NOT horizontal (all schema, then all API, then all UI).

## Process

### 1. Gather context

Read the PRD or spec from context. If the user passes an issue reference, fetch it.

### 2. Explore the codebase (if needed)

Read CONTEXT.md. Check ADRs. Look for prefactoring opportunities — "make the change easy, then make the easy change."

### 3. Draft vertical slices

Each slice must be:

- **Demoable alone**: after this slice, something visible or verifiable works
- **End-to-end**: cuts through schema → API → UI → tests
- **Dependency-orderable**: blocker-first

### 4. Present to user

For each slice, show: title, blocked-by, user stories covered. Ask:

- Granularity feel right?
- Dependencies correct?
- Merge or split any?

### 5. Publish

Create issues on the tracker in dependency order (blockers first). Use body template:

```
## What to build

End-to-end behavior, not layer-by-layer.

## Acceptance criteria

- [ ] Criterion 1

## Blocked by

- Issue reference or "None"
```

Do NOT close or modify the parent spec issue.
