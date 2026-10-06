# Windows 服务停止快照与公共阶段合并

## 用户要求与操作契约

用户授权：首次完整进程列表返回所需创建时间；将可合并的停止逻辑移到公共实现，不在模块重复查询、等待和清理。沿用此前确认的两个目标来源（运行 PID/私有文件，以及服务名加实例标记），父归属确认后信任整棵后代；不按 EXE 全扫描结束其他实例。

- 所有者：fork 模块拥有目标归属和原生关闭策略；共享 Process/Windows 权限层拥有父树执行与身份复核；共享 ServiceStop 拥有退出确认和按文件当前值清理，Base 只提供薄包装。main/renderer/MCP 继续调用同一 stopService，无新 IPC、新状态存储或第二套生命周期。
- 快照寿命：一次停止调用内不可变，首次 CIM 将 CreationDate 格式化为 UTC invariant 原文；只对将执行停止的树根要求创建身份，worker 无单独身份授权。停止后的新列表不缓存到下一次停止。
- 事件与终态：既有进度仍非终态；候选发现阶段逐项过滤证据缺失/归属不匹配，确认的目标继续停止。实际关闭、原目标消失、版本残留检查及 PID 文件处理成功后才返回成功。查询失败、执行阶段身份变化、取消与未知执行结果保留失败，不自动补杀或切换授权方式。详见本文末尾的候选过滤补充。
- 重入：沿原 renderer 实例 flight 与权限租约；按后续用户要求，main 已恢复不同实例并行停止，退出/MCP/插件复用公共批量编排，同实例和模块屏障仍按序。各实例失败隔离；原生数据库回退必须保持初始身份约束，不能把刷新后复用的 PID 补认为原实例。完整并发规则见 [服务生命周期并发](service-lifecycle-concurrency.md)。
- 执行器输入：首次列表包含创建时间时携带该 CIM 来源身份到共享权限入口，取消重复的授权前采样进程；实际执行前仍按同一来源核验根身份并持有句柄。没有携带快照的普通工具调用继续原采样路径。
- 空目标：无实际停止时复用发现快照；公共等待的空数组不当作完整系统表使用。清理只删除候选中已不存活、且文件当前值仍属于本次目标的登记。
- 验证：源码/差异复核和无系统操作语法检查；本轮不新增或运行测试、构建、全仓类型检查或真实服务停止。原耗时脚本继续供用户复测，期望常规路径两次全量查询且不再出现独立父身份采样管道。

## 公共接口与分工

- `PItem.CREATED`：可选 CIM UTC 原文；非 Windows/旧 provider 可缺省，显示查询不因此失败，实际受控目标缺少身份不得盲杀。
- `ProcessKillTreeStrict(roots, startupProofs?, processList?)`：兼容旧参数，模块提供首次列表时经异步本地上下文携带树根的创建身份；`ProcessKillServiceTreesStrict(pids, list)` 自动传递同一列表。
- `Base.stopWindowsServiceProcesses(pids, list)`：统一已确认目标的树停止 + 等待，返回停止后快照；没有目标返回输入列表。
- `Base.cleanupStoppedServicePidFiles(pids, finalList, files?)`：默认 appPidFile/pidPath，支持模块传入自己的文件路径；严格读当前值、缺席判断与删除前值复核，空文件保留。
- `Base.waitWindowsServiceExit`：只轮询原 PID，返回确认退出时的列表，其他阶段复用；不自行停止残留。
- `ServiceStop.stopWindowsServiceProcessesAfterNativeShutdown`：合并 MySQL/MariaDB 原生关闭后的确认与原树回退，只有严格查询成功但退出超时才回退；没有原生成功则直接停止原树。
- `ServiceProcessIdentity.stopRegisteredServiceProcesses`：项目和自定义服务共用登记根验证、后代收集、平台停止及结果确认，两个模块只转交参数和终态。

## 首次列表究竟增加了什么

`Process.win.ts` 的 `ProcessPidListStrict` 原先只把 CIM 的 PID、PPID、CommandLine、ExecutablePath 转成 `PItem`。现在在同一次 `Get-CimInstance Win32_Process` 的 `Select-Object` 中增加计算列 `Created`，由 `CreationDate.ToUniversalTime().ToString('o', InvariantCulture)` 生成 UTC 字符串，再原样保存到 `PItem.CREATED`。没有为每个进程再调用一次 CIM，也没有再开启 PowerShell。

首次快照现在同时提供三个用途：命令和模块配置证明实例归属；PID/PPID 收集树；CREATED 加 EXECUTABLE 绑定本次允许结束的树根。模块把同一列表传给 `ProcessKillServiceTreesStrict`，后者沿祖先关系将完整目标压缩成根，然后把根身份通过 `WindowsProcessSafety` 的 AsyncLocalStorage 传到 `WindowsPrivilegeOperation`。上下文只在当前异步调用内有效，复制身份记录并检查每个根的覆盖关系，不跨停止请求复用。

权限入口发现首次快照身份后，直接构造原有 action context，跳过独立 `process-stop.capture-identity` 管道。因此取消的是重复的授权前采样；实际执行端仍复查同 PID、同来源创建时间及映像路径。普通权限、已提升、UAC 和 Go Helper 继续消费相同动作身份，worker 不做单独的停止前身份采样。没有列表的工具 kill/killPorts 仍保留原 StartTime 采样及访问拒绝后的 CIM 恢复路径。

`StopProcessList` 的响应校验接受可选 CREATED，main 的桥接直接传列表，无字段投影丢失。旧 provider 或非 Windows 可以不返回该字段，但 Windows 服务发现阶段过滤缺少创建时间或 EXE 的根，不用晚采样的当前 PID 冒充原身份。绕过发现阶段直接调用严格执行器时，执行器仍拒绝缺少身份的目标。项目/自定义服务的启动证明使用同来源 CIM 时间与首次列表比较；macOS 继续沿用 lstart，不增加完整 EXE 路径要求。

UTC/invariant 时间不依赖中文 Windows 的日期显示格式。CIM/JSON/PowerShell 输出保持现有 UTF-8 通道，中文路径原样传递；创建时间与路径分别校验，不把路径当日期解析。已有 Windows Helper 32 支持 `source=cim`，本轮没有修改 Go，也没有增加 Helper RPC 参数或更新版本。

## 公共收尾如何复用

新 `src/shared/ServiceStop.ts` 归集树停止、结果等待、PID 文件清理和允许原生回退的编排。Base 的对应方法只是包装；非 Base 的 Runtime、隧道和项目可以调用同一共享实现，避免为了复用逻辑引入继承或另一套服务状态。

一般 Windows 停止的正常路径如下：

1. 模块严格查询完整列表一次，确认本实例根并收集根及全部后代。
2. 公共停止器压缩根，沿用首次创建身份，经普通权限尝试，必要时进入已选 Helper/UAC。执行端复查根，结束父树。
3. 公共等待器严格查询完整列表一次，确认第一步全部 PID 消失，返回这份新列表。只有原 PID 仍存在才以 200ms 间隔有界重查。
4. 模块在返回列表中做自己需要的实例残留检查；公共清理器用同一列表核对私有 PID 文件。两个用途均不再查询进程。
5. 文件当前值必须属于本次候选且 PID 在最终列表缺席；删除前再读取相同值。空文件、新实例值保留；仅 ENOENT 当作已经没有文件，其他读/删错误传播。

无目标时公共停止直接返回首次列表，不把空等待返回值误当全系统列表。正常有目标且首轮确认成功是两次全量 CIM；执行端按根读取身份属于必要复核，不计为全量查询。

## 各模块保留什么、合并什么

- Base：常规模块统一调用公共树停止/等待/清理；Unix 单信号停止也复用公共等待结果，减少随后的再次查询。
- PHP Windows：保留专用 ini、安装路径和 spawner 的归属筛选。有效父树与首次列表中由独立证据确认的孤立根合并为一个完整目标集合；孤立根的后代也随树纳入。所有目标仅调用一次公共停止。版本残留是最终列表内存筛选，文件清理进入公共入口。
- Redis：实例与 Redis Commander 的先后顺序保留；Redis 自身停止进入公共路径。
- N8N、Temporal UI、Neo4j、ClickHouse 服务与 CH-UI：保留实例参数、配置和伴随服务顺序，Windows 的执行、等待和文件收尾进入公共路径。Neo4j 仍在最终列表检查目录标记，不只依赖返回码。
- DbGate、Redis Commander、Cloudflare Tunnel、pgAdmin：保留模块私有目录、端口和归属规则，首次列表直接传入公共停止，复用返回快照清理。DbGate/Redis Commander 的自定义 kill 注入和 Unix 路径也使用公共等待，通过参数注入原查询通道及 100ms 间隔；删除两处重复轮询和退出后再次查询。Redis Commander 原来的 100 轮改为真实经过十秒的有界等待，避免每轮查询成本把期限累加到十秒之外（单次正在进行的查询仍受查询自身超时限制）。
- LanguageProject、ModuleCustomer：删除两处相同的登记根停止流程，转入 `stopRegisteredServiceProcesses`。根缺席或启动证明缺失/不匹配时过滤该候选，不凭历史 PPID 补选后代。系统身份查询异常仍传播。Unix TERM/INT 策略沿用原共享实现。
- MySQL/MariaDB：精确 defaults-file、配置端口、唯一监听者核对和带密码的原生命令仍在模块。原生后的等待/树回退共用公共方法，删除固定 1500ms 睡眠与回退前重复发现。执行器使用首次身份，不用新列表重建授权。MySQL group 的树停止及私有文件清理也复用公共接口。
- MongoDB：保留 mongosh 原生关闭、监听归属及不能自动强制回退的策略；缺少 mongosh 时按原策略进入公共树停止。原生等待的最终列表直接用于清理。
- PostgreSQL：保留 pg_ctl fast 有序关闭，失败不转强杀；原生等待返回最终列表，app PID 和 postmaster.pid 共享值核对清理。pgAdmin 单独按自身归属进入公共树停止。Unix 原生关闭与共享内存等待策略保留。

各模块自己的配置解析、协议、版本残留筛选和 companion 顺序有业务差异，仍归模块所有。公共实现不包含 PHP ini、MongoDB 端口或 PostgreSQL 数据目录字段。

## 复核到的边界与处理

- 原生关闭后的等待原先 catch 所有错误再强制回退，可能把查询失败当成“服务仍在”。新增 `ServiceProcessExitTimeoutError`，只允许严格查询确认的超时触发 MySQL/MariaDB 已有原树回收策略，查询失败直接终止。
- 停止前快照已经缺席的根不会在后续采样中重新纳入；启动证明先校验格式/请求范围，再随确实缺席的根收窄，不能借缺席绕过参数验证。
- 根在授权等待期间退出、但原 worker 仍在时，不凭历史 PPID 建立新归属；最终原 PID 检查会失败并保留登记。没有按 EXE 补选陌生实例，也没有补杀最终列表中的新 PID。
- 原 PID 短时间被新进程复用时，执行端创建身份检查阻止误杀；有首次快照的结果等待现按 PID/创建时间比较，明确不同创建时间的新占用者不算原服务残留。缺失时间证据时仍保守等待，不能据此补杀新进程。
- 多版本共享的 app PID 文件可能保存另一实例 PID。文件当前值不在本次候选或仍存活时保留；删除前重读缩小覆盖新登记的窗口，但普通文件读删并非原子事务，不宣称消除所有跨进程竞态。
- 原树未退出时公共等待失败，清理不能执行；PID 文件清理自身失败也不能发完整成功。取消/未知执行结果不重放。
- 正常树停止只需两次全量查询。残留轮询、数据库原生关闭等待、独立 companion 操作和工具无快照采样仍有自己的必要查询，不能承诺每种业务都固定两次。

## 本轮检查与复测口径

本轮检查实际字段链路、上下文隔离、根证明覆盖、原生回退边界以及模块收尾调用；仅进行源码语法和差异空白检查。没有新增或运行测试、构建、全仓类型检查或真实服务停止，不能把静态检查当成 Windows 实机结果。

检查结果：Node 直接使用 TypeScript 解析器读取上述 23 个 TypeScript 文件，语法诊断为零；只检查源码，没有导入执行服务代码。对新增共享文件及三份实现/耗时说明单独检查行尾空白，无错误；全工作区 `git diff --check` 退出码为 0。检查同时清除了此次收口后不再使用的命名导入。原有暂存、其他修改和 Helper 源码保持现状，没有构建二进制。

已有 `test:windows-service-stop-timing` 可继续用原两个 PHP 版本命令复测。正常应看到 `queryCount=2`，不再出现 `process-stop.capture-identity`；主要阶段改为 `php.stop.execute-and-confirm`、`service.stop.parent-trees`、`service.exit.poll` 和 `service.stop.remove-pid-file`。用户原报告中独立父采样约 2.0–2.7 秒，这部分管道启动已从快照路径取消，实际改善幅度以新报告为准。

## PHP 已停止却退出确认超时：历史 PPID 与 PID 复用

用户报错包含 `30596,14020,17016,27264,35244,12472,20000,4880,21128,35640`，但实际 PHP 已退出。授权日志显示请求的唯一父为 `30596`，CIM 创建时点为 `2026-10-03T08:30:40.9394990Z`，普通停止动作返回 completed。只读 Get-Process 查询这些 PID 时，只有 `27264` 仍存在，它是 `vctip`，创建于同日 16:24:18（UTC 08:24:18），早于 PHP 父。没有终止或修改该程序。

当前父子建树只比较 PID/PPID，Windows 历史 ParentProcessId 可能指向后来复用该号码的新父，因此把更早的独立进程混入了“PHP 全部后代”。Windows 的实际树停止结束了 PHP，错误目标仍存活，等待便超时；旧错误消息还将完整请求列成“仍在运行”，掩盖了实际残留者。完整首次列表尚未保存到该次报告，因此不能从现有日志还原每一级 PPID；更早创建的 vctip 不可能属于这个 PHP 父树是明确的时间证据。微软也明确说明 ParentProcessId 可能因 PID 复用而指向错误父，建议用 CreationDate 比较创建先后：[Win32_Process 文档](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-process#properties)。

处理集中在公共快照与退出确认：

- 新 `ProcessSnapshot.ts` 提供同来源时间比较、父子关系判断和统一遍历。真实子不能早于父创建；首次列表里时间更早的假子及由该假边引入的后代不加入目标。只使用已有时间字段，无额外查询，不增加 worker 的路径/授权检查。缺失 CREATED 的 Unix/旧查询保留原语义。
- `Process.ts` 的精确树、PID 集合及旧列表入口，`Process.win.ts` 的单/多 PID 建树统一调用该遍历。旧缺席根查询的兼容行为保留，但它不构成停止授权。树根压缩也使用同一有效父子关系，避免独立根被历史 PPID 误合并。
- 公共 `waitForServiceProcessExit` 接受可选首次列表：当前同 PID 且同创建时点才是原进程；明确不同创建时间的新占用者不会让原服务停不下来。字段缺失或不可比仍保守等待，查询失败继续传播。正常路径仍是停止前、停止后两次全量查询。
- Windows 公共树停止、MySQL/MariaDB 原生收尾、MongoDB/PostgreSQL 原生等待以及 Runtime 注入查询路径传递已有首次列表，不为本修复重新采样。模块自身的新实例残留规则继续保留。
- 超时错误消息只列最后真正仍对应原进程的 PID，并在 `[ServiceStop][exit-timeout]` 记录完整请求及实际残留的首次/当前创建时间，不记录命令行。停止成功不能代替真实退出确认；同身份的 worker 仍存在时继续报错。

操作所有者、重入、IPC 与终态契约沿本文首节，没有添加第二套停止体系或 renderer 状态。Go Helper 的接口和执行器继续只接收公共层确认的根并执行树停止，本修复发生在首次列表建树和共享收尾，没有修改 Go 或构建二进制，版本保持 32。本轮只做源码检查；本机 CIM 查询被运行环境拒绝，未执行实际 PHP 停止或新增/运行测试，不能将以上静态修复称为实机复测通过。

本修复检查结果：10 个关联 TypeScript 文件的源码语法诊断为零，没有发现未使用的命名导入；新增快照文件及说明文档的行尾空白检查通过，`git diff --check` 退出码为 0。这些检查不执行服务代码，不覆盖实际 Windows 树停止或 CIM 返回的现场数据。

用户随后实机 apply 复测两个 PHP 版本，报告 `cc574ab8-c54c-4652-8488-5af34c74462e` 整批为 ok：每实例均两次全量查询、一个根停止动作、首次退出确认即通过；后端分别 5.412/6.228 秒，串行合计 11.640 秒（此前同命令报告为 15.173 秒）。这验证了本次正常服务停止路径，没有受控重现全部历史 PPID 现场，也未覆盖 Helper/UAC/main 退出；完整阶段对比见耗时文档最后一节。

## 候选过滤补充

用户随后要求不可读/不匹配的候选只能逐项过滤，不能提前 throw 阻断整次停止。PHP 预检循环已删除，Base、各数据库分组和伴随服务中的同类发现逻辑一并调整；公共 `isReadableServiceStopRoot` 统一根证据筛选。执行后的错误、退出超时与严格查询失败仍传播，活的被过滤候选不因空目标删除私有 PID 文件。此规则覆盖此前“发现阶段登记根不可读即整体失败”的说明。

完整修改位置、处理理由、操作契约和边界见 [服务停止候选过滤](service-stop-candidate-filtering.md)。本补充只做源码检查，没有执行实机停止或新增/运行测试，不能沿用上一节的实机报告作为本次修复的验收结果。
