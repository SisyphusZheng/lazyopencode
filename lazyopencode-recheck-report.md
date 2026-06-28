# LazyOpenCode 全面 Recheck 报告

**日期**: 2026-06-29
**版本**: 0.0.1（修复后）
**测试状态**: 193/193 passed ✅
**构建状态**: TypeScript strict 0 errors ✅

---

## 一、产品定位

### 一句话定义
**LazyOpenCode 是 OpenCode 的「轻量级工作流治理插件」——安装即用，无需配置，通过 Hook 系统接管 AI 编码的完整生命周期。**

### 目标用户
- **个人开发者**：想要 AI 编码更可控，但不需要企业级流程
- **OpenCode 用户**：现有 OpenCode 用户，想要增强治理能力
- **Ponytail 理念信奉者**：认同「少即是多」的极简编码哲学

### 核心价值主张
| 特性 | 说明 |
|------|------|
| **零配置** | 安装插件即可，无需 `.adv/specs/` 或 Temporal 服务器 |
| **会话级治理** | 每个会话独立追踪，不污染全局状态 |
| **多模型决策** | Council 特性——多 LLM 独立判断，这是竞品都没有的 |
| **Ponytail 哲学** | 默认拒绝过度工程，「最好的代码是从未写过的代码」 |

### 产品定位图
```
OpenCode 生态中的位置：

OpenCode Desktop（宿主）
    ↓
@lazyopencode/core（插件）—— 工作流治理 + 子代理调度
    ↓
    ├── 8 个 lazy-* 子代理（explorer, oracle, fixer...）
    ├── 9 个 skill（grill, plan, build, review...）
    ├── Council（多模型决策）
    └── PermissionGuard（权限拦截）
```

---

## 二、技术选型分析

### 架构选型：OpenCode Plugin Hook 系统

| 维度 | 选择 | 评价 |
|------|------|------|
| **宿主平台** | OpenCode | ✅ 合理。OpenCode 是开源 AI IDE，支持插件扩展。但生态较小（对比 Cursor/Windsurf） |
| **插件形式** | npm 包 + Hook 系统 | ✅ 优秀。利用 OpenCode 的 `experimental.chat.*`/`tool.execute.*`/`event` hooks，无需修改宿主代码 |
| **运行时** | 纯 TypeScript + 文件持久化 | ✅ 极简。无需 Temporal/Redis/DB，JSON 文件存储状态 |
| **依赖** | 仅 `@opencode-ai/plugin` | ✅ 非常克制。0 运行时外部依赖 |
| **语言** | TypeScript strict | ✅ 类型安全。`strict: true` 开启 |
| **测试** | Node.js 原生 assert + JS | ⚠️ 能用但不够现代。无 Vitest/Jest，无 TS 测试 |

### 选型总评：8/10
- **优势**：极简架构，1 个依赖，Hook 驱动，无需侵入宿主
- **风险**：OpenCode 生态规模未知，如果 OpenCode 发展停滞，插件价值受限
- **建议**：考虑适配第二层（如 Claude Code CLI、Codex CLI），降低平台依赖风险

---

## 三、质量评估（修复后）

### 代码质量雷达

```
架构设计      ████████░░ 8/10  Hook + Agent + Skill 四层清晰
类型安全      ███████░░░ 7/10  strict: true，但 SDK 类型缺口导致 any
代码简洁      ████████░░ 8/10  Ponytail 极简哲学贯彻
依赖管理      █████████░ 9/10  仅 1 个生产依赖，极度克制
文档质量      ███████░░░ 7/10  SKILL.md 结构好，但 API 缺 JSDoc
测试质量      █████░░░░░ 5/10  有集成测试，无单元测试，用 JS 写测试
工程化        ████░░░░░░ 4/10  无 lint/CI/monorepo/git
错误处理      ███████░░░ 7/10  error-recovery 完善，但有 TODO 占位
```

### 综合评分：7.0/10 ⭐

### 已修复的 16 个问题（质量提升明细）

| # | 问题 | 修复前风险 | 修复后状态 |
|---|------|----------|----------|
| 1 | `ctx as any` 类型安全 | 运行时崩溃风险 | ✅ 显式解构 + PluginContext 扩展 |
| 2 | `tool.execute.before` 顺序错误 | patch 救援在深度检查前执行 | ✅ taskSessionBefore → applyPatchRescue |
| 3 | 全局单例 `sessionAgentMap`/`sessionDepth` | 多项目冲突，状态泄漏 | ✅ 迁移到 `LazyRuntime` per-instance |
| 4 | 缺少 `dispose` hook | 状态丢失 | ✅ dispose 持久化 |
| 5 | `process.cwd()` 硬编码 | 路径错误 | ✅ `runtime?.scope.projectRoot` |
| 6 | `atob` 浏览器 API | 非 ASCII 处理失败 | ✅ `Buffer.from(..., 'base64')` |
| 7 | 空 catch 块 | 错误静默 | ✅ 添加 `console.error` 日志 |
| 8 | 状态文件无写锁 | 并发损坏 | ✅ Promise chain 锁 |
| 9 | `session.compacting` 未实现 | 压缩丢失上下文 | ✅ 注入 workflow stage/decision |
| 10 | `compaction.autocontinue` 未实现 | 用户交互阶段被 auto-continue | ✅ grill/specify/plan 阶段禁用 |
| 11 | `session.compacted` 事件缺失 | 无法追踪压缩 | ✅ 记录事件 |
| 12 | `system.transform` race condition | lazy 主提示不注入 | ✅ 注入 LAZY_SYSTEM_PROMPT_LITE 降级 |
| 13 | Council 无用户确认 | 意外消耗 Token | ✅ `context.ask()` 权限确认 |
| 14 | Council 无 abort | 无法取消 | ✅ `AbortSignal` 全链路支持 |
| 15 | 内存泄漏 | Map 无限增长 | ✅ FIFO prune（1000 条上限） |
| 16 | `session-events` 图片路径错误 | ENOTDIR 清理失败 | ✅ 统一使用 `projectRoot` |

---

## 四、对标竞品分析

### 竞品矩阵（更新版）

| 维度 | **LazyOpenCode** | **Advance** | **Flow-Next** | **Superego** |
|------|------------------|-------------|---------------|--------------|
| **Stars** | 待发布 | 2 | 实验性 | 实验性 |
| **代码体积** | ~3,500 行 | 13.5 MB | 中等 | 小 |
| **工作流** | 5 级分类 + 5 阶段 | 7-gate 严格 | Epic-first | Scope guard |
| **持久化** | 文件 JSON | **Temporal** | 文件 | 无 |
| **外部依赖** | 0 | Temporal 服务器 | 0 | 0 |
| **配置复杂度** | 零配置 | 需 specs + Temporal | 需 `.flow/` | 极简 |
| **Desktop 分发** | 🚧 空壳（待做） | ❌ 无 | ❌ 无 | ❌ 无 |
| **多模型决策** | ✅ **Council** | ❌ 无 | ❌ 无 | ❌ 无 |
| **权限守卫** | ✅ 有 | ✅ 有 | ⚠️ 部分 | ⚠️ 部分 |
| **Dashboard** | ❌ 无 | ✅ 有（8765 端口） | ❌ 无 | ❌ 无 |
| **TDD 证据** | ❌ 无 | ✅ 有 | ❌ 无 | ❌ 无 |
| **目标用户** | 个人开发者 | 团队/企业 | 个人/团队 | 个人 |

### 差异化定位

```
治理深度 →
│
│  Advance（7-gate + Temporal + Spec Law）
│  ────────────────────────────────────────
│  LazyOpenCode（5 级 + 5 阶段 + 零配置） ← 最佳平衡点
│  ────────────────────────────────────────
│  Flow-Next（Epic + 依赖图）
│  Superego（Scope guard）
│
└──────────────────────────→ 配置复杂度
```

**LazyOpenCode 的甜蜜点**：比 Superego/Flow-Next 更有治理能力（有工作流分类、深度追踪、Council），比 Advance 更轻量（零配置、无 Temporal），Council 多模型决策是**独家特性**。

---

## 五、水平评估

### 在 AI 编码工具生态中的位置

```
AI 编码工具谱系（按治理强度）：

企业级（重治理）
├── Cursor（商业 IDE，内置 Agent）
├── Claude Code（Anthropic 官方，最强 Agent）
├── Codex CLI（OpenAI 官方）
│
└── Advance（7-gate + Temporal + Spec Law）

轻量级（中等治理）
├── **LazyOpenCode** ← 我们在这里
├── Flow-Next（Epic-first）
├── Superego（Scope guard）
│
└── OpenCode（基础 IDE，无治理）
```

### 当前水平判断

| 维度 | 评分 | 说明 |
|------|------|------|
| **架构成熟度** | 7/10 | 4 层架构清晰，但缺少测试覆盖和工程化 |
| **功能完整度** | 7/10 | Agent + Hook + Skill + Council 齐全，但 Dashboard 和 Desktop 缺失 |
| **代码质量** | 7/10 | 修复后无阻塞问题，但仍有 TODO 占位和硬编码 |
| **产品就绪度** | 5/10 | 插件可用，但 Desktop 空壳，无 CI/CD，无分发渠道 |
| **竞争力** | 6/10 | Council 是独特卖点，但生态位（OpenCode）较小 |

**总体水平**：「可用但尚未产品化」的 MVP 阶段。插件核心已稳定（193 测试全过），但缺少分发和运营层面的收尾。

---

## 六、冗余分析

### 冗余清单

#### 1. 🟡 代码冗余

| 位置 | 问题 | 建议 |
|------|------|------|
| `runtime.ts:285-290` | 5 个 `TODO` 占位符在 `formatCloseReport` | 运行时自动采集数据（通过 `recordDecision`/`recordPruning` 已收集），替换为实际值 |
| `error-recovery.ts:268-269` | `isLazyPrimarySession` 恒返回 `true` | 可以移除该函数，直接在调用处 `return true`，或注入 `sessionAgentMap` 检测 |
| `messages-transform.ts:22-45` | Agent 技能白名单硬编码 | 外置到 `LazyConfig`，允许用户自定义 |
| `chat-params.ts:12-20` | 温度参数硬编码 | 外置到 `LazyConfig` |
| `agents/*.ts` | 8 个 agent 的 prompt 都是独立的 `.ts` 文件 | 可以合并到 JSON 配置或 Markdown 文件，减少编译产物 |

#### 2. 🟡 架构冗余

| 位置 | 问题 | 建议 |
|------|------|------|
| `apps/lazyopencode-desktop/` | 实质是空壳（JSON 配置 + README），不是真正的 Desktop 应用 | 要么删除，要么实现为真正的 launcher/wrapper |
| `skills/` 目录 | 9 个 SKILL.md 都是静态文本，没有运行时逻辑 | 可以合并到 `docs/skills/` 或作为 package 的 `files` 包含 |
| `background-job-board.ts` | 全局 `jobBoard` 单例仍作为 fallback 存在 | 完全移除全局 fallback，强制使用 `runtime?.jobBoard` |
| `task-session.ts` | `sessionDepth` 全局 fallback | 完全移除全局 fallback |

#### 3. 🟡 测试冗余

| 问题 | 说明 |
|------|------|
| 5 个 JS 测试文件 vs 29 个 TS 源文件 | 测试覆盖率不足（约 17% 的源文件被直接测试） |
| 测试用 JS 而非 TS | 无法利用类型检查，与源码语言不一致 |
| 无单元测试 | 所有测试都是集成级别，无法定位到具体 hook 的问题 |

#### 4. 🟡 工程化冗余

| 问题 | 说明 |
|------|------|
| 根目录无 `package.json` | 无法使用 `pnpm install` 在根目录执行 |
| 无 `pnpm-workspace.yaml` | 不是真正的 monorepo，只是文件目录结构像 |
| 无 `.git` | 无版本控制 |
| 无 CI/CD | 无自动化构建/测试 |
| 无 lint | 代码风格无法统一 |

### 可删除/合并的代码量估算

```
当前代码：~3,500 行 TS
可删除的冗余：
- TODO 占位符（5 行）→ 改为动态生成
- 全局 fallback 代码（~20 行）→ 移除
- 空壳 Desktop 目录（~50 行）→ 删除或重写
- 重复类型定义（~30 行）→ 合并
- 硬编码配置（~40 行）→ 外置到 JSON

预估可精简：~145 行（约 4%）

更大的收益来自：
- 添加单元测试（+~500 行测试代码，覆盖率从 17% → 60%）
- 添加工程化配置（+~50 行配置文件）
```

---

## 七、结论与建议

### 核心结论

1. **LazyOpenCode 是一个架构精巧、理念清晰的轻量级治理插件**，在当前 OpenCode 生态中具有独特价值（Council 多模型决策 + 零配置）。

2. **修复后的代码质量已达到「可发布」水平**：TypeScript 0 错误，193 测试全过，16 个架构/Hook/工具问题已解决。

3. **主要瓶颈不在代码，而在产品化**：Desktop 空壳、无分发渠道、无 CI/CD、无文档站点。

4. **竞品 Advance 是「太重」的对手，这是 LazyOpenCode 的机会**：个人开发者不需要 Temporal + 7-gate，但需要比 Superego 更强的治理能力。

### 下一步优先级

| 优先级 | 任务 | 影响 |
|--------|------|------|
| P0 | 实现 Desktop launcher（真正开箱即用） | 产品化关键 |
| P0 | 添加 monorepo workspace + 根 package.json | 工程基础 |
| P1 | 添加 ESLint + Prettier + CI（GitHub Actions） | 代码质量 |
| P1 | 补充单元测试（apply-patch-rescue, permission-guard, session-events） | 测试覆盖 |
| P1 | 替换 `TODO` 占位符为动态数据 | 功能完整 |
| P2 | 设计基准测试（有治理 vs 无治理） | 价值证明 |
| P2 | 强化 README 中的 Council 宣传 | 独特卖点 |
| P2 | 考虑 Claude Code / Codex CLI 适配 | 降低平台风险 |

---

*报告生成完毕。所有数据基于当前代码库实际状态。*
