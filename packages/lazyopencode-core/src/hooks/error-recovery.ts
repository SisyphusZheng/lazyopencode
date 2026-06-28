/**
 * Error recovery hook (tool.execute.after).
 * Full slim-equivalent pattern set:
 *   1. JSON parse error recovery (8+ patterns)
 *   2. Apply-patch failure with structured guidance
 *   3. Task delegate retry guidance (8 error patterns)
 *   4. Post-file-tool nudge (phase reminder for lazy primary read/write)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolAfterInput {
  tool: string
  sessionID: string
  callID: string
  args: Record<string, unknown>
}

interface ToolAfterOutput {
  title: string
  output: string
  metadata: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// JSON recovery patterns (match slim's 8 patterns)
// ---------------------------------------------------------------------------

const JSON_ERROR_PATTERNS = [
  /SyntaxError.*JSON/i,
  /Unexpected token.*JSON/i,
  /Unexpected end of JSON input/i,
  /JSON\.parse/i,
  /Expected.*JSON/i,
  /is not valid JSON/i,
  /Unexpected token ['"].*in JSON/i,
  /malformed JSON/i,
]

const JSON_RECOVERY_EXCLUDED_TOOLS = new Set([
  "bash",
  "read",
  "glob",
  "webfetch",
])

/**
 * Check if output contains a JSON-related error.
 */
function hasJsonError(output: string): boolean {
  // If the output is valid JSON, it's not a JSON parse error
  try {
    JSON.parse(output)
    return false
  } catch { /* not valid JSON, check patterns */ }
  return JSON_ERROR_PATTERNS.some((p) => p.test(output))
}

/**
 * Try to extract valid JSON from mixed output.
 * ponytail: greedy regex. Upgrade: AST-based extraction for large outputs.
 */
function tryFixJsonOutput(output: string): string | null {
  const match = output.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
  if (!match) return null
  try {
    JSON.parse(match[1])
    return match[1]
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Apply-patch failure patterns
// ---------------------------------------------------------------------------

const PATCH_FAILURE_PATTERNS = [
  "failed",
  "no match",
  "not found",
  "error applying",
  "patch failed",
  "hunk failed",
  "rejected",
]

function isPatchFailure(output: string): boolean {
  return PATCH_FAILURE_PATTERNS.some((p) => output.toLowerCase().includes(p))
}

// ---------------------------------------------------------------------------
// Task delegate retry patterns (match slim's 8 patterns)
// ---------------------------------------------------------------------------

interface RetryGuidance {
  pattern: RegExp
  guidance: string
}

const TASK_RETRY_GUIDANCE: RetryGuidance[] = [
  {
    pattern: /run_in_background/,
    guidance:
      "You used `run_in_background` with a non-`task` tool. Only the `task` tool supports background execution. Remove the parameter or switch to the `task` tool.",
  },
  {
    pattern: /load_skills/,
    guidance:
      "One or more skills could not be loaded. Check the skill name spelling, verify the skill name matches what opencode has installed, or remove the parameter.",
  },
  {
    pattern: /category or subagent_type/,
    guidance:
      "You must specify either `category` (general) or `subagent_type` (specialist). Provide exactly one — not both, not neither.",
  },
  {
    pattern: /Must provide either category or subagent_type/,
    guidance:
      "You omitted a required parameter. Add `subagent_type` with one of the available specialist types listed in the error output.",
  },
  {
    pattern: /Unknown category/,
    guidance:
      "The `category` name you used is not recognized. Rerun with the correct category name, or switch to `subagent_type` with a valid specialist type. Check the error output for the list of accepted values.",
  },
  {
    pattern: /Unknown agent/,
    guidance:
      "The `subagent_type` you specified does not exist. Use one from the list shown in the error output. Run the task again with a valid agent type.",
  },
  {
    pattern: /Skills not found/,
    guidance:
      "One or more skills referenced in `skill_names` were not found. Verify the skill names are correct and match what opencode has installed. Remove or correct the offending names and retry.",
  },
  {
    pattern: /is not allowed\. Allowed agents:/,
    guidance:
      "You tried to use a subagent that is not permitted. Use only agent types from the allowed list shown in the error output. If you need a specialist, delegate to `@lazy-oracle` for architecture/design advice.",
  },
]

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------

export function createErrorRecoveryHook(runtime?: import("./runtime.js").LazyRuntime) {
  return (input: ToolAfterInput, output: ToolAfterOutput) => {
    const { tool, sessionID } = input
    const out = output.output

    // Guard: avoid double-injection
    if (output.output.includes("[JSON PARSE ERROR")) return

    // --- 1. JSON error recovery ---
    // Skip recovery for tools where JSON errors are expected in output (bash, web responses, etc.)
    const isExcludedTool = JSON_RECOVERY_EXCLUDED_TOOLS.has(tool.toLowerCase())

    if (hasJsonError(out) && !isExcludedTool) {
      const fixed = tryFixJsonOutput(out)
      if (fixed) {
        output.output = `${out}\n\n[JSON PARSE ERROR — IMMEDIATE ACTION REQUIRED]
The system could not parse your JSON. However, valid JSON was extracted from the output.
STOP and do this NOW:
1. LOOK at the recovered JSON below
2. CORRECT your JSON (missing braces, unescaped quotes, trailing commas, etc.)
3. RETRY the tool call with valid JSON

Recovered JSON:
\`\`\`json\n${fixed}\n\`\`\`

DO NOT repeat the exact same invalid call.`
        output.metadata = {
          ...output.metadata,
          _recovered: true,
          _recoveryType: "json",
        }
      } else {
        // No valid JSON to recover — inject the error reminder
        output.output = `${out}\n\n[JSON PARSE ERROR — IMMEDIATE ACTION REQUIRED]
You sent invalid JSON arguments. The system could not parse your tool call.
STOP and do this NOW:
1. LOOK at the error message above to see what was expected vs what you sent.
2. CORRECT your JSON syntax (missing braces, unescaped quotes, trailing commas, etc).
3. RETRY the tool call with valid JSON.
DO NOT repeat the exact same invalid call.`
        output.metadata = {
          ...output.metadata,
          _recovered: false,
          _recoveryType: "json",
        }
      }
    }

    // --- 2. Task tool error — retry guidance ---
    if (tool === "task" && isErrorOutput(out)) {
      const guidance = matchRetryGuidance(out)
      if (guidance) {
        output.output = `${output.output}\n\n[HINT: ${guidance}]`
        output.metadata = {
          ...output.metadata,
          _retryGuidance: true,
        }
      }
    }

    // --- 3. Bash tool JSON error — explicit retry instruction ---
    if (
      tool === "bash" &&
      (hasJsonError(output.output) || output.output.includes("SyntaxError"))
    ) {
      // Even if JSON was extracted, the model needs the instruction to use it
      const jsonMatch = output.output.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
      if (jsonMatch) {
        output.output =
          `${output.output}\n\n[IMMEDIATE ACTION: The output above contains JSON. Parse and use:\n\`\`\`json\n${
            jsonMatch[1]
          }\n\`\`\`\nIgnore the error message — the JSON is intact.]`
        output.metadata = {
          ...output.metadata,
          _immediateAction: true,
        }
      }
    }

    // --- 4. Apply-patch failure — detailed guidance ---
    if (tool === "apply_patch" && isPatchFailure(out)) {
      output.output = `${output.output}\n\n[PATCH FAILURE — try these in order:
1. Read the target file with Read tool to see current state
2. Rewrite the patch with exact whitespace (tabs/spaces) matching the file
3. If line numbers shifted, use broader surrounding context lines
4. As last resort: use Write tool to edit the file directly]`
      output.metadata = {
        ...output.metadata,
        _patchGuidance: true,
      }
    }

    // --- 5. Post-file-tool phase reminder (lazy primary only) ---
    if (
      (tool === "Read" || tool === "Write" || tool === "edit") &&
      isLazyPrimarySession(sessionID, runtime)
    ) {
      output.output =
        `${output.output}\n\n[Scheduler: plan lanes → dispatch → wait for hook-driven completion → reconcile → verify.]`
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isErrorOutput(output: string): boolean {
  return /error|fail|exception|crash|abort/i.test(output.slice(0, 500))
}

function matchRetryGuidance(output: string): string | null {
  for (const { pattern, guidance } of TASK_RETRY_GUIDANCE) {
    if (pattern.test(output)) return guidance
  }
  return null
}

function isLazyPrimarySession(
  sessionID: string | undefined,
  runtime?: import("./runtime.js").LazyRuntime,
): boolean {
  if (!sessionID || !runtime) return false
  return runtime.sessionAgentMap.get(sessionID) === "lazy"
}
