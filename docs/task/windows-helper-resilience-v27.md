# Windows 帮助程序 v27：安装健壮性修复说明

日期：2026-09-26。范围：本轮 Windows helper 安装修复的全部生产代码、测试、翻译及版本调整。

本文是完成态说明，解释“为什么改、怎么改、解决什么问题、还有什么边界”；执行计划及审查过程见 [实施与验证记录](../superpowers/plans/2026-09-25-windows-helper-resilience.md)。此前的 [v26 per-SID 改造记录](windows-helper-cross-user-result.md) 保留为历史背景，不代表本轮完成态。

## 1. 目标与明确不变的策略

目标不是遇到任何错误都继续安装，而是减少环境差异、文件占用、重复操作和错误清理导致的失败；失败时保留可修复状态，并提供可以定位原因的诊断。

以下策略没有改变：

- **主程序与备份的选择、指纹规则不调整。** 继续要求备份存在；打包主程序存在时，其 SHA-256 必须与备份一致；暂存副本仍须匹配已校验的备份指纹。不增加“选较新文件”“忽略不一致”“自动换来源”等恢复策略。
- 实例仍由 UAC 前捕获的原始用户 SID 派生；任务仍以 SYSTEM 运行、登录触发器仍绑定目标 SID。不把批准 UAC 的管理员账户当作应用用户。
- 不放宽安装目录、key、allowed-roots 的 ACL、reparse-point 检查及现有 RPC 身份认证。
- 失败后不自动回滚旧 helper 版本，也不删除其他用户实例或按进程名全局结束 helper。
- 通用 `src/shared/Sudo.ts` 没有修改；其他调用方继续使用原有机制。
- 不新增 Pinia store 或共享配置持久化字段。已有提权方式设置仍沿用原位置。

## 2. 帮助程序版本 26 → 27

### 为什么要更新

虽然没有新增 RPC 方法，本轮改变了帮助程序的 ProgramData 定位和启动诊断行为。不能只更新 TypeScript/PowerShell，却仍把旧二进制作为同一版本接受；明确升版也便于支持、排障和发布时区分修复前后的产物。

### 修改位置及作用

- `src/helper-go/main.go`：`Helper_Version = 27`，版本查询及 health 结果返回 27。
- `src/shared/AppHelperCheck.ts`：`HelperVersion = 27`，主程序要求相同版本；旧版不会通过版本检查，并沿既有流程进入修复。
- `scripts/helper-version-sync-test.ts`：期望值改为 27，同时校验 Go 与 TypeScript 声明一致，防止仅改一端。
- `scripts/windows-helper-elevation-test.ts`、`scripts/windows-helper-cross-user-test.ts`：安装配置 fixture 同步使用 27。
- `instance.json` 中的 `helperProtocol` 由安装配置中的版本生成，正常重装后写入 27，无需单独硬编码。

这不是只对 Windows 生效的版本常量：Go/TypeScript 的 helper 版本是跨平台共享的。发布其他平台时也必须由当前源码重新构建对应 helper，不能给新主程序打包 v26 的旧产物。本次在 Windows 本机重建的是 `src/helper-go/dist/flyenv-helper-windows-amd64-v1.exe`，没有声称已构建或验证 macOS/Linux 发布包。

版本一致性测试先以 27 为期望运行，确认旧实现因 `26 !== 27` 失败，再同步两端并验证通过。主程序/备份的内容仍应在正常打包流程中由同一新产物生成，不手动混用不同版本文件。

## 3. 修复后的安装生命周期及所有权

依照模块边界约束，长操作由既有单例持有，而不是由点击按钮的页面持有。

1. 设置页或安装提示调用 renderer `Helper.repair()`，共享一次 IPC 请求和最终结果。
2. 主进程 `AppHelper.initHelper()` 共享同一个安装 Promise，先检查当前 SID 的 helper 是否健康。
3. 若仅管道不可达，先校验现有任务、key 和程序指纹，尝试启动停止的有效任务，再等待健康响应；成功则跳过 UAC 和文件替换。
4. 确需安装时，原始进程捕获 SID、规范路径和安装配置，通过专用提权器执行内联 PowerShell。
5. 提权脚本校验目标命名空间和管理员权限，取得当前 SID 的系统互斥锁，校验来源并准备全部暂存文件。
6. 暂存成功后停止当前 SID 的任务，逐文件原子发布，修复 ACL，注册并启动任务。
7. 主进程再次做版本、身份和健康检查；脚本退出成功不等于应用可立即报告 helper 可用。
8. 成功或失败进入终态，renderer 清理监听及 loading。超时但子进程可能仍存活时，按下述规则保留结果通道。

所有权：renderer `src/render/store/helper.ts` 管理操作 IPC、结果、重入和清理；`src/main/core/AppHelper.ts` 管理检查、恢复、提权及最终健康判定；提权脚本管理当前 SID 的安装锁和磁盘发布；Task Scheduler 管理 SYSTEM 进程。页面仅绑定状态、发出命令及保存原有偏好。`code: 200` 是中间事件，不提前结束安装状态。

## 4. 提权传递与运行环境

### 4.1 不再依赖 helper 安装专用 BAT/TEMP 脚本链

涉及 `src/shared/WindowsHelperInstaller.ts`（新增）和 `src/main/core/AppHelper.ts`。

**原问题：** 多层 shell/批处理转义容易破坏中文、空格、单引号、百分号、感叹号；跨账户 UAC 后的管理员不一定能读取原用户 TEMP 文件。脚本文件和状态文件的生命周期还可能与超时清理冲突。

**调整：** Windows 分支直接生成安装脚本文本，以 UTF-8、gzip、base64 包装，交给 Windows PowerShell 内联解压执行；通过 `Start-Process -Verb RunAs` 请求正常管理员批准，不经 `cmd.exe`。引导字符串专门避免嵌套双引号问题。完整启动命令在超过保守的 30,000 字符上限前明确失败。

**效果与边界：** 消除安装脚本本身对原用户 TEMP 访问和 BAT 编码的依赖，不改变通用 Sudo。它不保证管理员能访问 EFS 加密、离线网络盘或已被隔离的源二进制；这些仍应明确报错。

### 4.2 结构化结果，区分取消、执行失败和不确定超时

提权子进程先连接本次安装的随机命名管道，再执行安装；结果包含 nonce、退出码、stdout、stderr。接收端校验 nonce、字段类型及响应大小，拒绝无关/畸形结果。

- 单个输出字段最多保留 8,000 字符，包括单条超长输出；响应接收上限为 128 KiB。
- `FLYENV_HELPER_INSTALL_ERROR:<code>:<message>` 映射到现有类型化错误，关键错误置于诊断前部，避免被普通输出淹没。
- Windows 原生错误码 1223 映射为 `elevation_uac_cancelled`，不把用户拒绝当作安装损坏。
- launcher 默认等待 180 秒。超时并结束 launcher 不代表提权子进程已经退出，因此返回“不确定、可能仍在完成”的错误，不删除安装数据。
- 此时结果管道额外保留最多 10 分钟，迟到结果到达或截止后清理；server/socket/timer 使用 `unref`，不会仅为了清理而阻止 FlyEnv 退出。
- 迟到结果只用于回收通信资源，不会把已返回的超时 Promise 改成成功；重试会重新检查实际健康状态。应用退出也会关闭通道。

独立审查发现过早关闭结果通道的问题后，新增真实 PowerShell 子进程回归：先复现迟到子进程连接失败，再验证保留通道后可以正常回传。新的安装重试仍由 SID 锁序列化，保留管道不是并发安装授权。

### 4.3 统一 PowerShell 和 ProgramData 定位

涉及 `src/shared/WindowsHelperIdentity.ts`、`src/shared/AppHelperCheck.ts`、PowerShell 安装脚本，以及 Go 的 `utils/common_application_data_windows.go`、`utils/common_application_data_other.go`、`utils/helper_identity.go`。

**原问题：** `powershell.exe` 的 PATH 查找、硬编码系统盘、用户模块目录、继承的 `ProgramData` 环境变量可能在普通用户、管理员和 SYSTEM 中给出不同结果，导致“装在 A、检查 B”或加载不期望的模块。

**调整：**

- 统一使用 `SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe`；无 SystemRoot 时保留系统盘默认值。启动使用 `-NoProfile`、`-NonInteractive`，PSModulePath 限制到系统 PowerShell Modules。
- TypeScript 在原始用户进程中通过 CommonApplicationData known folder 捕获安装根；已捕获 identity 的 executable 优先使用，不再次依赖环境变量重推路径。
- 提权脚本独立解析同一个 known folder 并核对目标路径；Go 使用 Windows KnownFolder API。API 失败时明确返回错误，不悄悄接受环境变量中的另一目录。
- 非 Windows 实现同步调整函数返回签名，以保持跨平台源码编译接口一致。
- 当前用户 identity 获取失败时清除被缓存的 rejected Promise，使下一次修复能重新尝试。
- 旧 `windowsHelperInstallerCommand()` 工具保留兼容，但改为统一系统 PowerShell 路径；主 Windows 安装链不再使用它。

这里统一的是实际安装/身份捕获链。纯路径构造函数仍允许传入 ProgramData，兼容入口和测试 fixture 不等同于运行时重新信任环境变量。

## 5. 提权安装脚本：先准备，再停止，再发布

核心文件：`static/sh/Windows/flyenv-auto-start-now.ps1`。

### 5.1 预检与跨进程安装锁

**原问题：** 主进程内防重不能阻止不同 FlyEnv 进程或超时后仍活着的提权子进程同时操作同一实例；过早停任务会让本来还能运行的 helper 被源文件/磁盘问题拖停。

**调整：** 先核对管理员权限、SID 派生实例 ID、任务/管道/路径命名空间，再取得 `Global\FlyEnv.Helper.Install.<instance-id>` 互斥锁。锁只给 Administrators/SYSTEM 完全控制，等待上限 30 秒；兼容 abandoned mutex，并在 finally 释放。

随后检查必需备份、原有指纹规则、数据目录及 reparse-point/ACL。不同 SID 使用不同锁；创建共享任务文件夹遇到并发创建时重新读取目录，避免两个用户首次安装互相绊倒。

### 5.2 文件占用只做有限、针对性重试

**原问题：** 杀软扫描和暂时打开的文件句柄可造成瞬时 sharing/lock violation，一次失败就终止会降低成功率；但对永久权限错误无区别重试只会延迟诊断。

**调整：** `Invoke-WithFileRetry` 沿异常链识别 Windows 错误 32/33，最多尝试 5 次，间隔按 100/200/300/400 毫秒递增。永久 access denied 不进入此重试。

SHA-256 改由 .NET 文件流实现，降低 PowerShell 模块自动加载依赖；**哈希判断的业务规则不改变**。复制、校验及发布等适用操作使用有限重试，并保留原异常。

### 5.3 暂存、key 复用及原子发布

**原问题：** 先停任务再复制，容易在磁盘空间不足或备份不可读时扩大故障；直接覆盖 key/config 可能留下半文件；每次重装都换 key 会使仍持有旧 key 的连接无谓失效。

**调整：**

- 先在受保护实例目录内准备 allowed-roots、需要替换的 helper、必要的新 key 和 instance.json；校验暂存二进制指纹，并设置/验证关键文件 ACL。
- 现有 key 长度为 32 字节且 owner/ACL 满足要求时复用；存在不可信读取者、拒绝规则等不安全情况时不作为可复用 key。发布后仍修复目标 SID 权限。
- 全部准备完毕再停止当前 SID 任务，最多等待 15 秒，不按程序名结束其他进程。
- `Publish-StagedHelperFile` 对新目标 Move，对已有目标 Replace；使用真正的空备份参数，避免 PowerShell 到 .NET 的空字符串绑定陷阱。
- 即使现有 exe 指纹相同，也重新修复 executable 权限，避免“内容正确但不可执行”永远无法修复。
- 发布后再次修复/验证 key、config、allowed-roots ACL，避免 Replace 保留目的文件旧权限所造成的遗漏。

**边界：** 这是“先暂存、逐文件原子替换”，不是多个文件的整体事务。断电或发布中途失败仍可能留下部分新文件；已有 allowed-roots 备份按现有失败路径尽力恢复，未发布暂存文件尽力清理，但不会自动回退旧 helper 二进制。后续修复重新校验实际状态。有效 key 复用也不代表降低其权限要求。

### 5.4 任务设置和失败清理

**原问题：** 已安装但停止的任务可能只能通过重新提权修复；任务缺少崩溃恢复设置；失败时删除任务、清理错误覆盖原错误，会让下一次修复更困难。

**调整：**

- 当前 SID 的任务授予目标用户读取/执行权限 `FRFX`，SYSTEM/Administrators 保持完全控制；不授予用户修改任务的权限。
- 启用 demand start、StartWhenAvailable、失败后每分钟重试，最多 3 次；不限执行时长，不因电池供电停止，不启动重复实例。
- 停止、注册、校验和启动都只针对当前 SID 的精确任务；保留 SYSTEM/ServiceAccount/Highest 和目标用户登录触发器。
- 出错不删除已有或刚注册的任务，保留可修复入口；未发布暂存文件和备份清理尽力完成，清理错误不覆盖原错误，也不把已完成安装改判失败。
- 明确设置全局 LASTEXITCODE，输出带 stage 的错误标记，帮助区分校验、暂存、停止、发布、注册或启动阶段。

若在停止后发布失败，不保证旧任务自动恢复运行；这属于需用户重试的失败状态，不能描述为自动回滚或零停机升级。

## 6. 主进程恢复、最终健康判定与错误信息

涉及 `src/main/core/AppHelper.ts`、`src/shared/AppHelperCheck.ts`、`src/shared/WindowsHelperIdentity.ts`、`src/shared/WindowsHelperState.ts`。

- **重复调用：** 同一个 `initHelper()` 安装 Promise 返回给所有调用方，避免一个调用仍安装中、另一个却提前得到成功；finally 统一恢复可重试状态。
- **停止任务恢复：** 仅对 helper/pipe unreachable 尝试恢复。先验证 32 字节 key、任务 principal、动作、参数、触发 SID 及安装程序指纹；真正 Run 前再校验，不会为了少一次 UAC 而启动任意任务。已 Running/Queued 的任务不重复 Run。
- **旧任务兼容：** 旧任务没有执行权限或恢复失败时，回到正常 UAC 安装修复，而不是把恢复能力作为强制前提。
- **健康等待：** 任务恢复后的等待预算为 10 秒，安装后为 30 秒；临时不可达采用退避。版本、身份、ACL 等已识别的非暂态错误直接失败，不空等至超时。单次底层检查仍有自身超时，预算不是每种异常下严格的进程总时长保证。
- **成功条件：** 最终检查通过后才执行成功回调并发出 checkSuccess。成功回调异常与“初始 helper 不健康”分开处理，不因为回调失败立即进入第二次安装。
- **错误传递：** IPC 除 reason/stderr 外保留 msg；无 stderr 的普通异常不再只剩一个错误码。msg/stderr 各截断至 4,096 字符。
- **失败补充诊断：** Windows 安装失败（用户取消除外）尽力补充 Task state、LastTaskResult 和启动日志末尾最多 3,072 字节；诊断读取失败不覆盖安装原错。

PowerShell 路径比较使用默认不区分大小写的 `-ne`，动作参数使用精确的 `-cne` 合同；不因审查中的误判把有效的大小写兼容逻辑改坏。

## 7. Go 启动日志：解决 GUI helper “启动就退出但没有证据”

涉及 `src/helper-go/main.go`、新增 `src/helper-go/startup_diagnostics.go`、`src/helper-go/utils/helper_diagnostics.go`、`src/helper-go/utils/helper_diagnostics_windows.go`、`src/helper-go/utils/helper_diagnostics_other.go`，以及 `utils/helper_identity.go`。

Windows GUI 构建没有可见控制台，计划任务启动失败时仅看到管道不通，很难区分 SID 校验、key 加载或管道初始化问题。

新日志位于 canonical ProgramData 下的 `FlyEnv\Helper\users\<instance-id>\startup.log`，轮转备份为 `startup.log.1`：

- 记录启动身份/路径、参数不完整的固定提示、SID 校验失败、key 加载失败、pipe/runtime 退出等信息；不直接记录原始命令行或 key 内容，并对 key/args 样式信息做脱敏和单条长度限制。
- 单个日志文件上限 256 KiB，最多一个轮转备份；重启采用 append，防止从文件头覆盖上一次失败证据。
- 打开 Windows 日志前检查绝对路径、目录链 reparse point、可信 owner、受保护 DACL 和不可信写权限；文件 handle 再检查 reparse point/多硬链接。
- Windows 使用 append-only 权限打开；平台文件拆分使非 Windows 构建仍有匹配实现。
- 日志是 best-effort：无法创建/打开/轮转不会阻止 helper 正常启动；安装目录尚未形成或进程被系统策略阻止执行时，日志可能不存在。

日志不替代 health 检查，也不是保证失败一定被记录的系统审计设施。诊断中可能包含上一次运行的日志及任务结果，排查时应结合 UTC 时间和本次安装 stage，不应把历史记录直接当作当前根因。

## 8. 打包、安装器和用户修复入口

### 8.1 打包时就拒绝缺少帮助程序的产物

`build/afterSign.ts` 原先只警告 helper 缺失/复制失败，可能继续产生主程序完整但 helper 不可安装的发布包。现在缺少必需产物、主程序或备份复制失败会直接抛错，中止构建钩子。

仍按原规则从同一 helper 生成 `resources/helper/flyenv-helper.exe` 和 `flyenv-helper-backup.exe`，之后清理打包暂存位置。没有改变指纹/来源策略。

### 8.2 移除已经不适配 per-SID 的 NSIS 操作

`build/installer.nsh` 移除按 `flyenv-helper.exe` 全局 taskkill、调用旧 `flyenv-helper-init.ps1` 的安装钩子，以及删除固定旧任务/全局杀进程的卸载钩子；保留已有 RequestExecutionLevel admin。

原因是这些动作没有当前 SID 的归属依据，还引用了已不匹配的旧链路，可能结束其他用户 helper 或产生无效安装尝试。当前 SID 的安装/恢复由应用内统一流程执行；本轮不提供新的“卸载时清扫全部用户 helper”策略，旧实例不被冒险全局删除。

### 8.3 修复按钮统一由 controller 管理

`src/render/store/helper.ts` 的 `repair()` 拥有安装请求、共享 Promise、中间事件过滤、终态处理、300 秒兜底超时和 IPC 监听清理。同步发送失败、失败后重试、取消后重试均恢复可操作状态；成功后仍调用既有 hosts 补写流程。

`src/render/components/Setup/WindowsElevationMethod/index.vue` 在 helper 模式提供修复按钮；切换到 helper 和手动修复共用该入口。页面不再自行发送安装 IPC 或拥有安装 loading，只保留保存偏好的局部状态。

Windows 错误对话框显示诊断（最多 1,024 字符），用户取消不弹安装失败框；去掉打开 EXE 所在文件夹并让用户直接运行它的无效方案。直接运行 helper 不会完成受保护文件/计划任务安装，改用其他管理员账户启动整个 FlyEnv 还会改变目标 SID，因此新提示要求继续使用原 Windows 账户，通过设置修复并提供错误详情。

所有 33 个 `src/lang/<locale>/setup.json` 的 `flyenvHelperInstallFailTips` 同步修改，locale 为：`ar`、`az`、`bg`、`bn`、`cs`、`da`、`de`、`el`、`en`、`es`、`fa`、`fi`、`fr`、`hi`、`hr`、`hu`、`id`、`it`、`ja`、`ko`、`nl`、`no`、`pl`、`pt`、`pt-br`、`ro`、`ru`、`sv`、`tr`、`uk`、`vi`、`zh`、`zh-hant`。没有顺带改写非 Windows 的通用手动安装说明。

## 9. 测试代码改动清单与覆盖目的

以下为本轮新增或修改的全部测试文件，不把未修改但执行过的回归脚本混作代码改动。

- `scripts/helper-version-sync-test.ts`：两端版本及目标版本 27 一致，防止漏升一端。
- `scripts/windows-after-sign-helper-test.ts`：实际临时文件验证缺失产物、复制失败中止打包，以及成功时主程序/备份内容一致。
- `scripts/windows-app-helper-init-test.ts`：重复安装调用必须共享同一个终态 Promise；覆盖安装成功/失败后的状态和既有恢复逻辑。
- `scripts/windows-helper-elevation-test.ts`（新增）：真实 PowerShell 子进程和命名管道，不请求 UAC；覆盖特殊字符路径、完整脚本命令行长度、Unicode 超长输出、错误码、取消、超时和迟到子进程结果。
- `scripts/windows-helper-cross-user-test.ts`：既有身份配置/特殊路径 fixture 的版本同步为 27；该脚本不等同于真实跨账户 UAC 验证。
- `scripts/windows-helper-install-ipc-test.ts`：保留主进程最终结果回复及全局通知防重复契约，适配 controller 统一发送结构。
- `scripts/windows-helper-install-script-test.ts`：更新脚本契约断言，覆盖 known folder、SHA-256、锁、暂存先于停止、有限重试、key 复用、任务恢复设置和不删除任务等结构约束。
- `scripts/windows-helper-powershell-test.ts`（新增）：系统目录可不在 C 盘、模块路径隔离，以及实际身份捕获不信任被污染的 ProgramData 环境变量。
- `scripts/windows-helper-renderer-controller-test.ts`（新增）：执行真实 controller 逻辑，替换外部 IPC/对话框边界；断言重复请求只发送一次、中间事件不清理、成功/失败/取消/同步异常/超时清理及后续重试。
- `scripts/windows-helper-resilience-test.ts`（新增）：无 stderr 错误仍保留 msg；永久健康错误不重试；主进程防重；有效停止任务恢复不进入安装；失败附带任务诊断。
- `scripts/windows-helper-state-test.ts`：适配并验证类型化/普通异常的 msg、stderr 和错误分类输出。
- `scripts/windows-helper-task-behavior-test.ps1`：只加载安装脚本函数、不执行安装主体；测试哈希、known folder、临时/永久错误重试、真实文件锁下的原子替换、释放后重试，以及假 scheduler 对象的身份/动作拒绝。
- `src/helper-go/main_test.go`：新增启动诊断敏感值过滤测试；该 main 包在本机非提权环境未执行，不能算已通过。
- `src/helper-go/utils/helper_identity_test.go`：污染 ProgramData 后实例根不得落入污染目录，防止路径来源回归。
- `src/helper-go/utils/helper_diagnostics_test.go`（新增）：日志轮转大小上限、重启追加、符号链接与硬链接拒绝。硬链接用例独立于符号链接，防止缺少 symlink 权限时连带跳过。

说明：结构断言用于保护安装契约，不代替真实运行测试；已补的真实 PowerShell、文件占用、日志 I/O 和 controller 行为测试负责可在非提权环境验证的实际行为。

## 10. 文档、构建产物及验证结论

文档改动：新增本文；更新 `docs/superpowers/plans/2026-09-25-windows-helper-resilience.md` 的实施进度、验证、审查及 v27 追加要求；在 `docs/task/windows-helper-cross-user-result.md` 顶部标注 v26 历史策略与当前方案的差异。

构建产物：重新构建 Windows amd64/v1 GUI helper 至 `src/helper-go/dist/flyenv-helper-windows-amd64-v1.exe`。构建不等于安装，未运行真实 UAC、未改动本机已安装任务；之前测试产生的独立 `.test.exe` 已清理，可重新生成。

### 已完成的验证

- 本轮修复的 18 项相关 TypeScript 回归、PowerShell 函数/文件行为测试、Go `test ./module ./utils` 与 `vet ./...` 已通过；18 项包括上述相关测试，以及未改动的 helper check/identity/send/fallback、hosts 重试、数据路径和 renderer 操作边界回归。
- 修改的 TypeScript/Vue 文件 ESLint 与 `git diff --check` 通过。
- 版本更新后再次执行全部上述 18 项 TypeScript 回归、PowerShell 行为测试、Go module/utils 与 vet，均通过；本次变动的 TypeScript 文件 ESLint 通过，Windows v27 产物构建成功。
- 全项目 `tsc --noEmit` 在此前完整回归中仍有 10 个未修改文件中的既有错误：Linux builder 配置、DNS、Image、Podman、BrewFormula、Plugin。没有将其计作通过，也没有为本轮安装任务顺带修改这些模块。

### 仍需发版前虚拟机验证

- 标准用户输入另一管理员凭据批准 UAC，结合非 ASCII 用户名、特殊字符路径、重定位 ProgramData。
- 真正注册/运行 SYSTEM 任务，验证目标用户 demand start 权限、登录触发器、失败重启及同 SID/不同 SID 并发安装。
- 磁盘满、永久 ACL 拒绝、文件占用、进程中断/重启，分别发生在停止前、停止后、发布中和注册后。
- UAC 取消或长时间不批准、launcher 超时但子进程继续、保留期内再次修复。
- Defender/第三方杀软、AppLocker/WDAC/Constrained Language、禁用 Task Scheduler：应诊断失败，不绕过安全策略。
- Go main 包管理员测试、需要创建符号链接权限的用例；当前账号的 symlink 测试因权限不足跳过。

这些限制意味着“尽量减少可恢复失败”，不意味着在拒绝管理员授权、发布文件缺失、强制执行限制或不可用磁盘上保证安装成功。
