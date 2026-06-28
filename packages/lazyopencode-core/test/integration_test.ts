import { assert } from "jsr:@std/assert@1"
import { LazyOpenCodePlugin, LazyOpenCodeV2Plugin } from "../src/index.ts"
import { BackgroundJobBoard, jobBoard } from "../src/hooks/background-job-board.ts"
import { readFileSync } from "node:fs"

Deno.test("integration", async () => {
  // ---------------------------------------------------------------------------
  // Plugin context (simulating opencode)
  // ---------------------------------------------------------------------------

  const ctx = {
    client: { name: "lazyopencode-test" },
    project: { root: "/tmp/lazy-test" },
    directory: "/tmp/lazy-test",
    worktree: "/tmp/lazy-test",
    serverUrl: new URL("http://localhost:9000"),
  }

  function scopedCtx(name) {
    const root = `/tmp/${name}`
    return {
      ...ctx,
      project: { root },
      directory: root,
      worktree: root,
    }
  }

  // ---------------------------------------------------------------------------
  // Load plugin
  // ---------------------------------------------------------------------------

  const failed = 0

  console.log("=== Loading plugin ===")
  const hooks = await LazyOpenCodePlugin(ctx)
  assert(typeof hooks.config === "function", "config hook exists")
  assert(
    typeof hooks["experimental.chat.system.transform"] === "function",
    "system.transform hook exists",
  )
  assert(
    typeof hooks["experimental.chat.messages.transform"] === "function",
    "messages.transform hook exists",
  )
  assert(
    typeof hooks["chat.params"] === "function",
    "chat.params hook exists",
  )
  assert(
    typeof hooks["tool.execute.before"] === "function",
    "tool.execute.before hook exists",
  )
  assert(
    typeof hooks["tool.execute.after"] === "function",
    "tool.execute.after hook exists",
  )
  assert(typeof hooks["permission.ask"] === "function", "permission.ask hook exists")
  console.log(`  Plugin loaded: ${Object.keys(hooks).length} hooks`)

  // ---------------------------------------------------------------------------
  // 1. Config hook (agent + skill registration)
  // ---------------------------------------------------------------------------

  console.log("\n=== Test 1: Config hook ===")
  const config = { agent: {} }
  await hooks.config(config)
  assert(Object.keys(config.agent).length === 8, "8 agents registered")
  assert(config.agent.lazy !== undefined, "lazy primary registered")
  assert(config.agent["lazy-explorer"] !== undefined, "lazy-explorer registered")
  assert(config.agent["lazy-oracle"] !== undefined, "lazy-oracle registered")
  assert(config.agent["lazy-councillor"] !== undefined, "lazy-councillor registered")
  assert(config.agent["lazy-fixer"] !== undefined, "lazy-fixer registered")
  assert(config.agent["lazy-librarian"] !== undefined, "lazy-librarian registered")
  assert(config.agent["lazy-designer"] !== undefined, "lazy-designer registered")
  assert(config.agent["lazy-observer"] !== undefined, "lazy-observer registered")
  assert(config.agent.orchestrator === undefined, "does not collide with slim orchestrator")
  assert(config.agent.explorer === undefined, "does not collide with slim explorer")
  assert(
    config.agent.lazy.prompt === "" || config.agent.lazy.prompt === undefined,
    "lazy primary prompt is empty (injected by system-transform hook at runtime)",
  )
  assert(
    Array.isArray(config.skills?.paths) && config.skills.paths.length > 0,
    "skills paths registered",
  )
  assert(config.command?.lazy !== undefined, "/lazy command registered")
  assert(config.command?.deepwork !== undefined, "/deepwork alias registered")
  assert(hooks.tool?.council_session !== undefined, "council tool registered")
  assert(config.mcp?.context7 === undefined, "context7 is not injected by default")
  assert(LazyOpenCodeV2Plugin.id === "lazyopencode-core", "v2 plugin id uses package name")

  const mergeHooks = await LazyOpenCodePlugin(scopedCtx("lazy-merge"))
  const skillsDir = new URL("../dist/skills/lazy/", import.meta.url).pathname
  const mergeConfig = {
    agent: {
      custom: { description: "user agent", mode: "subagent" },
      "lazy-oracle": { temperature: 0.33 },
    },
    command: {
      lazy: { template: "user lazy", description: "user command" },
    },
    skills: { paths: [skillsDir] },
    lazyopencode: { persistence: false },
  }
  await mergeHooks.config(mergeConfig)
  assert(mergeConfig.agent.custom.description === "user agent", "non-lazy user agent preserved")
  assert(
    mergeConfig.agent["lazy-oracle"].temperature === 0.33,
    "lazy agent user override preserved",
  )
  assert(mergeConfig.agent["lazy-oracle"].mode === "subagent", "lazy agent defaults still present")
  assert(mergeConfig.command.lazy.template === "user lazy", "existing lazy command preserved")
  assert(
    mergeConfig.skills.paths.filter((p) => p === skillsDir).length === 1,
    "skills path registered idempotently",
  )

  const profileHooks = await LazyOpenCodePlugin(scopedCtx("lazy-model-profile"))
  const profileConfig = {
    agent: {
      "lazy-fixer": { model: "user/fixer-override" },
    },
    lazyopencode: {
      persistence: false,
      models: {
        mode: "profile",
        primary: "openai/expensive-main",
        defaultSubagent: "deepseek/free-fast",
        escalation: { oracle: "openai/oracle-main", council: "deepseek/free-council" },
        byAgent: { "lazy-librarian": "deepseek/docs-fast" },
      },
      opencode: { context7: "inject" },
    },
  }
  await profileHooks.config(profileConfig)
  assert(profileConfig.agent.lazy.model === "openai/expensive-main", "primary model assigned")
  assert(
    profileConfig.agent["lazy-oracle"].model === "openai/oracle-main",
    "oracle escalation model assigned",
  )
  assert(
    profileConfig.agent["lazy-councillor"].model === "deepseek/free-council",
    "council escalation model assigned",
  )
  assert(
    profileConfig.agent["lazy-explorer"].model === "deepseek/free-fast",
    "default subagent model assigned",
  )
  assert(
    profileConfig.agent["lazy-librarian"].model === "deepseek/docs-fast",
    "byAgent model override assigned",
  )
  assert(
    profileConfig.agent["lazy-fixer"].model === "user/fixer-override",
    "user agent model override wins",
  )
  assert(profileConfig.mcp?.context7 !== undefined, "context7 inject is opt-in")

  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8")
  assert(readme.includes("/lazy debug"), "README documents /lazy debug")
  assert(readme.includes("/lazy close"), "README documents /lazy close")
  assert(readme.includes("governed team runtime"), "README documents governed runtime positioning")
  assert(!readme.includes("}\n```\n```"), "README has no duplicate closing fence after config")

  console.log("\n=== Test 1b: Lazy command surface ===")
  const lazyStartOut = { parts: [] }
  await hooks["command.execute.before"](
    {
      command: "lazy",
      arguments: "start 全面优化这个项目",
      sessionID: "s-command",
    },
    lazyStartOut,
  )
  assert(
    lazyStartOut.parts[0]?.text.includes("LAZY START"),
    "/lazy start emits activation",
  )
  assert(
    lazyStartOut.parts[0]?.text.includes("ambiguous"),
    "/lazy start classifies ambiguous task",
  )

  const controlPlaneHooks = await LazyOpenCodePlugin({
    ...scopedCtx("lazy-control-plane"),
    client: {
      session: {
        status: () => ({ data: { status: "idle" } }),
        get: () => ({ data: { status: "idle", directory: "/tmp/lazy-control-plane-worktree" } }),
        children: () => ({ data: [{ id: "child-1" }] }),
        todo: () => ({ data: { items: [{ id: "todo-1" }, { id: "todo-2" }] } }),
        diff: () => ({ data: { summary: "4 files changed", files: ["a.ts", "b.ts"] } }),
        revert: () => ({ data: { ok: true } }),
      },
      v2: {
        session: {
          permission: {
            list: () => ({ data: [{ id: "permission-1" }] }),
          },
        },
      },
      config: {
        get: () => ({ data: { model: "openai/gpt-5" } }),
        providers: () => ({
          data: {
            providers: [
              { id: "openai", models: [{ id: "gpt-5" }] },
              { id: "deepseek", models: { "free-fast": {} } },
            ],
          },
        }),
      },
      file: {
        status: () => ({ data: { files: ["a.ts", "b.ts", "c.ts"] } }),
      },
    },
  })
  await controlPlaneHooks.config({ agent: {}, lazyopencode: { persistence: false } })
  const highRiskStartOut = { parts: [] }
  await controlPlaneHooks["command.execute.before"](
    {
      command: "lazy",
      arguments: "start migrate auth permissions in production",
      sessionID: "s-control",
    },
    highRiskStartOut,
  )
  assert(
    highRiskStartOut.parts[0]?.text.includes("Workspace isolation"),
    "/lazy start recommends isolation for high-risk work",
  )
  const controlStatusOut = { parts: [] }
  await controlPlaneHooks["command.execute.before"](
    { command: "lazy", arguments: "status", sessionID: "s-control" },
    controlStatusOut,
  )
  assert(
    controlStatusOut.parts[0]?.text.includes("pending permissions: 1"),
    "/lazy status refreshes pending permissions from control plane",
  )
  assert(
    controlStatusOut.parts[0]?.text.includes("todos: 2"),
    "/lazy status refreshes todos from control plane",
  )
  assert(
    controlStatusOut.parts[0]?.text.includes("4 files changed"),
    "/lazy status refreshes diff summary from control plane",
  )
  assert(
    controlStatusOut.parts[0]?.text.includes("child sessions: 1"),
    "/lazy status refreshes child session count from SDK",
  )
  assert(
    controlStatusOut.parts[0]?.text.includes("changed files: 3"),
    "/lazy status refreshes changed file count from SDK",
  )
  const controlCloseOut = { parts: [] }
  await controlPlaneHooks["command.execute.before"](
    { command: "lazy", arguments: "status", sessionID: "s-control" },
    { parts: [] },
  )
  await controlPlaneHooks["command.execute.before"](
    { command: "lazy", arguments: "close", sessionID: "s-control" },
    controlCloseOut,
  )
  const diffMentions = controlCloseOut.parts[0]?.text.match(/Diff summary: 4 files changed/g) ??
    []
  assert(
    diffMentions.length === 2,
    "control-plane diff appears once as SDK summary and once as close evidence",
  )

  const statusOut = { parts: [] }
  await hooks["command.execute.before"](
    { command: "lazy", arguments: "status", sessionID: "s-command" },
    statusOut,
  )
  assert(statusOut.parts[0]?.text.includes("Mode: governor"), "/lazy status shows mode")
  assert(statusOut.parts[0]?.text.includes("Install health"), "/lazy status shows install health")
  assert(
    statusOut.parts[0]?.text.includes("permission guard: enabled"),
    "/lazy status shows permission guard",
  )
  assert(
    statusOut.parts[0]?.text.includes("Recent gate decisions"),
    "/lazy status shows recent decisions",
  )
  assert(statusOut.parts[0]?.text.includes("Model profile"), "/lazy status shows model profile")

  const modeOut = { parts: [] }
  await hooks["command.execute.before"](
    { command: "lazy", arguments: "mode strict", sessionID: "s-command" },
    modeOut,
  )
  assert(modeOut.parts[0]?.text.includes("strict"), "/lazy mode switches mode")

  const explainOut = { parts: [] }
  await hooks["command.execute.before"](
    { command: "lazy", arguments: "explain", sessionID: "s-command" },
    explainOut,
  )
  assert(
    explainOut.parts[0]?.text.includes("Last lazy decision"),
    "/lazy explain reports last decision",
  )

  const reviewOut = { parts: [] }
  await hooks["command.execute.before"](
    { command: "lazy", arguments: "review", sessionID: "s-command" },
    reviewOut,
  )
  assert(reviewOut.parts[0]?.text.includes("lazy/review"), "/lazy review activates review")

  const simplifyOut = { parts: [] }
  await hooks["command.execute.before"](
    { command: "lazy", arguments: "simplify", sessionID: "s-command" },
    simplifyOut,
  )
  assert(simplifyOut.parts[0]?.text.includes("lazy/simplify"), "/lazy simplify activates simplify")

  const resetOut = { parts: [] }
  await hooks["command.execute.before"](
    { command: "lazy", arguments: "reset", sessionID: "s-command" },
    resetOut,
  )
  assert(resetOut.parts[0]?.text.includes("reset"), "/lazy reset clears runtime")

  const closeOut = { parts: [] }
  await hooks["command.execute.before"](
    { command: "lazy", arguments: "close", sessionID: "s-command" },
    closeOut,
  )
  assert(closeOut.parts[0]?.text.includes("LAZY CLOSE"), "/lazy close emits close stage")
  assert(
    closeOut.parts[0]?.text.includes("Close contract"),
    "/lazy close emits close contract",
  )
  assert(
    closeOut.parts[0]?.text.includes("/lazy behavior"),
    "/lazy close mentions manual correction commands",
  )
  assert(
    closeOut.parts[0]?.text.includes("Changed behavior"),
    "/lazy close includes changed behavior heading",
  )
  assert(closeOut.parts[0]?.text.includes("Tests run"), "/lazy close includes tests heading")
  assert(
    closeOut.parts[0]?.text.includes("Verification result"),
    "/lazy close includes verification heading",
  )
  assert(
    closeOut.parts[0]?.text.includes("Terminal jobs reconciled"),
    "/lazy close includes reconciliation heading",
  )
  assert(closeOut.parts[0]?.text.includes("Remaining risks"), "/lazy close includes risk heading")
  assert(
    closeOut.parts[0]?.text.includes("Simplifications/deletions"),
    "/lazy close includes simplification heading",
  )

  const closeBlockBefore = {
    args: { subagent_type: "lazy-fixer", prompt: "produce terminal job" },
  }
  await hooks["tool.execute.before"](
    { tool: "task", sessionID: "s-close-block", callID: "c-close-block" },
    closeBlockBefore,
  )
  await hooks["tool.execute.after"](
    { tool: "task", sessionID: "s-close-block", callID: "c-close-block", args: {} },
    {
      title: "Task",
      output: "task_id: close-block-task\nstate: completed\noutput: done",
      metadata: {},
    },
  )
  const closeBlockedOut = { parts: [] }
  await hooks["command.execute.before"](
    { command: "lazy", arguments: "close", sessionID: "s-close-block" },
    closeBlockedOut,
  )
  assert(
    closeBlockedOut.parts[0]?.text.includes("Close blocked: reconcile terminal jobs first"),
    "/lazy close blocks when terminal jobs are unreconciled",
  )

  console.log("\n=== Test 1c: Council eligibility ===")
  const councilBlockedHooks = await LazyOpenCodePlugin(scopedCtx("lazy-council-blocked"))
  await councilBlockedHooks.config({ agent: {}, lazyopencode: { persistence: false } })
  const councilBlocked = await councilBlockedHooks.tool.council_session.execute(
    { prompt: "ordinary question" },
    { sessionID: "s-council-blocked" },
  )
  assert(
    councilBlocked.output.includes("Council blocked"),
    "guarded council blocks ordinary context",
  )

  const councilHighRiskHooks = await LazyOpenCodePlugin(scopedCtx("lazy-council-high-risk"))
  await councilHighRiskHooks.config({ agent: {}, lazyopencode: { persistence: false } })
  await councilHighRiskHooks["command.execute.before"](
    { command: "lazy", arguments: "start change auth permissions", sessionID: "s-council-high" },
    { parts: [] },
  )
  const councilHighRisk = await councilHighRiskHooks.tool.council_session.execute(
    { prompt: "review auth permissions" },
    { sessionID: "s-council-high" },
  )
  assert(
    councilHighRisk.output.includes("Council Results"),
    "guarded council allows high-risk decision",
  )
  assert(
    councilHighRisk.output.includes("Estimated model calls"),
    "council output shows estimated model calls",
  )

  const councilDebugHooks = await LazyOpenCodePlugin(scopedCtx("lazy-council-debug"))
  await councilDebugHooks.config({ agent: {}, lazyopencode: { persistence: false } })
  await councilDebugHooks["command.execute.before"](
    { command: "lazy", arguments: "debug failing test", sessionID: "s-council-debug" },
    { parts: [] },
  )
  const councilDebug = await councilDebugHooks.tool.council_session.execute(
    { prompt: "debug hypothesis" },
    { sessionID: "s-council-debug" },
  )
  assert(councilDebug.output.includes("Council Results"), "guarded council allows debug stage")

  const councilAlwaysHooks = await LazyOpenCodePlugin(scopedCtx("lazy-council-always"))
  await councilAlwaysHooks.config({
    agent: {},
    lazyopencode: { persistence: false, council: { eligibility: "always" } },
  })
  const councilAlways = await councilAlwaysHooks.tool.council_session.execute(
    { prompt: "ordinary but explicitly allowed" },
    { sessionID: "s-council-always" },
  )
  assert(councilAlways.output.includes("Council Results"), "always council allows ordinary context")

  const councilDisabledHooks = await LazyOpenCodePlugin(scopedCtx("lazy-council-disabled"))
  await councilDisabledHooks.config({
    agent: {},
    lazyopencode: { persistence: false, council: { enabled: false } },
  })
  const councilDisabled = await councilDisabledHooks.tool.council_session.execute(
    { prompt: "ordinary question" },
    { sessionID: "s-council-disabled" },
  )
  assert(councilDisabled.output.includes("Council is disabled"), "disabled council blocks globally")

  console.log("\n=== Test 1d: Permission guard ===")
  const destructiveOut = { status: "allow" }
  await hooks["permission.ask"](
    {
      id: "p1",
      type: "bash",
      pattern: "rm -rf dist",
      sessionID: "s-perm",
      messageID: "m1",
      callID: "call-perm",
      title: "Run rm -rf dist",
      metadata: {},
      time: { created: Date.now() },
    },
    destructiveOut,
  )
  assert(destructiveOut.status === "ask", "destructive bash is forced to ask")

  const safeOut = { status: "allow" }
  await hooks["permission.ask"](
    {
      id: "p2",
      type: "bash",
      pattern: "ls src",
      sessionID: "s-perm",
      messageID: "m2",
      title: "Run ls src",
      metadata: {},
      time: { created: Date.now() },
    },
    safeOut,
  )
  assert(safeOut.status === "allow", "safe bash permission is untouched")

  const offModeHooks = await LazyOpenCodePlugin(scopedCtx("lazy-permission-off-mode"))
  await offModeHooks.config({ agent: {}, lazyopencode: { mode: "off", persistence: false } })
  const offModeOut = { status: "allow" }
  await offModeHooks["permission.ask"](
    {
      id: "p3",
      type: "bash",
      pattern: "git reset --hard",
      sessionID: "s-perm-off-mode",
      messageID: "m3",
      title: "Run git reset --hard",
      metadata: {},
      time: { created: Date.now() },
    },
    offModeOut,
  )
  assert(offModeOut.status === "ask", "mode off keeps permission guard enabled")

  const guardOffHooks = await LazyOpenCodePlugin(scopedCtx("lazy-permission-disabled"))
  await guardOffHooks.config({
    agent: {},
    lazyopencode: { permissionGuard: false, persistence: false },
  })
  const guardOffOut = { status: "allow" }
  await guardOffHooks["permission.ask"](
    {
      id: "p4",
      type: "bash",
      pattern: "rm -rf dist",
      sessionID: "s-perm-disabled",
      messageID: "m4",
      title: "Run rm -rf dist",
      metadata: {},
      time: { created: Date.now() },
    },
    guardOffOut,
  )
  assert(guardOffOut.status === "allow", "permissionGuard false leaves permission untouched")

  // ---------------------------------------------------------------------------
  // 2. System transform (ponytail injection)
  // ---------------------------------------------------------------------------

  console.log("\n=== Test 2: System transform ===")

  // Populate sessionAgentMap so the hook knows this is a lazy primary session
  const paramOutOrch2 = {
    temperature: 0,
    topP: 1,
    topK: 40,
    maxOutputTokens: undefined,
    options: {},
  }
  await hooks["chat.params"](
    {
      sessionID: "s-orch2",
      agent: "lazy",
      model: { providerID: "openai", modelID: "gpt-5" },
      provider: { source: "config", info: {}, options: {} },
      message: {},
    },
    paramOutOrch2,
  )

  const sysIn = { sessionID: "s-orch2" }
  const sysOut = { system: ["You are an AI assistant."] }
  await hooks["experimental.chat.system.transform"](
    sysIn,
    sysOut,
  )
  assert(
    sysOut.system[0].includes("PONYTAIL MODE ACTIVE"),
    "ponytail appended to system prompt",
  )
  assert(
    sysOut.system[0].includes("The ladder — stop at the first rung"),
    "ponytail ladder rules included",
  )
  assert(
    sysOut.system[0].includes("lazy workflow engine"),
    "lazy primary prompt prepended",
  )
  assert(
    sysOut.system[0].includes("grill") && sysOut.system[0].includes("specify") &&
      sysOut.system[0].includes("plan") && sysOut.system[0].includes("build"),
    "lazy workflow instructions present (grill, specify, plan, build)",
  )

  // Second call should not double-append (collapses — guarded by sentinel + PONYTAIL MODE ACTIVE check)
  await hooks["experimental.chat.system.transform"](
    sysIn,
    sysOut,
  )
  const ponyCount = (sysOut.system[0].match(/PONYTAIL MODE ACTIVE/g) || [])
    .length
  assert(ponyCount === 1, "ponytail is injected once across repeated calls")

  const unknownSysOut = { system: ["You are an AI assistant."] }
  await hooks["experimental.chat.system.transform"](
    { sessionID: "s-unknown-agent" },
    unknownSysOut,
  )
  assert(
    !unknownSysOut.system.join("\n").includes("lazy workflow engine"),
    "unknown agent does not receive lazy primary prompt",
  )

  // ---------------------------------------------------------------------------
  // 3. Chat params (per-agent temperature)
  // ---------------------------------------------------------------------------

  console.log("\n=== Test 3: Chat params ===")
  const paramOut1 = {
    temperature: 0,
    topP: 1,
    topK: 40,
    maxOutputTokens: undefined,
    options: {},
  }
  await hooks["chat.params"](
    {
      sessionID: "s-design",
      agent: "lazy-designer",
      model: { providerID: "openai", modelID: "gpt-5" },
      provider: { source: "config", info: {}, options: {} },
      message: {},
    },
    paramOut1,
  )
  assert(paramOut1.temperature === 0.7, "designer temp = 0.7")

  const paramOut2 = {
    temperature: 0,
    topP: 1,
    topK: 40,
    maxOutputTokens: undefined,
    options: {},
  }
  await hooks["chat.params"](
    {
      sessionID: "s-orch",
      agent: "lazy",
      model: { providerID: "openai", modelID: "gpt-5" },
      provider: { source: "config", info: {}, options: {} },
      message: {},
    },
    paramOut2,
  )
  assert(paramOut2.temperature === 0.1, "lazy temp = 0.1")

  // Per-agent temperature verified
  assert(paramOut2.temperature === 0.1, "lazy gets correct temp from agent detection")

  // ---------------------------------------------------------------------------
  // 4. Task session — before hook
  // ---------------------------------------------------------------------------

  console.log("\n=== Test 4: Task session before hook ===")

  // Test 4a: First task launch
  const beforeOut = { args: { subagent_type: "lazy-explorer", prompt: "find files" } }
  await hooks["tool.execute.before"](
    { tool: "task", sessionID: "s-main", callID: "c1" },
    beforeOut,
  )
  assert(
    beforeOut.args.prompt.includes("background-job-alias"),
    "alias injected into prompt",
  )
  assert(
    beforeOut.args.prompt.includes("lazy-explorer-"),
    "alias includes agent name + counter",
  )

  // Test 4b: Second task — still within default max sessions
  const beforeOut2 = {
    args: { subagent_type: "lazy-explorer", prompt: "find more files" },
  }
  await hooks["tool.execute.before"](
    { tool: "task", sessionID: "s-main", callID: "c2" },
    beforeOut2,
  )
  assert(
    !beforeOut2.args.prompt.includes("MAX SESSIONS"),
    "second session is allowed with default max sessions",
  )

  // Test 4b.1: Third task — should warn about max sessions
  const beforeOut2b = {
    args: { subagent_type: "lazy-explorer", prompt: "find too many files" },
  }
  await hooks["tool.execute.before"](
    { tool: "task", sessionID: "s-main", callID: "c2b" },
    beforeOut2b,
  )
  assert(
    beforeOut2b.args.prompt.includes("MAX SESSIONS"),
    "max sessions block injected after exceeding limit",
  )
  assert(
    beforeOut2b.args.prompt.includes("3 lazy-explorer sessions"),
    "correct count in warning",
  )
  assert(
    !beforeOut2b.args.prompt.includes("background-job-alias"),
    "blocked max-session launch is not registered as a background job",
  )

  // Test 4c: Non-task tool — should be no-op
  const beforeOut3 = { args: { filePath: "/tmp/test" } }
  await hooks["tool.execute.before"](
    { tool: "Read", sessionID: "s-main", callID: "c3" },
    beforeOut3,
  )
  assert(!beforeOut3.args.prompt, "non-task tool is no-op")

  // Test 4d: Depth warning
  const beforeOut4 = { args: { subagent_type: "general", prompt: "deep" } }
  await hooks["tool.execute.before"](
    { tool: "task", sessionID: "s-main", callID: "c4" },
    beforeOut4,
  )
  await hooks["tool.execute.before"](
    { tool: "task", sessionID: "s-main", callID: "c5" },
    beforeOut4,
  )
  await hooks["tool.execute.before"](
    { tool: "task", sessionID: "s-main", callID: "c6" },
    beforeOut4,
  )
  await hooks["tool.execute.before"](
    { tool: "task", sessionID: "s-main", callID: "c7" },
    beforeOut4,
  )
  const beforeOutFinal = {
    args: { subagent_type: "general", prompt: "too deep" },
  }
  await hooks["tool.execute.before"](
    { tool: "task", sessionID: "s-main", callID: "c8" },
    beforeOutFinal,
  )
  assert(
    beforeOutFinal.args.prompt.includes("DEPTH BLOCKED"),
    "depth block at level 5",
  )
  assert(
    beforeOutFinal.args.run_in_background === undefined,
    "background flag removed on depth block",
  )

  // Test 4e: Completed task calls release depth, and reuse does not consume depth
  const releaseBefore = {
    args: { subagent_type: "lazy-fixer", prompt: "single task" },
  }
  await hooks["tool.execute.before"](
    { tool: "task", sessionID: "s-depth-release", callID: "c-release-1" },
    releaseBefore,
  )
  assert(
    hooks.runtime.sessionDepth.get("s-depth-release") === 1,
    "depth tracked while task call is active",
  )
  await hooks["tool.execute.after"](
    {
      tool: "task",
      sessionID: "s-depth-release",
      callID: "c-release-1",
      args: {},
    },
    {
      title: "Task",
      output: "task_id: task-release\nstate: completed\noutput: done",
      metadata: {},
    },
  )
  assert(
    !hooks.runtime.sessionDepth.has("s-depth-release"),
    "depth released after task call completion",
  )
  await hooks.event({
    event: { type: "session.idle", properties: { sessionID: "s-depth-release" } },
  })
  const reuseBefore = {
    args: { subagent_type: "lazy-fixer", prompt: "reuse task" },
  }
  await hooks["tool.execute.before"](
    { tool: "task", sessionID: "s-depth-release", callID: "c-release-2" },
    reuseBefore,
  )
  assert(
    reuseBefore.args.task_id === "task-release",
    "reconciled task reused",
  )
  assert(
    !hooks.runtime.sessionDepth.has("s-depth-release"),
    "reuse does not consume depth",
  )
  jobBoard.dropSession("s-depth-release")

  // ---------------------------------------------------------------------------
  // 5. BackgroundJobBoard lifecycle
  // ---------------------------------------------------------------------------

  console.log("\n=== Test 5: BackgroundJobBoard ===")

  // Register a launch
  const job = jobBoard.registerLaunch("s-main", "lazy-explorer", "c-launch")
  assert(job.state === "running", "new job state is running")
  assert(job.agent === "lazy-explorer", "job agent correct")
  assert(job.alias.startsWith("lazy-explorer-"), "alias auto-generated")

  // Update status
  jobBoard.updateStatus("c-launch", "task-123", "completed", "Found 5 files")
  const found = jobBoard.findJobByCallID("c-launch")
  assert(found !== undefined, "job found by callID")
  assert(found.state === "completed", "job state updated to completed")
  assert(found.terminalUnreconciled === true, "job is terminal unreconciled")

  // Terminal unreconciled shows up
  const terminal = jobBoard.getTerminalUnreconciledJobs("s-main")
  assert(terminal.length >= 1, "terminal jobs found")
  assert(terminal.some((j) => j.alias === job.alias), "our job is terminal")

  // Format for prompt
  const boardText = jobBoard.formatForPrompt("s-main")
  assert(boardText !== null, "board text generated")
  assert(boardText.includes("Background Job Board"), "board heading present")
  assert(boardText.includes("Terminal (unreconciled)"), "terminal section present")
  assert(boardText.includes("completed"), "state shown")
  assert(
    boardText.includes("reconcileTerminalJobs"),
    "reconciliation instruction present",
  )

  // Mark reconciled
  jobBoard.markReconciled("task-123")
  const terminal2 = jobBoard.getTerminalUnreconciledJobs("s-main")
  assert(
    !terminal2.some((j) => j.taskID === "task-123"),
    "job no longer unreconciled after reconciliation",
  )

  // Session reuse
  const reused = jobBoard.resolveReusable("s-main", "lazy-explorer")
  assert(reused !== undefined, "reusable session found")
  assert(reused.taskID === "task-123", "reused correct session")
  const reusableBoardText = jobBoard.formatForPrompt("s-main")
  assert(
    reusableBoardText?.includes("Reusable Sessions"),
    "reconciled sessions appear as reusable in board",
  )
  assert(
    reusableBoardText?.includes("task-123"),
    "reusable board includes reconciled task id",
  )

  // Reusable trimming
  const trimBoard = new BackgroundJobBoard()
  for (let i = 1; i <= 3; i++) {
    trimBoard.registerLaunch("s-trim", "lazy-explorer", `c-trim-${i}`)
    trimBoard.updateStatus(
      `c-trim-${i}`,
      `task-trim-${i}`,
      "completed",
      `done ${i}`,
    )
    trimBoard.markReconciled(`task-trim-${i}`)
  }
  assert(trimBoard.size === 2, "reusable sessions trimmed to max")

  // Cancellation
  jobBoard.registerLaunch("s-main", "lazy-fixer", "c-fix")
  jobBoard.updateStatus("c-fix", "task-456", "running")
  jobBoard.cancelJob("task-456")
  assert(jobBoard.isLateCancelledTaskError("c-fix"), "cancellation detected")
  jobBoard.updateStatus("c-fix", "task-456", "error")
  const job2Updated = jobBoard.findJobByCallID("c-fix")
  assert(job2Updated?.state === "cancelled", "late error normalized to cancelled")

  // Session cleanup
  jobBoard.dropSession("s-main")
  assert(jobBoard.size < 5, "sessions cleaned up")

  // ---------------------------------------------------------------------------
  // 6. Messages transform
  // ---------------------------------------------------------------------------

  console.log("\n=== Test 6: Messages transform ===")

  // Test truncation
  const msgs = []
  for (let i = 0; i < 120; i++) {
    msgs.push({
      info: { role: i % 2 === 0 ? "user" : "assistant" },
      parts: [{ type: "text", text: `message ${i}` }],
    })
  }
  const msgOut = { messages: [...msgs] }
  await hooks["experimental.chat.messages.transform"](
    { agent: "lazy", sessionID: "s-any" },
    msgOut,
  )
  assert(msgOut.messages.length <= 81, "truncated to 81 or fewer messages")
  const pruneStatusOut = { parts: [] }
  await hooks["command.execute.before"](
    { command: "lazy", arguments: "status", sessionID: "s-any" },
    pruneStatusOut,
  )
  assert(
    pruneStatusOut.parts[0]?.text.includes("Token control"),
    "/lazy status shows token control",
  )
  assert(pruneStatusOut.parts[0]?.text.includes("last prune: 120 ->"), "status records pruning")
  assert(pruneStatusOut.parts[0]?.text.includes("total pruned"), "status shows total pruned")

  const burstMsgs = [
    { info: { role: "system" }, parts: [{ type: "text", text: "system" }] },
    { info: { role: "user" }, parts: [{ type: "text", text: "start" }] },
  ]
  for (let i = 0; i < 160; i++) {
    burstMsgs.push({
      info: { role: "assistant" },
      parts: [{ type: "text", text: `assistant burst ${i}` }],
    })
  }
  const burstOut = { messages: [...burstMsgs] }
  await hooks["experimental.chat.messages.transform"](
    { agent: "lazy", sessionID: "s-burst" },
    burstOut,
  )
  assert(burstOut.messages.length <= 81, "assistant burst is hard-capped")

  // Test workflow gate injection — BUILD keyword without PRD triggers gate
  const lazyMsgs = {
    messages: [
      {
        info: { role: "system" },
        parts: [{ type: "text", text: "system prompt" }],
      },
      {
        info: { role: "user" },
        parts: [{ type: "text", text: "implement feature" }],
      },
    ],
  }
  await hooks["experimental.chat.messages.transform"](
    { agent: "lazy", sessionID: "s-phase" },
    lazyMsgs,
  )
  const lastUserPart = lazyMsgs.messages[1].parts[0]
  assert(
    lastUserPart.text.includes("Lazy nudge") || lastUserPart.text.includes("Lazy gate"),
    "workflow gate injected when build triggered without PRD",
  )

  // Test no gate when message has no BUILD keywords
  const noGateMsgs = {
    messages: [
      {
        info: { role: "system" },
        parts: [{ type: "text", text: "system prompt" }],
      },
      {
        info: { role: "user" },
        parts: [{ type: "text", text: "do something" }],
      },
    ],
  }
  await hooks["experimental.chat.messages.transform"](
    { agent: "lazy", sessionID: "s-nogate" },
    noGateMsgs,
  )
  const noGateText = noGateMsgs.messages[1].parts[0].text
  assert(
    !noGateText.includes("STOP"),
    "no workflow gate injected for non-build message",
  )

  // Test skill filtering
  const skillMsgs = {
    messages: [
      {
        info: { role: "system" },
        parts: [
          {
            type: "text",
            text: `<available_skills>
<skill>
  <name>lazy/grill</name>
  <description>Interview relentlessly</description>
</skill>
<skill>
  <name>unknown/skill</name>
  <description>Not in allowlist</description>
</skill>
<skill>
  <name>lazy/build</name>
  <description>Build features</description>
</skill>
</available_skills>`,
          },
        ],
      },
    ],
  }
  await hooks["experimental.chat.messages.transform"](
    { agent: "lazy", sessionID: "s-skill" },
    skillMsgs,
  )
  const skillText = skillMsgs.messages[0].parts[0].text
  assert(skillText.includes("lazy/grill"), "allowed skill kept")
  assert(skillText.includes("lazy/build"), "allowed skill kept")
  assert(!skillText.includes("unknown/skill"), "disallowed skill filtered out")

  // ---------------------------------------------------------------------------
  // 7. Error recovery
  // ---------------------------------------------------------------------------

  console.log("\n=== Test 7: Error recovery ===")

  // 7a: JSON error recovery
  const jsonErrOut = {
    title: "Error",
    output: 'SyntaxError: Unexpected token in JSON at position 42\n{"valid": "json", "data": 123}',
    metadata: {},
  }
  await hooks["tool.execute.after"](
    { tool: "edit", sessionID: "s-e1", callID: "ec1", args: {} },
    jsonErrOut,
  )
  assert(
    jsonErrOut.metadata._recovered === true,
    "JSON recovered flag set",
  )
  assert(
    jsonErrOut.metadata._recoveryType === "json",
    "recovery type is json",
  )
  assert(
    jsonErrOut.output.includes('"valid": "json"'),
    "recovered JSON appears in output",
  )
  assert(
    jsonErrOut.output.includes("JSON PARSE ERROR"),
    "recovery hint appended",
  )

  // 7b: Bash JSON error with immediate action
  const bashJsonErr = {
    title: "Error",
    output: 'SyntaxError: Unexpected token in JSON\n{"items": [1,2,3]}',
    metadata: {},
  }
  await hooks["tool.execute.after"](
    { tool: "bash", sessionID: "s-e2", callID: "ec2", args: {} },
    bashJsonErr,
  )
  assert(
    bashJsonErr.output.includes("IMMEDIATE ACTION"),
    "immediate action prompt appended",
  )
  assert(
    bashJsonErr.metadata._immediateAction === true,
    "immediate action flag set",
  )

  // 7c: Task delegate retry (run_in_background)
  const taskErrOut = {
    title: "Task Error",
    output: "Task error: run_in_background is required for subagent dispatch",
    metadata: {},
  }
  await hooks["tool.execute.after"](
    { tool: "task", sessionID: "s-e3", callID: "ec3", args: {} },
    taskErrOut,
  )
  assert(
    taskErrOut.output.includes("HINT"),
    "retry guidance appended to task error",
  )
  assert(
    taskErrOut.output.includes("run_in_background"),
    "guidance references the error",
  )

  // 7d: Apply-patch failure
  const patchErrOut = {
    title: "Patch Error",
    output: "apply_patch failed: hunk failed at line 42",
    metadata: {},
  }
  await hooks["tool.execute.after"](
    { tool: "apply_patch", sessionID: "s-e4", callID: "ec4", args: {} },
    patchErrOut,
  )
  assert(
    patchErrOut.output.includes("PATCH FAILURE"),
    "patch failure guidance appended",
  )
  assert(
    patchErrOut.output.includes("Read tool"),
    "patch guidance mentions reading file",
  )
  assert(
    patchErrOut.metadata._patchGuidance === true,
    "patch guidance flag set",
  )

  // 7e: Post-file-tool nudge
  const readOut = {
    title: "Read",
    output: "File content here...",
    metadata: {},
  }
  await hooks["chat.params"](
    {
      sessionID: "s-e5",
      agent: "lazy",
      model: { providerID: "openai", modelID: "gpt-5" },
      provider: { source: "config", info: {}, options: {} },
      message: {},
    },
    {
      temperature: 0,
      topP: 1,
      topK: 40,
      maxOutputTokens: undefined,
      options: {},
    },
  )
  await hooks["tool.execute.after"](
    { tool: "Read", sessionID: "s-e5", callID: "ec5", args: {} },
    readOut,
  )
  assert(
    readOut.output.includes("plan lanes"),
    "post-file-tool phase reminder appended",
  )
  const subagentReadOut = {
    title: "Read",
    output: "File content here...",
    metadata: {},
  }
  await hooks["chat.params"](
    {
      sessionID: "s-e5-sub",
      agent: "lazy-explorer",
      model: { providerID: "openai", modelID: "gpt-5" },
      provider: { source: "config", info: {}, options: {} },
      message: {},
    },
    {
      temperature: 0,
      topP: 1,
      topK: 40,
      maxOutputTokens: undefined,
      options: {},
    },
  )
  await hooks["tool.execute.after"](
    { tool: "Read", sessionID: "s-e5-sub", callID: "ec5-sub", args: {} },
    subagentReadOut,
  )
  assert(
    !subagentReadOut.output.includes("plan lanes"),
    "post-file-tool phase reminder is lazy-primary only",
  )

  // 7f: Missing subagent_type
  const missingAgentErr = {
    title: "Error",
    output: "Task error: Must provide either category or subagent_type",
    metadata: {},
  }
  await hooks["tool.execute.after"](
    { tool: "task", sessionID: "s-e6", callID: "ec6", args: {} },
    missingAgentErr,
  )
  assert(
    missingAgentErr.output.includes("HINT"),
    "retry guidance for missing subagent_type",
  )
  assert(
    missingAgentErr.output.includes("subagent_type"),
    "guidance mentions subagent_type",
  )

  // 7g: Unknown agent retry
  const unknownAgentErr = {
    title: "Unknown agent",
    output: "Task error: Unknown agent: lazy-explorerx. Allowed agents: lazy-explorer, lazy-fixer",
    metadata: {},
  }
  await hooks["tool.execute.after"](
    { tool: "task", sessionID: "s-e7", callID: "ec7", args: {} },
    unknownAgentErr,
  )
  assert(
    unknownAgentErr.output.includes("HINT"),
    "unknown agent guidance appended",
  )
  assert(
    unknownAgentErr.output.includes("subagent"),
    "guidance mentions subagent",
  )

  // ---------------------------------------------------------------------------
  // Results
  // ---------------------------------------------------------------------------

  if (failed > 0) {
    console.log(`  ${failed} failures — check above`)
  } else {
    console.log("  All tests passed! ✅\n")
  }
})
