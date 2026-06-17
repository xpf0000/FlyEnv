# Kimi 模块集成实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除 FlyEnv 中现有的 AI Code / Claude Code 模块，并参照 Hermes 模块新增 Kimi Code CLI 管理面板（服务 / 配置文件 / 日志 / Session 四个 tab）。

**Architecture:** 完全复用 Hermes 的 fork + renderer 结构；fork 端负责命令执行、文件扫描、配置/日志/session 读取；renderer 端通过 `IPC.send('app-fork:kimi', ...)` 调用，使用共享组件 `ConfVM`、`LogVM` 和 `XTerm`。

**Tech Stack:** TypeScript, Vue 3, Electron, node-pty/XTerm, @iarna/toml, Tailwind/SCSS, Vue I18n.

---

### Task 1: 移除 AI Code / Claude Code 代码

**Files:**
- Delete: `src/fork/module/AICli/index.ts`
- Delete: `src/render/components/AICli/`（整个目录）
- Delete: `src/lang/en/aicli.json`
- Delete: `src/lang/zh/aicli.json`
- Modify: `src/render/core/type.ts`（移除 `claudecode = 'claudecode'`）
- Modify: `src/fork/BaseManager.ts`（移除 `AICli: any` 属性和 `aicli` 分支）
- Modify: `src/main/core/IPCHandler.ts`（移除 `AICli:saveProviders` / `AICli:loadProviders` case 和处理函数；如 `safeStorage` 无其他用途则移除 import）
- Modify: `src/lang/en/index.ts`（移除 `aicli` import/export）
- Modify: `src/lang/zh/index.ts`（移除 `aicliZH` import/export）
- Modify: `src/lang/index.ts`（移除 `aicli` 类型 import 和 `LangKey` 中的 `aicli` 条目）

---

### Task 2: 新增 Kimi fork 模块

**Files:**
- Create: `src/fork/module/Kimi/index.ts`

实现方法：
- `checkInstalled()` → 运行 `kimi --version`
- `getConfigPath()` → 返回 `{ 'config.toml': '~/.kimi-code/config.toml', 'tui.toml': '~/.kimi-code/tui.toml' }`
- `getLogFiles()` → 扫描 `~/.kimi-code/logs/*.log`
- `getLogs(type, lines)` → 读取日志文件内容
- `listSessions()` → 递归扫描 `~/.kimi-code/sessions/<workDirKey>/<sessionId>/`，读取 `state.json` 返回 `{ id, title, workDir, updatedAt }`
- `deleteSession(sessionId)` → 找到对应目录并删除
- `fetchAllOnlineVersion()` / `allInstalledVersions()` → 返回 `[]`

---

### Task 3: 新增 Kimi renderer 模块

**Files:**
- Create: `src/render/components/Kimi/Module.ts`
- Create: `src/render/components/Kimi/Index.vue`
- Create: `src/render/components/Kimi/setup.ts`
- Create: `src/render/components/Kimi/Service.vue`
- Create: `src/render/components/Kimi/Config.vue`
- Create: `src/render/components/Kimi/Logs.vue`
- Create: `src/render/components/Kimi/Sessions.vue`
- Create: `src/render/components/Kimi/aside.vue`
- Create: `src/render/components/Kimi/ASide.ts`
- Create: `src/render/components/Kimi/command.json`

要点：
- `Module.ts`：`moduleType: 'ai'`, `typeFlag: 'kimi'`, `label: 'Kimi'`, `asideIndex: 102`
- `Index.vue`：4 个 tab（服务 / 配置文件 / 日志 / Session）
- `setup.ts`：参考 `Hermes/setup.ts`，保留安装/版本检测/XTerm/配置/日志/Session 相关逻辑，移除 gateway/skills/provider 相关状态
- `Service.vue`：未安装时显示官方命令并提供安装按钮；已安装时显示版本与 `command.json` 快捷命令
- `Config.vue`：使用 `ConfVM` 编辑 `config.toml` / `tui.toml`，并提供顶层快捷设置（`default_permission_mode`、`default_thinking`、`default_plan_mode`、`telemetry`）
- `Logs.vue`：使用 `LogVM`
- `Sessions.vue`：列表 + 恢复/导出/删除操作
- `aside.vue` / `ASide.ts`：左侧导航注册，无 gateway 开关
- `command.json`：Kimi 常用命令分类（help/version/upgrade/session/export/vis 等）

---

### Task 4: 注册模块与国际化

**Files:**
- Modify: `src/render/core/type.ts`（`AppModuleEnum` 增加 `kimi = 'kimi'`）
- Modify: `src/fork/BaseManager.ts`（增加 `Kimi: any` 属性和 `kimi` 分支）
- Create: `src/render/svg/kimi.svg`
- Create: `src/lang/*/kimi.json`（所有支持的语言，最小键集合：notInstalled/install/installed/version/config/logs/sessions/resume/export/delete/quickSettings/category/cmd）
- Modify: `src/lang/*/index.ts`（每语言 import/export `kimi`）
- Modify: `src/lang/index.ts`（增加 `kimi` 类型 import 和 `LangKey` 条目）

---

### Task 5: 构建与类型检查

**Commands:**
- `yarn type-check` 或 `yarn vue-tsc --noEmit`
- `yarn build`（或至少 `yarn build-renderer` + esbuild main/fork）

预期结果：
- 无新增 TypeScript 错误
- AI Code / Claude Code 不再出现在模块列表、路由、fork 分发中
- Kimi 模块可正常编译
