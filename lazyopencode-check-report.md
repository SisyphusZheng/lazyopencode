# LazyOpenCode 项目全面检查报告

**检查日期**: 2025-06-28
**项目路径**: `/Users/zhengzhi/Documents/projects/lazyopencode`
**版本**: `0.0.1`

---

## 1. 项目概览

这是一个 monorepo 结构，包含两个包：

| 包 | 路径 | 类型 | 说明 |
|----|------|------|------|
| `@lazyopencode/core` | `packages/lazyopencode-core/` | TypeScript 库 | OpenCode 插件，治理 AI 编码工作流 |
| `@lazyopencode/desktop` | `apps/lazyopencode-desktop/` | 分发壳 | 预装 OpenCode Desktop 的占位配置 |

**核心能力**: 工作流分类与门禁（trivial → small → medium → high_risk → ambiguous）、Ponytail 哲学注入、背景任务看板、权限守卫、Council 多模型决策、错误恢复、消息裁剪、技能过滤。

---

## 2. 构建与测试健康度 ✅

| 检查项 | 状态 | 结果 |
|--------|------|------|
| TypeScript 类型检查 (`tsc --noEmit`) | ✅ 通过 | 无类型错误 |
| 集成测试 (`test/integration.js`) | ✅ 通过 | 131/131 |
| 工作流分类测试 (`test/workflow-classifier.js`) | ✅ 通过 | 全部通过 |
| 运行时状态测试 (`test/runtime-state.js`) | ✅ 通过 | 全部通过 |
| 冒烟测试 (`test/smoke.js`) | ✅ 通过 | 14/14 |
| Council 测试 (`test/council.js`) | ✅ 通过 | 38/38 |
| npm audit (moderate+) | ✅ 通过 | 0 漏洞 |
| npm pack --dry-run | ✅ 通过 | 80 个文件，185 KB |
| `verify` 脚本 | ✅ 通过 | 完整链路通过 |

**结论**: 所有自动化检查均通过，测试覆盖全面。

---

## 3. 代码质量问题与 Bug

### 🔴 严重：发布包技能路径错误（Windows 与生产环境均受影响）

**文件**: `src/skills/index.ts`（编译后 `dist/skills/index.js`）

```typescript
export function getSkillsDir(): string {
  const url = new URL("../skills/lazy/", import.meta.url)
  return url.pathname
}
```

**问题**:
- **开发环境**: `src/skills/index.ts` → `../skills/lazy/` 解析为 `src/skills/lazy/` ✅ 正确
- **生产环境**: `dist/skills/index.js` → `../skills/lazy/` 解析为 `dist/skills/lazy/` ❌ **目录不存在**
- **Windows**: `url.pathname` 返回 `/C:/path/...`，格式错误，且 `fileURLToPath` 未使用

**影响**: 发布后 OpenCode 无法发现内置技能（lazy/grill, lazy/build 等），插件核心功能失效。

**修复建议**:
```typescript
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

export function getSkillsDir(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  // 从 dist/skills/index.js 指向 src/skills/lazy/
  return join(__dirname, "../../src/skills/lazy/")
}
```

---

### 🟡 重要：Windows 路径兼容问题

**文件**: `src/hooks/runtime.ts` 第 162 行

```typescript
const dir = path.substring(0, path.lastIndexOf("/"))
await mkdir(dir, { recursive: true })
```

**问题**: Windows 路径使用 `\` 分隔符，`lastIndexOf("/")` 返回 `-1`，`dir` 变为完整文件路径，`mkdir` 会尝试创建同名目录，`writeFile` 随后失败。

**修复建议**:
```typescript
import { dirname } from "node:path"
const dir = dirname(path)
```

---

### 🟡 重要：Windows 持久化路径硬编码 Unix 风格

**文件**: `src/hooks/runtime.ts` 第 328 行

```typescript
path: input?.persistence?.path ??
  `${process.env.HOME ?? "/tmp"}/.lazyopencode/state/${scope.scopeID}.json`,
```

**问题**: Windows 上 `process.env.HOME` 通常不存在，会回退到 `/tmp/...`（Windows 无此目录），导致持久化状态写入失败。

**修复建议**:
```typescript
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"

path: input?.persistence?.path ??
  join(homedir() || tmpdir(), ".lazyopencode", "state", `${scope.scopeID}.json`),
```

---

### 🟡 重要：JSONC 配置文件中缺少逗号（注释块启用后会导致语法错误）

**文件**: `packages/lazyopencode-core/.opencode/opencode.jsonc` 第 33 行

```jsonc
    "commands": {
      "lazy": true,
      "deepworkAlias": true
    }

    // Council (uncomment and configure as needed):
    // "council": {
```

**问题**: `commands` 块结束后的 `}` 后面没有逗号。用户取消注释 Council 配置时，JSONC 解析器会报语法错误，因为 `"council"` 前缺少逗号分隔符。

**修复建议**: 在 `}` 后添加逗号：
```jsonc
    },

    // Council (uncomment and configure as needed):
```

---

### 🟡 中等：权限守卫正则过于宽泛，误报率高

**文件**: `src/hooks/permission-guard.ts`

```typescript
/\bsecret(s)?\b/i,
/\btoken(s)?\b/i,
```

**问题**: `secret` 会匹配 `secrets`（目录名）、`secretly`（命令描述）；`token` 会匹配 `tokenize`、`tokens`。这会导致大量无害命令（如 `ls src/secrets`）被拦截为"询问"模式，降低用户体验。

**建议**: 收紧正则，例如限定为完整单词边界加动词前缀：
```typescript
/\b(rm|remove|delete|leak|expose)\s+.*\bsecret(s)?\b/i,
/\b(rm|revoke|leak)\s+.*\btoken(s)?\b/i,
```

---

### 🟡 中等：`detectWorkflowSkip` 在生产环境中是死代码

**文件**: `src/hooks/messages-transform.ts` 第 238–245 行

```typescript
if (recentText) {
  // classifyWorkflow
} else if (!runtime) {
  const gate = detectWorkflowSkip(msgs)
  // ...
}
```

**问题**: `runtime` 在插件初始化时始终被传入，`!runtime` 永为 `false`。`detectWorkflowSkip` 检测跳过 workflow 步骤（如 BUILD 无 PRD、SPECIFY 无 GRILL 等）的逻辑在生产环境中从未执行。

**建议**: 将 `detectWorkflowSkip` 作为 `classifyWorkflow` 的补充逻辑，在 `runtime` 存在时调用；或移除该函数以简化代码。

---

### 🟡 中等：`atob` 用于 base64 解码，可靠性有限

**文件**: `src/hooks/messages-transform.ts` 第 245 行

```typescript
const data = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0))
```

**问题**: `atob` 在 Node.js 16+ 可用，但对非 ASCII 字符处理不可靠。`Buffer.from(match[2], "base64")` 更健壮且性能更好。

---

### 🟢 轻微：系统提示注入检查 fragile

**文件**: `src/hooks/system-transform.ts` 第 87 行

```typescript
if (output.system[0]?.startsWith(LAZY_SYSTEM_PROMPT.slice(0, 30))) return
```

**问题**: 仅检查前 30 个字符来防止重复注入。如果外部系统提示恰好以相同前缀开头，会误触发防重保护，导致 lazy 主提示未被注入。

**建议**: 使用更精确的唯一 sentinel（如 `<!-- LAZY_INJECTED -->`）或完整字符串匹配。

---

### 🟢 轻微：`.opencode.ignore` 缺少 `.opencode/` 目录

**文件**: `.opencode.ignore`

```
dist/
**/node_modules/
**/.git/
*.map
*.d.ts
```

**问题**: 未忽略 `.opencode/` 目录（OpenCode 运行时生成的配置/缓存目录）。如果用户在该目录下工作，file tool 可能暴露敏感配置或缓存数据。

**建议**: 添加 `.opencode/` 或 `**/.opencode/`。

---

### 🟢 轻微：无 monorepo 管理工具

**问题**: 根目录无 `package.json`、无 `pnpm-workspace.yaml`、无 `turbo.json` 或 `lerna.json`。`apps/` 和 `packages/` 完全独立，缺乏：
- 统一依赖管理
- 跨包脚本编排
- 缓存构建
- 版本同步

**建议**: 添加 `pnpm-workspace.yaml` 或 npm workspaces 配置，统一 `build`、`test`、`lint` 脚本。

---

### 🟢 轻微：代码风格不一致

- `tsconfig.json` 中存在多余的空行（`"include": ["src"],` 后换行再闭合）
- 部分文件使用 `// ponytail:` 注释标记简化点，但无统一规范追踪这些标记
- 缺少 `.editorconfig`、Prettier、ESLint 配置

---

## 4. 测试与覆盖度

| 测试文件 | 覆盖范围 | 建议 |
|----------|----------|------|
| `integration.js` | 插件生命周期、配置合并、命令、权限、Council 资格、系统提示、聊天参数、任务会话、背景看板、消息裁剪、错误恢复 | 完善，继续保持 |
| `smoke.js` | 端到端：加载 → 分类 → 启动 → 完成 → 对账 → 关闭 | 完善 |
| `workflow-classifier.js` | 分类器决策逻辑、边界词、Bypass 检测、中文支持 | 完善，可补充更多中文模式 |
| `runtime-state.js` | 配置解析、持久化、加载、损坏恢复、重置 | 完善 |
| `council.js` | 预设解析、预算守卫、格式化、空结果 | 完善，但缺少真实客户端集成测试（仅 integration.js 覆盖） |

**缺失测试**:
1. `apply-patch-rescue.ts`（hunk 偏移修正）—— 无单元测试
2. `session-events.ts`（session 生命周期清理）—— 仅通过 smoke 间接覆盖
3. `deepwork.ts` —— 无独立测试
4. `permission-guard.ts` 的中文/英文正则边界测试—— 未单独覆盖

---

## 5. 文档完整性

| 文档 | 状态 | 备注 |
|------|------|------|
| `README.md` | ✅ 完整 | 安装、配置、命令、Agent、技能、模式 |
| `docs/user-manual.md` | ✅ 完整 | 11489 字节，详细使用指南 |
| `docs/architecture.md` | ✅ 完整 | 架构概述 |
| `docs/council.md` | ✅ 完整 | Council 系统说明 |
| `docs/opencode-integration.md` | ✅ 完整 | 集成指南 |
| `docs/desktop-distribution.md` | ✅ 完整 | 分发策略 |
| `docs/state-machine.md` | ✅ 完整 | 状态机描述 |
| `docs/product-plan.md` | ✅ 完整 | 产品规划 |
| `docs/positioning.md` | ✅ 完整 | 定位说明 |
| `ATTRIBUTION.md` | ✅ 完整 | 上游项目致谢 |
| `LICENSE` | ✅ 完整 | MIT |
| `src/skills/lazy/*/SKILL.md` | ✅ 9/9 | build, debug, grill, plan, review, security, simplify, specify, worktree |

**文档缺失**: 无 `CHANGELOG.md`、无 `CONTRIBUTING.md`、无 API 参考文档（JSDoc 覆盖率有限）。

---

## 6. 依赖与发布

| 检查项 | 状态 |
|--------|------|
| `@opencode-ai/plugin` | `^1.2.6` — 合理，插件核心依赖 |
| `@types/node` | `^26.0.1` — 合理 |
| `typescript` | `^5.7.0` — 合理 |
| 运行时依赖总量 | 仅 1 个生产依赖（非常精简）✅ |
| 无 lockfile 提交风险 | `package-lock.json` 存在，但 `node_modules/` 被 `.gitignore` 忽略 ✅ |

---

## 7. 安全扫描

- `npm audit` 0 漏洞 ✅
- 无硬编码密钥或凭证 ✅
- 权限守卫覆盖了常见的破坏性操作（`rm -rf`, `git reset --hard`, `drop table`, `delete from`, `truncate table`） ✅
- 中文破坏性关键词已覆盖（删除、生产、部署、密钥） ✅

---

## 8. 总结与行动建议

### 立即修复（阻碍发布）
1. **`src/skills/index.ts` 路径修复**：使用 `fileURLToPath` + `join` 确保 `dist` 和 `src` 环境下均指向 `src/skills/lazy/`。
2. **`runtime.ts` 目录提取**：将 `path.substring(0, path.lastIndexOf("/"))` 替换为 `dirname(path)`，解决 Windows 兼容。
3. **`runtime.ts` 持久化路径**：使用 `os.homedir()` / `os.tmpdir()` + `path.join`，解决 Windows 默认路径问题。
4. **`.opencode/opencode.jsonc` 逗号**：在 `commands` 块后添加逗号，避免用户取消注释时 JSONC 语法错误。

### 短期优化
5. **收紧权限守卫正则**：将 `secret`/`token` 的宽泛匹配改为更精确的模式，减少误报。
6. **整合或移除 `detectWorkflowSkip`**：解决死代码问题，或将其纳入主工作流检测逻辑。
7. **补充单元测试**：为 `apply-patch-rescue.ts` 和 `permission-guard.ts` 添加独立测试。
8. **引入 monorepo 工具**：添加 `pnpm-workspace.yaml` 或 npm workspaces，统一管理 `apps/` 和 `packages/`。

### 长期改进
9. **代码规范**：添加 `.editorconfig`、ESLint、Prettier。
10. **CHANGELOG**：维护版本变更日志。
11. **JSDoc/API 文档**：为公开 API 添加类型文档。
12. **跨平台 CI**：在 GitHub Actions 中添加 Windows / macOS 运行器，防止路径问题回归。

---

**整体评估**: 项目架构清晰、测试扎实、文档齐全、代码质量较高。核心逻辑可靠，但存在 **3 个 Windows 兼容性问题**和 **1 个发布包路径 Bug**，建议在发布前优先修复。
