# Council — Multi-LLM Parallel Analysis

The **council** system runs multiple independent LLM agents (councillors) on the same
question in parallel, then returns results for synthesis. It is invoked by the
`lazy-oracle` agent via the `council_session` tool.

Use council for high-risk decisions, ambiguous bugs, architectural choices with
long-term impact, or any question where multiple perspectives reduce blind spots.

Council is an optional escalation path, not the default workflow. In the default
`guarded` mode it only runs for high-risk or ambiguous work, or while the workflow
stage is `debug`.

---

## How It Works

```
User question
  → lazy-oracle agent decides council_session is needed
    → CouncilManager creates N sessions (one per councillor)
      → Each councillor runs independently, read-only tools
    → Results are collected, formatted, returned
  → lazy-oracle synthesizes a final recommendation
```

- Each councillor is a separate OpenCode session with the `lazy-councillor` agent
- Councillors have read-only access (Read, Glob, Grep, list) — no write capability
- Sessions are parented to the oracle session for traceability
- Sessions are cleaned up automatically when the council completes

---

## Configuration

Council is configured under `lazyopencode.council` in `opencode.json`:

```jsonc
{
  "lazyopencode": {
    "council": {
      "enabled": true,
      "eligibility": "guarded",
      "default_preset": "code-review",
      "timeout": 180000,
      "execution_mode": "parallel",
      "retries": 2,
      "maxCouncillors": 3,
      "presets": {
        "code-review": {
          "reasoner": {
            "model": "openai/o3",
            "prompt": "寻找逻辑缺陷和边界条件。"
          },
          "critic": {
            "model": "anthropic/claude-opus-4"
          },
          "nitpicker": {
            "model": "openai/gpt-4o-mini",
            "prompt": "只找代码风格和命名问题。"
          }
        },
        "deep-arch": {
          "architect": {
            "model": "openai/o3",
            "prompt": "Evaluate architectural trade-offs. Focus on coupling, cohesion, and extensibility."
          },
          "security": {
            "model": "anthropic/claude-opus-4",
            "prompt": "Identify security vulnerabilities and data flow risks."
          }
        }
      }
    }
  }
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Disable council entirely when false |
| `eligibility` | string | `"guarded"` | `"guarded"` or `"always"` council access |
| `default_preset` | string | `"default"` | Preset to use when none specified |
| `timeout` | number | `180000` | Max total council time in ms (3 min) |
| `execution_mode` | string | `"parallel"` | `"parallel"` or `"serial"` |
| `retries` | number | `2` | Retries for empty/failed councillor responses |
| `maxCouncillors` | number | `3` | Hard cap on model calls per council run |
| `presets` | object | `{}` | Named preset definitions |

### Preset Entry

Each entry in a preset has:

| Field | Required | Description |
|-------|----------|-------------|
| `model` | yes | `"providerID/modelID"` format (e.g. `"openai/gpt-4o"`) |
| `prompt` | no | Custom system prompt for this councillor |

---

## Execution Modes

### Parallel (default)

All councillors start simultaneously. Results are collected via `Promise.race` with
a global timeout. Use for independent perspectives where councillors don't need
each other's output.

### Serial

Councillors run one after another. The council stops if one exceeds the remaining
time budget. Use when councillors should build on each other's work (future
feature) or when rate limits are a concern.

---

## Failure Handling

| Scenario | Behavior |
|----------|----------|
| Session creation fails | Councillor marked `error`, rest continue |
| Prompt times out (> `timeout`) | Councillor marked `timeout`, council stops |
| Empty/truncated response | Retries up to `retries` times, then `error` |
| All councillors fail | `success: false`, error message in formatted output |
| Preset not found | Falls back to `default_preset`, warns |

---

## Tool API

The `council_session` tool is registered on the `lazy-oracle` agent.

### Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `prompt` | string | yes | The question for council members |
| `preset` | string | no | Which preset to use (defaults to `default_preset`) |

### Return Value

Returns a formatted string containing:

```
# Council Results

## Question
<original question>

## <councillor name>
Status: success
<independent analysis>

## <councillor name>
Status: error
Error: <details>

## Synthesis Required
Review each councillor's response and synthesize a final recommendation.
```

The oracle agent receives this output and is expected to synthesize a final
recommendation.

---

## Design Decisions

1. **Separate sessions, not sub-agents**: Each councillor gets its own HTTP session.
   This isolates context and prevents one councillor's output from polluting another.

2. **Read-only councillors**: No write/edit/shell access. Councillors analyze, not
   modify. This is enforced at the agent prompt level.

3. **Lazy config injection**: The tool uses a getter function to read config at
   execution time, not at plugin init time. This ensures `opencode.json` config
   changes are picked up.

4. **Session cleanup in `finally`**: Council sessions are deleted when done,
   regardless of success or failure. A `catch` on the delete prevents cleanup
   failures from propagating.

---

## When to Use (for lazy-oracle)

The council is expensive — N councillors consume N model invocations. Use it for:

- **Ambiguous bugs** with multiple possible root causes
- **Architecture decisions** with long-term cost implications
- **Security reviews** where missing a finding has real impact
- **Code review** on critical code (auth, payments, data loss paths)

Do NOT use for:

- Trivial one-line fixes
- Well-understood refactors
- Questions answerable by a single Read/Grep
