# Windows 服务写入环境变量链路诊断

当前广播脚本仅执行通知，不再直接写入子进程细分日志；fork 外层的启动、错误和退出诊断继续保留。下方历史样本中的 `[WindowsPath][broadcast]` 记录用于解释当时实现，当前行为以文末最新调整为准。

## 实施契约

- 入口沿用 ServiceActionStore.updatePath：组件只触发操作，现有单例持有按 bin 的重入保护、IPC 回调、通知和监听清理。此次只增加观察，不新增配置、store 或操作控制器。
- main 保留现有 IPC 分派和 worker 选择；fork Tool.win 拥有目录、junction、系统 PATH 的计算和提交；权限协调器拥有方式选择和执行租约。
- 开始事件为 renderer 发起 updatePATH/removePATH；中间事件包括传输、模块加载、路径准备、系统快照、权限执行和刷新；终态仍由原 code=0/1 决定。重复请求、页面离开、服务运行状态均保持既有行为。
- 诊断日志是附加动作：不等待磁盘，不引入查询、重试或授权，失败不能影响写入结果。必要的读取、校验、提交仍保留原失败传播；已有附加动作的处理也不借本次诊断改写。
- 本次不新增或运行测试，不执行真实系统 PATH 写入。记录静态检查结果，并由实机 UI 操作日志确认耗时。

## 链路和已有等待

1. 服务扩展操作调用 `ServiceActionStore.updatePath`，按当前 appPath 判断添加/移除，向 `app-fork:tools` 发送版本快照和模块标识。
2. IPCHandler 更新全局配置，ForkManager 选择空闲 worker 或新建，ForkItem 发送初始化和命令。冷 worker 还需要加载运行时及 Tool.win 依赖。
3. updatePATH 准备 env 目录，读取旧 junction，移除旧映射，探测卷格式，建立并核对新 junction。Composer 还准备启动器；部分模块生成 HOME 变量。
4. 读取未展开的机器 PATH：先同步环境缓存，再执行普通权限 PowerShell 读注册表；必要时回退 reg.exe。合并 FlyEnv 路径并保留其他 PATH 项。
5. Helper.send 导入公共权限路由，验证动作并探测当前令牌。管理员直接执行；普通账户解析用户选择的 UAC/Helper，等待租约，执行写入。权限路由、旧 fallback 与 Go Helper 只返回提交结果，不提前广播；BaseManager 不参与环境通知。具体业务方法记录已明确成功的写入。
6. writePath 在 setSystemPath 调用成功后立即撤销本地环境缓存并登记共享失效，不主动同步或等待失效回执。单变量 FLYENV_ALIAS 在 setAlias 的 setSystemEnv 调用成功后同样处理。PHP 还动态导入 Php.win 并处理 ini，然后重新读取、扫描 PATH，生成返回列表；真正需要环境快照时 sync 等待已登记的失效再获取。
7. updatePATH/removePATH、工具保存、alias 或 Android PATH 修复先 resolve/reject，再在 finally 中为已成功写入安排通知。下一轮事件循环启动普通权限广播进程，不等待启动、退出或 native 广播结果。renderer 按原终态回包更新展示并提示；Windows 的本地目录记录及环境变量工具列表刷新在后台继续，不是本次写入的完成条件。业务结算不等于 renderer 已收到回包。

已有测试中，卷查询、PowerShell/broker 启动、RunAs 以及环境刷新都曾耗时；这些只能说明需要观察的位置，不能证明当前慢操作的原因。尤其 `path.php-ini` 原先不包含 Php.win 动态导入，真实冷加载成本可能落在两个计时点之间。

## 本次代码改动和理由

- `src/shared/WindowsPathDiagnostics.ts`：Windows 工具命令白名单、每请求 AsyncLocalStorage 范围、绑定回调的非阻塞 logger。复用 rendererKey/requestKey，不建立新的业务 ID、缓存、业务 IPC 请求或配置。日志观察器自动接入正常 UI；读列表、移除、工具内保存也使用相同阶段。
- `src/shared/WindowsPrivilegeTiming.ts`：增加观察器组合接口，保留已有测试观察器及其时间原点。单个观察器失败不会影响其他观察器或业务；测试脚本原有阶段继续有效。
- `src/main/core/IPCHandler.ts`：为 PATH 分派绑定 renderer 的 IPC key，记录 main 开始与回包耗时。权限交互意图、错误回包和业务参数保持原逻辑。
- `src/main/core/ForkManager.ts`：记录实际 worker 选择状态/用时；将 Windows 环境协调器已有缓存事件写入 debug log，标明 UTC、revision、命中/合并/抓取耗时。协调器可以被多请求共用，因此它是独立的全局观察日志，不冒充某个 PATH 请求的专属查询。
- `src/main/core/ForkItem.ts`：绑定 PATH logger，记录重建、初始化、命令发送、成功/失败终态和 worker 退休。main 的这一行同时包含 rendererKey 与后端 requestKey；后端可据此关联。初始化原消息只增加固定命令名诊断字段 `ForkPathCommand`，命令参数和公开插件接口不变。
- `src/fork/runtime.ts`、`src/fork/BaseManager.ts`：从收到命令起启用观察范围，覆盖 Tool.win 动态导入、init、业务调用及终态；初始化/下一轮探针绑定原请求。成功/失败仍由原 ForkPromise 结算，不将 manager.exec 返回当作写入完成。新增 PATH 日志不复制自由错误文本。复查时修正外层异常回包使用被 exec.shift 修改后的 args[0] 的问题：派发前保存真正的 IPC key，模块导入/初始化失败才能回到正确请求，不留 UI 一直等待。
- `src/fork/module/Tool.win/path.ts`：补上 junction 复查、卷探测模块导入、Composer 准备、PATH 冲突重试、PHP 模块导入和列表文件系统扫描等缺失计时。保留原操作顺序和 compare-and-set 重试条件；不增加磁盘扫描。计数、卷探测结果及配套变量键名用于理解分支，不记录环境值。
- `src/fork/util/PATH.win.ts`：记录提交数量和 compare-and-set 是否开启；复用已有 spawn 计时回调，区分 PowerShell/reg.exe 启动和进程关闭。原 UTF-8 读取、完整系统程序路径、reg.exe 回退均保留。
- `src/fork/Helper.ts`：分开权限路由冷导入、Helper 健康检查、密钥/管道地址读取、连接、请求发送及响应终态。绑定原请求上下文，不打印密钥、签名、socket 地址和 RPC 参数。Helper 分支总体耗时仍包含 main 的准备/租约与 Go 内部执行，不能将其报告为纯注册表写入时间。
- `src/shared/WindowsPrivilegeOperation.ts`：记录管理员/机器写入分流和已选方式，区分写入完成与环境刷新；管理员分支也补齐失效/刷新阶段。验证、授权和错误分类不变。
- `src/shared/WindowsElevation.ts`：把 actionId 和已存在的 broker/launcher/action 阶段关联到 PATH 请求；回调绑定原范围，迟到结果不串请求。RunAs 时间包含系统启动和用户确认，不等于 UAC 窗口的显示延迟。
- `src/shared/WindowsHelperFallback.ts`、`src/shared/WindowsActionStage.ts`：最初诊断改动增加原值核对、注册表写入、配套变量、广播编译/执行阶段；旧独立 fallback 默认关闭 action 阶段。那一轮没有修改 Go。文末后台化改动新增通知启动阶段并将 Go/应用端版本同步提升至 36。
- `src/shared/EnvSync.ts`、`src/fork/EnvSyncClient.ts`：区分本地缓存命中、共享进行中的查询、provider 等待、本地回退，以及环境 IPC 的发出/返回。只记录 revision/requestId，不传新的 IPC 诊断协议或环境内容。
- `src/render/components/ServiceManager/EXT/store.ts`：记录用户请求到终态、成功提示及后台本地目录记录/环境列表刷新。通过现有 debug.log 写日志，不 await，不改变写入完成条件。后台存储失败只记录本步骤。

## 怎么读取实机日志

1. 正常启动 FlyEnv，在服务列表操作添加到环境变量；可以随后移除并再次添加，用来比较冷 worker 和可复用 worker。
2. 日志仍写到系统 TEMP 下的 `flyenv-debug.log`，本机目前为 `D:\Temp\User\Temp\flyenv-debug.log`。新增主要前缀是 `[WindowsPath][renderer]`、`[WindowsPath][diagnostic]`、`[EnvSyncCoordinator][diagnostic]`。
3. 先用 rendererKey 找 main 日志，从 `fork.main-dispatch-begin` 获取对应 requestKey，再查看整个 fork 范围；action.transport-stage 同时带 actionId，可与旧权限日志核对。
4. 依据 `at` 排序事件，不能依据异步落盘行号；同一范围的 sequence/elapsedMs 辅助确认顺序。子进程 `sourceAt/sourceElapsedMs` 属于它自己的时钟，收到阶段结果可能晚于实际发生。
5. `kind=start/end` 的 durationMs 为该步骤用时。父步骤包含子步骤，不能把所有 durationMs 相加；例如 path.commit-system-path 已包含权限排队、动作及刷新。历史 action.execute 包含过广播等待或通知启动；当前 UAC 写入脚本只提交注册表，具体业务方法在结算后安排后台通知。
6. `path.system-write-completed` 与 `renderer.success-notice` 区分提交动作和完整回包；后台 envPathList 拥有独立 requestKey，不计入成功提示之前的总时间。PHP 的导入成本查看 path.import-php-module，不能只看 path.php-ini。

## 复查边界及待确认点

- 新日志不新增查询、延迟等待、重试、排序、UAC/Helper 安装或强制刷新。已有冲突重试只有原值变更才发生，并记录 attempt。
- logger 捕获上下文后用于 EventEmitter/环境 IPC 回调；两个并发操作不能借用对方的 requestKey。worker 退出/退休有明确终态观察，缺少正常终态不能解释成写入成功。
- 新增日志不展开 PATH、用户环境值或执行脚本；既有 console/error 日志未在本次大范围重写。logger 的失败处理不会改变操作结果。
- 最初诊断改动只拆分广播观察。文末后台化保留 5000ms 的 SendMessageTimeout 通知语义，但把编译和等待移出写入结果链路。
- 原路由在实际动作完成后等待环境刷新；原列表刷新/导入异常仍可能使请求失败。注册表写入已发生但后续失败时，应对照 action.path.registry-write-end 与失败阶段判断，不能自动重放写入。后续优化应按这些证据处理附加动作边界。
- 原一次性 action 阶段通过已存在的结果回传，失败也携带已到达阶段；没有收到可信结果时保留未知，不把诊断消息作为执行成功的证据。
- 没有真实 UI 日志，暂不认定某一阶段为本轮慢操作的原因，也不声称性能已经改善。

## 静态检查

17 个涉及 TypeScript 文件的语法解析无错误，`git diff --check` 通过（只有工作区既有换行符提示）。未运行功能测试、完整类型检查、构建或真实系统写入；这些检查不证明实机性能或权限行为已通过。

## 2026-10-04 20:32 实机日志

日志文件 82175 字节，最后修改时间 20:32:38；包含一次 PHP updatePATH 及其后台 envPathList。主请求 requestKey 为 `NMjesjuSF91I6sAlxBBwP6YgGmnAy2oG`，动作 actionId 为 `42f649ca-dc81-444d-a823-263b61c22933`。

- 用户请求 20:32:24.180 发出，20:32:38.368 显示成功，renderer 记录总时间 14189ms；main 请求终态 14174ms，code=0。只有一次 PATH 构建 attempt，无冲突重试。
- worker 已存活约 154 秒，workerLoading=false；Tool.win 解析/初始化均约 0ms，收到 fork 命令约在请求后 32ms。此次没有新建 worker 等待。
- 卷格式查询 1156.090ms；首次系统 PATH 快照 245.836ms，重建条目 219.920ms；令牌探测 242.348ms。权限选择约 2ms，租约排队 0.733ms。
- UAC broker 准备 1450.493ms，其中 Node spawn 到 spawned 764ms，broker 编译 240.622ms；20:32:27.589 发起 RunAs，即请求后约 3.41 秒。RunAs 返回耗时 2688.395ms，包含用户确认及 Windows 启动，不能据此计算 UAC 窗口实际显示时点。
- action.execute 合计 6671.903ms。使用管理员动作自身 sourceElapsedMs 相减：原 PATH 核对 11.712ms、实际注册表写入 4.438ms、配套变量/标记处理 15.283ms、广播类型编译 156.997ms、环境变更广播等待 **6422.321ms**。
- 原注册表 PATH 在 20:32:30.975 已写入，广播到 20:32:37.571 才结束；path.system-write-completed 是整个 action 返回后的时点，不能把这一行当作实际 SetValue 完成时点。
- action 返回后环境缓存刷新 412.682ms；main 抓取 410ms、419 个变量。PHP 模块导入 10.959ms、ini 处理 0.721ms；最后 PATH 列表刷新 253.500ms。
- 成功提示后的 envPathList 请求 443ms，包含 PATH 读取约 412ms、展示转换约 18ms；本地目录记录约 90ms，均在成功提示之后，不属于前面的 14.19 秒等待。

此轮最大等待已经明确发生在环境变更广播，约占用户等待的 45%。调用使用 HWND_BROADCAST 和 5000ms 参数；该超时属于每个接收窗口，不能描述为广播总等待上限。微软 [SendMessageTimeoutW 文档](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendmessagetimeoutw) 明确说明广播总等待可能累计。当前日志没有逐窗口信息，也未记录该 API 返回值，不能断言是哪个窗口超时。

后续优化优先考虑解除环境广播对写入回包的阻塞、控制广播等待并隔离附加通知失败；其次是卷查询的 PowerShell 成本。写入和刷新成功均有实机证据；本节只记录分析，未修改运行行为。

## 环境广播后台化：实施契约

用户明确要求环境广播不阻塞、不依赖返回结果；卷查询保持原实现。本次主操作仍由既有 renderer 单例、fork 工具及权限执行器拥有，注册表写入成功才安排广播。写入失败照常返回失败；广播启动、执行、日志失败均属于附加动作，不改变写入终态，不重放写入、不再次提权。

- UAC、管理员直执行、旧脚本回退共用通知脚本生成器：启动一个只发送固定 Environment 通知的独立隐藏 PowerShell 进程，随后结束写入 action。子进程不读取业务 PATH、环境值或权限管道，不依赖页面、worker 或一次性 action 的存活。
- 程序位置由当前 PowerShell 的绝对 `$PSHOME` 确定；固定通知脚本使用 UTF-16LE EncodedCommand，不搜索 PATH、不生成临时脚本。标准输入输出独立重定向并释放，避免广播子进程继承 action 运输句柄而延迟关闭。
- Go Helper 拥有一个后台通知 worker：非阻塞投递；最多保留一个待执行通知。运行中的通知之后若还有写入，安排下一次通知，避免遗漏最新写入，同时限制并发广播线程数量。
- 开始事件是注册表提交成功后的通知安排；中间事件是启动、编译、广播；后台终态只进入诊断日志。重复写入遵循原业务重入保护，广播本身无需 UI 状态或新增 IPC。服务进程生命周期不参与此次修改，不新增 store、配置或模块边界例外。
- 静态复核覆盖各写入调用点、后台资源生命周期、中文路径编码、失败隔离和 Helper 版本同步；本次不新增/运行测试，不执行真实系统写入或广播。实机操作需确认写入回包先于后台广播结束。

## 后台化代码与边界说明（第一轮，启动仍在 action 内）

- `WindowsHelperFallback.ts`：PATH 提交与单变量写入共用 `buildNotifyEnvironmentChangedScript`，因此服务添加/移除 PATH、环境变量工具、UAC、管理员直执行和旧独立 fallback 均覆盖。注册表校验、写入、配套变量失败仍向主流程传播；通知安排单独使用 try/catch/finally。后台进程不生成业务结果，不持有 action 的认证通道，也不等待退出。父进程只承担 Process.Start 的启动成本，广播编译和窗口等待不再进入 action.execute。
- `WindowsActionStage.ts`：新增固定 `notify-launch-start/end/failed` 白名单；保留旧编译/广播阶段用于阅读历史日志。action 的通知启动日志继续通过已有诊断运输，不能把 launch-end 当作所有桌面应用已更新环境。
- `helper-go/module/tool_windows.go`：固定后台 worker 与容量 1 的待处理队列，投递没有磁盘操作或 native 等待。同步原生广播在 worker 内进行；DLL 找不到、编码失败、调用异常只记录后台阶段。UTF-16 字符串缓冲通过 runtime.KeepAlive 保留至调用结束，避免 LPARAM 转换成 uintptr 后失去存活保证。Helper 退出时队列随进程消失，通知不作为退出前必须完成的任务。
- `helper-go/module/tool.go`：两个写入入口明确在注册表成功后调用非阻塞通知；结果只取决于核心写入，不增加通知 RPC 或返回字段。非 Windows 空实现保持原行为。
- `helper-go/main.go` 与 `AppHelperCheck.ts`：版本从 35 同步至 36，旧 Helper 仍同步等待广播，必须由现有版本检查和更新流程替换。此次修改的是源码版本；尚未构建发布二进制，发布时各平台产物及 Windows 主备文件须同步更新。

后台仍调用 SendMessageTimeoutW，而不是直接改成 SendNotifyMessage/PostMessage：WM_SETTINGCHANGE 携带 Environment 字符串指针，低于 WM_USER 的异步消息不能随意传递这种指针，见微软 [SendNotifyMessageW 文档](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendnotifymessagew)。独立进程/后台 worker 内同步调用既保留字符串生命周期，又解除业务等待。广播不负责更新 FlyEnv 自身环境缓存，既有 EnvSync 失效与刷新流程继续执行。

### 日志阅读与实机观察

- UAC/管理员的 action 日志观察 `action.path.notify-launch-start/end/failed`，两个启动阶段的 sourceElapsedMs 差值仅为安排后台进程的用时。
- 子进程追加 `[WindowsPath][broadcast]`：compile-start/end、broadcast-start、broadcast-returned 或 failed；记录 UTC、子进程 PID、父 action PID 与子进程内耗时。父 PID 可对照原 actionPid 关联。UTF-8 日志地址取原 FlyEnv 用户 TEMP，中文目录不依赖控制台代码页；文件不可写仅丢失观察，不改变操作。
- Go Helper 的 `[WindowsPath][helper-broadcast]` 记录 prepare-start、broadcast-start/returned 及异常阶段，在 Helper 的既有日志位置写入。队列合并意味着通知数量可以小于写入请求数量，不应将其视为丢失业务请求。
- returned 仅说明原生调用已返回，不表示每个窗口都收到通知；无需其结果来判断 PATH 写入。通知失败时已有程序可能稍后才更新环境，写入已经成功，不自动重试提交。
- 实机应对照“成功提示/写入回包”和后台 broadcast-returned 时间，确认两者已解除依赖。前轮 6.42 秒的广播等待有日志证据，但本次真实减少多少仍需新的操作日志，不能直接承诺固定节省时间。卷查询没有改动。

### 本轮静态复核结果

3 个涉及 TypeScript 文件的语法解析通过；生成的通知启动脚本（开启/关闭诊断两种）和后台通知脚本通过 PowerShell Parser 语法解析，均未执行。Helper 两端源码版本确认为 36/36，涉及文件的 git diff --check 通过。核对既有 broker/RunAs 链路未发现清理通知子进程的 Job Object 或树停止，父 action 等待退出的行为无需调整。未运行功能测试、Go 编译、完整类型检查、构建或真实环境广播；静态结果不证明实机桌面通知已送达或性能已验收。

## 2026-10-04 21:22 实机日志：后台化后的结果

日志 81216 字节，最后修改时间 21:22:13，包含一次 PHP updatePATH 及成功后的 envPathList。主请求为 `8PHIqGYuAKdcxzr3Lw5Wifl5fgeXxSWk`，actionId 为 `63fa9030-d1d8-4580-baf0-a3bab8e12435`，方式为 UAC；本轮不覆盖 Go Helper 分支。

- 主请求 21:22:02.390 收到，21:22:11.950 提示成功，renderer 总耗时 **9560ms**，main 总耗时 9547ms，code=0，无失败或重试。与前轮 14189ms 相比，此次样本少 4629ms；UAC 确认和广播时长存在波动，不能将差值都归为固定优化收益。
- 复用已存活 43 秒的 worker 19620，模块解析约 1ms，没有 worker 重建等待。卷查询 1133.588ms、PATH 快照 241.768ms、条目重建 220.155ms、令牌探测 246.781ms；卷查询与前轮接近。
- broker 准备 1462.279ms，其中 Node spawn 约 761ms、编译 251.440ms；21:22:05.770 发起 RunAs，即请求后约 3.38 秒。RunAs 返回 2419.626ms，包含用户确认与系统启动，不代表 UAC 窗口显示延迟。
- action.execute 降为 2318.730ms。动作内原值核对 9.710ms、PATH 写入 5.213ms、配套标记 11.796ms；实际 PATH 写入在 **21:22:08.755** 完成。
- **notify-launch 仍耗时 2224.562ms**：21:22:08.769 到 21:22:10.993，占 action.execute 约 96%。这一阶段包括子脚本解码/编码、ProcessStartInfo 准备、Process.Start 和 StandardInput.Close；现有日志没有细分，不能直接把 2.22 秒认定为某个 API 的耗时，更不能据此认定是安全软件扫描。
- action 在 21:22:10.998 执行完成，21:22:11.141 返回成功；后续 FlyEnv 环境刷新 462.497ms、列表刷新 317.565ms。广播子进程 PID=37708、parentPid=12960，与认证 actionPid 一致。
- 后台广播从 **21:22:11.637** 到 **21:22:13.304**，等待约 **1666.343ms**；返回时成功提示已出现约 1.354 秒。这证明本次 UAC 写入不再等待后台广播返回。日志中的 returned 只证明调用返回，不保证每个窗口刷新。
- 子进程记录了 compile-start、broadcast-start、broadcast-returned，未记录 compile-end；因此两者之间约 306ms 只能作为编译及日志等准备的合计观察，不能当作纯编译时长。附加日志允许丢失，不能从缺一条阶段认定广播失败。

当前主要剩余等待是 RunAs、通知进程启动和 broker 准备。卷查询按用户要求保持现状；如果继续定位，应优先将 notify-launch 拆为脚本准备、Process.Start、stdin 关闭等阶段，再依据证据决定优化方式。本轮仅分析日志并记录观察，没有修改执行逻辑。

## 广播进程启动细分：实施契约

本次按照用户要求，仅为上轮 2224.562ms 的通知启动补充诊断。操作仍由既有 fork 权限执行器和一次性 action 拥有，后台通知生命周期、调用顺序、失败隔离及写入结果保持原约定；不新增配置、store、业务 IPC、查询或广播进程，不涉及模块边界例外。

保留 notify-launch-start/end/failed 总阶段；在其内部依次记录源脚本解码、替换父 PID 并编码、ProcessStartInfo 构造、属性配置、Process.Start、stdin 关闭的 start/end。finally 内另记录 Dispose 的 start/end/failed，避免把总阶段结束后的句柄释放等待遗漏。观察函数复用已有窄 catch，不同步写盘，不等待后台广播，不把诊断异常作为主流程错误。失败时根据最后开始但未结束的阶段定位，仍由既有 catch 隔离通知失败。

静态复核覆盖生成 PowerShell 的语法、所有新增阶段的解析白名单，以及 finally 和旧独立 fallback 关闭阶段时的行为；不新增或运行测试，不执行真实系统写入、进程启动或广播。后续实机日志使用同一 actionPid 的 sourceElapsedMs 差值计算各子阶段耗时，再决定是否优化。

### 具体改动和日志对应关系

`WindowsHelperFallback.ts` 在原启动语句两侧增加固定阶段函数调用；每个调用自身有异常隔离。所有语句顺序与 ProcessStartInfo 参数保留，未加入读取进程状态、等待、重试或额外磁盘写入。`WindowsActionStage.ts` 将新增名称加入已有白名单，使它们继续沿原 action 诊断结果回传，不扩展自由字段或公开接口。没有修改 Go 代码，Helper 源码版本保持 36。

以下名称均加 `action.path.` 前缀，正常执行有 start/end 配对：

| 阶段名称 | 实际计时内容 |
| --- | --- |
| notify-source-decode | Base64 源脚本解码及 UTF-8 字符串生成 |
| notify-source-encode | 替换固定父 PID 占位符，生成 UTF-16LE EncodedCommand |
| notify-start-info-create | 仅 ProcessStartInfo 对象构造，区分首次类型加载/构造成本 |
| notify-start-info-configure | 完整程序地址、参数、隐藏窗口及三个标准流重定向的属性设置 |
| notify-process-start | 仅 Process.Start 调用直至返回 Process 对象；不代表子脚本已经开始执行 |
| notify-stdin-close | StandardInput 属性访问及 Close 调用；不等待子进程读取完成或退出 |
| notify-dispose | finally 中的 Process.Dispose，失败时记录 notify-dispose-failed |

读取 `[WindowsPath][diagnostic]` 的 transportStage：按同一 actionId/actionPid 配对，用 end.sourceElapsedMs 减 start.sourceElapsedMs，不使用 Node 日志行的 at 差值。action 诊断在结果到达后批量输出，因此多条日志的外层时间可能相同，sourceAt 才是发生时刻。notify-launch 总区间仍到 stdin 关闭结束，Dispose 单独属于后续收尾；父阶段包含子阶段，不重复相加。

如果只有某子阶段 start，随后出现 notify-launch-failed，说明该步骤未正常返回；通知仍是附加动作，不改变已提交的注册表结果。Process.Start 返回到子进程 compile-start 之间的 sourceAt 差值，可辅助观察子 PowerShell 开始执行脚本前的时间，但不能用它代替 Process.Start 自身计时，也不能据此认定是某个系统组件导致。

本轮静态检查：2 个 TypeScript 文件语法解析通过；通知生成器的 18 个阶段调用均存在于解析白名单；开启/关闭诊断的启动脚本及后台脚本通过 PowerShell Parser 语法解析；涉及文件的 git diff --check 通过。没有执行上述脚本、功能测试或构建，真实阶段耗时仍等待新的实机操作日志。

## 2026-10-04 21:38 实机日志：定位到 Process.Start

日志 92508 字节，最后修改时间 21:38:43。PHP updatePATH 主请求 `BSVXZ9qgH0iokEh7eNexMh5JjgVXN5Gu`，actionId `6854100d-e5ec-4f80-986e-c8a426002d90`，认证 actionPid=37164。本轮所有新增子阶段均有开始/结束记录；日志落盘顺序存在交错，以下按同一进程的 sourceElapsedMs 配对计算。

| 通知启动子阶段 | 耗时（ms） |
| --- | ---: |
| 源脚本解码 | 4.478 |
| 父 PID 替换及编码 | 4.969 |
| ProcessStartInfo 构造 | 1.245 |
| 属性配置 | 17.662 |
| **Process.Start** | **1666.184** |
| stdin 关闭 | 5.451 |
| finally Dispose | 1.869 |

- notify-launch 合计 1726.373ms，Process.Start 占约 **96.5%**；开始时间 21:38:39.934，返回时间 21:38:41.600。finally Dispose 不在 launch 总区间内。子阶段之间还有诊断和调度间隔，不将总阶段和子阶段相加。
- 这次已经可以排除“脚本编码、ProcessStartInfo 配置或 stdin 关闭占用了主要等待”的猜测；主要等待就在 Process.Start 调用内。现有日志无法区分它内部的 CLR、标准流创建、Windows 进程创建或系统拦截等耗时，不认定某一内部机制或安全软件是原因。
- 广播子进程 PID=5240、parentPid=37164。Process.Start 返回到子脚本 compile-start 相隔约 303ms；后台编译阶段 291.606ms，广播调用 1669.111ms。Process.Start 返回不等于 PowerShell 已经开始执行脚本，这两个时间不能混算。
- 主请求总耗时 8836ms，code=0，一次 attempt；实际 PATH 注册表写入 5.027ms，无失败或重试。broker 准备 1475.866ms、RunAs 2208.177ms、卷查询 1136.105ms、环境刷新 463.954ms、列表刷新 322.616ms。worker 已就绪并复用，没有重建等待。
- 21:38:42.571 已显示成功，后台广播 21:38:43.874 才返回，相差约 1.303 秒；写入仍不等待后台广播。相较前轮 9560ms，本次少 724ms，但本轮仅增加诊断，不能把样本波动认定为新的性能优化。

后续若优化，应针对额外通知进程的创建及其所在等待链路；调整脚本编码或句柄关闭不会消除这次主要的 1.666 秒。保留通知、后台生命周期和写入成功边界仍是约束。本轮只分析日志并记录结果，没有修改执行逻辑。

## 广播启动移到业务回包之后：旧方案实施契约（现已取消）

本节及下方 22:13 日志描述上一轮实现；当前实现以文末“环境通知回归写入方法”为准。为强制完整业务回包先于启动而引入的 dispatcher 范围、pending/replySent 和 afterReply 已删除。

用户明确要求主操作完成就返回，通知进程的启动也不等待。本次顺序为：注册表写入 → FlyEnv 环境刷新 → 模块自身列表等收尾 → 现有成功/失败终态回包 → 下一轮事件循环静默启动普通权限通知进程。广播无需注册表写权限，不应持有管理员 action、UAC 租约或认证管道。

- 既有 renderer 单例与业务 IPC 不变；fork BaseManager 拥有每个请求的通知范围和回包后的投递。范围使用 AsyncLocalStorage 隔离，并发请求不会互相取走标记；同一请求多次成功写入合并为一次通知，不新增配置、store、公开参数或业务 IPC。
- 公共权限协调器、旧 fallback 仅在环境变量实际提交成功后标记待通知；设置/服务 PATH、alias 单变量写入、插件复用公共接口均采用该共同边界。标记发生在 EnvSync 刷新之前，若写入成功后刷新/列表失败，错误回包后仍通知系统，不能将已完成的副作用抹掉。
- UAC/管理员/旧 fallback 的写入脚本删除广播进程启动语句；回包后公共后台执行器使用系统 PowerShell 完整路径、EncodedCommand、无 shell、隐藏窗口、detached 和 stdio ignore。所有定位、编码、spawn、事件日志均在回包后发生，不等待进程启动或广播结果；后台进程不需要父 worker 后续读取管道/释放 PowerShell Process 对象。
- Go Helper 已采用非阻塞后台队列，写入 RPC 不等待广播启动/结果，本次保留该机制且不重复安排 Node 通知。其广播可能早于业务回包开始，不是本轮同步 Process.Start 的来源。不修改 Go 源码，版本保持 36。
- 没有 dispatcher 的独立公共 API 调用没有 UI 回包边界，沿用注册表成功标记后的事件循环后台投递；正式应用请求必须等 dispatcher 终态，进度不投递。通知是尽力附加动作，失败只记录、不重放写入、不提权、不延长服务退出。
- 本次不新增/运行测试或构建、不执行真实写入/通知。静态复核覆盖范围绑定、成功/失败回包顺序、重复标记、旧 fallback、生成脚本语法与完整路径；真实性能需后续 UI 日志确认。

### 当前实现、改动文件与原因

- `src/shared/WindowsEnvironmentBroadcast.ts`：统一通知脚本、请求标记、回包后投递和普通权限启动。范围使用进程内固定 Symbol 共享 AsyncLocalStorage，宿主与重新构建的插件即使打包成不同模块实例也加入同一请求。每个请求拥有 pending/replySent 标记，不新增通用后台任务框架；多次写入只安排一次通知。无业务范围的独立 API 使用下一轮事件循环投递。
- `src/fork/BaseManager.ts`：在实际 target.exec 执行时绑定通知范围；正常成功和失败回调先调用原 ProcessSendSuccess/Error，再 afterReply。code=200 保持进度、不触发通知，公开命令参数、返回数据和插件签名均未调整。环境刷新、PHP ini、PATH 列表、alias 清理等业务仍先走完；没有把写入 RPC 返回当作整条业务完成。
- `src/shared/WindowsPrivilegeOperation.ts`：管理员直执行成功和 UAC 认证执行成功后仅标记通知。标记早于 EnvSync，不增加等待；无明确成功结果时不标记。Helper 分支不重复安排通知，保留 Go 端的后台队列。
- `src/shared/WindowsHelperFallback.ts`：删除原通知启动脚本生成器，setSystemPath/setSystemEnv 脚本不再携带通知的 Add-Type、编码、Process.Start、stdin 关闭或 Dispose；旧 Sudo fallback 成功后也调用同一标记入口。脚本仍保留原注册表比较、写入类型、配套变量和异常传播，不能从此次优化推导出写入会自动重试。
- `src/shared/WindowsActionStage.ts`：旧 notify 阶段白名单继续用于历史日志，注释明确它们已移出当前 action；新后台日志不伪装为认证 action 的成功阶段。

后台使用 Node spawn 直接启动一次 PowerShell，不再需要另一个 PowerShell 去执行 Process.Start。完整系统路径及环境参数复用既有 Windows 工具；只在后台真正需要通知时动态导入身份环境工具，避免增加所有冷 worker 的入口负担。stdio ignore 没有父 action 的 stdin/stdout/stderr 管道，因此无需 PowerShell Close/Dispose；detached 和 unref 让已启动的通知进程继续运行，业务和 worker 不等待其退出。

### 新日志与失败边界

- `[WindowsPath][broadcast-launch]` 使用原 requestKey、UTC、fork PID 与该请求范围时钟；scheduled 的 replySent=true 表示原终态消息已经发出，prepare-start/end、spawn-request、spawn-call-returned/spawned 和 exited 均属后台观察。spawn-call-returned 的 durationMs 能观察 Node 启动调用本身的成本，但不能加入前面的业务回包等待。
- `[WindowsPath][broadcast]` 保留编译与原生广播阶段，增加原 requestKey；parentPid 现在是实际启动它的普通 fork PID，不再是已结束的管理员 actionPid。新旧日志的父 PID 含义不同，不能按历史关联规则找管理员进程。
- 主线程/renderer 收到终态的日志可能与后台日志落盘交错；“先回包”指 fork 已调用原终态发送，不新增 renderer ACK 或等待用户看到提示。后台启动不参与业务 Promise，Node 的进程创建成本即使仍存在，也发生在结果发送之后。
- 启动定位、脚本编码、同步 spawn 和异步 error 都有后台接收者；日志只记录固定阶段、PID、错误码，禁止打印包含脚本的 spawn 参数。失败不回到 UI 错误回调、不改写已发送终态、不再授权、不重放注册表写入。
- 若注册表写入本身失败/结果未知，pending 未置位，不猜测成功或自动广播；若已成功但环境刷新/后续列表失败，pending 保留到错误回包后执行。并发范围互相隔离，多次标记合并；已回包范围中的后续独立写入也继续非阻塞投递。
- worker 回包后仍遵守原空闲退休与退出机制；已启动通知无管道引用而独立继续，尚未启动时应用强制退出可能结束这次尽力通知，不为通知延长退出。旧插件二进制中的旧广播脚本需要重新构建后才能采用本实现。

### 本轮静态复核结果

5 个涉及 TypeScript 文件语法解析通过。后台通知、PATH 注册表写入、单变量注册表写入的生成脚本均通过 PowerShell Parser 语法解析，未执行；写入生成器源码已无通知启动调用。人工复核 BaseManager 的成功/失败路径均先发原终态再调用 afterReply，进度仅调用 ProcessSendLog；同一请求 run 范围覆盖真实 target.exec，通知标记不依赖诊断 ALS。Helper 两端源码版本仍为 36/36，涉及文件 git diff --check 通过。未运行测试、完整类型检查或构建，也未执行真实系统操作；需以新的 UI 日志确认实际启动时刻及体验改善。

## 2026-10-04 22:13 实机日志：回包先于广播启动

日志 80361 字节，最后修改时间 22:13:37。PHP updatePATH 请求为 `81VmeSTCQ2JyvmlgwnyPK7VGqLCu8cMT`，actionId 为 `e73858f1-c292-4040-a9fc-de8ea65b6957`，使用 UAC；worker 15932 已就绪并复用。本轮没有覆盖 Go Helper 路径。

- 请求于 **22:13:28.601** 收到，main 于 **22:13:35.438** 收到成功终态，renderer 于 **22:13:35.439** 收到、**22:13:35.452** 显示成功，总耗时 **6851ms**。相较上一轮 8836ms 少 1985ms，但不能将全部差值认定为固定优化收益。
- 原 PATH 注册表写入仅 **4.153ms**，action.execute 为 **51.673ms**，上一轮为 1818.042ms；本轮动作内已无 notify 启动阶段。环境刷新 **412.566ms**、模块列表刷新 **309.225ms**，都在业务回包之前完成。
- 后台 scheduled 于 **22:13:35.438** 记录 `replySent=true`，spawn-request 于 **22:13:35.445** 发生，spawn-call-returned 于 **22:13:36.866** 返回，启动调用 **1421.471ms**。它发生在业务终态发送之后，renderer 成功提示也早于启动调用返回约 1.414 秒；因此本次业务结果没有等待广播进程创建结束。
- 主链路剩余较大的阶段为卷查询 **1178.597ms**、broker 准备 **1459.346ms**、RunAs **2127.026ms**，另有令牌探测 **238.466ms**。RunAs 包含用户确认与系统启动，不能当作弹窗出现前的纯等待；卷查询按用户要求保留现状。
- 后续独立 envPathList 请求 **22:13:35.448** 已发送给同一个 worker，worker 到 **22:13:36.870** 才收到初始化，随后业务本身约 **287ms**，main 总耗时 **1722ms**。这段约 1.422 秒的分派间隔与 Node spawn 调用区间重叠，说明回包后的启动调用仍占用该 worker 的事件循环，影响后续请求接收；不能据此说后台化消除了所有 worker 等待，也不能把它重新加到已经完成的 updatePATH 等待中。
- 广播子进程 PID=36112，于 **22:13:37.007** 以 code=0 退出，但当前文件没有任何 `[WindowsPath][broadcast]` 子脚本阶段。只能确认启动和进程退出，**不能确认 SendMessageTimeout 已执行或各窗口更新环境**。子脚本的日志异常被尽力隔离，退出码也不是原生调用成功凭证；现有记录不足以判断是日志写入丢失还是其他原因，不推定安全软件或进程启动方式为根因。

以上按日志事件时间及同一时钟计算，未按落盘行序排序；部分 prepare-end 等事件晚落盘，不代表实际执行晚于 spawn。本轮仅分析日志、补充记录，没有修改执行代码或运行功能测试。

## 环境通知回归写入方法：上一轮实施契约与改动理由

本节的低层提交后通知与 Go 内部通知队列已由文末“2026-10-05 通知放在业务结算后”替代。保留本节用于核对历史日志；当前所有授权方式都由具体业务方法在结算后安排通知。

用户要求通知只由系统环境变量写入触发，取消与通用模块执行回调的耦合。此前 BaseManager 的参与是为了强制“完整业务终态回包后才创建通知进程”，引入了第二个请求范围、跨方法待通知标记及成功/失败回包挂钩。环境通知本身只需要知道注册表已成功提交；绑定任意模块的业务终态扩大了操作边界，并使独立 API 与正式 IPC 存在不同路径，因此删除这套机制。

本次操作所有者是公共 Windows 环境写入方法，通知生命周期由独立普通权限进程负责；不新增 renderer 状态、配置、store、IPC、服务交互或模块边界例外。开始条件为 setSystemPath/setSystemEnv 的明确提交成功；中间事件是已有的 scheduled、prepare、spawn 和子进程广播诊断；通知结束或失败仅记录，业务仍按原终态结算。每次成功提交安排一次通知，不再按完整业务请求合并。调用方不 await 启动或执行结果；未知/失败提交不安排通知。下节进一步取消写入后的主动 sync，缓存仅失效、实际读取时才刷新。代码路径静态复核，不新增或运行功能测试。

### 各文件调整

- `src/fork/BaseManager.ts`：删除通知 import、每次 exec 创建通知范围、成功/失败 afterReply 调用及 target.exec 外的通知范围包装。恢复原内建/插件调用，服务停止诊断、插件 ServiceStopContext、进度/终态发送仍沿用现有实现。普通模块请求不再创建通知状态。
- `src/shared/WindowsEnvironmentBroadcast.ts`：删除 AsyncLocalStorage、进程全局 Symbol、pending/replySent、createWindowsEnvironmentBroadcastScope 和 deferWindowsEnvironmentBroadcast。改为单一 `notifyWindowsEnvironmentChanged(): void`，直接用 setImmediate 安排一次后台启动。保留完整 PowerShell 地址、UTF-16LE EncodedCommand、隐藏窗口、无 shell、detached/stdio ignore、事件日志、子进程 unref 及窄范围错误隔离。
- `src/shared/WindowsPrivilegeOperation.ts`：管理员直执行成功与 UAC 成功后，在写入分支直接调用新方法，然后沿用 EnvSync 缓存失效与刷新。Helper 分支由 Go 自身通知，不重复启动 Node 通知。调用早于附加刷新，因此后续刷新失败不会撤销已提交变更的通知。
- `src/shared/WindowsHelperFallback.ts`：旧独立 Sudo fallback 成功后也调用同一方法；脚本本身只写注册表。没有 dispatcher 的调用采用同样的触发边界，不需要特殊范围或回包处理。
- `src/shared/WindowsPathDiagnostics.ts`：增加只读关联 key 获取方法，通知捕获已有诊断 requestKey；这仅关联日志，不建立业务范围，不要求每个请求先初始化通知。无诊断范围时 key 为 undefined，通知照常执行。

### 顺序和边界

当前顺序为“注册表提交成功 → 直接安排后台通知，同时继续既有环境刷新、列表和业务回包”。不再承诺通知启动一定晚于完整业务回包；setImmediate 只推迟到下一轮事件循环。Node spawn 调用仍可能短暂占用所在 worker，不能把“不 await 通知”宣称为“进程创建对其他代码完全没有影响”；22:13 旧方案中的 1.42 秒启动成本没有因删除范围而消失，后续耗时以新日志为准。

后台定位/准备/启动/执行失败均不能触发写入重放、UAC 或 Helper 安装，也不能覆盖业务结果。日志 scheduled 改为 `trigger=system-write-completed`，不再出现 replySent；保留 requestKey、实际发生时间与父/子 PID 关联。Go Helper 现有成功提交后非阻塞排队通知符合本次触发边界，未修改 Go 源码或 Helper 版本，仍为 36；二进制是否覆盖该行为需独立实机确认。

## 写入后的缓存失效与按需同步：上一轮实施契约

本节描述上一轮把 clean 放在通用权限路由/Helper 回调的实现；其放置位置已按 2026-10-05 的要求调整，以文末当前契约为准。按需 sync 与不等待缓存失效的规则继续保留。

用户要求后台环境通知不等待 EnvSync.clean/sync，并确保更新后再次读取环境变量不会命中旧缓存。当前公共权限路由在管理员/UAC/Helper 写入成功后已有 clean，但随后等待一次完整 sync；旧 Sudo fallback 也主动 sync。另发现没有权限 provider 时的 Helper 直接 RPC 成功路径没有清理 EnvSync，可能使工具环境变量列表、alias 等后续展开继续使用旧快照。

本次保持环境写入与缓存归公共后端所有，不新增 UI/store/IPC 或其他操作框架。成功条件仍为注册表提交成功，通知是独立附加动作；成功边界立即调用 clean 清空本地缓存、登记共享缓存失效，不等待其 Promise，也不主动获取新快照。下次真正需要环境数据时调用既有 sync；它先等待本实例已登记的 invalidateInFlight，再重新读取。不能简单删除 clean，否则 sync 会命中旧缓存；不能在每个 PATH 展开项或模块列表里重复 clean，否则破坏共享缓存并重复通知其他 worker。

公共权限路由覆盖管理员/UAC/正式 Helper；旧 fallback 覆盖独立 UAC；Helper 原始 RPC 成功分支只在未由权限路由接管的旧环境写入中补 clean，避免正常 Helper 路径重复失效。失败、取消、冲突和未知结果不按成功清缓存或重放写入。失效/诊断失败由窄 catch 接收，不否定已完成的写入；EnvSync 的既有失效失败日志仍保留，不能把日志正常当作共享缓存必定失效的证明。

静态复核关注调用顺序、无主动 sync、旧/新路径是否重复 clean，以及读取前的等待屏障。广播完全不依赖 EnvSync；EnvSync.sync 的按需取数仍可能耗时，不宣称同一 updatePATH 后续需要环境数据的列表刷新能跳过这份必要等待。不新增或运行功能测试，不执行真实注册表写入。

### 具体调整与复核

- `WindowsPrivilegeOperation.ts`：管理员直执行与授权成功分支保留一次 clean，改为不等待的计时调用，删除提交后的主动 sync。计时包装同步调用 clean，clean 会在本轮立即清空本地旧值、登记共享失效；不是延后到广播进程执行时才清缓存。
- `WindowsHelperFallback.ts`：独立旧 Sudo 成功分支同样不等待 clean、删除随后的 sync；执行之前原有环境准备未改，不把准备读取误认为写入后刷新。
- `Helper.ts`：仅在收到有效、成功的原始 RPC 响应，且没有被正式权限路由接管时补 clean。失败/未知响应不触发，正式 Helper 由公共权限路由处理一次，fallback 由自身处理一次；不会因签名失败先行清缓存。
- `EnvSync.ts`：补充 clean 的同步本地失效、共享队列屏障及 sync 读取前等待的中文注释，没有改缓存 TTL、协议、generation/revision 或 provider 实现。
- `Tool.win/path.ts`：envPathUpdate 说明 writePath 经公共层立即清缓存的契约；模块不额外 clean。环境变量工具后续重新取列表可能被分派给另一个 worker，共享失效仍通过现有 main provider 通知其他 worker，不能仅清本地变量。

本轮 5 个 TypeScript 文件语法解析通过、涉及文件 diff 空白检查通过；人工核对新增计时函数 import 及原始 Helper 成功分支。没有新增/运行测试、完整类型检查、构建或真实写入；性能和跨 worker 的实际时序仍须后续实机日志确认。

## 2026-10-05 缓存失效回归实际写入调用：当前实施契约

用户明确要求通用 Helper 不判断环境操作，UAC 链路也在环境写入成功后清缓存，删除后台通知后面的 clean。本次让实际环境变量写入业务调用拥有缓存失效：`writePath` 在 setSystemPath 调用明确成功后清理；`setAlias` 在 FLYENV_ALIAS 的 setSystemEnv 调用明确成功后清理。两处 Helper.send 返回成功同时覆盖管理员、UAC、Go Helper 和旧 fallback，不根据授权方式分叉缓存策略。

通用 Helper RPC 回调、WindowsPrivilegeOperation 和旧 WindowsHelperFallback 不再隐式清缓存；通知代码仅安排通知、不负责 EnvSync。清理仍同步清空本地快照并登记共享失效，不等待回执、不主动 sync。PATH/alias 的后续真实读取使用已有 sync 屏障，避免旧缓存；写入失败、取消、冲突或未知结果仍直接保留原错误，不走成功后的 clean。

操作所有者、开始/进度/终态仍为原 PATH/alias 业务调用，不新增 renderer 状态、store、配置、IPC、通用框架或模块边界例外。通知与缓存失效是独立步骤，缓存失败仅保留诊断，不触发写入重放或再次授权。低层权限/RPC API 的直接调用不再附带环境缓存副作用，其环境业务调用方应在提交成功后处理自身缓存。本次静态核对所有源码 setSystemPath/setSystemEnv 调用点，不运行功能测试或真实写入。

### 文件改动及覆盖范围

- `src/fork/Helper.ts`：删除原始 RPC 成功回调中的环境操作判断、clean 及 EnvSync import，通用传输仅返回执行结果。
- `src/shared/WindowsPrivilegeOperation.ts`：管理员/UAC/正式 Helper 分支删除通知后的 clean 与 EnvSync import；成功提交及广播诊断仍保留，不把缓存失效当作权限执行的一部分。
- `src/shared/WindowsHelperFallback.ts`：旧 Sudo fallback 删除通知后的 clean 与不再使用的计时 import；执行前原有 sync 准备未改。
- `src/fork/util/PATH.win.ts`：在 writePath 的两个 setSystemPath 调用成功分支汇合后直接 clean，放在写入错误 catch 之外；服务添加/移除 PATH、工具 envPathUpdate、addPath 和配套环境变量均复用此点，不重复清理。
- `src/fork/module/Tool.win/alias.ts`：FLYENV_ALIAS 提交成功后、addPath 之前直接 clean，使后续环境读取不会展开旧 alias 目录。若 addPath 无需改 PATH，也已清除这次单变量变更的旧缓存。
- `src/fork/module/Tool.win/path.ts`：修正 envPathUpdate 注释，明确缓存清理由实际 writePath 调用拥有。

已静态核对源码中 setSystemPath 的两个调用和 setSystemEnv 的一个调用，均在其明确成功后到达上述清理点；通用 Helper、权限执行器和 fallback 无剩余 clean 调用。6 个调整 TypeScript 文件语法解析通过，涉及文件 diff 空白检查通过。未运行功能测试、完整类型检查、构建或真实 UAC/Helper 操作。没有修改 Go 源码或 Helper 版本。

## 2026-10-05 00:28 实机日志：缓存失效正常，广播创建占用业务 worker

日志 79599 字节，最后修改时间 00:28:54.865，包含一次 PHP updatePATH 与随后 envPathList。请求 `PbJsLoPthCUwmZOFMT2ZZeJjMO7Qntzh` 使用 UAC，actionId=`cbb98a29-11a6-4d38-8ca2-a16e8ee67507`，worker 33632 已就绪并复用，没有重建等待。

- 请求于 **00:28:46.027** 到达 main，**00:28:54.498** 成功回包，renderer 于 **00:28:54.508** 提示成功，总耗时 **8483ms**；本轮一次提交，无记录到的业务失败或重试。
- 卷查询 **1217.111ms**、写入前快照 **268.684ms**、重建条目 **220.457ms**、令牌 **239.409ms**、broker 准备 **1717.457ms**、RunAs **2168.379ms**；action.execute **66.249ms**。RunAs 包含用户确认与系统启动，父阶段不与子阶段重复相加。
- **00:28:52.572** 写入路由成功并安排通知，同一轮 writePath 清缓存、开始计时；提交阶段结束后 PHP 导入/ini 继续，**00:28:52.574** 已开始返回列表刷新。说明 writePath 没有等待 clean 回执，也没有提交后主动 sync。
- 共享缓存于 main 的 **00:28:52.574** 失效，revision **7 → 8**；下一次实际取数在 **00:28:53.807** 记录 cache-miss，**00:28:54.234** 返回 revision 8，取数 **426.760ms**。随后单独 envPathList 命中 revision 8，总耗时 **362ms**。本样本没有更新后继续命中 revision 7 的现象。
- 后台通知于 **00:28:52.579** 调用 spawn，**00:28:53.805** 返回，**1226.104ms**。同一 worker 到 **00:28:53.807** 才处理缓存失效回执；clean 计时 **1235.141ms** 包含回执处理被这段进程创建占用延后的等待，不能称为本地清缓存本身耗时 1.235 秒。main 已在发起失效后约 2ms 清除共享快照。
- 列表刷新合计 **1923.311ms**，其中包含上述约 1.23 秒的通知创建区间、约 427ms 新环境获取和约 248ms PATH 注册表读取。通知虽不 await 子进程执行结果，**spawn 调用仍在同一个 worker 内同步占用事件循环，且此轮发生在业务回包之前**；因此它仍延长本次用户等待。这个观察来自 spawn 两侧与缓存/业务阶段的实际时间，并非推定安全软件原因。
- 通知进程 PID=37436，**00:28:53.936** code=0 退出，但仍无 `[WindowsPath][broadcast]` 内部事件；只能证明启动/退出，不能确认 native 广播执行成功。没有将进程退出当作业务成功条件，也不据此重试写入。

相较 22:13 样本 6851ms，本轮多 1632ms；广播创建回到了业务刷新期间是本轮明确可见的耗时，broker 等阶段也存在波动，不能把全部差值归为单个固定成本。后续若消除通知创建对当前 worker 的影响，需要改变进程创建的执行位置；仅去掉 await 或再包一层 setImmediate 不能消除同步 spawn 的占用。本轮只读日志并记录结论，没有修改执行逻辑或运行功能测试。

## 2026-10-05 通知放在业务结算后：当前实施契约

用户要求通知由 updatePATH/removePATH 等实际更新环境的方法在 resolve/reject 之后调用，并移除 detached 与 child.unref。本次通知所有者改为 PATH/alias/Android PATH 修复的具体业务方法，不进入 BaseManager，不建立全局请求范围、IPC ACK 或通用 Helper 判断。writePath 保留成功后的 clean，通知与缓存仍独立。

每个业务调用用一个局部布尔值记录明确完成的环境写入；正常 resolve 之后、或已写入但后续业务失败 reject 之后，在 finally 中安排通知。写入失败/取消/冲突/未知结果不设置成功标记，不通知；多次尝试只在最终提交成功后设置标记。alias 的单变量成功而后续 PATH 或文件清理失败也要通知已发生的变更。Android PATH 修复在其完整业务结果结算后通知，addPath 的未修改返回与实际写入返回明确区分。

通知方法继续用 setImmediate 延后一轮，不等待 spawn/exit/native 返回。ForkPromise 的结算会安排已有 then/catch 微任务，dispatcher 按原实现回包；通知不再打断业务内部的环境/列表刷新。结算不是 renderer ACK，不承诺所有异步回包附加步骤均已完成。移除 detached/unref 后子进程保留默认引用，可保持 worker 自然事件循环存活到进程结束；应用原有强制关闭/退休仍可能结束 worker，不能保证强制退出时的通知或日志。

Go SetSystemPath/SetSystemEnv 也取消提前通知，避免 Helper 模式重复或提前广播；低层只负责写入，业务结算后统一由普通 fork 通知。移除无调用的 Go native 广播队列及非 Windows空函数，Go Helper/应用版本从 36 同步升级至 37，防止旧 Helper 仍自行提前广播。源码调整不等于二进制升级，本轮不构建发布产物。

detached 在 Windows 改变进程独立/控制台行为；unref 改变事件循环引用。Node 文档并未保证移除它们会降低创建耗时，也不表示它们会禁止子进程直接写文件（[Node child_process](https://nodejs.org/api/child_process.html#optionsdetached)、[unref](https://nodejs.org/api/child_process.html#subprocessunref)）。本次按用户要求移除，通过后续实机日志观察启动耗时和子脚本阶段；不把现有日志缺失推定为这两个设置导致。

不新增 renderer/store/配置/IPC/模块边界例外，不新增或执行功能测试；静态复核所有现有写入业务入口、成功标记、结算后通知、Go 无重复广播和版本一致性。通知失败不覆盖业务终态，不重放写入、不重新提权。

### 本轮文件调整与边界复核

- `src/fork/module/Tool.win/path.ts`：updatePATH、removePATH、envPathUpdate 各自持有局部 environmentWritten 标记，writePath 或 writeRebuiltSystemPath 返回成功后置为 true。正常列表/ini 刷新仍按既有顺序执行；resolve/reject 后的 finally 安排通知。写入失败不通知，已写入但后续失败则在 reject 后通知，不掩盖原业务错误。
- `src/fork/module/Tool.win/alias.ts`：FLYENV_ALIAS 写入成功后记录变更并立即 clean；完整 alias/PATH/文件清理结果结算后通知一次。即使 addPath 不改 PATH，已完成的 alias 变量写入仍需通知；若随后步骤失败，也不丢失该变更通知。
- `src/fork/util/PATH.win.ts`：writePath 保留提交成功后的缓存失效，不承担通知。addPath 参数保持不变，已有 PATH 项返回 false，完成写入返回 true，供 Android 区分实际变更。alias 不依赖此返回值来判断已经发生的单变量变更。
- `src/fork/module/Flutter/android.ts`：Android 自动修复仅在 addPath 明确返回 true 时记录此次 PATH 变更；沿用既有完整修复结果及失败步骤收集，终态后再通知。既有 setx 用户 SDK 变量流程未在本轮修改。
- `src/shared/WindowsPrivilegeOperation.ts`、`src/shared/WindowsHelperFallback.ts`：删除低层成功后的通知调用与 import，保留提交日志及授权/错误传播。通用 RPC 和权限方法不再判断业务何时结算。
- `src/shared/WindowsEnvironmentBroadcast.ts`：scheduled 触发字段改为 environment-operation-settled，setImmediate 内启动隐藏的普通 PowerShell，删除 detached:true 与 child.unref()。保留 spawn/error/exit 日志和 UTF-8 子脚本日志；诊断上下文创建、准备、启动错误均属于附加动作，不能影响已结算业务。默认子进程引用不代表业务会 await 子进程。
- `src/helper-go/module/tool.go`：SetSystemPath/SetSystemEnv 删除成功后的 Go 内部通知，保留原注册表写入与冲突校验。`tool_windows.go` 删除已无调用的广播队列、native 实现及相关 import；`tool_other.go` 删除对应空实现，避免保留第二套通知入口。
- `src/helper-go/main.go`、`src/shared/AppHelperCheck.ts`：两端要求版本同步为 37，旧 36 的提前通知行为需要通过新 Helper 发布替换；本轮只调整源码，没有构建 Helper 二进制。

8 个调整的 TypeScript 文件语法解析无错误，涉及文件的 `git diff --check` 通过。静态搜索无剩余 Go 通知函数调用，两端 Helper 源码版本均为 37；人工核对现有 PATH/alias 调用点、成功标记、finally 次序和 ForkPromise 结算方式。未执行功能测试、完整类型检查、Go 构建、真实注册表写入或广播。尚无本轮调整后的实机日志，不能宣称启动耗时或子脚本日志缺失已解决。

## 2026-10-05 08:17 实机日志：业务先返回，广播阶段完整

日志文件 80396 字节，最后修改时间本地 08:17:35（UTC 00:17:35）；本节时间均为本地时间。PHP updatePATH 请求为 `PQz7P5gm8ctIxRVGjUDGBDQjdofAC1BM`，UAC actionId 为 `d98222f7-3dd7-47f4-aa10-37f4da59b80d`。worker 31220 复用，后台通知进程 33692；随后 envPathList 请求为 `fhiS00iiQjMjrOC01fipXwquvduaFHjg`，也使用 worker 31220。

### 主业务与通知顺序

- updatePATH 返回列表刷新在 **08:17:31.577** 完成；**31.578** fork 业务结算、main 收到成功终态并回包。同一毫秒记录 scheduled，trigger 为 environment-operation-settled。
- renderer 在 **31.579** 收到成功终态，耗时 **7684ms**；**31.594** 提示成功，耗时 **7698ms**。广播 spawn 在 **31.583** 才开始，**32.959** 返回，因此本次主请求已经返回，不等待 spawn 返回或广播完成。
- 写入路由成功后 **08:17:30.707** 发起缓存失效，main 在 **30.708** 将 revision 更新为 8；失效计时 **14.292ms**。随后按需环境获取约 **558ms**，返回 revision 8；返回列表刷新合计 **857.402ms**。广播创建没有夹在本次缓存失效/列表刷新之间。
- 相比上一份 00:28 样本的成功提示 **8483ms**，本次 **7698ms** 少 **785ms**；样本间 broker、RunAs、环境读取等也有波动，不能将全部差值归为单一设置或据此保证固定收益。

### 广播内部记录及剩余影响

- 进程创建调用 **1375.710ms**，仍约 1.38 秒；移除 detached/unref 后并未在此样本中看到启动成本消失。准备模块/编码约 **5ms**，不能把整个创建成本归为准备阶段。
- 子进程日志记录 compile-start（**08:17:33.238**）、compile-end（**33.536**）、broadcast-start（**33.538**）、broadcast-returned（**35.021**），然后 **35.045** code=0 退出。子进程自身 elapsedMs 差值分别约 **290ms** 和 **1483ms**，包含相应阶段内诊断成本；UTC 时钟差值与单调计时存在少量差异，不混算。记录已经覆盖原生广播调用返回，但没有记录 API 返回值，不能声称所有窗口已成功更新环境。
- 本次内部日志恢复完整；只能确认当前样本能写日志，不能证明之前缺失必然由 detached/unref 导致。
- UI 在成功后 **08:17:31.581** 请求 envPathList，main 于 **31.587** 发往同一 worker；worker 在广播 spawn 返回后的 **32.961** 才收到初始化、**32.962** 收到命令。该列表查询执行约 **299ms**，main 总等待 **1679ms**，其中约 **1.37 秒**位于 worker 接收前，与广播创建占用的区间吻合。
- 因此已解除广播对原 updatePATH 返回的等待，但广播 spawn 仍会延后同一 worker 的下一条请求。现有证据定位到 Node 创建调用的区间，不能继续推定安全软件、控制台配置或 Windows 内部哪个创建步骤是根因；如需消除这份后续请求等待，需要另行讨论通知创建的执行位置。

### 当前主流程成本

卷查询 **1183.762ms**；写入前快照 **245.445ms**；路径重建 **241.140ms**；令牌探测 **246.101ms**；UAC broker 准备 **1538.880ms**（编译 **271.161ms**）；RunAs **2612.953ms**；action.execute **77.610ms**；PHP 导入 **11.082ms**、ini **0.706ms**；返回列表刷新 **857.402ms**。父阶段与子阶段不重复相加，RunAs 包括用户确认及系统启动，不能当作纯执行时长。

本轮只读取日志、分析并记录结论，没有修改运行代码或执行功能测试。此日志覆盖一次 UAC PATH 写入，不能替代 Go Helper 模式、alias、移除 PATH 等入口的实机确认。

## 2026-10-05 移除广播脚本内部细分日志

用户要求删除 Write-FlyEnvNotifyLog，广播内部时间线不再继续采集。本次契约仍是具体环境业务 resolve/reject 后安排通知，fork 拥有通知进程，通知是已提交环境变更的附加动作；不等待启动/原生结果，不改变业务成功条件。多次业务提交仍按现有调用独立通知，不增加合并、重试、UAC/Helper 或新 IPC。没有新状态、配置、store 或模块边界例外。

`src/shared/WindowsEnvironmentBroadcast.ts` 删除 PowerShell 中 Write-FlyEnvNotifyLog 的定义和全部调用，同时删除仅供它使用的计时器、TEMP 日志路径、父 PID、requestKey 变量，以及 TypeScript 的 os/path import。脚本生成方法不再接收 requestKey，因为脚本不再写日志；外层 logger 仍捕获原 requestKey 关联进程创建与退出，删除其余不再使用的上下文字段。

脚本保留 Add-Type、SendMessageTimeout 和原 try/catch。广播失败仍静默结束，不影响已经结算的环境写入，不触发重试；子脚本诊断不再访问日志文件或序列化 JSON。fork 外层 scheduled、prepare、spawn、error、exit 等既有日志继续保留，退出码仍不代表所有窗口刷新成功。删除内部日志是减少诊断工作，并不据此宣称广播创建耗时已经改善。

已核对删除项、脚本结构及调用参数；调整文件的 TypeScript 语法解析无错误，diff 空白检查通过。本轮不新增或运行测试、构建，也不执行真实广播；未执行完整类型检查或 PowerShell 实机验证。

## 2026-10-05 清理本次 Windows 脚本的临时调试打点

用户进一步明确：只清理本次 Windows 链路；帮助程序等必要诊断保留，只用于临时调试的代码删除。此次不把“有 Write/Log 或输出 JSON”作为删除依据，先核对其调用和结果用途。

实施契约：进程查询、环境写入仍由现有 fork/共享执行器拥有，不增加状态或模块边界例外；业务开始、终态、重复调用和服务交互遵守原入口。CIM 查询失败继续拒绝，不能伪装为空表；PATH 原值冲突、注册表写入和配套变量失败继续按原逻辑传播。临时打点是附加观察，删除它不改变业务结果、不增加重试、查询或提权。无新生命周期测试，本次只静态复核。

- `src/shared/Process.win.ts`：删除 PowerShell 的查询 bootstrap/CIM/JSON 五个内部打点和日志函数引导，并删除对应 stderr 阶段解码、recordStages 及 import。脚本仍只查一次 CIM、返回相同字段的 JSON。外层 queryId、spawn、总查询/解析耗时、数量及失败日志继续存在，计时脚本仍可获取 process-list.powershell-query 与 process-list.parse。
- `src/shared/WindowsHelperFallback.ts`：删除仅用于 PATH 写入阶段计时的 environmentStage 包装、六个 registry/配套变量打点及私有 reportStages 参数。普通管理员/UAC 与旧 fallback 继续复用相同的 PATH 验证和写入脚本；调用改用同一生成器，不依赖引导中的临时阶段 logger。
- 保留 Helper 安装/注册任务/启动错误、UAC broker 和动作引导的认证/启动诊断、实际进程停止的目标/结果诊断、外层调用耗时和真实错误。RunAs/编译的可选性能报告仍供现有诊断脚本使用，没有在本轮删除。
- 认证 nonce、READY、stdout 业务 JSON、IntegrationResult 和异常回传不是调试日志，继续使用。Cron 任务历史、终端用户提示、业务程序自己的日志均保持原用途；DbGate 已由用户明确排除，不改其可选调试能力。

本次未修改 Go 源码，Helper 版本仍为 37；本轮不运行测试、构建或真实系统操作。后续日志不再出现本次删除的 CIM/注册表内部阶段，不能用缺少这些阶段判断查询或写入失败。

两处调整文件的 TypeScript 语法解析无错误，diff 空白检查通过；静态搜索确认 Process.win/WindowsHelperFallback 无剩余临时阶段函数、调用或 stderr 阶段采集。Helper 安装错误标记、broker/动作启动与认证阶段仍存在。没有运行功能测试、完整类型检查或 PowerShell 实机验证。

## 2026-10-05 08:55 实机日志：成功返回与诊断清理核对

日志文件 74762 字节，264 行，最后修改时间本地 08:55:38.642（UTC 00:55:38.642）。本轮一次 PHP updatePATH 使用 worker 25400（已就绪并复用），requestKey 为 `Zq2LU7wFALTze8bv7rodf5lRyIjPNHro`，UAC actionId 为 `f5dd6c2f-bec8-4cfd-b3b3-46d490c99d5d`；随后 envPathList 的 requestKey 为 `MwdSdBLWyxt3MJ3DGgY94Lso7waiRj3t`，仍使用 worker 25400。以下时间均为本地时间。

- 主请求 08:55:28.988 发出，35.929 main 成功回包（6941ms），35.931 renderer 收到成功终态（6944ms），35.944 提示成功（6956ms）。记录到一次提交，阶段结果正常，没有记录到失败或冲突重试。
- 相比 08:17 样本成功提示 7698ms，本次减少 742ms。其中 RunAs 从 2612.953ms 降到 2199.923ms，少约 413ms；返回列表刷新从 857.402ms 降到 682.299ms，少约 175ms。这两项已解释大部分差值，RunAs 包含用户确认和系统启动，不能把总改善全部归因于删除打点。
- 主流程：卷查询 1156.606ms，原值快照 246.118ms，PATH 重建 212.009ms，令牌探测 241.160ms，broker 准备 1489.951ms（编译 265.328ms），RunAs 2199.923ms，action.execute 67.394ms，返回列表刷新 682.299ms。父子阶段不能重复相加。
- 写入路由 08:55:35.231 成功，35.232 开始 clean，main 于 35.234 将共享 revision 更新为 8；失效 13.880ms。下一次实际环境获取约 412ms，得到 revision 8；随后 envPathList 命中 revision 8。未观察到后续复用旧 revision 的情况。
- 返回列表在 35.927 完成，业务于 35.928 结算；main 35.929 回包，广播 spawn 在 35.937 才开始。本轮主请求仍不等待广播进程创建或退出。
- 广播启动调用区间为 35.937 至 36.777，839.704ms；通知进程 PID 5252，于 38.640 code=0 退出。当前脚本按要求没有内部日志，所以 code=0 只能作为进程终态观察，不能证明所有窗口已刷新环境，也不能拆分编译/原生广播耗时。
- envPathList 在 main 的总耗时 1115ms：35.941 发送命令，36.780 worker 执行 command-received（业务开始前），36.781 调用业务，37.050 业务完成，内部约 270ms。发送到命令回调约 839ms，与广播启动调用区间重合。这里明确分开消息回调前的等待与业务执行；没有底层 IPC 到达时间或事件循环阻塞探针，不将“同期重合”作为排他根因证明。
- 本轮无 `[WindowsPath][broadcast]` 子脚本日志，无 action.path 注册表细分阶段；仍有 64 条 action.transport-stage 诊断及 action started/completed，符合删除临时 PATH/广播打点、保留权限运输诊断的范围。此样本未调用服务停止/完整 CIM 进程表查询，不能拿它验证 CIM 打点清理效果或服务停止功能。

本轮只读日志并更新诊断记录，没有修改运行代码或执行测试。主请求已降到约 6.96 秒，不能据单次样本宣称固定收益；继续保持业务结果、通知进程终态和后续请求等待三个观察范围的区分。

## 2026-10-05 addPath 返回路径修正

`src/fork/util/PATH.win.ts` 的 `addPath` 原来使用 `attempt < 2` 的有限循环，TypeScript 无法从循环内部推导第二次尝试必然返回或抛错，因此提示并非所有路径都返回值。现在显式声明返回类型 `Promise<boolean>`，由原有 catch 分支控制循环终止：仅第一次写入遇到 PATH 原值冲突才继续，第二次失败始终抛出原错误；无需写入返回 false，写入成功返回 true。实际仍最多尝试两次，没有增加无限重试，也没有用兜底 false 掩盖写入失败。

操作仍由 fork PATH 工具函数执行，无新状态、IPC、配置或模块边界例外；环境缓存失效和业务结算后的后台通知维持现有归属与时序。本次仅修正返回路径并补注释，不运行测试、类型检查、构建或真实 PATH 写入。
