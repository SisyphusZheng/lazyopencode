import { existsSync } from "node:fs"
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { homedir, tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { BackgroundJobBoard } from "./background-job-board.js"
import type { LazyMode, WorkflowDecision } from "./workflow-classifier.js"
import { defaultCouncilConfig } from "../council/index.js"
import type { OpenCodeControlPlane } from "../opencode-control-plane.js"
import { getSkillsDir } from "../skills/index.js"

export interface LazyConfig {
  sdk?: {
    mode?: "v2"
    legacyHookAdapter?: boolean
  }
  takeover?: "governed"
  opencode?: {
    sessionStatus?: boolean
    vcsDiff?: boolean
    todos?: boolean
    permissions?: boolean
    worktreeIsolation?: "off" | "risky-only" | "always"
    revertCheckpoints?: boolean
  }
  closeReport?: {
    autoCollect?: boolean
    maxItems?: number
  }
  mode?: LazyMode
  maxSessionsPerAgent?: number
  maxActiveTaskDepth?: number
  maxMessages?: number
  permissionGuard?: boolean
  persistence?: false | { path?: string }
  workflowGate?: boolean
  ponytailMode?: boolean
  commands?: {
    lazy?: boolean
    deepworkAlias?: boolean
  }
  council?: import("../council/index.js").CouncilConfig
}

export interface RequiredLazyConfig {
  sdk: {
    mode: "v2"
    legacyHookAdapter: boolean
  }
  takeover: "governed"
  opencode: {
    sessionStatus: boolean
    vcsDiff: boolean
    todos: boolean
    permissions: boolean
    worktreeIsolation: "off" | "risky-only" | "always"
    revertCheckpoints: boolean
  }
  closeReport: {
    autoCollect: boolean
    maxItems: number
  }
  mode: LazyMode
  maxSessionsPerAgent: number
  maxActiveTaskDepth: number
  maxMessages: number
  permissionGuard: boolean
  persistence: false | { path: string }
  workflowGate: boolean
  ponytailMode: boolean
  commands: {
    lazy: boolean
    deepworkAlias: boolean
  }
  council: import("../council/index.js").RequiredCouncilConfig
}

export interface RuntimeScope {
  projectRoot: string
  worktree: string
  scopeID: string
}

export type TraceStage =
  | "idle"
  | "grill"
  | "specify"
  | "plan"
  | "build"
  | "review"
  | "simplify"
  | "debug"
  | "close"

export interface WorkflowTrace {
  stage: TraceStage
  lastDecision?: WorkflowDecision
  recentEvents: Array<{
    ts: number
    type: "command" | "gate" | "bypass" | "stage" | "reconcile" | "reset" | "compaction"
    summary: string
  }>
}

export interface ContextStats {
  maxMessages: number
  lastBefore?: number
  lastAfter?: number
  lastPrunedAt?: number
  totalPruned: number
}

export type CloseEvidenceKind = "behavior" | "test" | "verification" | "risk" | "deletion"

export type EvidenceSource = "auto" | "manual"

export interface CloseReportState {
  behaviorChanges: string[]
  testRuns: Array<{ command: string; result: "pass" | "fail" | "unknown"; source?: EvidenceSource }>
  lastTestCommand?: string
  lastVerifyCommand?: string
  verificationResult?: "pass" | "fail" | "pending"
  remainingRisks: string[]
  deletions: string[]
  updatedAt?: number
}

export interface OpenCodeSnapshot {
  pendingPermissions: number
  todos: number
  diffSummary: string
  worktree: string
  sessionStatus: string
  capabilities: string[]
  lastUpdatedAt?: number
  errors?: string[]
}

export interface DoctorState {
  v2Registration: boolean
  legacyHookAdapter: boolean
  skills: boolean
  commands: boolean
  desktopConfig: boolean
  packageReady: boolean
  warnings: string[]
  lastCheckedAt?: number
}

export interface LazyRuntime {
  config: RequiredLazyConfig
  scope: RuntimeScope
  jobBoard: BackgroundJobBoard
  sessionAgentMap: Map<string, string>
  sessionDepth: Map<string, number>
  workflow: WorkflowTrace
  contextStats: ContextStats
  closeReport: CloseReportState
  openCodeSnapshot: OpenCodeSnapshot
  doctor: DoctorState
  recoveryMessage: string | null
  setControlPlane(controlPlane: OpenCodeControlPlane): void
  configure(input?: LazyConfig): void
  load(): Promise<void>
  save(): Promise<void>
  reset(): Promise<void>
  setMode(mode: LazyMode): Promise<void>
  setStage(stage: TraceStage): void
  recordDecision(decision: WorkflowDecision): Promise<void>
  recordPruning(before: number, after: number): Promise<void>
  refreshOpenCodeSnapshot(sessionID?: string): Promise<void>
  recordOpenCodeEvent(event: Record<string, unknown>): Promise<void>
  recordToolEvidence(input: Record<string, unknown>, output: Record<string, unknown>): Promise<void>
  recordCloseEvidence(kind: CloseEvidenceKind, payload: unknown): Promise<void>
  recordEvent(type: WorkflowTrace["recentEvents"][number]["type"], summary: string): void
  formatIsolationAdvice(decision?: WorkflowDecision): string | null
  formatStatus(sessionID?: string): string
  formatCloseReport(sessionID?: string): string
  formatInstallHealth(): string
  formatDoctorReport(): string
  getReferenceSnapshot(): Record<string, unknown>
}

interface PluginContext {
  project?: { root?: string; worktree?: string; id?: string }
  directory?: string
  worktree?: string
}

interface PersistedState {
  version: 1
  trace: WorkflowTrace
  jobBoard: ReturnType<BackgroundJobBoard["snapshot"]>
  contextStats?: ContextStats
  closeReport?: Partial<CloseReportState>
  openCodeSnapshot?: Partial<OpenCodeSnapshot>
  doctor?: Partial<DoctorState>
}

export function createLazyRuntime(ctx: PluginContext = {}): LazyRuntime {
  const scope = createScope(ctx)
  const config = resolveLazyConfig(undefined, scope)
  const jobBoard = new BackgroundJobBoard({
    maxReusablePerAgent: config.maxSessionsPerAgent,
  })
  const sessionAgentMap = new Map<string, string>()
  const sessionDepth = new Map<string, number>()
  const workflow: WorkflowTrace = createEmptyTrace()
  let contextStats: ContextStats = createEmptyContextStats(config.maxMessages)
  let closeReport: CloseReportState = createEmptyCloseReport()
  let openCodeSnapshot: OpenCodeSnapshot = createEmptyOpenCodeSnapshot(scope.worktree)
  let doctor: DoctorState = createDoctorState(config)
  let recoveryMessage: string | null = null
  let controlPlane: OpenCodeControlPlane | null = null

  const getStatePath = () => {
    if (config.persistence === false) return null
    return config.persistence.path
  }

  const load = async (): Promise<void> => {
    const path = getStatePath()
    if (!path) return
    try {
      await access(path)
    } catch {
      return
    }
    try {
      const raw = await readFile(path, "utf8")
      const parsed = JSON.parse(raw) as Partial<PersistedState>
      workflow.stage = parsed.trace?.stage ?? "idle"
      workflow.lastDecision = parsed.trace?.lastDecision
      workflow.recentEvents = parsed.trace?.recentEvents ?? []
      contextStats = normalizeContextStats(parsed.contextStats, config.maxMessages)
      closeReport = normalizeCloseReport(parsed.closeReport)
      openCodeSnapshot = normalizeOpenCodeSnapshot(parsed.openCodeSnapshot, scope.worktree)
      doctor = normalizeDoctorState(parsed.doctor, config)
      jobBoard.restore(parsed.jobBoard ?? {})
      recoveryMessage = null
    } catch {
      recoveryMessage = "State file was corrupt and ignored."
      workflow.stage = "idle"
      workflow.lastDecision = undefined
      workflow.recentEvents = []
      contextStats = createEmptyContextStats(config.maxMessages)
      closeReport = createEmptyCloseReport()
      openCodeSnapshot = createEmptyOpenCodeSnapshot(scope.worktree)
      doctor = createDoctorState(config)
      jobBoard.clear()
    }
  }

  let saveLock: Promise<void> | null = null

  const save = async (): Promise<void> => {
    const current = saveLock
    const promise = (async () => {
      if (current) await current
      const path = getStatePath()
      if (!path) return
      const state: PersistedState = {
        version: 1,
        trace: {
          stage: workflow.stage,
          lastDecision: workflow.lastDecision,
          recentEvents: workflow.recentEvents,
        },
        jobBoard: jobBoard.snapshot(),
        contextStats,
        closeReport,
        openCodeSnapshot,
        doctor,
      }
      const dir = dirname(path)
      await mkdir(dir, { recursive: true })
      await writeFile(path, `${JSON.stringify(state, null, 2)}\n`)
    })()
    saveLock = promise
    await promise
  }

  const reset = async (): Promise<void> => {
    workflow.stage = "idle"
    workflow.lastDecision = undefined
    workflow.recentEvents = []
    contextStats = createEmptyContextStats(config.maxMessages)
    closeReport = createEmptyCloseReport()
    openCodeSnapshot = createEmptyOpenCodeSnapshot(scope.worktree)
    doctor = createDoctorState(config)
    jobBoard.clear()
    recordEvent("reset", "Runtime state reset.")
    const path = getStatePath()
    if (path) {
      try {
        await access(path)
        await rm(path)
      } catch { /* ok */ }
    }
    await save()
  }

  const setMode = async (mode: LazyMode): Promise<void> => {
    config.mode = mode
    recordEvent("command", `Mode set to ${mode}.`)
    await save()
  }

  const setStage = (stage: TraceStage): void => {
    workflow.stage = stage
    recordEvent("stage", `Stage set to ${stage}.`)
  }

  const recordDecision = async (decision: WorkflowDecision): Promise<void> => {
    workflow.lastDecision = decision
    if (decision.bypassedByUser) {
      recordEvent("bypass", `${decision.level}: ${decision.reason}`)
    } else if (decision.action === "block" || decision.action === "nudge") {
      recordEvent("gate", `${decision.action} ${decision.level}: ${decision.reason}`)
    }
    await save()
  }

  const recordPruning = async (before: number, after: number): Promise<void> => {
    if (after >= before) return
    contextStats.maxMessages = config.maxMessages
    contextStats.lastBefore = before
    contextStats.lastAfter = after
    contextStats.lastPrunedAt = Date.now()
    contextStats.totalPruned += before - after
    await save()
  }

  const refreshOpenCodeSnapshot = async (sessionID?: string): Promise<void> => {
    if (!controlPlane) return
    const snapshot = await controlPlane.snapshot(sessionID)
    openCodeSnapshot = {
      pendingPermissions: snapshot.pendingPermissions,
      todos: snapshot.todos,
      diffSummary: snapshot.diffSummary,
      worktree: snapshot.worktree === "unknown" ? scope.worktree : snapshot.worktree,
      sessionStatus: snapshot.sessionStatus,
      capabilities: snapshot.capabilities,
      lastUpdatedAt: Date.now(),
    }
    if (snapshot.diffSummary !== "not collected") {
      closeReport.behaviorChanges = appendUniqueLimited(
        closeReport.behaviorChanges,
        `Diff summary: ${snapshot.diffSummary}`,
        config.closeReport.maxItems,
      )
      closeReport.updatedAt = Date.now()
    }
    recordEvent("command", "OpenCode control-plane snapshot refreshed.")
    await save()
  }

  const recordOpenCodeEvent = async (event: Record<string, unknown>): Promise<void> => {
    const type = String(event.type ?? event.kind ?? "event")
    const value = event.value
    if (type === "permission" || type === "permissions") {
      openCodeSnapshot.pendingPermissions = Number(value ?? event.count ?? 0)
    } else if (type === "todo" || type === "todos") {
      openCodeSnapshot.todos = Number(value ?? event.count ?? 0)
    } else if (type === "diff") {
      openCodeSnapshot.diffSummary = String(value ?? event.summary ?? "available")
    } else if (type === "worktree") {
      openCodeSnapshot.worktree = String(value ?? event.path ?? scope.worktree)
    } else if (type === "session") {
      openCodeSnapshot.sessionStatus = String(value ?? event.status ?? "unknown")
    } else if (type === "capability") {
      const capability = String(value ?? event.name ?? "")
      if (capability && !openCodeSnapshot.capabilities.includes(capability)) {
        openCodeSnapshot.capabilities.push(capability)
      }
    }
    openCodeSnapshot.lastUpdatedAt = Date.now()
    recordEvent("command", `OpenCode ${type} snapshot updated.`)
    await save()
  }

  const recordToolEvidence = async (
    input: Record<string, unknown>,
    output: Record<string, unknown>,
  ): Promise<void> => {
    if (!config.closeReport.autoCollect) return
    const toolName = String(input.tool ?? input.name ?? input.toolID ?? "")
    const args = (input.arguments ?? input.args ?? {}) as Record<string, unknown>
    const text = stringifyEvidence(output.output ?? output.result ?? output)
    const command = String(args.command ?? args.cmd ?? "")
    const max = config.closeReport.maxItems

    if (/bash|shell|terminal/i.test(toolName) && command) {
      if (looksLikeTestCommand(command)) {
        closeReport.testRuns = appendLimited(closeReport.testRuns, {
          command,
          result: looksLikeFailure(text) ? "fail" : "pass",
          source: "auto",
        }, max)
        closeReport.lastTestCommand = command
      }
      if (/npm run verify|deno task verify|pnpm verify|yarn verify/.test(command)) {
        closeReport.verificationResult = looksLikeFailure(text) ? "fail" : "pass"
        closeReport.lastVerifyCommand = command
      }
    }

    if (/edit|write|patch/i.test(toolName)) {
      const path = String(args.filePath ?? args.file ?? args.path ?? "")
      if (path) {
        closeReport.behaviorChanges = appendUniqueLimited(
          closeReport.behaviorChanges,
          `Touched ${path}`,
          max,
        )
      }
    }

    if (text && /delete|remove|simplif/i.test(text)) {
      closeReport.deletions = appendUniqueLimited(closeReport.deletions, firstLine(text), max)
    }
    closeReport.updatedAt = Date.now()
    await save()
  }

  const recordCloseEvidence = async (
    kind: CloseEvidenceKind,
    payload: unknown,
  ): Promise<void> => {
    const max = config.closeReport.maxItems
    const text = typeof payload === "string" ? payload.trim() : stringifyEvidence(payload).trim()
    if (!text) return
    if (kind === "behavior") {
      closeReport.behaviorChanges = appendUniqueLimited(closeReport.behaviorChanges, text, max)
    } else if (kind === "risk") {
      closeReport.remainingRisks = appendUniqueLimited(closeReport.remainingRisks, text, max)
    } else if (kind === "deletion") {
      closeReport.deletions = appendUniqueLimited(closeReport.deletions, text, max)
    } else if (kind === "verification") {
      if (text === "pass" || text === "fail" || text === "pending") {
        closeReport.verificationResult = text
      }
    } else if (kind === "test") {
      closeReport.testRuns = appendLimited(closeReport.testRuns, {
        command: text,
        result: "unknown",
        source: "manual",
      }, max)
    }
    closeReport.updatedAt = Date.now()
    await save()
  }

  const recordEvent = (
    type: WorkflowTrace["recentEvents"][number]["type"],
    summary: string,
  ): void => {
    workflow.recentEvents.push({ ts: Date.now(), type, summary })
    workflow.recentEvents = workflow.recentEvents.slice(-50)
  }

  const formatStatus = (sessionID = ""): string => {
    const lines = ["LazyOpenCode Governed Team Runtime", ""]
    lines.push(`Mode: ${config.mode}`)
    lines.push(`Stage: ${workflow.stage}`)
    lines.push(`Persistence: ${config.persistence === false ? "off" : config.persistence.path}`)
    if (recoveryMessage) lines.push(`Recovery: ${recoveryMessage}`)
    if (workflow.lastDecision) {
      const d = workflow.lastDecision
      lines.push(`Last decision: ${d.action} ${d.level} — ${d.reason}`)
    }

    lines.push("", formatInstallHealth())
    lines.push("", formatTokenControl(contextStats))
    lines.push("", formatOpenCodeSnapshot(openCodeSnapshot))

    const board = sessionID ? jobBoard.formatForPrompt(sessionID) : null
    lines.push("", board ?? "[Background Job Board]\n  No jobs for this session.")

    if (workflow.recentEvents.length > 0) {
      lines.push("", "Recent gate decisions:")
      for (const event of workflow.recentEvents.slice(-8)) {
        lines.push(`- ${event.type}: ${event.summary}`)
      }
    } else {
      lines.push("", "Recent gate decisions: none")
    }
    return lines.join("\n")
  }

  const formatIsolationAdvice = (decision = workflow.lastDecision): string | null => {
    if (!decision) return null
    if (config.opencode.worktreeIsolation === "off") return null
    const risky = decision.level === "high_risk" || decision.level === "ambiguous"
    if (config.opencode.worktreeIsolation === "risky-only" && !risky) return null
    const hasWorktree = openCodeSnapshot.capabilities.includes("worktree") ||
      openCodeSnapshot.capabilities.includes("projectWorktree")
    const hasRevert = openCodeSnapshot.capabilities.includes("revert") ||
      openCodeSnapshot.capabilities.includes("revertCheckpoint")
    return [
      "Workspace isolation",
      hasWorktree
        ? "- available: use isolated OpenCode worktree/project copy before build"
        : "- degraded: OpenCode worktree/project-copy capability not detected",
      hasRevert ? "- revert checkpoints: available" : "- revert checkpoints: not detected",
      "- policy: isolate high-risk or ambiguous work before implementation",
    ].join("\n")
  }

  const formatCloseReport = (sessionID = ""): string => {
    const running = sessionID ? jobBoard.getRunningJobs(sessionID) : []
    const terminal = sessionID ? jobBoard.getTerminalUnreconciledJobs(sessionID) : []
    const reusable = sessionID ? jobBoard.getReusableJobs(sessionID) : []
    const stale = sessionID ? jobBoard.getStaleJobs(sessionID) : []
    const decision = workflow.lastDecision

    return [
      "LAZY CLOSE REPORT",
      terminal.length > 0
        ? "Close blocked: reconcile terminal jobs first."
        : "Close ready: no terminal unreconciled jobs.",
      "",
      "Workflow",
      `- Stage: ${workflow.stage}`,
      `- Last decision: ${
        decision ? `${decision.action} ${decision.level} - ${decision.reason}` : "none"
      }`,
      "",
      "Job summary",
      `- Running jobs: ${running.length}`,
      `- Terminal unreconciled jobs: ${terminal.length}`,
      `- Reusable sessions: ${reusable.length}`,
      `- Stale sessions: ${stale.length}`,
      "",
      "Changed behavior",
      ...formatStringList(closeReport.behaviorChanges),
      "Tests run",
      ...formatTestRuns(closeReport.testRuns),
      `Verification result: ${closeReport.verificationResult ?? "pending"}`,
      ...(closeReport.lastTestCommand ? [`Last test: ${closeReport.lastTestCommand}`] : []),
      ...(closeReport.lastVerifyCommand ? [`Last verify: ${closeReport.lastVerifyCommand}`] : []),
      `Terminal jobs reconciled: ${terminal.length === 0 ? "yes" : "no"}`,
      "Remaining risks",
      ...formatStringList(closeReport.remainingRisks),
      "Simplifications/deletions",
      ...formatStringList(closeReport.deletions),
    ].join("\n")
  }

  const formatInstallHealth = (): string => {
    return [
      "Install health",
      "- agents registered: 8 lazy agents",
      "- skills path registered: yes",
      `- council: ${config.council.enabled ? config.council.eligibility : "disabled"}`,
      `- permission guard: ${config.permissionGuard ? "enabled" : "disabled"}`,
      `- token control: maxMessages ${config.maxMessages}`,
      `- sdk: ${config.sdk.mode} + legacy hooks ${
        config.sdk.legacyHookAdapter ? "enabled" : "disabled"
      }`,
    ].join("\n")
  }

  const formatDoctorReport = (): string => {
    const skillsDir = getSkillsDir()
    const distDir = dirname(fileURLToPath(import.meta.url))
    const pluginPackageJson = findUp("package.json", distDir)
    const staleAgents = ["orchestrator", "council-master"].filter((name) =>
      existsSync(join(distDir, "..", "agents", `${name}.js`)) ||
      existsSync(join(distDir, "..", "agents", `${name}.d.ts`))
    )
    doctor = {
      ...doctor,
      v2Registration: config.sdk.mode === "v2",
      legacyHookAdapter: config.sdk.legacyHookAdapter,
      skills: existsSync(skillsDir),
      commands: config.commands.lazy,
      packageReady: pluginPackageJson !== null,
      desktopConfig:
        findUp(join("apps", "lazyopencode-desktop", "lazyopencode.default.jsonc"), distDir) !==
          null,
      lastCheckedAt: Date.now(),
    }
    const warnings = [...doctor.warnings]
    if (!config.sdk.legacyHookAdapter) warnings.push("legacy hook adapter disabled")
    if (!doctor.skills) warnings.push(`skills path missing: ${skillsDir}`)
    if (!doctor.packageReady) warnings.push("plugin package.json not found")
    if (staleAgents.length > 0) warnings.push(`stale agent files: ${staleAgents.join(", ")}`)
    if (config.council.enabled && config.council.eligibility === "always") {
      warnings.push("council eligibility is always; guarded escalation is disabled")
    }
    return [
      "LAZY DOCTOR",
      `- v2 registration: ${doctor.v2Registration ? "ok" : "missing"}`,
      `- legacy hooks: ${doctor.legacyHookAdapter ? "ok" : "disabled"}`,
      `- skills: ${doctor.skills ? "ok" : "missing"}`,
      `- commands: ${doctor.commands ? "ok" : "disabled"}`,
      `- permissions: ${config.permissionGuard ? "guarded" : "unguarded"}`,
      `- package: ${doctor.packageReady ? "ready" : "unknown"}`,
      `- desktop config: ${doctor.desktopConfig ? "detected" : "not detected"}`,
      `- warnings: ${warnings.length === 0 ? "none" : warnings.join("; ")}`,
    ].join("\n")
  }

  return {
    get config() {
      return config
    },
    get scope() {
      return scope
    },
    get jobBoard() {
      return jobBoard
    },
    get sessionAgentMap() {
      return sessionAgentMap
    },
    get sessionDepth() {
      return sessionDepth
    },
    get workflow() {
      return workflow
    },
    get contextStats() {
      return contextStats
    },
    get closeReport() {
      return closeReport
    },
    get openCodeSnapshot() {
      return openCodeSnapshot
    },
    get doctor() {
      return doctor
    },
    get recoveryMessage() {
      return recoveryMessage
    },
    setControlPlane: (next: OpenCodeControlPlane) => {
      controlPlane = next
    },
    configure: (input?: LazyConfig) => {
      Object.assign(config, resolveLazyConfig(input, scope))
      contextStats.maxMessages = config.maxMessages
      doctor = createDoctorState(config)
      jobBoard.configure({
        maxReusablePerAgent: config.maxSessionsPerAgent,
      })
    },
    load,
    save,
    reset,
    setMode,
    setStage,
    recordDecision,
    recordPruning,
    refreshOpenCodeSnapshot,
    recordOpenCodeEvent,
    recordToolEvidence,
    recordCloseEvidence,
    recordEvent,
    formatIsolationAdvice,
    formatStatus,
    formatCloseReport,
    formatInstallHealth,
    formatDoctorReport,
    getReferenceSnapshot: () => ({
      scope,
      workflow,
      contextStats,
      closeReport,
      openCodeSnapshot,
      doctor,
    }),
  }
}

export function resolveLazyConfig(
  input: LazyConfig | undefined,
  scope: RuntimeScope,
): RequiredLazyConfig {
  const persistence = input?.persistence === false ? false : {
    path: input?.persistence?.path ??
      join(homedir() || tmpdir(), ".lazyopencode", "state", `${scope.scopeID}.json`),
  }

  return {
    sdk: {
      mode: "v2",
      legacyHookAdapter: input?.sdk?.legacyHookAdapter ?? true,
    },
    takeover: input?.takeover ?? "governed",
    opencode: {
      sessionStatus: input?.opencode?.sessionStatus ?? true,
      vcsDiff: input?.opencode?.vcsDiff ?? true,
      todos: input?.opencode?.todos ?? true,
      permissions: input?.opencode?.permissions ?? true,
      worktreeIsolation: input?.opencode?.worktreeIsolation ?? "risky-only",
      revertCheckpoints: input?.opencode?.revertCheckpoints ?? true,
    },
    closeReport: {
      autoCollect: input?.closeReport?.autoCollect ?? true,
      maxItems: input?.closeReport?.maxItems ?? 5,
    },
    mode: input?.mode ?? "governor",
    maxSessionsPerAgent: input?.maxSessionsPerAgent ?? 2,
    maxActiveTaskDepth: input?.maxActiveTaskDepth ?? 4,
    maxMessages: input?.maxMessages ?? 80,
    permissionGuard: input?.permissionGuard ?? true,
    persistence,
    workflowGate: input?.workflowGate ?? true,
    ponytailMode: input?.ponytailMode ?? true,
    commands: {
      lazy: input?.commands?.lazy ?? true,
      deepworkAlias: input?.commands?.deepworkAlias ?? true,
    },
    council: defaultCouncilConfig(input?.council),
  }
}

/** ponytail: simple string hash for scope isolation, not crypto. Upgrade: crypto.subtle when scopeID used for security. */
function hashScopeID(input: string): string {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(16).padStart(8, "0")
}

function createScope(ctx: PluginContext): RuntimeScope {
  const projectRoot = ctx.project?.root ?? ctx.directory ?? process.cwd()
  const worktree = ctx.worktree ?? ctx.project?.worktree ?? ctx.directory ?? projectRoot
  const scopeID = hashScopeID(`${projectRoot}::${worktree}`)
  return { projectRoot, worktree, scopeID }
}

function createEmptyTrace(): WorkflowTrace {
  return { stage: "idle", recentEvents: [] }
}

function createEmptyContextStats(maxMessages: number): ContextStats {
  return { maxMessages, totalPruned: 0 }
}

function createEmptyCloseReport(): CloseReportState {
  return {
    behaviorChanges: [],
    testRuns: [],
    remainingRisks: [],
    deletions: [],
  }
}

function createEmptyOpenCodeSnapshot(worktree: string): OpenCodeSnapshot {
  return {
    pendingPermissions: 0,
    todos: 0,
    diffSummary: "not collected",
    worktree,
    sessionStatus: "unknown",
    capabilities: [],
  }
}

function createDoctorState(config: RequiredLazyConfig): DoctorState {
  return {
    v2Registration: config.sdk.mode === "v2",
    legacyHookAdapter: config.sdk.legacyHookAdapter,
    skills: true,
    commands: config.commands.lazy,
    desktopConfig: false,
    packageReady: true,
    warnings: [],
  }
}

function normalizeContextStats(
  input: Partial<ContextStats> | undefined,
  maxMessages: number,
): ContextStats {
  return {
    maxMessages: input?.maxMessages ?? maxMessages,
    lastBefore: input?.lastBefore,
    lastAfter: input?.lastAfter,
    lastPrunedAt: input?.lastPrunedAt,
    totalPruned: input?.totalPruned ?? 0,
  }
}

function normalizeCloseReport(input: Partial<CloseReportState> | undefined): CloseReportState {
  return {
    behaviorChanges: input?.behaviorChanges ?? [],
    testRuns: input?.testRuns ?? [],
    verificationResult: input?.verificationResult,
    remainingRisks: input?.remainingRisks ?? [],
    deletions: input?.deletions ?? [],
    updatedAt: input?.updatedAt,
  }
}

function normalizeOpenCodeSnapshot(
  input: Partial<OpenCodeSnapshot> | undefined,
  worktree: string,
): OpenCodeSnapshot {
  return {
    pendingPermissions: input?.pendingPermissions ?? 0,
    todos: input?.todos ?? 0,
    diffSummary: input?.diffSummary ?? "not collected",
    worktree: input?.worktree ?? worktree,
    sessionStatus: input?.sessionStatus ?? "unknown",
    capabilities: input?.capabilities ?? [],
    lastUpdatedAt: input?.lastUpdatedAt,
  }
}

function normalizeDoctorState(
  input: Partial<DoctorState> | undefined,
  config: RequiredLazyConfig,
): DoctorState {
  return {
    ...createDoctorState(config),
    ...input,
    warnings: input?.warnings ?? [],
  }
}

function formatTokenControl(stats: ContextStats): string {
  const lastPrune = stats.lastBefore !== undefined && stats.lastAfter !== undefined
    ? `${stats.lastBefore} -> ${stats.lastAfter}`
    : "none"
  return [
    "Token control",
    `- maxMessages: ${stats.maxMessages}`,
    `- last prune: ${lastPrune}`,
    `- total pruned: ${stats.totalPruned}`,
    "- job board mode: full when dirty, mini when clean",
  ].join("\n")
}

function formatOpenCodeSnapshot(snapshot: OpenCodeSnapshot): string {
  const age = snapshot.lastUpdatedAt ? Date.now() - snapshot.lastUpdatedAt : Infinity
  const freshness = age < 120_000 ? "fresh" : age < 600_000 ? "stale" : "aged"
  const time = snapshot.lastUpdatedAt
    ? new Date(snapshot.lastUpdatedAt).toLocaleTimeString()
    : "never"
  const hasCapabilities = snapshot.capabilities.length > 0
  const degraded = hasCapabilities && snapshot.capabilities.includes("degraded")

  return [
    "OpenCode",
    `- snapshot: ${freshness} @ ${time}`,
    `- session: ${snapshot.sessionStatus}`,
    `- pending permissions: ${snapshot.pendingPermissions}`,
    `- todos: ${snapshot.todos}`,
    `- diff: ${snapshot.diffSummary}`,
    `- worktree: ${snapshot.worktree}`,
    `- capabilities: ${
      hasCapabilities ? degraded ? "⚠ degraded" : snapshot.capabilities.join(", ") : "not collected"
    }`,
  ].join("\n")
}

function findUp(filename: string, startDir: string): string | null {
  let current = startDir
  for (let i = 0; i < 8; i++) {
    const candidate = join(current, filename)
    if (existsSync(candidate)) return candidate
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

function formatStringList(items: string[]): string[] {
  if (items.length === 0) return ["- none recorded"]
  return items.map((item) => `- ${item}`)
}

function formatTestRuns(items: CloseReportState["testRuns"]): string[] {
  if (items.length === 0) return ["- none recorded"]
  return items.map((item) => `- ${item.command}: ${item.result}`)
}

function appendLimited<T>(items: T[], item: T, max: number): T[] {
  return [...items, item].slice(-Math.max(1, max))
}

function appendUniqueLimited(items: string[], item: string, max: number): string[] {
  return appendLimited(items.filter((existing) => existing !== item), item, max)
}

function stringifyEvidence(value: unknown): string {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function looksLikeTestCommand(command: string): boolean {
  return /\b(test|check|verify|lint|fmt)\b/.test(command)
}

function looksLikeFailure(text: string): boolean {
  return /\b(error|failed|failure|exception|not ok)\b/i.test(text)
}

function firstLine(text: string): string {
  return text.split(/\r?\n/).find((line) => line.trim())?.trim() ?? text.trim()
}
