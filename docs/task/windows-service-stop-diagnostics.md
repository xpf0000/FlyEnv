# Windows 服务停止诊断日志

最新加载/DNS 调整见 [worker 加载与 DNS 刷新](windows-worker-startup-and-dns-refresh.md)：
fork 分块、轻量入口与运行时导入计时；Windows DNS 只等待系统工具启动。

最新补充见 [服务停止派发与退出清理阶段日志](windows-service-stop-dispatch-diagnostics.md)：
主进程选池/发送、worker 就绪/接收、模块解析/初始化、终态及 hosts/DNS 的分段耗时。
完整当前停止链路见 [首表直接传参](windows-service-stop-direct-snapshot.md)；以下保留各轮
诊断历史，旧 UAC/Helper 服务 kill 和逐 PID 等待字段不代表当前 ProcessKillStrict 实现。

## 2026-10-03 细分日志实施契约

用户要求先细化日志，再按新现场数据决定耗时优化。本轮不改普通权限/UAC/Helper 的执行路由、查询次数、父身份核验、并行停止或启动组顺序。

- 所有者：Base 的公开停止入口建立模块级异步诊断上下文；模块负责目标发现，共享执行器负责派发和确认；broker 与 action 各自记录真实启动阶段。
- 生命周期：从停止入口到 PID 清理、成功或失败使用同一 stopId；启动前清理也经过该入口。既有 ForkPromise 的进度回调和错误传播保持。
- 中间事件：普通模块的首次查询窗口、文件候选、筛选原因与完整目标；Node spawn、PowerShell 引导、编译、启动授权、Process.Start、连接/认证、业务执行及结果到达。
- 终态：成功、失败、空目标均记录。空目标是筛选结果，不表述为已执行 kill。阶段日志不是认证结果，不用于授权或重放判断。
- 并发与状态：只使用已有 ALS 和本次进程内局部列表，无配置、Pinia、renderer 状态或新增 IPC；日志沿原入口复用，不复制停止逻辑。
- 检查安排：阅读修改后的源代码和差异，复核筛选、进度、失败和迟到结果边界；本轮不运行测试、构建或真实服务停止。耗时改善须以后续 Windows 现场记录为依据。

## 操作契约与实施安排

本轮只补诊断，不把“快照后产生 worker”当成已确认的现场根因。上轮有界补停保留为失败收尾措施，具体遗漏必须由本轮前后快照及执行日志确定。

- 所有者：PHP fork 记录本版本目标发现；共享停止工具记录树根压缩、派发和退出对比；普通权限/UAC 执行器和 Go Helper 记录真正的 taskkill 调用。
- 生命周期：每次 PHP stopService 有独立 stopId；主停止与有界补停共用该 ID，记录时间和顺序。日志状态只存异步上下文，不传入服务对象、配置或 renderer。
- 终态：记录成功、失败及剩余 PID，但诊断不能改变权限判断、目标筛选或失败传播。日志写失败不改变停止结果。
- 并行：每个 stopId 独立，同 PID/版本的不同请求也不混淆；保留退出并行及启动组串行。
- 查询：复用现有完整列表和执行端身份查询，不为日志新增 CIM 查询，不为 worker 增加身份采样。
- 修改安排：公共日志上下文 → PHP 初始/末次相关进程快照 → 公共树根与派发日志 → 执行端 taskkill 事件 → Go Helper 同步日志/版本 → 源码检查与文档。
- 不新增 Pinia、持久配置、IPC 或第二套停止控制器；未新增/运行测试或实际服务操作。

## 已记录的信息与修改位置

`src/shared/ServiceStopDiagnostics.ts` 提供通用 AsyncLocalStorage 日志上下文。每条 `[ServiceStop][diagnostic]` 带 `stopId`、本轮递增 `sequence`、UTC `at`、相对 `elapsedMs`；PHP 还附带 module/version/bin/rootPid。补停沿用原 ID。管道 callback 使用已绑定的 logger，避免并行或迟到回包关联到其他停止。日志只观察，写入失败不改变停止结果。

`src/fork/module/Php.win/index.ts` 增加：

- `php.begin`：安装目录与版本号。
- `php.detected`：完整查询的开始/结束时间、总行数、登记/文件候选、每个 PID 文件的值、缺席候选、确认 spawner 根、覆盖后代、孤立树、最终完整 targetPids。
- 同一事件的 processes 保留相关 PHP 行与显式候选，包含 PID/PPID、创建时间、实际 EXE、命令行、根字段是否完整、当前父创建时间及父子时间关系是否有效。未被选中的相关 PHP 也记录，因此能对照路径/ini/PPID/创建时间复核筛选遗漏；不输出全系统命令行。
- `php.after-primary`、`php.after-recovery`：该阶段请求 PID、版本残留 PID、相关完整行。
- `php.recover-residuals`：额外根是否存在于初始目标以及前后创建身份；`php.failed-residuals`/`php.failed` 和 `php.completed` 记录真实终态。

`src/shared/Process.ts` 增加：

- `kill.tree-selection`：完整 targetPids、压缩后的 rootPids、由树根覆盖而不单独提交的 descendant PID，以及这些目标的 PID/PPID/创建时间/EXE。
- `kill.dispatch`：真正提交给权限路由的根 PID、因首次列表缺席而跳过的根和携带的身份快照。
- `kill.returned`/`kill.failed`：权限路由返回结果；它们不代表每个后代实际执行了独立 kill。

`src/shared/ServiceStop.ts` 增加：

- `service.begin/completed/failed`：本次公共停止的完整请求及初始身份。
- `exit.observed`：每轮 poll、缺席 PID、原身份仍在的 PID，以及同编号进程的 `same`/`pid-reused`/`unknown`/`absent-in-initial` 判定和原创建时间。
- `pid-file.retained/removed`：对应文件、PID，以及空/缺失、候选外、仍活着或内容已变等保留原因。仍复用原读取次数与最终列表。

## 实际执行端证据

`src/shared/WindowsHelperFallback.ts` 的停止脚本记录执行端事件：预检请求、缺席/自然退出跳过、预检和派发前的实际创建身份/EXE、taskkill 请求的完整系统路径及 `/F /T /PID` 参数、真正启动的 taskkill 进程 PID、退出码/超时、真实 stdout/stderr、根退出和失败阶段。

为捕获原始输出，taskkill 启动使用同一个 .NET Process 配合 ProcessStartInfo 重定向两路输出，保持原固定 EXE、数字 PID 参数、隐藏窗口和十秒上限。两路 ReadToEndAsync 同时读取，避免等待进程时管道写满；本机原生输出按系统默认 ANSI 解码，随后诊断事件仍通过 UTF-8 JSON 管道传回。没有增加 shell、临时文件、kill 命令或系统查询。

事件只存在于本次脚本的列表；`src/shared/WindowsElevation.ts` 在成功或异常的认证管道终态中回传 `processStopEvents`，仍保留原业务 data/ok/error 语义。Node 只在原 pipe/nonce 校验后记录 `action.execution`，附 actionId/elevated，已有 `[WindowsPrivilege][action]` 同时补 stopId。动作超时不能伪造已执行证据；若获得迟到认证结果，仍记录实际事件。诊断字段不参与授权、身份检查或成功判断。

`src/shared/WindowsPrivilegeOperation.ts` 将权限快照、Helper 实际 RPC 派发纳入同一 stopId；原普通权限/UAC/Helper 分流不变。

`src/helper-go/utils/process_tree_windows.go` 同步记录 `[ServiceStop][helper-execution]`：executionId、UTC/相对时间、接收根和身份、缺席跳过、实际创建时点/EXE、真正 taskkill argv、taskkill 进程 PID、退出码、原始 stdout/stderr、原句柄确认及最终返回错误。仍使用既有原生身份查询和 taskkill，不添加系统进程枚举。

原生 Go 输出若不是有效 UTF-8，额外保留 stdoutBase64/stderrBase64 原始字节，避免 JSON 替换字符导致中文日志细节不可恢复；这些字节不参与错误分类或停止判断。

Go Helper 不继承 Node 的 ALS，也不改变签名 RPC 参数；通过根 PID/创建身份/UTC 时间匹配 `privilege.helper-dispatch`，同一 Go 调用再按 executionId 匹配。Helper 使用既有 AppDebugLog 写自身账户 TEMP 下的 `flyenv-debug.log`，与 Node 所在账户 TEMP 可能不同；分析 Helper 现场要取得对应执行账户的日志。

Go 源码变更后 Helper 版本由 32 升为 33，同步 `src/helper-go/main.go`、`src/shared/AppHelperCheck.ts` 与版本同步脚本的期望值。旧 32 二进制不包含新增执行端日志；本轮没有编译/替换 Helper 二进制，也未执行版本脚本。

## 如何据日志判断，哪些仍不能推断

按失败版本的 `stopId` 检查下列事实：

1. 残留 PID 是否在 `php.detected.processes`：不在只证明本次查询未返回这行，不自动证明其创建在查询之后；还要对比创建时点和查询窗口。
2. 行存在但不在 targetPids：查看是否为本安装/专用 ini、字段是否齐备、是否属于有效父树；这是目标筛选方向的证据。
3. 在 targetPids 但没有单独 rootPids：该 PID 被祖先树覆盖；根据父子创建身份和实际 taskkill 根判断压缩是否正确。
4. rootPids 已提交，但实际事件为 skipped/error 或没有 taskkill-started：不能说它已被实际 kill。认证结果缺失也只能保留未知结论。
5. taskkill 已启动并返回 0，但原身份仍在或本版本出现另一身份：再分别判断原目标未退出、PID 复用或额外进程。返回 0 不直接证明所有 worker 已退出。
6. 补停过程也具有 tree-selection/dispatch/execution/observed，能判断补停实际执行到哪一步。

当前没有读取 Windows taskkill 内部的完整动态后代清单；执行事件证明的是实际根参数和结果，原始 stdout/stderr 保留 taskkill 报告的处理 PID，完整后代是否消失由停止后的列表证明。没有对应现场日志之前，不将任何一种可能性写成已确认根因。

## 本轮检查结果与限制

- 9 个相关 TypeScript 文件源码解析无语法诊断，导入引用检查未发现未使用导入。
- 从源模板静态重建树/非树停止主体、开启/关闭计时的引导共四个片段，使用当前 PowerShell 的 Parser 做纯语法解析，均无语法诊断；模板外既有 helper/preamble 使用占位，不是完整业务脚本执行验证。
- 初次从 Node 启动 Windows PowerShell 解析器被当前沙箱以 EPERM 拒绝，随后改用工具当前 PowerShell 进程直接解析文本；没有申请提权或执行脚本中的停止命令。
- 已跟踪改动的 `git diff --check` 返回 0；未新增/运行功能测试、完整类型检查、构建或真实服务停止，也未编译 Go Helper。
- 根因尚未确认；新的 stopId 与执行端证据用于下一次同场景复现时定位。

## 2026-10-03 普通模块发现与启动阶段细分

### 现场证据与本轮范围

已读取用户提供的 `D:\Temp\User\Temp\flyenv-debug.log`。本次退出的 PHP 7.3/8.1/8.2 每组检测 9 个目标，taskkill 输出均覆盖全部目标，退出复查均无残留；上次遗留的 PHP 7.3 worker 19860 及 conhost 37132 在本次启动前清理成功。这份日志没有上次失败的完整快照/执行输出，不能确认上次漏杀根因。

本次 PHP 实际 taskkill 仅约 0.26～0.40 秒，但 action 开始到执行端身份预检开始约 5.19～7.03 秒；这段混合了 broker 和第二个 PowerShell 的启动等开销。用户随后明确要求先细化日志，再决定优化。本轮因此没有引入普通权限直接执行通道，没有改变 UAC 认证管道或父身份检查，没有宣称耗时已经改善。

### 修改文件及理由

`src/fork/module/Base/index.ts`：

- `stopServerWithDiagnostics` 由原公开 `stopService` 和 Base 启动前清理共同调用；仍调用原 `_stopServer`，不改为动态派发其他公开覆盖方法，避免 MySQL 分组等参数语义改变。
- 普通模块现在从 `module.stop-begin` 开始拥有模块/version/bin/rootPid/stopId；最终进度、结果、异常继续通过同一个 ForkPromise 转发。PHP 原上下文复用，因此公共日志和 PHP 专用日志仍关联一致。
- `module.targets-detected` 保留原首次查询窗口、总行数、PID 文件值、登记候选、完整 targetPids 和候选身份行。
- `selection` 按两个现有来源记录 `registered-or-pid-file` / `service-name`，明确区分 `absent`、`unreadable-root`、`instance-predicate-mismatch`、`ownership-mismatch`、`selected`、`covered-by-selected-tree`。过滤逻辑合在同一个局部函数，仍使用既有归属工具和模块 predicate，没有新增 EXE 全量匹配。
- `emptyTargets=true` 明确表示本次没有选中目标；不能由一条 completed 推断执行过 taskkill。身份行保留命令是否可读的 boolean，但不输出普通模块原始命令或额外参数，避免数据库口令进入日志。

`src/shared/WindowsActionStage.ts`：

- 共用 PowerShell 阶段生成器与 Node 解析器；固定白名单、UTC 格式、非负有限耗时和整数 PID 校验，阶段/字段不接受自由诊断文本。
- broker/CIM 从 stderr 输出固定协议；action 通过原认证终态回传阶段数组。格式中无脚本、nonce、PATH/环境值、文件内容。阶段不是新的权限或业务结果协议。
- PowerShell 使用同进程 Stopwatch 记录 `elapsedMs`，UTC `at` 用于跨进程对照。阶段写入失败被隔离，不改写真实业务错误。

`src/shared/WindowsActionPipe.ts`：

- Node 记录 `node.spawn-request`、`node.spawned`、`node.ready-accepted`、`node.launch-sent`、`node.result-accepted`、`node.child-closed`，并记录直接 broker 的 PID。
- broker 记录引导进入、source 帧读取/解码、C# 编译开始/结束、业务帧读取/解析、pipe 创建、READY、LAUNCH 授权、客户端连接/身份认证、payload 发送和结果接收。
- native 启动线程记录 `launcher.start-request`、`launcher.start-returned`、`launcher.child-exited`。可以将 Process.Start 的同步耗时与后续 PowerShell 初始化/业务执行分开；UAC 的 Process.Start 还可能包含用户批准等待。
- stderr 按完整行解析并有界缓冲，不污染 stdout 的 READY/launch/result，也不修改原 UTF-8 读取器、ACL、nonce、digest、父存活监视或超时策略。普通正常退出及调用方主动关闭不记为 transport-failed。
- 观察器失败隔离；迟到事件仍使用已绑定的 action/stop 日志上下文。日志接收顺序不代表源事件发生顺序。

`src/shared/WindowsElevation.ts`：

- action 固定引导记录自身进入、connect 开始/完成、payload 收到/digest 通过、业务执行开始/结束、准备写结果。
- `actionStages` 随既有认证结果返回。原第一份有效终态固定、失败分类、未知状态/禁止重放与迟到结果处理保持。
- `action.transport-stage` 绑定 actionId/stopId，区分 Node 写日志的 `at` 和源事件的 `sourceAt`；`sourcePid`、`sourceElapsedMs`、`clock` 用于对齐。
- `authenticated=true` 仅表示阶段来自原认证 action 结果。Node/broker stderr 的阶段标记为 false，它们不能证明动作成功。每个 action 最多记录 256 条运输阶段，回包最多解析 64 条 action 阶段。

`src/shared/Process.win.ts`：

- 同一次原全量查询记录 `queryId`、Node 查询开始/子进程创建、PowerShell 引导进入、CIM 查询及字段投影开始/结束、JSON 序列化开始/结束、Node JSON 解析和总行数。
- `$rows` 与 `$json` 只是本次原查询的局部结果；没有第二次 CIM，没有变化的目标或查询缓存。标准输出仍为原 JSON；固定 stderr 不影响中文路径/命令行的 UTF-8 解码。
- `queryMs` 在 execFile 返回后、写阶段日志之前固定；`parseMs` 为本机 JSON 解析耗时，`durationMs` 包含本次诊断收尾，因此不要把后者全算成 CIM。
- 查询失败时保留已返回的有限阶段，再传播原异常；解析失败也单独记录，不返回空列表。原时间测试保留聚合阶段，细分信息可直接从 debug 日志分析。

### 下一份日志如何定位优化点

1. 按 `stopId` 对齐模块发现、树根派发、action、退出确认和 PID 清理；同一查询再按 `queryId` 对齐，运输按 `actionId` 对齐。
2. 对照 Node spawn 和 broker.bootstrap 定位第一个 PowerShell 的创建/初始化间隔；compile-start/end 是实际 C# 编译时间。
3. broker.ready → Node ready-accepted → Node launch-sent → broker.launch-authorized → launcher.start-request 分别揭示父子握手与启动线程调度间隔。
4. launcher.start-request/returned 是 Process.Start 的同步阶段；returned → action.bootstrap 是第二个 PowerShell 的初始化间隔。action.bootstrap 的事件会随终态稍后写入日志，必须使用 sourceAt，不能使用文件行号来排序。
5. action.connect/payload/digest 阶段与 broker.client-connected/authenticated/payload-sent 对照，定位认证和传输；action.execute 与已有 taskkill 事件对照，定位业务和原生 kill。
6. process-list.cim 与 json 的同源 Stopwatch 差值区分 CIM/字段投影和 PowerShell JSON 序列化，Node parseMs 区分本机解析。执行前/退出确认分别有不同 queryId，仍复用各自现成列表。

只有同一个 PID/clock 的 sourceElapsedMs 可以直接相减；不同进程时钟以 UTC 对照，系统时间校正可能影响跨进程差值。Node 的 at 表示日志创建时点，不能替代源时间。action 在连接/认证失败且没有终态时，收集的内部阶段无法回传，此时只能使用 broker/launcher 阶段及原 73/未知分类，不能补造 action 的执行证据。

### 本轮范围与检查限制

本轮没有修改 Go Helper，因此发布版本仍为 33；原 Go taskkill 执行日志继续使用。修改中增加了详细注释；5 个涉及实现的 TypeScript 文件做了源码解析，未发现语法诊断。未运行功能测试、PowerShell 脚本、完整类型检查、构建或实际服务停止；后续需用新的现场日志确认时间分布，再选择具体优化。

## 历史阶段：取消 /T 后的逐 PID 日志口径

服务已改为完整显式 PID 一次提交并按父先子后执行，普通/UAC 服务日志用逐 PID 的 `stop-process-request`（method=`Process.Kill`）和 `process-exited`；Go Helper v34 用 `terminate-request`（method=`TerminateProcess`）和 `process-exited`。服务不再产生 taskkill 子进程、argv 或输出日志，旧 taskkill 字段属于历史执行方式，普通进程工具仍可能产生这些字段。

`kill.tree-selection` 现在同时记录 `descendantPids` 和实际 `orderedPids`；`kill.dispatch` 的 `orderedPids` 是完整提交集合。后代首次创建身份标为 `cim-descendant`，只绑定原对象，不独立匹配服务配置；没有增加 worker CIM 查询。运输细分和 stopId/actionId/sourceAt 关联继续使用现有实现。认证执行日志保留最多 4096×6 条事件，并记录 `eventCount/eventsTruncated`，避免大集合后半批执行细节无提示地丢失。

缓存现状、当前流程、逐文件调整与限制见 [Windows 服务按父先子后停止](windows-service-stop-parent-first.md)。新源码版本为 34，尚未重新编译 Helper 二进制；本节不代表实机运行结果。
