/**
 * BackgroundJobBoard — in-memory state machine for subagent task tracking.
 *
 * ponytail: global singletons, no DI. Upgrade: per-session isolation if starvation occurs.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobState =
  | "running"
  | "completed"
  | "error"
  | "cancelled"
  | "reconciled"
  | "stale"

export interface ContextFile {
  path: string
  lineCount: number
}

export interface BackgroundJobRecord {
  taskID: string // opencode session ID (subagent)
  parentSessionID: string // lazy primary session
  agent: string // subagent type (e.g. "lazy-explorer", "lazy-fixer")
  state: JobState
  terminalUnreconciled: boolean // terminal but lazy primary hasn't seen
  timedOut: boolean
  cancellationRequested: boolean
  alias: string // human-readable short name
  callID: string // original tool call ID
  resultSummary?: string
  contextFiles: ContextFile[]
  launchedAt: number
  lastLaunchedAt: number
  lastUsedAt: number
  updatedAt: number
  completedAt: number
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const _MAX_SESSIONS_PER_AGENT = 2
const MAX_PENDING_CALLS = 100
const MAX_INJECTED_COMPLETIONS = 500
const CONTEXT_MIN_LINES = 10
const CONTEXT_MAX_FILES = 8

function findJobByTaskID(
  jobs: Map<string, BackgroundJobRecord>,
  taskID: string,
): BackgroundJobRecord | undefined {
  for (const job of jobs.values()) {
    if (job.taskID === taskID) return job
  }
  return undefined
}

function findJobByCallIDScan(
  jobs: Map<string, BackgroundJobRecord>,
  callID: string,
): BackgroundJobRecord | undefined {
  for (const job of jobs.values()) {
    if (job.callID === callID) return job
  }
  return undefined
}

function isReusableJob(job: BackgroundJobRecord): boolean {
  return job.state === "reconciled" && !job.terminalUnreconciled
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export class BackgroundJobBoard {
  private jobs = new Map<string, BackgroundJobRecord>()
  private pendingCalls: Array<{ callID: string; sessionID: string; alias?: string }> = []
  private agentCounter = new Map<string, number>()
  private processedCompletions = new Set<string>()
  private injectedCompletionsSeen = new Set<string>()
  private maxReusablePerAgent = 2
  private dirty = false

  constructor(options?: { maxReusablePerAgent?: number }) {
    if (options?.maxReusablePerAgent) {
      this.maxReusablePerAgent = options.maxReusablePerAgent
    }
  }

  configure(options: { maxReusablePerAgent?: number }): void {
    if (options.maxReusablePerAgent) {
      this.maxReusablePerAgent = options.maxReusablePerAgent
    }
  }

  // -----------------------------------------------------------------------
  // Launch
  // -----------------------------------------------------------------------

  registerLaunch(
    parentSessionID: string,
    agent: string,
    callID: string,
  ): BackgroundJobRecord {
    const taskID = Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6) // placeholder; real taskID set in parseLaunch

    const count = this.agentCounter.get(agent) ?? 0
    this.agentCounter.set(agent, count + 1)
    const alias = `${agent}-${count + 1}`

    const now = Date.now()
    const job: BackgroundJobRecord = {
      taskID,
      parentSessionID,
      agent,
      state: "running",
      terminalUnreconciled: false,
      timedOut: false,
      cancellationRequested: false,
      alias,
      callID,
      contextFiles: [],
      launchedAt: now,
      lastLaunchedAt: now,
      lastUsedAt: now,
      updatedAt: now,
      completedAt: 0,
    }

    // Store by alias (used for lookup before real taskID is known)
    this.jobs.set(alias, job)

    // Track pending call
    this.pendingCalls.push({ callID, sessionID: parentSessionID, alias })
    if (this.pendingCalls.length > MAX_PENDING_CALLS) {
      this.pendingCalls.shift()
    }

    this.dirty = true
    return job
  }

  // -----------------------------------------------------------------------
  // Match pending call to job
  // -----------------------------------------------------------------------

  findJobByCallID(callID: string): BackgroundJobRecord | undefined {
    const pending = this.pendingCalls.find((p) => p.callID === callID)
    if (!pending?.alias) return undefined
    return this.jobs.get(pending.alias) ?? findJobByCallIDScan(this.jobs, callID)
  }

  findJobByTaskID(taskID: string): BackgroundJobRecord | undefined {
    return findJobByTaskID(this.jobs, taskID)
  }

  findJobByAlias(alias: string): BackgroundJobRecord | undefined {
    for (const job of this.jobs.values()) {
      if (job.alias === alias) return job
    }
    return undefined
  }

  // -----------------------------------------------------------------------
  // Update state (called from tool.execute.after)
  // -----------------------------------------------------------------------

  updateStatus(
    callID: string,
    taskID: string,
    state: JobState,
    resultSummary?: string,
  ): void {
    const job = this.findJobByCallID(callID)
    if (!job) return

    // Late-cancel normalization: if cancelled + error → force cancelled
    if (state === "error" && job.cancellationRequested) {
      state = "cancelled"
    }

    const now = Date.now()
    const oldTaskID = job.taskID
    job.taskID = taskID || job.taskID
    if (oldTaskID !== job.taskID) this.jobs.delete(oldTaskID)
    job.state = state
    job.updatedAt = now
    if (resultSummary) job.resultSummary = resultSummary

    if (state === "completed" || state === "error" || state === "cancelled") {
      job.completedAt = now
      job.terminalUnreconciled = true
      this.trimReusable(taskID)
    }

    // Re-index by taskID and drop stale alias key
    this.jobs.set(taskID, job)
    const pending = this.pendingCalls.find((p) => p.callID === callID)
    if (pending?.alias) this.jobs.delete(pending.alias)
    this.dirty = true
  }

  // -----------------------------------------------------------------------
  // Context accumulation
  // -----------------------------------------------------------------------

  addContext(taskID: string, file: ContextFile): void {
    if (file.lineCount < CONTEXT_MIN_LINES) return

    const job = findJobByTaskID(this.jobs, taskID)
    if (!job || job.state !== "running") return

    const existing = job.contextFiles.find((f) => f.path === file.path)
    if (existing) {
      existing.lineCount = Math.max(existing.lineCount, file.lineCount)
    } else {
      job.contextFiles.push(file)
    }

    job.contextFiles = job.contextFiles
      .sort((a, b) => b.lineCount - a.lineCount)
      .slice(0, CONTEXT_MAX_FILES)
  }

  // -----------------------------------------------------------------------
  // Reconciliation
  // -----------------------------------------------------------------------

  markReconciled(taskID: string): void {
    const job = findJobByTaskID(this.jobs, taskID)
    if (job) {
      job.terminalUnreconciled = false
      if (job.state === "completed" || job.state === "reconciled") {
        job.state = "reconciled"
      }
      job.updatedAt = Date.now()
    }
    this.injectedCompletionsSeen.delete(taskID)
    this.trimReusable(taskID)
    this.dirty = true
  }

  trimReusable(taskID: string): void {
    const job = findJobByTaskID(this.jobs, taskID)
    if (!job || !isReusableJob(job)) return

    const reusable = [...this.jobs.values()]
      .filter(
        (j) =>
          j.agent === job.agent &&
          j.parentSessionID === job.parentSessionID &&
          isReusableJob(j),
      )
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)

    for (const stale of reusable.slice(this.maxReusablePerAgent)) {
      this.jobs.delete(stale.taskID)
    }
  }

  getTerminalUnreconciledJobs(parentSessionID: string): BackgroundJobRecord[] {
    const result: BackgroundJobRecord[] = []
    for (const job of this.jobs.values()) {
      if (
        job.parentSessionID === parentSessionID &&
        job.terminalUnreconciled
      ) {
        result.push(job)
      }
    }
    return result
  }

  getRunningJobs(parentSessionID: string): BackgroundJobRecord[] {
    const result: BackgroundJobRecord[] = []
    for (const job of this.jobs.values()) {
      if (job.parentSessionID === parentSessionID && job.state === "running") {
        result.push(job)
      }
    }
    return result
  }

  getStaleJobs(parentSessionID: string): BackgroundJobRecord[] {
    const result: BackgroundJobRecord[] = []
    for (const job of this.jobs.values()) {
      if (job.parentSessionID === parentSessionID && job.state === "stale") {
        result.push(job)
      }
    }
    return result
  }

  getReusableJobs(parentSessionID: string): BackgroundJobRecord[] {
    return [...this.jobs.values()].filter(
      (job) => job.parentSessionID === parentSessionID && isReusableJob(job),
    )
  }

  // -----------------------------------------------------------------------
  // Session reuse
  // -----------------------------------------------------------------------

  resolveReusable(
    parentSessionID: string,
    agent: string,
  ): BackgroundJobRecord | undefined {
    const candidates: BackgroundJobRecord[] = []
    for (const job of this.jobs.values()) {
      if (
        job.parentSessionID === parentSessionID &&
        job.agent === agent &&
        isReusableJob(job)
      ) {
        candidates.push(job)
      }
    }
    // Return oldest reconciled session
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.completedAt - b.completedAt)
      const job = candidates[0]
      const now = Date.now()
      job.lastLaunchedAt = now
      job.lastUsedAt = now
      return job
    }
    return undefined
  }

  getReusableJob(taskID: string): BackgroundJobRecord | undefined {
    const job = findJobByTaskID(this.jobs, taskID)
    if (job && isReusableJob(job)) {
      return job
    }
    return undefined
  }

  getActiveCount(parentSessionID: string, agent: string): number {
    let count = 0
    for (const job of this.jobs.values()) {
      if (
        job.parentSessionID === parentSessionID &&
        job.agent === agent &&
        job.state === "running"
      ) {
        count++
      }
    }
    return count
  }

  isLateCancelledTaskError(callID: string): boolean {
    const job = this.findJobByCallID(callID)
    return job?.cancellationRequested === true
  }

  cancelJob(id: string): void {
    const job = findJobByTaskID(this.jobs, id) ?? this.findJobByAlias(id)
    if (job) {
      job.cancellationRequested = true
      this.dirty = true
    }
  }

  // -----------------------------------------------------------------------
  // Prompt injection
  // -----------------------------------------------------------------------

  formatForPrompt(parentSessionID: string): string | null {
    const running = this.getRunningJobs(parentSessionID)
    const terminal = this.getTerminalUnreconciledJobs(parentSessionID)

    const reusable = this.getReusableJobs(parentSessionID)
    const stale = this.getStaleJobs(parentSessionID)

    if (
      running.length === 0 && terminal.length === 0 && reusable.length === 0 && stale.length === 0
    ) {
      return null
    }

    const lines: string[] = ["[Background Job Board]"]

    if (running.length > 0) {
      lines.push("  Running:")
      const now = Date.now()
      for (const j of running) {
        const ageMs = now - j.lastLaunchedAt
        const isResume = j.lastLaunchedAt !== j.launchedAt
        let ageLabel = ""
        if (j.state === "running" && ageMs < 30000) {
          ageLabel = isResume
            ? ` [resumed, ${Math.floor(ageMs / 1000)}s ago]`
            : ` [just launched, ${Math.floor(ageMs / 1000)}s ago]`
        }
        lines.push(
          `    - ${j.alias} task_id:${j.taskID} agent:${j.agent}${ageLabel}`,
        )
      }
    }

    if (terminal.length > 0) {
      lines.push("  Terminal (unreconciled):")
      for (const j of terminal) {
        const summary = j.resultSummary ? ` — ${j.resultSummary.slice(0, 120)}` : ""
        lines.push(
          `    - ${j.alias} task_id:${j.taskID} state:${j.state}${summary}`,
        )
        if (j.contextFiles.length > 0) {
          lines.push("      Context files read:")
          const shown = j.contextFiles.slice(0, 5)
          const rest = j.contextFiles.length - shown.length
          const rendered = shown.map((f) => `${f.path} (${f.lineCount} lines)`)
          lines.push(`        ${rendered.join(", ")}${rest > 0 ? ` (+${rest} more)` : ""}`)
        }
      }
      lines.push(
        "  → Call reconcileTerminalJobs() to process these results.",
      )
    }

    const injectedIDs = [...this.injectedCompletionsSeen]
    if (injectedIDs.length > 0) {
      lines.push("")
      lines.push("## Injected Background Completions")
      lines.push(
        "The following subagent results were injected into the chat by opencode (duplicated in the job board above). Use `reconcileTerminalJobs` to acknowledge them and prevent double-response.",
      )
      for (const id of injectedIDs.slice(0, 10)) {
        const job = findJobByTaskID(this.jobs, id)
        if (job) {
          lines.push(`- \`${job.alias}\` — ${job.state} — ${job.resultSummary ?? "(no summary)"}`)
        }
      }
    }

    if (reusable.length > 0) {
      lines.push("  Reusable Sessions:")
      for (const j of reusable) {
        lines.push(
          `    - ${j.alias} task_id:${j.taskID} agent:${j.agent}`,
        )
        if (j.contextFiles.length > 0) {
          lines.push("      Context files:")
          const shown = j.contextFiles.slice(0, 3)
          const rest = j.contextFiles.length - shown.length
          const rendered = shown.map((f) => `${f.path} (${f.lineCount} lines)`)
          lines.push(`        ${rendered.join(", ")}${rest > 0 ? ` (+${rest} more)` : ""}`)
        }
      }
    }

    if (stale.length > 0) {
      lines.push("  Stale Sessions:")
      for (const j of stale) {
        lines.push(
          `    - ${j.alias} task_id:${j.taskID} agent:${j.agent} (restart detected)`,
        )
      }
    }

    if (terminal.length > 0 || running.length > 0) {
      lines.push("", "## Operational Guardrails")
      lines.push(
        "- Do not poll running jobs — wait for hook-driven background completion notifications.",
      )
      lines.push("- Use cancel_task only when the user asks or a running lane becomes obsolete.")
      lines.push("- Reconcile ALL terminal jobs before your final response to the user.")
      lines.push(
        "- Reuse only completed sessions for the same specialist/context — never reuse cancelled or errored ones.",
      )
    }

    lines.push("", "## Summary")

    return lines.join("\n")
  }

  // -----------------------------------------------------------------------
  // Dirty polling (ponytail: 1-byte state-change tracker)
  // -----------------------------------------------------------------------

  isDirty(): boolean {
    return this.dirty
  }

  markClean(): void {
    this.dirty = false
  }

  // -----------------------------------------------------------------------
  // Mini status (ponytail: ~20 tokens, injected every round when clean)
  // -----------------------------------------------------------------------

  formatMini(parentSessionID: string): string | null {
    const running = this.getRunningJobs(parentSessionID)
    const terminal = this.getTerminalUnreconciledJobs(parentSessionID)
    if (running.length === 0 && terminal.length === 0) return null

    let s = `Jobs: ${running.length}r/${terminal.length}u`
    if (terminal.length > 0) s += ` | reconcileTerminalJobs()`
    return s
  }

  // -----------------------------------------------------------------------
  // Dedup injected completions
  // -----------------------------------------------------------------------

  isInjectedCompletionProcessed(id: string): boolean {
    if (this.processedCompletions.has(id)) return true
    if (this.processedCompletions.size >= MAX_INJECTED_COMPLETIONS) {
      // Evict oldest half
      const entries = [...this.processedCompletions]
      this.processedCompletions = new Set(
        entries.slice(entries.length / 2),
      )
    }
    this.processedCompletions.add(id)
    return false
  }

  markInjectedCompletionSeen(taskID: string): void {
    this.injectedCompletionsSeen.add(taskID)
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  dropSession(sessionID: string): void {
    const toDelete: string[] = []
    for (const [key, job] of this.jobs) {
      if (job.taskID === sessionID || job.parentSessionID === sessionID) {
        toDelete.push(key)
      }
    }
    if (toDelete.length > 0) {
      for (const key of toDelete) {
        this.jobs.delete(key)
      }
      this.dirty = true
    }
  }

  clear(): void {
    this.jobs.clear()
    this.pendingCalls = []
    this.agentCounter.clear()
    this.processedCompletions.clear()
    this.injectedCompletionsSeen.clear()
    this.dirty = true
  }

  snapshot(): {
    jobs: BackgroundJobRecord[]
    pendingCalls: Array<{ callID: string; sessionID: string; alias?: string }>
    agentCounter: Array<[string, number]>
    processedCompletions: string[]
    injectedCompletionsSeen: string[]
  } {
    return {
      jobs: [...this.jobs.values()],
      pendingCalls: [...this.pendingCalls],
      agentCounter: [...this.agentCounter],
      processedCompletions: [...this.processedCompletions],
      injectedCompletionsSeen: [...this.injectedCompletionsSeen],
    }
  }

  restore(snapshot: {
    jobs?: BackgroundJobRecord[]
    pendingCalls?: Array<{ callID: string; sessionID: string; alias?: string }>
    agentCounter?: Array<[string, number]>
    processedCompletions?: string[]
    injectedCompletionsSeen?: string[]
  }): void {
    this.clear()
    for (const job of snapshot.jobs ?? []) {
      const restored = { ...job }
      if (restored.state === "running") {
        restored.state = "stale"
        restored.terminalUnreconciled = true
      }
      this.jobs.set(restored.taskID, restored)
    }
    this.pendingCalls = [...(snapshot.pendingCalls ?? [])]
    this.agentCounter = new Map(snapshot.agentCounter ?? [])
    this.processedCompletions = new Set(snapshot.processedCompletions ?? [])
    this.injectedCompletionsSeen = new Set(snapshot.injectedCompletionsSeen ?? [])
    this.dirty = true
  }

  get size(): number {
    return this.jobs.size
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

// ponytail: single board for entire plugin lifetime.
// Upgrade: isolate per worktree or project if concurrent sessions collide.
export const jobBoard = new BackgroundJobBoard()
