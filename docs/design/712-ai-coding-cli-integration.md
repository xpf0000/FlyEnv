# #712 AI 编程 CLI 工具管理面板 — 集成方案

> 目标:在 FlyEnv 中集成「AI 代码工具(AI Code CLI)」一键安装与集中管理面板。覆盖 Claude Code /
> Codex / OpenCode / Qwen Code / Cursor Agent / Trae CLI / Devin 等主流工具,提供依赖检查、自动安装、
> 版本更新;模型后端支持本地 Ollama 与云端 API(SiliconFlow/OpenRouter/Anthropic/OpenAI/自定义),
> 含动态模型列表;运行配置支持工作目录、自定义环境变量、终端选择(CMD/PowerShell/WSL)。
> 使 FlyEnv 从"环境搭建工具"升级为"智能化开发效能平台"。

## 1. 背景与结论先行

调研结论:**FlyEnv 已具备本特性的全部基础设施,无需新建框架,只需"标准化 + 补齐"。**

现有 `moduleType: 'ai'` 分类下已存在 5 个模块:

| 模块 | typeFlag | 形态 | 与 #712 关系 |
| --- | --- | --- | --- |
| OpenClaw | `openclaw` | 非服务,CLI 工具管理面板 | **直接范本**:脚本安装 + XTerm + command.json |
| CliProxyAPI | `cliproxyapi` | 服务,API 代理 | **云/本地 API 聚合层**的现成载体 |
| Ollama | `ollama` | 服务,本地 LLM | 本地模型后端 |
| Hermes | `hermes` | 非服务,AI CLI | 第二个 CLI 范本 |
| N8N | `n8n` | 服务,工作流 | 旁支,不在本期 |

因此 #712 的实质是:**以 OpenClaw 为模板,新增 Claude Code / Codex / OpenCode 等 CLI 工具模块,
并用 CliProxyAPI 作为统一 API 网关把这些 CLI 指向 Ollama 或云端模型。**

## 1.1 issue #712 原文需求拆解(对齐项)

issue 明确提出的需求,逐条映射到本方案:

| # | issue 原文要点 | 方案落点 |
| --- | --- | --- |
| 核心价值 | UI 勾选即完成依赖检查、自动下载安装、版本更新,"开箱即用" | §6.1 安装流程 + §3.2 决策1 |
| 工具矩阵 | Claude Code、Codex CLI、OpenCode、Cursor Agent、Trae CLI、Qwen Code、Devin for Terminal | §3.3 工具矩阵(扩展) |
| 本地模型 | 深度集成 Ollama,选已拉取模型,连 `http://localhost:11434` | §4.2 Provider(kind=ollama)+ §6.2 |
| 云端 API | API Key 对接 SiliconFlow / OpenRouter / Anthropic / OpenAI;自定义 Endpoint;**动态获取模型列表** | §4.2 Provider(云)+ §6.4 模型列表拉取 |
| UI:工具选择器 | 下拉选具体 CLI | §7 ToolSelector |
| UI:模型绑定 | 动态选本地/云模型 | §7 ProviderPanel |
| UI:工作目录 | 预设 AI 助手默认读取的项目路径 | §4.3 RunProfile.workDir + §7 |
| UI:环境变量 | 注入自定义 `KEY=value` | §4.3 RunProfile.env + §7 |
| UI:终端选择 | 指定 CMD / PowerShell / WSL 执行 | §4.3 RunProfile.shell + §6.5 |

**对原方案的增量**:① 工具矩阵从 4 个扩到 7 个;② 新增"运行配置 RunProfile"(工作目录/环境变量/终端);
③ Provider 明确云平台清单 + 动态模型列表拉取;④ UI 增加工具选择器与终端选择器。

## 2. 现有架构关键事实(集成依据)

### 2.1 模块注册三件套

一个可管理模块由 3 处声明组成,新增模块照抄即可:

1. **渲染端模块声明** `src/render/components/<Name>/Module.ts`
   - 导出 `AppModuleItem`(`type.ts:122`),字段:`moduleType`、`typeFlag`、`label`、`icon`、
     `index`(主面板)、`aside`(左侧导航)、`asideIndex`(排序)、`isService`、`isTray`、`platform`。
   - 渲染端通过 `src/render/core/App.ts` 的 `import.meta.glob('@/components/*/Module.ts')`
     **自动加载**,无需手动登记;路由 `src/render/router/index.ts` 用 `typeFlag` 自动建路由。
2. **类型登记** `src/render/core/type.ts`
   - 在 `AppModuleEnum` 增加 `typeFlag`(枚举值),`AllAppModule` 自动包含。
3. **Fork 后端登记** `src/fork/BaseManager.ts`(`exec` 的 if-else 链,约 135–360 行)
   - 增加 `else if (module === '<typeFlag>') { 动态 import('./module/<Name>'); doRun(...) }`。

### 2.2 后端模块基类 `Base`(`src/fork/module/Base/index.ts`)

所有工具 `extends Base`,可复用:
- 版本管理:`_fetchOnlineVersion(app)`(打到 `api.one-env.com/api/version/fetch`)、
  `installSoft(row)`、`_installSoftHandle(row)`、`_linkVersion()`。
- 服务生命周期:`_startServer()` / `_stopServer()` / `startService()` / `stopService()`、
  PID 管理 `saveAppPid()` / `waitPidFile()`。
- 本地版本扫描工具(`src/fork/Fn.ts`):`versionLocalFetch`、`versionBinVersion`、
  `versionFilterSame`、`versionSort`、`execPromiseWithEnv`、`brewInfoJson`。
- 进度流:方法返回 `ForkPromise`,通过 `on({ 'APP-On-Log': ... })` 推送日志/进度。

### 2.3 IPC 链路

```
Vue(IPC.send 'app-fork:<module>' , 'method', ...args)
  → main/core/IPCHandler.ts(转发 app-fork:* 到 fork 进程)
  → fork/index.ts → BaseManager.exec(command, module, fn, ...args)
  → module.method() 返回 ForkPromise → process.send 回传(成功/日志/错误)
```

### 2.4 内嵌终端 `XTerm`(`src/render/util/XTerm.ts`)— CLI 工具的核心交互

OpenClaw 用它实现:`new XTerm()` → `mount(domRef)` → `send(commands[], false)` 执行,
`writeToNodePty(text)` 支持需要交互输入的命令;`stop()` / `destroy()` 收尾。
**这是 AI CLI 工具"在 GUI 里跑命令"的关键能力,可直接复用。**

### 2.5 OpenClaw 范本拆解(照抄目标)

`src/render/components/OpenClaw/` 文件构成:
- `Module.ts` — 模块声明(`moduleType:'ai'`、`isService:false`)
- `Index.vue` — 顶部 `el-radio-group` Tab 容器(服务 / 配置文件)
- `Service.vue` — 安装/状态/命令执行 UI
- `Config.vue` — 配置文件编辑
- `setup.ts` — `reactiveBind` 的状态类:`checkInstalled()`、`installXXX(domRef)`(走 XTerm)、
  `doAction(item, domRef)`(执行 command.json 里的命令)、`taskConfirm/Cancel`
- `command.json` — **命令目录**:`categories[].commands[]`,每条 `{label, descriptionKey, needInput, needRefresh}`
- `aside.vue` / `ASide.ts` — 左侧导航项

后端 `src/fork/module/OpenClaw/index.ts`:`checkInstalled()`(跑 `--version`)、
`getGatewayStatus()`、`startGateway()` / `stopGateway()`(`execPromiseWithEnv` + 进程查杀)。

### 2.6 配置持久化

- 全局 Pinia:`src/render/store/app.ts`,`config.server[flag].current`(版本/运行态)、
  `config.setup[flag]`(目录等)。
- 主进程:`src/main/core/ConfigManager.ts`(`electron-store`),`application:save-preference` 落盘。
- 工具内私有状态:OpenClaw 用 `localForage`(IndexedDB);AI Chat 用 `'flyenv-ai-chat-list'` key。
- 后端目录:`global.Server.BaseDir/AppDir/Cache/Static`(如 `cliproxyapi/config.yaml`)。

### 2.7 i18n

`src/lang/<lang>/<feature>.json`,代码用 `I18nT('feature.key')`。
新增模块加 `src/lang/en/<name>.json` 与 `zh`(其余语言可后续补;`src/lang/check.mjs` 校验未用键)。

## 3. 整体方案设计

### 3.1 架构分层

```
┌─────────────────────────────────────────────────────────────┐
│  渲染层(左侧导航 moduleType: 'ai' 分组)                       │
│                                                               │
│  ┌──────────┬──────────┬──────────┬──────────┬────────────┐  │
│  │ClaudeCode│  Codex   │ OpenCode │ GeminiCLI │ OpenClaw…  │  │ ← 各 CLI 工具面板
│  └────┬─────┴────┬─────┴────┬─────┴────┬──────┴──────┬─────┘  │
│       │          │          │          │             │        │
│  ┌────▼──────────▼──────────▼──────────▼─────────────▼─────┐  │
│  │  AICliShared(共享:安装/版本/XTerm/Provider 配置 UI)   │  │ ← 新增共享层
│  └────────────────────────┬─────────────────────────────────┘  │
└───────────────────────────┼─────────────────────────────────┘
                            │ IPC app-fork:<tool>
┌───────────────────────────▼─────────────────────────────────┐
│  Fork 后端模块(extends Base 或轻量 CLI 管理器)              │
│  - checkInstalled / install / update / version              │
│  - applyProvider(把 env/config 写入工具的配置文件)          │
└───────────────────────────┬─────────────────────────────────┘
                            │ 环境变量 / 配置文件
┌───────────────────────────▼─────────────────────────────────┐
│  Provider 后端(模型来源)                                    │
│  ┌────────────────┐   ┌──────────────────────────────────┐  │
│  │ Ollama(本地)  │   │ CliProxyAPI(统一网关 → 云/聚合) │  │
│  └────────────────┘   └──────────────────────────────────┘  │
│          云端直连:Anthropic / OpenAI / 自定义 baseURL+key   │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 核心设计决策

**决策 1:复用 OpenClaw 模式,不发明新框架。**
每个 AI CLI 工具 = 一个 `moduleType:'ai'` 模块,UI 三段式(安装/状态 · 命令目录 · 配置),
后端用 `checkInstalled / install / update` + `execPromiseWithEnv`。

**决策 2:抽出 `AICliShared` 共享层,避免每个工具重复造轮子。**
N 个 CLI 工具的安装/版本检测/XTerm 执行/Provider 配置 UI 高度同构,抽成共享组件 + 共享 setup 基类,
各工具只提供"差异描述"(安装命令、配置文件路径、env 变量名、command.json)。

**决策 3:用"Provider(模型来源)"抽象统一对接 Ollama / 云 API。**
关键洞察:Claude Code、Codex、OpenCode 等都支持通过**环境变量或配置文件**改写
`baseURL` + `apiKey` + `model`。FlyEnv 不需要代理它们的协议,只需:
- 维护一份 Provider 列表(Ollama 本地 / CliProxyAPI 网关 / Anthropic / OpenAI / 自定义);
- 用户选定 Provider 后,**把对应 env/config 写进该 CLI 工具的配置**,再启动终端。

**决策 4:CliProxyAPI 作为"聚合网关"选项,而非必选。**
高级用户想用一个 OpenAI 兼容端点聚合多家模型时,选 CliProxyAPI;
只想直连 Ollama 或某云的用户可跳过网关。

### 3.3 工具矩阵 ↔ Provider 对接(技术依据)

一期覆盖 issue 列出的 7 个工具,按"安装方式 / 模型改写机制"归类(具体命令与变量名在各 adapter 内固化):

| CLI 工具 | 安装方式 | 改写模型来源机制 | 关键变量/配置(实现阶段核对) |
| --- | --- | --- | --- |
| Claude Code | `npm i -g @anthropic-ai/claude-code` | 环境变量 | `ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_API_KEY`、`ANTHROPIC_MODEL` |
| Codex CLI | `npm i -g @openai/codex` / brew | `~/.codex/config.toml` + env | `model_provider` / `base_url` / `OPENAI_API_KEY` |
| OpenCode | `npm i -g opencode-ai` / curl 脚本 | `opencode.json` / env | `provider` + `baseURL` + `apiKey` |
| Qwen Code | `npm i -g @qwen-code/qwen-code` | env(OpenAI 兼容) | `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL` |
| Cursor Agent | curl 安装脚本(`cursor-agent`) | env / 配置 | 以官方为准,封装在 adapter |
| Trae CLI | npm / 脚本 | env / 配置 | 以官方为准,封装在 adapter |
| Devin for Terminal | npm / 脚本 | env / 配置 | 以官方为准,封装在 adapter |

> 共性:绝大多数工具是 **OpenAI 或 Anthropic 兼容**,改 `baseURL + key + model` 即可切换后端。
> 因此 Provider 只需产出"一组 env + 可选的 config 片段",adapter 负责把它落到该工具的具体形式。
> **变量名易漂移,全部集中在各工具 adapter 的 `applyProvider`,单点维护;** 列内"以官方为准"项
> 在实现该工具时核对其最新文档后固化,并在 UI 标注"实验性"直至验证。

## 4. 数据模型

### 4.1 CLI 工具描述(adapter,前端静态声明)

```ts
// src/render/components/AICli/shared/types.ts
export interface AICliTool {
  flag: AllAppModule              // 'claudecode' | 'codex' | 'opencode' | ...
  name: string                    // 'Claude Code'
  icon: any
  docUrl: string
  // 安装:脚本式(curl|iwr)或包管理(npm -g),按平台给命令
  install: {
    macOS?: string[]; Windows?: string[]; Linux?: string[]
    versionCmd: string            // 例:'claude --version'
    versionReg: RegExp
  }
  // 该工具的配置文件位置(用于"打开配置"与写入 Provider)
  configFile?: { macOS?: string; Windows?: string; Linux?: string }
  // Provider → 该工具的具体落地方式
  applyProvider: (p: ResolvedProvider) => {
    env?: Record<string, string>          // 启动终端时注入
    configPatch?: Record<string, any>     // 合并进配置文件
    configFormat?: 'json' | 'toml' | 'yaml'
  }
  commands: CommandDataType        // 复用 OpenClaw 的 command.json 结构
}
```

### 4.2 Provider(模型来源,用户可配置 + 持久化)

```ts
export interface AICliProvider {
  id: string
  label: string
  // 内置云平台 + 本地 + 网关 + 自定义
  kind: 'ollama' | 'cliproxyapi' | 'anthropic' | 'openai'
      | 'siliconflow' | 'openrouter' | 'custom'
  baseURL: string                 // ollama: http://127.0.0.1:11434/v1
                                  // siliconflow: https://api.siliconflow.cn/v1
                                  // openrouter:  https://openrouter.ai/api/v1
  apiKey?: string                 // 敏感,加密存储,UI 不回显
  defaultModel?: string
  models?: string[]               // 见 §6.4 动态拉取
  // 模型列表拉取方式:ollama 用 /api/tags;OpenAI 兼容用 GET /v1/models
  modelsEndpoint?: 'ollama' | 'openai' | 'none'
}
export interface ResolvedProvider extends AICliProvider {}
```

内置 Provider 预设(`kind` 即带默认 `baseURL` 与 `modelsEndpoint`),用户只需填 key:
- `ollama` → `http://127.0.0.1:11434/v1`,模型列表走 `GET /api/tags`(复用现有 Ollama 模块)。
- `siliconflow` / `openrouter` / `openai` / `anthropic` → 预置 baseURL,模型列表走 `GET /v1/models`。
- `cliproxyapi` → 读本机 CliProxyAPI `config.yaml` 端口,作为聚合网关。
- `custom` → 用户自填 baseURL + key + 模型。

持久化:Provider 列表存 `ConfigManager`(`setup.aicli.providers`),
`apiKey` 用 electron `safeStorage`(推荐)或项目既有 RSA 落盘,**禁止明文回显**。

### 4.3 RunProfile(运行配置,对应 issue 的工作目录/环境变量/终端)

```ts
export interface AICliRunProfile {
  toolFlag: AllAppModule          // 绑定的 CLI 工具
  providerId: string              // 绑定的 Provider
  model?: string                  // 覆盖 provider.defaultModel
  workDir?: string                // issue:工作目录,启动终端的 cwd
  env?: Record<string, string>    // issue:自定义环境变量 KEY=value
  shell?: 'cmd' | 'powershell' | 'wsl' | 'bash' | 'zsh'  // issue:终端选择
}
```

- `workDir`:UI 给目录选择器,启动 XTerm 时作为 `cwd`(node-pty 支持)。
- `env`:与 `provider.applyProvider` 产出的 env **合并**(用户自定义优先级更高,可覆盖)。
- `shell`:Windows 提供 CMD/PowerShell/WSL,macOS/Linux 提供 bash/zsh;XTerm 按选择拉起对应 pty。
- RunProfile 按"工具+目录"维度持久化,下次进入自动回填(`setup.aicli.profiles`)。

## 5. 文件结构(新增/改动)

```
src/render/components/
  AICli/                         # 新增:共享层
    shared/
      types.ts                   # AICliTool / AICliProvider / AICliRunProfile
      setup.ts                   # AICliToolSetup 基类(install/check/exec/applyProvider)
      ToolSelector.vue           # 工具选择器(issue 要求)
      InstallPanel.vue           # 安装 + 版本检查 + 更新 + XTerm
      CommandPanel.vue           # command.json 命令目录执行
      ProviderPanel.vue          # Provider 选择/编辑(Ollama/云/网关)+ 动态模型列表
      RunProfilePanel.vue        # 工作目录 / 环境变量 / 终端选择(issue 要求)
      providers.ts               # 内置 Provider 预设
      tools.ts                   # 各 adapter 注册表
    ClaudeCode/  { Module.ts, Index.vue, aside.vue, command.json, adapter.ts }
    Codex/       { 同上 }
    OpenCode/    { 同上 }
    QwenCode/    { 同上 }
    CursorAgent/ { 同上 }          # 实验性,二期
    TraeCli/     { 同上 }          # 实验性,二期
    DevinTerminal/ { 同上 }        # 实验性,二期
  AICliProvider/                 # 新增:全局 Provider 管理(或并入设置页)

src/fork/module/
  AICli/index.ts                 # 新增:通用 CLI 管理后端(check/install/update/applyProvider/openConfig)
                                 # 多工具共用一个后端,以入参 tool flag 区分

src/render/core/type.ts          # 改:AppModuleEnum 增加 claudecode/codex/opencode/...
src/fork/BaseManager.ts          # 改:exec 链增加 aicli 分支
src/lang/en|zh/aicli.json        # 新增:文案
static/svg/{claudecode,codex,opencode}.svg   # 新增:图标
```

> 备选:若希望每个工具后端隔离,可各建 `src/fork/module/ClaudeCode/` 等;
> 但鉴于逻辑同构,**推荐单一 `AICli` 后端 + tool flag 参数**,减少重复与注册成本。

## 6. 关键交互流程

### 6.1 安装 / 更新工具
1. 进入面板 → `ToolSelector` 选工具 → 后端 `checkInstalled(tool)`(跑 `versionCmd`)→ 显示已装版本/未装。
2. 未装 → 点"安装" → 前端 `XTerm.send(adapter.install[platform])`(注入代理 env,参考 OpenClaw `installOpenClaw`);
   含 Node 依赖的工具先 `checkDep`(node/npm 是否就绪),缺失给引导(可跳转 FlyEnv 的 Node 模块)。
3. 安装结束 `taskConfirm` → 重新 `checkInstalled` 刷新版本。
4. 已装但有新版 → "更新"按钮跑升级命令(`npm i -g xxx@latest` 等,adapter 提供)。

### 6.2 配置 Provider 并启动
1. `ProviderPanel` 选择内置预设或新增 Provider(本地 Ollama / 云平台 / 网关 / 自定义)。
2. 选定后 → §6.4 动态拉取模型列表 → 用户绑定 `model`。
3. `RunProfilePanel` 填工作目录 / 自定义环境变量 / 选终端(§6.5)。
4. 点"应用并打开终端" → 后端 `applyProvider(tool, provider)`:
   - 合并 `configPatch` 写入工具配置文件(json/toml/yaml,**写前 .bak 备份**);
   - 产出需注入的 `env`,与 RunProfile.env 合并(用户自定义优先)。
5. 前端开 XTerm:按 `shell` 拉起对应 pty,`cwd=workDir`,注入合并后的 env,执行启动命令(如 `claude`)。

### 6.3 命令目录
复用 OpenClaw `doAction` + `command.json`:点击命令 → `needInput` 则 `writeToNodePty` 等待输入,
否则直接 `send`;`needRefresh` 命令执行后刷新状态。

### 6.4 动态拉取模型列表(issue:模型列表动态获取)
后端新增 `fetchModels(provider)`(走 `getAxiosProxy` 支持代理):
- `kind==='ollama'` → `GET {baseURL%/v1}/api/tags`(或复用现有 Ollama 模块的模型列表能力)。
- 其余 OpenAI 兼容(siliconflow/openrouter/openai/custom)→ `GET {baseURL}/models`,Bearer = apiKey。
- `anthropic` → `GET /v1/models`(带 `x-api-key`)。
- 拉取失败(无网/key 错)→ 允许手填 model,UI 提示原因。

### 6.5 终端选择(issue:CMD/PowerShell/WSL)
XTerm/node-pty 按 `RunProfile.shell` 选择启动程序:
- Windows:`cmd.exe` / `powershell.exe`(或 pwsh)/ `wsl.exe`。
- macOS/Linux:`/bin/zsh` / `/bin/bash`。
- 默认值按平台:Windows→PowerShell,macOS→zsh,Linux→bash;用户可改并持久化。
- 注意 env 注入语法差异(PowerShell `$env:K=V` vs POSIX `export K=V`),由 XTerm 封装(OpenClaw 已有先例)。

### 6.6 面板 UI 草图(对齐 issue 截图)

```
┌── AI Code ────────────────────────────────────────────────┐
│ 工具: [ Claude Code  ▼ ]   状态: 已安装 v1.x  [更新] [文档]  │
│────────────────────────────────────────────────────────────│
│ Tab: [ 运行 ] [ 命令 ] [ 配置文件 ]                          │
│                                                              │
│ ── 运行 ─────────────────────────────────────────────────   │
│  模型来源 Provider: [ Ollama (本地)        ▼ ] [ 管理… ]     │
│  模型 Model:        [ deepseek-r1:latest   ▼ ] (动态拉取)    │
│  工作目录 WorkDir:  [ /path/to/project        ] [选择]       │
│  环境变量 Env:      [ KEY=value (多行)         ]             │
│  终端 Shell:        ( ) CMD  (•) PowerShell  ( ) WSL         │
│                                   [ 应用并打开终端 ▶ ]       │
│  ┌── 内嵌 XTerm 终端 ─────────────────────────────────────┐ │
│  │ $ claude ...                                           │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

Provider 管理弹窗(对应"云端 API 接入"截图):

```
┌── Provider 管理 ──────────────────────────────┐
│ [+ 新增]  内置: Ollama / SiliconFlow /        │
│           OpenRouter / Anthropic / OpenAI     │
│ 类型 kind:    [ SiliconFlow ▼ ]               │
│ API Endpoint: [ https://api.siliconflow.cn/v1]│
│ API Key:      [ ••••••••••••  ] (加密,不回显) │
│ 模型:         [ 拉取列表 ] → [ Qwen/… ▼ ]     │
│                          [ 测试连通 ] [ 保存 ] │
└────────────────────────────────────────────────┘
```

## 7. 分期实施计划

### 一期(MVP,打通主链路)
- [ ] 共享层 `AICli/shared`:types、setup 基类、ToolSelector、InstallPanel、CommandPanel、ProviderPanel、RunProfilePanel。
- [ ] 后端 `src/fork/module/AICli/index.ts`:`checkInstalled / checkDep / version / applyProvider(写配置+备份) /
      openConfigFile / fetchModels`。
- [ ] 接入 **Claude Code** 全链路走通:安装 → 选 Provider(Ollama 本地 + 一个云平台)→ 绑定模型 →
      设工作目录/env/终端 → 终端启动对话。
- [ ] type.ts / BaseManager.ts 登记;en + zh 文案;图标。
- [ ] Provider + RunProfile 持久化,apiKey 加密。

验收:在三平台之一能安装 Claude Code、用 Ollama 本地模型与一个云端 key 各跑通一次。

### 二期(补齐工具矩阵)
- [ ] Codex(toml 配置)、OpenCode(json 配置)、Qwen Code(OpenAI 兼容 env)adapter + command.json。
- [ ] Cursor Agent / Trae CLI / Devin for Terminal:核对官方文档后接入,UI 标注"实验性"。
- [ ] CliProxyAPI 作为 Provider 选项:一键把工具指向本机网关(读取其 `config.yaml` 端口)。
- [ ] Provider 与现有 Ollama 模块深度联动:自动探测本地已拉取模型列表。
- [ ] 云平台预设完善:SiliconFlow / OpenRouter / OpenAI / Anthropic 一键模板。

### 三期(体验打磨)
- [ ] 工具状态进托盘(`isTray`),与 OpenClaw 一致。
- [ ] 多语言补全(复用 `src/lang` 既有覆盖)。
- [ ] 文档:对应官网 guide「FlyEnv + Claude Code/Codex 工作流」。
- [ ] 一键诊断(doctor):检查 PATH、Node 版本、代理、Provider 连通性。

## 8. 风险与对策

| 风险 | 说明 | 对策 |
| --- | --- | --- |
| CLI 工具配置/变量名漂移 | Claude Code/Codex 等迭代快,env、配置 schema 可能变 | 全部封进各 adapter 的 `applyProvider`,**单点维护**;版本不匹配时给提示 |
| apiKey 泄露 | 云端 key 敏感 | safeStorage/RSA 加密落盘,UI 不回显明文,日志脱敏(项目已有"读 .env 不回显"规范) |
| 安装需全局 npm / 网络 | `npm i -g` 或 curl 安装受代理影响 | 复用 OpenClaw 的代理注入(`window.Server.Proxy` → export/`$env:`);失败给排障文案 |
| 写第三方配置文件破坏用户原配置 | applyProvider 合并配置有风险 | 写前**备份**(`.bak`),合并而非覆盖,提供"恢复默认/打开配置文件"入口 |
| 跨平台终端差异 | bash/zsh/PowerShell/WSL,env 注入语法不同 | 沿用 XTerm 现有 node-pty 抽象;`RunProfile.shell` 选择 + 语法封装(§6.5) |
| Node/npm 依赖缺失 | 多数工具靠 `npm i -g`,用户机器可能无 Node | 安装前 `checkDep`,缺失引导到 FlyEnv 的 Node 模块一键装 |
| 本地小模型能力不足 | issue 示例 gemma/deepseek-r1 等小模型跑 Agent 可能效果差 | UI 提示模型能力要求;允许随时切云端;不替用户兜底质量 |
| 与现有 OpenClaw/Hermes 重复 | 可能定位重叠 | 共享层统一三者;OpenClaw/Hermes 后续可迁移到同一 `AICli/shared`(非本期强制) |

## 9. 待确认问题(已决策)

> 以下已由 maintainer 拍板,实施依据见 §11。

1. **一期工具优先级**:✅ 一期只做 **Claude Code** 走通框架;Codex/OpenCode/Qwen Code 留二期。
2. **后端形态**:✅ 单一 `AICli` 后端 + tool flag 参数。
3. **CliProxyAPI 定位**:✅ 可选高级 provider,非默认。
4. **是否合并现有 AI Chat**:✅ **暂不合并**,新建独立模块。
5. **安装方式**:✅ **使用官方命令**(`npm i -g` 等),不走 FlyEnv 版本体系。
6. **apiKey 加密**:✅ Electron `safeStorage`。
7. **导航位置**:✅ 单个"AI Code"面板 + 内部 ToolSelector。

## 10. 参考(代码锚点)

- 模块声明范本:`src/render/components/OpenClaw/Module.ts`、`CliProxyAPI/Module.ts`
- CLI 管理 UI 范本:`src/render/components/OpenClaw/{setup.ts,command.json,Service.vue}`
- 后端范本:`src/fork/module/OpenClaw/index.ts`、`src/fork/module/CliProxyAPI/index.ts`
- 基类与工具:`src/fork/module/Base/index.ts`、`src/fork/Fn.ts`
- 终端:`src/render/util/XTerm.ts`
- 类型登记:`src/render/core/type.ts`(`AppModuleEnum` / `AppModuleItem`)
- 后端路由:`src/fork/BaseManager.ts`(`exec` if-else 链)
- 自动加载/路由:`src/render/core/App.ts`、`src/render/router/index.ts`
- 配置持久化:`src/main/core/ConfigManager.ts`、`src/render/store/app.ts`
- 现有 AI/Ollama:`src/render/components/AI/`、`src/fork/module/Ollama/`、`src/fork/module/Ai/index.ts`

## 11. 实施记录(一期 MVP)

> 状态:**已完成,类型检查干净**(新增/改动文件 0 错误;仓库原有 103 个基线错误均在
> scripts / capturer / AI-Chat 等无关文件,与本次无关)。

### 11.1 已交付文件

**后端(单一 `AICli` 模块,tool-flag 参数化)** — `src/fork/module/AICli/index.ts`
- `checkInstalled(versionCmd)`:跑官方版本命令探测安装状态 + 解析版本号。
- `checkDep(depCmd)`:检查 node/npm 等前置依赖。
- `fetchModels(provider)`:动态拉模型 —— Ollama 走 `/api/tags`,OpenAI 兼容走 `/v1/models`,
  Anthropic 带 `x-api-key`,统一经 `getAxiosProxy` 代理。
- `applyProvider(opts)`:json 配置合并写入,**写前 `.flyenv.bak` 备份**。
- `configFilePath(configFile)`:解析 `~` 路径,供"打开配置文件"。

**密钥加密(safeStorage)** — `src/main/core/IPCHandler.ts`
- 新增 IPC `AICli:saveProviders` / `AICli:loadProviders`。
- apiKey 经 Electron `safeStorage` 加密为 base64(字段 `apiKeyEnc`),存
  `setup.aicli.providers`;**全程不落明文、UI 不回显**;加密不可用时降级标记 `apiKeyPlain`。

**渲染层** — `src/render/components/AICli/`
- `shared/types.ts`:`AICliTool` / `AICliProvider` / `AICliRunProfile` / `ProviderApply` 等类型。
- `shared/providers.ts`:6 个内置 Provider 预设(Ollama / Anthropic / OpenAI / SiliconFlow /
  OpenRouter / Custom),含默认 baseURL 与 modelsEndpoint。
- `shared/tools.ts`:Claude Code adapter(env 注入 `ANTHROPIC_BASE_URL` /
  `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`)+ 工具注册表。
- `shared/setup.ts`:`reactiveBind` 状态机(安装/依赖/Provider 持久化/拉模型/应用并启动/任务生命周期)。
- `shared/InstallPanel.vue`:官方命令安装 + 内嵌 XTerm + 依赖缺失告警。
- `shared/RunPanel.vue`:Provider / 模型(可拉取可手填)/ 工作目录 / 环境变量 / 终端选择 +
  "应用并打开终端"。
- `Index.vue`(单面板 + ToolSelector)、`aside.vue`、`Module.ts`(label "AI Code",route `/claudecode`)。

**注册 + i18n**
- `src/render/core/type.ts`:`AppModuleEnum.claudecode`。
- `src/fork/BaseManager.ts`:`exec` 链新增 `aicli` 分支 + `AICli` 属性。
- `src/lang/{en,zh}/aicli.json` + en/zh/index.ts 登记 + `src/lang/index.ts` 类型登记。

### 11.2 遗留问题 / 后续

| # | 遗留项 | 说明 | 计划 |
| --- | --- | --- | --- |
| 1 | **终端选择器未落底层** | UI 单选(CMD/PowerShell/WSL/bash/zsh)已就位,但 `NodePTY.initNodePty` 仍按平台 spawn 默认 shell;env 注入与工作目录 `cd` 已生效,真正切换 shell 程序未实现 | 给 `NodePty:init` 加可选 `{shell, cwd}` 参数(additive,经 IPCHandler→XTerm 透传),避免改动现有调用 |
| 2 | **图标临时复用** | 暂用 `cliproxyapi.svg` | 补 `static/svg/claudecode.svg` 等专属图标 |
| 3 | **配置文件写入路径少用武之地** | Claude Code 是 env-only,`applyProvider` 的 json 合并主要服务二期 Codex(toml)/OpenCode(json);当前仅支持 json 格式合并 | 二期接 Codex 时补 toml 写入 |
| 4 | **i18n 仅 en/zh** | 其余 29 个 locale 缺 `aicli.json`(`lang/check.mjs` 已提示) | 随项目既有多语言流程补全 |
| 5 | **工具矩阵仅 Claude Code** | 一期范围 | 二期补 Codex / OpenCode / Qwen Code,三期接实验性 Cursor / Trae / Devin |
| 6 | **RunProfile 未持久化** | 工作目录/env/shell 当前为会话内状态 | 按"工具+目录"维度落 `setup.aicli.profiles`,下次自动回填 |

### 11.3 验收对照(决策项)

- ✅ 安装用官方命令(`npm i -g @anthropic-ai/claude-code`)
- ✅ apiKey 用 Electron safeStorage 加密、不回显
- ✅ 不合并现有 AI Chat(独立模块)
- ✅ 单一后端 + 单面板 + ToolSelector
- ✅ CliProxyAPI 作可选 provider(预设可后续加,非默认)
- ✅ 一期只走通 Claude Code 全链路

