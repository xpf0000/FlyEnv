# FlyEnv 服务停止：完整链路、改动原因与复查记录

> 退出清理顺序更新（2026-10-04）：Application 完成既有请求 drain 后，将 HTTP/MCP
> 关闭、服务停止和 hosts 清理并行，整组结算后回收 fork 和权限资源。详见
> [退出清理并行调整](application-quit-parallel-cleanup.md)；模块服务停止策略未改。

> 2026-10-04 当前实现更新：ProcessKillStrict 已成为统一执行入口，普通 Windows 直接一次多 PID taskkill；批次快照不再依赖 TTL；退出强制停止跳过全量确认，数据库保留确认；Go/TS HelperVersion 为 35。与本文旧章节冲突时，以 [统一执行与批次快照](windows-service-stop-unified-execution.md) 为准。

更新时间：2026-10-03（独立审核源码修复）。本文是服务停止优化的独立实施文档，描述当前源码；[权限实施文档](windows-privilege-choice-implementation.md) 保留历次历史，[原 review](windows-service-stop-review.md) 保留问题推演，[独立审核](windows-service-stop-implementation-review.md) 记录本轮修复依据，[执行计划](windows-service-stop-fixes-plan.md) 记录操作契约。第 11 节补充审核修复后的行为；与此前描述冲突时以该节为准。

本文的“已修正”指源码修改和静态核对。没有新增/运行测试、类型检查、构建、格式化工具或真实服务停止，不能把之前其他轮次的测试结果用于证明本轮实现。

## 1. 当前约定与职责

### 1.1 目标范围

- 通用 Windows 停止只保留两条来源：实际运行登记/模块私有 PID 文件，以及服务名加 FlyEnv 命令行归属标记。删除按实际 EXE 等于 version.bin 扫描全部实例的第三条来源。
- 用户明确：完全复用 FlyEnv 数据目录和内部启动命令的手动实例，也视为 FlyEnv 管理的服务；不继续收紧第二条来源。
- 根进程必须有效且属于目标服务。确认根后信任正常子孙，调用父进程树停止；不为 PHP 的正常 worker 增加逐个创建时间/EXE 预检。
- 执行后的“确认子孙是否消失”与执行前“对子孙逐个归属授权”不同。原树还有残留、查询失败或等待超时就不能返回成功。
- 活候选归属不可读不等于进程不存在。不会因为查询失败得到空列表就删除 PID/文件/运行登记；明确父已退出但仍有未被模块独立证据覆盖的后代时也拒绝空成功。

### 1.2 所有者

- renderer 的既有 ModuleInstalledItem、项目对象、自定义模块对象、隧道单例负责请求状态、进度、重入与通知；页面按钮不是进程存活的事实来源。
- main 的 ServiceProcess 拥有实际运行登记和模块生命周期队列；Application 拥有退出顺序；ForkManager 拥有 worker 路由、请求跟踪及原始发送边界。
- fork 模块拥有进程归属、原生关闭策略、子孙清单、PID/端口文件以及 companion。模块决定怎么停止，main 不根据当前页面设置重新猜参数。
- Windows 共享权限层负责普通/管理员/UAC/Helper 分流及授权前身份，Go Helper 负责签名 RPC 和执行前复核。Go 是执行后端，不是另一套模块服务停止编排。

没有新增模块、Pinia store、模块持久化配置或第二套 renderer 停止入口。项目/自定义服务的创建身份只随当前运行登记保存，不写共享配置。

## 2. 启动如何建立以后可停止的实例

只有成功终态 `code=0` 建立运行登记，中间 `code=200` 只是进度。

fork 返回实际 `APP-Service-Start-PID`，可以附带 `APP-Service-Start-Item`、`APP-Service-Stop-Args` 和 `APP-Service-Stop-Companion`。BaseManager 优先保留模块已经给出的停止参数；常规 Base 模块默认版本对象加实际 PID。PostgreSQL DATA_DIR、Neo4j 实例目录、项目/自定义 PID 签名由具体模块提供，不能用日后修改的配置替换。

独立打开的面板也登记，但标为 companion：运行状态展示过滤 companion，退出、MCP stop_all 和插件停用仍必须遍历完整登记。数据库的真实 PID 不能被面板 Node/Python PID 覆盖。

ServiceProcess.addPid 只接收正安全整数 PID。一次性自定义命令返回 `-1` 表示没有常驻服务，不生成停止契约、不登记为运行实例。DNS/FTP 使用其真实 fork 宿主 PID 表示模块内 server/socket 生命周期，停止时不会 OS kill 宿主。

每次登记生成递增的 generation，深拷贝实例和停止参数。常规服务沿用既有 bin 实例规则；PID 签名的项目/自定义服务可共享语言程序，不能因相同 bin 合并成一个项目；companion 与真实服务分开登记。

### 2.1 项目与自定义服务的创建身份

ServiceProcessIdentity 保存实际根 PID、启动请求开始时间、终态前冻结的注册时间上界及创建时间原文。Windows 用精确 PID 的 CIM CreationDate UTC；Unix 用固定 `/bin/ps -p PID -o lstart=`，LC_ALL/LANG=C。停止比较同来源创建时间，不要求 macOS 显示完整二进制路径，也不要求进程标题/COMMAND 永远不变。

启动采样最多三次，重试不扩大时间范围。始终无法取得创建时间时，保留实际 PID 和未验证身份供状态/诊断使用，但自动停止活父明确失败；不能停止时用“创建于启动窗口”补认当前 PID。启动时间窗口只能辅助拒绝旧 PID，不能单独证明原实例。

终端启动先移除历史 PID 文件；直接启动的旧文件删除失败也在创建进程前失败，不吞错后复用旧 PID。Fn.waitPidFile 对文件刚创建但暂时为空的情况在原预算内重试，避免实际服务已启动却未登记。错误日志不是 PID，两个调用点明确禁用空内容重试，避免每次启动额外等三秒；读取失败不反复申请权限。

Windows 项目终端以及项目/自定义包装进程的外层与 Start-Process 使用同一个已验证系统 PowerShell 绝对路径，不依赖 PATH 或同步环境里的 powershell.exe 名字。

## 3. 界面与 MCP 如何停止

正常链路：renderer 生命周期对象 → IPCHandler → ServiceProcess 模块队列 → ForkManager → fork BaseManager → 模块 stopService → 模块 _stopServer/专用 runtime → 成功/失败终态 → main 登记消费 → renderer 状态消费。

renderer 请求等待真正终态，不在 `code=200` 时解除监听、清 PID 或提示成功。失败保留运行 PID并结束 loading，成功才清运行状态。项目启动/停止、普通服务、自定义服务和隧道按所属对象协调重复调用，不能把“第二次调用时已经处于 stopping”解释为第一次停止成功。

main 按实例范围/模块屏障受理 start/stop/open 等生命周期请求：PHP 多版本可并行，同安装按序；独占启动和无目标的模块操作仍是屏障。Temporal startUiServer 也属于启动；兼容旧分组命令，同时现有分组 UI 改走 startService/stopService。在请求真正派发时捕获 stopSnapshot，而非点击按钮时提前冻结：同实例前面的启动必须先登记，后面的停止才知道实际实例。最新并发规则见第 11.13 节。

stopSnapshot 包含深拷贝的停止参数、根 PID/代次和当时的相关登记代次。带明确 PID 的请求只查这个 PID，找不到时不会按 bin 改为另一个新实例。ForkManager 不再根据稍后的当前登记全局重写 stop 参数，也不把旧 UI 参数拼到模块实际签名后。

成功回包只清派发快照中的匹配代次；fork 返回的停止 PID、启动清理返回的旧 PID/stale bin 都与原快照相交。原父已经自然退出也可以注销请求的旧根代次；后来使用相同 PID/bin 的新登记不会被旧终态删除。失败不做成功注销。

MCP start、stop、stop_all、restart 共用此队列。内部重启/版本切换调用内部方法，避免自己再排队等待自己。单实例服务先停旧版本；旧停止失败立即中断切换，不启动新版本、不修改 current。stop_all 遍历完整登记，包含 companion，逐项返回 stopped/failed，不把部分失败描述为全部成功。

## 4. FlyEnv 正常退出的顺序

1. Application.stop 共享退出 Promise，菜单退出、app.quit、relaunch 沿用相同资源清理。
2. 标记窗口退出，WindowsPrivilegeCoordinator.beginShutdown 取消首次方式选择；已选方式及已有执行租约保留，直到服务与 hosts 清理结束。尚未选择方式不能在退出时再等待无限首次弹窗。
3. 同步关闭 ServiceProcess 与 ForkManager 的新生命周期入口，拒绝新的 start/stop/open；已受理操作持有临时异步上下文许可可以结算，退出自有停止持有 shutdown 许可。任务完成撤销许可，遗留计时器不能永久绕过入口关闭。
4. 等待已受理完整消费操作和所有原始 fork 请求，包含非生命周期 hosts/配置写入。必须等启动 PID/停止参数已经登记，而不只是“fork 发回了结果”。每层 drain 给三十秒结算窗口；超时撤销已受理上下文、退休仍有请求的真实 worker、结算失败并记录 unknown，阻止迟到回包登记/发送，再处理已登记实例。
5. ServerManager.stopServer 调用 ServiceProcess.stop；Application 不再重复遍历一次。取得最终登记快照，逐实例调用同一个 fork stopService，明确检查 code=0。
6. 成功只清原代次；父停止已回收并注销 companion 时，后续条目跳过。某个实例失败保留其登记、记录错误并继续其他实例，不删整模块、不默认强停数据库。
7. 关闭 fork 与其他资源，按现有顺序清理 FlyEnv hosts 区块，最后 dispose 权限协调器。若权限组件提前 dispose，后续 UAC hosts 清理将无法获得租约。

用户服务请求（含排队）与每个 fork 服务请求最多六分钟；退出逐实例停止由 fork 请求上限兜底，某项超时不阻止后续条目。已受理请求完全不返回、外部程序不结束、权限被拒绝时仍可能清理失败。超时不会原子取消 OS 子进程或系统写入：没有终态/PID 的启动可能已经产生脱离 worker 的进程，写入可能部分完成，明确作为 unknown，不承诺已回滚或已清理。现有退出策略记录单项错误后继续退出；保留内存登记不等于阻止退出，也不提供跨重启恢复。

插件停用/卸载也通过原登记停止，包括 companion。状态展示接口会过滤 companion，不能作为清理清单。插件 runtime smoke 的生产入口将启停与登记放在一个受理操作内，停止失败仍留给正常退出遍历；本轮没有运行 smoke。

## 5. fork 目标、结果与模块策略

### 5.1 通用 Base

Windows 先用登记 PID/模块 PID 文件取得候选，再用服务名加 FlyEnv marker 恢复候选，按模块证据确认父并收集原子孙。候选父 COMMAND 不可读时报错，不以 EXE 相同补认归属；明确运行登记仍活着却未通过归属规则时也必须失败，不能空成功注销。模块可传额外的根 predicate，以 AND 限制实例配置，而非继续扩大 OR markers。子孙收集和根压缩使用同一份列表，不重复查出两个不一致时点的树。

ProcessKillServiceTreesStrict 把原清单压成没有更高祖先的根；正常 Windows 服务调用 ProcessKillTreeStrict，系统结束根与后代。单 PID 进程工具仍只结束指定 PID，不能无意扩大为树；PHP 孤立 worker 是模块另外确认的独立目标。

停止后用新鲜本地列表确认原 PID 全部消失，不能用 350ms 的 main 共享缓存作最终结果。PID 文件清理比对文件当前内容，不直接删除被其他实例覆盖的文件。读取/执行/等待失败不发送停止成功。

StopProcessList 的 main provider 用于跨 fork 合并查询；provider 失败可以回退本地，回退亦失败则传播，不能变成空列表。明确需要当前事实的归属/结果路径直接 fetchStopProcessListLocal。

### 5.2 PHP

Windows 使用运行登记、私有 PID 文件、实际版本 PID 文件，以及该版本的 spawner/ini 证据。活候选 COMMAND/EXE 不可读不能跳到“空目标成功”。确认 spawner/父后完整子孙随父树停止；孤立 worker 才使用专用 PHP 证据单独停止。

必须确认原父及全部原子孙退出，再检查 PHP 模块残留；仅 spawner 和一个 worker 消失不代表四 worker 全停。Unix PHP 保留自己的 ini/配置 marker 与 INT 策略，避免新引入依赖完整 EXE 路径的 macOS 判断。

### 5.3 数据库

MySQL/MariaDB 的 Windows 原生关闭使用版本目录内绝对 mysqladmin/mariadb-admin，通过 execFile 参数数组，shell=false、隐藏窗口、有限超时。配置、主机、端口、用户、密码分别传递；中文、空格、引号、&、% 不参与 shell 解析。日志不打印带密码的 execFile 错误对象。

端口必须明确从配置解析为 1–65535，读/解析失败不猜 3306 发 shutdown。原生关闭要求唯一监听 PID 属于本次目标。无法核对或原生失败时按已有策略回退到已确认目标树，重新查询并与最初 PID 集合取交集，不扩大本次实例。执行层仍复核身份，末次确认全部原 PID 消失后再清文件。MySQL 分组停止用该组自己的配置标记和原目标确认，不能仅因 mysqld 进程名相同结束其他组。

MongoDB 先停止 DbGate，再按当前配置端口用已有 mongosh admin shutdown。要求监听者非空且全部属于已确认目标，不能仅有一个匹配就相信共享端口。缺少 mongosh 才沿用现有树停止回退；退出不下载 mongosh。认证/TLS/非 loopback 等原生关闭不适用配置明确失败，不自动强停掩盖它。

PostgreSQL 保存实际 DATA_DIR，Windows 使用对应 postgres.exe/postmaster.pid 和绝对 pg_ctl，按数据目录执行 native stop/wait。进程匹配比较完整 -D 参数，支持引号/空格，Windows 规范化斜线和大小写，避免 db 与 db2 的子串混淆。Unix 原生执行失败、PID 文件等待超时、活进程等待超时均传播。

### 5.4 companion 与其他模块

DbGateRuntime 协调 openFlight/stopFlight：停止等已有打开结算，打开等已有停止结算。私有 stopOwned 用于打开失败的内部清理，不能调用会等待当前 openFlight 的公开 stop。候选来自私有文件、独立面板登记 PID和私有 entry，每个父仍经归属核验，不退回裸 firstPid kill。kill 与结果确认成功后才删 PID/端口文件；取消/失败/超时不在 finally 中删除重试依据。

数据库通常先关闭 companion 并合并停止 PID。面板已关闭但数据库失败属于部分完成，整体停止仍失败；重试面板可幂等。独立面板 companionOnly 参数不能混入数据库父 PID。

Redis 在 Windows 使用通用已确认树，并先处理 Commander；PostgreSQL 的 pgAdmin、ClickHouse/Temporal 的 UI 沿用模块私有 runtime/目录证据。ClickHouse 对 watchdog 的父与后代证据有专用规则；父未知、后代不可读或父缺失留历史 PPID 不能当 stale 成功。ClickHouse UI 用服务配置标记发现，不恢复同 EXE 全实例扫描，服务和 UI 都确认完整原树；Temporal UI 同样严格确认原目标和私有目录，面板失败阻止整体停止成功。

n8n 用模块包/端口/命令标记，Neo4j 保留实例目录，Temporal UI 用实际私有目录；它们复用通用执行和结果确认，不只搜索程序名称批量结束。

项目/自定义服务先验证启动创建身份，Windows 随父树，Unix 保留 TERM→短等待→INT。批量 TERM 某个 PID 已退出可能非零，但其他目标仍需执行既有 INT；记录信号错误继续原策略，只有最终全部消失才成功，不新增自动 KILL。

Cloudflare 隧道 stopService 转发原 stop，登记只保存 PID/程序路径，不复制 API/tunnel token。Windows 检查根程序、树停止和原子孙确认；Unix 保留 INT，失败不清 PID。DNS/ftp-srv 在专用 fork 中关闭各自 server/socket，等待成功再注销宿主 PID/unpin，不把 Electron worker 当 OS kill 根。

## 6. Windows 权限执行与 Go Helper

### 6.1 普通、管理员、UAC 和 Helper

模块归属确认后，共享 executeWindowsPrivilegeOperation 在授权前采样目标创建身份。普通可完成则直接结束；已管理员运行使用本身权限，不安装 Helper、不重复 RunAs。仅访问拒绝按已选择方式进入 UAC/Helper；身份变化、查询格式错误、真正执行失败不能假装是权限不足。

普通原生 StartTime 首选完整 UTC 精度。访问拒绝时尝试普通 CIM 创建时间加实际程序路径；两种都无法证明身份则明确失败，不能在提权后盲认数字 PID。模块更早的归属完全不可读也可能直接拒绝，本轮不承诺任何企业策略都能自动提升解决。

项目/自定义服务额外把已采样的启动创建时间传给 ProcessKillTreeStrict。权限层采样 native StartTime 时同步要求相同 PID 的 CIM 时间等于原启动时间；CIM fallback 也必须精确匹配。此证明只约束已经请求的根，不产生新目标、不改变签名 RPC，不因普通校验后 PID 被复用而把替代者重新采样为授权基线。

UAC 使用一次性受保护管道执行脚本，不依赖常驻 Helper；Helper 使用既有认证密钥、签名 RPC、客户端 SID/PID/EXE、防重放和全局授权租约。授权执行前重查原身份，取消/拒绝/超时向模块传播。已保存方式在退出清理仍可使用；后台请求不能随意弹首次选择/UAC。

### 6.2 RPC 与执行前保护

Windows kill 的签名参数为 signal、pids、tree、identities；killPorts 为 ports、identities。普通单 PID、端口、树都传身份。树只为根建立身份，普通/端口为各个实际目标建立身份。Go 保留 Unix 老请求兼容，Windows 活目标没有身份不允许执行。

身份包括 pid、created、source，CIM source 还要求 path。校验数组/字段、数字范围、重复、数量、来源、时间与必要路径，再用原生句柄检查当前创建时间和系统父保护；全部根通过后才调用固定系统 taskkill，tree=true 使用 /T，单 PID 不使用 /T。句柄保持到执行结束，避免执行时只持有可复用的编号。

StartTime 完整精度比较；CIM 底层时间为微秒精度，传输值为 UTC ISO 时间，Go 按微秒比较并额外比较规范化路径。PowerShell 使用相同查询来源，不把 CIM DateTime 当作 DMTF 字符串转换，也不把原生 StartTime 与 CIM 时间逐字符混比。系统保留 PID、Helper 自身和关键系统程序拒绝。

端口执行重新查询监听者，仅允许原快照里的现存目标；旧目标已退出可幂等，新占用者或同 PID 新创建时间拒绝。Windows 查询真正失败不能当空端口；Unix lsof 退出 1 仅在 stdout/stderr 都为空时代表没有匹配，其他错误传播。

taskkill 非零仅在持有的所有原句柄都已 signaled 时可算幂等成功；否则保留原错误。Go 的根句柄确认不替代模块对原子孙的末次确认。Go Unix ps/lsof/kill 查询与执行错误也必须传播，避免空列表伪成功。

## 7. 失败与已知边界

- 权限取消、归属不明、PID/创建时间改变、真正查询失败、残留/超时：模块 reject，code=1，运行登记/身份文件不走成功清理，界面可重试。
- 父在最初查询前消失但历史 PPID 子孙仍在：项目/自定义/隧道不能仅凭历史父编号补认。PHP 有自己的孤立 worker 证据，其他模块不能复用它。
- 父在授权等待期间退出：执行器可幂等跳过不存在根，但原子孙还在就由模块结果确认报错。
- 准确归属与执行不是原子事务。项目创建时间在启动后采样，Unix ps 仅秒精度；不承诺排除所有极端同秒 PID 复用。新创建的、未在初始列表出现的 daemon/脱离父树进程需要模块特有归属，不能按相同 EXE 全局补杀。
- 保存 current 或编辑项目不能先吞旧停止失败。旧服务仍在时禁止以“切换已完成”启动新服务；同模块队列之外任意外部进程操作不受该队列约束。
- 退出仍记录失败后继续退出。OS 强制终止、崩溃、断电和手动脱离生命周期的进程不在正常退出保证内；完全不返回的 fork 请求会有界结算为未知结果，不等于底层服务已停止。
- Helper 源码版本与产物是两件事：当前版本与本轮 Go 修改原因见后续文件清单/检查记录；新二进制没有构建，不能声称已安装程序已升级。

## 8. 调整文件、原因与本轮复查修正

以下按职责整理整个服务停止优化涉及的实现文件，包含前轮修复和本轮注释、查漏补缺；不表示工作区中这些文件的全部差异都属于本轮。历史权限选择、hosts/PATH 和测试脚本修改不并入服务停止清单。

### 8.1 main：请求、登记和退出

- `src/main/core/ServiceLifecycle.ts`：集中判断生命周期命令并提供可撤销的异步许可。统一 UI/MCP 与原始 fork 门禁，允许已经受理的操作及退出自有清理结算，阻止完成请求遗留回调继续启动服务。
- `src/main/core/ServiceProcess.ts`：正安全整数 PID 登记、不可变参数与 generation、模块队列、完整消费者 drain、stopSnapshot/finishStopSnapshot、逐实例退出。核心原因是旧回包不能删除新实例，启动结果必须先登记再退出，展示过滤不能影响 companion 清理。
- `src/main/core/ForkManager.ts`、`ForkItem.ts`：维护真实在途请求、worker 路由与最终发送门禁；不使用当前版本全局改写历史 stop 参数。DNS/FTP pin/unpin 跟随成功终态，不把退出 worker 当模块停止。
- `src/main/core/IPCHandler.ts`、`MCPTools.ts`：在生命周期队列真正派发时捕获实例快照，检查成功终态再消费登记。MCP stop_all 包含 companion；切版本的前置停止失败就中断，不继续改 current 或启动新版本。
- `src/main/Application.ts`：退出先关闭入口、等待已受理消费者，再经 ServerManager 统一停止；插件停用遍历原始登记，跳过前项已回收的 generation。权限协调器保留到 hosts 清理结束。
- `src/main/core/ServerManager.ts`、`Launcher.ts`：保留应用正常退出/重启的统一资源清理入口，移除退出中的第二遍模块停止；生命周期归属和失败继续清理其他实例的原因在调用处说明。
- `src/fork/BaseManager.ts`、`src/fork/index.ts`：模块启动终态生成真实 Stop-Args/Companion，保留已有模块签名；一次性 `-1` 不生成服务契约。进程表桥接只接受有效成功列表或明确错误。

### 8.2 renderer：既有生命周期对象的状态与重入

- `src/render/core/Module/ModuleInstalledItem.ts`、`Module.ts`：等成功终态才清 PID，失败恢复状态；停止 Promise 用对象外的 WeakMap 共享，避免把运行对象序列化时带上内部 Promise。重启及单实例切换检查前置停止结果。
- `src/render/core/ModuleCustomer.ts`：自定义实例共享停止 flight，独占版本启动协调；不能因为正在停止时临时 `run=false` 就让第二个调用提前返回成功，也不能在旧实例失败后修改 currentItemID。
- `src/render/components/LanguageProjects/ProjectItem.ts`、`Project.ts`：项目启动/停止 flight 与终态；编辑、重启先确认旧实例停完，再替换项目配置或启动。进程归属仍由 fork 保存的实际启动身份决定。
- `src/render/core/CloudflareTunnel/CloudflareTunnel.ts`、`src/render/util/GlobalIPCOn.ts`：沿用隧道实例状态及既有全局状态通知；中间事件不能结束监听，失败不清 PID。页面卸载不接管或结束进程。

### 8.3 fork：实际服务和 companion

- `src/fork/module/Base/index.ts`：通用 Windows 两类目标来源、根压缩、原树结果确认、实例 PID 文件清理；Unix 保留信号策略但使用严格查询/执行/确认。自己的 waitPidFile 对短暂空文件重试，避免启动后漏登记。
- `src/fork/module/Php.win/index.ts`：spawner/父与全部后代统一停止，孤立 worker 独立 PHP 证据；活候选不可读报错，原树与模块残留双重确认。`Php/index.ts` 保留 Unix 配置/进程标题兼容与 INT，补齐严格终态。
- `src/fork/module/Mysql/index.ts`、`Mariadb/index.ts`：绝对 admin 程序、execFile 参数数组、明确端口、唯一监听者归属、已确认原树回退与结果确认。避免密码进入 shell、关闭配置失效时的其他数据库、原生关闭失败后扩大目标。
- `src/fork/module/Mongodb/index.ts`：先停 DbGate，检查全部监听 PID，沿用已有 mongosh/native 策略；退出不下载工具，失败传播。`Postgresql/index.ts`：保存实际 DATA_DIR、精确 -D 参数与原生关闭/等待，Unix 失败也不能吞掉。
- `src/fork/module/DbGate/index.ts`：open/stop flight、内部 stopOwned、独立面板登记 PID、归属查询/等待/成功后清文件。避免打开过程中停止漏进程、内部清理等待自身、finally 删除失败重试依据。
- `src/fork/module/Redis/index.ts`、`Redis/RedisCommander.ts`：先关闭 Commander 并合并 PID，服务仍复用 Base；面板失败不删除身份文件。`ClickHouse/index.ts`：watchdog 归属与父缺失/不可读判断、UI companion 合并。
- `src/fork/module/N8N/index.ts`：模块包/参数证据、严格停止及结果确认。`Neo4j/index.ts`、`Neo4j/startup.ts`：保存实际实例目录、精确匹配完整 --home-dir/--config-dir 参数，Unix 路径保留大小写，包装程序路径按目录段边界匹配；原 PID 清单与模块残留均确认后清文件。
- `src/fork/module/Temporal/index.ts`：UI 目录/端口归属与结果，复用服务入口及 companion 参数。`CloudflareTunnel/index.ts`、`CloudflareTunnel/CloudflareTunnel.ts`：stopService 转发和实际 runtime 的父身份、原树确认、失败状态；停止登记不复制隧道 token。
- `src/fork/module/DNS/index.ts`、`FTPSrv/index.ts`：关闭自身 server/socket 的专用停止，不把 fork 宿主 PID传给 OS 树停止。
- `src/fork/module/LanguageProject/index.ts`、`ModuleCustomer/index.ts`：实际创建身份、明确 PID 参数校验、父缺失留子孙拒绝、启动证明传到 Windows 授权层、Unix 既有 TERM/INT 与原清单退出确认。日志避免展开项目私有环境/密码。
- `src/fork/util/ServiceStart.ts`、`ServiceStart.win.ts`、`src/fork/Fn.ts`：启动前严格移除旧 PID 文件，空 PID 内容有限重试，错误日志调用禁用此重试；Windows 包装进程外层与内层都使用已验证的系统 PowerShell 绝对路径。

### 8.4 共享执行层、工具与 Go

- `src/shared/ServiceProcessIdentity.ts`：规范 PID、捕获与验证启动创建时间、Unix 信号和原清单等待。时间窗口只拒绝旧 PID，不代替创建快照；读不到身份的活父明确失败。
- `src/shared/Process.ts`、`Process.win.ts`、`StopProcessList.ts`：严格停止、父树执行与同快照根压缩、树遍历环保护、精确 PID 查询、端口查询失败传播。兼容显示 API 可以有不同错误处理，停止必须使用 Strict/Local 查询。
- `src/shared/WindowsProcessSafety.ts`：进程保护、同来源身份复核、严格 TCP 查询与启动证明的调用内约束。Get-NetTCPConnection 仅特定无匹配错误可视为空，其余错误传播。
- `src/shared/WindowsPrivilegeOperation.ts`、`WindowsHelperFallback.ts`：授权前目标快照、普通/UAC/Helper 一致复核，原生 StartTime 读取被拒绝时使用 CIM 创建时间与 EXE 证据；启动证明不能在权限边界丢失。
- `src/fork/Helper.ts`：统一 Windows 分流与签名 RPC 身份参数；Unix 沿用既有 Helper/本地执行政策，不另做模块编排。
- `src/fork/module/Tool.win/process.ts`、`Tool/process.ts`：工具入口不吞执行/查询错误；Windows 端口停止直接复用专用权限动作，在授权前固定监听者，执行前拒绝新占用者。该工具结束 TCP 监听进程，不另行猜测并扩成服务子树；模块服务完整树仍由模块处理。
- `src/helper-go/main.go`、`module/tool.go`、`utils/util.go`、`utils/process_tree.go`、`process_tree_windows.go`、`process_tree_other.go`：RPC 参数/来源验证、Windows 原生句柄与 taskkill、Unix 查询/执行异常，全部根检查后再执行。保持父树语义，不改成逐 worker 预检。
- `src/helper-go/contract/helper-contract.json`、`scripts/helper-contract-check.ts`、`helper-version-sync-test.ts`：前轮同步停止 RPC 参数与版本约定；本轮不新增测试方法，也没有执行检查脚本。
- `src/shared/AppHelperCheck.ts`：HelperVersion 与 Go、独立版本断言同步为 **32**。此前 31 修正 Unix 查询，本轮 32 修正 Windows 结构化端口/进程查询与 Unix 监听输出校验；未构建或替换已安装二进制。

## 9. 整理时发现并修正的遗漏

1. **无驻留进程也登记服务**：`-1` 为 truthy，原代码会生成停止参数。fork 生成契约和 main 登记分别检查正安全整数；不依赖对方兜底。
2. **插件漏独立面板**：展示运行列表过滤 companion，不能作为停用清单。改用原始登记，按 generation 遍历、确认最后没有服务或 companion。
3. **重复停止提前成功**：界面临时 `run=false` 不代表 IPC 停完。普通/自定义实例先复用 pending Promise，再检查状态；项目启动也共享 flight，编辑/重启检查前置停止。
4. **启动身份在授权边界断开**：fork 验证后，权限层再次采样可能接受复用的 PID。项目/自定义传入原启动证明，采样时仍核对原 CIM 时间；原生 StartTime 和 CIM 精度不同，不能跨来源逐字符比较。
5. **PID 文件时序**：旧文件删除失败不应吞掉，文件已创建但内容为空不能立刻判启动失败。两套 waitPidFile 都有限重试；错误日志保持原用途，不增加无意义等待。
6. **Windows 包装进程依赖 PATH**：外层显式 PowerShell 并不保证内部 Start-Process 找到 powershell.exe；两层传递同一系统绝对路径，中文和空格通过既有编码/字面量机制传递。
7. **Unix 兼容停止吞错/提前清理**：Base/PHP 改严格查询、原信号策略与退出确认；项目 TERM 部分目标自行退出后仍继续既有 INT，只在原目标全消失时接受成功。Cloudflare、Redis Commander、DbGate 也用原目标退出确认处理信号与自然退出的竞争，不凭错误文本猜已经退出。
8. **进程图异常循环**：PID/PPID 环不应无限递归；共享子孙遍历增加 visited，压缩成零根但原集合非空应拒绝，不能返回空目标成功。
9. **查询失败伪装零目标**：Go ps/lsof、TS Unix lsof、Windows TCP/工具入口传播真实失败；非空畸形输出不能过滤成空列表。端口数字先验证，移除掩盖 lsof 状态的 awk 管道，精确 PID 查询避免按命令子串匹配。
10. **Windows 端口停止采样不连续**：工具不再先查询端口、另查树、最后按裸 PID 执行；直接复用端口动作的监听者快照及执行前复核。当前各 Windows 停止后端统一 TCP Listen 状态。
11. **Neo4j 相邻目录与原子孙遗漏**：完整解析目录参数、保持平台路径语义，不按 neo4j/neo4j2 前缀确认归属。末次查询同时检查最初原 PID 清单和当前实例标记，父退出不能让无标记 worker 被忽略；文件清理检查当前内容。
12. **专用服务/面板停止边界**：MySQL 分组使用本组配置标记；ClickHouse UI 不按同 EXE 扫描，服务/面板均检查原树并保留其他版本文件；Temporal UI 查询、执行和等待失败都传播，不能面板仍在却报告整个模块停完。

## 10. 检查记录与后续实机验收

检查范围包括调用签名、队列受理/派发/回包顺序、generation 注销、启动身份到权限动作的来源、模块目标/原生策略/终态、companion 生命周期、错误和文件清理边界。本轮独立审核又补查了退出预算、非生命周期写入、renderer 通知次序、分组实例和 Helper 32 同步，详见第 11 节。

没有新增/运行测试、类型检查、构建、格式化工具或真实服务操作。此前空白检查退出码为 0；本轮最后检查记录见第 11 节。Git 提示部分既有文件下次写入索引时会将 CRLF 规范化为 LF，本轮未执行暂存或整体换行转换。Helper 32 只更新源码，当前安装的 Helper 是否已替换无法从源码结论推导。

后续实机验收应覆盖：

- PHP spawner 与多个 worker，父提前退出、孤立 worker、UAC 中父自行退出、拒绝/取消权限后的重试。
- 普通/UAC/Helper/管理员模式；查询被拒绝、CIM fallback、启动证明精度、授权中 PID/端口被替换。
- 普通服务、项目、自定义服务重复 stop/restart；项目编辑等待停止；同时启动和退出、原回包晚于新登记。
- 面板打开中停止/退出、独立面板插件停用、父成功但 companion 或数据库失败、MCP stop_all 部分失败。
- MySQL/MariaDB 密码含中文、空格、引号、&/%，端口配置缺失/变更/占用者变化；MongoDB 原生工具缺失和认证配置；PostgreSQL 自定义 DATA_DIR；Neo4j 相邻实例目录。
- PID 文件删除失败、短暂空内容、读失败、清理前被覆盖；Unix ps/lsof 错误、TERM/INT 部分 ESRCH、慢退出/残留；macOS 进程标题变化且缺完整二进制路径。
- 正常退出期间服务停止与系统 hosts 清理；PowerShell 不在 PATH、目录含中文/空格、旧 Helper 版本检查。

这些是待验收场景，不是已通过结果。正常退出失败后仍继续退出、未知创建身份安全拒绝、Unix 秒精度和外部脱离父树实例等限制见第 7 节。

## 11. 独立实施审核的修复说明（2026-10-03）

### 11.1 根目标与版本边界

审核 H-01/H-03/M-04/M-06 指向同一个边界：启动程序相同或整个 FlyEnv 数据目录相同，都不足以区分正在停止的具体版本/数据库实例。

- `Base/index.ts` 的 Unix 通用 marker 去掉全局 BaseDir/AppDir，沿版本专属 bin/path；Windows 保持 PID 文件与服务名加 marker 两条来源。明确请求的 PID 仍活着但没有被本次归属规则选中时失败，不返回空成功让 main 注销它。
- `Php/index.ts` 只保留目标版本 ini/配置证据，保留 macOS 进程标题路径；不引入完整 EXE 读取要求。确认父后的子孙仍直接随父停止。
- `Mysql/index.ts`、`Mariadb/index.ts` 普通停止在 Windows/Unix 都要求完整 `--defaults-file` 参数等于本实例配置，Unix 路径保持大小写。该根 predicate 是 AND 条件；把配置加入 OR marker 无法排除同版本分组实例。改密后的清理也复用该模块方法，失败传播，不走 super 的宽路径旁路。
- PID 文件只清理末次查询已确认消失或本次已停止的 PID，且删除前核对当前值。空文件可能尚在写入，因此保留。旧记录仍活着且归属不明时失败；不因文件存在就盲杀。
- Base 启动终态移到 app PID 文件维护之后：退出 drain 不再在启动已回包后撞上迟到的旧 PID 写回。写文件失败沿原策略记录错误，仍交回真实启动 PID，不能因此让已经运行的服务失去 main 登记。

### 11.2 MySQL 分组纳入统一生命周期

审核 M-03 修复时发现，原组启动还会返回 `true`，没有实际 PID/Stop-Args；仅修树停止后等待无法让退出发现该实例。

- fork 的模块私有 `{ group }` 参数通过现有 `startService/stopService` 入口适配；renderer MySQL 组操作也改用该入口，进度与终态共用既有协议。旧分组命令保留兼容。
- 组启动返回实际服务 PID、独立配置路径作为运行登记展示键，Stop-Args 保存真实安装项和组快照。普通服务和不同组不因同 bin 合并；main 不添加 MySQL 专用字段。
- 组停止使用组私有 PID 文件及配置标记恢复父，活 PID COMMAND 不可读/不匹配则失败。确认原树退出后核对当前文件值再清理；启动前停止返回的旧 PID 随新启动终态交给 main 按派发代次注销。
- MCP 普通版本切换只选择普通安装项，不顺带停止配置展示键不同的独立实例；退出、插件停用与 stop_all 仍遍历全部登记。
- renderer 在 MySQL 模块内按组配置键消费状态广播，MCP stop_all 后也清理组运行展示和本地 PID；普通安装项不会因同 mysqld.exe 把组状态认作常规服务。

### 11.3 请求等待、退出与迟到结果

涉及 `ServiceLifecycle.ts`、`ServiceProcess.ts`、`ForkManager.ts`、`ForkItem.ts`、`IPCHandler.ts`、`MCPTools.ts`、`Application.ts`。

- Temporal `startUiServer` 和旧分组命令加入分类器；全部原始 fork 请求进入在途表，因此 hosts/配置写入也参与退出等待。关门后全部新 raw 请求被拒绝，已受理上下文与退出清理可继续。
- 用户生命周期请求连同排队最多六分钟；fork 服务请求也有六分钟终态预算。退出两层 drain 各最多三十秒。超时先撤销操作上下文，再退休实际 worker 并结算其所有等待请求；不能只 race 后继续放任旧请求发送或登记。
- EventEmitter 不保证恢复调用者 AsyncLocalStorage，回调捕获可撤销上下文对象而非布尔值。迟到消息被 worker 退休/请求有效性检查挡住；登记接口亦拒绝已过期上下文。
- 退出逐实例停止没有一个提前撤销后续停止许可的整体 timeout；每项受 fork 预算保护，失败继续后项。未知启动可能已经产生脱离 worker 的服务、未知写入可能部分完成，记录 unknown，不称已回滚。
- 无根快照的成功停止按“派发前登记快照 × 返回实际 PID”注销，不能与稍后的当前登记直接相交。PID 规范化十进制，MCP 保留 companion；stop_all 跳过已替换的代次。
- 插件停止逐项收集错误并继续，最后仍有实例/错误就拒绝卸载。删除无人使用的无代次保护注销方法；权限桥同步异常也退休 worker、结算请求。

### 11.4 renderer 终态与操作协调

既有生命周期对象继续拥有业务状态；`ForkTerminalRequest.ts` 只是模块无关传输工具，不持业务状态或通知。

- 普通安装项、自定义实例、项目与隧道只接受 `code=0/1` 终态；进度不设运行成功。统一六分钟等待、同步异常处理、监听清理，避免 `new Promise(async ...)` 留下未结算外层 Promise。
- 项目 stop 先等正在启动的 flight 获得实际 PID，start 先等正在停止的 flight；重复同类请求共享 Promise，finally 按对象身份删除 flight，防止清掉后续请求。
- 自定义服务列表重启、项目组停止、编辑/删除均检查真实停止结果，失败不启动新服务、不删除旧项目/实例。普通服务忙卫不把另一版本停止丢弃为成功，早退明确结算。
- 删除无人使用的第二套 LanguageProjectRunner 生命周期，实现所需类型留在项目模块。Cloudflare fetchTunnel 保留进度监听到终态。
- main 状态广播与 IPC 终态携带递增 revision；renderer 记录已消费序号，拒绝旧广播。当地操作在途时空广播不覆盖 pending 状态，也不推进序号；终态由所属对象提交成功/失败状态。

普通安装项的整个启动 flight（含模块互斥、前置停止、扩展参数及 IPC）共享六分钟总预算；同一个 deadline 也结算模块锁。超时撤销 token，迟到前置步骤不得修改 current、运行状态或派发启动。自定义/项目各实际 fork IPC 有六分钟预算，但等待用户处理密码提示没有总自动取消时限；这属于仍等待用户输入的 UI，不能描述为所有 renderer 启动 flight 都有同一总预算。

普通安装项停止的模块定位/扩展参数与实际 IPC 共享六分钟执行预算；准备超时后不会继续派发。启动时等待已有停止也参与模块锁的 deadline。Module.onItemStart 明确绑定 Module 接收者，避免在 item 回调里把 this 指向错误对象；其前置停止完成后再次验活动 token 才修改 current。

### 11.5 companion、配置、凭据和启动文件

- RedisCommander 默认查询改严格源；pgAdmin 活候选命令不可读明确失败，不能删除 PID/端口文件当作已关闭。Temporal UI 去重使用已导入的新鲜查询，查询失败不再被吞成“没有运行”。
- PostgreSQL Unix 共享 app PID 文件改为当前值核对；PHP/Redis/MySQL/MariaDB 的模块私有 stale 文件仅在确认旧 PID 消失后清理。Cloudflare 没有内存 PID 时恢复私有文件，成功确认后清理当前匹配记录。
- `Neo4j/startup.ts` 接受完整目录参数的 `--option=value` 和 `--option value`，仍按平台路径语义比较。MongoDB 缺省端口保留合法默认 27017，但原生关闭前必须确认全部监听者属于目标树。
- MySQL 初始化密码不再在配置读失败时猜 3306；MySQL/MariaDB 启动、改密、备份的成功与错误日志不展开密码/带 argv 的错误对象。此处修正日志暴露，不宣称重构了所有维护命令的 shell 执行策略。
- `ServiceStart.ts/ServiceStart.win.ts` 三条通用入口删除旧 PID 文件失败直接传播；`.ps1` 入口用受验证系统 PowerShell 绝对路径。环境同步/程序解析先于日志句柄打开，spawn 同步失败也释放父方句柄。
- `Tool.win/process.ts` 在显示搜索前显式取严格进程列表，避免搜索工具的兼容 catch 把查询失败转为空目标。

### 11.6 权限执行、端口与 Helper 32

- `Helper.ts` 密钥、socket 路径、连接、签名与发送的异常统一收口，准备/连接有界等待。已发送写请求的 timeout/坏响应属于未知执行结果，不自动向备用 Helper 重放；未发送的不可用连接才可沿已有策略路由。
- Windows 无权限 provider 时拒绝树 kill，不发送会被旧解析器误当 identities 的三参数请求；生产仍通过统一权限 provider。
- PowerShell 非树停止也在身份复核前持原进程句柄，finally Dispose；树模式仍只校验根。Windows 路径 marker 规范化大小写/斜线，但无法证明的 8.3 短路径安全拒绝，不恢复 EXE 全扫描。
- Windows 监听专用查询使用 PowerShell `Get-NetTCPConnection -State Listen` 结构化结果，避免本地化 netstat 文本。共享 loopback 查询显式按 Windows/Unix 分流；Go 的 Windows 进程查询使用 CIM，参数仍通过固定系统程序调用。
- `getPortPids` 是通用 TCP 本地端口查询，保留全部状态；`killPorts` 和数据库原生关闭使用监听专用查询。通用查询的合法 PID 0（如 TIME_WAIT）跳过，监听 kill 中 PID 0 拒绝成为目标。契约 platform 改为 all。
- Unix 停止用 lsof TCP Listen 专用查询，非空畸形/非监听输出不能被当成“零监听”成功；通用查询保留 TCP/UDP 连接，合法 UDP 无尾部状态的九字段行仍支持。移除完整进程项与逐调用 trace 日志，避免命令行凭据暴露。
- Go taskkill 非零时允许“所有原句柄均已 signaled”的幂等成功；PowerShell 仍更严格地传播非零。差异保留，不能把两后端描述为相同返回策略；模块最终原树确认仍必需。
- Go/TS HelperVersion 与已有版本断言统一为 **32**，两侧注释要求后续修改同步钉值；没有构建二进制。

### 11.7 审核澄清与验收边界

L-01 所称“MCP 无条件注销”与原代码不符，原路径也依赖根快照；实际缺口是未命中时无法消费实际返回 PID，本轮双入口均使用派发代次快照。M-02 不把通用 `getPortPids` 改成仅监听，避免破坏查询 API；停止使用专用监听接口。L-21 名搜索对没有 COMMAND/EXE/登记的进程无法判断它是什么服务，不能拒绝系统内全部无名进程；明确 PID 的不可读活候选仍严格失败，未知无名实例无法安全补杀。L-23 合法 MongoDB 默认配置保留；监听者必须属于已确认目标。

复核时同时检查了 `ForkPromise` 的实现：它会捕获异步 executor 返回的 Promise 并转交 reject，因此 fork 模块使用异步 executor 不等于普通 `new Promise(async ...)` 的悬空问题；renderer 和 Helper 的普通 Promise 仍需自行收口。

本轮仅静态源码核对；没有新增/运行测试、类型检查、构建、格式化或真实服务操作。最终 `git diff --check` 无空白错误（退出码 0），工作区原有暂存与其他修改保留。待实机场景增加：双 PHP/Redis 版本、常规 MySQL 与同版本多组并存、Temporal 面板打开中退出、RedisCommander/pgAdmin 查询被拒、非英语 Windows、Helper 准备阶段异常、drain 永不回包、状态广播与终态乱序，以及未知执行结果不重放。

整理期间 Helper.ts 曾因局部文本整理误覆盖前缀；临时恢复 HEAD 后，从本会话此前工具输出找回完整原基线，再逐段叠加本轮权限/连接收口改动。对照检查包含 imports、原 Windows provider/租约分流、四参数停止身份 RPC、签名重试与导出接口；最终保留用户此前授权的源码改动。

### 11.8 WindowsHelperFallback 停止脚本模板语法修复

用户指出 `src/shared/WindowsHelperFallback.ts` 有问题后，发现 `buildWindowsPrivilegeAction` 的进程停止分支在共享 PowerShell `finally` 结尾残留一组多余的模板结束符。树/非树动作的条件模板插值已在共享 `catch` 前闭合，再次追加反引号和右花括号会提前结束外层字符串，导致后续脚本内容被误解析为 TypeScript，影响整个文件的解析。

修复只删除这一组多余结束符：共享 `finally` 和外层 `foreach` 的右花括号继续作为 PowerShell 脚本文本，最后一个反引号才结束外层 TypeScript 模板；构造器前补充详细注释说明两层模板边界。原有父进程归属、创建身份复核、句柄释放、树停止和错误处理策略保持原逻辑；未修改 Go 代码，Helper 源码版本继续为 32。

本次人工核对模板闭合及调用入口，并进行差异空白检查；未运行测试、类型检查、构建或实际进程停止，不能据此认定 Windows 实机停止已验证。

### 11.9 PHP 停止耗时诊断

针对用户反馈单实例约 13 秒，增加仅诊断上下文启用的阶段观察，覆盖 PHP 四处全量进程查询、共享退出轮询、父身份采样及权限动作。新脚本默认只读，显式 apply 调用真实 PHP stopService；两个版本串行测量以观察固定开销叠加，不调整停止范围或并发策略。完整原因分析、命令、统计口径和验证限制见 [Windows PHP 停止耗时诊断](windows-service-stop-timing.md)。

后续用户实测确认每个实例四次全量查询约 2.77 秒。已将 PHP 正常停止路径改为两次：发现目标一次，停止后确认一次；共享等待返回确认退出时的列表，供同版本残留检查与 PID 文件清理共同使用。仅原 PID 仍活时继续轮询，父身份采样和执行前复核保留，删除前文件值复核保留；不跨请求缓存。四次查询描述属于优化前基线，最新阶段和复测口径以耗时诊断文档末节为准。

### 11.10 首次创建身份和公共收尾合并

用户要求首次列表返回缺失字段，并合并各模块的相同处理后，全量 CIM 查询已将 CreationDate 格式化为 UTC invariant 原文返回到 `PItem.CREATED`。共享树停止把首次快照的创建身份传入权限入口，取消重复的父身份采样动作；真正执行前的同来源身份复核保留。上一节“父身份采样保留”描述属于这轮优化前状态，现在只在没有携带首次快照的工具调用中保留采样。

新 `ServiceStop.ts` 统一树执行、退出确认、返回最终快照及 PID 文件当前值核对清理；Base 只包装接口，普通模块与非 Base 的伴随 Runtime 共用它。项目/自定义服务也共用 `stopRegisteredServiceProcesses` 的登记身份、目标树与停止收尾。PHP 的模块差异只在专用配置的目标发现和最终内存残留筛选，执行不再走独立的父/孤立 worker 两次停止流程。

MySQL/MariaDB 的原生等待和有意保留的原树回收也已合并：原生命令成功后立即确认，不固定睡眠 1500ms；只有查询成功的退出超时允许回退，查询错误必须失败。无原生成功时直接带首次身份停止，取消重复发现。其他数据库的有序关闭、禁止强杀及伴随服务顺序继续由模块负责。本轮未修改 Go，Helper 源码版本保持 32。

完整接口、逐模块改动、原因、边界与静态检查范围见 [Windows 服务停止快照与公共阶段合并](windows-service-stop-snapshot-unification.md)，新阶段口径见 [Windows PHP 停止耗时诊断](windows-service-stop-timing.md)。正常目标首次确认成功为两次全量查询；存在残留、原生等待和 companion 各有必要查询，不能宣称所有业务固定两次。

### 11.11 PHP 假残留超时与历史 PPID

后续的候选发现语义已按用户要求改为逐项过滤，见第 11.12 节；执行端身份复核和原目标退出确认仍严格。

后续用户反馈 PHP 已退出但公共等待超时。日志中的 PHP 父于 16:30:40 创建，报错集合里仍存活的 vctip 于 16:24:18 创建，时间早于当前父。建树原先只比 PID/PPID，历史父号码被复用时会把旧程序混入新服务树；超时报错又列整个请求而非实际残留。

新 `ProcessSnapshot.ts` 统一精确 PID 树、Windows 单/多 PID 树及根压缩使用的父子关系。沿首次完整列表排除“子早于父”的假边，无额外查询或 worker 授权；正常后代仍整体停止。公共结果等待同时复用首次创建身份识别同 PID 的新占用者，未知身份仍保守失败；原生等待和 Runtime 已有首次列表也直接传入。超时只报实际未退出 PID，并记录首次/当前创建时间供定位。

原 PID 号码等待可能因新占用者保守失败的旧描述，在携带 CREATED 的公共路径已被上述比较取代；没有首次时间证据的旧路径仍保留保守行为。完整证据、修改文件和限制见快照合并文档末节。Go 未修改、版本仍 32；未执行真实停止或新增/运行测试。

### 11.12 无效候选逐项过滤

用户要求修复 PHP 候选预检：一条候选缺少身份不得 throw 阻断整次停止。已删除该循环，并检查 Base、PHP Unix、数据库分组、ClickHouse、Neo4j 和伴随服务的同类逻辑；归属发现统一采用公共根证据筛选，过滤不可读/不匹配项，继续其余有效树。确认父后完整后代仍整体纳入，无额外查询。

同步修复过滤后的文件清理，活候选保留私有 PID/端口；pgAdmin 的有包/无包恢复共用一个停止与清理流程。项目/自定义服务只捕获明确的启动证明缺失/不匹配，系统查询错误仍传播。启动去重及严格执行器中的异常检查保留；Go 本轮未修改。

本节覆盖前文“发现阶段活候选未知则整体失败”的旧策略。完整理由、逐文件变化、契约和限制见 [服务停止候选过滤](service-stop-candidate-filtering.md)。本轮仅源码语法/差异检查，未执行测试或真实停止。

### 11.13 PHP 多版本启动与并行停止

用户要求恢复 PHP-FPM 多版本同时启动，并让退出停止与 UI 一键停止采用并行编排。服务列表的整模块忙碌限制现只适用于独占模块；多版本模块仍保持单行 flight。main 队列按请求受理时序和实例范围等待，PHP 多版本键由 PHP 模块提供，UI/MCP 共用；同版本 start/stop 顺序保留，模块级屏障等待先前所有实例，不把异步选版本放在 drain 外。

退出、MCP stop_all、插件停用共用 `stopRegisteredInstances` 并行发出模块 stopService，等待所有终态、隔离各项失败、按冻结的 generation 注销。UI 一键停止原本并行提交每个 InstalledItem.stop；main 不再按模块串行排这些实例。fork 停止实现和权限租约保持原职责，没有第二套 kill 逻辑。早期文档/耗时脚本中的串行数据仍属历史基线。

完整操作契约、修改文件、排队/屏障和并行边界见 [服务生命周期并发](service-lifecycle-concurrency.md)。Go 源码和版本本轮未修改，未新增/运行测试或实机服务操作。

### 11.14 Windows PHP 额外 worker 的有界回收

并行退出现场中 PHP 7.3 的原父树停止成功，但末次列表仍发现本版本 worker PID=19860。原实现只检查首次目标退出，随后发现额外 worker 直接报错。本次在 PHP 的版本残留分支最多补停一次：使用现成末次列表独立确认实际安装 EXE + 专用 ini 的根，复用公共父树执行器和退出确认，合并成功 PID，最终无残留才清理文件/返回成功。正常路径不增加查询；补停失败或继续残留仍失败，不无限重试。

新增诊断记录首次目标与残留前后创建身份，避免仅凭现有日志断言 worker 生成时点。完整操作契约、修改原因、权限分流和验证限制见 [Windows PHP 停止后额外 worker 的回收](windows-php-stop-residual-worker.md)。本次未修改 Go 或 Helper 版本，未运行测试、构建或实际服务操作。

### 11.15 停止全链路诊断

用户指出现有日志不足以确认实际根因。本轮建立每次停止的 stopId，记录 PHP 初始相关行/候选/完整目标、共享树根压缩与实际权限路由提交、普通/UAC 执行端 taskkill 参数/进程 PID/退出码、每轮末次身份对比、补停和 PID 文件清理。全部复用已有查询，没有为日志增加全量 CIM。

Go Helper 同步记录真实 argv、stdout/stderr 与返回结果，版本升为 33；本轮未编译或替换二进制。操作契约、修改位置、完整字段、日志关联方式和不能推断的边界见 [Windows 服务停止诊断日志](windows-service-stop-diagnostics.md)。在新的现场证据到来前，“停止期间生成新 worker”仍只是一种可能性，有界补停不等于根因已经确认。

### 11.16 普通模块目标与 PowerShell 启动细分

本次完整现场中三个 PHP 均停止成功，但较长耗时集中在 action 开始至执行端预检之间。按用户最新要求先补日志，再决定性能优化。Base 普通模块增加从公开停止入口开始的模块 trace，以及首次列表/文件候选/筛选原因/空目标；启动前清理复用该诊断入口，仍调用原 `_stopServer`。Node、broker、native launcher 与 action 分别记录 spawn、引导、编译、READY/LAUNCH、Process.Start、连接/认证、payload/digest、执行和结果阶段。CIM 查询增加 queryId，拆分 PowerShell 初始化、CIM/投影、JSON 序列化和 Node 解析。

日志记录源 UTC、源 PID 和同源计时，不能按回包写入顺序判断源事件先后；非认证阶段不是执行成功证据。没有新增查询、改权限路由或降低身份核验，也没有执行普通权限通道替换。完整字段、逐文件理由、分析方法和限制见 [Windows 服务停止诊断日志](windows-service-stop-diagnostics.md)末节。本轮 Go 未修改，Helper 版本仍 33；未运行测试、构建或真实停止。

### 11.17 完整 PID 集合按父先子后执行（当前行为）

用户要求取消 `/T` 后，服务共用执行器改为一次传入首次列表中的完整有序 PID。根仍独立确认归属并绑定 EXE，后代继承树归属，以首次创建时点绑定原对象；执行端持有句柄，先结束父并确认退出，再处理后代，不再启动 taskkill 或动态扩树。普通/UAC 与 Go Helper 同步，版本升级为 34；本次未重新构建二进制。

本节覆盖前文“仅发送根、taskkill /T 停止后代”的历史策略。目标排序、协议、边界、日志、逐文件原因和检查限制见 [Windows 服务按父先子后停止](windows-service-stop-parent-first.md)。缓存后续按用户要求恢复，当前以第 11.18 节为准。

### 11.18 批量停止恢复 main 共享查询缓存（当前行为）

用户确认该缓存本就用于多个服务并行退出。本轮将停止前发现重新接回 main 的 650ms TTL 与 in-flight 查询共享，覆盖 Base、Windows/Unix PHP、登记服务、MySQL 分组、MariaDB、Neo4j 与伴随服务；停止后的公共确认、残留检查和信号轮询仍严格取新表。

main 在启动受理/终态、有效 PID 登记和一轮批量停止开始清缓存，单个 stop 不清。缓存代次阻止失效前的查询回填，Promise 身份比较阻止旧查询清掉新 in-flight；失效本身不发查询。缓存日志恢复到 debug.log，可观察 hit/join/miss/invalidate。完整逐文件说明与边界见 [服务批量停止恢复共享进程缓存](windows-service-stop-cache.md)。本轮没有修改 Go，源码版本仍为 34；未运行功能测试、构建或实际停止。
