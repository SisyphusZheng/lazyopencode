---
name: lazy/simplify
description: Find code to delete or collapse. Ponytail: deletion over addition, one line over fifty.
---

Find what to delete, one line per finding. The goal is not "cleaner" — it's "less."

Ponytail rule: every simplification must pass the deletion test — "would removing this concentrate complexity or just move it?" Only the former counts as simplification.

## When to simplify

- After a feature works and tests pass, but feels heavier than needed
- During review when complexity is flagged
- When you encounter deep nesting, long functions, dead code, or wrappers that add no value
- After merging changes that introduced duplication

Do NOT simplify code you don't understand yet.

## Process

### Step 1: Understand before touching

- What does this code do?
- What calls it? What does it call?
- Are there tests?
- Why was it written this way?

### Step 2: Scan for deletion opportunities

- Dead code (exports no one imports, branches that never trigger)
- Wrappers that add no value (a function that just calls another function with no extra logic)
- Duplicated logic
- Boolean flag parameters (replace with two functions)
- Nested ternaries (replace with control flow)
- Wrappers or abstractions that could be inlined without losing clarity

### Step 3: Deep scan (absorbed from improve-codebase-architecture)

For modules in the affected area, check:

- **Depth**: is the interface nearly as complex as the implementation? If so, it's shallow — look for ways to move complexity behind the interface.
- **Seam**: can you alter behavior without editing in that place? If not, there's no real seam.
- **Leverage**: does one implementation serve N call sites? If N=1 and the abstraction has overhead, inline it.
- **Locality**: does understanding one concept require bouncing between many small modules? If so, consider merging.

Use the vocabulary exactly: **module**, **interface**, **depth**, **seam**, **adapter**, **leverage**, **locality**.

### Step 4: Verify

- Make one change at a time
- Run tests after each change
- The result must be easier to understand AND have fewer lines than the original
