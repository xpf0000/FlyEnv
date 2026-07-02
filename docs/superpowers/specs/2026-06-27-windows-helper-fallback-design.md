# FlyEnv Windows Helper 缺失与单次授权回退设计

日期：2026-06-27

## 背景

FlyEnv 当前在 Windows 上依赖 `flyenv-helper.exe` 承接一组需要管理员权限的操作，包括受保护文件读写删除、机器级环境变量修改、计划任务创建删除，以及根证书导入。

这个 helper 因为没有代码签名，容易被杀毒软件直接删除。当前实现有三个问题：

1. 安装逻辑默认 helper 安装源文件存在，文件被删后仍会继续尝试安装，最终走到一个必然失败的流程。
2. 健康检查只关注 socket/version，不先确认 helper 二进制是否还在，导致“文件不存在”和“需要安装/更新”被混在一起。
3. 一旦 helper 不可用，当前大量 Windows 受限操作会直接失败，或误触发“去安装 helper”的提示，而不是回退到一次性 UAC 授权执行。

本设计的目标是在不改变 helper 为首选路径的前提下，为 Windows 增加“helper 缺失时的可靠降级路径”。

## 目标

1. Windows 安装 helper 前，先检查 helper 安装源文件是否存在；不存在时跳过安装。
2. Windows helper 检测前，先检查 helper 二进制是否存在；不存在时返回稳定的特定错误。
3. 对一组受控白名单操作，在 helper 不可用时自动回退到 PowerShell 单次授权执行。
4. 保持 helper 仍然是 Windows 上的首选执行路径；helper 正常时不改变当前行为。
5. 保持参数校验、路径校验和权限边界，不因为回退机制而放宽现有安全约束。

## 非目标

1. 不把所有 `Helper.send(...)` 方法都改成 PowerShell 回退。
2. 不重写或替换 `@shared/Sudo` 的 Windows 提权机制。
3. 不要求完全消除 `@shared/Sudo` 内部已有的 `command.bat` / `execute.bat` 临时文件。
4. 不处理 macOS / Linux helper 的相同行为。
5. 不修改 Go helper 协议，不增加向下兼容层。

## 现状

当前关键链路如下：

1. `src/main/core/AppHelper.ts`

   负责生成安装命令并执行安装。Windows 下会直接引用 helper 安装源文件生成 PowerShell 安装命令，但在生成前不会确认源文件是否存在。

2. `src/shared/AppHelperCheck.ts`

   负责 helper 健康检查。当前会直接连接 socket 并请求版本，不会先检查 Windows helper 文件是否存在。

3. `src/fork/Helper.ts`

   负责 fork 侧统一发送 helper 请求。当前在 helper 不可用时，会把大量情况都视为“需要安装 helper”，并触发安装提示。

4. 受限操作当前散落在 `src/main`、`src/fork`、`src/shared` 多处，但最终大多都经由 `Helper.send(...)` 走 helper。

## 范围

本次 Windows PowerShell 单次授权回退只覆盖以下白名单方法：

1. `tools/writeFileByRoot`
2. `tools/writeBufferBase64ByRoot`
3. `tools/rm`
4. `tools/setSystemPath`
5. `tools/setSystemEnv`
6. `tools/setAutoStartWin`
7. `host/sslAddTrustedCert`

不在白名单内的方法，即使 helper 缺失，也不自动回退，仍按原有错误链路返回失败。

## 方案对比

### 方案 A：在各调用点各自回退

在 `writeFileByRoot()`、`removeByRoot()`、`writePath()`、`windowsAutoLaunch()`、`Host/SSL.ts` 等位置分别拼接 PowerShell `runAs` 命令。

优点：

- 改动直观
- 局部问题可单独处理

缺点：

- 提权逻辑分散
- 参数转义、日志和错误处理难以统一
- 很容易遗漏 renderer / main / fork 三条不同调用链

### 方案 B：在 `Helper.send()` 上做统一白名单回退

保留 helper 为首选路径，在 Windows 上只对白名单方法增加集中式 PowerShell 单次授权回退层。

优点：

- 统一入口，行为一致
- 业务侧基本无需感知 helper 还是 PowerShell
- 更容易约束安全边界与测试范围

缺点：

- 需要在 TypeScript 侧补一层参数校验和错误分类
- 需要仔细处理大 payload 写入场景

### 方案 C：完全绕开 `Helper.send()`，单独做 Windows 权限 API

新增一套独立的 Windows 权限接口，调用处不再经过 `Helper.send()`。

优点：

- helper 与 fallback 逻辑物理隔离

缺点：

- 调用面会被拆成两套
- 现有业务层改动大
- 后续维护成本高

## 推荐方案

采用方案 B。

原因：

1. 用户的问题本质上是“Windows helper 不可靠时的统一降级策略”，不是单个功能点修补。
2. 现有 helper 调用已经集中在 `Helper.send()`，这是最合适的分流点。
3. 业务层已有很多对 helper 的包装，保持接口不变能显著降低回归风险。

## 设计总览

整体设计分为四层：

1. Windows helper 文件定位与错误分类
2. 安装和检测行为修正
3. `Helper.send()` 白名单分流
4. PowerShell 单次授权回退执行器

执行顺序如下：

1. 先定位 Windows helper 二进制路径。
2. 在 helper 检测前先判断文件是否存在。
3. 如果 helper 缺失：
   - 白名单操作直接走 PowerShell 单次授权回退。
   - 非白名单操作返回特定错误，不进入安装提示。
4. 如果 helper 文件存在但连不上或版本异常：
   - 白名单操作允许回退执行。
   - helper 仍被标记为异常，显式 helper 检测与修复入口仍可继续使用。
5. 如果 helper 健康，保持现状，优先走 helper。

## 详细设计

### 1. Windows helper 路径定位

新增统一的 Windows helper 路径解析函数，例如放在 `src/shared/AppHelperCheck.ts` 或其相邻共享模块：

- `getWindowsHelperBinaryPath(): string`
- `windowsHelperBinaryExists(): boolean`

该函数负责统一返回当前环境下“预期应存在”的 helper 路径：

1. 生产环境：

   指向打包后的 `resources/helper/flyenv-helper.exe`。

2. 开发环境：

   指向 `src/helper-go/dist/flyenv-helper-windows-amd64-v1.exe`。

所有 Windows helper 安装前检查、健康检查、UI 展示都统一走这个函数，不再在多处手写路径。

### 2. Helper 错误分类

新增稳定错误码，不再依赖模糊字符串比较。建议定义共享错误码常量：

1. `helper_binary_missing`
2. `helper_unreachable`
3. `helper_version_mismatch`
4. `helper_execution_failed`
5. `windows_fallback_not_supported`

建议配套一个轻量错误类型，例如：

- `AppHelperCheckError extends Error`
- 字段：`code`、`details?`

这样 `AppHelperCheck()`、`Helper.send()`、IPC 返回值和 renderer UI 都能基于结构化错误码分支，而不是猜测错误文本。

### 3. 安装与检测行为修正

#### 3.1 `AppHelperCheck()` 先检查文件再检查 socket

Windows 下 `AppHelperCheck()` 改为：

1. 调用 `windowsHelperBinaryExists()`
2. 文件不存在时，直接 reject `helper_binary_missing`
3. 文件存在时，继续现有 socket 连接和版本检查
4. socket 连不上时返回 `helper_unreachable`
5. 版本不一致时返回 `helper_version_mismatch`

这样“helper 文件被删了”和“helper 还在但需要修复”会被明确区分。

#### 3.2 `AppHelper.command()` 生成安装命令前先检查源文件

Windows 下在 `AppHelper.command()` 生成安装命令前，先确认 helper 安装源文件存在。

如果源文件不存在：

- 直接抛出 `helper_binary_missing`
- 不生成任何安装命令

这样可以避免生成一个引用缺失 exe 的安装脚本。

#### 3.3 `AppHelper.initHelper()` 在 Windows helper 缺失时跳过安装

`AppHelper.initHelper()` 调整为：

1. 先调用 `AppHelperCheck()`
2. 若成功，保持现状
3. 若失败且错误码为 `helper_binary_missing`：
   - 不进入 `this.command()`
   - 不调用 `Sudo(...)`
   - 直接返回该特定错误
4. 若失败且为 `helper_unreachable` / `helper_version_mismatch`：
   - 保留当前安装 / 修复流程

这满足“安装 helper 之前先判断 helper 是否存在，不存在就跳过安装”。

### 4. `Helper.send()` 白名单分流

`Helper.send()` 是本次最核心的分流点。

#### 4.1 白名单判断

新增 `isWindowsHelperFallbackAllowed(module, fn): boolean`，仅对白名单返回 `true`。

#### 4.2 行为分支

Windows 下发送 helper 请求时，按以下顺序处理：

1. 先做现有基础参数校验。
2. 调用 `AppHelperCheck()` 判断 helper 状态。
3. 若 helper 健康：
   - 走现有 socket helper 路径。
4. 若 helper 不健康且当前方法在白名单内：
   - 不触发 `needInstall()` 提示。
   - 直接调用 Windows PowerShell 单次授权回退执行器。
5. 若 helper 不健康且当前方法不在白名单内：
   - `helper_binary_missing` 时，直接 reject 该特定错误，不触发安装提示。
   - `helper_unreachable` / `helper_version_mismatch` 时，保留现有 helper 修复提示链路。

#### 4.3 对 UI 的影响

白名单操作因为 fallback 能完成，不应再因为 helper 缺失而打断用户流程。

因此：

1. 白名单 fallback 发生时，不弹“安装 helper”确认框。
2. 显式的 helper 检测、修复页、设置页中的 helper 操作仍可展示 helper 异常状态。
3. Windows 上 `helper_binary_missing` 不再触发“打开 helper 所在目录手动安装”的提示，因为该文件本身已不存在。

### 5. Windows PowerShell 单次授权回退执行器

新增集中式模块，例如：

- `src/shared/WindowsHelperFallback.ts`

建议暴露统一入口：

- `runWindowsHelperFallback(module, fn, args): Promise<any>`

该模块只接受白名单方法，非白名单一律返回 `windows_fallback_not_supported`。

#### 5.1 执行策略

回退执行复用现有 `@shared/Sudo`，但不再额外生成 `.ps1` 执行脚本。

执行方式为：

1. 动态构造 PowerShell 脚本文本
2. 使用现有 `encodePowerShellCommand()` 按 UTF-16LE 编码为 base64
3. 通过 `Sudo()` 执行：

   - `powershell.exe -NoProfile -ExecutionPolicy Bypass -NonInteractive -EncodedCommand <payload>`

这意味着：

1. 不新增落地 `fallback.ps1`
2. 默认不新增落地 `payload.json`
3. 执行脚本体完全走内联 base64

#### 5.2 与 `@shared/Sudo` 的关系

当前 `@shared/Sudo` 在 Windows 上内部仍会生成 `command.bat` 和 `execute.bat`。

本设计不修改这部分旧机制，因此“完全无落地文件”并不成立。

本设计的约束是：

1. 不再额外落地 `.ps1` 脚本文件
2. 默认不落地 payload 文件
3. 仅在大 payload 的写文件场景下，才退化为“临时数据文件 + 内联 PowerShell”

### 6. 大 payload 分流策略

`tools/writeFileByRoot` 与 `tools/writeBufferBase64ByRoot` 需要特别处理。

原因：

1. `Sudo()` 最终会把命令写入 `command.bat`
2. Windows batch 行长度有限
3. 图片、证书、较大配置文件的 base64 内容如果全部内联，极易超出安全长度

因此写入类回退采用“双档策略”：

#### 6.1 小 payload：纯内联

当最终 PowerShell 命令长度不超过一个保守阈值时，直接把内容作为内联字符串执行。

建议实现为：

1. 先生成最终 `instance.command`
2. 若长度 `<= 6000` 字符，则走纯内联 `-EncodedCommand`

这样可显著降低碰到 batch 长度边界的风险。

#### 6.2 大 payload：临时数据文件 + 内联 PowerShell

若最终命令长度超过阈值：

1. 只落地一个临时数据文件
2. 不落地 `.ps1`
3. 仍然通过较短的 `-EncodedCommand` 读取该临时数据文件并完成操作

这条路径适用于：

1. 较大文本写入
2. 二进制 base64 写入

该设计兼顾了稳定性与“尽量不落地执行脚本”的要求。

### 7. 回退执行的参数校验

helper 回退不能绕过原本在 Go helper 里的参数约束。

因此在 TypeScript fallback 层必须补齐方法级校验，至少覆盖：

1. `writeFileByRoot`
   - 目标路径合法
   - 内容类型必须为字符串

2. `writeBufferBase64ByRoot`
   - 目标路径合法
   - 内容必须是 base64 字符串

3. `rm`
   - 删除路径合法

4. `setSystemPath`
   - 每个 PATH 项必须通过 Windows PATH 项校验
   - `otherVars` 的 key/value 需通过系统环境变量校验

5. `setSystemEnv`
   - key/value 必须通过系统环境变量校验

6. `setAutoStartWin`
   - `enabled` 必须为布尔值
   - `taskName`、`exePath` 必须通过计划任务校验

7. `sslAddTrustedCert`
   - `cwd` 路径必须合法
   - `caName` 必须通过证书文件名校验

校验目标不是 100% 复刻 Go 实现细节，而是保持权限边界不放宽。

### 8. PowerShell 动作对齐

各白名单方法的 PowerShell 实现应尽量与当前 helper 行为一致。

#### 8.1 `tools/writeFileByRoot`

- 直接写 UTF-8 文本
- 目录不存在时创建父目录

#### 8.2 `tools/writeBufferBase64ByRoot`

- 将 base64 解码为 byte[]
- 以二进制方式写入目标文件

#### 8.3 `tools/rm`

- 使用 `Remove-Item -LiteralPath ... -Recurse -Force`
- 路径不存在时视为成功

#### 8.4 `tools/setSystemPath`

- 写入 `HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Environment\Path`
- 保留 `%VAR%` 形式
- 同步处理 `otherVars`
- 设置 `FLYENV_ENV_FLUSH=0`
- 广播 `WM_SETTINGCHANGE`

#### 8.5 `tools/setSystemEnv`

- 直接写机器级环境变量
- 广播 `WM_SETTINGCHANGE`

#### 8.6 `tools/setAutoStartWin`

- `enabled=true` 时使用 `schtasks.exe /create`
- `enabled=false` 时使用 `schtasks.exe /delete`
- 任务参数保持与当前 helper 一致

#### 8.7 `host/sslAddTrustedCert`

- 使用 `certutil -addstore root <caFile>`
- 参数与 helper 现有 Windows 逻辑保持一致

### 9. IPC 与 UI 行为

#### 9.1 `APP:FlyEnv-Helper-Check`

建议扩展返回值：

1. 成功：

   - `{ code: 0, data: true }`

2. 失败：

   - `{ code: 1, data: false, reason: 'helper_binary_missing' }`
   - `{ code: 1, data: false, reason: 'helper_unreachable' }`
   - `{ code: 1, data: false, reason: 'helper_version_mismatch' }`

这样 renderer 可区分“缺文件”和“需要修复”。

#### 9.2 Windows helper 缺失时的安装提示

Windows 上当 reason 为 `helper_binary_missing` 时：

1. 不弹“安装 helper”确认框
2. 不展示“打开 helper 所在目录手动运行”的提示
3. 白名单操作直接走一次性授权
4. 非白名单操作返回明确错误，提示该操作仍然依赖 helper

#### 9.3 Helper 修复入口

显式 helper 修复入口保留，但当 helper 文件缺失时应显示新的提示文案，而不是继续引用不存在的 exe 路径。

## 日志

建议增加统一日志分类：

1. `[Helper][check]`

   记录 helper 文件缺失、socket 失败、版本不匹配等诊断信息。

2. `[Helper][fallback]`

   记录哪个 `module/fn` 触发了 PowerShell 单次授权回退。

3. `[Helper][fallback][error]`

   记录回退执行失败原因。

日志目标是让后续问题能区分：

1. helper 文件被删
2. helper 文件还在但无法连通
3. helper 调用失败但 fallback 成功
4. helper 与 fallback 都失败

## 预期改动文件

建议主要改动以下文件：

1. `src/shared/AppHelperCheck.ts`
2. `src/main/core/AppHelper.ts`
3. `src/fork/Helper.ts`
4. `src/main/core/IPCHandler.ts`
5. `src/render/store/helper.ts`
6. `src/render/components/Setup/FlyEnvHelper/setup.ts`
7. `src/shared/WindowsHelperFallback.ts`（新增）
8. `src/shared/PowerShellCommand.ts`（如需补通用工具函数）

如需要复用更多校验函数，可再新增一个仅供 fallback 使用的校验模块。

## 测试策略

### 1. TypeScript 分流测试

新增脚本级测试，至少覆盖：

1. `helper_binary_missing` 时白名单方法进入 fallback
2. `helper_binary_missing` 时非白名单方法直接失败
3. `helper_unreachable` / `helper_version_mismatch` 时白名单方法进入 fallback
4. 大 payload 写入时转为“临时数据文件 + 内联 PowerShell”

### 2. Windows 回退动作测试

至少验证以下动作：

1. `writeFileByRoot` 小文本
2. `writeFileByRoot` 大文本
3. `writeBufferBase64ByRoot` 小二进制
4. `writeBufferBase64ByRoot` 大二进制
5. `rm`
6. `setSystemPath`
7. `setSystemEnv`
8. `setAutoStartWin`
9. `sslAddTrustedCert`

### 3. Helper 检测链路测试

验证：

1. helper 文件不存在时，`AppHelperCheck()` 返回 `helper_binary_missing`
2. helper 文件存在但未运行时，返回 `helper_unreachable`
3. helper 文件存在且版本不对时，返回 `helper_version_mismatch`

### 4. UI 集成验证

验证：

1. Windows helper 文件缺失时，不再弹安装 helper 对话框
2. renderer 的 `fs_writeFile` / `fs_writeBufferBase64` 回退链路仍然可用
3. helper 修复入口不会继续引导用户去打开一个不存在的 exe

## 风险点

1. `@shared/Sudo` 的 batch 临时文件仍然存在，杀软仍可能针对旧链路行为做拦截。
2. 大 payload 临时数据文件如果清理失败，可能在 `temp` 留下垃圾文件，需要 `finally` 严格清理。
3. TypeScript fallback 校验如果弱于 Go helper 校验，可能扩大权限边界。
4. `setSystemPath` 与 `setSystemEnv` 的 PowerShell 实现必须准确广播系统环境变更，否则用户需要重启终端才看到结果。
5. 证书导入和计划任务操作都依赖 Windows 自带工具，错误信息需要保留足够原文，便于定位系统层失败。

## 完成标准

1. Windows helper 文件不存在时，安装链路会被明确跳过，不再尝试引用缺失 exe 安装。
2. Windows helper 检查能稳定区分：
   - `helper_binary_missing`
   - `helper_unreachable`
   - `helper_version_mismatch`
3. 白名单受限操作在 helper 不可用时能通过一次性 UAC 成功执行。
4. 非白名单操作在 helper 缺失时不会误触发安装提示。
5. 默认回退执行不再落地 `.ps1` 脚本文件。
6. 写入类大 payload 仅在必要时落地临时数据文件，且能被清理。
7. helper 正常时，Windows 原有 helper 执行路径不变。
