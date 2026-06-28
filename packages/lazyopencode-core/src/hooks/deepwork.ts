/**
 * Deepwork command — heavy multi-phase coding sessions.
 *
 * Activated by: /deepwork <task description>
 *
 * ponytail: command injects deepwork rules directly into the conversation
 * as activation text. No skill file, no two-step activation.
 */

export const DEEPWORK_ACTIVATION = (task: string) =>
  `DEEPWORK MODE ACTIVE — heavy multi-phase coding session

Task: ${task}

## 1. Pre-work Context Gathering
Before any planning or coding, review existing context thoroughly:
- Read PRDs, spec issues, GitHub issues — understand the "why" before the "how"
- Review the existing codebase: current architecture, patterns, conventions
- Load any related design mockups, Figma links, or visual references
- Know what's already built and what's net-new

## 2. Plan Loading
- Multi-file read with Read tool to bring all relevant files into context
- Summarize findings in the deepwork file before starting implementation
- Get @lazy-oracle review of the plan before Phase 1 execution begins

## 3. Designer Handoff Discipline
When @lazy-designer delivers UI/UX components:
- @lazy-designer must explain every layout, spacing, color, typography decision
- Use CSS comments to annotate design rationale (not just what, but WHY)
- NO merge-squashing of designer output — cherry-pick: one component file at a time
- Preserve design intent across later phases; @lazy-fixer only does mechanical follow-up
- If a later phase must alter design, flag it to @lazy-designer for re-review

## 4. Multiple Parallel Lanes
- Launch two @lazy-designer lanes with different aesthetic philosophies when ambiguity exists
- Each lane gets its own deepwork tracking slug: \`.lazy/deepwork/<task>-<lanename>.md\`
- Compare lanes independently; @lazy-oracle picks the winning lane before merging

## 5. Progress Tracking
- Create \`.lazy/deepwork/<slug>.md\` — track goals, plans, oracle reviews, phases, blockers
- Reference files by path, not content. Keep out of git (\`.lazy/\` is gitignored)
- Update after every phase: what was done, what was reviewed, what's next
- Mark each phase as ✓ COMPLETE or ⚠ BLOCKED

## 6. Self-Critique After Each Check-in
After every check-in (commit, phase completion, designer delivery):
- @lazy-oracle: found issues → fix actionable ones immediately before continuing
- @lazy/review: scan the diff for bugs, unnecessary complexity, deviations from plan
- Add self-critique notes to the deepwork file — what went well, what could be tighter
- Non-actionable critique becomes ponytail debt (note it, move on)

## Exit Discipline
- All phases ✓ COMPLETE before declaring the session done
- Final @lazy-oracle review passes with no blocking issues
- Deepwork file archived as session record
- Wait for hook-driven background completion before consuming results`
