import { assertEquals } from "jsr:@std/assert@1"
import { join } from "jsr:@std/path@1"
import { createLazyRuntime, resolveLazyConfig } from "../src/hooks/runtime.ts"

function existsSync(path: string): boolean {
  try {
    Deno.statSync(path)
    return true
  } catch {
    return false
  }
}

Deno.test("runtime-state", async () => {
  const scope = { projectRoot: "/tmp/p", worktree: "/tmp/w", scopeID: "scope-test" }
  const defaults = resolveLazyConfig(undefined, scope)
  assertEquals(defaults.mode, "governor")
  assertEquals(defaults.maxSessionsPerAgent, 2)
  assertEquals(defaults.maxMessages, 80)
  assertEquals(defaults.permissionGuard, true)
  assertEquals(defaults.council.enabled, true)
  assertEquals(defaults.council.eligibility, "guarded")
  assertEquals(defaults.council.maxCouncillors, 3)
  assertEquals(defaults.sdk.mode, "v2")
  assertEquals(defaults.sdk.legacyHookAdapter, true)
  assertEquals(defaults.takeover, "governed")
  assertEquals(defaults.opencode.worktreeIsolation, "risky-only")
  assertEquals(defaults.closeReport.autoCollect, true)

  const custom = resolveLazyConfig(
    {
      mode: "strict",
      maxSessionsPerAgent: 3,
      maxMessages: 12,
      permissionGuard: false,
      persistence: false,
    },
    scope,
  )
  assertEquals(custom.mode, "strict")
  assertEquals(custom.maxSessionsPerAgent, 3)
  assertEquals(custom.maxMessages, 12)
  assertEquals(custom.permissionGuard, false)
  assertEquals(custom.persistence, false)

  const dir = Deno.makeTempDirSync()
  const statePath = join(dir, "state.json")

  const runtime = createLazyRuntime({
    project: { root: "/tmp/project" },
    directory: "/tmp/project",
    worktree: "/tmp/project",
  })
  runtime.configure({ persistence: { path: statePath } })
  runtime.jobBoard.registerLaunch("parent", "lazy-explorer", "call-1")
  runtime.recordEvent("command", "saved state")
  await runtime.recordPruning(120, 81)
  await runtime.recordCloseEvidence("behavior", "Added governed close report.")
  await runtime.recordCloseEvidence("risk", "Manual risk example.")
  await runtime.recordCloseEvidence("verification", "pending")
  await runtime.recordOpenCodeEvent({ type: "todo", count: 2 })
  await runtime.recordOpenCodeEvent({ type: "diff", summary: "3 files changed" })
  await runtime.save()
  assertEquals(existsSync(statePath), true)

  const restored = createLazyRuntime({
    project: { root: "/tmp/project" },
    directory: "/tmp/project",
    worktree: "/tmp/project",
  })
  restored.configure({ persistence: { path: statePath } })
  await restored.load()
  assertEquals(restored.jobBoard.getStaleJobs("parent").length, 1)
  assertEquals(restored.formatStatus("parent").includes("Stale Sessions"), true)
  assertEquals(restored.contextStats.lastBefore, 120)
  assertEquals(restored.contextStats.lastAfter, 81)
  assertEquals(restored.contextStats.totalPruned, 39)
  assertEquals(restored.closeReport.behaviorChanges[0], "Added governed close report.")
  assertEquals(restored.closeReport.remainingRisks[0], "Manual risk example.")
  assertEquals(restored.closeReport.verificationResult, "pending")
  assertEquals(restored.openCodeSnapshot.todos, 2)
  assertEquals(restored.openCodeSnapshot.diffSummary, "3 files changed")
  assertEquals(restored.formatStatus("parent").includes("Token control"), true)
  assertEquals(restored.formatStatus("parent").includes("OpenCode"), true)
  assertEquals(restored.formatCloseReport("parent").includes("Changed behavior"), true)
  assertEquals(restored.formatCloseReport("parent").includes("none recorded"), true)
  assertEquals(restored.formatDoctorReport().includes("LAZY DOCTOR"), true)
  assertEquals(restored.formatDoctorReport().includes("- package: ready"), true)

  Deno.writeTextFileSync(
    statePath,
    JSON.stringify({
      version: 1,
      trace: { stage: "idle", recentEvents: [] },
      jobBoard: {},
    }),
  )
  const oldState = createLazyRuntime({ project: { root: "/tmp/project" } })
  oldState.configure({ persistence: { path: statePath } })
  await oldState.load()
  assertEquals(oldState.contextStats.totalPruned, 0)

  Deno.writeTextFileSync(statePath, "{not json")
  const corrupt = createLazyRuntime({ project: { root: "/tmp/project" } })
  corrupt.configure({ persistence: { path: statePath } })
  await corrupt.load()
  assertEquals(corrupt.recoveryMessage, "State file was corrupt and ignored.")

  const noPersistPath = join(dir, "off.json")
  const noPersist = createLazyRuntime({ project: { root: "/tmp/project-off" } })
  noPersist.configure({ persistence: false })
  noPersist.jobBoard.registerLaunch("parent", "lazy-explorer", "call-2")
  await noPersist.save()
  assertEquals(existsSync(noPersistPath), false)

  await runtime.reset()
  assertEquals(runtime.formatStatus("parent").includes("No jobs"), true)
  assertEquals(runtime.contextStats.totalPruned, 0)
  assertEquals(runtime.closeReport.behaviorChanges.length, 0)

  // cleanup
  await Deno.remove(dir, { recursive: true })
})
