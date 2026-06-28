# LazyOpenCode 深度检查与 OpenCode 全面优化方案

**检查日期**: 2025-06-28  
**SDK 版本**: `@opencode-ai/plugin@1.17.11`  
**目标**: 插件 + Desktop 二开，提供开箱即用的 OpenCode  

---

## 执行摘要

经过对 **全部 24 个源文件** + **OpenCode SDK v1.17.11 类型定义** 的深度对照检查，发现 **4 个架构级缺陷**、**7 个未利用的 SDK 能力**、**6 个 Hook 层问题**、**5 个工具层问题**、**3 个运行时安全问题**。本方案按优先级给出修复路径，核心目标：让 LazyOpenCode 成为 OpenCode 生态中**最深度集成、最健壮、最开箱即用**的治理插件。

---

## 一、架构层：SDK 集成与类型安全

### 🔴 问题 A1：`ctx as any` 类型破坏（`src/index.ts:24`）

```typescript
const runtime = createLazyRuntime(ctx as any)
```

`ctx` 是 `PluginInput`（含 `client`, `project`, `directory`, `worktree`, `serverUrl`, `experimental_workspace`, `$`），但 `createLazyRuntime` 期望的是 `PluginContext`（自定义类型，只含 `project`, `directory`, `worktree`）。

**后果**: `ctx.client` 等字段在 `createLazyRuntime` 中不可访问，但类型系统不报错。任何对 `ctx.serverUrl` 或 `ctx.$` 的后续使用都会在编译时通过，运行时可能崩溃。

**修复**:
```typescript
// 在 runtime.ts 中明确定义接受的上下文类型
export interface PluginContext {
  project?: { root?: string }
  directory?: string
  worktree?: string
}

// 在 index.ts 中做安全提取
const runtime = createLazyRuntime({
  project: ctx.project,
  directory: ctx.directory,
  worktree: ctx.worktree,
})
// 保留 client 等完整上下文供后续使用
```

### 🔴 问题 A2：`RuntimeConfig` 类型扩展可能不兼容 SDK 实际类型（`src/index.ts:10`）

```typescript
interface RuntimeConfig extends Config {
  lazyopencode?: LazyConfig
  skills?: { paths?: string[]; urls?: string[] }
}
```

SDK 的 `Config` 类型为 `Omit<SDKConfig, "plugin"> & { plugin?: Array<string | [string, PluginOptions]> }`。`skills` 字段在 `SDKConfig` 中可能已经存在但类型不同，`lazyopencode` 是自定义扩展。

**后果**: OpenCode 实际传递给 `config` hook 的 `Config` 对象可能与 `RuntimeConfig` 假设的形状不同。如果 SDK 的 `Config` 已包含 `skills` 但类型为 `string[]`（而非 `{ paths: string[] }`），运行时类型冲突。

**修复**:
```typescript
// 使用交叉类型而非 extends，并明确声明未知字段
interface RuntimeConfig extends Config {
  lazyopencode?: LazyConfig
  // skills 已存在于 Config 中，不要重复声明
  // 如果需要修改，使用类型断言时添加安全检查
}
```

### 🟠 问题 A3：全局单例无隔离（`src/hooks/background-job-board.ts:597` + `chat-params.ts:24` + `task-session.ts:18`）

```typescript
export const jobBoard = new BackgroundJobBoard()
export const sessionAgentMap = new Map<string, string>()
export const sessionDepth = new Map<string, number>()
```

三个全局单例在 OpenCode 的**整个进程生命周期**中共享，即使 LazyOpenCode 被卸载或重新加载，状态也不会清除。

**后果**:
- 用户切换项目时，旧项目的 job board 状态残留
- 插件 reload 后，`sessionAgentMap` 中的旧 session 数据污染新会话
- 多窗口/多工作区场景下，不同项目的 session 可能冲突

**修复**:
```typescript
// 所有单例改为 per-runtime 实例，由 createLazyRuntime 持有并注入
export function createLazyRuntime(ctx: PluginContext) {
  const jobBoard = new BackgroundJobBoard()
  const sessionAgentMap = new Map<string, string>()
  const sessionDepth = new Map<string, number>()
  // ... 将这三个实例注入到所有 hooks 中
}
```

### 🟠 问题 A4：缺少 `dispose` hook（SDK 支持，未实现）

SDK v1 `Hooks` 接口包含 `dispose?: () => Promise<void>`，v2 更是通过 `Effect` 提供 dispose 机制。LazyOpenCode 未实现任何清理逻辑。

**后果**: OpenCode 关闭或插件卸载时，临时文件、状态文件、定时器（如 Council 超时）、内存数据结构全部泄漏。

**修复**:
```typescript
// 在 src/hooks/index.ts 中
export function createHooks(runtime?: LazyRuntime) {
  // ... 现有 hooks

  return {
    // ... 现有 hooks
    dispose: async () => {
      // 保存最终状态
      await runtime?.save()
      // 清理临时图片目录
      // 清理 Council 超时定时器
      // 释放全局单例（如果必须保留单例，至少清理当前项目数据）
    },
  }
}
```

### 🟡 问题 A5：v1 API  vs v2 API 选择

SDK v1.17.11 同时支持 v1（函数式 `Plugin`）和 v2（Effect-based `definePlugin`）。v2 提供：
- `AgentDraft`：`list/get/default/update/remove` 结构化 agent 管理
- `CommandDraft`：`list/get/update/remove` 结构化 command 管理
- `dispose` + `reload` 原生生命周期
- `SkillHooks`：更结构化的技能注册

**建议**: 当前 v1 API 足够，但需监控 OpenCode 的演进方向。如果 OpenCode 主推 v2，未来需要做迁移。短期内保留 v1，但将 `dispose` 和 `reload` 能力通过 v1 的 `dispose` hook 和 `config` hook 模拟实现。

---

## 二、Hook 层：未利用的 SDK 能力与执行问题

### 🔴 问题 H1：`tool.execute.before` 执行顺序错误（`src/hooks/index.ts:49`）

```typescript
"tool.execute.before": async (input, output) => {
  await applyPatchRescue(input, output)      // ← 先执行 patch rescue
  await taskSessionBefore(input, output)     // ← 后执行 depth/session 限制
},
```

当子 agent 深度超过 `maxActiveTaskDepth` 时，`taskSessionBefore` 会修改 `output.args` 为拒绝提示。但在此之前，`applyPatchRescue` 已经读取了文件系统（`readFile`）并做了 patch 修正。

**后果**: 即使请求被深度限制拒绝，文件系统 IO 仍然发生，浪费资源。如果文件不存在，还会静默吞异常。

**修复**:
```typescript
"tool.execute.before": async (input, output) => {
  // 1. 先检查资源限制（零成本）
  await taskSessionBefore(input, output)
  // 2. 再执行 patch rescue（需要 IO）
  await applyPatchRescue(input, output)
},
```

### 🔴 问题 H2：`command.execute.before` 处理所有命令（`src/hooks/lazy-command.ts:34`）

```typescript
export function createLazyCommandHandler(runtime: LazyRuntime) {
  return async (input, output) => {
    if (input.command === "deepwork" && ...) { ... }
    if (input.command !== "lazy") return
    // ...
  }
}
```

`command.execute.before` 被调用**每次命令执行**（包括 `/edit`, `/task`, `/bash` 等），但 handler 只处理 `deepwork` 和 `lazy`。虽然函数体快速返回，但每次调用都有一个函数帧和上下文开销。

**修复**: 使用提前返回或 switch 优化，但这不是严重问题。更关键的是：如果用户安装了其他插件也注册 `command.execute.before`，它们的执行顺序取决于 OpenCode 的加载顺序，可能导致冲突。

### 🟠 问题 H3：未利用 `experimental.session.compacting`（SDK 支持）

SDK 提供 `experimental.session.compacting` hook，允许插件在上下文压缩前注入自定义压缩提示。LazyOpenCode 未使用。

**场景**: 当用户会话消息超过限制触发压缩时，OpenCode 会生成一个压缩摘要。如果 LazyOpenCode 的工作流状态（`workflow.stage`, `lastDecision`, `jobBoard` 状态）未被注入到压缩提示中，压缩后的上下文会丢失这些关键状态。

**修复**:
```typescript
"experimental.session.compacting": async (input, output) => {
  const status = runtime?.formatStatus(input.sessionID)
  output.context.push(`[LazyOpenCode State]\n${status}`)
},
```

### 🟠 问题 H4：未利用 `experimental.compaction.autocontinue`（SDK 支持）

SDK 提供 `experimental.compaction.autocontinue` hook，允许插件在压缩后禁用自动的 "continue" 消息。LazyOpenCode 未使用。

**场景**: 如果压缩后 OpenCode 自动发送 "continue"，可能导致 lazy 主 agent 在未收到用户明确输入的情况下推进工作流阶段，破坏治理流程。

**修复**:
```typescript
"experimental.compaction.autocontinue": async (input, output) => {
  // 如果当前处于需要用户确认的 stage（grill/specify），禁用 autocontinue
  if (runtime?.workflow.stage === "grill" || runtime?.workflow.stage === "specify") {
    output.enabled = false
  }
},
```

### 🟠 问题 H5：未利用 `tool.definition`（SDK 支持）

SDK 提供 `tool.definition` hook，允许插件修改发送给 LLM 的工具定义（描述和参数）。LazyOpenCode 未使用。

**场景**: 可以向 lazy 主 agent 隐藏不需要的工具（如 `write` 在 review 阶段），或修改工具描述以注入 lazy 工作流规则。

**修复**（低优先级）:
```typescript
"tool.definition": async (input, output) => {
  // 在 grill 阶段隐藏 build 相关工具
  if (runtime?.workflow.stage === "grill" && input.toolID === "apply_patch") {
    output.description = "[LOCKED: Only available in build stage]"
  }
},
```

### 🟠 问题 H6：`event` hook 缺少事件类型（`src/hooks/session-events.ts`）

SDK 的 `Event` 类型包含 `EventSessionCreated`, `EventSessionDeleted`, `EventSessionIdle`, `EventSessionError`, `EventSessionCompacted`, `EventSessionUpdated` 等。LazyOpenCode 只处理了 `session.idle`, `session.created`, `session.deleted`, `session.error`。

**未处理的重要事件**:
- `session.compacted`: 压缩后需要重新注入 job board 状态（因为 summary 可能丢失）
- `session.updated`: 会话元数据变更时可能需要更新 scope
- `permission.updated/replied`: 可以追踪权限决策历史

**修复**:
```typescript
// 在 session-events.ts 中添加
switch (evt.type) {
  case "session.compacted": {
    // 标记 board 为 dirty，下次消息时重新注入
    runtime?.jobBoard.markDirty?.()
    break
  }
  case "permission.replied": {
    const perm = (evt.properties as any).permission
    runtime?.recordEvent("permission", `${perm.status}: ${perm.title}`)
    break
  }
  // ... 其他事件
}
```

### 🟡 问题 H7：`system.transform` 的 race condition（`src/hooks/system-transform.ts`）

```typescript
const agentName = sessionAgentMap.get(sid)
if (!agentName) return // don't inject until chat.params has run
```

`system.transform` 和 `chat.params` 的调用顺序由 OpenCode 决定，理论上 `chat.params` 先运行，但 SDK 不保证这一点。如果顺序颠倒，`sessionAgentMap` 中没有该 session，lazy 主 agent 的提示不会被注入。

**修复**:
```typescript
// 在 system.transform 中，如果 sessionAgentMap 未命中，注入一个保守的提示
// 同时不依赖 chat.params 的 agent 检测，直接从 system 内容推断
if (!agentName) {
  // 如果系统提示已经包含 lazy 标记，不要注入
  if (output.system.some(s => s.includes("lazy workflow"))) return
  // 否则注入一个轻量级提示（仅 ponytail，不含完整工作流）
  output.system.push(PONYTAIL_MODE)
  return
}
```

---

## 三、工具层：Zod 验证、权限与工具定义

### 🔴 问题 T1：Council 工具未使用 `ask()` 确认（`src/tools/council.ts`）

```typescript
execute: async (args, context) => {
  // 直接执行，无用户确认
  const result = await runCouncil(args.prompt, client, councilConfig, ...)
}
```

SDK 的 `ToolContext` 提供 `ask()` 方法，用于在工具执行前向用户确认。Council 每次调用可能消耗多个模型（成本 $$$），但没有任何确认。

**修复**:
```typescript
execute: async (args, context) => {
  const councilConfig = getCouncilConfig()
  if (!councilConfig.enabled) { ... }
  
  // 在 guarded 模式下，要求用户确认
  if (councilConfig.eligibility === "guarded") {
    await context.ask({
      permission: "Run council session",
      patterns: ["council_session"],
      always: [],
      metadata: { preset: args.preset, councillors: Object.keys(councilConfig.presets[args.preset ?? councilConfig.default_preset] ?? {}).length },
    })
  }
  
  const result = await runCouncil(...)
  // ...
}
```

### 🟠 问题 T2：工具未使用 `abort` 信号（`src/tools/council.ts`）

`ToolContext` 提供 `abort: AbortSignal`，用于响应用户取消操作。Council 的 `runCouncil` 中创建多个子 session 并发起 prompt，但如果用户取消，这些子 session 不会被清理。

**修复**:
```typescript
// 在 runCouncil 的 runOne 函数中
const runOne = async (...) => {
  // 检查 abort 信号
  if (context.abort.aborted) {
    return { name, status: "cancelled", error: "User cancelled" }
  }
  
  let sessionId: string | undefined
  try {
    // 创建 session...
    // 检查 abort 信号
    if (context.abort.aborted) {
      await client.session.delete({ path: { id: sessionId } }).catch(() => {})
      return { name, status: "cancelled", error: "User cancelled" }
    }
    // prompt...
  } finally {
    if (sessionId) { ... }
  }
}
```

### 🟠 问题 T3：工具结果类型不匹配（`src/tools/council.ts`）

SDK 的 `ToolResult` 类型为 `string | { title?: string; output: string; metadata?: Record<string, any>; attachments?: ToolAttachment[] }`。LazyOpenCode 返回的对象：`{ output: string; metadata: { error: true } }`，这是正确的，但返回的 `output` 在错误情况下是 `Council error: ...` 字符串，没有包含 `error` 字段作为结构化数据。

**建议**: 将 `metadata` 中的错误标志也写入 `output` 中，以便上层更容易解析。

### 🟡 问题 T4：Agent 配置缺少 `permission` 字段（`src/agents/index.ts`）

SDK v1.17.11 的 `AgentConfig` 类型已包含 `permission` 字段，支持：
```typescript
permission: {
  edit?: "ask" | "allow" | "deny"
  bash?: "ask" | "allow" | "deny" | { [key: string]: "ask" | "allow" | "deny" }
  webfetch?: "ask" | "allow" | "deny"
  doom_loop?: "ask" | "allow" | "deny"
  external_directory?: "ask" | "allow" | "deny"
}
```

LazyOpenCode 的 agent 配置未使用这些字段。可以为 `lazy-fixer` 设置 `edit: "ask"`（在 review 阶段前），为 `lazy-librarian` 设置 `webfetch: "ask"` 等。

**修复**（低优先级）:
```typescript
"lazy-fixer": {
  prompt: FIXER_PROMPT,
  mode: "subagent",
  permission: { edit: "ask", bash: "ask" },
},
```

### 🟡 问题 T5：Zod 4 类型兼容性

SDK 使用 `zod@4.1.8`，LazyOpenCode 的 `package.json` 没有直接依赖 zod，而是通过 `@opencode-ai/plugin` 间接使用。`tool.schema` 使用的是 SDK 的 Zod 实例。如果未来 SDK 升级 Zod 大版本，类型可能不兼容。

**建议**: 显式添加 `zod` 为 `peerDependency`，确保版本兼容性。

---

## 四、运行时层：内存、性能、安全

### 🔴 问题 R1：`process.cwd()` 硬编码（`src/hooks/messages-transform.ts:281`）

```typescript
await processImageAttachments(msgs, process.cwd())
```

`process.cwd()` 不一定是当前项目目录。OpenCode 的 `PluginInput` 提供 `directory` 和 `worktree`，应该使用这些。

**修复**:
```typescript
// 在 createMessagesTransformHook 中接受 projectDirectory 参数
export function createMessagesTransformHook(runtime?: LazyRuntime, projectDir?: string) {
  return async (...) => {
    const workdir = projectDir ?? process.cwd()
    await processImageAttachments(msgs, workdir)
  }
}
```

### 🟠 问题 R2：`atob` 非 ASCII 字符问题（`src/hooks/messages-transform.ts:201`）

```typescript
const data = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0))
```

`atob` 将 base64 解码为 ASCII 字符串，但图片 base64 数据在解码后应直接作为二进制 buffer。`atob` 对非 ASCII 字符的处理不可靠（可能产生乱码），且 `c.charCodeAt(0)` 只返回 0-255 范围内的值，但 `atob` 的返回值可能是多字节字符。

**修复**:
```typescript
const data = Buffer.from(match[2], "base64")
```

### 🟠 问题 R3：内存泄漏 - `sessionAgentMap` 永不清理（`src/hooks/chat-params.ts:24`）

```typescript
export const sessionAgentMap = new Map<string, string>()
```

只在 `session.deleted` 事件中清理，但如果事件未触发（崩溃、强制退出），Map 持续增长。长期运行的 OpenCode 实例中，这会导致内存泄漏。

**修复**:
```typescript
// 在 session-events.ts 的 cleanup 中添加 TTL 清理
// 或者定期清理旧 session
function cleanupStaleSessions(maxAgeMs: number = 24 * 60 * 60 * 1000) {
  const now = Date.now()
  for (const [sid, agent] of sessionAgentMap) {
    // 需要追踪 lastAccessed，这里简单清理
  }
}
// 更彻底的方案：使用 WeakMap 或 per-runtime 实例
```

### 🟠 问题 R4：内存泄漏 - `workflow.recentEvents` 无限增长（`src/hooks/runtime.ts`）

```typescript
workflow.recentEvents = workflow.recentEvents.slice(-50)
```

虽然 `slice(-50)` 限制了数组长度，但每个事件包含 `ts: number` 和 `summary: string`。如果 `summary` 很长，内存占用仍然可观。

**修复**: 限制 summary 长度：
```typescript
recordEvent(type, summary) {
  const truncated = summary.length > 200 ? summary.slice(0, 200) + "..." : summary
  workflow.recentEvents.push({ ts: Date.now(), type, summary: truncated })
  workflow.recentEvents = workflow.recentEvents.slice(-50)
}
```

### 🟠 问题 R5：错误处理静默吞异常（多处）

```typescript
// runtime.ts:load
} catch {
  recoveryMessage = "State file was corrupt and ignored."
  // 没有记录原始错误
}

// background-job-board.ts:registerLaunch
} catch {
  // silent fail
}
```

多处使用 `catch { /* ok */ }` 或裸 `catch`，丢失了错误上下文。在生产环境中调试时极其困难。

**修复**:
```typescript
} catch (err) {
  const errorMsg = err instanceof Error ? err.message : String(err)
  console.error(`[LazyOpenCode] ${context}: ${errorMsg}`)
  // 或写入日志文件
}
```

### 🟡 问题 R6：状态文件竞态条件（`src/hooks/runtime.ts`）

```typescript
const save = async () => {
  const path = getStatePath()
  if (!path) return
  const state: PersistedState = { ... }
  const dir = dirname(path)
  await mkdir(dir, { recursive: true })
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`)
}
```

如果多个 OpenCode 实例同时运行（罕见但可能），或同一实例快速调用 `save()` 多次，文件写入可能交错，导致状态文件损坏。

**修复**:
```typescript
// 使用简单的写入锁
let savePromise: Promise<void> | null = null

const save = async (): Promise<void> => {
  if (savePromise) return savePromise
  savePromise = (async () => {
    try {
      // ... 写入逻辑
    } finally {
      savePromise = null
    }
  })()
  return savePromise
}
```

---

## 五、Desktop 分发优化

### D1: Desktop 架构决策

当前 `apps/lazyopencode-desktop/` 只有 JSON 配置文件和 README。实现 Desktop 分发有两个技术路线：

**路线 A：Wrapper Launcher（推荐）**
- 创建独立的 launcher 应用（Electron/Tauri）
- 检查系统是否已安装 OpenCode Desktop
- 如果已安装：启动 OpenCode Desktop 并注入 LazyOpenCode 配置
- 如果未安装：提示用户安装或内嵌 OpenCode CLI

**优点**: 不依赖 OpenCode Desktop 的更新，维护成本低  
**缺点**: 不是真正的"预装"，需要运行时注入

**路线 B：Fork + Patch**
- Fork OpenCode Desktop 源码
- 在构建时将 `@lazyopencode/core` 预装到内置插件目录
- 修改首次启动配置生成逻辑，自动包含 LazyOpenCode 默认配置
- 保持与上游的定期同步

**优点**: 真正的开箱即用，用户感知是"一个应用"  
**缺点**: 需要维护 fork，上游更新时合并成本

**建议**: 先实现路线 A（3-5 天工作量），验证市场需求后再考虑路线 B。

### D2: 首次启动 Onboarding

Desktop 启动时应：
1. 检测用户 `~/.config/opencode/opencode.json` 是否存在
2. 如果不存在：生成包含 LazyOpenCode 的默认配置
3. 如果存在但无 LazyOpenCode：弹出对话框询问是否添加
4. 如果存在且已有：检查版本，提示更新

### D3: 自动更新机制

- 插件通过 npm 版本管理（`@lazyopencode/core@latest`）
- Desktop launcher 通过 GitHub releases 检查更新
- 用户点击更新时，自动下载最新插件并重启 OpenCode

---

## 六、实施路线图

### Phase 1：紧急修复（本周完成）

| 任务 | 文件 | 工作量 |
|------|------|--------|
| 修复 `ctx as any` 类型安全 | `src/index.ts`, `src/hooks/runtime.ts` | 1h |
| 修复 `tool.execute.before` 执行顺序 | `src/hooks/index.ts` | 30m |
| 将全局单例改为 per-runtime | `src/hooks/runtime.ts`, `background-job-board.ts`, `chat-params.ts`, `task-session.ts` | 4h |
| 实现 `dispose` hook | `src/hooks/index.ts` | 1h |
| 修复 `process.cwd()` 硬编码 | `src/hooks/messages-transform.ts` | 30m |
| 修复 `atob` → `Buffer.from` | `src/hooks/messages-transform.ts` | 15m |
| 添加错误日志 | `runtime.ts`, `messages-transform.ts`, `background-job-board.ts` | 1h |
| 状态文件写入锁 | `src/hooks/runtime.ts` | 30m |

### Phase 2：深度集成（下周完成）

| 任务 | 文件 | 工作量 |
|------|------|--------|
| 实现 `experimental.session.compacting` | `src/hooks/index.ts` | 2h |
| 实现 `experimental.compaction.autocontinue` | `src/hooks/index.ts` | 1h |
| 扩展 `event` hook 处理更多事件 | `src/hooks/session-events.ts` | 2h |
| 修复 `system.transform` race condition | `src/hooks/system-transform.ts` | 1h |
| Council 工具添加 `ask()` 确认 | `src/tools/council.ts` | 1h |
| Council 工具支持 `abort` 信号 | `src/tools/council.ts`, `src/council/council-manager.ts` | 2h |
| 内存泄漏修复（sessionAgentMap TTL, recentEvents summary 截断） | `src/hooks/runtime.ts`, `chat-params.ts` | 1h |

### Phase 3：Desktop 分发（2-3 周）

| 任务 | 说明 | 工作量 |
|------|------|--------|
| 调研 OpenCode Desktop 构建方式 | 确定 Electron/Tauri 架构 | 1d |
| 实现 Wrapper Launcher | 独立的 Electron 应用 | 3-5d |
| 首次启动 Onboarding | 配置检测和自动合并 | 1-2d |
| 跨平台打包（Windows/macOS/Linux） | GitHub Actions CI | 2-3d |
| 自动更新机制 | GitHub releases 检查 | 1-2d |

### Phase 4：长期优化

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 添加 `tool.definition` hook | 按 stage 动态隐藏/修改工具 | 低 |
| 为 agent 添加 `permission` 字段 | 细粒度工具权限控制 | 低 |
| 监控 v2 API 演进 | 评估迁移必要性 | 低 |
| 添加基准测试 | 量化治理效果 | 中 |

---

## 七、问题清单总表

| 编号 | 层级 | 问题 | 严重性 | 状态 |
|------|------|------|--------|------|
| A1 | 架构 | `ctx as any` 类型破坏 | 🔴 | 未修复 |
| A2 | 架构 | `RuntimeConfig` 类型扩展可能不兼容 | 🔴 | 未修复 |
| A3 | 架构 | 全局单例无隔离 | 🔴 | 未修复 |
| A4 | 架构 | 缺少 `dispose` hook | 🔴 | 未修复 |
| A5 | 架构 | v1 API vs v2 API 选择 | 🟡 | 观察中 |
| H1 | Hook | `tool.execute.before` 执行顺序错误 | 🔴 | 未修复 |
| H2 | Hook | `command.execute.before` 处理所有命令 | 🟡 | 低优先级 |
| H3 | Hook | 未利用 `experimental.session.compacting` | 🟠 | 未修复 |
| H4 | Hook | 未利用 `experimental.compaction.autocontinue` | 🟠 | 未修复 |
| H5 | Hook | 未利用 `tool.definition` | 🟠 | 未修复 |
| H6 | Hook | `event` hook 缺少事件类型 | 🟠 | 未修复 |
| H7 | Hook | `system.transform` race condition | 🟠 | 未修复 |
| T1 | 工具 | Council 未使用 `ask()` 确认 | 🔴 | 未修复 |
| T2 | 工具 | 未使用 `abort` 信号 | 🟠 | 未修复 |
| T3 | 工具 | 工具结果类型不匹配 | 🟡 | 未修复 |
| T4 | 工具 | Agent 缺少 `permission` 字段 | 🟡 | 未修复 |
| T5 | 工具 | Zod 版本依赖 | 🟡 | 未修复 |
| R1 | 运行时 | `process.cwd()` 硬编码 | 🔴 | 未修复 |
| R2 | 运行时 | `atob` 非 ASCII 问题 | 🟠 | 未修复 |
| R3 | 运行时 | `sessionAgentMap` 内存泄漏 | 🟠 | 未修复 |
| R4 | 运行时 | `recentEvents` 无限增长 | 🟠 | 未修复 |
| R5 | 运行时 | 错误处理静默吞异常 | 🟠 | 未修复 |
| R6 | 运行时 | 状态文件竞态条件 | 🟡 | 未修复 |
| D1 | Desktop | 架构决策（Wrapper vs Fork） | 🟠 | 待决策 |
| D2 | Desktop | 首次启动 Onboarding | 🟠 | 未实现 |
| D3 | Desktop | 自动更新机制 | 🟡 | 未实现 |

---

## 八、验证检查清单

修复完成后，需要验证以下场景：

1. **类型安全**: `npm run check` 零错误
2. **单例隔离**: 两个不同项目同时运行 OpenCode，各自的 job board 状态不干扰
3. **dispose**: 关闭 OpenCode 后，临时目录被清理，状态文件已保存
4. **hook 顺序**: `tool.execute.before` 中深度限制先于 patch rescue 执行
5. **compacting**: 压缩后 LazyOpenCode 状态不丢失
6. **Council 确认**: guarded 模式下触发 Council 时弹出确认对话框
7. **abort 信号**: 用户取消时 Council 子 session 被清理
8. **跨平台**: Windows 上路径处理正确，状态文件写入成功
9. **错误日志**: 模拟 state 文件损坏，控制台出现错误日志
10. **并发安全**: 快速连续调用两次 `/lazy reset`，状态文件不损坏
