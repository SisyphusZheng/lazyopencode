# Deno 迁移计划

**目标**：将 LazyOpenCode 从 Node.js 工具链迁移到 Deno 工具链，同时保持产物为 npm 兼容格式（供 OpenCode/Bun 运行时加载）。

**核心策略**：
- 开发时：Deno 工具链（`deno task` / `deno test` / `deno fmt` / `deno lint`）
- 代码：尽量 Web Standard API，保留必要的 `node:` 前缀（`deno pack` 会自动处理）
- 产物：`deno pack` 生成 `npm/` 目录，包含标准 npm 包
- 测试：从手写 JS assert 迁移到 `Deno.test` + `assert` 模块

---

## Phase 1: 基础配置（Deno 环境）

### 1.1 创建 `deno.json`（根目录 + 子包）

**根目录 `deno.json`**：
```json
{
  "workspace": ["packages/lazyopencode-core", "apps/lazyopencode-desktop"],
  "nodeModulesDir": "auto"
}
```

**`packages/lazyopencode-core/deno.json`**：
```json
{
  "name": "@lazyopencode/core",
  "version": "0.0.1",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/hooks/runtime.ts"
  },
  "imports": {
    "@opencode-ai/plugin": "npm:@opencode-ai/plugin@^1.2.6",
    "@opencode-ai/sdk": "npm:@opencode-ai/sdk@latest"
  },
  "tasks": {
    "build": "deno run -A npm:typescript@5.7.0/tsc --project tsconfig.json",
    "check": "deno run -A npm:typescript@5.7.0/tsc --noEmit --project tsconfig.json",
    "test": "deno task build && deno test test/",
    "verify": "deno task check && deno task test && deno pack --dry-run",
    "fmt": "deno fmt src/ test/",
    "lint": "deno lint src/",
    "pack": "deno pack"
  },
  "compilerOptions": {
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noUncheckedIndexedAccess": true
  },
  "fmt": {
    "useTabs": false,
    "lineWidth": 100,
    "indentWidth": 2,
    "semiColons": false,
    "singleQuote": false,
    "proseWrap": "preserve"
  },
  "lint": {
    "rules": {
      "tags": ["recommended"]
    }
  },
  "nodeModulesDir": "auto"
}
```

### 1.2 更新 `package.json`（保留 npm 兼容）

`package.json` 仍然保留，因为 `deno pack` 会读取它：
- `scripts` 改为 Deno 命令（或保留 npm 作为 fallback）
- 添加 `publishConfig` 指向 `deno pack` 产物

### 1.3 移除 `node_modules` / `package-lock.json`

用 `deno` 管理依赖，不再使用 npm。

---

## Phase 2: API 迁移（Web Standard + Deno std）

### 2.1 `node:fs/promises` → Web Standard / Deno API

| Node.js API | 替换方案 | 文件 |
|-------------|----------|------|
| `readFile(path, "utf8")` | `Deno.readTextFile(path)` | `runtime.ts` |
| `writeFile(path, data)` | `Deno.writeTextFile(path, data)` | `runtime.ts`, `messages-transform.ts` |
| `access(path)` | `Deno.stat(path)` + try-catch | `runtime.ts` |
| `mkdir(path, {recursive})` | `Deno.mkdir(path, {recursive})` | `runtime.ts` |
| `rm(path, {recursive, force})` | `Deno.remove(path, {recursive})` | `runtime.ts`, `session-events.ts` |
| `readFile(path)` (binary) | `await Deno.readFile(path)` | `messages-transform.ts`（图片处理） |

### 2.2 `node:path` → `jsr:@std/path`

```ts
import { join, dirname } from "jsr:@std/path@1"
```

替换文件：`runtime.ts`, `session-events.ts`, `skills/index.ts`

### 2.3 `node:os` → 环境变量 + Deno API

| Node.js API | 替换方案 | 说明 |
|-------------|----------|------|
| `homedir()` | `Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE")` | 跨平台（Linux/macOS/Windows） |
| `tmpdir()` | `Deno.env.get("TMPDIR") ?? Deno.env.get("TEMP") ?? "/tmp"` | 回退到 `/tmp` |

### 2.4 `node:url` → `jsr:@std/url`（或保留）

`fileURLToPath` 在 Deno 中可以直接用 `npm:` 导入，或用 `new URL().pathname`：
```ts
// 保留 node:url 或改为：
const __filename = new URL(import.meta.url).pathname
const __dirname = dirname(__filename)
```

### 2.5 `Buffer` → `Uint8Array` + `TextEncoder`

当前只有 `messages-transform.ts` 用了 `Buffer.from(base64, 'base64')`：
```ts
// 当前
const data = Uint8Array.from(Buffer.from(match[2], 'base64'))

// 改为 Web Standard
const binary = atob(match[2])
const data = new Uint8Array(binary.length)
for (let i = 0; i < binary.length; i++) {
  data[i] = binary.charCodeAt(i)
}
```

**注意**：`atob` 在 Deno 和 Bun 中都是全局可用的，这是 Web Standard API。

### 2.6 `process.cwd()` → `Deno.cwd()`

当前有两处 fallback：
```ts
// 改为
const cwd = Deno.cwd()
```

但 `Deno.cwd()` 在产物中不存在（Bun 没有 `Deno` 全局）。所以保留 `process.cwd()` 作为 fallback，或改为 `import.meta.dirname`。

**决策**：保留 `process.cwd()` 作为产物兼容层，但开发时优先用 `Deno.cwd()`。

---

## Phase 3: 测试迁移（手写 JS → Deno Test）

### 3.1 测试文件重写

从 `test/integration.js` 等手写 JS 文件迁移到 `test/integration_test.ts`：

```ts
import { assertEquals, assert } from "jsr:@std/assert@1"
import { LazyOpenCodePlugin } from "../src/index.ts"
import { BackgroundJobBoard } from "../src/hooks/background-job-board.ts"

Deno.test("config hook registers 8 agents", async () => {
  const hooks = await LazyOpenCodePlugin(mockCtx)
  assertEquals(Object.keys(hooks.config?.agent ?? {}).length, 8)
})
```

### 3.2 测试拆分

当前 5 个 JS 测试文件合并为 3 个 TS 测试文件：
- `test/hooks_test.ts` — 集成测试（131 asserts）
- `test/council_test.ts` — Council 测试（38 asserts）
- `test/unit_test.ts` — 单元测试（workflow-classifier, runtime-state, smoke）

### 3.3 测试运行

```bash
deno task test    # 构建 + 运行所有测试
deno test test/   # 直接运行（不构建）
```

---

## Phase 4: 产物打包（`deno pack`）

### 4.1 `deno pack` 配置

在 `deno.json` 中配置：
```json
{
  "publish": {
    "include": ["src", "dist", "README.md", "docs", "LICENSE"],
    "exclude": ["test", "node_modules"]
  }
}
```

### 4.2 生成 npm 包

```bash
deno pack
# 生成 npm/ 目录，包含：
#   npm/package.json
#   npm/dist/index.js
#   npm/dist/index.d.ts
#   npm/...
```

### 4.3 验证产物

```bash
cd npm && npm pack --dry-run
```

确认：
- `node:` 前缀的 import 被正确保留（Bun 兼容）
- `.d.ts` 声明文件存在
- `package.json` 的 `main`/`types` 指向正确

---

## Phase 5: 验证与清理

### 5.1 测试验证
- [ ] `deno task check` — TypeScript 严格检查通过
- [ ] `deno task test` — 所有测试通过
- [ ] `deno task lint` — 无 lint 错误
- [ ] `deno task fmt` — 代码格式化

### 5.2 产物验证
- [ ] `deno pack` 生成成功
- [ ] `npm/` 目录结构正确
- [ ] `npm pack --dry-run` 无错误

### 5.3 清理
- [ ] 删除 `node_modules/`（用 `deno` 管理）
- [ ] 删除 `package-lock.json`
- [ ] 更新 `.gitignore`（添加 Deno 相关）

---

## 执行顺序

```
Step 1: deno.json 配置（根目录 + 子包）
Step 2: package.json 更新（保留 npm 兼容）
Step 3: API 迁移（node:fs → Deno, node:path → jsr:@std/path）
Step 4: 测试迁移（JS → TS + Deno.test）
Step 5: deno pack 配置 + 产物验证
Step 6: 清理 + 最终验证
```

## 风险与回退

| 风险 | 回退方案 |
|------|----------|
| `deno pack` 不生成 `.d.ts` | 保留 `tsc` 作为 `build` 步骤 |
| `@opencode-ai/plugin` 在 Deno 下解析失败 | 使用 `npm:` 前缀 + `nodeModulesDir: auto` |
| `Deno.*` API 在产物中不可用 | 产物代码不用 `Deno.*`，只用在开发/测试 |
| 测试迁移漏掉 assert | 分步验证，每个测试文件单独运行 |
