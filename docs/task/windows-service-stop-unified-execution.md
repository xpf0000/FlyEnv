# Windows 服务停止统一执行与批次快照

最新快照传递方式见 [服务停止首表直接传参](windows-service-stop-direct-snapshot.md)：
完整列表随 stopService 请求直接传入，已删除下面历史实现中的 batchId/Map/登记释放协议。

## 1. 本轮目的及适用范围

本轮依据用户批准的两项要求实施：统一使用 `ProcessKillStrict`，移除 Windows 无条件进入 Helper 的分支；批量停止在整个批次内共用一份初始进程列表。同时落实前面讨论的退出策略：Windows 强制停止不逐 PID 阻塞等待，应用退出不再追加全量 CIM 确认，数据库原生关闭保留确认。

本文件是当前实现说明。先前文档中的“服务树专用停止入口”“父退出后再杀子”“每个服务退出后全量查询”“仅靠 650ms 缓存覆盖批次”均属于旧实现。

2026-10-04 按用户补充决定，Windows 服务停止只使用当前账户权限：FlyEnv 的服务不需要管理员权限启动，因此去掉停止失败后的 PowerShell/UAC/Helper 恢复。旧版 ProcessKillStrict 的“Helper 可用则使用”只是执行方式选择，并不说明停止必须提权。本节及后文已按最新决定修订。

同日进一步简化：模块发现阶段已经从进程列表筛选归属，kill 执行层不再重复检查 PID 范围/数量、根/后代的路径及创建时间、启动证明或整张快照的字段。删除 stopWindowsSnapshotWithIdentity 及 stopWindowsServiceSnapshot，只保留按传入顺序去重、命令执行和诊断；不重复按祖先深度排序，不因一条身份字段不齐的后代阻断全部目标。系统工具路径、命令行长度及执行超时属于命令运行边界，仍保留。

## 2. 当前完整链路

### 2.1 批量发现及派发

`ServiceProcess.stopRegisteredInstances()` 复制本轮服务参数、PID 和登记代次，先清除短缓存并通过 ForkManager 获取一次完整进程列表。列表保存在本轮局部变量中，构造 `{ processList, reason }`；任一停止请求均在初始查询完成后派发，不再生成批次 ID 或登记 Map。

各实例使用 Promise.all 并行调用原模块 stopService。ForkItem 把完整表和 reason 随同原停止命令一次发送；fork/index 解包后由 BaseManager 统一插入内建 stopService 第二参数，原业务参数顺延。各停止入口在调用范围绑定该参数，StopProcessListFetch 直接返回它，不请求主进程取表，也不受 650ms TTL、模块加载延迟或普通缓存失效影响。插件保持原签名并绑定同样范围。

这覆盖目前由主进程明确编排的批量入口：应用退出、MCP 批量停止及插件停用。界面原有逐实例并行 stop 请求继续使用短 TTL/in-flight 缓存；本轮没有将独立界面请求隐式合成一个批次，也没有改变启动组串行顺序。

本轮表由调用参数/局部引用持有，不再通过 finally 释放登记。重叠请求分别携带自己的表，不共享可覆盖的全局变量。主进程初始查询失败时，本批各项返回失败并保留登记；没有批次取表 IPC、超时或未知 ID 的后续分支。单独停止未传表才走普通短缓存查询。

### 2.2 服务归属与目标准备

各模块仍负责确认自己的根、数据目录/配置标记、原生数据库关闭及伴随服务顺序。初始表保留 PID、PPID、创建时间、EXE、命令行。公共树收集仍使用创建时间有效父子关系，避免历史 PPID/PID 复用误选。

服务公共停止直接调用 `ProcessKillStrict('-INT', pids)`。ProcessKillStrict 就是唯一执行实现，不再有 executeProcessKill 包裹、列表参数或 stopWindowsServiceSnapshot 第二次排序。公共建树 collectProcessSnapshotTree 先把父节点加入结果，再递归收集子节点；ProcessListByExactPid、ProcessPidsByPid、ProcessOwnedPidsByPid 等返回这份父先子后的顺序。PHP 等模块组合各树及独立目标后传入集合，执行层按原顺序去重并传给 taskkill。原先新增的深度排序会把多棵树的所有根重新集中到最前，属于重复改序，已删除。

首次完整表仍留在 ServiceStop 记录目标信息及确认结果，不传给 kill 重新建树、压缩根或计算深度。项目/自定义服务的 verifyServiceProcessIdentity 在发现阶段已有校验并过滤身份不匹配的根，因此删除多余 startupProofs 参数和执行层第二次比较。两个原公开入口 ProcessKillTreeStrict、ProcessKillServiceTreesStrict 已移除，没有第二套实际停止实现。

普通进程工具调用相同 `ProcessKillStrict(signal, pids)`，只结束显式 PID，不动态扩树。Unix 继续使用既有 Helper/信号命令策略。

### 2.3 普通 Windows 执行

所有真实执行进入 ProcessKillStrict。Windows 对调用方目标原序去重后直接使用 taskkill，不重复排序或 PID/身份校验，不检查 Helper 安装状态或管理员令牌；成功和失败均不会转发到权限协调器。kill.dispatch/kill.command-request 的 orderedPids 记录实际传入的命令顺序，模块目标日志及 service.begin 保留停止前 PID/创建时间/路径等信息；不再生成执行层第二次推导的 kill.tree-selection。

Node 使用 execFile 直接启动系统 taskkill.exe，一次参数数组携带 `/F /PID ... /PID ...` 全部有序 PID，无 shell、无 PATH 搜索、无 /T、无逐 PID 外部命令。使用已有 WindowsSystemPaths 解析完整系统工具路径，支持非 C 盘 Windows 和大小写不同的系统环境键；文件缺失、非法目录、命令行超长均明确失败。

服务父 PID 排在子 PID 前，但不等待父完成退出；taskkill 内部处理顺序与 Windows 异步终止意味着“父参数在前”不是“父已退出”的保证。这是用户要求恢复一次多 PID 命令后的执行语义。

命令有 10 秒上限，只等待这一次 taskkill 命令结果。记录真实命令 PID、参数、退出码、原始 stdout/stderr base64 及计时；中文/OEM 输出不用于权限分类。普通成功不启动 PowerShell。

### 2.4 非零结果与错误传播

taskkill 可因部分目标自行退出而整体非零。仅在所有数字 PID 的 Node 零信号检查都明确返回 ESRCH 时视为幂等成功，EPERM 不能解释为不存在；该检查不启动 PowerShell。

只要还有目标未明确缺席，便传播原 taskkill 错误。ENOENT、启动失败、命令被杀或超时同样直接传播，不启动第二次 PowerShell、UAC 或 Helper。日志保留原命令参数、退出码与输出，模块不会把失败伪报成功；并行批次隔离单项错误，其余服务继续停止。

零信号检查通过 Node 的 `process.kill(Number(pid), 0)` 探测 PID 存在状态，不结束进程、不启动外部程序或全量 CIM 查询，也不构成第二次停止。它只在 taskkill 非零时发生，全部 ESRCH 才接受幂等成功；仍存活、EPERM 或其他不明结果都保留失败。这个结论来自命令后的原生状态探测，而非单条 taskkill 的输出或整体退出码。检查只说明探测时该数字 PID 已不存在，不能绑定原创建身份或保证没有新增 worker；数字已复用时保守报告原命令失败，不再结束新进程。它与被删除的执行前重复校验是两个阶段。

Process.ts 不再构造 WindowsStopProcessIdentities/WindowsProcessStartupProofs 权限 ALS 或第二次校验层。首次列表的 PID/PPID/创建时间用于发现阶段的原有树选择，路径/命令/创建信息继续写入服务诊断；kill 层不因任一字段缺失而抛出身份异常。归属、建树及启动证明属于候选筛选职责，不能在命令执行器中重复处理。

管理员模式的 FlyEnv 也执行相同 taskkill；不存在服务停止独有的权限选择。系统 hosts、PATH、受保护文件等操作仍使用既有授权逻辑。独立 Helper/UAC 工具协议实现保留，但 ProcessKillStrict 不再调用它们；本次没有修改 Go 代码或再次升级版本。

上一轮保留的 Go Helper 工具协议服务模式一次签名请求携带全部有序 PID，身份/原句柄预检后连续 TerminateProcess，不逐 PID 等待。Go/TypeScript HelperVersion 仍为 35；不再把该协议描述为本账户服务停止的恢复链路。

## 3. 退出与交互停止的差别

共同点是相同模块归属、相同初始 PID 集合、同一 ProcessKillStrict 和普通权限 taskkill。

- UI/MCP 普通停止：命令成功后仍用新列表确认原 PID/创建身份退出，PHP 可按专用 ini/EXE 识别并补停一次已证明归属的残留。
- 应用退出的强制停止：命令成功后记录 `service.command-completed`，`confirmation=skipped-on-quit`，不再全量查询或残留补停。失败记录后其他实例继续，应用仍退出。
- 数据库：Base 对 mysql/mariadb/postgresql/mongodb 的公共强制路径要求确认；原生关闭后的公共回退也显式要求确认，保留模块原有允许/禁止强制回退策略。

未查询时不能伪造“最终列表”。ServiceStop 返回初始表的独立数组，并在 WeakMap 中绑定本次成功命令的目标集合。PHP 检查这个标记后跳过残留筛选。PID 文件清理仅对成功命令集合中的固定 PID，或真实最终列表确认不存在的 PID 进行；删除前仍重读文件，内容被替换则保留。日志说明清理依据是 `stop-command-completed` 还是 `exit-snapshot`。命令失败/结果未知不生成成功证据。

## 4. 逐文件改动原因

- `src/shared/Process.ts`：ProcessKillStrict 直接作为公开严格停止入口和唯一执行实现；删除 executeProcessKill 转发包裹、重复 PID/身份校验、stopWindowsSnapshotWithIdentity 及 stopWindowsServiceSnapshot。执行层不接收列表、不重新排序，保留调用方顺序及命令日志。Windows 只执行普通权限 taskkill，不进入 Helper.send 或授权 ALS。Unix 原有 Helper/信号选择保留。
- `src/shared/WindowsTaskkill.ts`：固定系统工具完整路径、一次 execFile 参数数组、命令长度/超时边界、非零竞态判断及原始输出诊断。
- `src/shared/WindowsHelperFallback.ts`：按 PID 的普通/服务授权动作共用一次多 PID taskkill；保留句柄和创建身份预检；端口停止保持独立监听者语义。
- `src/helper-go/utils/process_tree_windows.go`：服务连续原生终止，不再逐 PID 等待；普通 taskkill 不再命令后逐句柄等待。
- `src/helper-go/main.go`、`src/shared/AppHelperCheck.ts`、`scripts/helper-version-sync-test.ts`：同步发布版本/既有校验常量至 35。
- `src/shared/ServiceStopContext.ts`：定义直接传入的完整表/退出原因及请求异步范围，不新增 UI/domain/持久化状态。
- `src/main/core/StopProcessListCache.ts`：只保留普通短 TTL/in-flight 缓存，删除批次 Map 和登记/释放。
- `src/main/core/StopProcessListBridge.ts`、`src/fork/StopProcessListClient.ts`、`src/shared/StopProcessList.ts`：批量先直接读参数中的表，普通查询才使用缓存 IPC；删除 batchId 字段。
- `src/main/core/ForkManager.ts`：提供一次取表方法，删除批次生命周期 API。
- `src/main/core/ServiceProcess.ts`：先取一次表再随命令并行派发，局部引用自然释放，逐实例错误隔离；只有应用退出携带 quit 原因。
- `src/main/core/ForkItem.ts`、`src/fork/index.ts`、`src/fork/BaseManager.ts`：列表与命令同一 IPC 消息传递，统一插入内建 stopService 第二参数，业务参数顺延。
- `src/shared/ServiceStopDiagnostics.ts`：在已有停止 trace 中记录首表直接来自参数及 reason，不增加查询。
- `src/shared/ServiceStop.ts`：公共入口直接用 ProcessKillStrict，不再把首次列表传给执行层；表仍用于已有目标诊断和退出确认。移除多余 startupProofs 参数，退出跳过重复全量确认，明确区分命令证据与查询证据。
- `src/shared/ServiceProcessIdentity.ts`：项目/自定义服务保留发现阶段 verifyServiceProcessIdentity 与逐候选过滤，停止时不再构造/传递第二份启动证明。
- `src/fork/module/Base/index.ts`：数据库强制路径要求确认，其余模块复用公共退出策略。
- `src/fork/module/Php.win/index.ts`：退出命令结果不能拿初始表检查残留，跳过该分支；交互确认/补停保留。
- `src/fork/module/Redis/RedisCommander.ts`、`src/fork/module/DbGate/index.ts`：首次停止发现接入批次；保留注入 provider，打开/活性/确认仍取新表。

## 5. 边界及验证状态

直接 taskkill 以数字 PID 执行，首次快照与执行之间仍存在 PID 复用窗口；它不能提供原生句柄终止那样的执行身份绑定。模块发现阶段的归属/启动身份筛选保留，执行层不重复校验或为每个 PID 增加 PowerShell 采样。退出跳过全量确认也不再保证快照后新建 worker 已消失，日志必须区分命令完成与退出确认。

已做源码链路复核、TypeScript 源文件语法解析和 diff 空白检查；这些不等于运行时、类型检查或实机验证。没有新增/运行测试、构建、真实 taskkill/UAC/Helper 操作。Go 二进制未重新构建；发布需使用 v35 重建各平台产物，Windows 主备必须来自同一产物。

后续应使用用户现有计时脚本及新一轮 debug 日志观察：主进程只取一次初始表，各批量服务显示 snapshotSource=stop-argument，不再有 batchId 取表；普通停止应看到 kill.command-request/spawned/result，不再有 broker/action PowerShell 启动；应用退出强制停止没有 service.exit.poll，数据库及交互停止仍有确认。真实耗时改善待日志验证。
