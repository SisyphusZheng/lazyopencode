export interface OpenCodeControlPlaneSnapshot {
  sessionStatus: string
  pendingPermissions: number
  todos: number
  diffSummary: string
  worktree: string
  capabilities: string[]
}

export interface OpenCodeControlPlane {
  snapshot(sessionID?: string): Promise<OpenCodeControlPlaneSnapshot>
  wait(sessionID: string): Promise<{ ok: boolean; reason?: string }>
  revert(checkpointID: string): Promise<{ ok: boolean; reason?: string }>
}

type UnknownClient = Record<string, unknown>

export function createOpenCodeControlPlane(client: unknown): OpenCodeControlPlane {
  const c = (client ?? {}) as UnknownClient

  return {
    async snapshot(sessionID?: string): Promise<OpenCodeControlPlaneSnapshot> {
      const capabilities = detectCapabilities(c)
      const sessionStatus = await callString(c, ["sessionStatus", "status"], sessionID, "unknown")
      const pendingPermissions = await callCount(
        c,
        ["pendingPermissions", "permissions"],
        sessionID,
      )
      const todos = await callCount(c, ["todos", "todo"], sessionID)
      const diffSummary = await callString(c, ["diffSummary", "diff"], sessionID, "not collected")
      const worktree = await callString(c, ["worktree", "projectWorktree"], sessionID, "unknown")
      return { sessionStatus, pendingPermissions, todos, diffSummary, worktree, capabilities }
    },

    async wait(sessionID: string): Promise<{ ok: boolean; reason?: string }> {
      return await callOk(c, ["wait", "sessionWait"], sessionID)
    },

    async revert(checkpointID: string): Promise<{ ok: boolean; reason?: string }> {
      return await callOk(c, ["revert", "revertCheckpoint"], checkpointID)
    },
  }
}

function detectCapabilities(client: UnknownClient): string[] {
  const names = [
    ["sessionStatus", "status"],
    ["children"],
    ["wait", "sessionWait"],
    ["context"],
    ["messages"],
    ["diffSummary", "diff"],
    ["todos", "todo"],
    ["pendingPermissions", "permissions"],
    ["worktree", "projectWorktree"],
    ["revert", "revertCheckpoint"],
  ]
  return names
    .filter((group) => group.some((name) => typeof client[name] === "function"))
    .map((group) => group[0])
}

async function callString(
  client: UnknownClient,
  names: string[],
  arg: string | undefined,
  fallback: string,
): Promise<string> {
  try {
    const value = await callFirst(client, names, arg)
    if (value === undefined || value === null) return fallback
    if (typeof value === "string") return value
    if (typeof value === "object") {
      const record = value as Record<string, unknown>
      return String(record.summary ?? record.status ?? record.path ?? fallback)
    }
    return String(value)
  } catch {
    return fallback
  }
}

async function callCount(
  client: UnknownClient,
  names: string[],
  arg: string | undefined,
): Promise<number> {
  try {
    const value = await callFirst(client, names, arg)
    if (Array.isArray(value)) return value.length
    if (typeof value === "number") return value
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>
      if (typeof record.count === "number") return record.count
      if (Array.isArray(record.items)) return record.items.length
    }
  } catch {
    return 0
  }
  return 0
}

async function callOk(
  client: UnknownClient,
  names: string[],
  arg: string,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const value = await callFirst(client, names, arg)
    if (value && typeof value === "object" && "ok" in value) {
      return value as { ok: boolean; reason?: string }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

async function callFirst(
  client: UnknownClient,
  names: string[],
  arg: string | undefined,
): Promise<unknown> {
  for (const name of names) {
    const fn = client[name]
    if (typeof fn === "function") {
      return await (fn as (arg?: string) => unknown | Promise<unknown>)(arg)
    }
  }
  return undefined
}
