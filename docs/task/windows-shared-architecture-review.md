# shared Windows 链路职责与简化审查

审查日期：2026-10-05。依据当前工作区源码、实际导入和调用关系进行静态审查。本次只整理审查结果，未修改运行逻辑，未运行测试、构建或系统权限操作。

后续已按本审查完成一轮简化，实际改动与当前位置见 [Windows shared 简化实施说明](windows-shared-simplification.md)。下文文件清单、行数和旧符号位置记录的是简化前的审查依据，不能作为当前仍存在这些冗余的结论。

## 1. 结论

**存在局部过度设计，主要是新旧执行链并存、失效上下文和职责放错位置。文件多本身不是主要问题。**

按 `src/shared/Windows*.ts` 和 `Process.win.ts` 统计，共 22 个文件、约 6,098 行（按换行拆分统计，包含末尾空行）。其中 `WindowsHelperFallback.ts` 为 2,136 行，占约 35%。这些文件当前都有生产代码引用，不能按“没有引用的文件”直接删除整文件。

可直接进入清理的候选是：没有调用方的进程身份 ALS 包装及其永远取不到值的消费分支、仅测试引用的旧 whoami CSV 解析、已移除脚本阶段对应的协议白名单。需要先收敛入口才能删除的是旧的自动 UAC fallback 执行链。需要调整位置的是混在 Helper 身份文件中的通用 PowerShell 环境构造，以及只属于 main 的 Helper 管理执行器。

不建议把所有 Windows 代码合并成一个大文件，也不建议为减少根目录文件数量而增加新的抽象层。

## 2. 完整文件清单

“调用方”列列出主要生产消费者，不包含测试；部分文件只通过类型导入被某些消费者引用。

| 文件 | 约行数 | 实际职责与主要调用方 | 建议 |
| --- | ---: | --- | --- |
| `Process.win.ts` | 327 | 普通权限 CIM 查询与解析，保留 PID、PPID、命令行、创建时间、映像路径；进程树/搜索/端口辅助。`Process.ts`、`StopProcessList`、各服务及工具使用。 | 保留查询实现；多根查询等仅测试引用的便利 API 可收敛，不能删除严格查询与复用首次列表能力。 |
| `WindowsSystemPaths.ts` | 82 | 从实际 Windows 根目录定位 PowerShell、System32 工具，并在执行前检查文件存在。大量 main/fork/shared 调用。 | 保留，作为统一系统工具路径入口；适合接收通用 `windowsPowerShellEnv`。 |
| `WindowsVolume.ts` | 99 | 批量判断卷是否为 NTFS，短时缓存与并发查询复用。`Fn.ts`、Windows PATH 工具使用。 | 保留。负责 junction 所需能力判断，不应混入系统工具路径文件。 |
| `WindowsTerminal.ts` | 97 | 构造交互式终端启动脚本，编码业务命令，选择 Windows Terminal/PowerShell。语言项目和 `Exec.ts` 使用。 | 保留终端职责；统一显式 PowerShell 路径，去掉依赖 PATH 的默认和分支。 |
| `WindowsTaskkill.ts` | 86 | 按调用方传入顺序，一次执行普通权限 `taskkill /F /PID ...`；记录命令结果，非零后仅探测目标是否全部已缺席。`ProcessKillStrict` 使用。 | 保留薄执行层。没有第二次 kill、没有 `/T`、没有 UAC/Helper；不增加身份检查或重新排序。 |
| `WindowsDnsRefresh.ts` | 59 | 直接启动 `ipconfig /flushdns`，只等启动，不等执行结束；失败只记录。hosts 写入和退出清理使用。 | 保留独立附加动作，不要重新接入权限动作管道。 |
| `WindowsEnvironmentBroadcast.ts` | 126 | 环境写入业务结算后，下一轮后台启动 PowerShell 发送 `WM_SETTINGCHANGE`，不等待广播结果。PATH、别名、Android 环境写入使用。 | 保留业务就近调用与后台失败隔离；不再加全局 dispatcher 回调或新 IPC。 |
| `WindowsHelperState.ts` | 198 | 跨进程共享授权方式、错误码、错误对象及旧 transport 策略。main/fork/renderer 多方使用。 | 保留轻量契约；旧 transport 策略随旧 fallback 入口一并清理。 |
| `WindowsPrivilegeReason.ts` | 176 | 构造/裁剪弹窗原因数据，区分文件、PATH 变更、环境变量、证书等目标。执行层、main、renderer 使用。 | 保留纯数据边界；显示说明不能与执行授权混用。与 State 合并只能减少文件数，收益有限。 |
| `WindowsPrivilege.ts` | 137 | 当前进程管理员令牌探测与缓存、main/fork provider 契约、交互上下文和授权租约。 | 保留进程间协调边界。main 统一选择，fork 发请求，不以 renderer 状态判断当前令牌。 |
| `WindowsPrivilegeOperation.ts` | 343 | `Helper.send` 的标准 Windows 操作分流：验证动作、普通权限尝试、管理员直接执行、已选 UAC/Helper；端口操作身份采样。 | 清除失效的服务身份 ALS 分支；保留仍可达的端口工具权限处理。它不再是普通服务停止入口。 |
| `WindowsHelperFallback.ts` | 2,136 | 同时包含路径/参数验证、业务脚本、旧 inline/TEMP/Sudo 计划、旧独立执行器、新管道动作构造、进程/证书/开机任务/数据目录修复。 | 首要收敛对象。先把现代动作构造与旧传输适配分开，停止现代入口对旧“计划对象”的依赖，再删除确认不需兼容的旧执行链。 |
| `WindowsElevation.ts` | 415 | 一次性普通/管理员动作引导、结果认证、启动错误分类、取消/超时/迟到结果处理及禁止未知写操作重放。 | 保留执行语义与未知状态边界；不要简化成“退出码为 0 即业务成功”。 |
| `WindowsActionPipe.ts` | 556 | 原生命名管道 broker/client、访问控制、对端 PID/令牌/会话验证、分阶段输入协议、启动线程。UAC 动作和 Helper 安装共用。 | 保留运输与身份边界；复杂度主要来自必要行为，不是普通服务停止需要承担的成本。 |
| `WindowsRunAs.ts` | 62 | 小型 RunAs launcher 与“启动失败”和“已启动后等待失败”的诊断区分。Helper 安装使用；Elevation 的可替换 launcher 也使用。 | 保留。普通动作已复用 broker 启动线程，不代表安装 launcher 已无用途。 |
| `WindowsHelperIdentity.ts` | 316 | SID/账户、每账户 Helper 实例目录/计划任务/管道标识、安装参数、任务匹配和诊断读取；另混入通用 PowerShell 环境。 | 身份与任务契约保留；移出通用 PS 环境函数，删除过时 CSV 解析。 |
| `WindowsHelperInstaller.ts` | 234 | Helper 安装计划与经过认证的安装终态处理。仅 main 的 `AppHelper` 直接消费。 | 可移入 main Helper 管理目录；保留与业务 UAC 共用底层管道的关系，不复制一套管道。 |
| `WindowsHelperDisable.ts` | 81 | 停用当前账户已安装 Helper，核对精确任务身份，按当前令牌/必要 UAC 执行，并复用进行中的停用操作。main `IPCHandler` 消费。 | 可移入 main Helper 管理目录；属于“切换 UAC 默认停用”的实际功能，不能删除功能。 |
| `WindowsProcessSafety.ts` | 221 | 旧服务身份 ALS 包装；仍有效的进程身份类型、PowerShell 安全判断、进程/监听端口查找。 | 删除无调用的 ALS 部分及消费分支；保留端口工具及提权停止所需保护。 |
| `WindowsActionStage.ts` | 136 | UAC/安装阶段协议生成与固定字段解析；诊断不参与成功判定。管道与动作执行器使用。 | 保留当前认证运输诊断；删除已没有生产发送方的旧 PATH 通知/注册表细分/CIM 细分阶段。 |
| `WindowsPrivilegeTiming.ts` | 145 | 异步/同步阶段计时、上下文观察器、诊断与计时脚本共用事件。多个跨平台服务也使用。 | 保留已使用的计时能力；命名可改为通用 OperationTiming，避免通用服务看似依赖 Windows 授权。 |
| `WindowsPathDiagnostics.ts` | 66 | PATH 请求关联字段与阶段日志，绑定回调上下文，复用计时观察器。main/fork/shared 使用。 | 保留有归属的诊断。可以共享少量安全写日志工具，但不引入统一业务调度框架。 |

### 相关但不在上述命名统计中的文件

- `PowerShellCommand.ts`：统一脚本编码/命令行构造；属于应继续复用的基础工具。
- `AppHelperCheck.ts`：Helper 可用性、签名/密钥与健康检查，含跨平台能力，不应因 Windows 整理删除整个文件。
- `Sudo.ts`：跨平台 sudo 与旧 Windows 提权实现。只有确认旧 Windows 消费者都迁移后，才可能删除相应分支；其他平台仍需保留。
- `ProcessSnapshot.ts`、`ServiceProcessIdentity.ts`、`ServiceStop.ts`、`ServiceStopContext.ts`、`StopProcessList.ts`：当前服务发现、身份、快照与停止归属。不能另建一套 Windows 服务停止来替代这些通用实现。
- main 的 `WindowsPrivilegeCoordinator/Bridge` 与 fork 的 `WindowsPrivilegeClient`：跨进程协调选择和串行权限资源，与具体服务停止解耦。

## 3. 已确认可清理的冗余

### 3.1 没有进入点的服务身份上下文

`WindowsProcessSafety.ts` 中：

- `withWindowsStopProcessIdentities`，第 27 行。
- `withWindowsProcessStartupProofs`，第 80 行。
- 对应两个 `AsyncLocalStorage`、getter 与只为第二个包装服务的 `WindowsProcessStartupProof`。

对当前仓库 `src` 和 `scripts` 做符号检索，两种 `with...` 包装都只有定义，没有调用。`WindowsPrivilegeOperation.ts:93` 和 `:96` 仍读取 getter，但没有任何生产调用为这些上下文设置值。

因此，沿用服务首次列表身份、注册启动证明的这些分支当前不会被激活。保留它们只会让读者误以为普通服务仍把证明通过 ALS 交给 UAC。

清理时需要同时移除 getter 消费、`startupProofMap`、`startupProofScript` 及相应条件分支，不能只删除包装导致编译引用残留。保留普通权限身份采样与权限拒绝后的 CIM 固定身份机制，它们仍供端口提权工具使用。

这里的结论是当前仓库没有调用方；外部插件直接引用内部源码符号不属于已证明没有调用的范围，整理插件构建时仍应检查其可公开依赖的契约。

### 3.2 已弃用的身份解析

`WindowsHelperIdentity.ts:82` 的 `parseWindowsWhoAmIUserCsv` 只有身份测试脚本引用。当前 `getWindowsHelperIdentity` 已通过 .NET WindowsIdentity 获取账户/SID，并以显式 UTF-8 JSON 返回。

可以删除该旧解析函数及仅验证它的测试用例。保留当前 JSON 结果的身份校验，尤其是中文账户与原用户 SID。

### 3.3 已无发送方的诊断阶段

`WindowsActionStage.ts` 仍接受旧 `action.path.registry-*`、`action.path.other-vars-*`、`action.path.notify-*`、`process-list.*`。

当前注册表、广播与 CIM 脚本已移除这些临时阶段发送。此解析器处理当前运行时消息，不是离线历史日志读取器；“兼容历史诊断”不能成为永久保留这些协议项的理由。

可以删除这些整组旧阶段及对应注释；保留 broker/bootstrap、认证、launch、action 执行/结果运输阶段和安装失败诊断。清理不应误删业务结果 JSON、nonce、权限错误或安装错误标记。

### 3.4 仅测试引用不等于死代码

例如 `createWindowsNTFSProbe` 的注入入口、动作/安装脚本生成器、阶段等待函数都有同文件内部生产调用，同时导出供测试使用。不能仅因“其他 src 文件没有引用”就删除。

`ProcessPidListByPids` 当前没有其他生产调用，可以去掉多余公开便利接口或保留为明确的查询 API；这是低优先级表面整理，不是本轮复杂度的主要来源。

## 4. 应优先收敛的新旧执行链

### 4.1 标准入口已经统一

main 在 `Application.ts` 初始化期间注册 provider，fork 在 `runtime.ts` 中有 `parentPort` 时注册 provider。`Helper.send` 检测到 provider 后进入 `executeWindowsPrivilegeOperation`。

当前正常路径：

```text
真实业务方法
  → Helper.send
  → WindowsPrivilegeOperation：动作校验/普通尝试/当前令牌与用户选择
      → 普通或已提升：直接 Node API / 普通 runWindowsAction
      → UAC：授权租约 + runWindowsAction
      → Helper：授权租约 + 已有签名 RPC
```

机器级环境写入等直接进入令牌/授权分流；普通 Node 文件写入因权限拒绝而升级，不再启动同权限 PowerShell 复核。

### 4.2 旧入口仍是另一套策略

`Helper.ts` 在没有 provider 时，仍保留 `runWindowsUacFallback`、`routeUnavailableHelper` 与 `resolveWindowsHelperTransport`。其中缺少 Helper 二进制时，允许的动作会自动进入旧 fallback。

旧链：

```text
Helper 无 provider 分支
  → 旧 transport/fallback 策略
  → runWindowsHelperFallback
  → inline/TEMP/结果文件计划
  → Sudo 或独立 RunAs
```

这与标准入口的“先明确选择，准备失败不能替用户自动换方式”不是同一策略。标准 main/fork 初始化本身有 provider，不能因此直接断言旧分支在所有场景不可达。

特别是 `scripts/plugin-builder.ts:293` 起的 fork 插件构建会 bundle 源码；当前 host 映射明确处理了语言运行时，没有对这些权限 singleton/provider 做等价映射。如果插件导入了 Helper 或依赖它的源码，存在得到独立模块副本的可能。这里是构建方式支持的可达风险，未断言某个已安装插件已经触发。

**建议：先明确独立脚本和 fork 插件如何使用宿主权限入口，再取消旧自动 fallback；不能只删旧执行器，让无 provider 入口意外走另一套行为。**不需要为此增加新的业务 IPC，优先复用现有宿主请求/权限入口。

### 4.3 现代动作仍依赖旧计划构造

`buildWindowsPrivilegeAction` 尾部调用 `buildWindowsHelperFallbackPlanWithRoots`，把 inline limit 设为 `Number.MAX_SAFE_INTEGER`，最后只取 `plan.script`。

即使不使用旧执行器，也仍会构造旧计划对象及相关命令。这是当前最明确的职责混合：现代传输只需经过验证的业务脚本，却通过旧命令/TEMP 适配层拿脚本。

建议依赖方向调整为：

```text
动作验证 + 业务脚本构造
  ├─ 现代 runWindowsAction 使用脚本
  └─ 如确需旧兼容：旧适配层把脚本包装成命令/TEMP 计划
```

现代入口不再生成旧 command/plan。后续取消旧兼容时，才可删除对应 TEMP、结果文件、inline-limit 和 Sudo 包装代码，保留真实动作验证及脚本。

`scopedRuntimeRoots`、旧 allowed-roots 上下文也应改为显式构造参数，减少隐式全局依赖。当前构造是同步且 `finally` 恢复，静态审查没有把它认定为已经发生的并发污染故障；简化理由是依赖更清楚、无需维护两种取根目录方式。

可考虑将剩余现代实现命名为 `WindowsPrivilegeActions.ts`，集中保留动作策略与构造。不要再按每个操作拆成一个文件，造成更多跳转。

## 5. 职责位置与依赖收敛

### 5.1 通用 PowerShell 环境不应依赖 Helper 身份模块

`windowsPowerShellEnv` 当前位于 `WindowsHelperIdentity.ts:15`。普通 CIM 查询、卷查询、广播、管道、管理员令牌探测也因使用此函数而导入 Helper 身份文件。

建议移到 `WindowsSystemPaths.ts` 或已有 PowerShell 基础工具。它只负责继承当前环境并固定系统 `PSModulePath`，无需账户实例、任务匹配和 Helper 文件系统实现。继续保留这一环境限制，避免用户模块覆盖系统命令。

该调整是依赖清理；不能仅凭减少导入就声称减少了多少启动时间，需要实际阶段证据。

### 5.2 main 专属 Helper 管理可移出 shared

Installer 只由 main `AppHelper` 消费，Disable 只由 main `IPCHandler` 消费，可移动到 main 的 Helper 管理目录。两者继续引用共享的系统路径、状态契约、原生管道和 RunAs 辅助。

实例身份、错误码和协议字段仍被多个进程使用，应继续共享。移动文件只纠正所有者，并不会减少实现代码量。

### 5.3 通用计时名称应反映实际用途

`WindowsPrivilegeTiming` 的上下文/计时器已经用于通用服务停止等跨平台链路。可改为通用命名，保留 Windows 子进程计时标记的专门适配。

目前 PATH 诊断通过该观察器复用阶段事件，二者不是两套独立业务流程。不建议为删除一个小文件，把计时、日志、业务调度强行合成一个控制器。

### 5.4 终端链路还有 PATH 依赖

`WindowsTerminal.ts:13` 默认值、`:60` 的 Windows Terminal 子命令仍使用 `powershell.exe`；`Exec.ts` 也保留字符串 fallback。语言项目入口已传显式 PowerShell 路径，但 Windows Terminal 分支没有完全复用。

整理时可统一使用 `resolveWindowsPowerShellPath()` 的结果。中文命令载荷继续编码传输，不能把路径修复变成 shell 字符串拼接。这是基础路径处理遗漏，不是增加新认证抽象的理由。

## 6. 必须保留的边界

### 普通服务停止与端口工具不同

当前普通服务停止：首次进程列表 → 归属筛选/建树/排序 → `ProcessKillStrict` → `WindowsTaskkill`。执行层保留调用顺序，只去重，一次当前账户 kill。退出批次列表通过现有停止调用参数传递，不能恢复旧隐藏 ALS 身份运输或额外进程查询 IPC。

端口工具仍从 `Tool.win/process.ts:81` 调用 `Helper.send('tools', 'killPorts', ...)`，可能处理并非 FlyEnv 当前账户启动的监听进程，仍经过权限动作与等待前后身份保护。不能用“FlyEnv 服务无需管理员”推导端口工具也可删除全部提权/身份判断。

### 认证运输与安装结果不是普通日志

UAC 的原账户与批准账户可能不同，业务内容不能依赖原账户 TEMP 可读性。命名管道访问控制、对端身份、nonce/载荷校验和可信终态仍有实际用途。

启动/等待失败要区分“明确未执行”和“可能已经执行”；未知写操作不能自动重放。这些复杂度应留在共享执行边界，而不是复制到各个业务模块。

### DNS 与环境广播生命周期不同

DNS 当前只等 spawn，允许 FlyEnv 退出后工具继续执行；环境广播按用户要求使用默认进程引用，业务 Promise 不等通知启动/完成。两者错误都不否定已完成的 hosts/注册表写入。

可以复用编码、路径和安全日志小工具，不能为了合并文件把 detached/unref、返回值或等待方式统一为一个默认策略。

## 7. 建议实施顺序

1. 删除无调用 ALS 包装及消费分支、旧 CSV 解析、失效阶段白名单。同步调整只验证旧实现的用例或源码断言。
2. 移出通用 PowerShell 环境函数，补齐终端显式路径；这些改动不改变授权选择和业务终态。
3. 现代动作构造脱离旧 plan，改显式上下文；保持动作白名单、路径限制、中文载荷与冲突检查。
4. 明确独立脚本/插件的 provider 入口，收敛无 provider 自动 fallback；之后删除确实不再需要的旧 Windows Sudo/TEMP 执行适配。
5. 最后移动 main 专属文件、调整通用计时名称。文件位置整理不应和执行语义同时大改。

未来实施仍沿用当前所有者：main 管理授权选择与 Helper 生命周期，fork 模块管理进程与写入业务，renderer 只持弹窗/UI 状态。中间日志不是成功事件；真实操作结算后才安排附加通知，通知失败只产生诊断；并发去重和授权租约继续由现有拥有者处理。

实施后的验证范围应覆盖：无 Helper 的 UAC、当前管理员、Helper 模式、切换停用、跨账户批准/取消/未知终态、中文与空格路径、普通服务单次有序 taskkill、端口占用变化、退出批次共享列表、后台通知失败不改变主结果及 fork 插件。此处记录的是后续验证范围，本次审查没有运行这些操作。
