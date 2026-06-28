import { assert, assertEquals } from "jsr:@std/assert@1"
import LazyOpenCodeDefault, {
  LazyOpenCodePlugin,
  LazyOpenCodePluginV1,
  LazyOpenCodeV2Plugin,
} from "../src/index.ts"
import { createOpenCodeControlPlane } from "../src/opencode-control-plane.ts"

Deno.test("v2 default export registers governed OpenCode surface", async () => {
  assertEquals(LazyOpenCodeDefault, LazyOpenCodePluginV1)
  assertEquals(LazyOpenCodePlugin, LazyOpenCodePluginV1)
  assertEquals(LazyOpenCodeV2Plugin.id, "lazyopencode-core")

  const transforms: Record<string, Array<(draft: unknown) => void | Promise<void>>> = {
    agent: [],
    command: [],
    skill: [],
    reference: [],
  }
  const context = {
    agent: { transform: (fn: (draft: unknown) => void) => transforms.agent.push(fn) },
    command: { transform: (fn: (draft: unknown) => void) => transforms.command.push(fn) },
    skill: { transform: (fn: (draft: unknown) => void) => transforms.skill.push(fn) },
    reference: { transform: (fn: (draft: unknown) => void) => transforms.reference.push(fn) },
  }

  await LazyOpenCodeV2Plugin.setup(context as never)
  assertEquals(transforms.agent.length, 1)
  assertEquals(transforms.command.length, 1)
  assertEquals(transforms.skill.length, 1)
  assertEquals(transforms.reference.length, 1)

  const updatedAgents: string[] = []
  await transforms.agent[0]({
    update(id: string, mutate: (agent: Record<string, unknown>) => void) {
      const agent: Record<string, unknown> = { description: "user override" }
      mutate(agent)
      updatedAgents.push(id)
      assert(agent.description, "agent description is present")
    },
    default(id: string) {
      assertEquals(id, "lazy")
    },
  })
  assert(updatedAgents.includes("lazy"))
  assert(!updatedAgents.includes("orchestrator"))

  const updatedCommands: string[] = []
  await transforms.command[0]({
    update(name: string, mutate: (command: Record<string, unknown>) => void) {
      const command: Record<string, unknown> = {}
      mutate(command)
      updatedCommands.push(name)
      assert(command.description, "command description is present")
    },
  })
  assert(updatedCommands.includes("lazy"))
  assert(updatedCommands.includes("deepwork"))

  let skillPath = ""
  await transforms.skill[0]({
    source(source: { path?: string }) {
      skillPath = source.path ?? ""
    },
  })
  assert(skillPath.includes("skills/lazy"))

  let referenceName = ""
  await transforms.reference[0]({
    add(name: string) {
      referenceName = name
    },
  })
  assertEquals(referenceName, "lazyopencode")
})

Deno.test("OpenCode control plane degrades cleanly", async () => {
  const logs: unknown[] = []
  const toasts: unknown[] = []
  const plane = createOpenCodeControlPlane({
    session: {
      status: () => ({ data: { status: "idle" } }),
      get: () => ({ data: { status: "idle", directory: "/tmp/worktree" } }),
      children: () => ({ data: [{ id: "child-1" }, { id: "child-2" }] }),
      todo: () => ({ data: { items: [{ id: "t1" }, { id: "t2" }, { id: "t3" }] } }),
      diff: () => ({ data: { summary: "2 files changed", files: ["a.ts", "b.ts"] } }),
      wait: () => ({ data: { ok: true } }),
      revert: () => {
        throw new Error("checkpoint missing")
      },
    },
    v2: {
      session: {
        permission: {
          list: () => ({ data: [{ id: "p1" }, { id: "p2" }] }),
        },
      },
    },
    config: {
      get: () => ({ data: { model: "openai/gpt-5" } }),
      providers: () => ({
        data: {
          providers: [
            { id: "openai", models: [{ id: "gpt-5" }, { id: "o3" }] },
            { id: "deepseek", models: { "free-fast": {} } },
          ],
        },
      }),
    },
    file: {
      status: () => ({ data: { files: ["a.ts", "b.ts", "c.ts"] } }),
    },
    app: {
      log: (input: unknown) => logs.push(input),
    },
    tui: {
      showToast: (input: unknown) => toasts.push(input),
    },
  })

  const snapshot = await plane.snapshot("s1")
  assertEquals(snapshot.sessionStatus, "idle")
  assertEquals(snapshot.pendingPermissions, 2)
  assertEquals(snapshot.todos, 3)
  assertEquals(snapshot.diffSummary, "2 files changed")
  assertEquals(snapshot.worktree, "/tmp/worktree")
  assertEquals(snapshot.childSessions, 2)
  assertEquals(snapshot.changedFiles, 3)
  assertEquals(snapshot.currentModel, "openai/gpt-5")
  assert(snapshot.availableModels.includes("openai/gpt-5"))
  assert(snapshot.availableModels.includes("deepseek/free-fast"))
  assert(snapshot.capabilities.includes("session.status"))

  const validation = await plane.validateModels(["openai/gpt-5", "missing/model", "badmodel"])
  assertEquals(validation.invalidModels, ["missing/model", "badmodel"])

  await plane.log("warn", "hello", { ok: true })
  await plane.notify("info", "done")
  assertEquals(logs.length, 1)
  assertEquals(toasts.length, 1)

  assertEquals(await plane.wait("s1"), { ok: true })
  const reverted = await plane.revert("s1", "m1")
  assertEquals(reverted.ok, false)
  assert(reverted.reason?.includes("checkpoint missing"))

  const empty = await createOpenCodeControlPlane({}).snapshot("s1")
  assertEquals(empty.sessionStatus, "unknown")
  assertEquals(empty.diffSummary, "not collected")
})
