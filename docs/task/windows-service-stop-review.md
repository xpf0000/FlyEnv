# 服务停止链路 review（2026-10-02）

## 范围和结论

本轮检查当前工作区的 fork 模块停止、FlyEnv 正常退出、UI/MCP 调用与登记、Windows 普通/UAC/Helper 分流，以及 Go RPC 和实际 kill 执行。仅做源代码静态 review，没有修改业务代码，没有新增或运行测试、构建，也没有停止真实服务。

**后续状态**：本文下方保留 review 时的发现和位置，行号不是修复后定位。用户已授权处理其他问题；2026-10-02 的源码修复状态见文末及 [实施文档第二十三轮](windows-privilege-choice-implementation.md)。源码修改不代表已经实机验收。

入口统一已经接通：main 退出逐登记实例调用模块 stopService，模块拥有实际进程/面板停止；Go 树模式接收签名父身份。**入口统一不表示所有目标发现、并发和失败终态已经正确。** 本轮确认下列 12 项问题，建议优先修复 P1。

优先级：P1 为可能误停其他进程、遗留服务或丢失停止登记的问题；P2 为特定权限/失败/重试条件下的功能缺口。条件和推演来自代码，不宣称已实机复现。

## R01 / P1：通用目标发现扩大到了同 EXE 的所有实例

后续处理（第二十二、二十三轮）：按用户要求移除 `windowsServiceTargets` 中实际 EXE 路径相等的全列表扫描，保留 PID 与服务名加命令行标记两条来源。用户进一步明确：完全复用 FlyEnv 数据目录及内部启动命令的手动实例也按 FlyEnv 服务处理；保留第二条来源属于选定策略，不继续作为待修问题。PostgreSQL 的数据目录前缀误匹配另已改成完整 `-D` 参数比较。下面保留原 review 的推演。

位置：`src/fork/module/Base/index.ts:148`、`:175`；`src/shared/Process.ts:174`、`:195`。

- windowsServiceTargets 最后遍历完整列表，将实际 EXECUTABLE 等于 version.bin 的所有进程及其后代加入目标，不要求属于登记 PID、模块专用配置或实例目录。
- 前面的 PID 归属检查也仅要求命令行包含任一 bin/path/config 子串，没有要求该父的程序类别正确、参数边界准确。同目录内的其他程序带有这个路径参数，也可能被错误地信任为根。
- 因此同一个 Redis/nginx 等程序由另一个工具启动、使用另一份配置时，停止 FlyEnv 实例会同时结束它。Windows 根创建时间检查会确认“被误选中的同一个进程”，不能纠正目标选择错误。

建议：优先使用启动时登记的父身份和模块专用实例标记；相同 EXE 只能作为归属证据之一，不能作为扫描全部实例的独立授权。孤立根回收由模块提供配置/端口/目录证据，正常已确认父的子孙仍直接随树处理。

关联边界：PostgreSQL `COMMAND.includes(dbPath)`（`Postgresql/index.ts:612`）也未比较完整目录参数，db 与 db2 的前缀可能同时进入待确认集合，导致当前实例已退出而另一目录仍在时错误报告超时。该原生分支不会直接强停另一数据库，但目标集合仍需精确。

## R02 / P1：PHP 等模块可能把归属信息不可读当作已停止

位置：`src/fork/module/Php.win/index.ts:211`、`:228`、`:252`；`ClickHouse/index.ts:336`；`DbGate/index.ts:473`。

- PHP 先匹配 COMMAND 中的专用 ini，再检查 EXE 是否可读。如果 CIM 返回空 COMMAND，marker 不匹配会直接返回 false；两个字段都空的 spawner 还会在 parentsOnly 分支提前排除。不是每一个“活着但不可读的 PID”都会触发 Cannot verify。
- PHP _stopServer 不用 version.pid 对这些不可读候选做补充核验；目标为空时跳过残留查询，仍返回成功。main 随后注销当前请求/退出实例，PHP 可以实际仍运行。
- ClickHouse 的归属清单为空会进入 staleBinSet 并清理登记；DbGate 已有根但 COMMAND 不可读同样返回空清单。这些位置也不能区分“原实例已退出”与“当前权限读不到”。

建议：对登记 PID/私有 PID 文件指向的活进程先区分不存在、明确陌生身份和归属不可读；不可读不能成功清记录，应保留失败或进入受控的提升归属查询。继续保留用户要求的父确认后信任子孙，不为正常 worker 新增停止前逐个身份核验。

## R03 / P1：DbGate 可能错误确认退出，停止失败也会删除 PID/端口文件

位置：`src/fork/module/DbGate/index.ts:531`、`:661`、`:669`；调用方 `Mongodb/index.ts:152`。

这里存在两种失败终态问题：

- waitForStopped 把进程查询异常转换为 []，立即认定全部退出；20 次查询后进程仍存在也只是结束循环，不抛超时错误。因此 await 返回不能证明面板及其子孙已退出，模块可能直接报告成功。
- DbGate.stop 在 killProcesses 抛错后，finally 仍删除私有 pid 和 port 文件。MongoDB 模块这次会返回失败，但重试 DbGate.stop 时读不到 PID，得到空目标后成功返回。独立 DbGate 的退出参数虽然保存了面板 PID，dbGateOnly 分支没有把该 PID 交给 runtime 恢复目标。

可发生序列：面板仍运行 → UAC 取消或 kill 失败 → 文件被删 → 重试只看到空文件 → 模块报告成功并注销面板，但面板仍在。

建议：查询错误必须传播，等待结束仍有残留必须报超时；成功确认退出后才删除文件，失败保留归属证据。必要时根据面板私有路径或明确保存的 PID 做受校验的残留发现。Redis Commander 的 stopOwned 当前是在严格停止成功后清文件，没有相同的 finally 问题。

## R04 / P1：退出没有封闭启动入口，登记快照可能漏服务

位置：`src/main/core/ServiceProcess.ts:190`；`src/main/Application.ts:1142`、`:1191`；`src/main/core/ForkManager.ts:141`。

stopInstances 只在开始时复制一次 servicePID。Application 开始退出会关闭首次权限选择，但 ForkManager/IPC 没有拒绝新生命周期启动，也没有等待已发出的 startService 或面板打开任务完成并登记。最终直接 destroy fork。

可发生序列：启动请求尚未返回 PID → 退出复制登记（没有该实例）→ 外部服务已经启动 → 后续启动成功登记 → 退出不再读取清单 → fork 被销毁，外部进程遗留。已登记 A 被新 PID B 替换时，旧快照会跳过 A，而 B 也不在快照内。

建议：main 生命周期调度在退出时拒绝新启动/打开请求，妥善结算已受理操作，再获取最终停止清单。重复退出 Promise 只解决重复退出，不能替代启动/停止并发协调。不要靠进程名补杀未登记进程。

## R05 / P1：停止响应按当前登记重新找 PID，可能注销新实例

位置：`src/main/core/IPCHandler.ts:242`；`MCPTools.ts:589`；`Application.ts:306`；`ServiceProcess.ts:176`。

UI 停止响应到达时，IPCHandler 再调用 stopArgsFor(module, 原请求对象) 取当前 PID。若原请求对象只有 bin，或者旧 PID 已经不在，方法会按 bin 返回后来登记的新实例。MCP 单实例停止和部分 main 停止入口则直接 delByBin。

可发生序列：停止 A 请求已发出 → 同 bin 的 B 启动并登记 → A 成功响应返回 → 回调按当前 bin 找到 B / 删除整个 bin → B 仍活着但失去登记，之后退出会漏停。

ForkManager 的通用池会把请求分发到空闲 worker，没有应用级同实例生命周期串行队列；renderer 的单页/单例重入限制也不能覆盖 MCP 与退出调用。

建议：在派发时绑定不可变的运行实例标识/PID/登记代次，响应只注销那一代及实际停止 PID；不在终态重新解析目标。协调同实例 UI/MCP/退出生命周期请求，避免重叠启动/停止。

## R06 / P1：MySQL/MariaDB 关闭仍拼接未转义密码到 shell 命令

位置：`src/fork/module/Mysql/index.ts:187`、`:190`；`Mariadb/index.ts:487`、`:492`；`src/shared/child-process.ts:11`。

命令文本使用 `-p${password}`，交给 promisify(child_process.exec)。密码带空格、&、引号或 % 等字符时会参与 shell 解析，不再是单个 mysqladmin 参数；可能导致错误认证/执行其他命令，并触发现有数据库强停回退。程序和配置路径的双引号并不能保护这个密码参数。

这是仍存在的旧实现问题，本轮统一入口没有消除它。

建议：绝对程序路径 + execFile/spawn 参数数组 + shell=false；密码完整作为一个参数传递，不拼成 shell 文本，也不将完整含密码命令写日志。

## R07 / P1：MySQL/MariaDB 原生 shutdown 未核对端口所属实例

位置：`Mysql/index.ts:171`、`:187`；`Mariadb/index.ts:473`、`:487`；对照 MongoDB `Mongodb/index.ts:180`。

模块先确认目标进程，随后从当前配置读取端口（解析失败退为 3306），直接向 127.0.0.1 发送 shutdown。没有确认这个端口的监听者就是刚选定的实例。

可发生条件：运行期间修改端口配置，或配置读取/解析失败，而那个端口另有数据库使用相同 root 凭据。原生命令会关闭另一实例。随后检查当前选中的 PID仍活着，只会报告本次停止失败，无法撤销另一数据库已经被关闭的副作用。

建议：原生关闭前核对实际监听者与本次已授权目标。不能在读取失败时用默认端口执行有副作用操作；无法确认时明确失败，或按模块既定策略处理已确认的本实例。

## R08 / P1：Go 旧 PID/端口停止没有执行前身份复核

位置：`src/fork/Helper.ts:249`；`src/helper-go/module/tool.go:664`、`:688`、`:724`、`:805`。

TypeScript 已在授权前保存进程创建时间，但只对 tree=true 的 kill 把身份作为第四参数送入 Helper。旧两参数 kill 和 killPorts 没有传送这份快照。

- Go 旧 kill 只校验 signal/PID，直接固定路径 taskkill /F /PID；没有树分支的创建时间与系统进程保护复核。
- Go killPorts 重新查询当时的端口占用者并直接结束，没有核对它与用户请求之前的实例一致。
- PHP 孤立 worker 仍走 ProcessKillStrict（旧 PID 分支），此外进程工具使用该分支。等待安装/授权/排队期间 PID或端口更换，Helper 的实际目标可能与授权前不同。

RPC 的 HMAC、nonce、客户端 SID/PID/EXE 绑定仍存在；这些认证请求来源，不能替代停止目标身份核验。

建议：兼容普通 PID 请求也传递并复核原目标身份；端口请求执行时仅允许停止快照中的同一进程，不自动升级为结束新占用者。此处不要求正常父树子孙逐个校验。若后续修改 Go，须按既有要求递增 HelperVersion 并重建产物。

## R09 / P2：授权前读取父身份失败无法进入 UAC/Helper

位置：`src/shared/WindowsPrivilegeOperation.ts:91`、`:179`、`:206`。

只读 runWindowsAction 获取 StartTime/保护信息位于普通动作 try/catch 之前。若活父的查询发生访问拒绝，错误会直接退出 executeWindowsPrivilegeOperation，后面的 resolveWindowsPrivilege/Helper 回调都不会执行。

因此“当前权限不足就切换认证方式”并没有覆盖停止前身份读取。fork 层的归属不可读限制还可能更早阻断请求。并不是每个管理员进程都会拒绝查询；问题特指当前令牌/企业策略确实不允许读取该父的情况。

建议：保留启动时可信身份，让提升查询也只能核对同一已登记实例；将可识别的读取权限不足纳入受控授权路径。不能简单删掉身份保护或在提升后无条件相信同一个 PID 数字。

## R10 / P2：项目、自定义服务和隧道缺少子孙退出确认

位置：`LanguageProject/index.ts:63`；`ModuleCustomer/index.ts:60`；`CloudflareTunnel/CloudflareTunnel.ts:290`；`src/helper-go/utils/process_tree_windows.go:118`。

这些模块 await 树执行器后直接清状态/返回成功，没有像 Base/PHP 那样重新检查原先收集的子孙是否退出。Go 树分支的末次等待只确认父句柄；PowerShell 树分支亦只等待父。

可发生序列：模块初查时父子都在 → 父在身份采样/授权等待期间自行退出 → 执行器幂等跳过不存在的父 → 返回成功 → 项目注销整份旧 PID 列表，但子进程仍可能运行。父在模块最初查询前就缺失的情况已有拒绝处理，未覆盖中途缺失。

建议：模块保存已确认树的 PID清单，执行后做新鲜结果确认。确认子孙是否消失与逐个停止前身份授权是不同职责；保留父确认后信任子孙的执行方式。

## R11 / P2：启动后父命令采样失败会留下无法正常重试停止的项目

位置：`LanguageProject/index.ts:25`、`:51`；`ModuleCustomer/index.ts:24`、`:48`。

serviceStopArgs 的采样异常被转换为空字符串，启动仍成功并把空凭据固定保存在 main。停止活父时 expectedCommand 为空必定失败。后续点击停止会继续恢复同一份空参数，没有重新采样/恢复可信身份的路径，暂时查询故障因此变成当前实例整个生命周期的停止故障。

建议：在 fork 启动时从实际创建的父进程保存可信身份，或提供受校验的身份恢复路径；查询失败应有可重试的身份状态，不要把空字符串伪装成完整的成功停止契约。恢复时必须避免把复用 PID 的新进程纳入信任。

## R12 / P2：MCP 单实例版本切换吞掉旧版本停止失败

位置：`src/main/core/MCPTools.ts:526`、`:539`、`:543`、`:548`。

startService 对单实例模块逐个停止其他版本，但 catch 只记录错误，之后仍启动新版本并可能报告成功。旧版本停止被取消/拒绝或 companion 失败时，切换并未完成；后续 Base 启动前清理只针对新版本，不能保证旧版本被补停。

建议：旧版本停止未成功应终止版本切换并返回具体失败，不改变 current；可以继续收集其他旧实例的失败，但不能默默进入新版本启动。

## 已核对且未发现同类接线问题的部分

- ServiceProcess 正常退出已逐实例请求 stopService，检查 code=0；某项失败不删除整模块，也不阻断其他登记实例。
- ForkItem 对 code=0/1 都 resolve，MCP callFork 和退出编排均有明确 code 检查，没有仅因 await 返回就认定成功。
- BaseManager 提供停止参数，ForkManager 恢复实际运行参数；PostgreSQL DATA_DIR、Neo4j 实例目录、项目/自定义 PID 签名没有再被 main 猜测。上述并发问题仍需解决。
- 正常 PHP spawner 对应子孙直接随父树处理，未重新增加逐 worker 的创建时间预检。孤立 worker 另按模块证据处理，属于独立目标。
- MongoDB 已停止在退出阶段下载 mongosh，使用 admin shutdown 并核对当前端口；PostgreSQL Windows 分支使用当前 DATA_DIR、实际 postgres.exe/postmaster.pid、绝对路径 pg_ctl 和退出确认；关闭失败会向上传播。认证/TLS/非 loopback 等配置仍可能按当前策略导致明确失败，没有声称自动支持这些配置。
- Go 树 RPC 形状、身份数组反序列化、根 PID 去重、UTC 完整时间匹配、受保护父名、原生句柄、固定系统 taskkill 路径、隐藏窗口、执行超时和错误传播均已检查。没有发现正常请求被拆成逐 worker Go 身份检查的接线错误。
- Go 请求在执行分派前有客户端身份、签名和请求防重放校验。树模式与旧模式目标保护不一致见 R08。
- DNS/ftp-srv 经专用 fork 路由关闭本模块 server/socket，await 成功后返回宿主 PID用于注销，未把 Electron worker 当作服务树 kill 根；成功 start/stop 才 pin/unpin。
- Redis Commander 对停止异常保留文件、拥有 stop flight；pgAdmin 严格执行和结果确认后清理，未发现 DbGate 的 finally 删身份问题。但 worker-local flight 不能替代 main 的全应用生命周期协调。

## 其他平台及验证限制

本轮主链路以 Windows 为重点，未把 Unix“尽力停止”当作严格成功语义。Unix PostgreSQL 的原生异常和等待超时仍有吞错/继续成功逻辑（`Postgresql/index.ts:552`、`:563`）；Go Unix 旧 Kill 执行错误仅打印仍返回 true（`tool.go:701`）。这些是现存跨平台差异，后续若宣称全平台严格停止也需要处理。

main 退出当前记录错误后继续退出是现有策略。保留内存登记并不能阻止应用退出，也不提供跨重启重试。本轮没有据此建议默认强停数据库或新增权限确认框。

本次没有修改 Go；Helper 源码版本仍为 29，未重建二进制。以上结论为静态代码 review，尚未进行 Windows 普通用户/管理员/UAC/新版 Helper 的实际回归，也未运行自动测试或类型检查。

建议处理顺序：先缩小父归属、保留失败身份及绑定不可变停止实例；封闭退出并发；修复数据库 shell/端口目标和 Go 旧分支身份；最后补提升查询、项目结果确认与 MCP 切换失败语义。

## 第二十三轮处理状态（源码，2026-10-02）

| 项目 | 处理 |
| --- | --- |
| R01 | EXE 扫描已移除；保留第二条来源遵循用户明确的归属策略。PostgreSQL 精确比较数据目录参数，避免 db/db2 前缀混淆 |
| R02 | Base/PHP/ClickHouse/DbGate 对候选活父的归属不可读报错；不能当成空目标成功。正常已确认父的 worker 不新增逐个身份预检 |
| R03 | DbGate 严格查询、超时抛错、成功确认后清文件；协调 open/stop，支持独立面板登记 PID，去掉不健康启动后的裸 PID 兜底 kill |
| R04 | main 关闭生命周期入口，等待已受理请求及登记完成，再做退出停止；权限选择先取消，已知认证方式仍供退出使用 |
| R05 | stop 派发时冻结参数和登记代次；终态仅注销原代次。UI、MCP、插件、退出使用相同规则 |
| R06 | MySQL/MariaDB 原生关闭使用绝对 EXE 和 execFile 参数数组；密码不参与 shell 解析，诊断不打印含密码的执行对象 |
| R07 | 禁止配置失败时猜 3306；原生关闭先核对监听者，无法核对则按模块既有策略处理已确认进程。MongoDB 亦要求全部监听者属于目标 |
| R08 | Go 普通 PID/端口/树停止均接收并复核身份；新端口占用者拒绝，系统父保护统一。Helper 源码版本升到 30 |
| R09 | 原生 StartTime 权限不足可用普通 CIM 创建时间与程序路径固定身份，再供 UAC/Helper 重查；两种读取都失败则安全拒绝 |
| R10 | 项目、自定义服务、隧道补充执行后确认；父已退出但原子孙残留不能成功清状态 |
| R11 | 项目/自定义服务使用创建时间，不固定空 COMMAND；启动采样有限重试，移除终端历史 PID 文件。持续无法取到创建时间时保留未验证登记并拒绝自动结束活父，不能仅凭启动时间窗口补认 PID |
| R12 | MCP 旧版本停止失败终止切换，保留登记，不启动新版本、不改 current |

额外核对修复：Unix PostgreSQL 停止及等待失败传播、Go Unix kill 错误传播、Unix 项目/自定义服务严格信号和结果确认、隧道 Unix 失败保留状态、插件运行时 smoke 启停纳入同一生命周期登记与退出等待。

**限制**：以上仅做源码与接口核对，未运行测试、类型检查、构建或真实停止。Helper 30 的二进制尚未构建；创建时间采样不是持有原始启动句柄的原子证明，Unix ps 精度为秒；极端 PID 复用和身份查询完全受限仍须实机验证。退出仍按现有策略记录单项错误后继续退出，内存登记不持久化到下次启动。

## 再次整理与查漏补缺（2026-10-03，源码）

当前完整逻辑、逐文件原因和限制集中于 [独立服务停止实施文档](windows-service-stop-implementation.md)，本 review 上文保留原始发现及历史版本，不用历史状态替代当前实现。

本轮复查并修正：

- 非驻留 -1 的错误登记；插件清理遗漏独立 companion；普通/自定义重复 stop 在 pending 时因 run=false 提前成功；项目 start 重入与编辑/重启的前置停止失败。
- 项目/自定义服务从启动身份校验到权限层快照之间丢失原证明；原生 StartTime 与 CIM 微秒时间混比。现在授权前仍核对原 CIM 创建身份，执行前沿同来源复核。
- 旧 PID 删除失败被吞、PID 文件短暂为空漏登记、Windows 包装进程内层裸 PowerShell 依赖 PATH。
- Unix Base/PHP 不等待原清单退出、信号错误处理；共享树环保护、精确端口 PID 查询，ps/lsof/TCP 查询失败与畸形输出伪装空列表。
- Windows 端口工具复用监听者身份快照和执行前校验；Neo4j 完整目录参数/大小写/段边界，停止同时确认原 PID 与当前目录标记，文件清理不删覆盖的新值。

本轮新 Go 行为（查询失败传播、畸形输出拒绝）要求版本升级，当前 Go/TS HelperVersion 为 **31**，二进制未构建。已补详细注释，没有新增/运行测试、类型检查、构建、格式化或真实停止。原来的退出失败仍继续退出、身份完全不可读安全拒绝、Unix 秒精度、极端 PID 复用等限制仍存在；实机场景见独立文档第 10 节。

后续独立实施审核已按用户授权修复，当前源码 HelperVersion 为 **32**，尚无新二进制；本段 31 为历史记录。新的逐项回执见 [实施审核第 7 节](windows-service-stop-implementation-review.md)，当前完整链路与边界见 [实施文档第 11 节](windows-service-stop-implementation.md)。
