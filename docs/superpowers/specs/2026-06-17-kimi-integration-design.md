# Kimi 模块集成设计

## 目标

1. 彻底移除现有 AI Code / Claude Code 相关实现。
2. 参照 Hermes 模块的端到端模式，在 FlyEnv 中新增 **Kimi Code CLI** 管理面板。

## 模块定位

- `moduleType`: `ai`
- `typeFlag`: `kimi`
- 非守护服务类 CLI 工具，不提供 start/stop 服务生命周期，只提供：
  - 安装状态检测
  - 官方命令安装
  - 配置文件浏览/编辑
  - 日志浏览
  - Session 列表与操作

## 实现方案

### 方案 A：照抄 Hermes（推荐）

复制 Hermes 的 fork + renderer 结构，仅把命令、路径、文案替换为 Kimi。

- **优点**：与现有代码风格一致，改动最小，可快速交付，风险低。
- **缺点**：Hermes 与 Kimi 之间会有部分重复代码。

### 方案 B：抽取 `AiCliBase` 共享层

把 Hermes / Kimi / OpenClaw 同构的 CLI 管理逻辑抽到新的共享层。

- **优点**：长期可维护，避免重复。
- **缺点**：需要重构现有 Hermes，工作量大、风险高，且偏离“参照 Hermes”的要求。

本设计采用 **方案 A**。

## Kimi Code CLI 关键事实

| 项 | 内容 |
|---|---|
| 命令 | `kimi` |
| 版本检查 | `kimi --version` |
| macOS/Linux 官方安装 | `curl -fsSL https://code.kimi.com/kimi-code/install.sh \| bash` |
| Windows 官方安装 | `irm https://code.kimi.com/kimi-code/install.ps1 \| iex` |
| npm 安装 | `npm install -g @moonshot-ai/kimi-code` |
| 数据目录 | `~/.kimi-code/`（可被 `KIMI_CODE_HOME` 覆盖） |
| 主配置 | `~/.kimi-code/config.toml` |
| UI 配置 | `~/.kimi-code/tui.toml` |
| 日志 | `~/.kimi-code/logs/kimi-code.log` |
| Session 存储 | `~/.kimi-code/sessions/<workDirKey>/<sessionId>/` |
| Session 元数据 | `~/.kimi-code/sessions/<workDirKey>/<sessionId>/state.json` |
| 恢复会话 | `kimi --session <id>` / `kimi --continue` |
| 导出会话 | `kimi export <id>` |

## 文件改动清单

### 新增

```
src/fork/module/Kimi/index.ts
src/render/components/Kimi/Module.ts
src/render/components/Kimi/Index.vue
src/render/components/Kimi/setup.ts
src/render/components/Kimi/Service.vue
src/render/components/Kimi/Config.vue
src/render/components/Kimi/Logs.vue
src/render/components/Kimi/Sessions.vue
src/render/components/Kimi/aside.vue
src/render/components/Kimi/ASide.ts
src/render/components/Kimi/command.json
src/render/svg/kimi.svg
src/lang/*/kimi.json   (所有支持的语言)
```

### 修改

```
src/render/core/type.ts        # AppModuleEnum 增加 kimi
src/fork/BaseManager.ts        # 增加 kimi 分支
src/lang/*/index.ts            # 每语言注册 kimi
```

### 删除

```
src/fork/module/AICli/index.ts
src/render/components/AICli/
src/lang/en/aicli.json
src/lang/zh/aicli.json
```

以及从 `src/main/core/IPCHandler.ts`、`src/render/core/type.ts`、`src/fork/BaseManager.ts`、`src/lang/en/index.ts`、`src/lang/zh/index.ts`、`src/lang/index.ts` 中移除 Claude Code / `claudecode` / `aicli` 相关注册和 IPC。

## 前端 Tab 设计

### 1. 服务（Service）

- 未安装：显示当前平台官方安装命令，提供“一键安装”按钮，点击后在 XTerm 执行官方命令。
- 已安装：显示 `kimi --version` 解析出的版本号，以及 `command.json` 中的快捷命令（如启动、升级、导出等）。

### 2. 配置文件（Config）

- 列出主要配置文件：`config.toml`、`tui.toml`。
- 使用共享组件 `ConfVM` 进行编辑。
- 在 `config.toml` 上提供几个快捷设置开关/选择器：
  - `default_permission_mode`: manual / auto / yolo
  - `default_thinking`: true / false
  - `default_plan_mode`: true / false
  - `telemetry`: true / false

> 快捷设置通过读写 `config.toml` 顶层字段实现，作为 `ConfVM` 的辅助，不替代完整编辑。

### 3. 日志（Logs）

- 列出 `~/.kimi-code/logs/` 下的日志文件。
- 使用共享组件 `LogVM` 进行实时/历史日志查看。

### 4. Session

- 扫描 `~/.kimi-code/sessions/` 目录，读取每个 `state.json` 生成会话列表。
- 列表字段：ID、标题（title）、工作目录（workDir）、最后更新时间（updatedAt）。
- 可用操作：
  - 恢复：`kimi --session <id>`
  - 导出：`kimi export <id>`
  - 删除：删除会话目录

## Fork 后端方法

```ts
class Kimi extends Base {
  checkInstalled()          // kimi --version
  getConfigPath()           // { config.toml, tui.toml }
  getLogFiles()             // logs/*.log
  getLogs(type, lines)      // 读取日志内容
  listSessions()            // 扫描 sessions 目录
  deleteSession(sessionId)  // 删除会话目录
  fetchAllOnlineVersion()   // []
  allInstalledVersions()    // []
}
```

## IPC 通道

- 渲染端：`IPC.send('app-fork:kimi', 'methodName', ...args)`
- Fork 端：`src/fork/BaseManager.ts` 增加 `else if (module === 'kimi')` 分支。

## 国际化

- 每语言新增 `kimi.json`，至少包含：
  - `notInstalled`
  - `install`
  - `installed`
  - `version`
  - `config`
  - `logs`
  - `sessions`
  - `resume`
  - `export`
  - `delete`
  - `quickSettings`

## 验收标准

- [ ] 现有 AI Code / Claude Code 代码完全移除，项目可正常构建。
- [ ] `src/render/core/type.ts` 中只保留 `kimi`，不再包含 `claudecode`。
- [ ] Kimi 模块出现在左侧 AI 分组导航中。
- [ ] 未安装时显示官方命令并可点击安装。
- [ ] 已安装时显示版本与快捷命令。
- [ ] Config tab 能编辑 `config.toml` / `tui.toml`，并提供快捷设置。
- [ ] Logs tab 能查看 `kimi-code.log`。
- [ ] Session tab 能列出并恢复/导出/删除会话。
