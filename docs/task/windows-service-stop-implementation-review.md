# FlyEnv 服务停止实现：独立审核意见

审核时间：2026-10-03。审核对象是 [服务停止实施文档](windows-service-stop-implementation.md) 描述的当前源码（工作区未提交修改）。本文是继 [原 review](windows-service-stop-review.md)（问题推演）之后对**已实现代码**的独立复查。

## 0. 审核方法与范围声明

- 审核方式：按职责分五路并行只读审查（main 进程与 fork 调度层 / renderer 状态与重入 / fork Base 与共享执行层 / 各服务模块 / Go Helper 与契约），每路先读实施文档再逐文件精读源码，主代理对最高危发现做了原始代码抽查。
- 已做验证：`helper-contract-check.ts` 实际运行通过（30 个方法校验）；helper-go 在 windows/linux 双平台 `go build` 通过；`helper-version-sync-test.ts` 实际运行**失败**（见 M-01）。
- 未做验证：未运行应用、未做真实服务停止、未做类型检查/构建/格式化。所有发现均为静态审查结论，行为性结论需要实机复现确认。
- 每条发现标注性质：**【与文档不符】**= 实施文档已写约定但代码未落实；**【文档未覆盖】**= 文档没有约束到的新问题。

## 1. 结论摘要

文档声称的核心机制——正 PID 登记与 generation 快照、派发时捕获 stopSnapshot、代次精确注销、退出顺序、两条归属来源与根压缩、严格查询/执行/确认、权限分流与启动证明跨边界、Go 侧身份校验与句柄持有——在源码中**总体真实落地且方向正确**，未发现 generation 比较方向错误、快照提前冻结、主干空列表伪成功、跨来源时间混比、RPC 参数形状错配这类硬伤。

但存在 4 个高危、约 15 个中危问题，集中在三类系统性缺口：

1. **边界上的"假成功"**：归属证据缺失/查询失败时，个别路径仍清理 PID 文件、注销登记并报成功（H-01、H-03、M-04、M-07）。
2. **加固不一致**：超时/异常保护、严格查询只落实到部分类和部分模块，同类漏洞在未加固的副本上仍然存在（H-02、H-04、M-02、M-03、M-08、M-09）。
3. **标记粒度过粗**：Unix 侧归属标记包含模块共享根目录，正常使用场景即可跨版本误杀（H-01、M-06）。

修复优先级建议：H-01 → H-02 → H-03 → H-04 → M-01/M-02/M-04/M-06 → 其余。

---

## 2. 高危发现

### H-01【与文档不符】Unix PHP 归属标记含 `global.Server.BaseDir`，停止一个 PHP 版本会杀掉所有 FlyEnv PHP 版本

- 位置：`src/fork/module/Php/index.ts:249`（`markers = [confPath, version?.bin, version?.path, global.Server.BaseDir]`），生效于 264-275 行进程名搜索分支。
- `src/main/utils/ServerPath.ts` 中 `PhpDir = join(BaseDir, 'php')`，即每个版本的 `confPath`（如 `php/74/conf`）都以 BaseDir 为前缀。BaseDir 作为 marker 使"本版本配置标记"形同虚设，与该函数 247-248 行注释（"按本版本配置标记确认父"）和文档 5.2 直接矛盾；263 行注释"同机其他 PHP 版本不会入选"也因此不成立。
- 失败场景：macOS/Linux 上 PHP 7.4 与 8.2 同时运行（各自 FastCGI 端口，FlyEnv 正常用法）。停止 8.2 时，7.4 的 php-fpm 命令行含 BaseDir 前缀路径，命中 marker → 整树被 INT，正在服务的另一版本被误停。
- 建议：从 markers 移除 `global.Server.BaseDir`，仅保留版本专属 `confPath`/`bin`/`path`；若要覆盖"完全复用 FlyEnv 数据目录的手动实例"（文档 1.1），用版本专属目录级标记而非 BaseDir。

### H-02【与文档不符】Redis Commander 进程查询失败被吞成空列表：面板仍在却报停止成功并删身份文件

- 位置：`src/fork/module/Redis/RedisCommander.ts:260-266`（默认 `processList` 实现 `catch { return [] }`），影响 `stopOwned()`（703-721）、`waitForStopped()`、`ownedPids()`。
- 同模块 `waitForStopped` 注释明确写"查询失败不能被转成空清单"，默认注入实现却恰恰吞错；`DbGate/index.ts:154-157` 的同名单元是严格传播的，属本模块独有倒退。
- 失败场景：CIM 查询被拒绝/超时（或 Unix ps 失败）→ `ownedPids` 返回 `[]` → 跳过 kill → 仍执行 `remove(pid)/remove(port)` → Redis 整体停止报成功。面板实际仍在运行，且重试依据已被删除。
- 建议：删除 `catch → []`，与 DbGate 一致传播查询错误；open 路径如需容错应在调用点显式处理。

### H-03【与文档不符】Windows 通用 Base 停止：`version.pid` 未核实存活即并入清理集合并报成功

- 位置：`src/fork/module/Base/index.ts:432`（`removeStoppedAppPid([...targets.pids, \`${version.pid ?? ''}\`])`），配合 148-178 的目标收集。
- `version.pid` 无条件并入，不要求该 PID 已被确认停止或确认消失。若登记 PID 的进程仍存活但归属证据缺失（如服务以不含版本路径的命令行 re-exec、或传入 version 对象缺 bin/path 导致 markers 为空），`targets.pids` 为空 → `ProcessKillServiceTreesStrict([], list)` 对空集合不抛错 → `waitWindowsServiceExit([])` 立即返回 → app PID 文件因内容等于 version.pid 被删 → 发送停止成功，main 注销运行登记。结果：服务仍在运行，登记与 PID 文件均已清除，后续无法再停止。
- 对比：Unix 分支（同文件 502-505）用最终进程列表算出 `absentCandidates`，只删确认消失的 PID——Windows 分支缺这层核实。文档 1.1/5.1 的精神是"查询失败/空列表不删除 PID/文件/登记"，此边界未落实。
- 建议：Windows 分支与 Unix 对齐，只把"在最终进程列表中已消失"的候选传给 `removeStoppedAppPid`；或当活候选存在但归属证据为空且未找到任何目标时 reject。

### H-04【与文档不符】自定义模块 UI"重启"不检查前置停止结果，且全程静默

- 位置：`src/render/components/CustomerModule/List.vue:256-262`（`item.stop().then(() => item.start())`）。
- `ModuleCustomerExecItem.stop` 失败时 resolve 的是错误字符串（`ModuleCustomer.ts:86-90`），此调用点不检查返回值直接 start。`ModuleInstalledItem.restart()` 已按文档 §8.2 修复，但自定义模块没有对应 `restart()`，UI 重启按钮走的就是这个未检查路径。
- 失败场景：重启时 UAC 取消/权限拒绝 → stop 失败但仍进入 start。非独占模块 start 见 `run=true` 直接 resolve(true)，用户看到"重启完成"，旧进程带旧配置仍在跑，且无任何错误提示（`.then().catch()` 吞掉）。
- 建议：给 `ModuleCustomerExecItem` 增加与 `ModuleInstalledItem.restart()` 相同的 `restart()`（检查 stop 结果再 start），List.vue 改调它；失败字符串在 UI 层 MessageError。

---

## 3. 中危发现

### main 进程与调度层

**M-a【文档未覆盖】Temporal `startUiServer` 绕过生命周期分类器：不串行、不门禁、不 drain**
`src/main/core/ServiceLifecycle.ts:12-24` 的分类器只认 `stopService`/`startService`/`cloudflare-tunnel.start`/`open*` 前缀；`startUiServer`（`src/render/components/Temporal/Index.vue:140` 触发，`src/fork/module/Temporal/index.ts:170-187` 会产生 `APP-Service-Start-PID` 并登记 companion）返回 `undefined` 不进队列。后果：① 与 temporal start/stop 不串行，停止派发后才完成的面板启动不在停止清单内；② 退出时不被 ForkManager 门禁/track/drain 覆盖，在途 `startUiServer` 可在退出停止取登记快照**之后**才登记 companion → detached 面板进程在 FlyEnv 退出后永久泄漏。建议：把 `startUiServer` 归类为 start（或约定凡能产生 Start-PID 的命令必须匹配分类器），并加静态防回归核对。

**M-b【文档未覆盖】drain 与退出停止无超时看门狗**
`ServiceProcess.ts:231-237`、`ForkManager.ts:224-228`、`Launcher.ts:121-139`。文档 §7 声称"记录单项错误后继续退出"，但若某个已受理请求的 ForkPromise 永不 settle（模块 bug、UAC 永不结算），`drainLifecycleRequests` 永久等待 → `before-quit` 已 preventDefault → 应用无法退出，比文档描述更严重。`stopInstances` 逐项 await 同样无超时。建议：两个 drain 加总超时、单项 stopService 包超时 race。

**M-c【文档未覆盖】非生命周期 raw fork 请求退出时不 drain**
`ForkManager.ts:155-168` 只对 lifecycle 类请求 track。在途的非生命周期写操作（如 host 写配置）退出时不被等待，worker 被直接销毁，理论上有截断写风险。与文档 §4.4"等待……原始 fork 请求"的表述有差距。

### renderer

**M-d【与文档不符】`LanguageProjectRunner.ts` 是未落实任何约定的第二套项目停止入口（死代码）**
`src/render/core/LanguageProjectRunner.ts:79-104`：无 flight 共享、第一条消息（含 code=200 进度）就 `IPC.off` 再判 code、无超时。全部是文档 §3/§8.2 明确禁止的模式，§1.2 明确"没有第二套 renderer 停止入口"。当前全仓库无使用方，仅类型被引用，故列中危。建议删除或改为复用 `ProjectItem`。

**M-e【与文档不符】项目组开关停止失败被报成"成功"**
`src/render/components/LanguageProjects/ASide.vue:52-67`：组停止结果检查只找 `typeof s === 'string'`，而 `ProjectItem.stop` 失败 resolve 的是 boolean false → `find` 落空 → MessageSuccess。建议改为 `res.some(s => s !== true)`。

**M-f【与文档不符】项目"启动中"窗口内 stop 假成功**
`ProjectItem.ts:126-133`：start 飞行期间 `isRun=false`（或 code=200 已置 true 但 pid 未设置），此时 stop 命中 `!isRun || !pid` 分支直接 resolve(true) 并清状态，实际什么都没停。连带：启动中 restart 实际等于"继续旧启动"；启动中保存编辑会替换配置而旧进程仍跑。建议：stop 先检查 startOperations 飞行，await 其终态后再按真实状态决定。

**M-g【文档未覆盖】`ModuleInstalledItem`/`ModuleCustomerExecItem` 的 start/stop 无超时、flight 可永久卡死**
`ModuleInstalledItem.ts:124-167`（且 `new Promise(async ...)` 的同步异常变 unhandled rejection 且永不 resolve）、`ModuleCustomer.ts:72-98`。fork 丢失终态时 flight 永不清除，start 侧 `module.starting` 永久 true 使整个模块 UI 操作静默 no-op。`ProjectItem`（136-156）与 `CloudflareTunnel`（82-85）已加 360s 超时+try/catch，同类加固未同步到这两个核心类。建议补齐。

### fork Base 与共享执行层

**M-h【与文档不符】通用启动路径吞掉旧 PID 文件删除失败**
`src/fork/util/ServiceStart.ts:140-144`、`438-442`、`ServiceStart.win.ts:174-178` 三处 `try { await remove(pidPath) } catch {}`。删除失败时 `waitPidFile` 会读到旧 PID 当作本次启动成功，生成错误登记/停止契约。文档 2.1 明确"旧文件删除失败也在创建进程前失败"，目前只有两个 customer 入口落实了。建议三处改为删除失败直接 throw。

**M-i【文档未覆盖】`Helper.sendInternal` 密钥/连接阶段异常导致停止 Promise 永不 settle**
`src/fork/Helper.ts:354-356`：`await this.ensureKey()` 与 `createConnection(await AppHelperSocketPathGet())` 不在 try/catch 内，30s 计时器在 526 行才安装。TOCTOU（健康检查后 key 文件被删/锁）时 executor rejection 无人接收，外层 Promise 永远 pending → renderer 一直 loading、退出被拖住。同文件 401-411 'connect' 回调内异常同样未收口。建议整体包 try/catch 走 `routeUnavailableHelper` 或 reject。

### 各服务模块

**M-01【与文档不符】`helper-version-sync-test.ts` 钉值过期，版本同步保障失效**
`scripts/helper-version-sync-test.ts:8` 的 `expectedVersion = 28`，而 Go `main.go:32` 与 `AppHelperCheck.ts:30` 均为 31。已实际运行验证：脚本抛 `AssertionError: 31 !== 28`。该脚本注释自称"防止两边一起漏升"的保险，现在保险本身失效。建议改为 31，并把"升版本必须同步此钉值"写进两侧既有注释。

**M-02【文档未覆盖】Windows 端口查询两端口径不一：TS netstat 依赖英文 `LISTENING`，Go/PS 后端不过滤 Listen 状态**
① `src/shared/Process.win.ts:247` 用 netstat 输出的 `LISTENING` 字面量，本地化 Windows（如德语 `ABHÖREN`）上永远查不到监听者 → `Mongodb/index.ts:181-186` 在装有 mongosh 的非英语 Windows 上必然停止失败（MySQL/MariaDB 只是安全降级回退树杀）。② 反向问题：`src/helper-go/module/tool.go:906-933` 与 `WindowsHelperFallback.ts:1849-1850` 的 `getPortPids` 不过滤 state，TIME_WAIT/出站连接本地端口恰好等于数据库端口时会混入"监听者"，与文档 §9.10"各 Windows 停止后端统一 TCP Listen 状态"不符。建议统一改用 `Get-NetTCPConnection -State Listen` 类本地化无关查询。

**M-03【与文档不符】MySQL 分组停止缺末次退出确认，组实例命令不可读时静默空成功**
`src/fork/module/Mysql/index.ts:503-524`：Windows 分支 `ProcessKillServiceTreesStrict` 后直接 resolve，没有 `waitWindowsServiceExit`（文档 6.2"Go 根句柄确认不替代模块末次确认"；常规 `_stopServer` 有这一步）；候选只来自 COMMAND 标记扫描，组 mysqld 命令不可读时静默空目标成功，组 PID 文件 `group/my-group-${id}.pid` 也不在停止时清理。建议补 `waitWindowsServiceExit(arr)`、组 PID 文件纳入候选来源并按"活 PID 不可读即失败"处理、成功后比对内容清理。

**M-04【文档未覆盖】常规 MySQL/MariaDB 停止的归属标记无法区分同版本的分组实例（反向误杀）**
`Base/index.ts:148-178` 的 markers 仅 `version.bin`/`version.path`，分组实例与常规服务共用同一个 `mysqld.exe`。常规停止的第二来源（`_stopSearchName='mysqld'` 名搜索+marker）会把同版本分组 mysqld 确认为目标并树杀。文档 5.3 只规定了"分组停止不误杀其他组"，反向未覆盖。失败场景：常规 MySQL-8.0 与同版本 group 实例并存，停止常规服务强杀分组实例，可能损坏其数据。建议：常规停止 extraMarkers 加本实例配置文件名，并对命中 `--defaults-file=…group/my-group-` 的进程显式排除。

**M-05【与文档不符】PostgreSQL Unix 分支无条件删除共享 app PID 文件**
`src/fork/module/Postgresql/index.ts:685`（`unlink appPidFile`），对照 Windows 分支 683 行用了 `removeStoppedAppPid`（比对当前内容）。`pid/postgresql.pid` 跨版本共享：停止 PG14 期间用户启动 PG16 重写该文件，14 停止完成时把 16 的登记文件删掉。建议 Unix 分支同样走 `removeStoppedAppPid([已确认停止 PID])`。

**M-06【文档未覆盖】Base Unix 通用 marker（BaseDir/AppDir）跨版本误杀同服务其他版本**
`src/fork/module/Base/index.ts:319-327`（`ownedProcessMarkers` 含 `global.Server.BaseDir`、`global.Server.AppDir`），与 H-01 同源但影响所有走 Base Unix `_stopServer` 的模块（Redis 多版本并存、PostgreSQL、MongoDB、Memcached 等）。注意：startService 先 `_stopServer` 停旧版本依赖了这个宽标记，属版本切换的承重行为；但 UI 单独停止某版本同样误伤其他在跑版本，且与 Windows 侧（version.bin/path 精确）语义不一致。建议至少在文档中明确该语义；更彻底的是 Unix 与 Windows 对齐为版本专属标记。

**M-07【与文档不符】pgAdmin：进程 COMMAND 不可读时静默删除 PID/端口文件并报成功**
`src/fork/module/Postgresql/index.ts:184-198`、`256-283`：归属判断为纯命令行匹配，命令不可读（空串）时被当作"不在运行"，`pgAdminRunningPid` 还会直接删 PID 文件。DbGate/Redis Commander 的 runtime 在这种情况 throw，pgAdmin 没有，违反文档 1.1"活候选归属不可读不等于进程不存在"。失败场景：pgAdmin 以提权身份运行、查询读不到命令行 → 删重试依据、整体报成功，面板仍在跑。

**M-08【文档未覆盖】Temporal `StopProcessListFetch` 未导入，UI 去重检查永远失效**
`src/fork/module/Temporal/index.ts:198` 使用了 `StopProcessListFetch`，但 34 行只导入 `fetchStopProcessListLocal`，全文件无该导入 → 运行到 `isUiServerRunning()` 即抛 ReferenceError，被 189-208 行 `try/catch → return false` 吞掉，函数恒返回 false。后果：UI 已运行时再次 `startUiServer` 不复用旧实例而重复启动，`uiPidPath` 被最新实例覆盖。建议改为已导入的 `fetchStopProcessListLocal()`。

**M-09【文档未覆盖】UAC/普通 PS 非树 kill 复核与 Stop-Process 之间不持有句柄**
`src/shared/WindowsHelperFallback.ts:1924-1977`：树模式 1928 行持有 `$rootHandle` 到 taskkill 结束，但非树分支复核后直接 `Stop-Process -InputObject`（按 PID 结束），未打开句柄。复核通过后、Stop-Process 前目标自然退出且 PID 被复用时，新占用者会被按同 PID 杀死。Go 侧同类场景已通过持句柄消除，UAC/普通路径未对齐文档 §6.1"一致复核"的强度。建议非树分支同样在复核前持句柄、finally Dispose。

**M-10【文档范围外/旁路】MySQL/MariaDB 启动与维护路径把明文密码写进日志与错误对象**
`Mysql/index.ts:127`（成功日志带 `pass: password`）、`:119`、`962-993`、`1310-1317`；`Mariadb/index.ts:920-951` 同类。停止主路径已合规（execFile 数组、只记错误码），这些是启动/改密/备份旁路。建议成功日志不带 pass，catch 只记 code/errno，备份失败文本剔除命令行。

---

## 4. 低危发现（从简）

main/调度：
- L-01 `IPCHandler.ts:200-203`：UI 停止成功但 `stopSnapshotFor` 未命中（渲染层 version 携带陈旧 pid）时登记永不注销，且与 MCP 路径（`MCPTools.ts:613-619` 无条件注销）口径不一致；建议成功且无快照时按响应 PID 与当前登记精确相交注销。
- L-02 `ServiceProcess.ts:245`：`stopSnapshotFor` 的 pid 比较未做十进制规范化（`'00123'`/空白失配）。
- L-03 `MCPTools.ts:589`：MCP `addPid` 丢弃 companion 标记（当前无实际影响，与 IPC 路径对齐即可）。
- L-04 `Application.ts:299-333`：插件停用遇首个失败实例即中断，剩余实例不再尝试——与退出遍历"单项失败继续"风格不同，建议确认是否刻意设计并在文档写明。
- L-05 `ServiceProcess.ts:175-200`：`delPid`/`delByBin`/`delAll` 无调用方、无 generation 保护，建议删除或标注禁用于停止消费路径。
- L-06 `ForkItem.ts:113-121`：`windowsPrivilegeBridge.handle` 未包异常。

renderer：
- L-07 `ModuleInstalledItem.ts:177-206`：`serviceDo` 早退分支不 resolve；忙卫对非独占模块误伤（版本 A 停止中时点版本 B 停止被静默丢弃）。
- L-08 `Project.ts:310-329`：`delProject` 不等待停止结果即移除项目（stop 失败时 UI 失去入口，仅靠退出兜底）。
- L-09 `ProjectItem.ts:118-120`：stop 的 finally 缺 identity 检查（其余三处 flight 都有）。
- L-10 `CloudflareTunnel.ts:38-49`：`fetchTunnel` 第一条消息即 off 且不分辨 code（当前 fork 只回终态，风险低）。
- L-11 多处 code=200 进度即置运行标志（`ModuleInstalledItem.ts:101-107`、`ProjectItem.ts:235-239`、`ModuleCustomer.ts:156-160`）：是 M-f"启动中 stop 假成功"窗口的成因之一，建议进度事件只更新 UI 提示。
- L-12 `mcpServiceStatus.ts:46-58`：MCP 状态广播空列表会覆盖刚恢复的 run/pid（信任边界外沿）。

fork 共享层与模块：
- L-13 `src/shared/Process.ts:214`：Windows 归属标记为大小写/形式敏感子串匹配，不处理短路径与斜杠差异（PostgreSQL 已做规范化，通用层没有）。
- L-14 `src/fork/util/ServiceStart.ts:480`：.ps1 分支 shell 回退裸 `powershell.exe` 名字（项目/自定义双层路径已合规，此分支是另一条路径）。
- L-15 `Base/index.ts:284-289`：`removeStoppedAppPid` 对空内容文件直接删除，可能删掉另一实例刚创建尚未写入的 PID 文件。
- L-16 `Process.win.ts:121,153` 与 `src/fork/Helper.ts:274`：调试日志打印完整进程项（含命令行可能带口令）/每次 send 打 console.trace。
- L-17 `src/fork/module/Tool.win/process.ts:9`：注释称不吞查询错误，底层 `ProcessListSearch` 实际 catch 返回 []（文档 8.4 允许显示 API 不同处理，仅注释与行为不符；`Process.win.ts` 侧同）。
- L-18 多个模块停止后不清理模块 PID 文件（stale 残留）：`Php.win`（`php{num}.pid` 等）、`Redis`（`redis.pid`）、`Mysql`/`Mariadb`（`mysql.pid`/`mariadb.pid`，Base Windows 分支本来会做）；当前下游对 stale PID 容错，但与 Base 自身行为不一致。
- L-19 `Mysql/index.ts:88-93`：`_initPassword` 端口解析失败回退 3306（启动路径），与停止侧"不猜默认端口"不一致。
- L-20 `Neo4j/startup.ts:31-41`：`exactOptionPathMatches` 只识别 `--home-dir=value`，不识别空格分隔形式（当前 launcher 用 `=`，属健壮性缺口）。
- L-21 `Base/index.ts:471-485`、`Php/index.ts:265-272`：Unix 名搜索候选中 COMMAND 不可读的进程被静默跳过（Base 487 行的 throw 实际不可达）。
- L-22 `CloudflareTunnel/CloudflareTunnel.ts`（fork 侧）：停止成功后不删 `{id}.pid`（下次启动会删）；`stop()` 在 `!this.pid` 时静默成功。
- L-23 `Mongodb/index.ts:179`：配置缺 `net.port` 时默认 27017（有监听者归属兜底，风险低）。

Go/契约：
- L-24 `src/helper-go/contract/helper-contract.json:143-150`：`getPortPids` 标记 `"platform": "unix"`，但 Go 全平台分发、TS 在 Windows 调用（检查脚本不校验该字段，建议改 `"all"`）。
- L-25 `src/fork/Helper.ts:224-263` 与 `main.go:876-890`：Windows 无权限 provider 时树 kill 以 3 参发送会被 Go 误解析为 identities（当前 main/fork 均注册 provider，不可达，属健壮性隐患）。
- L-26 `tool.go:795-829`：killPorts Unix 分支对完全不含 `(LISTEN)` 的畸形输出当"无监听者"成功（触发概率很低，可与 GetPortPids Unix 分支的逐行严格校验对齐）。
- L-27 两执行后端 taskkill 非零处理策略不同：Go 树模式全句柄 signaled 即幂等成功，UAC PS 树模式非零一律失败；终态由模块末次确认兜底、结果等价，建议文档补一句说明此分歧是有意的。

---

## 5. 核对无误的关键点（抽样）

以下文档约定经逐文件核对确认已落实，未发现问题：

- 只有 code=0 终态建立运行登记，code=200 仅进度；登记 PID 正安全整数、-1 不登记不生成契约（fork 与 main 双侧独立校验）。
- generation 递增、实例与停止参数深拷贝；stopSnapshot 在队列真正派发时捕获；带明确 PID 只查该 PID；成功回包只清快照匹配代次、fork 返回 PID 与快照相交、原父自然退出仍注销旧根代次、新登记不被旧终态删除、失败不注销。
- 退出顺序与文档 §4 一致：共享退出 Promise → beginShutdown → 同步关两层入口（ALS 许可、遗留回调不能继承）→ 双 drain → ServerManager 统一停止（无第二遍遍历、明确 code=0、单项失败保留继续）→ fork 销毁 → hosts 清理 → 最后 dispose 权限协调器。
- 模块级串行队列前序失败不阻塞后续、无卡死路径；ForkManager 不按当前登记重写 stop 参数；MCP stop_all 含 companion 逐项 stopped/failed；切版本前置停止失败立即中断不改 current。
- companion 登记但展示过滤；DB 真实 PID 不被面板 PID 覆盖；DNS/FTP pin/unpin 跟随成功终态、不做 OS kill。
- 三个 WeakMap flight 都在状态检查之前查表，"临时 run=false 时第二次调用提前成功"已堵死；独占切换/项目编辑检查前置停止；code 语义方向安全（只认 code===0 为成功）。
- 根压缩有环保护、"非空集合压成零根"抛错；候选父 COMMAND 不可读报错、无 EXE 相同补认、无第三来源全扫；停止后用 `fetchStopProcessListLocal` 新鲜列表确认，provider 失败回退本地再失败传播。
- Unix TERM→等待→INT 保留、部分 ESRCH 继续、无自动 KILL；父缺失留历史 PPID 子孙双平台均显式拒绝。
- 权限分流不误归类：引导脚本沿异常链区分 PermissionDenied 与真实失败，"identity changed" 不当权限不足，已管理员不重复 RunAs；时间比较同来源（CIM↔CIM、StartTime↔StartTime）不混比；启动证明经 AsyncLocalStorage 跨边界、UAC/Helper 执行前同来源复核、树模式持句柄到 taskkill 结束。
- 端口：killPorts 执行前重查监听者拒绝快照外新占用者；Get-NetTCPConnection 仅特定 NotFound 算空；netstat 畸形行报错；Unix lsof 退出 1 双空才算无匹配。
- waitPidFile 空内容预算内重试、错误日志调用禁用重试；customer 入口旧文件删除失败在创建进程前失败；Windows 项目/自定义包装进程双层共用已验证 PowerShell 绝对路径。
- MySQL/MariaDB 停止主路径（绝对 admin 程序、execFile 数组、端口不猜 3306、唯一监听者归属、交集不扩大、不记带密码对象）合规；PHP.win spawner/孤立 worker/双重确认合规；MongoDB 先停 DbGate、监听者全属目标、缺 mongosh 才回退、退出不下载合规；PostgreSQL Windows DATA_DIR/-D 精确比较/失败传播合规；DbGate flight 互等无循环、成功后清文件合规；ClickHouse/Neo4j/Temporal UI/N8N/Cloudflare 归属规则合规；项目/自定义创建身份验证、日志不展开环境/密码合规。
- Go 侧：RPC 参数形状四方一致（contract/Go 解析/TS 包装/快照来源）；空 identities 不能绕过；身份校验完整（字段/范围/重复/数量/来源/路径）；TOCTOU 主路径正确（先 OpenProcess 后校验、句柄 defer 到执行结束、/T 仅树模式）；taskkill 非零幂等判断方向正确；系统保留 PID/Helper 自身/关键系统程序拒绝；Unix 查询执行错误传播；版本号主体一致（Go=TS=31）；双平台编译通过；未构建新二进制的风险说明齐全，运行时版本比对会拒绝旧 Helper。

## 6. 后续建议

1. 按第 1 节优先级修复高危项；H-01/H-02/H-03 均可模块内局部修复，不影响文档既有架构约定。
2. 实机验收清单（文档 §10）建议补充：Redis Commander 查询被拒场景、Unix 双 PHP 版本并存停止、双 Redis 版本并存停止、非英语 Windows MongoDB 停止、常规 MySQL 与同版本分组实例并存停止、Temporal 面板打开中退出、drain 悬挂（模拟不返回的模块请求）、`helper-version-sync-test.ts` 纳入 CI。
3. 修复后同步更新实施文档 §9"整理时发现并修正的遗漏"与相关注释（如 `Php/index.ts:263`、`RedisCommander.ts` 注释与实际行为相反的表述）。

## 7. 实施回执（2026-10-03）

本节保留审核原文，补充源码修复结果与澄清；行号以当前源码为准。完整理由、文件清单、链路和限制见 [实施文档第 11 节](windows-service-stop-implementation.md)。本轮没有新增/运行测试、类型检查、构建、格式化或实机操作；审核原文的旧测试/编译结果不能证明本轮改动。

### 高危项

- H-01：PHP Unix 去除跨版本 BaseDir marker，保留版本配置/路径和 macOS 标题匹配。
- H-02：RedisCommander 默认查询改为严格新鲜查询；失败传播，不再 catch 成空列表后删文件。
- H-03：Base 活登记根未通过本次归属时明确失败；不会以空成功注销。文件清理以实际停止/末次已消失 PID 和当前值为准。
- H-04：自定义列表重启等待 stop，且只有 `true` 才 start；删除也受真实停止结果约束。

### 中危项

- M-a：Temporal startUiServer 加入统一生命周期分类/队列/drain；旧分组命令也纳入兼容分类。
- M-b：用户服务操作含排队与各 fork 服务请求均最多六分钟；退出每层 drain 三十秒。超时撤销许可、退休 worker、结算未知结果，已登记实例继续逐项停止。
- M-c：全部 raw fork 请求参与退出在途跟踪，包含 hosts/配置写入；关门后拒绝新 raw 请求。未知写入不自动重放。
- M-d：移除未使用的 LanguageProjectRunner 第二套启停实现，仅把需要的类型留在项目模块。
- M-e：项目组只把全部 `true` 判为成功，boolean false 也算失败。
- M-f：项目停止先等待启动终态，再取实际 PID 停止；编辑/重启复用这个入口。
- M-g：安装项/自定义对象的传输终态等待、同步异常和监听清理统一收口，重复请求共享 flight；进度不设置运行成功。
- M-h：三处通用启动入口严格删除旧 PID 文件，失败在创建新进程前传播。
- M-i：Helper 密钥、socket/connect、签名和发送异常统一收口并有初始化时限；已发送后的丢响应/timeout 不向备用后端重放。
- M-01：Go/TS 及原独立版本断言同步为 **32**，两侧注释写明更新要求。没有运行断言脚本或构建新二进制。
- M-02：监听专用路径改 PowerShell State 枚举，去掉活动路径的英文 netstat 依赖。澄清：通用 getPortPids 保留各 TCP 状态，停止使用独立 Listen 查询；合法通用 PID 0 跳过，停止不得选 PID 0。
- M-03：组私有 PID 与实际登记 PID 都纳入严格父核验，停止后确认整份原树并按当前文件值清理。同时补真实启动 PID/Stop-Args，UI 改走通用 startService/stopService，退出能发现组实例。
- M-04：普通 MySQL/MariaDB 用精确 defaults-file 的 AND 根条件排除同安装组服务，Windows 与 Unix 均落实；不是增加一个 OR marker。
- M-05：PostgreSQL Unix 共享 app PID 文件按已确认 PID/当前文件值清理，保留其他版本记录。
- M-06：Base Unix 去除全局 BaseDir/AppDir；用版本专属 marker。PostgreSQL 本身有专用停止，不全部依赖 Base，原影响范围表述需按实际覆盖判断。
- M-07：pgAdmin 活候选 COMMAND 不可读/归属未知明确失败，保留文件供重试。
- M-08：Temporal UI 使用已导入的新鲜进程查询，去重读取/查询失败传播，不变成未运行。
- M-09：普通/UAC 非树停止也在复核前持原目标句柄，finally Dispose；身份查询的辅助 Process 对象同样释放。
- M-10：MySQL/MariaDB 启动/改密/备份日志和错误不展开密码或带 argv 的错误对象；MySQL 初始化密码配置端口无效时失败，不猜 3306。

### 低危项

- L-01：UI/MCP 无根快照时用派发代次快照与返回 PID 相交注销。澄清原 MCP 也依赖快照，不是无条件注销；没有采用“响应与当前登记直接相交”的建议，以保护新代次。
- L-02：stopSnapshot PID trim/十进制规范化，明确 PID 未命中不退回 bin。
- L-03：MCP 启动登记传递 companion 标记。
- L-04：插件停止逐项收集错误，继续其他实例；仍有错误/登记则阻止卸载。
- L-05：删除无调用方的 delPid/delByBin/delAll，停止消费只走代次保护。
- L-06：权限 bridge 同步异常触发真实 worker 收口并结算等待请求。
- L-07：serviceDo 早退明确结算；stop 不被模块另一版本的 busy 丢弃为成功。
- L-08：删除项目先 await stop，失败保留项目入口。
- L-09：stop flight finally 按 Promise 身份检查后删除。
- L-10：隧道 fetchTunnel 只在终态移除监听，有时限和同步异常处理。
- L-11：进度 code=200 只作中间事件，成功终态才更新 run/PID。
- L-12：状态广播与 IPC 终态共用 revision；本地在途空广播不覆盖，旧广播拒绝。
- L-13：Windows marker 规范大小写/斜线，仍要求非空命令行证据；无法解析的短路径安全拒绝，不借 EXE 补认。
- L-14：通用 .ps1 启动使用已验证系统 PowerShell 绝对路径；同步启动异常不泄漏父方日志句柄。
- L-15：空共享 PID 文件保留，不删除其他实例尚在写入的中间态。
- L-16：移除完整进程项/逐调用 trace 日志。
- L-17：Windows 工具入口显式先取严格列表，再做兼容显示搜索；底层真实查询失败不能空成功。
- L-18：模块私有 stale PID 文件在确认已退出且当前内容匹配后清理；查询/停止失败保留。
- L-19：MySQL 初始化密码配置端口解析失败不猜 3306。
- L-20：Neo4j 完整目录参数支持等号与空格形式，Unix 不忽略大小写。
- L-21：明确 PID 的活候选 COMMAND 不可读严格失败；没有 COMMAND/EXE/登记的无名进程无法按服务名归属，保留无法安全恢复的限制，不全局拒绝每个无名系统进程或按 EXE 补杀。
- L-22：隧道内存 PID 缺失时查私有 PID 文件；停止确认后删当前匹配记录，失败保留。
- L-23：保留 MongoDB 合法缺省端口 27017；全部监听者属于目标树才原生 shutdown。此项澄清并保留保护，未改成无 port 就拒绝合法默认配置。
- L-24：getPortPids 契约 platform 改为 all。
- L-25：Windows 无权限 provider 的树 kill 明确拒绝，不发送歧义三参数；生产 provider 路径保持原协议。
- L-26：Unix 监听输出严格查询/解析，非空畸形结果不视为零监听；lsof 仅退出 1 且双空输出可当无匹配。
- L-27：保留 Go“全部原句柄已退出可接受 taskkill 非零”与 PowerShell 更严格传播非零的差异，在实施文档解释；模块最终原树确认仍不可省略。

额外集成修复：MySQL 组停止绑定自己的真实 PID/配置键，避免 UI 无 PID 时误命中普通服务登记；MCP 普通切版本不顺带关闭独立组，组状态由 MySQL 模块按配置键消费广播。普通安装项总预算同时释放模块锁、撤销迟到前置步骤的状态提交；项目/自定义密码提示等待仍无自动取消时限。源码静态复核完成后仍需实机验收，尤其非英语 Windows、双版本/多实例、迟到回包、初始化错误、UAC 取消和完整 PHP worker 回收。
