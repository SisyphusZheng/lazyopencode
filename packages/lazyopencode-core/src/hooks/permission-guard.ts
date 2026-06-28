import type { Permission } from "@opencode-ai/sdk"
import type { LazyRuntime } from "./runtime.js"

const DESTRUCTIVE_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-f[dDxX]*\b/i,
  /\bdrop\s+(database|schema|table|view|index|role|user)\b/i,
  /\bdelete\s+from\b/i,
  /\btruncate\s+table\b/i,
  /\bdeploy\b.*\bproduction\b/i,
  /\bproduction\b.*\bdeploy\b/i,
  /\bsecret(s)?\b.*\b(leak|expose|compromise|steal|hard[- ]?coded)\b/i,
  /\btoken(s)?\b.*\b(revoke|leak|expose|compromise|steal)\b/i,
  /删除/,
  /生产/,
  /部署/,
  /密钥/,
]

export function createPermissionGuardHook(runtime?: LazyRuntime) {
  return async (
    input: Permission,
    output: { status: "ask" | "deny" | "allow" },
  ) => {
    if (runtime?.config.permissionGuard === false) return
    if (!looksDestructive(input)) return
    output.status = "ask"
    runtime?.recordEvent("gate", `Permission guard asked for ${input.type}: ${input.title}`)
    await runtime?.save()
  }
}

function looksDestructive(input: Permission): boolean {
  const haystack = [
    input.type,
    input.title,
    Array.isArray(input.pattern) ? input.pattern.join(" ") : input.pattern,
    JSON.stringify(input.metadata ?? {}),
  ]
    .filter(Boolean)
    .join("\n")

  return DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(haystack))
}
