import { assert } from "jsr:@std/assert@1"
import { LazyOpenCodePlugin } from "../src/index.ts"

Deno.test("smoke", async () => {
  const ctx = {
    client: { name: "lazyopencode-smoke" },
    project: { root: "/tmp/lazy-test" },
    directory: "/tmp/lazy-test",
    worktree: "/tmp/lazy-test",
    serverUrl: new URL("http://localhost:9000"),
  }

  // ---------------------------------------------------------------------------
  // 1. Load plugin & config
  // ---------------------------------------------------------------------------
  console.log("\n=== 1. Load & Config ===")
  const hooks = await LazyOpenCodePlugin(ctx)
  const config = { agent: {} }
  await hooks.config(config)

  assert(config.agent.lazy?.mode === "primary", "lazy primary registered")
  assert(Object.keys(config.agent).length === 8, "8 agents registered")
  assert(Array.isArray(config.skills?.paths), "skills paths registered")

  // ---------------------------------------------------------------------------
  // 2. /lazy start — classify & gate
  // ---------------------------------------------------------------------------
  console.log("\n=== 2. /lazy start (classify + gate) ===")
  const startOut = { parts: [] }
  await hooks["command.execute.before"](
    { command: "lazy", arguments: "start 实现用户登录功能", sessionID: "s-smoke" },
    startOut,
  )
  assert(startOut.parts[0]?.text.includes("LAZY START"), "lazy start emits activation")
  assert(
    /Lazy (scope|gate|nudge)/.test(startOut.parts[0]?.text),
    "/lazy start classifies task",
  )

  // ---------------------------------------------------------------------------
  // 3. Task dispatch → subagent launch
  // ---------------------------------------------------------------------------
  console.log("\n=== 3. Subagent Launch ===")
  const beforeOut = {
    args: { subagent_type: "lazy-fixer", prompt: "implement login", run_in_background: true },
  }
  await hooks["tool.execute.before"](
    { tool: "task", sessionID: "s-smoke", callID: "call-1" },
    beforeOut,
  )
  assert(beforeOut.args.task_id === undefined, "no reusable session for first launch")
  assert(beforeOut.args.prompt.includes("[background-job-alias:"), "alias injected in prompt")

  // ---------------------------------------------------------------------------
  // 4. Messages transform — dirty → full board injection
  // ---------------------------------------------------------------------------
  console.log("\n=== 4. Messages Transform (full board after launch) ===")
  const msgs1 = [{ info: { role: "user" }, parts: [{ type: "text", text: "build login" }] }]
  await hooks["experimental.chat.messages.transform"](
    { sessionID: "s-smoke", agent: "lazy" },
    { messages: msgs1 },
  )
  assert(
    msgs1[0].parts[0].text.includes("Background Job Board"),
    "full board injected after launch (dirty)",
  )

  // ---------------------------------------------------------------------------
  // 5. Subagent completes → terminal unreconciled
  // ---------------------------------------------------------------------------
  console.log("\n=== 5. Subagent Complete ===")
  const afterOut = {
    title: "Login implemented",
    output: "task_id: fixer-s1\nstate: completed\nresult:\nLogin flow implemented",
    metadata: {},
  }
  await hooks["tool.execute.after"](
    { tool: "task", sessionID: "s-smoke", callID: "call-1", args: {} },
    afterOut,
  )

  // ---------------------------------------------------------------------------
  // 6. Messages transform round 2 — dirty → full board again
  // ---------------------------------------------------------------------------
  console.log("\n=== 6. Messages Transform (full board after completion) ===")
  const msgs2 = [{ info: { role: "user" }, parts: [{ type: "text", text: "review" }] }]
  await hooks["experimental.chat.messages.transform"](
    { sessionID: "s-smoke", agent: "lazy" },
    { messages: msgs2 },
  )
  assert(
    msgs2[0].parts[0].text.includes("Background Job Board"),
    "full board after completion (dirty)",
  )

  // ---------------------------------------------------------------------------
  // 7. Messages transform round 3 — clean → mini only
  // ---------------------------------------------------------------------------
  console.log("\n=== 7. Messages Transform (mini status, board clean) ===")
  const msgs3 = [{ info: { role: "user" }, parts: [{ type: "text", text: "next step" }] }]
  await hooks["experimental.chat.messages.transform"](
    { sessionID: "s-smoke", agent: "lazy" },
    { messages: msgs3 },
  )
  assert(!msgs3[0].parts[0].text.includes("Background Job Board"), "no full board when clean")
  assert(msgs3[0].parts[0].text.includes("Jobs:"), "mini status injected")
  assert(msgs3[0].parts[0].text.includes("reconcileTerminalJobs"), "reconcile hint in mini")

  // ---------------------------------------------------------------------------
  // 8. Reconcile terminal jobs (session.idle event)
  // ---------------------------------------------------------------------------
  console.log("\n=== 8. Reconcile ===")
  await hooks["event"]({
    event: { type: "session.idle", properties: { sessionID: "s-smoke" } },
  })
  // After reconcile, board goes dirty → next transform should show full board again
  const msgs4 = [{ info: { role: "user" }, parts: [{ type: "text", text: "verify" }] }]
  await hooks["experimental.chat.messages.transform"](
    { sessionID: "s-smoke", agent: "lazy" },
    { messages: msgs4 },
  )
  assert(
    msgs4[0].parts[0].text.includes("Background Job Board"),
    "full board after reconciliation (dirty)",
  )

  // ---------------------------------------------------------------------------
  // 9. Session deleted — cleanup
  // ---------------------------------------------------------------------------
  console.log("\n=== 9. Session Cleanup ===")
  await hooks["event"]({
    event: { type: "session.deleted", properties: { sessionID: "s-smoke" } },
  })
  // After cleanup, if no jobs remain, no injection at all
  const msgs5 = [{ info: { role: "user" }, parts: [{ type: "text", text: "done" }] }]
  await hooks["experimental.chat.messages.transform"](
    { sessionID: "s-smoke", agent: "lazy" },
    { messages: msgs5 },
  )
  assert(!msgs5[0].parts[0].text.includes("📋"), "no board after session delete (all jobs gone)")
})
