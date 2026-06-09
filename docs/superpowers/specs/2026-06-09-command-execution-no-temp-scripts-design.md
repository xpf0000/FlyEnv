# FlyEnv 命令执行去临时脚本化设计方案

日期：2026-06-09

## 背景

FlyEnv 当前在启动服务、调用 Helper、同步环境、运行用户代码和打开终端时，会生成不少 `.cmd`、`.ps1`、`.sh` 包装脚本，再通过 shell 或 PowerShell 执行。Windows 上这类临时执行文件容易被杀毒软件拦截，导致服务启动、环境同步或 Helper 操作失败。

本方案的目标是减少“执行命令时临时落地脚本文件”的行为。业务上必须持久化的文件不纳入清理范围，例如日志、PID 文件、用户源码、计划任务配置和用户显式选择的脚本文件。

## 当前主要落地点

1. Windows 服务启动

   `src/fork/util/ServiceStart.win.ts` 会读取 `static/sh/Windows/flyenv-async-exec.ps1`、`flyenv-async-exec.cmd`、`flyenv-customer-exec.ps1`，替换占位符后写入服务目录，再执行这些 `.ps1/.cmd` 文件。

   关键位置：

   - `src/fork/util/ServiceStart.win.ts:86`
   - `src/fork/util/ServiceStart.win.ts:98`
   - `src/fork/util/ServiceStart.win.ts:224`
   - `src/fork/util/ServiceStart.win.ts:241`
   - `src/fork/util/ServiceStart.win.ts:336`
   - `src/fork/util/ServiceStart.win.ts:361`

2. Unix 服务启动

   `src/fork/util/ServiceStart.ts` 会生成 `start-*.sh`，普通启动用 `bash/zsh` 执行，root 启动通过 Go Helper 的 `runScript` 执行脚本路径。

   关键位置：

   - `src/fork/util/ServiceStart.ts:81`
   - `src/fork/util/ServiceStart.ts:93`
   - `src/fork/util/ServiceStart.ts:105`
   - `src/fork/util/ServiceStart.ts:208`
   - `src/fork/util/ServiceStart.ts:245`

3. Go Helper 内部 PowerShell 执行

   `src/helper-go/module/tool.go` 的 `runPowerShellScript` 当前会把 PowerShell 内容写入临时 `.ps1`，再用 `-File` 执行。

   关键位置：

   - `src/helper-go/module/tool.go:60`
   - `src/helper-go/module/tool.go:63`
   - `src/helper-go/module/tool.go:68`

4. Windows 环境同步

   `src/shared/EnvSync.ts` 会把 `static/sh/Windows/env-get.ps1` 复制到 cache，再用 `-File` 执行。

   关键位置：

   - `src/shared/EnvSync.ts:24`
   - `src/shared/EnvSync.ts:75`

5. 旧提权执行封装

   `src/shared/Sudo.ts` 的 Windows 路径会写 `command.bat` 和 `execute.bat`，再通过 PowerShell `Start-Process -Verb runAs` 执行。当前项目已有 Go Helper，应优先把需要提权的操作收敛到 Helper，不再扩展这条旧路径。

   关键位置：

   - `src/shared/Sudo.ts:217`
   - `src/shared/Sudo.ts:237`
   - `src/shared/Sudo.ts:331`

6. 其他零散场景

   - 代码运行器：`src/fork/module/Code/index.ts` 会为不同语言生成 `.ps1/.sh` 包装脚本。
   - Windows Cron：`src/fork/module/Cron/WindowsSystemScheduler.ts` 会生成持久化 `.ps1`，并在每次执行时生成临时 `.cmd`。
   - Python 安装：`src/fork/module/Python/index.ts` 会生成安装用 `.ps1`。
   - 打开终端：`src/fork/module/LanguageProject/index.ts` 等位置会复制 `exec-by-terminal.ps1/.sh` 或生成命令文件。

## 设计目标

1. 执行命令时尽量不生成临时 `.cmd/.ps1/.sh` 文件。
2. Windows 优先，因为杀毒软件拦截风险最高。
3. 默认使用可执行文件加参数数组执行，避免 shell 字符串拼接。
4. 需要 shell 语义时，使用内存命令：
   - PowerShell 使用 `-EncodedCommand`。
   - cmd 使用 `cmd.exe /d /s /c <command>`。
   - bash/zsh 使用 `bash -lc <command>` 或 `zsh -lc <command>`。
5. Helper 侧继续保持白名单、参数校验、路径校验和命令长度限制。
6. 保留日志、PID、用户源码、计划任务配置等业务文件。

## 可选方案

~~### 方案 A：局部替换热点~~

直接把当前最容易触发杀软的 `.ps1/.cmd` 生成点替换成 `-EncodedCommand` 或 `spawn`。

优点：

- 改动小，见效快。
- 可以优先解决 Go Helper 和 Windows 服务启动。

缺点：

- 执行逻辑仍然分散。
- 后续容易新增新的临时脚本落地点。
- 引号、编码、日志重定向逻辑会在多个模块重复。

### 方案 B：新增统一命令执行器后迁移

新增 TypeScript 和 Go 两侧的统一执行封装，然后分阶段迁移服务启动、Helper、环境同步、代码运行器和终端打开逻辑。

优点：

- 能形成统一边界，后续更容易维护。
- 可以集中处理 PowerShell 编码、cmd 执行、日志重定向、环境变量和错误信息。
- 便于增加扫描测试，防止回归。

缺点：

- 首轮改动比方案 A 多。
- 服务启动路径多，需要分阶段验证。

~~### 方案 C：全部下沉到 Go Helper~~

把更多命令执行、服务启动和系统操作都下沉到 Go Helper，由 Helper 做原生进程启动、注册表读取、权限操作和日志重定向。

优点：

- Windows 上更接近系统原生能力。
- 可以减少 Node/Electron 侧 shell 差异。

缺点：

- 改动最大。
- Helper 协议和安全边界需要扩展较多。
- 需要更完整的跨平台测试。

## 推荐方案

推荐采用方案 B：新增统一命令执行器后迁移。

方案 B 的风险和收益比较平衡。它可以先解决 Windows 临时脚本问题，同时避免在每个模块里各自处理 quoting、encoding、cwd、env、stdout/stderr 重定向和 PID 返回。

## 推荐架构

### TypeScript 执行器

新增一个集中封装，例如 `src/shared/CommandExecutor.ts` 或 `src/fork/util/CommandExecutor.ts`。如果只在 fork 进程使用，优先放在 `src/fork/util/`；如果 main/fork 都需要，放在 `src/shared/`。

建议能力：

1. `runPowerShellInline(script, options)`

   - 将脚本文本按 UTF-16LE 编码为 base64。
   - 使用 `powershell.exe -NoProfile -ExecutionPolicy Bypass -NonInteractive -EncodedCommand <payload>` 执行。
   - 支持 `cwd`、`env`、`windowsHide`。
   - 不执行 `Unblock-File`，因为不再有脚本文件。

2. `runCmdInline(command, options)`

   - 使用 `cmd.exe /d /s /c <command>`。
   - 只在确实需要 cmd 语义时使用，例如 `.cmd/.bat` 或 `start`、重定向、内建命令。

3. `spawnDetachedWithLogs(params)`

   - 参数包括 `file`、`args`、`cwd`、`env`、`stdoutFile`、`stderrFile`、`pidPath`。
   - 直接打开日志文件句柄作为 stdout/stderr。
   - Windows 使用 `windowsHide: true`。
   - 优先直接 `spawn(file, args, ...)`，不经 shell。

4. `runShellInline(shell, command, options)`

   - Unix 下使用 `bash -lc` 或 `zsh -lc`。
   - Windows 下不使用此接口，统一走 PowerShell 或 cmd。

### Go Helper 执行器

在 `src/helper-go/utils` 或 `src/helper-go/module` 中新增 PowerShell inline 执行能力。

建议能力：

1. `ExecPowerShellEncoded(script string, options map[string]interface{})`

   - UTF-16LE base64 编码。
   - 调用 `utils.ExecCommand(utils.GetPowerShellExe(), args, options)`。
   - 替换 `runPowerShellScript` 的临时 `.ps1` 写入。

2. `RunInlineScript(shell, script, cwd, env)`

   - Unix only。
   - shell 仍然走 `ValidateShell` 白名单。
   - script 设置长度上限，例如 64 KB。
   - cwd 必须通过路径校验。
   - 使用 `exec.Command(shell, "-lc", script)`，不写 `.sh`。

~~3. Helper 协议扩展~~

   ~~- 在 `src/fork/Helper.ts` 增加新的 `FN` 类型。
   - 在 `src/helper-go/main.go` 增加分发。
   - 在 `src/helper-go/contract/helper-contract.json` 增加契约。
   - 保留旧 `runScript` 一段时间作为兼容入口，但新代码不再调用它。~~
  **不需要。 帮助程序和主程序版本是对应的， 不会向下兼容。**

## 迁移策略

### 阶段 1：Helper 和环境同步

1. 把 `src/helper-go/module/tool.go` 的 `runPowerShellScript` 改为 `-EncodedCommand`。
2. `ProcessListWin` 继续返回 JSON 字符串，但不再写临时 `.ps1`。
3. `EnvSync.getWindowsAllEnv()` 不再复制 `env-get.ps1` 到 cache。
~~4. 优先方案是新增 Helper 方法读取 Machine/User 环境变量并合并 PATH。~~
~~5. Helper 不可用时 fallback 到 `process.env` 或 encoded PowerShell，不再落地脚本。~~
**EnvSync.getWindowsAllEnv()还按照目前的逻辑。只需要不再复制 `env-get.ps1`，使用encoded PowerShell就行。**

验证重点：

- Windows 能正常获取完整 PATH。
- `EnvSync.CMDPath` 和 `EnvSync.PowerShellPath` 正确。
- Helper 的 `processListWin` 正常返回进程 JSON。

### 阶段 2：Windows 服务启动

1. 将 `serviceStartExec` 中的 `.ps1` 模板替换为 `spawnDetachedWithLogs` 或 `runPowerShellInline`。
2. 将 `serviceStartExecCMD` 中的 `.cmd` 模板替换为 `cmd /c` inline 或直接 spawn。
3. 将 `customerServiceStartExec` 中的 `version.id.start.ps1` 和 `start-*.ps1` 替换为：
   - `commandType === 'file'`：直接执行用户选择文件。
   - `commandType === 'command'`：用 `runPowerShellInline` 执行命令文本。
4. 保留 `out.log`、`error.log`、`pidPath`。
5. 对已能直接 detached spawn 的模块，逐步复用现有 `serviceStartSpawn` 的思路，并合并重复逻辑。

验证重点：

- Nginx、Apache、MySQL、PostgreSQL、Redis、MongoDB、Caddy、Tomcat、RabbitMQ 等服务启动和停止正常。
- `checkPidFile` 为 true 和 false 的模块都能返回正确 PID。
- 启动失败时仍能从 stderr/log 取到错误信息。

### 阶段 3：用户命令和代码运行

1. `src/fork/module/Code/index.ts` 仍然允许落地用户源码文件，例如 `.js/.ts/.py/.php`。
2. 去掉语言 wrapper `.ps1/.sh`。
3. 通过执行器设置 PATH 和 env 后直接执行解释器或编译器。
4. `ModuleCustomer` 和 `LanguageProject` 的 `commandType === 'command'` 改为 inline shell 执行。
5. `commandType === 'file'` 保持直接执行文件，不复制为包装脚本。

验证重点：

- JavaScript、TypeScript、PHP、Java、Go、Rust、Python、Ruby、Perl 代码运行正常。
- 用户自定义模块的服务模式和非服务模式正常。
- open in terminal 仍可打开终端。

### 阶段 4：安装器、终端和 Cron

1. Python 安装脚本改为 encoded PowerShell 或拆成直接命令调用。
2. Windows 打开终端改为 `Start-Process` 加 `-EncodedCommand`，不复制 `exec-by-terminal.ps1`。
3. Linux/macOS 打开终端的 `.sh/.scpt` 后续再处理，优先级低于 Windows。
4. Cron 的持久化任务 action 可以保留，因为计划任务需要一个未来可执行入口。
5. Windows Cron 每次运行时生成 `$CmdFile` 的逻辑改为 `cmd.exe /d /s /c $Command`，不再生成临时 `.cmd`。
6. 如果任务 action 的命令长度可控，可评估把持久化 `.ps1` 替换成 `powershell -EncodedCommand <payload>`；如果超过 `schtasks /TR` 长度限制，则保留稳定 wrapper。

验证重点：

- Python 安装完整流程正常。
- Cron 创建、触发、记录运行日志正常。
- 终端打开体验不退化。

## 安全和兼容性约束

1. 默认不用 shell，能 `spawn(file, args)` 就直接执行。
2. 需要 PowerShell 脚本文本时统一用 `-EncodedCommand`。
3. 需要 cmd 语义时统一用 `cmd.exe /d /s /c`。
4. Helper 新增 inline script 接口必须限制：
   - shell 白名单。
   - script 长度。
   - cwd 路径。
   - env key/value。
   - 不允许路径穿越。
5. 不把用户命令写入临时 `.cmd/.ps1/.sh`。
6. 日志和 PID 文件继续保留。
7. 对计划任务、登录项、系统 PATH 这类持久化系统配置，允许保留系统要求的持久化配置。

## 风险点

1. 部分服务可能依赖 cmd 的 `start /B` 行为。迁移时需要逐个验证 Windows 服务模块。
2. 当前很多 `execArgs` 是字符串，不是数组。直接 spawn 前需要明确哪些模块可以安全拆分参数，哪些模块必须继续走 shell inline。
3. PowerShell `Start-Process -ArgumentList` 和 Node `spawn(args)` 的参数解析行为不同，需要覆盖带空格路径、引号、特殊字符。
4. UAC 场景如果不用常驻 Helper，很难在不写中间文件的情况下捕获 stdout/stderr。FlyEnv 已有 Go Helper，后续提权命令应优先走 Helper。
5. Cron 是未来执行，不是当前进程内执行，完全内存化不现实。目标应是减少临时执行文件，而不是取消所有持久化任务入口。

## 验证方案

1. 静态扫描

   增加一个脚本或测试，扫描新增代码中是否出现以下模式：

   - `writeFile(... .ps1)`
   - `writeFile(... .cmd)`
   - `writeFile(... .sh)`
   - `copyFile(... exec-by-terminal.ps1)`
   - `powershell ... -File <cache path>`

   白名单包括：

   - `static/sh/**` 中的发行内置脚本。
   - 用户源码文件。
   - Cron 的稳定持久化任务入口。
   - 工具初始化时显式安装到 bin 目录的持久化脚本。

2. Go Helper 测试

   - `go test ./...` 在 `src/helper-go` 下执行。
   - 覆盖 `ExecPowerShellEncoded`、`ProcessListWin`、新增 Helper contract 校验。

3. TypeScript 验证

   - 执行项目现有 lint/typecheck 命令。
   - 对 CommandExecutor 增加小范围单元测试或脚本级验证。

4. Windows 手动回归

   - 启动和停止核心服务：Nginx、Apache、MySQL、PostgreSQL、Redis、MongoDB。
   - 执行 Helper 功能：读写系统 PATH、刷新 DNS、kill port、process list。
   - 运行 Code 模块支持的语言。
   - 创建和触发 Cron。
   - 打开终端运行项目命令。

## 完成标准

1. Windows 服务启动主路径不再生成临时 `.ps1/.cmd`。
2. Go Helper 的 PowerShell 执行不再生成临时 `.ps1`。
3. Windows 环境同步不再复制 `env-get.ps1` 到 cache。
4. 自定义命令和代码运行不再生成包装 `.ps1/.sh`，只保留必要源码文件。
5. 保留明确白名单的持久化脚本，不再出现新的临时执行脚本落地点。
6. 核心 Windows 服务和 Helper 功能通过回归验证。

