interface CouncilConfig {
  enabled?: boolean
  eligibility?: "guarded" | "always"
  default_preset?: string
  timeout?: number
  execution_mode?: "parallel" | "serial"
  retries?: number
  maxCouncillors?: number
  presets?: Record<string, Record<string, { model?: string; prompt?: string }>>
}

interface RequiredCouncilConfig {
  enabled: boolean
  eligibility: "guarded" | "always"
  default_preset: string
  timeout: number
  execution_mode: "parallel" | "serial"
  retries: number
  maxCouncillors: number
  presets: Record<string, Record<string, { model: string; prompt?: string }>>
}

interface CouncillorResult {
  name: string
  status: "success" | "error" | "timeout"
  result?: string
  error?: string
}

interface CouncilOutput {
  success: boolean
  error?: string
  councillorResults: CouncillorResult[]
  formatted: string
}

export function defaultCouncilConfig(overrides?: CouncilConfig): RequiredCouncilConfig {
  const presets: Record<string, Record<string, { model: string; prompt?: string }>> = {
    default: {
      councillor: { model: "", prompt: undefined },
    },
  }
  if (overrides?.presets) {
    for (const [name, councillors] of Object.entries(overrides.presets)) {
      const resolved: Record<string, { model: string; prompt?: string }> = {}
      for (const [key, val] of Object.entries(councillors)) {
        resolved[key] = { model: val.model ?? "", prompt: val.prompt }
      }
      presets[name] = resolved
    }
  }
  return {
    enabled: overrides?.enabled ?? true,
    eligibility: overrides?.eligibility ?? "guarded",
    default_preset: overrides?.default_preset ?? "default",
    timeout: overrides?.timeout ?? 180_000,
    execution_mode: overrides?.execution_mode ?? "parallel",
    retries: overrides?.retries ?? 2,
    maxCouncillors: overrides?.maxCouncillors ?? 3,
    presets,
  }
}

function parseModel(modelStr: string): { providerID: string; modelID: string } | null {
  if (!modelStr) return null
  const slash = modelStr.indexOf("/")
  if (slash === -1) return null
  return { providerID: modelStr.slice(0, slash), modelID: modelStr.slice(slash + 1) }
}

export async function runCouncil(
  prompt: string,
  // deno-lint-ignore no-explicit-any
  client: any,
  councilConfig: RequiredCouncilConfig,
  presetName?: string,
  parentSessionId?: string,
  abortSignal?: AbortSignal,
): Promise<CouncilOutput> {
  if (abortSignal?.aborted) {
    return { success: false, error: "Council aborted", councillorResults: [], formatted: "" }
  }

  if (!councilConfig.enabled) {
    return {
      success: false,
      error: "Council is disabled by config",
      councillorResults: [],
      formatted: "",
    }
  }

  const presetNameResolved = presetName ?? councilConfig.default_preset
  const preset = councilConfig.presets[presetNameResolved]
  if (!preset) {
    return {
      success: false,
      error: `Council preset "${presetNameResolved}" not found`,
      councillorResults: [],
      formatted: "",
    }
  }

  const entries = Object.entries(preset)
  if (entries.length === 0) {
    return {
      success: false,
      error: "No councillors in preset",
      councillorResults: [],
      formatted: "",
    }
  }
  if (entries.length > councilConfig.maxCouncillors) {
    return {
      success: false,
      error:
        `Council preset "${presetNameResolved}" has ${entries.length} councillors, exceeding maxCouncillors ${councilConfig.maxCouncillors}`,
      councillorResults: [],
      formatted: "",
    }
  }

  const runOne = async (
    name: string,
    modelStr: string,
    SystemPrompt: string | undefined,
  ): Promise<CouncillorResult> => {
    if (abortSignal?.aborted) {
      return { name, status: "error", error: "Aborted" }
    }

    const system = SystemPrompt ??
      "You are a member of a coding council. Provide independent analysis. Be concise. Cite evidence."
    const model = parseModel(modelStr)

    let sessionId: string | undefined
    try {
      const createRes = await client.session.create({
        body: { parentID: parentSessionId, title: `council: ${name}` },
      })
      if (createRes.error) {
        return {
          name,
          status: "error",
          error: `Session creation failed: ${JSON.stringify(createRes.error)}`,
        }
      }
      sessionId = createRes.data.id

      const promptRes = await client.session.prompt({
        body: {
          agent: "lazy-councillor",
          ...(model ? { model } : {}),
          ...(system ? { system } : {}),
          parts: [{ type: "text", text: prompt }],
          tools: { read: true, glob: true, grep: true, list: true },
        },
        path: { id: sessionId },
      })
      if (promptRes.error) {
        return { name, status: "error", error: `Prompt failed: ${JSON.stringify(promptRes.error)}` }
      }
      // deno-lint-ignore no-explicit-any
      const textParts = (promptRes.data.parts ?? []).filter((p: any) => p.type === "text")
      // deno-lint-ignore no-explicit-any
      const result = textParts.map((p: any) => p.text).join("\n")
      return { name, status: "success", result }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { name, status: "error", error: message }
    } finally {
      if (sessionId) {
        client.session.delete({ path: { id: sessionId } }).catch((err: unknown) => {
          console.error("[council] failed to cleanup session:", err)
        })
      }
    }
  }

  const startTime = Date.now()
  const timeoutMs = councilConfig.timeout

  const runAll = async (): Promise<CouncillorResult[]> => {
    if (abortSignal?.aborted) {
      return entries.map(([name]) => ({ name, status: "error" as const, error: "Aborted" }))
    }

    if (councilConfig.execution_mode === "serial") {
      const results: CouncillorResult[] = []
      for (const [name, config] of entries) {
        if (abortSignal?.aborted) {
          results.push({ name, status: "error", error: "Aborted" })
          break
        }
        if (Date.now() - startTime >= timeoutMs) {
          results.push({ name, status: "timeout", error: "Serial execution timeout" })
          break
        }
        results.push(await runOne(name, config.model, config.prompt))
      }
      return results
    }

    const promises = entries.map(([name, config]) => runOne(name, config.model, config.prompt))
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<"timeout">((resolve) => {
      timeoutHandle = setTimeout(() => resolve("timeout"), timeoutMs)
    })
    const raceResult = await Promise.race([Promise.allSettled(promises), timeoutPromise])
    if (timeoutHandle) clearTimeout(timeoutHandle)

    if (raceResult === "timeout") {
      return entries.map(([name]) => ({
        name,
        status: "timeout" as const,
        error: "Council timeout exceeded",
      }))
    }

    return (raceResult as PromiseSettledResult<CouncillorResult>[]).map((r, i) => {
      if (r.status === "fulfilled") return r.value
      const entry = entries[i]
      if (!entry) {
        return { name: "unknown", status: "error" as const, error: "Unknown error" }
      }
      return {
        name: entry[0],
        status: "error" as const,
        error: r.reason?.message ?? "Unknown error",
      }
    })
  }

  const results = await runAll()

  for (let attempt = 0; attempt < councilConfig.retries; attempt++) {
    if (abortSignal?.aborted) break
    const failed: number[] = []
    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      if (r.status !== "success" || !r.result?.trim()) {
        failed.push(i)
      }
    }
    if (failed.length === 0) break
    if (Date.now() - startTime >= timeoutMs) break

    const retryEntries = failed.map((i) => entries[i])
    const retryPromises = retryEntries.map(([name, config]) =>
      runOne(name, config.model, config.prompt)
    )
    const retryResults = await Promise.allSettled(retryPromises)
    for (let j = 0; j < failed.length; j++) {
      const rr = retryResults[j]
      if (rr.status === "fulfilled") results[failed[j]] = rr.value
    }
  }

  const formatted = formatResults(prompt, results)
  const allSuccess = results.every((r) => r.status === "success")
  return { success: allSuccess, councillorResults: results, formatted }
}

export function formatResults(prompt: string, results: CouncillorResult[]): string {
  const lines = [
    `# Council Results\n`,
    `Councillors: ${results.length}`,
    `Estimated model calls: ${results.length}\n`,
    `## Question\n${prompt}\n`,
  ]
  for (const r of results) {
    lines.push(`## ${r.name}`)
    lines.push(`Status: ${r.status}`)
    if (r.error) lines.push(`Error: ${r.error}`)
    if (r.result) lines.push(r.result)
    lines.push("")
  }
  lines.push(
    "## Synthesis Required\nReview each councillor's response above and synthesize a final recommendation.",
  )
  return lines.join("\n")
}

export type { CouncilConfig, CouncillorResult, CouncilOutput, RequiredCouncilConfig }
