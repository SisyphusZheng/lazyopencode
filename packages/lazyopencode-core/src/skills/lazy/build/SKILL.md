---
name: lazy/build
description: Implement one vertical slice at a time, test-first, YAGNI-gated. Supports --prototype for throwaway verification.
---

Implement a piece of work from a PRD or issue. Default to TDD. YAGNI at every step.

## Modes

### Normal mode (default)

For production code. Red-green-refactor per vertical slice.

Before starting:

- [ ] Confirm interface changes with user
- [ ] Prioritize behaviors to test
- [ ] Identify deep-module opportunities (small interface, deep implementation)

Per behavior:

1. **RED**: Write one test for one behavior → fails
2. **GREEN**: Minimal code to pass → passes
3. Verify the test describes behavior, not implementation

After all tests pass:

- [ ] Look for refactor candidates (deepen modules, extract duplication)
- [ ] Never refactor while RED

### --prototype mode

For fast verification before committing to production code. Skips tests and polish.

- Write minimal code to answer a specific question
- No tests, no error handling beyond what keeps it runnable
- One command to run
- State in memory, no persistence
- Mark clearly as PROTOTYPE — the user must know it's throwaway
- Surface full state after every action

When done, either:

- Delete the prototype (question answered "no"), or
- Fold validated decisions into real code (question answered "yes")
- Do NOT leave it rotting in the repo

### Phased mode (large tasks)

If the work spans 3+ files or 2+ agents, break into phases automatically:

1. Phase 1: core logic + test
2. Phase 2: integration + test
3. Phase 3: polish + final review

Run phase N+1 only after phase N passes review.

## Verification

- Run typecheck after each slice
- Run the full test suite at the end
- If `lazy/review` is available, run it on completion
