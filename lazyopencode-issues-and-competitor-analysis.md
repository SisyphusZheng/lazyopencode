# LazyOpenCode 问题清单与竞品分析

**目标**: OpenCode 插件 + Desktop 二开，提供开箱即用的 OpenCode 体验
**日期**: 2025-06-28

---

## 一、竞品情报：Advance（直接对标）

### 核心数据

| 指标 | 数值 | 解读 |
|------|------|------|
| **GitHub Stars** | **2** | 极早期项目，社区几乎为零 |
| **创建时间** | 2026-01-22 | 约 5 个月开发历史 |
| **最后更新** | 2026-06-27 | 开发极其活跃（几乎每日更新） |
| **Open Issues** | 38 | 功能密集但稳定性问题多 |
| **代码体积** | 13.5 MB | 大型项目，功能极其丰富 |
| **License** | Other（非标准） | 商业友好度待确认 |
| **默认分支** | `trunk` | 非 `main`，需注意 |

### Advance 的技术栈（极其复杂）

| 层级 | 技术 | 说明 |
|------|------|------|
| Host | OpenCode plugin | 同 LazyOpenCode |
| Runtime | Bun host + Node worker | 比 LazyOpenCode 复杂 |
| 持久化 | **Temporal workflows** | 需要部署 Temporal 服务器 |
| 验证 | Zod v4 schemas | 结构化工具输入验证 |
| 工具 API | MCP-style ADV tools | 自定义工具协议 |
| 合约 | `.adv/specs/` | 项目目录内 spec 文件 |
| 工作流 | 7-gate delivery | proposal → discovery → design → planning → execution → acceptance → release |
| Dashboard | 本地 web 服务 | `bin/adv dashboard` 运行在 8765 端口 |
| CI | GitHub Actions | Node 20.x + 22.x |
| 安装 | `curl ... install.sh \| bash` | 发布为 Release 包 |

### Advance 的 7-gate 工作流（极其严格）

```
/adv-proposal → 定义问题、用户结果、约束
/adv-discover → 收集证据、对齐目标、接受标准
/adv-design   → 验证架构、实现策略
/adv-prep     → 任务图、关闭缺口
/adv-apply    → 自主实现 + TDD 证据 + checkpoint
/adv-review   → 验证交付物 vs 合约
/adv-harden   → 生产就绪 + 质量通过
/adv-archive  → 归档、推广 wisdom
```

每个 gate 都有合约、人类审批点、证据要求。

### Advance 的优缺点

**优点**：
- 极其完整的治理体系（spec law + 7 gates + Temporal + TDD 证据）
- 有 Dashboard 本地服务
- 有 checkpoint 提交机制
- 有 CI 外部一致性验证
- 有 wisdom 积累机制

**缺点**：
- **太重了**：需要部署 Temporal 服务器，个人开发者无法承受
- **门槛太高**：7-gate 流程对小型项目过度工程
- **社区极小**：2 个 star，38 个 open issues，稳定性堪忧
- **License 非标准**：商业使用风险
- **ACP 功能暂停**：upstream OpenCode ACP 问题未解决
- **Desktop 缺失**：无开箱即用分发

---

## 二、全部问题清单（按优先级）

### 🔴 阻碍发布（已修复）

| # | 问题 | 文件 | 严重性 | 修复状态 |
|---|------|------|--------|--------|
| 1 | **技能路径 Bug**：`getSkillsDir()` 使用 `URL.pathname`，在 `dist/` 环境下指向不存在的 `dist/skills/lazy/` | `src/skills/index.ts` | 发布即崩溃 | ✅ 已修复（改用 `fileURLToPath` + `join`） |
| 2 | **Windows 目录提取**：`path.substring(0, path.lastIndexOf("/"))` 在 Windows 路径中失效 | `src/hooks/runtime.ts` | Windows 无法持久化 | ✅ 已修复（改用 `dirname(path)`） |
| 3 | **Windows 默认路径**：`process.env.HOME ?? "/tmp"` 在 Windows 上不存在 | `src/hooks/runtime.ts` | Windows 默认配置崩溃 | ✅ 已修复（改用 `homedir() \| tmpdir()`） |
| 4 | **JSONC 逗号缺失**：`commands` 块后无逗号，用户取消注释 Council 时语法错误 | `.opencode/opencode.jsonc` | 用户配置错误 | ✅ 已修复（已补逗号） |

### 🟡 已修复但需持续观察

| # | 问题 | 文件 | 说明 |
|---|------|------|------|
| 5 | **权限守卫误报**：`secret`/`token` 匹配 `secrets` 目录、`tokenize` 等无害词 | `src/hooks/permission-guard.ts` | ✅ 已收紧正则（需搭配动词） |
| 6 | **`detectWorkflowSkip` 死代码**：`!runtime` 条件永不为真 | `src/hooks/messages-transform.ts` | ✅ 已整合到主逻辑 |

### 🟠 产品层面问题（未修复）

| # | 问题 | 影响 | 建议修复方案 |
|---|------|------|------------|
| 7 | **缺少基准测试**：无 "有治理 vs 无治理" 的量化对比数据 | 无法向用户证明价值 | 设计 10 个典型任务，对比代码行数、Token 消耗、错误率 |
| 8 | **Desktop 仍是空壳**：`apps/lazyopencode-desktop/` 只有 JSON 配置和 README | 无法提供"开箱即用"体验 | fork OpenCode Desktop 或做 launcher wrapper |
| 9 | **无 monorepo 管理**：根目录无 `package.json`/`pnpm-workspace.yaml` | 跨包管理困难，无法统一构建 | 添加 `pnpm-workspace.yaml` + 根 `package.json` |
| 10 | **缺少代码规范**：无 ESLint/Prettier/`.editorconfig` | 代码风格不一致，维护困难 | 添加 `@antfu/eslint-config` 或类似配置 |
| 11 | **缺少 `CHANGELOG.md`** | 用户无法追踪版本变化 | 维护变更日志 |
| 12 | **JSDoc 覆盖率低**：公开 API 无类型文档 | 插件开发者体验差 | 为 `LazyRuntime` 接口和主要函数添加 JSDoc |
| 13 | **`.opencode.ignore` 缺 `.opencode/`** | 可能暴露敏感配置 | 添加 `.opencode/` 到忽略列表 |
| 14 | **系统提示防重检查 fragile**：`startsWith(LAZY_SYSTEM_PROMPT.slice(0, 30))` 可能误触发 | 极端情况下提示注入失败 | 使用完整字符串匹配或唯一 sentinel |
| 15 | **`atob` 用于 base64 解码**：非 ASCII 字符处理不可靠 | 图片附件处理有隐患 | 改用 `Buffer.from(..., "base64")` |

### 🟢 测试缺失（未修复）

| # | 测试缺失 | 影响 |
|---|----------|------|
| 16 | `apply-patch-rescue.ts` 无单元测试 | hunk 偏移修正逻辑无法验证 |
| 17 | `session-events.ts` 无独立测试 | session 生命周期清理仅通过 smoke 间接覆盖 |
| 18 | `deepwork.ts` 无独立测试 | deepwork 激活逻辑未验证 |
| 19 | `permission-guard.ts` 中文/英文正则边界测试未覆盖 | 权限守卫的误报/漏报无法量化 |
| 20 | 无跨平台测试（Windows/macOS） | 路径相关问题可能在 Windows 上复发 |

### 🔵 战略层问题（需决策）

| # | 问题 | 说明 | 建议 |
|---|------|------|------|
| 21 | **Advance 是"太重"的竞品，但功能极其完整** | Advance 覆盖了 Spec Law、7-gates、Temporal、Dashboard、TDD 证据等全部维度 | LazyOpenCode 的差异化是**轻量级**——零配置、无外部依赖、会话级治理 |
| 22 | **OpenCode 生态本身很小** | 对比 Cursor/Claude Code/Codex，OpenCode 用户基数有限 | 这是风险也是机会——生态早期进入者可以定义标准 |
| 23 | **Desktop 二开需要 fork OpenCode Desktop** | OpenCode Desktop 是上游项目，需要决定是 fork 还是 wrapper | 短期：wrapper launcher；长期：轻量 fork 保持上游同步 |
| 24 | **无商业模型** | 当前 MIT License，无收费计划 | 如果需要商业化，考虑：Desktop 分发收费、企业版治理仪表板、SaaS 托管 |
| 25 | **Council 多模型决策是杀手特性，但未宣传** | 竞品 Advance/Flow-Next/Superego 均无多模型 Council | 在 README 和文档中强化此特性 |

---

## 三、针对"插件+Desktop 二开"目标的行动路线图

### Phase 1：稳固插件（已完成 + 短期）

| 任务 | 优先级 | 状态 |
|------|--------|------|
| 修复所有 🔴 路径/Windows Bug | P0 | ✅ 完成 |
| 运行完整 verify（193/193 测试通过） | P0 | ✅ 完成 |
| 添加 monorepo 管理（pnpm workspace） | P1 | 待做 |
| 添加 ESLint + Prettier | P1 | 待做 |
| 补充缺失测试（apply-patch-rescue, session-events, permission-guard） | P1 | 待做 |
| 添加 CHANGELOG.md | P1 | 待做 |
| 修复 `.opencode.ignore` | P2 | 待做 |
| 改进 `atob` → `Buffer.from` | P2 | 待做 |

### Phase 2：Desktop 分发（中期）

| 任务 | 优先级 | 说明 |
|------|--------|------|
| 调研 OpenCode Desktop 构建方式 | P0 | 了解 upstream 的 Electron/Tauri 架构 |
| 决定 fork vs wrapper 策略 | P0 | wrapper 更简单，fork 更灵活 |
| 实现 LazyOpenCode Desktop launcher | P1 | 预装 `@lazyopencode/core` + 默认配置 |
| 首次启动引导（onboarding） | P1 | 检测用户是否有 `opencode.json`，自动合并默认配置 |
| 自动更新机制 | P2 | 插件和 Desktop 的独立更新 |
| 跨平台打包（Windows/macOS/Linux） | P2 | CI 构建 release |

### Phase 3：差异化强化（长期）

| 任务 | 优先级 | 说明 |
|------|--------|------|
| 设计基准测试套件 | P1 | 对比 "无治理" vs "LazyOpenCode" 的量化数据 |
| 强化 Council 宣传 | P1 | 多模型决策是 Advance 没有的杀手特性 |
| 与 Ponytail 品牌整合 | P2 | 考虑成为 Ponytail 的"官方运行时实现" |
| 企业版治理仪表板 | P2 | 对标 Advance 的 Dashboard，但更简单 |
| 考虑 Claude Code / Codex 适配 | P2 | 扩大生态位 |

---

## 四、竞品对比矩阵

| 维度 | LazyOpenCode | Advance | Flow-Next | Superego |
|------|-------------|---------|-----------|----------|
| **Stars** | 待发布 | 2 | 待查 | 待查 |
| **创建时间** | 2026-06 | 2026-01 | 2026-01 | 2025-12 |
| **工作流** | 5 级分类 + 5 阶段 | 7-gate | Epic-first + 依赖图 | Scope guard |
| **持久化** | 文件 JSON | **Temporal** | 文件 JSON | 无 |
| **外部依赖** | 0 | Temporal 服务器 | 0 | 0 |
| **配置复杂度** | 零配置 | 需 `.adv/specs/` + Temporal | 需 `.flow/` 目录 | 极简 |
| **Desktop 分发** | 🚧 空壳 | ❌ 无 | ❌ 无 | ❌ 无 |
| **多模型决策** | ✅ Council | ❌ 无 | ❌ 无 | ❌ 无 |
| **权限守卫** | ✅ 有 | ✅ 有 | ⚠️ 部分 | ⚠️ 部分 |
| **Dashboard** | ❌ 无 | ✅ 有（8765 端口） | ❌ 无 | ❌ 无 |
| **TDD 证据** | ❌ 无 | ✅ 有（red/green） | ❌ 无 | ❌ 无 |
| **目标用户** | 个人开发者 | 团队/企业 | 个人/团队 | 个人 |

### 关键洞察

1. **Advance 是"Enterprise 级"但几乎无用户**：2 个 star，38 个 open issues，说明功能过于复杂，个人开发者无法使用。这是 LazyOpenCode 的最大机会——**做 Advance 的轻量替代**。

2. **Desktop 分发是空白地带**：所有竞品（Advance、Flow-Next、Superego）都没有 Desktop 分发。如果 LazyOpenCode Desktop 落地，它将成为 **OpenCode 生态的"Cursor"**。

3. **Council 多模型决策是独有优势**：这是 LazyOpenCode 区别于所有竞品的核心能力，但目前宣传不足。

4. **OpenCode 生态极早期**：所有项目都不到 1 年，star 数极少。这意味着：
   - **风险**：OpenCode 本身可能无法成功
   - **机会**：如果 OpenCode 成功，早期进入者将定义标准

---

## 五、建议的对外定位话术

### 一句话

> **LazyOpenCode = OpenCode 的 Cursor Rules + 轻量级工作流治理 + 开箱即用 Desktop 分发**

### 对比 Advance

> "Advance 是 Enterprise 级工程系统（需要 Temporal 服务器 + 7-gate 流程）。LazyOpenCode 是**个人开发者的零配置治理器**——装上插件、打开 Desktop，立即获得分类、门禁、追踪、评审闭环。"

### 对比 Cursor

> "Cursor 是自研编辑器。LazyOpenCode 是** OpenCode 的治理层插件**——不改变编辑器，只给 AI 会话装上刹车和方向盘。"

### 核心卖点（3 个）

1. **零配置开箱即用**：装上 Desktop，AI 自动获得 Ponytail 哲学 + 工作流治理
2. **Council 多模型决策**：高风险决策时自动启动多模型独立分析，避免单一模型盲区
3. **轻量但不弱**：无外部依赖，但覆盖分类、门禁、追踪、权限、评审、简化全闭环

---

## 六、需要立即决策的问题

1. **Desktop 二开策略**：fork OpenCode Desktop 还是做 wrapper launcher？
2. **商业模型**：MIT 开源 + Desktop 收费？还是全部开源？
3. **Council 特性是否默认开启**：当前默认 `enabled: true`，但用户可能未配置模型，会导致体验差
4. **Ponytail 品牌关系**：是否主动联系 Ponytail 作者寻求合作/品牌整合？
5. **是否适配 Claude Code / Codex**：扩大生态位，但会增加维护成本
