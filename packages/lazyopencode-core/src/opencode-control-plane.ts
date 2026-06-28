export interface ModelProfileValidation {
  currentModel: string
  availableModels: string[]
  invalidModels: string[]
  warnings: string[]
}

export interface OpenCodeControlPlaneSnapshot {
  sessionStatus: string
  childSessions: number
  pendingPermissions: number
  todos: number
  diffSummary: string
  changedFiles: number
  worktree: string
  currentModel: string
  availableModels: string[]
  capabilities: string[]
  warnings: string[]
}

export interface OpenCodeControlPlane {
  snapshot(sessionID?: string): Promise<OpenCodeControlPlaneSnapshot>
  validateModels(models: string[]): Promise<ModelProfileValidation>
  wait(sessionID: string): Promise<{ ok: boolean; reason?: string }>
  revert(sessionID: string, messageID?: string): Promise<{ ok: boolean; reason?: string }>
  log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    metadata?: unknown,
  ): Promise<void>
  notify(kind: "info" | "warn" | "error", message: string): Promise<void>
}

type UnknownRecord = Record<string, unknown>
type RequestResult = { data?: unknown; error?: unknown }

export function createOpenCodeControlPlane(
  client: unknown,
  directory?: string,
): OpenCodeControlPlane {
  const c = (client ?? {}) as UnknownRecord

  return {
    async snapshot(sessionID?: string): Promise<OpenCodeControlPlaneSnapshot> {
      const warnings: string[] = []
      const capabilities = detectCapabilities(c)
      const session = asRecord(c.session)
      const v2Session = asRecord(asRecord(c.v2)?.session)
      const v2Permission = asRecord(v2Session?.permission)

      const status = await callSdk(session, "status", [{ directory }], warnings)
      const sessionInfo = sessionID
        ? await callSdk(session, "get", [{ sessionID, directory }], warnings)
        : undefined
      const children = sessionID
        ? await callSdk(session, "children", [{ sessionID, directory }], warnings)
        : undefined
      const todos = sessionID
        ? await callSdk(session, "todo", [{ sessionID, directory }], warnings)
        : undefined
      const diff = sessionID
        ? await callSdk(session, "diff", [{ sessionID, directory }], warnings)
        : undefined
      const permissions = sessionID
        ? await callSdk(v2Permission, "list", [{ sessionID }], warnings)
        : undefined
      const providers = await getProviderModels(c, directory, warnings)
      const fileStatus = await getFileStatus(c, directory, warnings)

      return {
        sessionStatus: extractSessionStatus(status, sessionInfo),
        childSessions: countItems(children),
        pendingPermissions: countItems(permissions),
        todos: countItems(todos),
        diffSummary: summarizeDiff(diff),
        changedFiles: fileStatus.changedFiles,
        worktree: extractWorktree(sessionInfo) ?? directory ?? "unknown",
        currentModel: providers.currentModel,
        availableModels: providers.availableModels,
        capabilities,
        warnings: unique(warnings),
      }
    },

    async validateModels(models: string[]): Promise<ModelProfileValidation> {
      const warnings: string[] = []
      const providers = await getProviderModels(c, directory, warnings)
      const available = new Set(providers.availableModels)
      const invalidModels = models
        .filter(Boolean)
        .filter((model) => !isProviderModel(model) || (available.size > 0 && !available.has(model)))
      return {
        currentModel: providers.currentModel,
        availableModels: providers.availableModels,
        invalidModels,
        warnings: unique(warnings),
      }
    },

    async wait(sessionID: string): Promise<{ ok: boolean; reason?: string }> {
      const warnings: string[] = []
      const session = asRecord(c.session)
      const v2Session = asRecord(asRecord(c.v2)?.session)
      const value = await callSdk(v2Session, "wait", [{ sessionID }], warnings) ??
        await callSdk(session, "wait", [{ sessionID, directory }], warnings)
      if (value !== undefined) return { ok: true }
      return { ok: false, reason: warnings.join("; ") || "session.wait unavailable" }
    },

    async revert(sessionID: string, messageID?: string): Promise<{ ok: boolean; reason?: string }> {
      const warnings: string[] = []
      const session = asRecord(c.session)
      const value = await callSdk(
        session,
        "revert",
        [{ sessionID, messageID, directory }],
        warnings,
      )
      if (value !== undefined) return { ok: true }
      return { ok: false, reason: warnings.join("; ") || "session.revert unavailable" }
    },

    async log(level, message, metadata): Promise<void> {
      const app = asRecord(c.app)
      const global = asRecord(c.global)
      await callSdk(app, "log", [{ level, message, metadata }], []) ??
        await callSdk(global, "log", [{ level, message, metadata }], [])
    },

    async notify(kind, message): Promise<void> {
      const tui = asRecord(c.tui)
      await callSdk(tui, "showToast", [{ type: kind, message }], []) ??
        await callSdk(
          tui,
          "publish",
          [{ body: { type: "toast.show", variant: kind, message } }],
          [],
        )
    },
  }
}

function detectCapabilities(client: UnknownRecord): string[] {
  const session = asRecord(client.session)
  const v2 = asRecord(client.v2)
  const v2Session = asRecord(v2?.session)
  const v2Permission = asRecord(v2Session?.permission)
  const fs = asRecord(v2?.fs)
  const groups: Array<[string, unknown]> = [
    ["session.status", session?.status],
    ["session.get", session?.get],
    ["session.children", session?.children],
    ["session.todo", session?.todo],
    ["session.diff", session?.diff],
    ["session.messages", session?.messages],
    ["session.wait", session?.wait ?? v2Session?.wait],
    ["session.revert", session?.revert],
    ["v2.session.context", v2Session?.context],
    ["v2.session.permission", v2Permission?.list],
    ["config.get", asRecord(client.config)?.get],
    ["config.providers", asRecord(client.config)?.providers],
    ["provider.list", asRecord(client.provider)?.list],
    ["file.status", asRecord(client.file)?.status],
    ["find.files", asRecord(client.find)?.files ?? fs?.find],
    ["app.log", asRecord(client.app)?.log ?? asRecord(client.global)?.log],
    ["tui.showToast", asRecord(client.tui)?.showToast],
  ]
  return groups.filter(([, fn]) => typeof fn === "function").map(([name]) => name)
}

async function getProviderModels(
  client: UnknownRecord,
  directory: string | undefined,
  warnings: string[],
): Promise<{ currentModel: string; availableModels: string[] }> {
  const config = asRecord(client.config)
  const provider = asRecord(client.provider)
  const configData = await callSdk(config, "get", [{ directory }], warnings)
  const providerData = await callSdk(config, "providers", [{ directory }], warnings) ??
    await callSdk(provider, "list", [{ directory }], warnings)

  return {
    currentModel: extractCurrentModel(configData),
    availableModels: extractAvailableModels(providerData),
  }
}

async function getFileStatus(
  client: UnknownRecord,
  directory: string | undefined,
  warnings: string[],
): Promise<{ changedFiles: number }> {
  const value = await callSdk(asRecord(client.file), "status", [{ directory }], warnings) ??
    await callSdk(asRecord(client.vcs), "status", [{ directory }], warnings)
  return { changedFiles: countItems(value) }
}

async function callSdk(
  target: UnknownRecord | undefined,
  name: string,
  args: unknown[],
  warnings: string[],
): Promise<unknown> {
  const fn = target?.[name]
  if (typeof fn !== "function") return undefined
  try {
    const result = await (fn as (...args: unknown[]) => unknown | Promise<unknown>)(...args)
    const unwrapped = unwrapResult(result)
    if (isErrorResult(result)) {
      warnings.push(`${name}: ${stringify((result as RequestResult).error)}`)
    }
    return unwrapped
  } catch (error) {
    warnings.push(`${name}: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

function unwrapResult(value: unknown): unknown {
  if (value && typeof value === "object" && ("data" in value || "error" in value)) {
    return (value as RequestResult).data
  }
  return value
}

function isErrorResult(value: unknown): boolean {
  return Boolean(
    value && typeof value === "object" && "error" in value && (value as RequestResult).error,
  )
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" ? value as UnknownRecord : undefined
}

function countItems(value: unknown): number {
  const data = unwrapResult(value)
  if (Array.isArray(data)) return data.length
  if (typeof data === "number") return data
  const record = asRecord(data)
  if (!record) return 0
  for (const key of ["count", "total"]) {
    if (typeof record[key] === "number") return record[key] as number
  }
  for (const key of ["items", "data", "children", "todos", "permissions", "requests", "files"]) {
    if (Array.isArray(record[key])) return (record[key] as unknown[]).length
  }
  return Object.keys(record).length
}

function extractSessionStatus(status: unknown, sessionInfo: unknown): string {
  const session = asRecord(sessionInfo)
  const statusRecord = asRecord(status)
  return String(
    session?.status ??
      session?.state ??
      statusRecord?.status ??
      statusRecord?.state ??
      (statusRecord && Object.keys(statusRecord).length > 0 ? "available" : "unknown"),
  )
}

function summarizeDiff(value: unknown): string {
  const data = unwrapResult(value)
  if (!data) return "not collected"
  if (typeof data === "string") return data || "empty"
  const record = asRecord(data)
  if (!record) return String(data)
  const summary = record.summary ?? record.text ?? record.diff
  if (typeof summary === "string" && summary.trim()) return summary
  const changed = countItems(record)
  return changed > 0 ? `${changed} changed file(s)` : "empty"
}

function extractWorktree(value: unknown): string | undefined {
  const record = asRecord(value)
  return String(record?.worktree ?? record?.directory ?? record?.path ?? record?.location ?? "") ||
    undefined
}

function extractCurrentModel(value: unknown): string {
  const data = asRecord(unwrapResult(value))
  const raw = data?.model ?? data?.default_model ?? data?.small_model
  if (typeof raw === "string") return raw
  const model = asRecord(raw)
  if (model) return joinModel(model.providerID, model.modelID ?? model.id)
  return "OpenCode selected model"
}

function extractAvailableModels(value: unknown): string[] {
  const data = unwrapResult(value)
  const providers = Array.isArray(data)
    ? data
    : asRecord(data)?.providers ?? asRecord(data)?.items ?? asRecord(data)?.data
  if (!Array.isArray(providers)) return []
  const models: string[] = []
  for (const provider of providers) {
    const p = asRecord(provider)
    const providerID = String(p?.id ?? p?.providerID ?? p?.name ?? "")
    const modelList = p?.models
    if (Array.isArray(modelList)) {
      for (const model of modelList) {
        const m = asRecord(model)
        const modelID = String(m?.id ?? m?.modelID ?? m?.name ?? "")
        const joined = joinModel(providerID, modelID)
        if (joined) models.push(joined)
      }
    } else if (modelList && typeof modelList === "object") {
      for (const modelID of Object.keys(modelList)) {
        const joined = joinModel(providerID, modelID)
        if (joined) models.push(joined)
      }
    }
  }
  return unique(models)
}

function joinModel(providerID: unknown, modelID: unknown): string {
  const provider = String(providerID ?? "")
  const model = String(modelID ?? "")
  return provider && model ? `${provider}/${model}` : ""
}

function isProviderModel(value: string): boolean {
  return /^[^/\s]+\/[^/\s]+$/.test(value)
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items.filter(Boolean)))
}
