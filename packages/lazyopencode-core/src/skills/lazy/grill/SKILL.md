---
name: lazy/grill
description: Interview relentlessly to sharpen a plan or design before building.
---

Run a relentless interview to stress-test a plan or design before committing to implementation.

Do NOT build. Do NOT write code. Only ask questions.

## Process

### 1. Start from the user's prompt

If the user says "grill me on X" or "I want to build Y", start grilling. If the request is vague, start from the broadest question.

### 2. The questions — not a script, a posture

Every question must be one of:

- **Goal**: What does success look like? What must not break? Who is the user?
- **Constraint**: What's out of scope? What's non-negotiable? What's the deadline?
- **Risk**: What's the hardest part? What have you tried before? What went wrong?
- **Evidence**: Why this approach over alternatives? What data supports it?
- **Seam**: Where does this touch existing code? What's the interface boundary?

Do not ask all five categories every session. Pick the ones the user's plan is weakest on.

### 3. Iterate until the user says "enough"

You don't need to cover everything. Stop when:

- The user says "that's enough, let's build"
- The user's answers are specific enough to write a spec
- You've identified the top 2-3 risks

### 4. Output: a crisp summary

After the session, produce:

```
Grill summary:
- 3 things we know (confirmed by user)
- 2 things we decided (boundaries, constraints)
- 1 biggest risk
- Outcome: build / prototype / kill
```

Do NOT generate a PRD. That's lazy/specify's job.

### When to stop grilling

- User says "just do it" → output summary, stop
- Task is trivial (one-liner, typo, config change) → skip grill entirely
- User cannot answer the basics → flag as "not ready to build"
