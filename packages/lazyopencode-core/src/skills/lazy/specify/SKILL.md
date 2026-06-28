---
name: lazy/specify
description: Turn grilled discussion into a PRD with domain terms and acceptance criteria.
---

Synthesize what you already know into a PRD. Do NOT interview the user — just write it from the conversation.

## Process

### 1. Explore the codebase

Read CONTEXT.md if it exists. Check ADRs in the affected area. Use domain vocabulary from the project's glossary.

### 2. Identify seams

Sketch the interfaces where this feature connects to existing code. Use the vocabulary of codebase-design: **module**, **seam**, **adapter**, **leverage**. Prefer existing seams over new ones. Fewer seams = better; ideal = one.

Check with the user that these seams match their expectations.

### 3. Write the PRD

Use this template:

```
## Problem Statement

The problem from the user's perspective.

## Solution

The solution, from the user's perspective.

## User Stories

1. As an <actor>, I want <feature>, so that <benefit>

Extensive. Cover all aspects.

## Implementation Decisions

Modules to build/modify, interfaces, architectural decisions, schema changes, API contracts.

Do NOT include file paths or code snippets unless a prototype produced a decision-rich snippet.

## Domain Glossary (new terms added)

Any new terms introduced by this feature. Existing terms in CONTEXT.md should be referenced, not redefined.

## Testing Decisions

What makes a good test (external behavior only). Which seam to test at. Prior art.

## Out of Scope

## Further Notes
```

### 4. Publish

Create a tracking issue (or write to a file). Apply the `ready-for-plan` label.

If user wants an ADR, write it to `docs/adr/<NNNN>-<title>.md`.
