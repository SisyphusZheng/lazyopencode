---
name: lazy/debug
description: Systematic diagnosis loop for bugs where the cause is unclear.
---

## Process

1. **Reproduce.** Can you reliably trigger it? Gather exact steps/logs. If unreproducible, document environment/conditions.
2. **Isolate.** Narrow scope: what changed (git log/bisect)? Smallest triggering input? Boundary? If bug involves a library API, check current docs via context7.
3. **Hypothesize.** Form exactly one hypothesis. State it clearly.
4. **Test hypothesis.** Smallest test/log that proves/disproves it. Do NOT fix yet.
5. **Iterate.** Disproven → new hypothesis. Proven → go to 6. Stuck after 3 cycles → escalate to @lazy-oracle.
6. **Fix.** Fix root cause, not symptoms. Confirm root cause → write failing test → minimal fix → verify test passes → full suite regression check. Then load `lazy/review`.

## Output Contract

- Repro, hypothesis, proof, root cause (1 line), minimal fix
