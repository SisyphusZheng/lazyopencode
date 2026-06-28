# 5-TODO 自动采集实现计划

## 目标

将 `formatCloseReport` 中的 5 个硬编码 TODO 替换为 session 期间自动采集的真实数据。

## 设计原则

- **零配置**：用户不需要做任何额外操作
- **轻量级**：不增加外部依赖，只利用现有 Hook 系统
- **增量采集**：在 session 生命周期中逐步收集，不是一次性扫描
- **容错**：数据缺失时优雅降级（回退到占位符或略过）

---

## 数据模型扩展

```typescript
// runtime.ts: WorkflowTrace 新增字段
interface WorkflowTrace {
  stage: TraceStage
  lastDecision?: WorkflowDecision
  recentEvents: Array<{ ts: number; type: string; summary: string }>
  // NEW: 关闭报告自动采集数据
  closeReport: {
    behaviorChanges: string[]     // 用户可见的行为变更
    testRuns: Array<{ cmd: string; result: "pass" | "fail" | "unknown" }>
    verificationResult?: "pass" | "fail" | "pending"
    remainingRisks: string[]
    deletions: string[]
  }
}
```

---

## 采集策略（5 个 TODO 对应 5 个采集器）

### 1. `Changed behavior` — 行为变更检测

**采集点**：`tool.execute.after` Hook

**逻辑**：
- 拦截 `Edit`/`Bash` 工具调用
- 检测关键词：`behavior`、`feature`、`UI`、`API`、`endpoint`、`schema` 等
- 检测文件修改：如果修改了 `README.md`、`CHANGELOG.md`、`package.json` 的 `version` 或 `dependencies`，标记为行为变更
- 记录到 `closeReport.behaviorChanges`

**示例输出**：
```
Changed behavior:
- Updated API endpoint /v1/users to return pagination metadata
- Modified package.json version: 0.0.1 → 0.0.2
- Added new CLI flag --verbose to /lazy start
```

### 2. `Tests run` — 测试命令记录

**采集点**：`tool.execute.after` Hook

**逻辑**：
- 拦截 `Bash` 工具调用，匹配测试命令正则：
  - `npm test`, `deno test`, `bun test`, `vitest`, `jest`, `pytest`, `go test`, `cargo test` 等
- 记录命令 + 结果（通过 `output` 中的 `error` 关键字判断）
- 记录到 `closeReport.testRuns`

**示例输出**：
```
Tests run:
- deno test (pass: 5, fail: 0)
- npm run test:unit (pass: 1, fail: 0)
```

### 3. `Verification result` — 验证状态

**采集点**：两个来源

**A. 自动检测**（`tool.execute.after`）
- 如果测试全部通过 → `verificationResult = "pass"`
- 如果有测试失败 → `verificationResult = "fail"`

**B. 显式标记**（`/lazy verify` 命令）
- 用户可以在 session 中发送 `/lazy verify pass` 或 `/lazy verify fail`
- 覆盖自动检测结果

**示例输出**：
```
Verification result: pass (5/5 tests passed)
```

### 4. `Remaining risks` — 剩余风险识别

**采集点**：`messages-transform` Hook + 用户显式声明

**逻辑**：
- **自动检测**：在 assistant 的回复中搜索风险关键词（`risk`, `TODO`, `FIXME`, `warning`, `caution`, `note`, ` caveat`）
- **显式声明**：用户发送 `/lazy risk <description>` 记录风险
- 在 `session.close` 时收集未解决的风险

**示例输出**：
```
Remaining risks:
- Race condition in state file write (not yet addressed)
- Council timeout not configurable per preset
```

### 5. `Simplifications/deletions` — 简化与删除

**采集点**：`tool.execute.after` Hook

**逻辑**：
- 拦截 `Bash`/`Edit` 工具调用
- 检测删除操作：
  - `rm -rf`, `rm`, `git rm`, `delete`, `remove`
  - `Edit` 工具中如果新内容比旧内容少 50% 以上，标记为简化
- 检测 `simplify`/`refactor`/`delete` 关键词在 prompt 中
- 记录到 `closeReport.deletions`

**示例输出**：
```
Simplifications/deletions:
- Deleted 120 lines from background-job-board.ts (removed unused methods)
- Removed deprecated `sessionAgentMap` global singleton
- Simplified `isImagePart` to use type guard instead of `any`
```

---

## 实现步骤

### Step 1: 扩展数据模型（`runtime.ts`）

- 在 `WorkflowTrace` 中添加 `closeReport` 字段
- 在 `createEmptyTrace()` 中初始化默认值
- 在 `save()`/`load()` 中持久化/恢复 `closeReport`

### Step 2: 添加采集 API（`runtime.ts`）

```typescript
recordBehaviorChange(summary: string): void
recordTestRun(cmd: string, result: "pass" | "fail" | "unknown"): void
setVerificationResult(result: "pass" | "fail" | "pending"): void
recordRisk(summary: string): void
recordDeletion(summary: string): void
```

### Step 3: 在 `tool.execute.after` 中集成采集器

修改 `createTaskSessionAfterHook`：
- 在 `tool === "task"` 分支后，添加 `tool === "Bash"` 和 `tool === "Edit"` 的采集逻辑
- 调用 `runtime?.recordBehaviorChange()` / `runtime?.recordTestRun()` 等

### Step 4: 在 `lazy-command.ts` 中添加用户命令

- `/lazy verify pass` / `/lazy verify fail` — 显式标记验证结果
- `/lazy risk <description>` — 显式记录风险
- `/lazy behavior <description>` — 显式记录行为变更

### Step 5: 替换 `formatCloseReport` 中的 TODO

从 `workflow.closeReport` 读取数据，动态生成报告文本。如果数据为空，回退到占位符或略过该行。

---

## 工作量预估

| 步骤 | 文件 | 预估时间 |
|------|------|----------|
| Step 1: 数据模型扩展 | `runtime.ts` | 15 min |
| Step 2: 采集 API | `runtime.ts` | 20 min |
| Step 3: 工具采集器 | `task-session.ts` | 30 min |
| Step 4: 用户命令 | `lazy-command.ts` | 20 min |
| Step 5: 替换 TODO | `runtime.ts` | 15 min |
| 测试补充 | `test/` | 30 min |
| **总计** | | **~2.5h** |

---

## 风险与降级

| 风险 | 降级方案 |
|------|----------|
| 采集误判（把非行为变更标记为行为变更） | 使用关键词白名单，减少误报；用户可用 `/lazy behavior` 覆盖 |
| 测试命令检测不全 | 维护常用测试命令正则列表；用户可用 `/lazy verify` 显式标记 |
| 数据过多导致报告冗长 | 最多显示前 5 条，用 `... and N more` 截断 |
| 持久化数据膨胀 | `closeReport` 只在 session 结束时序列化，日常不影响 |

---

## 是否立即执行？

- **选项 A**：立即执行（预计 2.5h，一次性完成）
- **选项 B**：只做 Step 1-2（数据模型 + API），把采集逻辑留给后续
- **选项 C**：保持当前状态，5 个 TODO 作为已知问题，后续再处理

建议选 **A**，因为：
- 工作量可控（2.5h）
- 显著提升用户体验（关闭报告不再是 TODO 占位符）
- 完全利用现有架构（不增加外部依赖）
- 关闭报告是 LazyOpenCode 的核心卖点之一（Ponytail 的 "review + simplify" 闭环）
