# Windows 权限方式实现与代码复查说明

本文面向 FlyEnv 维护者，记录首次权限选择改造的代码、处理原因，以及当前 Windows 帮助程序和 UAC 的完整调用链。实施依据为 [权限选择方案](windows-privilege-choice-plan.md)；既有帮助程序安装策略见 [v27 健壮性说明](windows-helper-resilience-v27.md)。

本文按实施轮次保留历史。**当前服务停止以[服务停止独立实施文档](windows-service-stop-implementation.md)及第二十四轮为准**：界面、MCP、退出统一调用 fork 模块 `stopService`，通用 Windows 目标发现已移除按实际 EXE 路径扩展全部实例的分支，并补齐退出入口、登记代次、失败终态及本轮查漏补缺。旧章节描述发生冲突时，以独立文档为准。

第二十一轮后的完整静态复查见 [服务停止链路 review](windows-service-stop-review.md)，其文末已追加源码处理状态。本文件中的统一入口和设计意图不能作为全部边界已经通过实机验证的结论。

## 第二十四轮：服务停止独立文档、注释与查漏补缺（2026-10-03）

按用户要求，服务停止新增/调整逻辑补充职责、判断原因、错误与终态清理注释，并集中到 [服务停止完整实施文档](windows-service-stop-implementation.md)。该文档第 2–6 节描述当前完整链路，第 8 节逐文件说明，第 9 节列本轮修正，第 7/10 节记录限制和待实机验收。

整理中处理：非驻留 -1 登记、插件独立 companion 漏停、重复停止提前成功、项目编辑/重启前置停止、启动证明在 Windows 权限采样间断开、StartTime/CIM 跨来源精度比较、短暂空 PID/旧 PID 删除、包装进程 PowerShell 绝对路径、Unix Base/PHP 严格结果、树循环、端口/进程查询失败及畸形输出伪空、端口工具固定监听者身份、Neo4j 精确目录与原子孙确认。

Go 查询失败及输出解析行为已调整，Go/TS Helper 源码版本同步为 **31**；未构建、替换二进制。未新增/运行测试、类型检查、构建、格式化或真实服务操作。静态核对不能代替 Windows/macOS 实机回归；保留用户确定的两类目标来源、确认父后信任后代、不全局扫描同 EXE、不默认强停数据库。

## 复查实施约束与操作契约

此次沿用既有应用级权限设置；不新增服务模块、Pinia store 或模块业务配置，不重复实现服务 start、stop、restart 生命周期。选择 UI 的输入属于 Vue 页面，持续请求属于 WindowsPrivilegeController，权限选择和全局执行队列属于主进程，真实服务进程及 PID 属于 fork 模块。

- 首次选择：主进程 WindowsPrivilegeCoordinator 所有；从真实权限需求开始，等待主窗口就绪后呈现；所有同时等待者共用一份选择；显式保存、取消、应用退出为终态，第九轮已移除选择超时。保存失败保持请求可重试，失效 choiceId 不能覆盖新请求。
- 切换设置和停用帮助程序：renderer 模块单例 WindowsPrivilegeController 所有，可跨设置页卸载存活；IPC code 200 为进度，code 0 或失败或六分钟超时为终态；相同操作复用 Promise，冲突操作应拒绝；终态移除监听及计时器。
- 授权执行：主进程协调 FIFO 租约，所有 fork 共用；业务 action 所有者负责 finally 释放；请求者退出清除其租约；排队期间改变方式应在执行前核验。已经运行的 action 不强行中断。
- 帮助程序安装：既有 AppHelper 单例负责检查、恢复和安装，服务子进程不拥有安装状态；首次安装由等待的业务请求触发；renderer 不并行发起修复。服务启停继续通过既有生命周期传递交互意图。
- 回归范围：并发选择、保存失败、通知失败、过期请求、排队模式变化、请求者退出、进度保留、终态清理、页面重进和服务失败状态；PowerShell 普通权限脚本可实跑，真实 UAC 和 SYSTEM 任务留作实机验收。

## 本轮 review 修复操作契约（2026-09-30）

- 沿用现有模块和状态所有者，不新增 Pinia、模块配置或通用服务属性。Cloudflare 实例对象负责跨页面请求、重入和终态清理，fork 负责实际隧道进程；code 200 保留状态，成功/失败/六分钟超时结束请求，相同命令共享 Promise，冲突命令拒绝，restart 仅在 stop 成功后启动。
- 数据库停止保留 mysqladmin/mariadb-admin 的优雅关闭；进程查询失败即结束，强制停止经统一权限入口，只有确认所属进程退出后才清 PID。ClickHouse 同时处理 companion，失败保留可重试的 PID。
- fork 出错、替换、退出统一回收旧 worker 的请求和权限 owner；旧消息不得新建租约，新 worker 的任务计数不得被旧 worker 清零。
- UAC 区分启动调用、等待退出和可信业务结果；只读动作允许重试，可能仍在执行的写动作继续阻止重放。管道需操作系统访问控制与连接方身份核验，不能将命令行可见的 nonce 当作身份凭据。
- 一次性 broker：WindowsActionPipe 的请求闭包拥有子进程、匿名流、就绪计时器和结果解析；READY 是中间事件，可信结果或创建失败结束正常请求，未知结果由调用方保留十分钟。不同 action 使用不同名称，同一写 action 的未知重放由业务执行器阻断；关闭 broker/父进程死亡仅回收传输，不推断管理员 action 已结束。
- 生命周期检查项包括停止拒绝后的 PID 保留、companion 失败、重复调用、进度非终态、请求超时、worker 异常但存活、旧消息与新请求交错。此轮用户授权修复与代码复核，没有追加运行测试或构建；验证记录据实区分静态检查与此前实跑。

## 路径防御补充的操作契约（2026-10-01）

沿用原有 main/fork 执行器及请求生命周期，不增加 renderer 操作、Pinia 或配置。系统程序定位由共享 WindowsSystemPaths 工具负责：从启动进程的 SystemRoot/windir 派生本机完整路径，校验格式及实际文件；不从 PATH、当前目录或用户同步环境寻找权限程序。业务请求仍由原执行器拥有，程序不存在或被策略阻止即按原错误链结束，不自动改选帮助程序。普通进程查询归 Process.win，保持六十秒超时；PATH 查询保持现有 PowerShell→reg.exe 的只读回退；首次选择、租约、PID 和停用生命周期均沿用前述契约。静态复核覆盖 PATH 缺失、非 C 盘系统、路径大小写、空格和特殊字符、根相对/设备路径、重解析点与跨账户 RunAs；实机测试记录另列，不以静态复核替代。

## Go Helper 路径修复操作契约（2026-10-01）

用户继续授权处理 Go Helper 的同类问题。沿用现有 RPC、模块及进程所有权，不增加配置或 renderer 状态。utils 负责 Windows 原生系统目录查询、完整程序定位及路径语法校验；module 的当前请求负责普通执行和终态错误，定位失败不得执行 PATH 中的同名程序，执行失败不得返回成功。进程结束/端口查询失败直接结束该请求；相同动作及服务交互继续由现有 fork/权限协调器管理，不另建全局操作队列。数据路径沿用每 SID、allowed-roots 与 ACL 边界。复核项为无 PATH、伪造 SystemRoot、非 C 盘、程序缺失或非文件、错误传播、UNC/设备/ADS、重解析点和 Windows/Unix 构建隔离。本轮修复源码并同步文档；依照 token-saver 技能未明确请求则不运行测试/构建/格式工具的规则，仅做静态检查，不能将源码修复称为已部署到旧 v27 二进制。

## 用户体验及迁移规则

Windows 进程能按现有权限完成的操作直接执行。只有真实权限拒绝，或已知必须写机器级状态的操作，才进入权限方式解析。首次解析时展示 UAC 和帮助程序的说明、当前动作名称，以及“以后可以在设置中重新选择”。两种方式均不预选，取消不写任何偏好。

用户选择 UAC 时，业务权限操作通过 Windows RunAs 获得一次管理员批准，没有新增常驻提权服务。用户选择帮助程序时，先检查原账户的帮助程序，必要时通过 Windows UAC 安装或修复；以后使用经过认证的管道请求。Helper 本身是 SYSTEM 常驻进程，仍有计划任务、身份检查和安装配置等系统行为。选择它不能承诺企业风控不再报警。

普通管理员账户与已提升进程不同。主进程和 fork 执行器分别通过继承当前令牌的系统 PowerShell 判断有效管理员角色，不能相信 renderer 传入的管理员布尔值。已经提升的执行进程直接完成动作，不检查 Helper、不启动第二次 UAC，也不自动更改下次普通运行的偏好。

沿用已有 `setup.windowsElevationMethod`，增加可缺省的 `setup.windowsElevationChoiceVersion`。只有明确选择时才原子保存方式及版本 1。旧版本默认就是 helper，因此只看到旧字段不能作为用户已经同意常驻帮助程序的证据；旧用户在首次确需授权时仍有一次选择机会。`revision` 是主进程本次会话内的同步序号，不持久化，也不是 Helper 协议版本。

在设置页主动选择帮助程序会检查或修复；首次弹窗选择帮助程序由原本暂停的业务请求执行安装，控制器不另外并行修复。设置和首次弹窗选择 UAC 都自动停用当前账户的旧 Helper，没有额外勾选项。偏好保存与停用是两个操作：停用被拒绝或失败仍保留 UAC，明确提示旧 Helper 尚未停用，用户可单独重试。管理员运行时仍可修改下次普通运行的偏好。

## 完整业务请求链

### Renderer 到 fork 的交互意图

1. 手动服务操作继续调用 `ModuleInstalledItem.start/stop/restart`、自定义服务或语言项目的原有生命周期。增加的 `interactive` 参数默认为 true。
2. 自动启动组显式传 false，经启动组 manager、runner、adapter 和目标生命周期逐层传递。侧边栏旧一键启动也遵循同一规则。click 可能携带 MouseEvent，因此只有显式 false 被解释为后台请求。
3. renderer 使用 `app-fork:<module>` 或 `app-fork-background:<module>`；二者复用 IPCHandler 原有 dispatcher。后台意图不通过复制一套启停代码实现。
4. main 用 `AsyncLocalStorage` 包住当前分发，ForkItem 在每次命令发送前捕获该意图并附在 Server 初始化消息中。
5. fork 接到业务消息时再将意图捕获进自己的 AsyncLocalStorage。异步 action 在 await 后仍保留自己的意图，不读取随下一条请求变化的全局标志。模块初始化、MCP 和无显式上下文的后台请求默认为非交互。
6. 主进程直接执行的 Node 函数和用户点击的数据目录重试也带交互上下文。系统启动目录检查默认不交互，窗口就绪后才允许恢复流程呈现首次选择。

独占版本切换的前置 stop 必须接收与 start 相同的参数；否则后台启动切换版本时仍会通过默认 stop 触发授权。前置 stop 返回错误或 false 即结束启动，并解除 single-flight；不能把 Promise 正常 resolve 等同于服务已停止。

### Helper.send 的三个执行分支

Windows 安装了权限 provider 后，非 helper 模块的 `Helper.send` 在读取二进制、key、计划任务和健康之前进入 `executeWindowsPrivilegeOperation`。调用点名字仍叫 Helper.send，实际业务不再必然触碰常驻程序。

执行器从 main 的 BaseDir、AppDir 派生业务根，保留原用户 Documents。需要 ACL 或自启动 SID 的操作在提升前捕获原进程 SID。动作名、参数数量、类型、目标范围和 reparse point 经固定动作生成器检查；不接受任意系统命令。

- 普通文件读写、Buffer 写入和删除首先使用 Node API；普通进程/端口查询、停止、DNS 和证书查询使用普通权限 PowerShell。成功直接返回，不要求已有偏好，不检查 Helper，也不为普通文件成功先启动令牌探测。
- 明确机器级写入包括系统 PATH、系统环境变量、系统证书导入和数据根 ACL 恢复。先确认执行进程有效令牌，已经提升则用原权限执行；普通进程进入方式解析。
- 普通动作失败时，`EACCES/EPERM` 或结构化 `windows_permission_denied` 进入方式解析；第十四轮起不再启动普通 PowerShell 复核。Node EPERM 也可能是共享锁，此类模糊错误可能进入一次授权，再返回真实占用错误。明确的 EBUSY、路径不存在、磁盘和格式错误直接失败；已提升进程仍失败时也直接返回错误。
- 需要提升时，main 解析明确的偏好，或等待首次选择。Helper 分支检查/安装后调用既有签名 RPC；UAC 分支进入一次性执行器。全局租约在真正执行前再次核验当前方式，用户排队期间切换后，旧请求明确失败并允许重试。
- 成功修改 PATH 或系统变量后，使 EnvSync 缓存失效并重新同步；直接执行和授权执行都做这一收尾。

原有无 provider 的工厂测试和兼容调用保留旧 fallback 策略。正式 Electron main/fork 已安装 provider，不会因为 Helper 失败自动转 UAC，也不会因为 Helper 修复成功自动把 UAC 偏好改回 helper。

### 首次选择的主进程生命周期

WindowsPrivilegeCoordinator 是唯一所有者，首次选择由 UUID 标识。并发请求共用一份 Promise 和一个窗口，界面未准备好时保留请求，ready 后呈现。用户不操作时一直等待；取消和应用退出统一拒绝等待者，第九轮已移除五分钟选择超时。旧 choiceId 不允许提交。保存失败保持原选择可重试，不释放业务请求。

成功保存后先确定等待者的终态，再读取展示快照和通知窗口。dismiss、publish 或日志失败均不撤销已提交选择，也不让已脱离 choice 字段的请求永久悬空。已确定的请求仍要在获得执行租约时检查当前方式。

后台只有“已经明确选择 helper”可以解析为 Helper，并且只做健康检查，不启动安装 UAC。未选择或已选 UAC 的后台权限请求返回 `windows_authorization_required`，由服务结果显示可重试错误，不主动弹选择/UAC。

## 当前帮助程序完整逻辑

### 身份、路径与常驻任务

`WindowsHelperIdentity.ts` 在原始账户中取得 SID、账户名和 CommonApplicationData known folder。SID 规范化后用 SHA-256 前 32 个十六进制字符派生 instanceId。跨账户 UAC 批准者不能替换原用户身份。

- 实例目录为 canonical ProgramData 下的 `FlyEnv/Helper/users/<instanceId>`。
- 程序为该目录下 `bin/flyenv-helper.exe`；同一目录下保存 `helper.key`、`allowed-roots`、`instance.json` 和受保护的启动日志。
- 任务为 `\FlyEnv\Helper\<instanceId>`，主体是 SYSTEM，ServiceAccount/Highest，登录触发 SID 是原用户。
- RPC 管道为 `\\.\pipe\FlyEnv.Helper.<instanceId>`，每个 SID 独立，不复用旧的机器级固定任务或管道。

Go 启动验证 instanceId 与 expected-user-sid 相符，当前运行身份必须是 SYSTEM。Windows 管道显式 DACL 允许 SYSTEM 和目标 SID，客户端 OS SID 必须等于目标 SID；不会因为另一账户属于管理员组就接受其业务 RPC。

### 检查与按需准备

`AppHelperCheck.ts` 依次检查可用的打包验证二进制、原账户身份、32 字节 key、精确任务及已安装程序指纹、签名 version 和 health。任务必须 enabled，且 SYSTEM、logonType 5、runLevel 1、唯一动作、精确程序路径/参数、唯一原用户触发 SID 全部匹配。健康结果必须返回当前 HelperVersion（现为 28）、有效正 PID、同一 SID 和 instanceId。

健康成功不表示 renderer 可以改偏好。Helper.send 的缓存 `enable/key` 在权限 revision 变化或传输失败后失效。普通动作只要成功就不使用这个健康链；确需 Helper 时才准备。

`Application.ensureWindowsHelper` 与手动安装 IPC 先获得同一全局租约，然后再次读主进程选择。交互请求进入 `AppHelper.initHelper`，后台只调用 AppHelperCheck。initHelper 共享一份 installation Promise，在 finally 恢复可重试状态。

1. 先健康检查，成功则不安装。
2. 仅管道不可达时，核对现有 key、精确任务和二进制后尝试 demand start，再等待健康，避免不必要 UAC。
3. 确需安装才生成安装脚本，以捕获的原身份、业务目录、HelperVersion（现为 28）和主备源路径构建配置。
4. 执行 Windows Helper 专用安装提权器。
5. 安装脚本结束后再次健康检查；恢复等待预算为 10 秒，安装后的健康等待预算为 30 秒，临时不可达退避，身份/版本等非暂态错误立即失败。
6. 成功回调与状态通知是显示或后置工作，异常只记录，不把已经健康的程序判成安装失败。Windows 成功回调不再递归恢复目录，避免持有安装租约时再次请求同一队列。

### 专用安装提权器与磁盘发布

`WindowsHelperInstaller.ts` 与业务 UAC 执行器是两个不同用途的通道。安装器把固定完整安装脚本 UTF-8 gzip/base64 包装，用系统 PowerShell 内联解压执行；沿用安装专用 ExecutionPolicy Bypass。业务 UAC 通过管道接收动作文本，没有该安装参数。两者均使用 NoProfile、NonInteractive、固定系统 PowerShell Modules，不经 cmd/BAT。

安装子进程先连接本次随机结果管道，发送 nonce 并等待 native broker 验证连接方、返回 READY 后才执行；返回 nonce、真实 exitCode 和有界 stdout/stderr，只接受第一份可信终态。启动阶段的原生 1223 是取消，脚本执行前无法连接/通过通道检查的专用退出码 73 是 pipe failure。launcher 输出 phase、childStarted、exceptionType 与原生码，明确未启动的托管异常也归入 launch failure；等待阶段异常不能作为未执行证据。180 秒等待到期或已退出但无可信结果均为未知，保留最多十分钟迟到通道。安装器没有业务执行器的 digest uncertain 集合，重试先检查真实健康，再由 SID mutex 保证发布互斥。

`static/sh/Windows/flyenv-auto-start-now.ps1` 的顺序为：身份/命名空间与管理员预检，取得当前 SID 的 Global 安装互斥锁，校验主备来源和安全路径，准备全部暂存文件，停止当前 SID 任务，逐文件原子发布并复核 ACL，注册精确任务，校验并启动。

保留 v27 的所有关键策略：必需备份存在；主文件存在时主备 SHA-256 一致；暂存文件匹配已校验备份；有效且安全的 32 字节 key 可复用；关键安装目录/key/config/allowed-roots 的 owner、ACL、reparse point 继续受保护。仅 sharing/lock violation 做有限重试，永久权限拒绝明确失败。逐文件 Replace/Move 是单文件原子发布，不是整个实例的事务；断电或中途失败可能部分完成，不能声称自动回滚或零停机升级。

任务授予原用户读取/执行权限以允许安全 demand start，不授予任务修改权；设置登录触发、失败重启及避免重复实例。失败保留可修复任务和文件，不退回旧 Helper 版本，不全局杀其他用户程序。发布包仍由 afterSign 从同一产物生成主备；第五轮修改 Go 源码，第六轮将 Go/应用端声明版本同步提升为 28，二进制仍待重新构建。

### Helper RPC 的认证、响应与失败

每次请求包含 key/request UUID、module、function、args、毫秒 timestamp、nonce、clientPid 和 clientExe。TypeScript 与 Go 使用一致的参数规范 JSON 和 HMAC-SHA256；object key 排序和 HTML 转义保持一致。

Go 获取真实命名管道客户端进程身份，核对目标 SID、claimed PID 与真实 PID、claimed executable 与实际路径，再检查签名、时间窗和 nonce 防重放。timestamp 允许前后五分钟，nonce 在缓存内防重放；动作分发只接受既有模块和方法，并继续应用 Go 路径范围等约束。进度 code 200 与业务终态分开。

签名失效允许清 key/enable 并保留同一传输方式重试一次。正式 provider 模式下，二进制/key/任务/版本/管道失败均返回原类型错误；不会静默改用户方式、并行安装或再次弹另一条 UAC 链。业务取消与安装取消分别结束当前操作，已经保存的偏好不回退。

Go 启动日志、main 安装 stage、Task state/LastTaskResult 和 health 共同定位故障。诊断是 best effort，不能保证企业策略在程序执行前拦截时仍有 Helper 自己的日志。

### 切到 UAC 后定向停用 Helper

`WindowsHelperDisable.ts` 以原进程身份构建精确任务和程序路径。只在整个实例目录不存在时快速结束；缺失 instance.json 可能是部分安装或损坏，仍应检查任务/进程。

停用脚本通过 Schedule.Service 获取精确任务，仅把 HRESULT 的 file/path not found 当作不存在，其余错误保留。核对 SYSTEM、logonType、runLevel、动作数、精确 executable/参数以及唯一原用户 SID 触发器之后，先 enabled=false，再 Stop 并等待。残留进程仅按精确实例 executable、SID 和 instanceId 过滤停止，再等待实例程序全部退出。

已有管理员令牌直接执行，普通进程通过全局队列申请一次 UAC。重复停用共用 Promise。保留安装文件、key 和其他用户实例，不清理身份不明的旧机器级任务。任务禁用后仍有进程或权限失败时明确返回失败；这类部分完成不恢复用户偏好，后续可重试停用或重新选择 Helper 修复。

## 当前业务 UAC 完整逻辑

### 一次性引导和返回值

`WindowsElevation.ts` 为每次执行生成 actionId、nonce 和随机管道。第十一轮起，native broker 创建安全管道并输出 READY 后，直接在 C# 后台任务内启动系统 PowerShell；普通权限使用 ProcessStartInfo 的非 shell 启动，UAC 使用 UseShellExecute、runas、Hidden，拿到句柄后独立 WaitForExit。broker 主线程异步等待连接、继续认证和回传结果，Node 不再启动额外 PowerShell launcher。`WindowsRunAs.ts` 保留供安装器和可替换 launcher 的回归测试使用。业务子进程的 EncodedCommand 只携带固定引导、nonce、管道名和脚本 SHA-256，较大业务文本不挤入 UAC 命令行，也不使用另一账户需要读取的 TEMP 脚本/结果文件。broker 自身使用固定短 EncodedCommand，从匿名 stdin 第一行读取代码、第二行读取业务载荷，以免增加后的 C# 代码触及 Windows 命令行长度上限。

子进程连接并发回 nonce，broker 核对真实连接身份后才发送脚本 JSON。子进程校验 UTF-8 SHA-256 与引导中固定值一致后执行。动作默认结果为 true，查询通过 `global:FlyEnvActionResult` 返回 string、array 或结构化对象。终态返回 nonce、ok、data/error 和 permissionDenied，普通输出不能作为成功证据。

父进程限制脚本文本和原始结果接收字节数，各为 8 MiB；这不是所有编码中间缓冲的总内存上限。broker 的匿名 stdout 包装字符串另有六倍转义大小限制。校验字段类型、nonce，只接受第一份可信终态。身份/帧/字段校验失败不执行成功分支。进程退出和管道回调存在调度差异，因此无结果时额外等最多一秒，再判断失败类别。

nonce 和 digest 只绑定当前执行，不是秘密身份凭据。新增 `WindowsActionPipe.ts` 用原用户令牌运行一次性系统 PowerShell broker，在原生 CreateNamedPipe 中设置受保护 DACL：原 SID 仅有限读写，不授予创建额外管道实例的权利；已启用的 Administrators 与 SYSTEM 可连接。FIRST_PIPE_INSTANCE 拒绝被抢先占用的名称，REJECT_REMOTE_CLIENTS 拒绝远程连接，最大实例数为一。

broker 根据 GetNamedPipeClientProcessId 获取真实 PID，核对当前会话和实际系统 PowerShell 路径；读取 nonce 后通过 RunAsClient 查询连接方 identification token。普通执行要求原 SID，提升执行（含 FlyEnv 已提升的直执行）要求 TokenElevation 与已启用的 Administrator 角色。客户端只授予 Identification，不允许 broker 借管理员身份执行动作，也避免跨账户查询依赖普通用户的 SeImpersonatePrivilege。系统接口依据为 [管道访问权](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights)、[GetNamedPipeClientProcessId](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getnamedpipeclientprocessid) 与 [ImpersonateNamedPipeClient 权限规则](https://learn.microsoft.com/en-us/windows/win32/api/namedpipeapi/nf-namedpipeapi-impersonatenamedpipeclient)。这些是代码所用 API 的依据，不代表真实 UAC 已验收。

broker 通过匿名 stdin 接收业务载荷；保持 stdin 开启作为 Node 父进程存活句柄，父进程退出/关闭后 EOF 使 broker 退出，防止遗留阻塞的命名管道进程。未知结果宽限期将 broker 与匿名流 unref，计时到期关闭 broker；不会据此终止已执行的管理员子进程。broker 依赖 .NET Framework 与 PowerShell Add-Type，可能产生编译器/临时程序集相关安全日志，企业禁用动态类型编译时明确失败，不回退到只有 nonce 的弱认证。管理员/SYSTEM 属于可信边界；本方案不保护应用免受已掌握管理员权限的恶意程序影响。

### 错误分类、未知结果与清理

- `windows_permission_denied`：异常 category/HResult 或异常链确认 UnauthorizedAccess/SecurityException，允许普通请求进入权限选择。
- `helper_execution_failed`：已得到认证业务失败，尽管名称是历史 Helper 错误码，业务 UAC 也复用它；不存在/格式/共享锁等不会触发权限升级。
- `elevation_uac_cancelled`：原生 1223，用户拒绝这次批准。
- `elevation_pipe_connect_failed`：子进程在执行 action 前无法连接结果通道，专用退出码 73。
- `elevation_launch_failed`：能够识别的 RunAs/系统 PowerShell 启动失败。
- `elevation_status_timeout`：launcher 被结束、无认证结果的普通退出或无认证结果的成功退出。子进程可能仍在修改状态，不能报告成功或“什么都没做”。

未知写动作的脚本 digest 放进当前执行进程的 uncertain 集合，同一脚本不能盲目重放。只读例外仅由固定动作白名单及内部 PID 快照查询声明，不接收 renderer 的只读标志；只读超时后允许重新查询。broker、匿名流和计时器 unref，保留最多十分钟迟到通道。迟到可信结果只记录 completed-late/failed-late、解除本次写动作 digest 限制并关闭资源，已经返回的超时 Promise 不变。宽限期过后仅关闭资源，不自动解除写动作 uncertain。

这一保护是进程内、按最终脚本文本的保护，不是跨重启持久事务账本。不同脚本、不同 worker 或重启进程不能据此推断上一次动作已结束。遇到未知终态，应先检查实际系统状态再决定重试；不能承诺多个动作的整个业务事务恰好执行一次。执行租约在业务 Promise 终态释放，未知管理员子进程并不一定已被结束；也不能声称此队列在未知状态下提供操作系统级的永久互斥。

### 固定动作及约束

- 文件读/write/buffer/rm：复用旧白名单校验和敏感路径限制；脚本执行前再次检查目标及祖先 reparse point。rm 用 ErrorAction Stop 保留真实失败。
- 系统 PATH：保留既有可管理 PATH/变量约束；提供 expectedPath 时用注册表原值比对后再写，避免覆盖用户等待授权期间的外部 PATH 改动。仍可能在多个注册表写入之间部分完成。
- 系统变量：变量名及值校验，保留 ExpandString/String 语义，发送环境变更通知，再刷新 EnvSync。
- 自启动：只针对既有允许任务名/应用程序，使用原用户 SID；关闭自启动失败也返回错误。
- 数据目录 ACL：只允许精确业务根，拒绝根盘、系统/Helper 安装目录及相关敏感祖先；给原用户所需访问权限，不扩大到任意 ProgramData 或 Windows。
- PowerShell 集成：业务根中的固定 flyenv.ps1 与原 Documents 的预期 profile；保留 profile 编码、管理块和原子写入。同一个动作内完成脚本和 profile，执行侧检查 reparse point；新链不读 Helper allowed-roots 文件。
- 进程/端口查询：普通 CIM/Get-NetTCPConnection，不以 Helper 健康作为前置条件。
- kill/killPorts：数字范围、数量上限 256，两类请求均去重；拒绝 PID ≤ 4、执行器自身及已列出的关键进程名/系统程序路径，不承诺识别全部 Windows 系统服务。前置快照共用保护策略，UAC/普通执行脚本在杀进程前再次核对 PID、创建时间和保护名单，并等待真实退出。目标自行退出是幂等成功，身份变化或查询失败必须返回错误。不能笼统拒绝 Windows 目录中的所有程序，因为 cmd/PowerShell/conhost 也可能是 FlyEnv 合法服务包装进程。
- DNS：普通权限 Clear-DnsClientCache 失败且明确是拒绝时才提升；hosts 写入成功但刷新失败仍为业务失败。
- SSL 查询：只读 LocalMachine Root，支持 DER/PEM，本地证书存在时比较 Thumbprint，防止同名旧证书被误认为当前 CA 已信任。
- SSL 导入：固定目录和证书名，经执行侧路径复核后写系统 Root；取消后生成的 .crt 可保留，下一次重新检查实际信任再请求导入。

Node 文件操作和脚本路径检查降低风险，但不是基于已打开文件句柄的整体事务；瞬间路径/进程变化仍需要结合操作系统权限和既有 Go 服务约束。Helper RPC 的既有 kill 方法接收原参数，不携带 UAC 脚本的创建时间字段；本次未升级 Go 协议，不能把两条传输的所有 PID 防复用能力说成完全一致。

## 并发与状态同步

主进程 FIFO 租约所有者是具体 Application/IPC 对象或 UtilityProcess 实例。释放必须同时匹配 UUID 与 owner，其他 fork 不能释放自己的邻居。退出清理先批量删除该 owner 的全部租约，再一次唤醒队列，避免把同一退出者第二份租约错误授予后又试图拒绝已经 resolve 的 Promise。

WindowsPrivilegeBridge 按 owner 记录 pending，避免重复在途请求，缓存最近 128 份终态避免重复 IPC 再安装/再排队；这是有界会话缓存，不是持久去重。客户端 acquire 超时发 cancel；main 后续拿到迟到 lease 则归还。第九轮起 resolve 不设置客户端截止时间，首次选择可持续等待用户。发送响应失败清理 owner，worker 自然退出或主动销毁同样清理。不因一个 fork 退出取消其他请求共用的首次选择。

主进程、主窗口、托盘及 fork 应用快照时过滤旧 revision。全量 Server 广播也可能晚于专用权限广播，renderer 替换其余字段后恢复较新的权限快照。配置普通整体保存保护权限字段，只有专用提交入口改变它们，防止其他设置页用旧 config 快照覆盖新选择。

WindowsPrivilegeController 负责已发出设置/选择/停用请求的六分钟 IPC 超时、code 200 进度保留、终态 listener/timer 清理、全局 busy、操作 Promise 及 choice 队列；弹窗展示等待用户没有计时器。完全相同的操作复用 Promise；选择不同方式或同时要求停用等冲突命令明确拒绝，不能返回另一个动作的成功结果。main 结束或替换选择时同时结算 AsyncComponentShow 并卸载，随后才呈现新的 choiceId。

## 本轮逐项修正的问题

1. **已提交选择的等待请求悬空。** select 从 choice 字段脱离请求后等待快照/发送通知，异常或退出会失去终态。现在保存成功即 settle 等待者，通知失败单独记录；cancel 同样不依赖窗口通知成功。
2. **退出者第二份租约被授予。** releaseOwner 逐个 release 会在清理中唤醒同 owner 的下一份。改为先全部移除再唤醒幸存者。
3. **响应发送失败留下队列头。** bridge 的 safeReply 失败回收 owner；ForkItem 不再吞掉此处 postMessage 异常，交给桥接层统一清理。
4. **排队期间换方式仍安装/执行旧方式。** UAC、Helper 业务及自动/手动安装在获得租约后再次向 main 核验当前选择，失败立即释放，用户决定重试。
5. **renderer 不同操作借用旧 Promise。** 增加 operationKey，相同参数防重，不同目标拒绝，避免界面以为已经切成另一种方式。
6. **已有实例缺配置被跳过停用。** 快速不存在判断改看整个实例目录，缺失 instance.json 仍检查受验证任务/进程。
7. **兼容 ProcessKill 吞掉 Windows 失败。** Windows 保留严格错误，修复 MySQL 分组显式吞错及 Cloudflare Tunnel Windows 停止失败，其他仍使用兼容入口的网关/N8N 也能获得错误；Unix 保留原语义。
8. **版本切换遗漏后台参数与前置失败。** Module/Customer 前置 stop 传 interactive，检查每个终态，停止成功再改变当前版本；InstalledItem/CustomerExecItem 显式 catch 前置 await，结束 Promise 并释放 single-flight。
9. **重启取消 stop 后继续 start。** 标准服务与语言项目仅在 stop 成功后 start，避免重复授权窗口和覆盖旧 PID。
10. **项目停止进度被当失败终态。** code 200 保留运行中和 IPC listener，最终失败保留 PID。
11. **进程已结束但结果回调稍晚。** 业务执行器增加一秒有界结果等待，消除成功误判未知；第一份认证终态固定，字段校验补 permissionDenied 类型。
12. **未知阶段新连接拖住退出。** 新接受 socket 使用宽限期且 unref，避免只为迟到回收让 FlyEnv 常驻。
13. **安装器无结果被误判启动失败。** launcher 普通退出/成功却无认证结果均为未知，保留迟到通道；明确 native launch failure、1223、73 仍分别处理。
14. **状态通知异常改变安装判定。** AppHelper 状态通知安全隔离，实际安装成功/失败只由检查、脚本和健康链判定。
15. **全量广播覆盖新选择或影响窗口就绪。** renderer 保护权限 revision；初始化同步失败提示后仍发送 ready，某个窗口 publish 失败继续通知其余窗口。

## 全部改动位置与原因

以下路径相对于仓库根。代码使用中文注释说明状态所有者、安全前提、终态顺序和异常原因；import 调整及格式变化随所在逻辑说明，不给每条语法添加重复注释。JSON 不支持注释，其改动解释集中在本节。

### 新增生产文件

- `src/shared/WindowsPrivilege.ts`：类型/确认版本、有效令牌、AsyncLocalStorage、provider、租约核验和快照，保持 main/fork 共用协议。
- `src/main/core/WindowsPrivilegeCoordinator.ts`：唯一选择窗口、原子提交、取消和 FIFO，防止每个模块独立决定授权。
- `src/main/core/WindowsPrivilegeBridge.ts`：UtilityProcess 请求去重、响应、owner 清理，让 fork 可以等待 main 决策。
- `src/fork/WindowsPrivilegeClient.ts`：fork provider 与请求超时，不把 renderer 引入业务执行进程。
- `src/shared/WindowsPrivilegeOperation.ts`：普通权限优先及管理员/Helper/UAC 分流，取消 Helper 安装前置依赖。
- `src/shared/WindowsElevation.ts`：普通/UAC 一次性管道、结构化终态、未知保护和迟到清理。
- `src/shared/WindowsHelperDisable.ts`：用户选择 UAC 后定向停用旧实例，保留以后可修复状态。
- `src/render/components/Setup/WindowsElevationMethod/Controller.ts`：跨页面请求所有者，集中重入、IPC、提示及清理。
- `src/render/components/Setup/WindowsElevationMethod/Choice.vue`：首次说明与按钮，只有页面输入，不拥有长请求。

### Main 与 shared 调整

- `src/main/Application.ts`：初始化协调器/provider、延后呈现、安装入口、广播/通知保护、目录恢复和退出清理，删除静默方式变更。
- `src/main/core/IPCHandler.ts`：权限管理命令、后台分发和主进程交互上下文，安装/检查入口按明确选择限制。
- `src/main/core/ConfigManager.ts`：确认标记、专用原子保存、整体设置保存保护。
- `src/main/core/ForkItem.ts`：每条命令捕获意图、桥接、响应失败传播、worker owner 清理。
- `src/main/core/ForkManager.ts`：先注入桥再创建 worker，广播覆盖普通池及专用进程。
- `src/main/core/ServerManager.ts`：同步确认标记，避免默认方法被误解为同意。
- `src/main/core/AppHelper.ts`：隔离状态通知异常，不影响真实安装判断。
- `src/main/core/AppNodeFn.ts`：关闭 Windows 自启动失败不再伪报成功。
- `src/main/utils/ServerPath.ts`：非交互权限不足延后恢复，启动时不绕过选择。
- `src/global.d.ts`：补方法确认、revision、请求意图和有效令牌展示类型，明确它们各自作用。
- `src/shared/WindowsHelperState.ts`：三个权限错误码及跨 IPC 识别，区分拒绝/取消/需要交互。
- `src/shared/WindowsHelperFallback.ts`：新链复用校验与脚本，使用 main 可信根、结构化查询及创建时间，不依赖 Helper allowed-roots/TEMP；旧兼容构造器保留。
- `src/shared/WindowsHelperInstaller.ts`：完善无认证结果的未知分类，避免引导盲重试。
- `src/shared/Process.ts`：Windows 查询直接普通权限，停止通过统一路由并保留失败，保护仍用兼容入口的调用方。
- `src/shared/Process.win.ts`：取消普通进程枚举的 Helper 前置检查，保留原查询超时和临时 JSON 清理。

### Fork 与服务调用点调整

- `src/fork/Helper.ts`：在资源检查前分流，revision 清缓存，正式模式禁自动 fallback，签名重试保持传输方式。
- `src/fork/index.ts`：挂接客户端 provider、消费权限消息及独立交互上下文。
- `src/fork/Fn.ts`：Windows root 删除失败保留结果，避免取消后调用方继续按删除成功处理。
- `src/fork/module/Base/index.ts`：通用 Windows 停止使用严格接口。
- `src/fork/module/LanguageProject/index.ts`、`ModuleCustomer/index.ts`、`Php.win/index.ts`：项目/自定义/PHP 停止不吞权限错误，父子 PID 清理以真实终态为准。
- `src/fork/module/Neo4j/index.ts`、`Temporal/index.ts`：Java/companion 停止保留 Windows 失败；Temporal UI 未停不误报父服务整体成功。
- `src/fork/module/Mysql/index.ts`、`CloudflareTunnel/CloudflareTunnel.ts`：补查发现的分组/隧道显式吞错。
- `src/fork/module/Tool.win/process.ts`、`Tool/process.ts`：进程/端口工具把权限失败交给 ForkPromise。
- `src/fork/module/Tool.win/alias.ts`：系统变量写入失败保留，避免 alias 假成功。
- `src/fork/module/Host/index.ts`：Windows hosts/DNS/授权错误保留；DNS 使用统一权限入口。
- `src/fork/module/Host/SSL.ts`：信任查询按实际证书检查，取消后重试重新导入，Windows 授权错误保留。

### Renderer 生命周期及入口调整

- `src/render/components/Setup/WindowsElevationMethod/index.vue`：未选择展示、管理员说明、切换/停用/修复绑定控制器，页卸载不丢操作。
- `src/render/util/GlobalIPCOn.ts`：权限广播/choice/dismiss 交给控制器，屏蔽不适用的 Helper 通知并保护全量快照。
- `src/render/main.ts`：mount 后同步权限、ready 前允许提示错误后继续就绪。
- `src/render/store/app.ts`：现有应用偏好增加显式确认类型，不创建新 store。
- `src/render/components/Aside/Index.vue`、`src/render/core/ASide.ts`：手动/自动意图传到旧一键及新启动组。
- `src/render/components/StartupGroup/class/StartupGroup.ts`、`StartupGroupManager.ts`、`StartupGroupRunner.ts`、`StartupGroupRuntime.ts` 和 `src/render/components/StartupGroup/type.ts`：逐层传参数，复用既有 lifecycle/controller，不在启动组存进程真相。
- `src/render/core/Module/Module.ts`、`ModuleInstalledItem.ts`：参数传递、停止错误聚合、独占前置失败及重启取消保护。
- `src/render/core/ModuleCustomer.ts`：自定义服务对应保护、停止进度保留和失败恢复。
- `src/render/components/LanguageProjects/ProjectItem.ts`：项目通知与授权意图分开，停止进度保留和重启失败阻断。

### 文案、脚本与记录

`src/lang/{ar,az,bg,bn,cs,da,de,el,en,es,fa,fi,fr,hi,hr,hu,id,it,ja,ko,nl,no,pl,pt,pt-br,ro,ru,sv,tr,uk,vi,zh,zh-hant}/setup.json` 共 33 种语言新增核心解释、设置重选、管理员状态、停用提示、失败/超时及按钮文案。详细动作名先在 en/zh 补齐，其余沿既有英文回退；测试验证核心 key、operation 插值与 message 编译。

`package.json` 增加 `test:windows-privilege-choice`、`test:windows-privilege-renderer`、`test:windows-privilege-edge` 三个手工回归入口，没有新增运行时依赖。

- 新增 `scripts/windows-privilege-choice-test.ts`：主进程选择/队列、桥接去重、AsyncLocalStorage、后台意图、固定脚本解析、普通文件/进程/证书实跑。
- 新增 `scripts/windows-privilege-renderer-test.ts`：真实控制器 VM、进度/清理/超时/失败、冲突操作、页面重进、Vue 编译和 33 语言。
- 新增 `scripts/windows-privilege-edge-test.ts`：通知失败、owner 批量回收、响应断连、排队换方式、独占前置停止/重启、项目进度、缺配置实例停用和管道迟到回归。
- 调整 `scripts/renderer-operation-boundaries-test.ts`：权限 UI 绑定控制器，不拥有 IPC。
- 调整 `scripts/module-lifecycle-single-flight-test.ts`：增加意图参数仍保留既有 single-flight 和等待旧版本停止。
- 调整 `scripts/startup-group-test.ts`：自动入口 false 和手动参数传递的来源断言。
- 调整 `scripts/windows-helper-state-test.ts`：检查正式协调器，不再要求旧自动方式恢复。
- 调整 `scripts/windows-helper-elevation-test.ts`：安装器普通退出/成功却无认证结果仍为未知。

`docs/task/windows-privilege-choice-plan.md` 保存设计及上一轮实施记录；本文集中完整逻辑、改动原因及补查结果。用户提供的 `docs/task/7e5c45f68d567531af2d047e0f0a503b.png` 是现象依据，未修改图片。

## 验证证据与验收边界

本轮批量执行 19 项针对性脚本，全部通过：windows-privilege-choice、windows-privilege-renderer、windows-privilege-edge、windows-helper-state、windows-helper-send、windows-helper-resilience、windows-helper-renderer-controller、windows-helper-fallback-plan、windows-helper-install-ipc、windows-helper-elevation、windows-after-sign-helper、helper-version-sync、helper-contract-check、renderer-operation-boundaries、module-lifecycle-single-flight、hosts-idempotent-write、service-process-exit-safety、neo4j-service-lifecycle 和 language-assets。名称对应 scripts 下的 `*-test.ts` 或 `*-check.ts`。Helper contract 的三个未被当前 TypeScript 调用的方法提示是现有提示，并非本轮失败。

修改的 TS/Vue 文件 ESLint、格式检查和 `git diff --check` 通过；main/fork 两个入口 esbuild 打包通过。完整 `tsc --noEmit` 仍有 10 条既有诊断，位于 Linux 构建的 packageCategory、DNS 类型/Resource、Image jpg/avif 类型、Podman/BrewFormula 返回值和 Plugin DOM 迭代器；本次修改文件未产生新诊断。

另复跑两项旧回归：startup-group 在原有 fetchInstalled 结构断言处失败（期望旧 else 分支，目前已由插件路径和统一 settle 实现）；startup-hosts-sync 期望 renderer mount 前调用 synchronizeHostsAtStartup，目前基线不存在该调用。二者的来源断言已与当前仓库基线不同，没有为了让旧断言变绿恢复其旧实现；不能把这些结果描述成整个仓库通过。

测试仅对仓库内临时目录、测试自己启动的普通子进程和只读系统查询执行，不通过测试自动弹 UAC、修改系统 PATH、导入 Root 证书或停用真实 SYSTEM Helper。

发布前仍须在 Windows 测试机覆盖：从未装 Helper 的普通用户；旧 v27 Helper 改选 UAC；管理员组但未提升、真正已提升和另一管理员账户凭据；UAC 成功/拒绝/长等待；企业禁止 PowerShell/EncodedCommand/命名管道；SYSTEM 任务停用、恢复、部分安装；等待期间 PATH、PID、端口和路径变化；多个独立动作的部分完成；主窗口销毁、fork 退出、业务子进程超时后迟到结果。

UAC 会产生 Windows 自身提权及 PowerShell 行为日志。当前改造消除未选择用户的自动常驻 Helper 依赖，使用户可明确控制方式，不承诺规避安全产品或适配所有企业策略。已有安全文档的多文件发布、只读目标、Global mutex 抢占和无自动版本回滚边界继续有效。

第三轮原始代码复查意见见 [Windows 权限方式代码复查报告](windows-privilege-choice-review.md)，本轮核对与处理结果如下。前面的 19 项测试、lint、格式和构建结果属于第三轮修复之前，不能作为下面新增代码已通过验证的证据。

## 第三轮 review 处理记录（2026-09-30）

### Major 的核对与修改原因

1. Cloudflare 端到端吞错成立。修改 fork `CloudflareTunnel/index.ts` 的 stop 入口使异常 reject；renderer `core/CloudflareTunnel/CloudflareTunnel.ts` 的实例拥有请求、六分钟超时、通知及终态清理，同命令复用 Promise、冲突返回 false，code 200 不清监听。停止失败保留 PID/run，restart 在 stop 成功后才 start，start 失败也返回 false。WeakMap 保存 Promise，不把请求状态混入模块 Storage/IPC 序列化。
2. ClickHouse 吞错成立。`ClickHouse/index.ts` 主进程和 CH-UI 停止失败都在 Windows 传播；版本 PID 文件在 companion 成功之后才清除。额外补上 `_stopAllServers` 的外层吞错，以及父进程已经退出、重试时仍必须处理存活 companion 的边界。Unix 尽力停止语义保持原样，CH-UI 的重试清理顺序统一。
3. MySQL/MariaDB 单实例停止缺口成立。两文件 `_stopServer` 保留原有数据库管理程序的优雅关闭，先用可信快照核对所属进程；查询失败直接 reject。优雅关闭失败使用 ProcessKillStrict，取消/拒绝不能继续清 PID。退出核对改用 `fetchStopProcessListLocal` 绕过 main 350ms 快照缓存，仍存在的目标 PID 即保守失败，不把不可读 CommandLine 当成退出。仅确认退出后移除应用 PID 文件并发成功。日志不再输出含口令的命令或完整 exec 错误。
4. 内置 `_onStart` 未绑定是误判。`render/store/brew.ts` 创建生产 Module 时已执行 `module.onItemStart.bind(module)`，传到 installed item 的已经是绑定方法；startExtParam 与独占前置停止并非死代码。本轮不增加重复 bind。此前原型/stub 回归不能替代生产接线场景，生产接线仍列入后续验证清单。
5. Base reject 后副作用成立。`Base/index.ts` 查询失败后立即 return，不继续清 PID；成功进度从停止前移到停止完成后，避免其他消费者提前显示退出。
6. UAC 托管启动异常被误分类成立。新增 `WindowsRunAs.ts` 将 Process.Start 和 WaitForExit 分为 launch/wait 两阶段，输出是否已拿到子进程句柄、异常类型和原生码；启动调用失败且未启动才允许按 launch failure 重试，不凭异常名字或数字退出码推断写操作没执行。执行脚本前 pipe failure 的 73 另带明确标记，wait 阶段同号原生异常不能混成 pipe failure。`WindowsElevation.ts`/`WindowsHelperInstaller.ts` 共用分类，安装器没有业务 digest 永久锁。
7. 系统 PID 保护不足成立。新增纯策略 `WindowsProcessSafety.ts`，前置 CIM 快照与执行脚本共用关键进程名/路径名单，并保护小 PID 与自身。`WindowsHelperFallback.ts` 同时补上两类请求去重、执行前第二次身份检查，以及 Stop-Process 后等待退出。目标已自行退出可成功；复用为另一个进程必须报错。v27 Go RPC 不接收创建时间，仍不能声称它与 UAC 有完全一致的原子防复用能力；本轮不改 Go 二进制、版本和主备 SHA 策略。
8. fork 幽灵 owner 成立。`ForkItem.ts` 用 WeakSet 标记退休进程，在所有 bridge 前拒绝旧消息；响应期间 owner 已退休则抛错让 bridge.detach 回收。error 即主动退休/终止，不等待未来的 exit；替换先回收旧任务再登记新任务，旧 spawn/exit 不复活旧进程或重置新任务计数。postMessage 失败同样退休，清理语言 ACK、业务回调与权限 owner。额外处理同步 terminal hook 重入：退休时先提交退出状态、重置生命周期、摘除整批旧回调，再发布终态；hook 重建的 worker 被后续 dispatch 复用，旧清理不扣减新计数。整个 ForkItem 销毁后禁止 hook 再创建子进程。

### Minor 的关联处理

- 管道原生身份边界：新增 `WindowsActionPipe.ts`，业务执行器和安装器都使用受限 ACL、真实 PID/会话/映像路径与 identification token 核验；同用户普通进程不能仅凭命令行中的 nonce 伪造管理员成功。完整逻辑和新增 Add-Type 依赖见上文。安装器增加先握手/READY 再执行和首份终态守卫。
- `WindowsPrivilegeOperation.ts`：重复 PID 快照去重，只读动作允许重新查询；Node 文件操作执行前、mkdir 后再次运行同一组路径约束。UTF-8 BOM 读取统一移除，与 PowerShell 文本读取一致；这仍不是以打开文件句柄实现的无竞态事务。
- `WindowsHelperDisable.ts`：原令牌探测目录的 EACCES/EPERM 不等于未安装，允许后续已授权维护脚本处理；ENOENT 才跳过，其他磁盘/路径错误保留。
- `ConfigManager.ts`：字符串 setup 键也经过对象补丁保护，两个权限叶子及其子键不能绕过专用原子提交。确认版本常量放到 renderer 可用的纯数据 `WindowsHelperState.ts`，由 `WindowsPrivilege.ts` 重导出；Application、IPCHandler、GlobalIPCOn 与设置页不再写散落的版本字面量。
- `GlobalIPCOn.ts`：更新 revision 的全量 Server 广播同时更新 AppStore；`Application.ts` 取消没有权限监听器的托盘专用权限广播，保留其既有状态同步路径。
- `ProjectItem.ts`：停止请求在模块局部 WeakMap 中共享，六分钟超时和同步发送失败均结束 loading、保留 PID、返回 false，restart 被阻断；后台 sudo 缺凭据不弹密码框，启动组接收失败说明。通知/交互参数仍分别处理。
- `Tool/process.ts`：只保留 Windows killPorts 严格失败，恢复 Unix 原有尽力停止策略。Windows DNS 刷新失败（包括 DNS Client 服务禁用等非权限原因）仍使 hosts 写操作报告失败；hosts 可能已经写入，发布说明应明确这种部分完成状态。
- `AppNodeFn.ts`、`NodeFn.ts`、AutoLanch 设置页：Windows 自启动失败回传 message/errorCode，页面兼容其他平台旧字符串，不会向用户展示对象或丢失授权取消码。
- 权限设置 UI：停用选项明确标注 UAC，仅在下一次可切换时展示，已经选择 UAC 后用独立停用按钮；Controller 不重复取消 main 已关闭的弹窗，冲突使用明确的 busy 文案。33 个语言 setup.json 增加该 key，说明用户需要等待当前授权操作结束。
- application:reset 会清掉权限确认标记，这是重置配置的结果；下一次确需权限重新展示首次选择，两项继续不预选，不因磁盘上仍有 Helper 而自动恢复同意。

### 静态检查及后续验证

本轮实施按原始 review 逐条追踪入口、异常传播、PID 清理时序、owner 生命周期和文档口径，`git diff --check` 通过。没有新增/执行测试、类型检查、格式工具或构建，也没有弹真实 UAC、安装/停用 SYSTEM 任务、修改系统 PATH 或根证书；前轮通过记录不追认为本轮通过。

原有测试中的 Node net 假客户端和旧 Start-Process 源码断言不能证明新 native broker 可用；后续验证必须使用具备 Identification 和匹配真实 PowerShell 映像的客户端，覆盖同 SID 非提升伪造、跨管理员 SID、名称抢占、远程连接拒绝、父进程死亡、超大结果、等待异常、迟到结果、broker 编译受限以及生产 Module 接线。此清单记录所需验收，不声称已实跑。

## 第四轮：程序定位与业务路径防御（2026-10-01）

用户提出 PowerShell 可能不在 PATH。第三轮的 UAC、原账户身份、令牌探测、Helper 安装和一次性 broker 已使用系统绝对路径，但定位函数只拼接 SystemRoot，并没有充分校验；进程查询、环境同步、PATH 查询及 shell 初始化仍有裸 `powershell.exe` 回退。证书导入脚本使用裸 `certutil`，自启动工具缺失时回退裸 `schtasks.exe`，这些入口不能认为已完整防御。本轮按相关调用链补齐，而不是仅修改 UAC 启动器。

### 系统程序定位规则及原因

新增 `src/shared/WindowsSystemPaths.ts`，供 Windows 进程层复用，不新增业务状态。

- 环境键按大小写不敏感读取；优先使用 FlyEnv 启动进程继承的 SystemRoot，其次 windir。只有两个键都缺失才尝试 SystemDrive\\Windows，最后兼容 C:\\Windows。非 C 盘系统不会优先误用 C 盘同名程序；已提供但格式错误或空值会明确失败，不静默换目录。
- 系统根目录必须是带盘符的完整本机路径，拒绝根相对、盘符相对、UNC、设备命名空间、ADS、控制字符、父目录穿越和尾部点/空格。程序路径通过 win32.join 派生，程序名只接受固定 exe 文件名，禁止借文件名传入目录。
- `windowsPowerShellPath` 负责纯计划构造，保留原有显式 SystemRoot 参数；`resolveWindowsPowerShellPath` 和 `resolveWindowsSystemExecutable` 在真正启动前用 stat 确认是文件。文件缺失、目录冒充程序或不可访问都不回退 PATH/当前目录；Windows 启动失败、应用控制策略失败仍由调用点原有错误链处理。stat 不证明签名、ACL 或执行一定成功，检查与启动也不是原子事务。
- 该工具不依赖 EnvSync 或 HelperIdentity，避免环境同步为定位 PowerShell 再触发自身的循环依赖。权限程序固定为系统 Windows PowerShell，不能把用户终端的 PowerShell 7/自定义 shell 当作同一权限运行时。
- 当前 Windows 发行配置为 x64，使用 System32，未新增 ia32 支持。直接把 Sysnative 路径传给已提升的 64 位子进程会遇到该别名不可见的问题，故没有加入不区分执行上下文的 Sysnative 回退；未来增加 ia32 应分别处理普通启动器、broker 和已提升子进程。

### 本轮逐文件处理

1. `WindowsHelperIdentity.ts`：保留纯路径导出，SID/known-folder 捕获及任务查询真正执行时改用 resolve；ProgramData 实例路径要求完整本机盘符路径，拒绝根相对、网络/设备路径和 ADS。实际安装仍使用系统 known-folder，跨管理员账户不会换目标 SID；每 SID、SYSTEM 任务及主备 SHA 策略沿用原设计。
2. `WindowsActionPipe.ts`、`WindowsElevation.ts`、`WindowsPrivilege.ts`、`WindowsHelperInstaller.ts`：broker、业务执行器、令牌探测及安装开始前都校验系统程序。令牌探测的同步路径检查放入缓存 Promise 链，缺失时调用者收到 rejection，缓存清空可重试；安装的纯计划仍可独立构造，实际安装先检查再创建 broker。路径带空格不会经过 cmd 拆分；RunAs 的 FileName 与参数独立传递，原账户路径及数据仍经转义/编码和管道交付。
3. `EnvSyncLocal.ts`：环境同步及返回的 cmd/PowerShell 路径使用同一定位规则，删除裸命令和 PowerShell 7 替代；系统目录不再从用户注册表 ComSpec 或同步后的 SystemRoot 推导。同步自身限定内置 PSModulePath；PowerShell 缺失/查询失败仍回退进程环境，路径字段缺失保留 undefined，实际权限入口明确报错。PATH 补充项的 System32/WindowsPowerShell 目录从实际系统根派生，不固定 C:\\Windows。原有可选 Podman PATH 项没有承担权限程序定位职责。
4. `Process.win.ts`：普通 CIM 查询改用 execFile、参数数组和 EncodedCommand，直接从 stdout 读取有界 JSON；删除 TEMP JSON 和双引号路径插值。保留六十秒超时，增加 10 MiB 输出上限及内置模块环境。严格入口继续传播错误，原有显示用宽松入口仍记录后返回空列表。端口/loopback 查询直接执行完整 `netstat.exe` 路径及参数，不再套 PowerShell；保持相同超时和输出限制。
5. `fork/util/PATH.win.ts`：机器 PATH 只读查询的 PowerShell 和 reg.exe 回退都定位到系统完整路径；PowerShell 使用内置模块环境。保留读取未展开 PATH、比较快照及写入冲突处理，不把 PATH 缺失当成允许写入空快照。
6. `Tool.win/init.ts`：CurrentUser 执行策略配套尝试同样使用系统完整路径及内置模块环境；失败继续沿用初始化 warning/degraded 结果，机器/组策略不会通过此次修复被绕过。
7. `Tool.win/path.ts`：Erlang 的既有 LongPathsEnabled 尝试改为固定内联脚本、完整程序、参数数组和六十秒超时；不再创建临时 ps1、拼接路径、Unblock-File 或 chdir 到缓存目录。该操作保留既有当前权限下尽力执行的语义，不额外发起授权；失败不影响后续 PATH 设置，不能据 PATH 设置成功声称 LongPathsEnabled 已开启。
8. `Tool.win/index.ts`：设置页打开系统环境变量窗口的 UAC 入口同样使用完整系统 PowerShell 和实际 System32 路径；保留 rundll32→SystemPropertiesAdvanced 的既有回退。
9. `Sudo.ts`：旧兼容 Windows 提权启动器改为 execFile + 编码脚本 + 单引号转义的精确 FilePath，删除 cmd 字符串二次解释和 EnvSync.PowerShellPath 依赖；新权限业务仍走 WindowsElevation，旧兼容批处理/状态文件机制没有在此替换成新协议。
10. `WindowsHelperFallback.ts`：所有计划固定系统 PowerShell；旧 shell integration 真正执行时也检查程序。自启动/证书脚本通过运行时 `[Environment]::SystemDirectory` 获取 schtasks/certutil 完整路径并确认文件，不存在则失败，不裸命令回退。证书文件使用完整路径，不切换到业务目录后解析 certutil。敏感目录与 hosts 白名单使用实际系统根，不把其他盘的 C:\\Windows\\... 同名路径当作本机 hosts 例外。
11. `WindowsProcessSafety.ts`：关键系统进程的路径保护从运行时 SystemDirectory 推导系统根，避免用户覆盖环境变量改变匹配规则。

### 业务文件路径的边界

`WindowsHelperFallback.cleanAbsPath` 在原有 allowed-root、父目录穿越、根目录与 reparse 检查上补充：只接受完整盘符路径或带 server/share 的 UNC；拒绝 `\目录`、`C:目录`、`\\?\`/`\\.\`、ADS、控制字符、Windows 无效字符、尾部点/空格及 CON/NUL/COM/LPT 等设备名（包括扩展名形式）。不再静默 trim 后验证却让 Node 使用原始参数，降低 Node、PowerShell 和 Win32 三者解释差异。合法普通空格、中文、单引号、美元符、反引号和百分号不会仅因这些字符被拒绝，进入脚本时仍通过字符串转义/编码传递。

用户 Documents 可被重定向到 UNC，仍沿用 main 的实际 known-folder 和允许范围；这不保证另一个管理员账户拥有该网络共享的凭据。跨账户 RunAs 访问被拒绝时返回真实错误，不伪造成功，也不把失败归结为路径缺失。系统程序及 Helper 实例部署位置使用本机路径。

原有执行前及 mkdir 后 reparse 检查继续有效，但并非文件句柄事务。Node 的 symlink 检查仍是可见路径的检查；不可遍历的路径及任意重解析标签、校验后瞬间替换路径等场景不能声称已完全消除竞态。超长路径、企业网络共享和特殊文件系统也需要实机覆盖。

### 保留的范围与验证事实

本轮静态追踪了新权限链及上述间接入口，`git diff --check` 通过；没有新增/运行测试、类型检查、格式工具或构建，没有弹真实 UAC 或修改系统设置。前轮测试结果不作为本轮结果；缺 PATH、D 盘系统、大小写环境键、程序缺失/被限制、特殊字符、UNC/跨管理员凭据等是后续实机验收项。

第四轮结束时，不能据此描述整个项目已无裸命令：交互终端、IDE 打开、machineId 的旧回退等现有通用流程仍有 PATH 查找。当时的 Go Helper v27：`utils/util.go:GetPowerShellExe` 在系统文件缺失时仍回退 powershell，`module/tool.go:resolveWindowsSystemExe` 仍有裸系统命令回退，`module/host.go:SslAddTrustedCert` 直接执行 certutil。通常系统 PowerShell 存在但 PATH 没有它时，Go 入口会先走已有完整路径；但文件缺失、certutil PATH 不完整等情形仍有缺口。第四轮没有修改 Go 源码或二进制；随后用户授权修复，源码处理见第五轮。旧打包二进制仍须重新生成，不能以 TS 或 Go 源码改动冒充已运行的新二进制。

系统程序定位仍信任应用启动环境，路径格式/文件检查不能替代原生系统目录查询、签名或 ACL 校验；运行时系统工具定位已使用系统 API。企业若禁止 Windows PowerShell、EncodedCommand、Add-Type 或 RunAs，完整路径不能解除其限制，会按实际失败回传。

## 第五轮：Go Helper 同类路径问题（2026-10-01）

本轮用户明确授权继续处理 Go Helper。修改源码及现有不匹配的两个测试断言，补详细注释和本节说明；没有运行测试、格式工具或构建。下面的“已修复”指工作区源码，不表示当前已打包/已安装的 v27 程序获得了更新。

### 系统程序及执行层

- 新增 `utils/system_paths_windows.go`：`WindowsSystemRoot` 通过 `GetSystemWindowsDirectoryW` 获取实际系统根，系统程序通过 `GetSystemDirectoryW` 定位。忽略 PATH、SystemRoot/windir、ComSpec 和当前工作目录，无硬编码 C 盘回退；因此空 PATH、环境键大小写、伪造系统目录和非 C 盘安装都不改变选择。系统 API 失败明确返回 error。
- `GetWindowsSystemExe` 只接受 exe 文件名；`GetPowerShellExe` 固定 WindowsPowerShell/v1.0/powershell.exe。执行前用 os.Stat 确认常规文件，目录冒充程序、缺失及不可访问均报错；原来的 ExistsSync 会把非 ENOENT 的 stat 错误当成存在，故不用于此定位。两函数都不裸命令回退，调用者必须处理 error。
- 当前 Windows 发行目标为 amd64，使用当前进程对应的系统目录，不无条件优先 Sysnative，也不声称新增了 32 位发行支持。系统 API、格式及 stat 检查不能替代签名/ACL 校验，检查与启动仍非原子事务；企业阻止执行时按实际错误结束请求。
- 新增 `utils/system_paths_other.go`：Windows 入口在非 Windows 平台明确不可用，保持 Go 的跨平台构建结构；Unix 业务继续走原有命令路径，不为链接成功返回 powershell 等裸命令。
- `utils/util.go:ExecCommand`：Windows 执行层再次拒绝裸命令、相对路径、网络/设备程序路径和 ADS；即使后续某个调用点遗漏定位，也不能由 exec.Command 搜索 PATH。cwd 接受经过语法校验的完整业务路径，包括被允许的 UNC。程序与参数仍分开交给 exec.Command，不经 cmd/PowerShell 二次字符串解释。
- Windows PowerShell 子进程移除任意大小写的继承/覆盖 PSModulePath，限定到所选系统程序的 Modules；保留其他环境和既有 env 覆盖语义。Windows ExecCommand 日志仅记录程序及执行错误，不输出可解码的 EncodedCommand、参数、环境值或 stdout/stderr 内容；错误仍作为结果返回，Unix 原有日志和执行语义不受此分支影响。

### 业务路径及重解析点

新增 `utils/windows_paths.go:ValidateWindowsAbsolutePath`，按 Windows 语法检查路径，不依赖宿主 filepath 的平台语义。因此 Unix 上构造 Windows 每 SID 元数据时也不会接受设备路径。业务允许完整盘符路径及带 server/share 的 UNC；拒绝外围空白、根相对/盘符相对、设备命名空间、控制及无效字符、ADS、父目录穿越、尾部点/空格及 CON/NUL/COM/LPT 等设备名。合法中文、普通空格、单引号、百分号、美元符和反引号仍能作为路径数据传递。

`utils/whitelist.go:cleanAbsPath` 在 TrimSpace/Clean 前使用该校验，避免只验证清理后的路径、实际却打开原始参数。每 SID 实例 `utils/helper_identity.go` 同样调用校验，但 ProgramData 只允许本机路径，禁止 UNC；实际运行仍使用 ProgramData known-folder API，实例 ID、原用户 SID、计划任务、key、allowed-roots 与 ACL 合同沿用现有规则。

hosts 精确例外和 System32/SysWOW64/Sysnative 的敏感路径范围改用真实系统根。不能获得系统目录时普通路径校验直接返回错误，布尔敏感策略保守拒绝，不把 C 盘同名 hosts 或用户覆盖环境当成系统例外。配置文件、runtime/profile 专用范围及安装目录不可写规则继续生效。

`PathHasSymlinkComponent` 在 Windows 检查实际重解析标签，而非只检查 os.ModeSymlink：读取属性后，以 OPEN_REPARSE_POINT 和只读属性权限打开对象自身，通过 FileAttributeTagInfo 获取标签，句柄在 defer 中关闭。junction、挂载点、符号链接及未知标签拒绝；读取标签失败同样拒绝。仅保留不含 Name Surrogate 位的标准 CLOUD/CLOUD_1..F 标签，兼容既有 OneDrive profile provider 写入。这不是允许所有微软标签，也不放宽任何业务目录或 ACL；Helper 的 key/allowed-roots 安全检查仍使用原有更严格的规则。标签及 Cloud 定义依据 [微软 Reparse Point Tags](https://learn.microsoft.com/en-us/windows/win32/fileio/reparse-point-tags) 和 [MS-FSCC Reparse Tags](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-fscc/c8e77b37-3909-4fe6-a4ea-2b9d423b1ee4)。

### 模块逐项接线及错误传播

1. `module/tool.go:runPowerShellScript`：先获取经过检查的系统程序，失败直接返回；集中设置 UTF-8 输出和 ErrorActionPreference=Stop，避免 CIM/文件命令的非终止错误被零退出码掩盖。继续使用 NoProfile、NonInteractive、EncodedCommand；删除内联业务脚本不需要的 ExecutionPolicy Bypass，不据此声称可绕过企业应用控制策略。
2. 批量 runtime/profile 原子替换：改用上述集中执行器，序列化前再次检查 Windows 路径语法和路径链；调用者既有专用范围校验保留，不能用通用 allowed-root 重验而误拒绝重定向 Documents。仍按单个文件在同目录临时写入后替换，不变为多文件事务。没有为了脚本阶段重解析检查增加 Add-Type，也没有一律拒绝所有 Cloud 标签；路径校验后到实际 provider 写入间的竞态仍需句柄级设计才能彻底解决。
3. Kill：taskkill 定位或执行失败返回 false/error，不再仅记录 warning 后成功。KillPorts：先验证完整端口请求，空请求直接成功；netstat 定位失败、Windows 查询失败和 taskkill 执行失败均传播，不把查询失败当作“无监听者”。Unix 原有尽力查询/停止逻辑保留。多个 PID 的 taskkill 可能部分完成；请求错误不表示没有任何进程退出，目标恰好自行退出且无法确认时也保守报失败，后续应重新发现进程再重试。PID 创建时间的 RPC 能力和关键进程保护差异仍沿用此前列出的边界，本轮没有冒充已实现原子防 PID 复用。
4. GetPortPids：原 Windows 分支会尝试 Unix lsof 并吞错为空列表。改用系统 netstat -ano -p tcp，按本地端口匹配并去重 PID，查询失败传 error；保持原 PortProcessInfo 列表合同，Windows 返回可确定的 PID，USER/COMMAND 为空，不伪造进程元数据。ProcessList 的 Unix 入口在 Windows 明确要求调用 ProcessListWin，不再把 ps 失败转成空列表；ProcessListWin 沿用系统 CIM 查询和集中执行器。
5. SetAutoStartWin：创建任务继续用原用户 SID 的 PowerShell COM 注册方式；只有删除时定位 schtasks，避免不使用的系统工具缺失阻断创建。程序缺失、策略/执行错误仍返回失败，不能自动改为管理 Helper 的任务。
6. `module/host.go:SslAddTrustedCert`：除 cwd/name 校验外增加证书文件自身的路径链校验；使用完整 certutil 程序和证书路径，参数数组调用，不切换目录搜索同名程序。定位/导入错误明确返回。
7. DnsRefresh：现有 Windows Helper 分支原本返回不支持，无法承接用户选择 Helper 后的 DNS 授权回退。本轮补充完整系统 ipconfig /flushdns 调用，定位/刷新失败均返回错误。hosts 写入成功而 DNS 刷新失败仍可能出现部分完成，不能把整个动作说成未执行。
8. `module/tool_test.go`：仅调整原有两个过时定位测试，使其不再要求“无条件优先 Sysnative”或“缺失回退裸命令”；改为系统 API 不受 SystemRoot/PATH 覆盖，以及缺失返回包装后的 ENOENT（使用 errors.Is 检查）。测试未运行，不能据修改后的断言描述新实现已经通过验证。

### 二进制、版本与验证范围

本轮 `git diff --check` 通过，并静态检查全部 GetPowerShellExe/系统工具调用接线、参数与路径传递及 error 返回；未运行 Go 测试、vet、格式工具或构建，也未执行任何真实证书、DNS、进程结束或 SYSTEM 任务操作。原生属性/标签读取、Cloud profile、UNC 凭据、文件缺失/非文件、无 PATH、伪造 SystemRoot、非 C 盘、企业阻止执行与部分完成仍需后续实机验收。

第五轮结束时 main.go 的 Helper_Version 和 AppHelperCheck.ts 的 HelperVersion 仍为 27，打包的主/备 Helper 文件没有改动。用户随后明确要求 Go 源码变更必须升级帮助程序版本，第六轮将两处声明同步提升为 28。源码修改不会自动改变正在运行的 Helper；正式生效需要在受控构建流程生成匹配产物，同步主/备并确认 SHA 相等，再通过现有安装/健康检查发布。Go 与 TS 版本须一起更新，并协调使用同一版本常量的其他平台产物。不得将新主程序与旧备份混用，也不得只修改版本号冒充完成。

## 第六轮：帮助程序版本同步升级（2026-10-01）

用户明确要求：Go Helper 代码更新时，帮助程序版本也必须更新。版本不仅表示 RPC 结构，还表示部署的实现；本次 Windows 路径定位、DNS 支持和错误传播修复需要能与旧实现区分，因此发布版本从 27 升至 28。

### 范围与所有权

沿用既有 Helper 版本/健康检查及安装流程，本轮仅同步版本声明、现有测试夹具和文档；不新增配置、renderer 状态、IPC 或生命周期。旧版本检测、安装终态及重入行为继续由既有 AppHelperCheck/AppHelper 和权限协调器负责。后续修改 Go 源码时应同时递增 Go 与应用端版本，并更新发布版本断言。

### 修改文件与原因

1. `src/helper-go/main.go`：Helper_Version 改为 28，补充详细注释，说明 Go 源码变化、应用端校验与各平台重新构建的同步要求；version/health RPC 继续返回这个常量。
2. `src/shared/AppHelperCheck.ts`：HelperVersion 改为 28，补注释说明修复版本和主备产物要求。已有版本/health 精确校验会拒绝仍运行 v27 的帮助程序，由现有安装流程处理更新。
3. `scripts/helper-version-sync-test.ts`：已有发布版本断言改为 28，保留独立预期值，避免 Go/TS 两处同时漏升却通过一致性检查。
4. `scripts/windows-helper-elevation-test.ts`、`scripts/windows-helper-cross-user-test.ts`：已有安装配置夹具同步为 28 并解释用途，避免仍模拟旧发布版本。只调整既有测试数据，没有增加或运行测试。
5. 本文更新当前健康检查和安装配置描述；第五轮原版本状态保留为历史记录，避免将当时未升版本的情况描述为当前状态。

### 构建与发布状态

本轮未构建或修改二进制，也未安装/更新正在运行的 Helper；源码声明与校验版本已为 28，现有旧二进制不能通过新的版本校验。遵循 token-saver 技能未明确请求则不运行测试/构建/格式工具的规则，本轮仅静态核对引用及差异。

Windows 打包配置仍读取 `src/helper-go/dist/flyenv-helper-windows-amd64-v1.exe`，afterSign 从同一产物生成主备；签名流程还会从已签名主文件重新复制备份并校验 SHA。正式打包前必须重新构建 v28，不能把旧 v27 文件打进版本期望为 28 的应用。由于版本常量跨平台共用，macOS/Linux 的对应产物同样需要重新构建。版本升级继续沿用 v27 引入的每 SID 身份、ACL 和主备指纹策略，不改变这些安全边界。

## 第七轮：无需安装 Helper 的重点功能复核（2026-10-01）

### 实施前操作契约

用户要求重点检查 hosts 写入、模块/工具的系统 PATH 写入及语言项目自定义版本。本轮沿用 main 权限协调器、fork Host/Tool 和 renderer Project/ShellInitController 的所有权，不新增配置、Pinia 或独立服务生命周期。系统 hosts 路径由 main 初始化并广播；文件 IPC 由 main 执行普通写入及既有权限回退，renderer 必须按失败终态停止。Tool 保持 PATH 原始快照、冲突重读及现有服务交互，shell 集成的进度、单次并发合并和终态继续由既有控制器管理。Project 的文件失败不得进入目录注册/成功终态；页面销毁不取消控制器所持的集成请求。复核范围包括从未安装 Helper、UAC 取消、真实管理员、非 C 盘、空 PATH、特殊字符、junction、重定向 Documents、写入/刷新部分完成。代码静态复核与差异检查之外的运行结果须分别记录，不以旧测试通过代替本轮验收。

### 1. 系统 hosts 文件

站点写入链为 Host.writeHosts → _initHost → fork Fn.writeFileByRoot → 普通 Node 写入 → Helper.send → executeWindowsPrivilegeOperation。系统 hosts 的精确路径在 UAC 动作白名单中。进入 Helper.send 后先走独立 Windows 分流，只有用户最终选择 Helper 才调用签名 RPC；UAC 直接传送业务脚本给一次性管道执行器，不读取 Helper key、任务或 allowed-roots 文件。已提升 FlyEnv 使用本进程权限直接写入。发生变化后 dnsRefresh 也有独立 Clear-DnsClientCache 动作，先尝试普通权限，必要时进入用户选择的方式。

手工 hosts 编辑链为 Host/Hosts.vue → renderer fs → AppNodeFn → 普通 Node 文件操作 → 同一个 Helper.send 分流。此次补上此前遗漏的读取/写入终态：main 原先读取失败回空字符串、写入失败回 false，renderer 工厂却总是 resolve，可能在 UAC 取消后显示保存成功，或在读取失败后覆盖原 hosts。

本轮修正：

1. `src/main/utils/ServerPath.ts`、`src/global.d.ts`：main 从 windowsSystemDirectory 生成 WindowsHostsFile 运行时元数据并随 Server 广播，不持久化到 setup；兼容非 C 盘且与权限白名单一致。
2. `src/fork/module/Host/index.ts`、`src/fork/module/DNS/index.ts`：使用同一系统目录构造实际 hosts 路径。Host 构造器可能早于 Server 快照初始化，因此自行调用相同路径工具。Windows writeHosts 不再吞普通文件 I/O 错误后返回成功；关闭系统映射复用 reconcileSystemHostsBlock 删除全部托管块，修复带 g 的 match 被误当捕获组、导致删除后不刷新 DNS 的错误。
3. `src/main/core/ServerManager.ts`：退出清理使用 main 提供的同一路径。退出仍为后台尽力清理，普通用户退出时不主动弹 UAC；无权限时可能保留 hosts 托管块，不据此声称退出必定完成清理。
4. `src/main/core/AppNodeFn.ts`：文件读取增加 strict 参数，hosts/项目版本严格读取失败回传 code/msg/errorCode；既有非严格调用继续保留空字符串兼容合同。文件写入必须确认成功或回传结构化失败，只在 EACCES/EPERM 时进入既有权限回退，其他 I/O 错误不提权。
5. `src/render/util/NodeFn.ts`：新增 readFileStrict；writeFile 将失败响应及旧 false 响应转为 reject，保留 UAC 错误类型。该写入终态修复作用于所有 fs.writeFile 调用，公开返回类型仍是 Promise<void>。
6. `src/render/components/Host/Hosts.vue`：只使用 main 广播的 WindowsHostsFile，严格读取成功才允许创建编辑器与保存。读取失败明确提示，禁止以空内容/错误提示替代真实 hosts；写入取消/失败不再提示成功。

hosts 写入和 DNS 刷新是两个动作，可能有两次权限请求；写入成功但刷新被取消时返回失败，文件不会自动回滚。托管块的内容协调保持其他 hosts 内容，但读改写不是跨进程文件锁事务，外部编辑器并发修改仍需后续句柄/锁设计。

### 2. 系统 PATH：模块入口与环境变量工具

模块链为 ServiceActionStore.updatePath → Tool.win.updatePATH/removePATH → fetchRawPATHSnapshot → writeRebuiltSystemPath → util/PATH.win.writePath → Helper.send('tools', 'setSystemPath')。工具链为 SystenEnv/Setup.savePath → Tool.win.envPathUpdate → 同一 writePath。Windows 的环境变量工具页面编辑的是机器 PATH；打开系统环境变量 GUI 的按钮仍交给 Windows 自己处理。

PATH 读取使用完整系统 PowerShell，失败可回退完整 reg.exe，不依赖 Helper。写入使用固定注册表键、原样保存 PATH 项与顺序，保留 REG_EXPAND_SZ；执行脚本在实际写入前重读原始 PATH，等待 UAC 时发现变化则返回 system_path_changed。模块会重读并重建一次，工具会重新加载并要求用户审阅保存。该比较不是 Windows 注册表原子 compare-and-swap，不保证比较到 SetValue 之间绝无外部竞态。写完通过既有环境同步更新 FlyEnv 缓存，并广播环境变化；已有外部终端仍可能需要重开。

本轮修正：

1. `src/fork/Fn.ts:isNTFS`：模块添加 PATH 前的卷类型探测原来仍执行裸 powershell。本轮改为完整系统路径、参数数组、EncodedCommand、盘符白名单和 10 秒超时；探测不可用仍沿用直接安装目录的兼容策略，不搜索 PATH 中的其他 PowerShell。
2. `src/fork/module/Tool.win/path.ts:updatePATH`：mklink 的 cmd 字符串改为 Node symlink(..., 'junction')，消除安装路径中 %、&、括号等被 shell 再解析的问题；NTFS 下在可写业务目录内创建 junction 无需管理员。无法使用 junction 时，JAVA_HOME/GRADLE_HOME/ERLANG_HOME 同 PATH 一样指向真实安装目录，不再指向未创建的 env 子目录。
3. `src/shared/WindowsHelperFallback.ts:validateSystemEnvValue`：以前把环境变量的路径值按“向该路径写文件”校验，误拒绝 FlyEnv junction 和 allowed-root 外的自定义 Java 等版本。本轮仅对这些白名单键的路径字符串作完整语法校验；实际权限写入仍限于固定机器环境键，文件写入/删除的 allowed-root 与 reparse 策略没有放宽。单引号可作为合法路径字符，由现有 PowerShell 字符串函数转义。
4. `src/fork/module/Tool.win/path.ts`：工具展示 PATH 和 Composer vendor/bin 解析不再通过 echo 执行条目内容，而是按不区分大小写的环境键展开 %VAR% 或 $env:VAR 标记；未定义变量保留原文，由展示层标为不可用。原始 PATH 项没有被替换或排序。

局部 junction 替换、PATH 和配套 HOME 变量更新不是统一事务。用户取消机器 PATH 授权时，先前普通权限完成的 junction 操作可能已经生效；多个注册表值写入也可能部分完成。错误终态不会冒充回滚，重试需重新读取实际状态。Erlang 的 LongPathsEnabled 配套尝试继续为当前权限尽力操作，失败不会阻断 PATH 更新；本轮未增加额外机器设置授权入口。

### 3. 语言项目自定义版本

这是 LanguageProjects.Project.setDirEnv 的 .flyenv 项目环境功能，不是“添加自定义服务版本目录”。其调用链为：确认 FlyEnv 数据目录可用 → 写项目 .flyenv → 保存/同步项目目录列表到 bin/.flyenv.dir → ShellInitController.ensure → Tool.win.initFlyEnvSH → Helper.send('tools', 'installFlyEnvPowerShellIntegration') → 独立普通权限/UAC/Helper 分流。

项目 .flyenv 写入在普通可写项目目录内由 Node 完成，不要求管理员或 Helper。安装 flyenv.ps1 及原用户 Documents 下的两个 profile 使用 main 提供的业务根目录和 UserDocuments；UAC 构造器的 readConfiguredAllowedRoots 返回本次可信 runtimeRoots，执行脚本直接携带这些根目录，不读取 Helper 的 allowed-roots 文件。profile 路径在提权前固定为原用户已知 Documents，即使输入另一管理员账户凭据，也不会误装到那个管理员的 profile。真正已提升 FlyEnv 沿用自身权限执行。shell 初始化既有进度、并发合并、失败清理及可重试行为由 ShellInitController/Tool 的单次请求继续负责。

本轮修正：

1. `src/render/components/LanguageProjects/Project.ts`：Windows .flyenv 中的版本 PATH 改用单引号字面量并加倍内部单引号，避免 $、反引号或引号参与 PowerShell 解析；拒绝相对目录、控制字符及无法表示为单个 PATH 项的分号。所选目录完全不存在时明确失败；读取既有文件使用 readFileStrict，保留手写内容；写入失败/取消重新抛出，不能继续目录注册并返回 ready。
2. `src/shared/WindowsHelperFallback.ts:buildInstallFlyEnvPowerShellIntegrationScript`：以前 profile 路径链上的所有 ReparsePoint 都被拒绝，会误拒绝 OneDrive Cloud 占位目录。本轮通过原生 CreateFile(OPEN_REPARSE_POINT) 和 FileAttributeTagInfo 查询对象本身，仅对 profile 路径允许标准 CLOUD/CLOUD_1..F 且无 NameSurrogate 的 tag；查询失败、junction、symlink 和未知 tag 继续拒绝。ACCESS_DENIED 转为 UnauthorizedAccessException，使普通权限失败可被统一执行器识别。Add-Type 仅在确遇 Cloud 属性时编译这个固定元数据读取器；runtime 脚本、Helper 安装/key/allowed-roots 没有获得 Cloud 例外。标签规则与第五轮原生 Go 修复及其微软来源一致。

此功能通过 PowerShell profile/prompt 在进入已登记项目目录时加载 .flyenv，并修改当前终端的环境；它不写机器 PATH，也不自动注入 CMD 或所有其他 shell。安装 profile 后需要新开 PowerShell；既有终端的目录缓存或已加载环境也可能需要重新打开。CurrentUser ExecutionPolicy 的尽力修复失败会产生 degraded 警告，不能将被企业 MachinePolicy/应用控制阻止加载的终端描述为已生效。若项目目录本身不可写且位于权限白名单之外，会明确失败；本轮未开放任意受保护项目路径的提权写入。重定向 UNC Documents 在跨账户提升后能否访问仍取决于该账户的网络凭据，不能由 UAC 自动补齐。

### 本轮结论与验证范围

从生产源码调用链看，上述三类功能没有“先安装或启动 Helper 才能进入 UAC”的前置依赖。普通可写项目/数据目录不需要授权；机器写入或真实权限拒绝才选择方式，已提升进程直接执行。用户明确选择 UAC 时，这些动作不需要 Helper 二进制、key、任务或实例配置。这里的结论仅覆盖本轮列出的功能与调用链，不等于整个 FlyEnv 所有外部工具均不受企业策略影响。

本轮修改代码均补充原因/边界注释；未改 Go 源码，Helper 发布版本继续为 28。静态检查覆盖入口、授权意图、目录来源、结果回传、默认/取消分支和主窗口/fork 所用路径；git diff --check 通过。依照 token-saver 技能规则，没有新增或运行测试、构建、类型检查或格式工具，也没有实际改系统 hosts/PATH、安装 Helper、弹真实 UAC 或改 profile。此前测试通过不能追认本轮已实机通过。

正式验收仍需从未安装 Helper 的 Windows 测试机逐项操作：普通用户/已提升管理员/跨账户凭据，保存与取消 hosts，新增/移除模块 PATH（含 Java/Gradle/Erlang、自定义目录和无 junction 盘），工具 PATH 保存与外部变化冲突，以及普通/OneDrive/UNC Documents 的项目版本集成。目录名包含中文、空格、单引号、%、$、反引号、& 时应保持字面量；禁止 PowerShell/Add-Type、文件锁和部分完成必须回到明确失败终态。

## 第八轮：权限选择弹窗样式与具体操作原因（2026-10-01）

### 实施前操作契约

用户要求消除横向滚动、按其他弹窗修复暗色配色，并具体说明授权原因。沿用 main WindowsPrivilegeCoordinator 的首次选择生命周期、fork 的请求客户端和 renderer WindowsPrivilegeController，不新增配置、Pinia、服务流程或执行权限。动作构造验证成功后，由执行层从白名单参数生成只供显示的原因快照；main 校验长度/类型并随 choiceId 转发，renderer 控制器传入弹窗。弹窗只持有复选框等输入，原因不是执行参数或授权凭据。并发仍合并到首次选择，展示首次触发动作的快照；取消/超时/main 关闭、重复 choiceId、新 choice 排队沿用原有终态及清理。静态复核包括主进程直接调用和 fork 桥两条传递路径、未知/过大原因的兼容处理、长路径与长翻译换行、暗色/亮色变量及敏感值不进入说明。本轮不新增或运行测试/构建/格式工具，真实界面验收与静态检查结果分别记录。

### 样式修复与原因

`src/render/components/Setup/WindowsElevationMethod/Choice.vue` 增加专用 windows-privilege-choice 类。原 el-checkbox 默认单行显示，较长的“同时停用当前账户此前安装的帮助程序”说明会撑出正文；本轮将复选框及 label 设为可换行、自适应高度，文本列 min-width 为 0，输入框保留固定尺寸。长路径 code 使用 pre-wrap/overflow-wrap，按钮区使用 flex-wrap 和 gap，避免长翻译或窄窗口把按钮撑出弹窗。

弹窗宽度取 540px 与视口宽度减 32px 的较小值，顶部 24px、最大高度为视口减 48px；标题和按钮不压缩，正文只纵向滚动。不是用隐藏横向滚动裁掉文字：所有可能撑宽的文字与按钮先提供换行规则，overflow-x:hidden 只是正文容器的最后边界。

暗色配色参照现有 host-edit：弹窗使用 base-bg-color（#1d2033），说明卡片使用 base-bg-color-1（#32364a），正文及提示使用 base-color-white-07，边框为低透明白色；标题/控件继承对应 Element Plus 文字变量。亮色仍使用既有 el-bg-color-overlay、main-panel-bg-color 和边框变量。样式限定在专用弹窗类下，支持 teleport 及弹窗打开期间的主题切换。

### 具体原因的传递链

1. 新增 `src/shared/WindowsPrivilegeReason.ts`：纯数据类型、显示快照构造和边界校验，renderer 导入不依赖 Node/Electron。文件动作摘取实际路径；PATH 按请求携带的原始快照作多重集合差异，分别列新增/移除项，纯顺序变化列目标顺序，没有原始快照时列完整目标 PATH 而不猜测新增项。环境变量显示键和值，空值说明为“清空值”（当前执行器并非删除注册表键）。PowerShell 集成列 runtime 脚本与每个 profile；目录恢复、启动任务/程序、证书文件、PID/端口及固定系统只读/DNS 动作分别有说明。
2. `src/shared/WindowsPrivilegeOperation.ts`：在动作已通过白名单校验、实际脚本构造完成的同一时点生成原因快照。普通权限成功时不显示；确需首次交互选择时才随 resolveWindowsPrivilege 发送，避免等待期间展示字段与原脚本目标不一致。
3. `src/shared/WindowsPrivilege.ts`：WindowsPrivilegeRequest 增加可选 reason，resolveWindowsPrivilege 接受可选参数；旧调用缺少字段时仍兼容。该字段不持久化、不用于授权。现有 WindowsPrivilegeClient 已原样传递 request，因此没有增加新 IPC 类型或第二份状态。
4. `src/main/core/WindowsPrivilegeBridge.ts`：对 fork 送来的 reason 作显示类型/数量/长度校验再交给协调器。`src/main/core/WindowsPrivilegeCoordinator.ts` 再复制快照，使 main 自己执行的 hosts/文件操作也走同一边界；present 包含 reason，窗口尚未就绪后的再次呈现不会丢失目标信息。并发等待仍共用第一个 choice 的说明，不会在用户阅读时替换为另一请求的目标。
5. `src/render/components/Setup/WindowsElevationMethod/Controller.ts`：队列和展示参数使用同一个 WindowsPrivilegeChoice 类型；reason 随 choiceId 传给组件，原重复请求、关闭/过期、排队、选择及停用 Helper 的所有权不变。
6. `Choice.vue`：新增“本次需要执行的操作”列表。路径/变量值以 Vue 文本插值呈现并可选择复制，路径使用 LTR 方向，支持长路径换行。旧请求没有 reason 时保留原操作名称；额外查询动作也有准确名称。
7. `src/lang/zh/setup.json`、`src/lang/zh-hant/setup.json`、`src/lang/en/setup.json`：新增列表标题、超出数量提示及 PATH/环境值清空/脚本/profile/启动/查询标签。其他语言延用原本操作名称就已使用的英文 fallback；没有添加中文硬编码到页面。部分语言的 operations 对象原本不存在，编辑时建立该可选对象并保留已有翻译。

### 显示边界与例子

最多显示 32 项、每项最多 4096 字符，超过的项显示数量，超长目标以省略号明确截断；业务参数本身不截断。未知/非法显示条目被忽略。不得传入文件内容、脚本、nonce、证书内容或进程命令行；密码/token/secret 等凭据类环境键的值显示掩码，键名仍可见。原始动作仍由执行层独立验证，显示内容不能替代白名单或充当执行许可。

- hosts：列出“写入受保护文件”和实际 `D:\Windows\System32\drivers\etc\hosts`，支持真实非 C 盘路径。
- 添加 Java 到 PATH：列出本次新增的 env/java、bin 等条目，并列出 `JAVA_HOME = 实际目标目录`；移除操作列出被移除条目。
- 工具修改 PATH：使用保存时的原始快照展示增删/顺序变化；UAC 等待后的注册表冲突检查仍使用原执行脚本，显示快照不是实时系统状态保证。
- 项目 shell 集成：列出业务 `bin\flyenv.ps1` 与原用户 Documents 下的 WindowsPowerShell/Microsoft.PowerShell_profile.ps1、PowerShell/Profile.ps1，用户可以判断将写入哪些文件。
- 自启动、信任证书、结束进程/释放端口：显示任务/可执行文件、证书路径或实际 PID/端口；DNS 和系统信息读取显示对应固定动作。

本轮 `git diff --check` 通过，并静态核对所有新增原因类型的本地化键、主进程直接调用/fork 桥/renderer 传递、Vue 文本插值及主题变量。没有运行测试、构建、类型/格式检查、Electron 界面或真实 UAC；实际亮暗主题、窄窗口、长翻译/路径与弹窗关闭重入仍需界面验收。Go 未变更，帮助程序版本继续为 28。

## 第九轮：区分操作说明、固定弹窗高度与持续等待选择（2026-10-01）

### 实施前操作契约

本轮按用户要求区分操作说明与两种授权方式，弹窗加宽至 640px、固定 80vh，正文使用 el-scrollbar；首次选择不再随等待时间自动结束。权限等待仍由 main WindowsPrivilegeCoordinator 持有，fork WindowsPrivilegeClient 持有请求关联，renderer WindowsPrivilegeController 持有弹窗队列，Vue 组件仅持有展示和复选框输入。开始事件为首次真实交互权限需求；等待期间重复请求合并，已有原因快照不变。终态为用户选择、取消、其他窗口完成选择或应用关闭；没有计时终态。租约排队及实际 Helper/UAC 执行继续使用原来的超时和 finally 清理。无需新模块、配置、Pinia 或架构例外。

主进程的五分钟选择计时和 fork 的六分钟 resolve 计时必须一起移除，否则弹窗一直显示时业务仍可能先失败。fork 请求仍等待 main 的结果，发送异常/响应终态清理 pending；worker 退出由既有 bridge.detach 和 ForkItem 的终态清理回收所属请求/租约。业务请求在等待期间仍计入 activeTasks，ForkIdleLifecycle 不会把等待选择的 worker 当成空闲进程回收。应用退出调用 coordinator.dispose，明确结束尚未完成的选择和租约。待静态复核重复请求、用户取消、关闭/重入、长期等待及短窗口/长路径/暗色样式；按本会话约束不新增或运行测试、构建或格式工具。

### 修改文件及处理原因

1. `src/render/components/Setup/WindowsElevationMethod/Choice.vue`：操作概述和具体目标合并为一个说明区，使用侧线、较小的详情标题和可复制路径；去掉原因区的卡片底色、圆角和四边框。只有 UAC/Helper 保留完整卡片外观，避免用户把原因误当成第三个选项。旧请求缺少 reason 时仍显示概述。
2. 同一组件的布局：宽度从 540px 增至 640px，并继续限制为视口减 32px；固定 height:80vh，顶部 10vh，另保留视口减 32px 的最大高度。标题/底部按钮不压缩，正文 flex:1、min-height:0，内部 el-scrollbar height="100%" 使用剩余空间。正文容器本身不再纵向滚动，避免两层滚动条；内容末端预留 10px，避免自定义滚动条遮住文字。长路径、复选框说明和按钮继续换行；只限制横向滚动，不截掉应读文字。暗色原因区只用低透明侧线，方式卡片继续沿用既有暗色面板变量，样式不影响其他弹窗。
3. `src/main/core/WindowsPrivilegeCoordinator.ts`：移除 choice.timer、300_000 的 setTimeout 及 select/cancel 中的计时器清理。main 对首次选择的 Promise 持续等待，用户选择/取消或应用退出才结束；并发合并、保存失败不放行业务、旧 choiceId 拒绝及窗口未就绪再次呈现均保留。
4. `src/fork/WindowsPrivilegeClient.ts`：request 的动作类型限制为 resolve/acquire，pending.timer 改为可选。resolve 不设置六分钟截止时间，避免已保持显示的弹窗对应请求被后台提前取消；acquire 仍最多等待六分钟，超时 cancel 和迟到租约归还保留。响应和发送失败只清理实际存在的 timer。Helper 准备的安装器/健康检查及 UAC 管道执行仍有各自时限，未取消实际执行阶段的保护。
5. `src/render/components/Setup/WindowsElevationMethod/Controller.ts` 与 `Choice.vue`：更新关闭/超时注释，closeExpired 改名 closeEndedChoice，明确该监听用于 main 完成/取消或请求替换。设置/选择/停用 IPC 的计时只在发出动作后开始，不为打开中的选择框计时。用户点击取消、关闭按钮或 ESC 仍明确取消，其他窗口完成选择和应用退出仍回收弹窗；“一直显示”指不因用户等待而自动结束。

### 边界与静态复核

本轮移除的是 FlyEnv 的授权方式选择等待时限；原生 Windows UAC、安装/业务执行、租约排队及各业务控制器的独立超时仍遵循各自既有生命周期。选择前没有领取执行租约，不会因用户长时间阅读而独占权限执行队列。等待期间参数仍为原快照，执行层仍按既有规则复查路径、PATH 冲突及 PID 身份；长期等待不代表允许忽略前置状态变化。

静态检查已核对：main 不再有首次选择计时器；fork 的 setTimeout 只在 acquire 分支创建；renderer showChoice/AsyncComponentShow 不为阅读等待计时；Helper RPC 响应计时在进入实际连接阶段才开始；ForkItem 等待业务计数不归零，ForkIdleLifecycle 不触发空闲回收；取消、选择、应用退出和 worker 退出的既有清理仍可到达。现有全局弹窗样式不会覆盖该专用类的正文/高度设置。

改动均补充注释。本轮 `git diff --check` 通过；没有新增/运行测试、构建、类型检查、格式工具或启动 Electron。80vh 下的实际滚动、亮暗主题和长时间保持显示尚未进行界面验收，不能将静态复核描述为实机测试通过。后续界面验收应覆盖等待超过六分钟后选择/取消、窗口缩放、长路径/多项操作、ESC/关闭按钮、并发请求及应用关闭。Go 未改动，Helper 发布版本继续为 28。

## 第十轮：hosts 与模块系统 PATH 后端阶段耗时测试（2026-10-01）

### 实施前操作契约

用户明确要求编写并检查两个完整后端流程的分阶段耗时测试，本轮允许添加/运行这些测试。测试复用 Host.writeHosts 与 Tool.win.updatePATH，权限路由、校验、管理员判断、普通权限复核、租约及 UAC 原有代码负责业务执行。计时观察状态归测试上下文，通过 AsyncLocalStorage 隔离，只记录阶段名、单调时钟耗时和错误码；未启用时不增加子进程诊断输出，不改变动作参数、认证、权限选择或超时策略。没有新 renderer 操作、Pinia、持久配置或模块例外。

测试命令拥有测试目录、报告和 finally 清理；实际模式使用独立 fixtures，明确调用真实系统 hosts/PATH 写入，成功后验证并按原值恢复，外部状态冲突或未知结果不盲目覆盖。只读模式测真实准备成本，不执行保护文件/注册表写入或弹原生 UAC，报告明确标注不是完整写入结果。各测试命令独立启动可测冷缓存，同一上下文内嵌套阶段为包含耗时，不相加；RunAs 调用点和返回点用于区分提权前准备、批准等待和后续执行，不能声称观察到了 UAC 窗口首次显示时刻。权限协调器使用原逻辑但同进程连接，报告注明不包含 Electron IPC 传输与 UI 延迟。静态/计时自检、只读实测、真实写入验收分别记录。

### 两个测试方法与运行方式

`scripts/windows-privilege-timing-test.ts` 导出 testWindowsHostsWriteTiming 与 testWindowsSystemPathAddTiming，命令行分别由 package.json 的 test:windows-hosts-timing 和 test:windows-path-timing 调用。默认 mode=probe，仅做真实只读准备与普通权限管道查询。完整模式用 `yarn test:windows-hosts-timing --mode apply`，以及 `yarn test:windows-path-timing --mode apply --php-bin "实际安装的 PHP.exe 完整路径"`。第二条的路径必须替换为存在的 PHP 可执行文件；不是拿一个空目录冒充真实 PHP 版本。每个命令独立启动，避免前一个测试的令牌/卷/环境缓存改变后一个结果；可以再次独立运行对比机器自身的启动缓存。

hosts 完整模式创建一个独立的 node 类型 .test 站点，仍调用真实 Host.writeHosts(true, true)，包括读取/解密站点列表、迁移检查、生成预览、读取/合并 hosts、初次 Node 写入、统一权限入口的普通 Node 重试、令牌探测、方式解析、租约、UAC 写入和 DNS 刷新。初版还有普通 PowerShell 复核，第十四轮已删除，测试自动沿用生产入口的新流程。node 类型避免生成无关 PHP/Web 配置；它不模拟用户真实站点数量和现有服务迁移的工作量。probe 不写系统 hosts，读取真实文件、站点列表/迁移检查、令牌和受控普通权限管道；不得将其当作完整 IPv6 切换实测。

PATH 完整模式调用真实 updatePATH(item, 'php')，覆盖 env 目录/junction 检查、旧 junction 删除、原来串行的卷类型探测、junction 创建、原始注册表 PATH 快照、优先级重建、写入冲突检查、令牌/方式/租约、UAC、环境刷新、PHP ini 查询及最终列表刷新。只在测试自己的 env 目录创建 junction，但使用真实 PHP 安装目录，因此 getIniPath 的既有安装目录操作也会执行。备份读取后清除测试本地 EnvSync 缓存，避免备份动作让前置同步成本变成缓存命中。probe 只做卷检查、实际 PATH 快照、重建、令牌和普通权限管道读取，不能代替完整添加测试。

测试连接真实 WindowsPrivilegeCoordinator/Bridge/Client，以已明确选择 UAC 的状态运行；不修改用户保存的权限偏好、不检查或安装 Helper。同进程连接保留真实方式/租约逻辑，但不包含 Electron UtilityProcess IPC 调度耗时，也不测首次方式选择框。`test.import-*-backend` 单独记录诊断脚本导入成本；本地 TS 转换不是发布版打包代码的性能，不应拿该值解释用户 UI 的十五秒。`test.backend` 与 beforeRunAsMs 从生产方法调用开始计，不含 fixtures/备份准备。

报告和原始备份放在已经被 git 忽略的 `tmp/windows-privilege-timing/<UUID>/`。report.json 记录事件、状态、backendMs 和首次 beforeRunAsMs；未到 RunAs 时省略后者，不用 0 伪装实测。控制台按时间顺序打印结束阶段及关键时间点。保留原始 hosts 字节，恢复时在批准后打开读写句柄并禁止其他写入/删除，核对测试写入的预期字节后恢复，可保留 BOM/原编码。完整 hosts 主流程未确认成功（包含 DNS 失败/未知结果）时不自动反向写入，报告记录 cleanup.skipped-unconfirmed-hosts-write，备份留给人工核对。PATH 仅记录真实生产 send 成功返回的目标，恢复前读取并核对该目标，再携带 expectedRawPath 使用生产冲突检查恢复原值。原注册表冲突检查仍非原子 CAS；外部修改/恢复失败保留失败状态和备份，不描述为回滚成功。清理以 cleanup.* 单独记录，不计入 test.backend 或首次提权前耗时。

### 计时位置及每文件处理原因

1. `src/shared/WindowsPrivilegeTiming.ts`：按需启用的 AsyncLocalStorage 观察上下文，单调 performance.now、同步/异步阶段、关键点及 PowerShell 固定诊断行解析。只含固定阶段、毫秒和错误码，不包含脚本、文件正文、PATH 或 nonce。并发上下文隔离，终态幂等；观察器抛错、错误对象 code getter 抛错和 throw undefined 都保留原业务终态。嵌套阶段为包含耗时，不重复求和。
2. `src/shared/WindowsPrivilege.ts`：记录实际令牌探测或缓存命中、权限方式解析及执行租约排队。计时包装保留原探测缓存、异常清空、意图和租约 finally 释放。
3. `src/shared/WindowsPrivilegeOperation.ts`：记录动作验证、Node 写入、普通权限尝试/复核和环境失效/刷新。没有为了测试伪造 EACCES/EPERM，也没有跳过白名单或删除普通权限复核。
4. `src/shared/WindowsActionPipe.ts`：仅诊断上下文下，用 PowerShell 自身 Stopwatch 测 Add-Type 编译，stderr 独立有界缓冲解析固定标记；ordinary.pipe-ready/uac.pipe-ready 在上层包住完整 broker 准备。编译诊断不作认证或执行成功证据，DACL、原生身份核验、nonce、READY 和结果大小约束不变。
5. `src/shared/WindowsRunAs.ts`：可选诊断标志，在 Process.Start 前打印 launcher.runas-requested，finally 打印 launcher.runas 时长；保留 launch/wait 和 childStarted 语义。此耗时包含系统响应、用户批准/凭据输入和启动，不是纯 FlyEnv CPU 时间。客户端收到标记只证明已经请求 RunAs，不能精确证明 UAC 窗口已显示。
6. `src/shared/WindowsElevation.ts`：记录管道就绪、launcher 启动/结果等待；仅诊断 bootstrap 在可信结果内增加实际业务 action.execute 毫秒数，仍以 nonce/OS 身份/ok 为业务证据。通过 execFile Promise 的 child.stderr 实时接收 launcher 边界，普通/UAC 终态和 uncertain/迟到资源策略不变。业务执行失败仍标为 error，不能因有耗时字段描述为成功。
7. `src/shared/child-process.ts`：在原 spawnPromiseWithEnv 的 EnvSync.sync 调用上记录 process.env-sync，区分“Get-Volume 慢”和“它前面的环境同步慢”；仍保留原 options.timing 回调和环境合并。
8. `src/fork/Fn.ts`：记录外层 writeFileByRoot 的首次 Node 写入，和统一执行器的第二次尝试分开；记录 isNTFS 真正 PowerShell 探测及缓存命中。原探测失败返回 false 的兼容分支保留，内层失败事件仍可见。
9. `src/fork/util/PATH.win.ts`：记录快照前环境同步、真实 PowerShell 原始 PATH 读取和 reg.exe 只读回退，保留原原文/换行/错误语义。
10. `src/fork/module/Host/index.ts`：记录站点加载、迁移、预览、系统 hosts 读取、托管块合并、系统写入及 DNS 刷新。普通权限/取消/错误传播保留，业务路径与操作参数不变。
11. `src/fork/module/Tool.win/path.ts`：记录 env/junction 准备、两个卷探测、配套变量、快照/重建/提交、ini 和最终列表刷新；保留串行/短路语义，未用并行化提前优化被测流程。PATH 冲突重试仍每次读取新快照。
12. `scripts/windows-privilege-timing-test.ts` 与 package.json：两个可导入测试方法、默认只读与明确完整模式、真实权限桥、独立测试数据、结果与受控清理、按阶段报告。用户明确要求测试，因此本轮新增并尝试执行，没有借旧测试成绩追认。
13. `scripts/windows-privilege-timing-runner.mjs`：本环境 tsx 被拦在 esbuild 服务 spawn EPERM 后，增加进程内 TypeScript 转换 runner，使用项目已有 TypeScript 及现有别名。默认 yarn 命令仍用项目 tsx，兼容项目 Node 基线；备用 runner 需要支持 node:module.registerHooks 的 Node（本次使用 24.3.0）。可执行 `node scripts/windows-privilege-timing-runner.mjs --self-check` 或 `--case hosts/path --mode probe/apply`，两套入口使用同一测试方法。

### 本轮执行记录与限制

计时上下文自检通过：并发隔离、正常/异常终态、观察器失败、恶意 getter/throw undefined、固定标记解析和非法/超大耗时拒绝。四份有/无计时的 RunAs/业务 bootstrap 经 PowerShell AST 解析通过，未执行这些脚本。新增/调整 TypeScript 的语法转换检查通过，git diff --check 通过；没有运行整个项目类型检查、打包或 Go 构建。Go 未改动，Helper 仍为 28。

已分别运行只读 hosts/PATH 测试，但当前 Codex 沙箱拒绝 Node 创建 PowerShell/reg.exe 子进程：spawn EPERM。hosts 初次记录的站点列表读取 3.744ms、迁移检查 1.085ms、真实 hosts 读取 1.149ms；令牌探测在子进程创建时失败（2.680ms），这些数据只能说明该受限环境下已完成的文件步骤，不能推导完整操作速度。PATH 初次记录卷探测、PowerShell PATH 读取及 reg.exe 回退均为 EPERM；其毫秒数是启动失败成本，不是正常执行时长。报告分别留在 `tmp/windows-privilege-timing/f5531c44-0726-4787-94e8-d58d61866d74/report.json` 与 `tmp/windows-privilege-timing/fb5577f9-30de-469f-9019-81dccb9caa34/report.json`，报告 status=error。后续补充细分环境同步计时，不把此前尝试当作完整新版本实测。

上述沙箱尝试没有运行 apply，也没有取得 Add-Type、RunAs/UAC 或实际保护写入的真实毫秒数；这一限制仅描述代理运行环境。用户随后在普通 Windows 终端运行完整测试，结果见下一节。报告重点看 process.env-sync、path.volume-powershell、ordinary.permission-recheck、broker.compile、uac.pipe-ready、beforeRunAsMs、launcher.runas 和 action.execute。用户批准时间包含在 launcher.runas 内，应与提权前准备分别比较。

### 用户完整实测结果与阶段归因

用户运行两条 apply 命令，hosts 报告为 `tmp/windows-privilege-timing/4ac1b38a-d329-4ff4-b89f-c49a805f0544/report.json`，PATH 报告为 `tmp/windows-privilege-timing/87b13e54-d66c-425e-94e0-dd3aceab0fbd/report.json`；两份 status=ok，真实写入、验证和恢复均成功。代理读取并汇总用户报告，没有在沙箱里再次执行系统写入。hosts 开始时的 EPERM 是普通用户写受保护文件的实际拒绝，后续成功 UAC 写入证明该错误已按原设计分流，不是测试最终失败。

计时边界从 test.backend 的 start 到首次 launcher.runas-requested，分别得到 hosts **4934.056ms**、PATH **8553.864ms**。RunAs 标记是在请求 Windows 提权前发送，标记到达有 stderr 调度开销，也不包含系统随后显示 UAC 的延迟；该值应称为“后端开始到请求 RunAs”。测试命令墙钟 23.62s/25.14s 还包含 TS 源码导入、测试备份、用户批准、业务完成及恢复；不能用它们表示授权弹窗出现前等待。

hosts 提权前主要阶段：普通权限复核 2353.200ms（内部 ordinary.pipe-ready 1138.996ms、普通子进程及结果等待 1210.613ms），令牌探测 243.001ms，UAC 管道准备 1109.078ms，UAC launcher 从启动到 RunAs 标记 1190.854ms。普通权限复核约占提权前用时 48%；管道与 launcher 准备各约 1.1–1.2s。实际管理员 hosts 写入只用 64.200ms。完整主流程 11765.092ms，包含 RunAs 启动/批准等待 3378.148ms、管理员子进程启动/结果回传，以及写入后 DNS 刷新 2797.269ms；DNS 的实际脚本执行 590.190ms，其余含管道和子进程准备。嵌套行不可重复相加。

PATH 提权前最大项是两个不同盘的串行卷类型探测：env 所在 E 盘 3877.589ms，PHP 安装所在 D 盘 1863.921ms，总计 **5741.510ms**，约占 8553.864ms 的 **67%**。首个卷探测包含 process.env-sync 349.984ms，不再额外相加。原始 PATH 快照 228.001ms、重建 56.016ms、令牌探测 217.954ms、UAC 管道准备 1104.187ms、launcher 启动到 RunAs 标记 1184.830ms。完整主流程 14048.601ms，其中 RunAs 启动/批准等待 2429.032ms，实际 PATH 动作 1792.274ms，环境刷新 378.233ms。PATH 动作本身还包含既有环境变化广播等工作；当前数据未拆出注册表写入与广播各自的用时，不能把 1792ms 全归到注册表写入。

这次实测修正了此前对 Add-Type 的初步怀疑：主流程各 broker.compile 为约 180–251ms（PATH 189.374ms），完整管道就绪为约 1.1–1.4s。较大的成本发生在子进程启动和其准备阶段，编译只占其中一部分。PATH 的 Get-Volume 则是明确的前置大项。这里依据真实阶段数据排序，尚未修改生产执行策略。

后续优化优先级：先用更轻量的卷类型查询替代 Get-Volume 的完整卷对象查询；降低普通权限复核的双进程/完整管道初始化成本；减少一次 UAC 动作的 broker 与 launcher 重复启动。优化需继续保留普通权限优先、权限/共享锁区分、固定系统可执行路径、原生管道身份核验、取消/未知结果和执行时路径/状态检查，并用同一测试方法作前后对比。两份完整脚本数据确认了这些成本，但未包含 Electron IPC、真实页面调度或 UAC 窗口首帧，仍不能将应用中“约十五秒”精确归到单一阶段。
## 第十一轮：根据 Windows 实测减少提权前准备耗时

### 实施前的操作契约

- 操作所有者：仍由 fork 的权限执行器持有一次性管道、动作结果和不确定状态；main 的 FIFO 租约和 renderer 的选择控制器保持原有职责。
- 生命周期：从普通权限尝试到已认证终态；未收到终态的写操作继续禁止重放，并保留原有十分钟迟到结果清理及父进程退出回收。
- 中间事件：保留卷检查、管道准备、RunAs 请求、执行耗时；复用 broker 后不再将不存在的额外 launcher 启动计入耗时。
- 终态与重复调用：原生启动失败、用户取消、业务失败、可信成功和执行状态未知继续分别处理；取消或启动失败不代表业务成功。
- 服务交互：hosts 写入及 DNS 刷新、模块 PATH 更新仍走原来的后端入口；不新增服务、配置、Pinia 或 renderer 操作状态。
- 验证范围：沿用用户要求的 hosts/PATH 完整后端计时测试，增加无系统写入的脚本生成和生命周期回归检查；当前沙箱禁止 Node 启动子进程，实际 UAC 加速幅度需在正常 Windows 会话重跑。
- 实现方向：使用 DriveInfo 读取指定卷格式并合并并发查询；由已创建安全管道的 broker 启动客户端，移除额外的普通 PowerShell launcher。文件锁复核、路径守卫、原生对端认证和迟到结果机制继续生效。

### 本轮文件与处理理由

1. **`src/shared/WindowsVolume.ts`（新增）**：用 `[IO.DriveInfo]` 的 `IsReady/DriveFormat` 获取指定盘格式，替代 Get-Volume 对 Storage/CIM 提供程序的加载。两个不同盘在同一个 PowerShell 中查询，同盘只查询一次；调用使用已经校验的系统 PowerShell 完整路径、EncodedCommand、固定环境、10 秒超时和 4 KiB 输出限制，不经过不必要的 EnvSync 全量刷新。盘符仅接受绝对本地路径中的单字母，支持大小写及正反斜杠，UNC/相对盘符不进入脚本。盘未就绪、权限/查询失败、缺失格式均返回 false，模块沿用真实安装目录；失败不缓存，明确格式（包括非 NTFS）缓存 30 秒，并发请求共享同一批 Promise。短有效期避免可移动盘换盘后无限沿用旧格式。
2. **`src/fork/Fn.ts`**：保留 `isNTFS` 单路径接口，内部复用新探测器，清除永久缓存和旧 Get-Volume 逻辑；其他文件读写/权限行为沿用既有执行器。
3. **`src/fork/module/Tool.win/path.ts`**：将 envDir/item.path 两次串行探测改为一次批量探测，阶段命名为 `path.volumes`，真实外部进程仍记录 `path.volume-powershell`。只有两个结果都为 NTFS 才尝试 junction，其余情况、junction 创建失败等仍使用真实安装目录。PATH 原值比较、并发冲突重建及 PHP ini 后处理继续沿用。
4. **`src/shared/WindowsActionPipe.ts`**：在既有 Add-Type 的 C# 中增加客户端启动任务，复用已经启动的 broker，移除普通权限客户端的 Node 启动和 UAC 的额外 PowerShell launcher。主线程用 WaitForConnectionAsync 周期检查启动任务，用户取消或启动失败即使没有客户端连接也能回传。启动/退出等待及父 stdin 存活监视使用 LongRunning 专用后台线程，避免低核数企业虚拟机因阻塞线程池而重新引入排队延迟。Start 返回后立即标记 wait/childStarted，后续句柄/等待失败不会误判为可安全重放的启动失败；性能标记写失败不改变业务行为。普通客户端显式重定向 stdin/stdout/stderr，并分块丢弃输出，避免它消耗父存活 stdin 或将输出注入 broker 的结果/诊断协议。管理员客户端仍经过原生 PID/会话/程序路径/令牌核验后才能接收脚本，C# 启动任务不能以启动成功代替认证业务成功。
5. **同一文件的传输和生命周期边界**：broker 命令行只放固定短引导，代码通过匿名 stdin 第一行的 UTF-8 base64 传入，业务 JSON 是第二行；无需临时脚本，也无需 Helper。业务终态和进程退出诊断分别冻结第一份，已收到业务结果后仍处理退出帧，避免 result 先到时等待被卡住。管道准备之前失败仍报告 pipe failure，准备之后 broker 意外退出仅产生未知退出信息，不宣称动作未开始；超时后保留管道，父 EOF/十分钟清理不变。未自动启动的安装器/测试客户端仍使用原等待连接分支。
6. **`src/shared/WindowsElevation.ts`**：生产等待 broker 的 launchReady（180 秒），不再 execFile 额外 launcher；可替换 launcher 的测试入口保留。启动退出码和结构化 phase/childStarted/原生码继续走原有分类，已认证业务终态优先。超时只结束 Node 等待，不关闭可能仍完成动作的 broker；未知写操作的 digest 重放阻止、迟到终态解除限制和只读重试沿用。路径存在性检查发生在实际启动前，生产动作开始后不再重复检查并误报为“未开始”。
7. **`scripts/windows-privilege-optimization-test.ts`（新增）**：注入卷查询及模拟子进程流，执行真实生产模块的缓存和生命周期逻辑，覆盖跨盘批量、同盘去重、并发共享、大小写/斜杠、UNC/相对路径回退、失败重试、缓存期限、非法盘符、短命令行、私有载荷只经 stdin、三路流隔离、取消/启动失败/等待未知、首份诊断固定、结果先到/退出后到、broker 中途退出、超时保留/迟到清理、未知写禁止重放及只读重试。执行器分类测试同样加载生产源码，并经过生产 nonce/结果字段检查；不复制算法，不弹 UAC、不改系统。
8. **`scripts/windows-privilege-timing-test.ts`**：`--self-check` 接入上述回归；输出卷脚本、短 broker 引导及四种普通/UAC、有/无计时 broker 计划，连同既有 bootstrap/launcher 共十份 PowerShell AST 计划。原来的两个完整后端 apply 测试和安全恢复继续保留，仍可直接前后对比。

### 计时变化和验证结果

旧报告的 `path.env-volume/path.install-volume` 合并为 `path.volumes`；`path.volume-powershell` 是单个轻量批量查询的耗时。生产不再有额外 `uac.launcher-spawn/ordinary.action-spawn`，改为 READY 处记录 `uac.broker-launch/ordinary.broker-launch`；RunAs 请求时仍由启动任务发送 `launcher.runas-requested`，因此 `beforeRunAsMs` 的口径不变。READY 和 stderr 是不同流，具体标记到达先后有调度误差；broker-launch 标记不能用于推断窗口首帧。Add-Type、实际动作和批准等待仍分别记录。

本轮已通过：`node scripts/windows-privilege-timing-runner.mjs --self-check`；十份 PowerShell AST 解析；C# 管道/启动器源码 Add-Type 编译；新增/修改共享代码与测试文件的 TypeScript 定向诊断；`git diff --check`。通过当前命令执行器直接运行生成的 C/D 卷查询脚本，结果为两个 NTFS，脚本本身约 **31ms**；另一次 C/E DriveInfo 调用约 **20ms**。这些只验证当前会话内卷读取，不含冷启动系统 Windows PowerShell，不能当作完整 PATH/UAC 提速数据。

另外尝试了两条 `--mode probe` 只读后端测试：hosts 在令牌查询启动时收到 `spawn EPERM`，PATH 的卷查询、环境读取和 reg.exe 后备读取同样被当前沙箱拦截，报告状态均为 error。PATH 卷查询正确回退为 false，但后续严格 PATH 快照读取失败仍停止操作，没有用空 PATH 继续写入。报告分别保存在忽略目录的 `c2c61d69-a484-4705-af5a-c909064376db/report.json` 和 `3afb122e-657f-4a68-a4c4-9f2a8a1b6036/report.json`；两次均未进行系统写入，也不能据此宣称完整 Windows 功能或新耗时已验收。

根据旧报告，移除额外 launcher 应减少 UAC 前约 1.18–1.19 秒的普通进程准备；普通权限复核和 DNS 刷新也分别省掉一次客户端 PowerShell 启动。批量轻量卷查询针对旧 PATH 前置的 5.74 秒大项。这里只说明成本对应关系，不将各段简单相加或承诺固定总耗时。当前代理沙箱禁止 Node 启动 PowerShell，未在此执行真实 UAC/系统写入；需在普通 Windows 会话重跑同样两条 apply 命令，以实际 `beforeRunAsMs/backendMs/path.volumes/ordinary.permission-recheck` 比较。

本轮保留普通权限 EPERM/EACCES 后的 PowerShell 复核：Windows 文件被占用时 Node 也可能返回 EPERM。此处记录第十一轮的历史决策；用户随后明确选择减少授权前等待，第十四轮取消这次复核，现行策略及边界见该节。管道 ACL、原生身份核验、执行时路径/reparse 检查和 uncertain 保护继续保留。本轮没有修改 Go Helper，源码版本仍为 28，不产生新的 Helper 版本或二进制发布要求。

## 第十二轮：修复短引导与 broker 切换时标准输入被截断

### 实施前的操作契约

- 原 fork 执行器继续持有一次性进程、管道、业务终态和未知状态；本轮仅修正其输入运输，不新增模块或配置，也不改变授权方式和租约。
- 从短引导读取代码、broker 读取业务 JSON 到父 EOF 监视，使用同一个严格 UTF-8 TextReader；前两帧顺序读取完后才交给监视线程，禁止另一读取器抢读/丢弃缓冲。
- 无效输入/编译/管道准备失败仍在 READY 前结束，不启动动作；READY 后保留既有认证、启动分类、取消、未知写禁止重放和迟到清理。
- 回归要验证真实 .NET 读取器的预读、跨帧、大载荷和 Unicode，不再仅用 Node 流替身与 AST/编译判断输入运输正确。
- 用户报告 hosts/PATH 均在 broker READY 前失败，没有 RunAs 或 action.execute，不能视为提速验收；PATH 卷查询 828.965ms 对比旧两次探测 5741.510ms，是可独立确认的改进。

### 故障证据与根因

用户两份失败报告是 `034c5822-ba1b-4fe2-ba7b-d2e3f7cd3ebe/report.json` 和 `f5239f0a-8644-416f-9cf5-8bcbb92c3046/report.json`。hosts 的普通权限复核、PATH 的 UAC 管道都在 Add-Type 已完成后、READY 之前失败；PATH 明确给出 `Invalid JSON primitive: ckedPath`。这是第十一轮优化引入的输入运输错误，不是首次 Node hosts 写入的预期 EPERM，也不是用户取消或设备缺失 PowerShell。

短引导先通过 Console.ReadLine 读取代码帧，Console.In 的 StreamReader 会预读后续 JSON。进入 broker 又设置 Console.InputEncoding，.NET 重新创建 Console.In，原读取器中的 JSON 前缀被丢弃，第二个读取器只能读到尾部（例如 ckedPath）。先前 Node 流替身只验证写出的完整文本，AST/编译只验证语法，均没有运行实际 .NET 预读过程；因此第十一轮通过的检查不能证明真实标准输入运输正确。

### 修复与补充边界

1. `src/shared/WindowsActionPipe.ts` 的固定短引导从 OpenStandardInput 创建一个显式、严格 UTF-8 StreamReader，保存在 script 作用域；代码帧、JSON 帧及父存活监视都使用同一个对象，不再使用 Console.In 或设置 InputEncoding。不会自动探测 UTF-16/其他编码，只在代码帧开头兼容 .NET Framework writer 可能写入的 UTF-8 BOM；业务原文和 digest 文本不被修改。C# WatchParent 接收这个 TextReader，前序读取完成后才监视其 EOF。模块自动加载进度设为 SilentlyContinue，真实错误仍保留；JSON 解析失败返回固定诊断，避免错误消息泄漏私有载荷片段。
2. 同时补上启动超时边界：broker 输出 READY 后先等待父进程 `LAUNCH` 确认，随后才开始客户端和 EOF 监视；父进程仅在就绪 Promise 仍有效时发确认。启动计时器先到时锁定失败，迟到 READY 不得再启动动作。此前 broker 单方面输出 READY 就自动启动，可能与 Node 30 秒启动超时交错，导致已经开始的修改被错误归类为启动前失败；确认帧消除了该重放风险。监视线程在确认后接管同一读取器，不能抢读确认帧。安装器/外部测试启动客户端的旧分支不使用该确认帧。
3. `scripts/windows-privilege-optimization-test.ts` 增加共享 reader、无编码重置、固定错误诊断、确认先于启动、启动超时后的迟到 READY 不发送确认等生产源码/事件检查。原有普通/UAC、取消、未知写、迟到结果和清理测试仍通过。
4. `scripts/windows-privilege-timing-test.ts` 的自检仍生成十份真实 PowerShell 计划，并生成普通权限原生检查 fixture。fixture 业务只是带中文/emoji 的内存返回值和 100 KiB 注释，不访问 hosts、不写注册表、不弹 UAC。
5. `scripts/windows-privilege-stdin-test.ps1` 使用生产短引导和 AST 提取的真实 JSON 读取语句，仅注入内存流作为 OS 输入边界。覆盖四种代码帧长度、三种载荷长度、有/无 UTF-8 BOM，共 24 组；测试严格 UTF-8、中文/emoji/路径/换行转义、预读与后续父存活帧及 EOF。另用重建 reader 的对照在同样输入中复现数据丢失。不复制业务读取算法，不调用提权或真实系统写入。
6. `scripts/windows-privilege-native-stdin-test.ps1` 使用 fixture 中校验后的完整系统 PowerShell 路径，启动真实生产短引导/broker。`-ReadinessOnly` 不启动客户端，验证大 JSON 输入、C# 编译、原生管道创建、READY 及父 EOF 回收；默认模式另外验证普通客户端启动、认证及返回值。测试保留子进程原始诊断，仅清理本测试创建的确切 broker，不放宽生产管道 DACL，也不调整系统令牌限制。

### 本轮验证结论

- `node scripts/windows-privilege-timing-runner.mjs --self-check` 通过；定向 TypeScript 诊断、`git diff --check` 通过。
- 使用系统 **Windows PowerShell 5.1.26100.8875** 执行 `scripts/windows-privilege-stdin-test.ps1`：24/24 正确，24/24 确实发生跨帧预读，旧重建 reader 方式在 24/24 中丢失 JSON 帧；十份 AST 和 native C# 编译通过。
- 同一系统 PowerShell 执行 `scripts/windows-privilege-native-stdin-test.ps1 -ReadinessOnly`：真实 broker READY 和共享 reader 的父 EOF 退出通过，没有启动客户端或系统写入。
- 默认原生普通客户端检查仍未通过当前代理环境：客户端连接 native pipe 被 AccessDenied 拒绝，固定退出码 73；只读检查确认当前 token 的 IsTokenRestricted 为 true、Administrator 为 false。这与代理受限令牌一致，验证范围不能扩展为整条普通/UAC 功能验收；生产 DACL 和原生身份核验保持原强度。调试用的临时改写 fixture 已由最终自检重新生成，无调试转发进入生产代码。
- 用户本次 PATH 卷阶段 828.965ms，旧两次共 5741.510ms，阶段差约 4.91 秒。旧值含一次 EnvSync，而本次后续 PATH 快照仍有环境同步，不能据此承诺整条流程精确减少 4.91 秒；两次失败报告也没有新的 beforeRunAsMs。修复后应重新运行原两条 apply 测试，验证 hosts/PATH 写入与安全恢复，再比较完整耗时。

本轮修改的是 TypeScript、运行时 PowerShell/C# 和测试文档，没有修改 Go Helper，不增加其版本。

### 中文环境和环境变量路径复核

共享 UTF-8 reader 处理的是 Node 到 broker 的匿名输入流：Node 字符串按 UTF-8 写入，broker 按同一编码解码，随后以 .NET Unicode 字符串传递。此运输不依赖 Windows 的 CP936/GBK 或终端代码页。命名管道两端也显式使用 UTF-8；EncodedCommand 自身继续按 PowerShell 要求使用 UTF-16LE，两条通道分别与各自接收端一致。

系统 PATH 的生产写入仍是 RegistryKey.SetValue(Path, string, ExpandString)，其他环境变量也是字符串注册表值，没有增加 ANSI 转换或中文过滤。为进一步验证用户提出的场景，`windows-privilege-stdin-test.ps1` 在每组载荷中加入 `D:\开发环境\PHP 8.3\bin`、`C:\Users\用户目录\AppData\Local\FlyEnv`，覆盖路径数组、用分号连接的 PATH、`%SystemRoot%\System32` 及 PHPROOT 值，并对解码后的完整字符串逐项比较。

系统 Windows PowerShell 5.1.26100.8875 下 24/24 通过；中文、空格、反斜杠和变量占位符均保留。这次验证了运输和 JSON 解码，没有实际写系统注册表；真实 UAC 写入和恢复仍沿用前述 apply 测试确认。

## 第十三轮：修复后用户完整 apply 实测通过

### 实测来源与功能结果

用户在正常 Windows 会话重新执行原两条完整测试，报告为 `da968281-7ae6-4128-816c-1f2a93d56fbf/report.json`（hosts）及 `3fbb5430-3501-4251-b9ad-033d4ab6f9b4/report.json`（PATH），状态均为 apply/ok。这确认了新共享 reader、父启动确认及 broker 启动机制在本次普通权限/UAC 调用中实际跑通：hosts 普通权限失败后的复核、管理员写入、DNS 刷新、结果核对及保护恢复通过；PHP 模块的 junction、系统 PATH 写入、环境刷新、列表读取及原 PATH 保护恢复通过。测试使用已选 UAC 的生产 provider/租约逻辑，没有走 Helper 执行业务。

开头 Node 写 hosts 的 EPERM 和复核后的 windows_permission_denied 是预期的普通权限失败，随后确实完成 UAC；并不与最终 apply/ok 矛盾。此前两份 READY 前失败报告保留作回归证据，不再作为当前功能状态。此次没有新测真实 renderer IPC、方式选择 UI、企业策略或跨账户凭据，因此功能结论限定在这两条已执行的后端路径。

### 相同口径的前后比较

“后端开始到请求 RunAs”仍从 test.backend start 到首次 launcher.runas-requested，不包含测试源码导入、备份和事后恢复，也不等同于 UAC 窗口第一帧。

- **hosts 请求 RunAs 前**：4934.056ms → **3998.702ms**，减少 935.354ms（**18.96%**）。新报告的 6703.772ms 减去后端开始 2705.070ms 得到该值，不能直接拿 6703.772ms 当作页面操作耗时。
- **PATH 请求 RunAs 前**：8553.864ms → **2811.094ms**，减少 5742.770ms（**67.14%**）。新报告的 6172.463ms 减去后端开始 3361.369ms。
- **hosts 完整后端**：11765.092ms → **11017.863ms**，减少 747.229ms（**6.35%**）。其中仍含用户批准/进程启动等待及 DNS 刷新。
- **PATH 完整后端**：14048.601ms → **10284.284ms**，减少 3764.317ms（**26.79%**）。本轮 launcher.runas 为 4827.516ms，旧值为 2429.032ms，增加约 2.40 秒；这是系统提权/批准/进程启动的组合等待，不能断言全部是用户手动等待。其变化抵消了部分前置准备节省，比较弹窗前延迟应优先看 beforeRunAsMs。
- **PATH 卷查询**：旧两次卷阶段合计 5741.510ms → 单次 path.volumes **810.110ms**。旧 EnvSync 成本本轮仍部分出现在 path.read-snapshot（597.084ms，其中 snapshot-env-sync 372.244ms），嵌套阶段不能重复相加。

### 剩余耗时与实测修正

移除额外 UAC launcher 的效果在请求边界上明确可见：hosts 本轮 READY 到 RunAs 标记约 8.9ms，PATH 约 8.8ms；旧独立 launcher 启动到请求约 1.19 秒。但不能据此把每次普通权限调用也宣布为提速。

hosts **ordinary.permission-recheck 为 3117.923ms**，旧为 2353.200ms，增加约 0.765 秒，约占本轮请求 RunAs 前总耗时 78%。其中普通管道准备 1121.232ms，与旧 1138.996ms 接近；普通客户端启动/结果等待 1994.656ms，旧为 1210.613ms。实际权限检查脚本依然仅约 77ms，新增等待并非文件写入本身。DNS 完整刷新 2721.924ms 与旧 2797.269ms 接近，也没有出现显著加速；恢复后最后一次普通 DNS 调用甚至出现 3309.247ms 的启动/结果等待，说明该阶段仍有波动。

现有普通阶段覆盖进程启动、连接/身份校验、载荷与结果传输、退出等待，尚未把这些内部边界分别计时。因此不能把剩余成本归因到某一个 API、线程池或安全软件，也不能将一次成功报告作为所有设备的稳定耗时承诺。本轮仅记录用户实测和结论；第十四轮根据用户明确要求，改为直接授权，接受 EPERM 在授权前无法完全区分共享锁的边界，继续保留原生身份检查及未知写保护。

## 第十四轮：取消 Node 拒绝访问后的普通 PowerShell 复核（2026-10-01）

### 实施前操作契约

用户明确要求 Node 无法写入时直接进入授权，取消成功率低且耗时明显的普通 PowerShell 复核。沿用现有应用级权限配置和所有者，不新增模块、Pinia、持久化字段或生命周期例外。

- 所有者：共享 executeWindowsPrivilegeOperation 负责验证和分流；主进程 WindowsPrivilegeCoordinator 负责首次选择及 FIFO 租约；实际文件/服务操作仍归 fork，业务 UAC 执行器负责认证终态和未知结果保护。
- 生命周期：普通 Node 尝试、必要时令牌检查、方式解析、执行到可信终态；取消或失败直接结束，不自动换方式。首次选择仍持续显示直到用户选择或取消。
- 中间事件：保留 ordinary.attempt、ordinary.node-write、令牌/方式/租约、UAC 启动及执行计时；移除 ordinary.permission-recheck 阶段。进度、页面卸载行为和服务启停机制沿用原实现。
- 终态与重复调用：成功返回真实结果，失败保留原错误；租约继续由既有 finally 释放。未知写动作继续禁止盲目重放，不以新的路由绕过 uncertain 保护。
- 分流边界：Node 成功直接结束；EPERM/EACCES 或结构化 windows_permission_denied 后，普通进程进入用户选择的 UAC/Helper；其他明确错误及已提升进程的失败直接返回。机器级 PATH/环境变量写入维持原有直接授权策略。
- 回归计划：用真实生产入口配合注入的文件 API、令牌及执行运输验证成功、拒绝访问、Helper 偏好、明确非权限错误、管理员失败、取消/未知终态和系统 PATH；继续执行既有未知写保护回归，不实际改 hosts 或注册表。

### 处理原因与必须保留的边界

最新 hosts 报告的普通复核为 3117.923ms，实际权限拒绝脚本约 77ms，其余主要在运输/进程准备。Node 已返回访问拒绝后再启动完整普通管道，通常仍使用同一账户权限。这次删除的是第二种运行时的写入复核，普通 Node 优先、执行时路径检查和后续 DNS 普通权限执行继续保留。

EPERM/EACCES 不是管理员权限不足的绝对证明，也可能来自文件共享锁或安全策略。这次接受此类模糊错误进入授权：授权后的真实锁冲突/磁盘错误仍须返回，不能承诺授权一定解决。ENOENT、EBUSY、ENOSPC、EIO 和参数/路径校验失败等明确错误不触发权限选择；已经提升的 FlyEnv 仍失败时不再请求 UAC。已选择 Helper 的用户继续走 Helper，没有强制改成 UAC。

### 代码清单与回归结果

1. `src/shared/WindowsPrivilegeOperation.ts`：移除 catch 中的 ordinary.permission-recheck 调用；更新入口和错误分类注释，明确 EPERM 的歧义。保留首次及执行前白名单/路径检查，普通成功无令牌探测，非权限错误短路，管理员失败短路，以及原有方式解析、租约和环境刷新。读文件、Buffer 写入及删除的 Node 访问拒绝也遵循同一分流，不单独增加 hosts 特例。
2. `scripts/windows-privilege-routing-test.ts`：新增 21 个路由情形，进程内加载真实入口，复用真实动作生成器、路径校验、原因和计时模块；只注入文件 API、令牌和执行运输。覆盖 Node 成功、两种 Node 拒绝码及结构化拒绝、Helper 偏好、四种非权限错误、验证失败、管理员失败、令牌探测失败、UAC 取消/未知终态/业务失败、Buffer/读/删除、BOM 清理和普通/管理员 PATH。断言调用顺序及无复核计时；不会执行系统写入或 UAC。注入的业务失败覆盖授权后共享锁的错误传播，不能代替真实文件占用实测。
3. `scripts/windows-privilege-optimization-test.ts`：现有自检调用新增路由回归，继续验证真实 UAC 执行器的未知写阻止、迟到认证终态解锁、只读例外及管道启动生命周期。没有绕过执行器或重写 uncertain 算法。
4. 本文同步更新当前分流逻辑与 hosts 测试流程；先前性能报告和保留复核的历史决策继续作为阶段记录，现行策略以本节为准。

`node scripts/windows-privilege-timing-runner.mjs --self-check` 已通过，包括新增路由回归和原有优化/运输/计时回归。使用项目 tsconfig 对三个本轮代码文件筛选 TypeScript 诊断，结果为零；这是改动文件检查，不是全仓类型检查。`git diff --check` 通过。未改 Go Helper，源码版本仍为 28。

此次没有在代理受限令牌下运行 apply、改系统 hosts/PATH 或弹真实 UAC。删除旧报告中 3.12 秒的复核可减少对应等待，但新的总耗时需要用户正常 Windows 会话重跑原 hosts 命令，以 beforeRunAsMs 为准；不能将旧耗时相减当作本次实测。完整测试的写入及恢复仍是两个独立授权动作，因此仍会出现两次 UAC。

### 用户完整 hosts 复测结果

用户随后在正常 Windows 会话运行原 hosts apply 命令，报告 `49b62941-eb3b-4bef-a42c-80b879c4a7f7/report.json` 为 apply/ok。读取本地报告并与前一份 `da968281-7ae6-4128-816c-1f2a93d56fbf/report.json` 对比，确认普通 PowerShell 复核事件已消失，管理员写入、结果核对、普通 DNS 刷新和 hosts 保护恢复完成。日志最初的 Node EPERM 仍是预期的普通权限拒绝。

| 同口径阶段 | 移除复核前 | 本次复测 |
| --- | ---: | ---: |
| 后端开始到首次请求 RunAs | 3998.702ms | 1438.525ms |
| 完整业务后端（不含导入及恢复） | 11017.863ms | 8915.709ms |
| 首次 RunAs 启动/批准等待 | 3695.363ms | 4576.834ms |
| 写入后 DNS 刷新 | 2721.924ms | 2307.248ms |

提权前等待减少 2560.177ms，约 64.03%；完整业务后端减少 2102.154ms，约 19.08%。前置降低与复核移除一致，但不是机械减去旧复核的 3117.923ms：本次 UAC 管道准备为 1140.611ms，上一轮为 607.261ms，启动成本仍有波动。当前提权前主要为令牌探测 226.297ms 与管道准备 1140.611ms；broker.compile 的 220.920ms 已包含在管道准备中，不能重复相加。

beforeRunAsMs 仍是后端开始到请求系统 RunAs 的时间，不是 UAC 窗口首帧或完整 UI 响应时间。本次首次 RunAs 等待比上一轮增加约 0.88 秒，包含系统提权、批准和进程启动；不能全部视作应用准备。实际管理员写入脚本仅 66.948ms。CLI 的 17.90 秒另含模块导入、恢复及两次批准，不代表日常单次 hosts 修改耗时。此次复测没有重跑 PATH，也不能据 hosts 结果追加 PATH 性能结论。

## 第十五轮：设置页权限方式布局与说明（2026-10-02）

### 实施前操作契约

本轮用户要求调整设置页样式、修正文案，将两种方式说明放入 tooltip，并说明停用逻辑。输入仍归 mounted 设置组件，选项仍读取应用既有配置；选择、修复和停用继续由 WindowsPrivilegeController 单例拥有。页面不增加 IPC、任务探测或 Helper 安装状态，也不新增模块、Pinia 或持久配置例外。

- 入口/生命周期：选项 change 或维护按钮调用现有 controller；code 200 保持执行中，成功/失败/六分钟执行超时才结束，并清监听/计时器。首次选择弹窗等待用户不计时。
- 重入：相同请求复用 operation Promise，冲突操作拒绝；busy 时禁用输入和按钮；页面卸载不终止正在执行的维护操作。
- 服务交互：设置选择 Helper 仍使用既有 repair；切换 UAC 时只有勾选停用才提交维护 IPC。帮助程序进程、任务及跨账户目标检查仍由主进程共享维护执行器负责，不以 renderer 文案推断实例已安装或已停止。
- 布局：移除强制横向的 reset-pass 类，选项及维护按钮使用可换行工具区；两个方式的说明只在各自 tooltip 展示。管理员与未选择状态互斥；停用开关使用准确的短标签，详细影响移入 tooltip。亮暗配色使用既有主题变量。
- 回归检查项：普通/管理员、未选择/UAC/Helper、忙碌、长语言/窄列换行、tooltip、页面重进，以及停用失败不回退偏好。授权和维护生命周期没有改动，本轮不追加系统操作测试。

### 代码与文案调整

1. `src/render/components/Setup/WindowsElevationMethod/index.vue`：移除 reset-pass 带来的全局横向排列覆盖；新增局部布局，让方式选项和维护按钮在窄列中换行。方式说明仅作为各自 el-tooltip 的 content；tooltip 使用默认插槽作为触发器，避免沿用 el-popover 的 reference 插槽导致触发器丢失。继续使用原 radio 的 value/change 和 Controller 命令，保留默认勾选的切换停用输入。停用详细影响同样放入 tooltip，管理员/尚未选择提示互斥。SCSS 对按钮、复选框和长翻译设置换行及最大宽度，颜色继承既有设置面板和 Element 主题，不增加亮暗色硬编码。
2. `src/lang/*/setup.json`：全部 33 个语言文件新增 disableOnSwitch 和 disableHelperTips，区分“切换时才执行”和独立停用入口，并说明停止进程、禁用任务、保留文件及可能需要 UAC。简体中文、繁体中文、英文同步修正设置标题提示、两种方式描述及管理员/未选择提示；这些既有描述也用于首次选择弹窗，弹窗布局仍沿用原设计。
3. 本文补充设置操作契约、现有维护调用链、无安装状态探测的显示语义及失败边界。Controller、main IPC、UAC、Go Helper 的执行逻辑没有改动，帮助程序版本继续为 28。

### “停用帮助程序”的完整现行逻辑

- 独立按钮仅在选定 UAC 时显示，调用 Controller.disableHelper → application:windows-helper-disable → disableWindowsHelper。按钮可见只代表提供维护入口，不代表已检测到安装或运行中的 Helper。
- 未选择或当前选择 Helper 时，复选框只存本页输入；切换 UAC 后先保存并应用新的偏好，再按勾选状态提交同一停用 IPC。勾选本身不执行系统操作；停用失败警告并保留 UAC，不自动回到 Helper。
- main 把维护标记为交互操作；共享维护执行器捕获原 Windows 账户身份，按 SID 派生 instanceId、精确实例目录、程序路径和计划任务。跨账户批准 UAC 不改变目标。重复执行共享 pending Promise。
- 如果整个实例目录不存在，直接返回成功，不启动 UAC。仅 instance.json 缺失不能跳过；原令牌 EACCES/EPERM 则继续由授权脚本核对，其余目录访问错误返回。这里没有声称独立扫描了所有旧任务：实例目录已被外部删除的孤立任务不在这条快速路径里处理，旧机器级或其他账户实例也不在定向停用范围内。
- 已提升的 FlyEnv 以已有令牌执行维护脚本；普通运行申请全局 FIFO 租约，再为本次维护请求 UAC。这是独立维护授权，不需要改写当前偏好，也不调用帮助程序完成停用。
- 脚本连接系统任务计划服务，只有 file/path not found 被当作任务不存在。任务存在时核对 SYSTEM 主体、ServiceAccount/Highest、唯一动作及触发器、完整程序路径、精确参数和原账户触发 SID。身份可疑或读取失败时明确拒绝，不按程序名批量停任务。
- 先禁用任务，再 Stop 并最多等待十秒；任务仍运行或仍启用则失败。残留进程只按精确实例程序路径、原 SID 和 instanceId 参数停止，再按实例路径最多等待十秒确认进程消失。未退出则失败，不能把已禁用任务当作整个停用成功。
- 不删除计划任务、安装文件、key 或实例配置；以后选择 Helper 可经原检查/修复流程恢复。任务修改和进程停止不是原子事务，取消/执行错误或未知结果可能需要检查实际状态并重试；既有认证结果和未知写保护继续适用。
- Controller 持有维护状态到成功、失败或六分钟响应超时，清监听/计时器并释放 busy；页面离开不丢失状态。六分钟 renderer 等待超时不证明后台操作未执行，不能承诺超时自动撤销系统修改。

### 本轮检查记录

修改时逐文件解析 JSON、局部更新字段并再次解析后写回，避免整文件重排或覆盖其他翻译。`git diff --check` 通过。已静态检查 tooltip 插槽、选项值、busy/错误分流、长内容宽度及主题变量；未运行测试、构建或 Electron，实际悬停、键盘焦点、窄窗口与亮暗主题视觉效果仍需界面验收。本轮没有执行计划任务维护或真实 UAC。

## 第十六轮：设置切换自动停用与 Helper 成功通知归属（2026-10-02）

### 实施前操作契约

用户要求设置切换到 UAC 自动停用，不再展示勾选项；设置切换到 Helper 完成准备后立即提醒，之后站点 IPv6 等健康检查不重复提示安装成功。本轮沿用既有配置与 WindowsPrivilegeController/HelperStore 操作所有者，不新增模块、Pinia、配置或安装状态缓存。设置页仅调用 controller；首次授权弹窗的可选停用输入继续归本次弹窗，此轮要求针对设置页。

- UAC 设置切换：Controller.select 默认为 UAC 请求停用；先保存偏好再等待独立维护终态，失败仍警告并保留 UAC。去除设置页 ref/checkbox 及专属样式，说明自动停用影响放到选项 tooltip。独立停用按钮保留供失败重试。
- Helper 设置切换/修复：controller 的 busy、operation Promise 跨页面拥有选择与 repair 的完整生命周期；仅真实 repair 响应成功后发送一次“帮助程序已就绪”。失败由原 HelperStore 对话框处理，不发成功提示，不回退偏好。
- 首次选择：choiceId 请求继续由挂起的业务操作拥有首次安装，controller 不并行 repair；实际首次安装成功通知仍由 main 状态流负责。管理员模式继续不安装 Helper。
- 通知归属：AppHelper 保留同一 checkSuccess 终态，额外标明本次是否执行安装；Application 对 Windows 的仅健康/恢复成功不广播安装成功。设置期间实际安装的全局通知继续被既有 busy 过滤，由 controller 的 ready 提示负责；业务真实安装可以通知。
- 终态/重入/服务：相同请求共用 Promise，code 200 不结束，失败/成功/执行超时 finally 清理，页面卸载不丢失操作；健康检查、版本校验、恢复/安装、FIFO 租约和站点 hosts 操作没有省略。main 维护真实任务/进程所有权不变。
- 静态检查项：默认 UAC 停用、失败保留偏好、Helper 已健康/实际安装/恢复/取消/失败、首次选择不并行安装、页面重进以及 Windows 与非 Windows 通知边界。本轮不新增/运行测试或真实系统操作。

### 原因与逐文件调整

原 AppHelper.install 在“已健康”“成功恢复任务”和“新安装后健康确认”三种路径上都发送 checkSuccess，Application 统一把它翻译为安装成功。设置切换等待 repair 时，GlobalIPCOn 又因为 controller.busy 过滤全部 Helper 广播，而 controller 自身不发送成功通知；设置中的成功消息因此丢失，后续站点请求再次确认健康时反而显示安装成功。

1. `src/render/components/Setup/WindowsElevationMethod/index.vue`：移除 checkbox、disableOnSwitch ref 和复选框专属 SCSS。设置直接调用 Controller.select(value)，UAC 自动停用说明仅放入该选项 tooltip；不再由本页输入决定是否维护任务。独立停用按钮继续用于取消/失败后的重试。
2. `src/render/components/Setup/WindowsElevationMethod/Controller.ts`：select 的停用默认值改为 method === 'uac'，因此设置切换自动维护；首次弹窗仍可传自己的明确参数。设置切换 Helper 和 repair 在 HelperStore.repair 返回 true 后由 controller 发送一次 helperReady，返回 false 时保留原失败对话框，不发送成功。choiceId 请求仍不额外 repair，管理员模式仍不安装。
3. `src/main/core/AppHelper.ts`：checkSuccess 通知新增可选 installationPerformed 元信息，每次执行从 false 开始；只有实际安装命令成功返回后设为 true，健康确认完成后才发送成功终态。已有 Helper 健康或仅恢复任务为 false。除通知元信息外，安装 Promise、恢复、健康等待、错误码、诊断及后置回调不变；失败通知继续沿原链处理。
4. `src/main/Application.ts`：Windows 上 checkSuccess 且未实际安装时直接结束通知分发，不把健康检查翻译成安装成功。真正安装后仍广播，由现有 GlobalIPCOn 的 busy 过滤避免设置双通知；首次业务安装在空闲时仍显示成功。非 Windows 继续使用原通知行为，没有加入全局“本次启动已经提醒过”的缓存，以免隐藏后续真实安装结果。
5. `src/lang/*/setup.json`：全部 33 个语言文件新增准确的 helperReady，并将 disableOnSwitch 从勾选标签改为自动停用规则；保留安装文件的说明不变，首次弹窗描述不作自动停用承诺。
6. `scripts/windows-privilege-renderer-test.ts`：仅为既有控制器用例补齐 MessageSuccess 通知替身，没有新增测试情形或运行测试。
7. 本文记录新操作契约、通知根因、代码清单及验收边界。Go 没有变更，帮助程序版本仍为 28。

### 失败边界与本轮检查

设置保存成功不等于 Helper 准备成功，只有实际响应 true 才通知“已就绪”。若安装取消、超时或健康验证失败，不显示成功；已经保存的 Helper 偏好保留，后续实际需要修复时仍可重试。这里去除的是健康检查的重复安装提示，不屏蔽未来真实重新安装的成功/失败。切换 UAC 自动停用的取消或失败仍保留 UAC，可能部分禁用任务，应使用原维护入口重试；文件不卸载。

已按调用链静态检查设置/首次弹窗/站点请求的通知归属、安装标志设置时点和 finally 清理。翻译采用局部字段更新并在写入前解析 JSON，`git diff --check` 通过。本轮未运行测试、构建、Electron 或真实 UAC；设置切换时的实际提示时序及随后 IPv6 操作仍需在正常 Windows 会话验收。

## 第十七轮：UAC 模式正常退出清理 hosts（2026-10-02）

> 2026-10-04 更新：本节为历史实施记录。当前退出先完成 service/fork drain，再并行
> 停止 HTTP、MCP、自有服务和清理 hosts；全部结算后回收 fork、释放权限协调器。
> DNS 刷新仅尽力启动，失败不覆盖文件结果。详见
> [退出清理并行调整](application-quit-parallel-cleanup.md)。

### 实施前操作契约

用户报告 UAC 模式退出后域名残留。本轮退出流程由 Application 的 stopPromise 与 Launcher 拥有；ServerManager 负责读取系统 hosts 并移除托管块，WindowsPrivilegeCoordinator 负责正常退出期间的既有方式解析/租约和最终释放。没有 renderer 长操作、新模块、Pinia 或持久化配置例外；不绕过 UAC 或借用已停用 Helper。

- 生命周期：开始正常退出 → 取消未完成首次选择并禁止新选择 → 停自有服务 → 回收 fork → 清理 hosts/必要时请求已选 UAC → 最终销毁权限协调器 → 退出。所有正常出口及 relaunch 共用 stopPromise。
- 权限：清理属于用户退出触发的交互动作，可使用已明确保存的 UAC。退出阶段不弹首次方式选择框，也不安装/修复 Helper；已提升进程仍直接执行。协调器不能在 before-quit 时提前 dispose，但需在真正退出时提供兜底回收。
- 终态：没有托管块不写入、不请求授权；成功删除全部完整托管块，保留其他内容，并在 Windows 刷新 DNS；读取、授权取消、写入或 DNS 失败记录错误后继续正常退出，不能宣称失败时也完成清理。
- 重入与资源：stopPromise 共享停止；重复 before-quit 在清理完成前继续 preventDefault，避免第二次退出绕过等待。服务停止先于 fork 回收，清理置于 fork 回收后以减少普通站点写入回写。未知管理员动作仍按原机制处理，不作盲目重放或操作系统级原子互斥承诺。
- 静态检查项：菜单退出、app.quit、relaunch、重复退出、无托管块、多个托管块、管理员/UAC/Helper/未选择、目录/文件缺失、取消/未知结果、读取写入失败及资源释放。本轮不新增/运行测试或实际修改系统 hosts。

### 根因与逐文件调整

1. **原退出文件写入处于后台上下文。** ServerManager.cleanHosts 调用 main 的 writeFileByRoot，后者在 Node 拒绝访问后转入统一权限入口。退出没有 withWindowsPrivilegeInteraction(true)，协调器因此只允许已选 Helper，拒绝 UAC。菜单 application:exit 与 relaunch 也受此影响，不仅是 app.quit 路径。
2. **before-quit 提前 dispose。** Application 原先在第一次 before-quit 就释放权限协调器，但 Launcher 已 preventDefault 并异步等待 stop，此时服务/hosts 清理还没完成。后续方式解析和租约申请会收到 Application is closing。
3. **清理错误被吞掉且只移除首块。** 原 catch 空处理使拒绝访问看似没有问题，replace(x[0], '') 又只移除第一份完整托管块。重复退出的 isQuitting 直接 return 还可能允许第二次 app.quit 越过未完成清理。

- `src/main/Application.ts`：doStop 开始设置 willQuit，并调用 beginShutdown 结束首次选择；停止自有服务使用可信退出交互上下文。先等待停止服务，再回收 fork，最后在同一类交互上下文中调用 cleanHosts；成功或失败均在 finally 中 dispose。失败以 logger.warn 写入退出清理日志，仍继续关闭托盘和退出。will-quit 仅作为真正退出时的幂等兜底，不再在 before-quit 释放队列。ensureWindowsHelper 在关闭阶段只 AppHelperCheck，不恢复/安装常驻实例。
- `src/main/core/WindowsPrivilegeCoordinator.ts`：新增应用生命周期的 closing 标志。beginShutdown 取消未完成首次选择，select/present 拒绝新的设置/弹窗；resolve 仍允许已经确认的方式，但没有保存选择时不再创建首次弹窗。acquire/release 与 owner 校验在 hosts 清理前继续可用；最终 dispose 才回收所有租约。isClosing 只供主进程阻止退出期间 Helper 准备安装，不作为执行令牌或权限来源。
- `src/main/core/ServerManager.ts`：stopServer 只停止服务，cleanHosts 改为由 Application 单独编排的公开阶段。读取真实 WindowsHostsFile，不依赖 host.json；沿用 FlyEnv 标记协议删除所有完整块，保留读取时的块外文本。没有变化直接返回。Windows 写入成功后复用 Helper.send('host', 'dnsRefresh') 的普通权限优先分流，Windows 失败向退出所有者传播；非 Windows 保留尽力清理。
- `src/main/Launcher.ts`：区分开始清理 isQuitting 和允许最终退出 quitReady。清理期间每次 before-quit 均 preventDefault；重复请求不再启动第二次清理，也不能提前关闭正在等待 UAC 的进程。stop 终态后设 quitReady，再发最终 app.quit。
- 本文补充操作契约、调用链、代码注释依据及部分完成边界。没有更改 Go，帮助程序版本保持 28。

### 现行行为与边界

- 已确认 UAC 且存在托管域名：普通 Node 写入失败后为退出清理申请 UAC，完成后才结束进程；主进程自己的 provider/Helper 单例执行，不依赖已回收的 UtilityProcess。没有托管块、普通令牌可写或 FlyEnv 已提升时不因为 hosts 清理单独弹 UAC。
- 已确认 Helper：退出仅使用现有健康实例。实例不健康时记录失败，不能在退出时偷偷重装或改选 UAC。未选择方式且普通访问失败时记录授权错误，不弹无限期选择框。
- UAC 取消、权限拒绝、系统文件被锁、磁盘错误或通道未知结果：记录真实失败并继续退出，不能承诺域名一定清除。写入已完成但 DNS 刷新失败也会记录部分完成；未知写操作继续禁止盲目重放。正常情况下 DNS 使用普通权限，不需要重复批准；若系统拒绝刷新，仍按既有方式处理。
- 删除范围是既有完整标记对；缺失结束标记的孤立块不会通过截断文件清除。未新增对损坏/嵌套标记的修复规则，也不改变 hosts 字符编码处理。清理仍使用读取后的内容快照，不是与外部 hosts 编辑器的事务；等待批准期间外部修改有覆盖风险。本轮回收 fork 减少应用自身重新写回，但不能保证先前未知管理员子进程已终止或多个 FlyEnv 数据实例跨进程互斥。
- 正常菜单退出、app.quit 与 relaunch 共用该停止流程。任务管理器强杀、app.exit 的外部直接调用或系统强制结束无法依赖异步退出钩子保证清理；已有受控 app.exit 路径先 await stop。服务停止继续使用既有自有 PID/命令检查，生命周期实现不重复。

### 本轮检查记录

已静态核对退出入口、stopServer 的全部调用方、主进程与 fork 的交互上下文传递、协调器关闭阶段、租约最终回收，以及 Node/Helper/UAC 文件与 DNS 失败路径。`git diff --check` 通过。未新增/运行测试、构建、Electron 或真实系统 hosts 操作；普通 Windows 会话的退出 UAC、拒绝批准、无托管块与重复退出仍需实机验收，不能将静态调用链修复当作实际清理已通过。

## 第十八轮：Windows PHP 多 worker 停止中断（2026-10-02）

### 实施前操作契约

用户报告退出仅清理 spawner 和一个 php-cgi，其余三个 worker 留存。本轮复用现有退出停止流程及统一 Windows 进程停止动作，不增加 renderer 状态、新模块、Pinia、持久配置或生命周期例外。

- 所有者/生命周期：ServiceProcess 在退出阶段按注册根 PID 的原始命令快照识别进程树；PHP fork 的正常停止按已有配置标识查询 spawner 与 worker。两条路径均通过 ProcessKill/ProcessKillStrict → Helper.send → Windows 权限分流执行真实停止，不以 UI 状态推断进程已退出。
- 顺序：先完整收集目标和身份快照，再按既有父进程优先顺序结束 spawner，随后处理每个已收集 worker；父进程停止后自行消失的 worker 属于完成状态，不得中断后续目标。停止父进程优先也避免仍活着的 spawner 补起 worker。
- 终态/安全：全部原目标已退出才成功；查询失败、访问拒绝、等待超时仍返回错误；相同 PID 对应新的创建时间或启动时间必须拒绝，不能把 PID 复用当作原 worker。权限拒绝仍走已选 UAC/Helper，未知结果不得盲目重放。
- 重入/交互：应用退出继续共享 stopPromise，正常 PHP 停止继续使用原共享服务生命周期；没有新 IPC、通知或后台任务。退出期间既有方式解析/授权仍由上一轮的主进程协调器拥有。
- 检查范围：完整五进程树、父停后一个/多个 worker 自行退出、执行前已经退出、采样/停止期间退出、PID 复用、受保护进程、访问拒绝和等待超时；静态检查 Go 批量 taskkill 是否有同样的逐项提前中断。本轮不新增/运行测试，不启动或结束真实 PHP 进程。

### 代码检查与中断原因

`serviceStartSpawn` 为 Windows PHP 直接启动 `php-cgi-spawner.exe`，注册的是实际 spawner PID，不是 shell PID。退出时 `ownedServicePids` 先核对根进程命令，再由 `ProcessListByExactPid` 递归收集全部子孙；收集顺序为父先子后。PHP 模块 `_stopServer` 也显式将 spawner 放到 worker 前面。静态看这两条收集逻辑没有“只取一个 php-cgi”的限制。

真正停止由统一 Windows 权限动作完成。原脚本先保存 Get-Process 对象，逐个停止时再查 CIM 创建时间；当某个 worker 已因 spawner 停止而消失，CIM 返回 null，却与创建时间不匹配一起抛出 `Process identity changed; refresh and retry`。一次异常就结束整个 foreach，因此后面的 worker 留存。原脚本还在父停止后才读取先前 worker 对象的 StartTime/Path，这些属性也可能因进程已经退出而异常。代码可确定存在这些中断路径；用户这次运行没有提供逐 PID 日志，尚不能证明实际触发的是哪一个属性或 CIM 检查。

### 逐文件调整及理由

本轮生产代码仅调整 `src/shared/WindowsHelperFallback.ts` 中 `tools/kill`、`tools/killPorts` 的共同动作构造分支；增加中文 TypeScript 注释及 PowerShell 阶段注释。

1. 新增动作内固定函数 `Get-FlyEnvStopTarget`：只有 Get-Process 的 ObjectNotFound 才返回空；权限/其他查询失败继续抛出。防止把“查询失败”混同于“已退出”，也不再直接访问已不存在的进程。
2. 停止前一次性保存全部目标的 PID 与 StartTime，保持原顺序。后续比较使用保存的时间值，不读取因父停止而失效的旧 Process 对象。
3. 每轮先重新查询目标，已不存在直接 continue。StartTime 读取期间退出同样继续；仍活着的查询异常传播。新对象启动时间与快照不同则立即拒绝，保护 PID 复用。
4. 授权前的 PID/CreationDate 检查保留，CIM 查询改为 ErrorAction Stop；结果为空表示当前 worker 已消失，继续后续目标。只有仍存在的目标才比较创建时间/唯一快照，身份变化继续拒绝。
5. 在身份检查后对实际目标执行原关键进程/系统路径保护，再 Stop-Process 并最多等待十秒。属性保护读取或停止期间自行退出时，HasExited 确认退出才 continue；存活目标的权限错误及等待超时仍向统一分流返回失败。没有按程序名补杀，也没有放宽保护列表。
6. 本文补充操作契约、退出/PHP 停止调用链、Go 检查结果和静态验收限制。没有修改 Go，HelperVersion/Helper_Version 继续为 28，不涉及重建帮助程序。

### 路径与边界复核

- 普通权限、FlyEnv 已提升、独立 UAC 共用修正后的脚本；普通停止因权限失败而部分完成时，随后授权执行仍使用原创建时间快照，已经完成的目标跳过，尚存目标继续核验和停止。实际权限不足、取消和未知结果处理不变。
- Go Helper 的 `ToolManager.Kill` 使用系统绝对路径 taskkill，一次携带整份 `/pid` 列表；它没有逐个 CIM 校验后立即 return 的循环，因此不存在本轮相同的“一个 worker 自行退出就漏掉后续目标”中断点。命令非零退出仍传播失败，本轮不改变该执行器的既有安全与身份校验范围。
- PHP 的退出与界面正常停止都进入同一动作，不另建退出专用 PHP 清理。父进程先停止、现有所有已选子孙随后停止；存在多版本/其他应用 PHP 时，仍只处理现有所有权查询确认的 PID，不扩大为按 `php-cgi.exe` 批量结束。
- 本轮修复的是已经采集的目标在停止期间消失导致中断。根进程在退出采集前已经异常消失、采集后 spawner 新建 worker、进程查询/身份核验失败等情况仍需具体诊断，不宣称可以安全清理任意孤立同名进程。身份核验仍是查询后执行，未新增操作系统级原子身份锁定。
- 正常退出仍按原 ServiceProcess.stop 记录停止异常后继续退出；UAC 取消、真实查询/停止失败不会被本轮当成成功，但也不新增阻止用户退出的 UI。

### 本轮检查记录

已静态核对 PHP 启动 PID、递归进程树收集、父子停止顺序、普通/UAC 分流、创建时间与启动时间校验、自行退出的各个 continue 入口、受保护进程及 Go 批量命令逻辑。`git diff --check` 通过。未新增/运行测试、构建或启动/停止真实 PHP；需要在原 Windows 环境确认退出后 spawner 与全部四个 worker 均消失，不能把静态检查当成实机通过。

## 第十九轮：残留复现后的进程身份统一与停止诊断（2026-10-02）

### 实施前证据与操作契约

用户复查后仍遗留三个 php-cgi。本轮读到本机 `%TEMP%/flyenv-debug.log` 最近两次 ProcessKill 失败均为 `Process identity changed; refresh and retry`，随后仍继续 hosts 清理/正常退出；普通 Get-Process 也读到三个仍存活的 PHP 7.3 worker。受当前沙箱权限限制，CIM 查询被拒绝，日志又没有具体 PID/比较阶段，因此不能把身份失败直接认定为真实 PID 复用或某种时间精度问题；上一轮的空 CIM/已退出处理并未覆盖实际全部问题。

- 所有者与生命周期沿用第十八轮：main 协调正常退出，fork 拥有 PHP 启停；复用统一 ProcessKill/Windows 权限动作，不增加模块、配置、Pinia、renderer IPC 或生命周期例外。
- 身份契约：授权前及实际执行使用同一个 Get-Process/StartTime 身份来源与固定 UTC invariant 格式，保留全部时间精度，不以四舍五入或时间误差容忍放宽 PID 复用检查；目标不存在与查询失败仍严格区分。
- 执行契约：停止前校验全部已采集目标的授权前身份，再按父先子后的既有顺序执行；每个实际停止前再次核验当前身份。已自行退出继续下一目标，仍存活的身份变化、权限拒绝、超时继续返回错误。
- 诊断契约：记录退出注册根 PID/命令是否匹配/选中 PID 与 PPID，以及权限入口快照、完成或失败阶段；身份错误带具体 PID、比较阶段及前后时间，不记录完整命令行、环境值、脚本、nonce/key。日志写入不改变停止结果，退出失败日志需等待落盘。
- 验收范围：五个目标完整选择、三个残留的身份前后值、父停后 worker 自退、预检失败无部分停止、授权前/后 PID 复用、权限错误和终态。本轮仅只读检查现存进程与日志，不新增/运行测试，也不启动/结束用户现存 PHP。

### 逐文件改动与处理理由

1. `src/shared/WindowsProcessSafety.ts`：抽取固定 Get-FlyEnvStopTarget 查询代码和 windowsProcessStartIdentity 表达式，供两个独立 PowerShell 执行阶段复用。身份统一取 System.Diagnostics.Process.StartTime → UTC → round-trip/invariant 字符串，保留七位小数。Get-Process 明确 ObjectNotFound 才跳过，其他错误不吞掉；不增加 C#、新外部程序或 PATH 查询。
2. `src/shared/WindowsPrivilegeOperation.ts`：授权前的只读身份快照改用上述同一查询/格式，不再依赖 CIM CreationDate；关键进程保护照旧执行。属性采样期间已退出才跳过。追加 process-stop/snapshot、ordinary-error、ordinary-completed、authorized-completed 诊断，记录数字 PID、身份时间和真实执行方式；原错误仍决定是否提权，身份变化不能自动当作权限拒绝，也不能为了清理直接跳过校验。
3. `src/shared/WindowsHelperFallback.ts`：停止脚本先对全部当前目标进行授权前身份预检；存在身份变化则在尚未停止任何目标时失败，减少只结束部分 PHP 的情况。停止前再次读取同格式身份并比较本次预检快照；停止父进程后已不存在的 worker 仍继续下一项。移除这个停止分支的逐 PID CIM 查询，但普通服务树查询仍使用原 CIM 来源。错误明确带 PID、stage=preflight/before-stop、expectedCount 或 expected/actual 时间；超时带具体 PID。保持关键进程保护、十秒等待、真实权限分类及未知写保护。context 的 created 字段形状不变，注释明确它现在来自 StartTime。
4. `src/main/core/ServiceProcess.ts`：退出目标查询改为 ProcessPidListStrict，失败不能包装为空列表。写入 quit/selected，列出注册根 PID 的命令快照是否匹配以及实际选中 PID/PPID；不记录命令正文。仅 ProcessKill 真正返回后写 quit/completed；stop 的既有尽力清理 catch 增加等待落盘的 quit/error，便于应用控制台关闭后追查部分完成。
5. 本文记录用户复现、本机只读证据、身份统一的边界及日志位置。没有修改 Go，两个帮助程序版本仍为 28，无需因此更新帮助程序二进制。

### 当前完整停止链路与未改变的边界

正常退出 → Application.stopPromise/可信交互上下文 → ServerManager.stopServer → ServiceProcess → 严格本机进程列表 → 精确注册根命令核对/全部子孙 PID 收集 → quit/selected → ProcessKill → Helper.send/统一 Windows 权限入口 → 固定 Get-Process/StartTime 快照 → 同一动作构造 → 全量预检 → 逐目标再次核验/停止/等待。普通权限失败只有真实拒绝访问才继续已选 Helper/UAC；身份错误直接停止并记录。PHP 界面停止和启动前停止仍经其原 fork 方法调用同一统一权限动作。

- 本轮没有用路径、名称或时间容差替代进程身份；没有结束现存三个 worker，也没有借用常驻 Helper 绕过当前沙箱的 CIM 拒绝。
- 本机普通 Get-Process 可查询，重复读到三个现存 worker 的 StartTime 一致并保留完整精度；CIM 在当前工具会话返回 Access denied。这些只读结果不等于 FlyEnv 原会话的两阶段时间值，不能据此断言 CIM 日期发生漂移，更不能将真实 PID 复用检查取消。新日志用来把今后的身份失败定位到具体比较值。
- 全量预检只保证预检失败之前没有开始本次停止；真正逐项执行期间遇到身份变化/权限错误/超时仍可能部分完成。进程采集后的新 worker、采集前已失去注册根的孤立进程，以及跨实例同名服务仍沿用上一轮的边界，不扩大到按 php-cgi 名称结束所有进程。
- Go Helper 的已选分支继续原批量 taskkill，并不因此获得 StartTime 身份 RPC；本轮的普通/UAC 脚本修改不能表述成 Go 的身份校验已经同步升级。

### 诊断与检查记录

正常 Windows 运行的日志位于 `%TEMP%/flyenv-debug.log`。复查时可读取 `[ServiceProcess][quit][selected]` 查看是否选中 spawner 和四个 worker；查看 `[WindowsPrivilege][process-stop][snapshot]` 对照授权前 PID/时间；身份失败会在 ordinary-error/ProcessKill/quit/error 带出具体 PID、阶段及前后时间。completed 仅代表相应真实动作返回成功，不是之前所有失败的补偿结果。

已静态核对两阶段身份表达式确实共用、全部目标预检顺序、空进程/查询失败分类、PID 复用和保护进程检查、权限错误传播、日志不包含完整命令及退出等待落盘。`git diff --check` 通过。没有新增/运行测试、构建、启动或停止任何 PHP；本轮尚未实机验证修订脚本清理四个 worker 的结果，之前的失败复现不能算作修订后通过。

## 第二十轮：已确认服务父进程按整棵树停止（2026-10-02）

### 实施前操作契约

用户明确指出服务父进程确定归属并有效后，不需要逐个再确认其子进程。本轮采纳这一正常服务停止模型：保留父进程的归属/授权等待期间身份检查，用 Windows 系统 taskkill /T /F 一次停止该父进程及当时的全部后代；独立进程工具与孤立 worker 才保留单 PID 核验。不是将所有 tools/kill 请求一律扩展为进程树。

- 所有者/生命周期：退出仍由 main 的 stopPromise 编排；PHP fork 继续拥有 PHP 服务停止与孤立 worker 查询，界面仍复用共享生命周期。没有新模块、配置、Pinia、renderer 长操作或边界例外。
- 入口：通用进程工具新增 ProcessKillTreeStrict，用 tools/kill 的可选第三个布尔参数明确请求树停止。原两参数调用继续原行为；普通/管理员/UAC/Helper 接受相同树模式，不偷偷切换方式。
- 目标：main 只发送命令快照匹配的注册父 PID；子孙列表只用于日志。PHP 正常停止按当前安装路径/配置识别 spawner，发送父 PID；父不存在时才对同安装路径/配置的孤立 worker 走单 PID 回收，不能按名字结束全部 php-cgi。
- 执行：仅为父 PID 保存并核验原启动身份，保留受保护父进程检查；授权等待后再次核验，持有父进程句柄到 taskkill 结束，减少编号复用窗口。taskkill 使用系统 API 定位的完整路径和固定数字参数，不依赖 PATH；不再为每个子进程生成创建时间快照、CIM 查询或 Stop-Process 循环。
- 终态：系统命令非零、查询/身份失败或超时仍返回失败，不能因父已经消失就把部分完成当成功；已不存在的父幂等跳过，孤立 worker 另行处理。退出继续原尽力清理策略并等待诊断落盘。重复退出共享 stopPromise，PHP 的正常重入仍使用既有服务生命周期。
- Go：扩展现有 Kill 的可选树参数并同步 RPC 参数校验；Go 改动按用户要求升级发布版本至 29，两个版本常量同步。只更新源代码不声称帮助程序产物已重建。
- 静态检查范围：父+四 worker、不同版本/安装目录、父缺失、授权等待父 PID 复用、子进程自行退出、taskkill 缺失/非零/超时、普通/UAC/Helper 分支及旧调用兼容。本轮不新增/运行测试、构建或停止真实 PHP。

### 之前 Go Helper 是否逐个校验进程

需要区分调用方、统一权限入口和 Go 的实际执行器：

1. 调用方原先仍按注册 PID/命令、服务配置等识别归属，再整理父子 PID 列表。这是 FlyEnv 选择停止目标，不是 Go Helper 的身份检查。
2. 统一 Windows 权限入口会先为请求 PID 读取 StartTime 快照；普通权限和 UAC 的实际 PowerShell 停止脚本会逐个比较身份并执行 Stop-Process。之前三个 PHP worker 残留的日志显示身份比较失败，但尚未定位到具体比较值。
3. 本轮之前的 Go `ToolManager.Kill(signal, pids)` 只检查 signal/PID 参数是否合法，在 Windows 一次执行 `taskkill /F /PID ... /PID ...`。Go 没有逐个读取 StartTime、比较调用前身份，也没有 `/T`；父子列表由调用方提供。RPC 签名、调用者认证与参数校验不能表述成进程身份校验。
4. 本轮新增的树模式才向 Go 传递父进程身份。旧两参数模式仍采用批量 PID 停止，不因此获得逐 PID 创建时间校验。故“普通/UAC 与 Go 的旧单 PID 模式完全一样”是不准确的；新树模式的父身份与树停止语义保持一致。

### 本轮修改范围

| 场景 | 当前选择与执行方式 | 本轮是否接入树停止 |
| --- | --- | --- |
| Windows 正常退出的通用服务清理 | 注册父 PID + 原命令快照；只发送有效根，系统 `/T /F` | 是，覆盖这条退出路径中的通用服务，包含 PHP |
| Windows PHP 界面停止、启动前清理 | 安装路径 + 专用 ini 识别 spawner；只传父 PID | 是 |
| PHP 已失去有效父节点的残留 | 实际可执行路径 + 专用 ini 识别孤立进程，再按 PID 停止 | 保留独立 PID 模式 |
| Base 及其他模块各自的界面停止 | 各自原查询/专用停止流程与 `ProcessKillStrict` 等调用 | 尚未全面迁移 |
| 进程工具、端口停止 | 原请求范围；普通/UAC 逐目标，Go 旧批量 PID | 未扩成树模式 |
| MongoDB、PostgreSQL 退出特殊处理 | 仍先调用 fork 的专用 stopService | 保留专用逻辑 |
| macOS/Linux | 原平台服务停止与信号流程 | 未改成 Windows 树停止 |

`ProcessKillTreeStrict` 是通用能力；当前实际服务调用点只有 `ServiceProcess.killAllPid` 的 Windows 分支和 `Php.win._stopServer`。不能将其描述为已经替换全部模块的正常停止。本轮没有新增模块，因此不涉及模块配置/Pinia 授权例外。

### 逐文件调整及原因

1. `src/shared/Process.ts`：新增明确的 `ProcessKillTreeStrict(roots)`，去重后传 `tools/kill(signal, roots, true)`；严格传播错误。旧 `ProcessKillStrict` 和进程工具语义保留。PItem 增加可选 EXECUTABLE，表示系统返回的实际程序路径，供 PHP 识别相对命令行启动的孤立 worker；公共类型不增加 PHP 专用属性。
2. `src/shared/Process.win.ts`：严格查询与结果标准化带出 ExecutablePath → EXECUTABLE。不依赖命令行中是否有完整路径，查询仍使用已防护的固定 PowerShell 路径/UTF-8 输出，兼容中文、空格路径；查询失败传播，不用空数组伪装无服务。
3. `src/main/core/ServiceProcess.ts`：保留注册父 PID 的精确命令快照及既有根节点保护，只把有效注册根传给树停止。已有递归子孙列表只作诊断，不为子进程创建身份请求。日志明确区分 rootPids 与 targets，实际完成后才记录 completed；退出失败等待日志落盘后继续原尽力清理策略。
4. `src/fork/module/Php.win/index.ts`：新增模块私有 fastCgiProcesses，按当前安装目录的实际 spawner/php-cgi 路径和准确的 `php.phpwebstudy.90<版本编号>.ini` 标识识别进程。正常先筛 spawner，信任其完整后代，不再逐个检查 worker；不属于任何有效父树的同配置进程才进入孤立 PID 路径。命令成功后使用不缓存的严格进程查询确认没有当前池残留，再发停止完成日志和结果。启动前停止仍复用同一方法。
5. `src/shared/WindowsPrivilegeOperation.ts`：身份快照仍使用同一原生 StartTime UTC 完整精度格式；树调用仅含父 PID，故只为父采样。日志补 tree 标记；Helper 回调接收当前身份数组，保证签名 RPC 可以复核授权前的原父实例。普通成功不需要 Helper/UAC，只有已分类的权限拒绝才进入已选方式；身份错误不会自动变成权限错误。
6. `src/fork/Helper.ts`：仅树模式把父身份数组追加为第四个 RPC 参数，经既有签名/lease 发给 Helper；旧两参数 kill 保持兼容。仍检查当前选定方式，不能在用户切换方式后继续原 Helper 动作。
7. `src/shared/WindowsHelperFallback.ts`：树模式仅核验父节点，持有父进程句柄，使用系统完整 taskkill 路径及固定数字参数 `/F /T /PID`；隐藏窗口、等待与超时、非零退出传播。子孙由系统命令处理，没有 worker 的身份数组、逐个 CIM 或 Stop-Process 循环。旧独立 PID/端口模式继续原逐目标停止及已退出跳过规则。processListWin 查询也补实际路径，防止不同查询来源字段缺失。
8. `src/helper-go/main.go`：kill RPC 增加严格树请求形状 `signal, rootPIDs, true, parentIdentities`；布尔值、PID 数组和身份结构不合法时不执行。版本由 28 升至 29。
9. `src/helper-go/module/tool.go`：Kill 用可选 typed identities 调用原生树执行器，保留旧两参数 Go 调用；processListWin 补 ExecutablePath。旧 Windows PID 模式仍 `/F /PID...`，没有偷偷变成 `/T`。
10. `src/helper-go/utils/process_tree.go`：共享父身份结构只有 PID 与 created，并加 JSON 字段名和来源注释；不携带子进程身份或业务命令行。
11. `src/helper-go/utils/process_tree_windows.go`：使用 OpenProcess/GetProcessTimes 核对父实例及受保护程序，完整父预检之后执行一次系统 taskkill；保持父句柄到执行结束，避免授权后的编号变化被当作原服务。已不存在幂等跳过，访问拒绝不当作已退出；命令有十秒执行上限，错误和父未退出均返回失败。树执行自身不需要 PowerShell。
12. `src/helper-go/utils/process_tree_other.go`：非 Windows 的对应能力明确不支持，保持跨平台编译结构，不改变其他平台现有 Kill。
13. `src/shared/AppHelperCheck.ts`：HelperVersion 同步 29，注释说明新协议和同版本主/备用产物同步要求；旧帮助程序不能冒充支持新树协议。
14. 本文补全先前 Go 与 PowerShell 的差异、准确调用范围、完整分流和未覆盖边界。新增/改动代码均在关键归属、身份、参数、执行和终态处分段注释。

### 当前完整停止流程

#### 1. FlyEnv 正常退出

`Application.stopPromise → ServerManager.stopServer → ServiceProcess.stop/killAllPid`：先保留 MongoDB/PostgreSQL 的专用停止，再读严格 Windows 进程列表。对其他注册服务核对 PID 对应的命令是否等于启动后保存的命令快照，并沿用根进程保护。对匹配的注册父节点调用 `ProcessKillTreeStrict(rootPids)`；子孙列表仅记录日志，实际系统树停止涵盖执行时的后代，不依赖之前只采集到几个 worker。

成功写 quit/completed；查询、授权、身份、taskkill 等失败写 quit/error，应用仍按原尽力清理策略退出。hosts 清理仍是原独立退出阶段，本轮没有把它合并到进程树动作中。

#### 2. Windows PHP 正常停止

`共享服务 stop/restart/start 前清理 → Php.win._stopServer → StopProcessListFetch`：只识别当前安装路径和专用 ini 的 spawner。一个有效 spawner 对应的全部子孙直接作为其树，传父 PID 走树停止。若同时存在不属于有效父树的旧残留，另按实际路径/配置确认后走独立 PID 停止；既可能是父完全不在，也可能是另一个旧池的孤立 worker。执行后再查询当前池，存在残留则失败，不发“停止成功”。此最后查询是结果确认，不是逐 worker 的停止授权复核。

例如 spawner=1000，worker=1001/1002/1003/1004：正常树请求只有 `[1000]`，执行语义是 `taskkill.exe /F /T /PID 1000`。没有为四个 worker 分别读取创建时间、分别请求 UAC或分别 Stop-Process。

Windows `/T` 表示结束指定进程及其启动的子进程，`/F` 表示强制结束，参见 [Microsoft taskkill 文档](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill)。这仍是强制停止；需要优雅关闭的服务继续其专用停止入口，不能以 `/T` 代替所有数据库的关闭协议。

#### 3. 普通权限、管理员、UAC、Helper 如何分流

两条树调用均进入 `Helper.send → executeWindowsPrivilegeOperation`：

1. 在任何授权等待前读取父 PID 的 StartTime/保护信息，保存身份快照。此步只读，不停止进程。
2. 先在 FlyEnv 当前令牌下尝试同一树动作。普通用户启动的服务通常可以直接停止；管理员运行 FlyEnv 也直接执行，不因为选择了 UAC 就必然弹窗，不因为选择了 Helper 就必然发 SYSTEM kill。
3. 如果真实权限拒绝且当前令牌未提升，解析用户已选认证方式。UAC 使用独立提升动作进程，复核父身份后调用固定系统 taskkill，无帮助程序安装依赖。
4. Helper 通过原签名/授权 lease RPC 传父 PID 和父身份；Go 在 SYSTEM 下用原生 Windows API 复核同一父实例，再调用固定系统 taskkill `/T /F`。不为每个 worker 查询或比较身份。
5. 身份变化、策略查询失败、UAC 取消、taskkill 非零/超时都保留失败；未知结果不盲目重放。Go 旧两参数 kill 的实际执行器仍仅校验参数并批量 `/F /PID`，并未增加逐 PID 身份验证。

父身份的执行前复核保留，是因为查询归属之后可能有 UAC/安装/调度等待，PID 可能已经变化。仅在选择目标时查一次父，然后授权后按相同数字无条件结束，会把新的进程误当原服务。这个检查只针对父，不是对子进程重复建立信任。

### 边界复核与实机限制

- 固定系统程序完整路径与数字参数不依赖 PATH；PowerShell 查询仍复用原固定定位，中文/空格仅作为结构化数据比较，不拼成可执行命令。Go 的 taskkill 树调用为原生参数数组。
- 活着的 PHP 候选缺失实际可执行路径时拒绝识别，不能仅凭名字/相同 ini 批量结束不同安装的服务。路径按 Windows 分隔符和大小写规范化；本轮未新增 junction 与原始安装路径的别名解析能力。
- 根在初始归属查询前已消失，main 没有有效注册父可发 `/T`，不会凭同名程序补杀孤立进程；main 也没有调用 PHP 的专用孤立回收。PHP 正常停止/启动前清理有上述孤立处理。根在采样后自行退出时，父已退出可幂等跳过，但不能承诺 `/T` 还会找回已经失去活父的孤立 worker；PHP 的最后严格查询可发现当前池仍残留并报错。
- taskkill 非零仍失败，即使父已消失。不同权限的子孙可能导致部分完成；当前未依赖本地化 stderr 把所有 taskkill 非零强制解释为权限错误。父句柄打开等真实访问拒绝可在停止前进入授权分流；执行错误不能伪造成功。
- 父句柄与启动时间复核减少授权期间的 PID 复用风险；main 的最初命令查询与身份快照不是一个操作系统级原子事务，本轮不宣称绝对无竞态。
- PHP 末次进程查询失败会拒绝停止结果；main 通用退出只依据树命令/父等待结果，没有给所有模块新增独立结果扫描。退出仍会记录错误后继续，不能把“应用退出”理解成“所有清理必然成功”。
- source 版本已是 29；本轮没有编译/重建帮助程序。发布前仍需重建对应平台产物，Windows 主/备用产物及指纹须匹配同一新二进制。不能以常量更新声称本机已安装 Helper 具备新能力。

### 检查记录

已静态核对两个树入口、未迁移的其他模块调用点、父归属与保护、worker 不参与树身份复核、签名第四参数、Go 原生时间与句柄、错误传播、PHP 未缓存结果确认和两处版本常量。`git diff --check` 通过；没有新增/运行测试、格式化、构建，也没有启动或停止真实 PHP。本轮尚未实机验证四个 worker 均结束；验收需分别覆盖普通用户、管理员、UAC、更新后的 Helper，以及父缺失、授权取消/等待父变化和不同安装目录。

### 补充复核：退出与模块停止入口、MongoDB/PostgreSQL（2026-10-02）

用户追问两套停止路径及两种数据库的退出行为。本次只读复核，未进一步修改停止代码、未运行测试或真实服务停止：

- 界面停止经 fork 模块的 `stopService → _stopServer`；正常退出经 main 的 `ServiceProcess.killAllPid`。这两条编排路径原来就存在，不是本轮新增两种权限体系；但停止行为的确没有统一。本轮通用树执行器与 PHP 接入没有完成所有模块生命周期的统一。
- Windows 退出按顺序处理 MongoDB、PostgreSQL，然后剩余注册服务做 main 通用树停止。两种数据库各调用一次 fork 的 stopService，传各自注册列表中首个有 PID 的 item；await 返回后删除该模块整组登记。不是逐个停止所有登记实例，也没有保留到后续树停止作兜底。
- MongoDB `_stopServer` 先关闭 DbGate，尝试准备 mongosh；mongosh 存在则执行 `mongosh.exe --eval "db.shutdownServer()"`，没有传当前实例的 host/port/认证参数。命令异常仅打印，仍返回停止成功并收集 PID；没有严格查询数据库是否退出。只有 mongosh 不存在才退回 Base 的旧 PID 列表停止。因此专用命令失败或目标连接不对应当前实例时，可能留下数据库却报告成功。
- PostgreSQL `_stopServer` 先关闭 pgAdmin，再执行当前 version.bin（pg_ctl）`stop -D <数据目录> -l <日志文件>`。数据目录使用传入 DATA_DIR，否则按版本主号推导。Windows 下仅等待命令，没有追加 Unix 分支的 pid 文件等待；doStop 的异常被记录后继续返回停止成功，没有确认 postgres 已退出。退出调用没有传实例自定义 DATA_DIR。
- `ForkItem.onMessage` 对 code=0 与 code=1 都 resolve 响应。`ServiceProcess` 的特殊退出分支没有检查返回 code，故 await 本身不能证明成功；即便 fork 返回错误，该模块也会被从通用树目标中删除。若是实际 Promise reject，则进入 ServiceProcess.stop 的外层 catch，后续数据库及通用树阶段可能没有执行。
- 这几处是既有退出/模块实现的问题，不能以本轮树停止修改声称已解决。较一致的后续结构应让 main 只编排所有已登记实例，经各模块同一 stopService 负责伴随程序、数据库原生关闭及结果确认；需要强停的模块再调用通用父进程树执行器。专用关闭失败不能直接上报成功或删除登记，是否强停需保持明确策略。本次没有直接扩大修改范围或强制结束数据库。

## 第二十一轮：界面与退出统一模块停止入口（2026-10-02）

### 实施前操作契约

用户授权统一为一套停止逻辑。本轮 main 只编排登记实例，所有服务均通过自身 fork `stopService` 停止；不再维护退出专用的数据库特例或按程序名分配信号/结束进程。fork 模块继续拥有真实 PID、伴随程序和数据库关闭协议，Windows 普通/UAC/Helper 共用既有权限入口。

- 所有者/生命周期：main 的 ServiceProcess 编排当前全部实例并加入停止期间 single-flight；Application 原 stopPromise 继续负责完整退出。fork 的 stopService 与界面使用相同入口；没有新增 renderer controller、配置、Pinia 或模块例外。
- 请求：成功启动时，由 fork 模块提供同实例 stopService 参数快照；main 内存登记保存，含 PID/版本与必要实例目录，不把启动密码/终端开关当作停止参数。项目/自定义模块自行提供 PID 形式参数，main 不写 PHP/数据库等模块专用分支。
- 进度/终态：进度不注销登记；明确 code=0 才删除该实例及实际停止 PID。code=1、查询/授权拒绝、超时均记录并保留失败登记；一个实例失败仍继续处理其余实例，不删除整个模块记录，不做不明结果的盲目重试。
- 服务交互：Windows 常规 Base 停止及明确拥有父树的专用强停走同一树能力；数据库保留原生关闭及真实退出确认，MongoDB 不在退出期间下载 mongosh，不能吞关闭失败上报成功。父归属与权限身份保护继续保留，子孙不逐个身份核验。
- 边界检查：全部实例遍历、失败继续/登记保留、重复退出、PHP 四 worker、语言项目/自定义模块 PID 签名、PostgreSQL 自定义数据目录、MongoDB 自定义端口/已退出/关闭失败、伴随程序失败和专用 fork 生命周期。用户未要求本轮测试，本轮不新增或运行测试、构建、格式工具或真实服务停止。
- Go：本轮拟复用已实现版本 29 的树协议，不改 Go；是否需要再升版以实际 Go 文件是否变更为准。帮助程序二进制仍未重建。

### 当前完整调用链

1. 服务成功启动后，fork 模块返回实际 `APP-Service-Start-PID`，并提供 `APP-Service-Stop-Args`。Base 默认提供版本快照和真实 PID；需要专用参数的模块覆写 `serviceStopArgs`。字段只保存在 main 的当前运行登记中，不持久化。额外启动密码、终端开关等不自动复制到停止参数；MySQL/MariaDB 既有版本对象中的 rootPassword 仍用于其原生关闭，不声称版本对象已经全部脱敏。
2. UI 的成功启动终态和 MCP 启动都登记到同一个 ServiceProcess。仅 code=0 才更新启动/停止登记，进度不代表进程已经停止。独立面板由所属模块的 `companionStopArgs` 提供同入口的停止参数，登记 `companion=true`，参加退出清理但不显示为数据库运行实例。
3. 界面/MCP 发出 `stopService` 时，ForkManager 优先按运行 PID、其次按非面板实例的 bin 恢复启动时的停止参数。退出直接遍历每个登记实例，发送同样的请求。因此修改设置中的 PostgreSQL 数据目录之后，停止仍使用实际启动目录，而不是新设置。
4. fork 模块负责确认目标、关闭伴随程序、执行实际停止及结果确认。常规 Windows 服务进入 Base 的父树停止；PHP、项目、自定义服务等提供自己的父归属规则；数据库保留原生关闭协议。main 不决定进程名称、停止信号或数据库强停策略。
5. Windows 强停统一进入 `ProcessKillTreeStrict → Helper.send → executeWindowsPrivilegeOperation`。已有目标列表通过 `ProcessKillServiceTreesStrict` 按同一快照中的祖先关系压缩为根。例如一个父和四个 worker 只产生一个父树请求。树执行层保留父身份/系统进程保护，子孙不逐个读取创建时间或复核可执行路径。
6. 权限执行仍先尝试当前令牌；管理员运行时直接执行。只有真实权限不足且尚未提升时，才走已选 UAC 或 Helper。UAC 使用既有一次性提升执行器；Helper 使用第 29 版已有签名树协议。不是每次停止都弹 UAC，也没有因统一入口新增帮助程序安装要求。
7. 退出检查 fork 返回的 `code`；只有 code=0 才注销当前登记及模块返回的实际停止 PID。code=1、异常、取消、查询失败或超时均保留失败登记，写退出日志并继续其他实例。先前父模块已经关闭并注销的面板会跳过，避免重复关闭。Application 与 ServiceProcess 各自共享本轮退出 Promise。
8. 服务停止之后，Application 继续原有 fork 回收、hosts 清理、权限协调器释放顺序。hosts 清理仍是独立的文件操作，复用同一权限体系；本轮没有将它塞进某个服务模块。

main 不再有生产使用的 `killAllPid`、MongoDB/PostgreSQL 特例或退出时按命令名分配 TERM/INT 的代码。旧 `ownedServicePids`、`applyServiceProcessCommandSnapshots` 仅保留为既有检查脚本的兼容导出，没有生产停止调用。

### 各类服务停止策略

| 服务/对象 | 当前 Windows 停止方式 | 成功与失败边界 |
| --- | --- | --- |
| 继承 Base 的常规服务 | 未缓存的严格查询；按版本路径/实际 EXE 确认根；同一父树执行器结束 | 确认原目标 PID 消失后才成功；活 PID 信息不可读或查询失败不能解释为空列表 |
| PHP CGI 池 | 当前版本 spawner 的父树一次结束；不在已确认树中的旧孤立 worker 另按 PHP 私有路径/ini 识别 | 保留既有专用孤立清理；最后重新查询当前池，残留报错；本轮仅将首轮查询改为新鲜查询 |
| 语言项目/自定义服务 | 启动后捕获父命令；停止复核同一父，再一次结束整棵树 | 父身份不符/无归属凭据则失败；父已消失而只剩历史 PPID 子进程时拒绝盲杀 |
| MongoDB | 先停 DbGate；已有 mongosh 时从当前配置读取端口、核对本地监听 PID，再向 admin 数据库发送 shutdownServer | 不在退出时下载 mongosh；客户端断开/命令报错后仍核对真实退出；原生关闭失败且进程仍在则失败，不自动强停；没有 mongosh 时沿用进程停止策略并改用通用父树 |
| PostgreSQL | 先停 pgAdmin；用启动目录核对 postgres.exe 与 postmaster.pid，再执行绝对路径 pg_ctl stop | Windows 明确 `-m fast -w -t 10`，执行有超时；查询确认父及子孙退出；目录/PID 不匹配或关闭失败不伪报成功，也不直接强杀 |
| MySQL/MariaDB | 共用 Base 的目标发现，先原生 mysqladmin/mariadb-admin；原生失败保留既有进程停止回退策略 | 回退改用通用父树；最终本地严格查询仍确认实际 PID 消失，授权失败保留登记 |
| Redis | 先停 Redis Commander，再通用父树停止 Redis | 去掉直接拼 taskkill 和吞异常；严格查询确认退出后才清记录 |
| ClickHouse | 保留私有版本 PID/watchdog 归属及 CH-UI 清理；Windows 强停共用树执行器 | 数据库与面板目标均确认退出；独立打开面板可单独关闭，不进入数据库停止 |
| Temporal | 模块先停 UI，再 Base 停父；独立打开 UI 可单独停止 | UI 按自身程序/配置路径归属，去掉 Windows 固定 FlyEnv-Data/PhpWebStudy-Data 名字匹配；确认退出后才清 PID |
| Neo4j | 保留实例 home/config 归属与残留发现，Windows 强停共用树执行器 | 退出保留启动时自定义实例目录；初次/结果查询失败传播，原等待退出逻辑保留 |
| n8n | 共用 Base 目标发现；保留按端口/同安装包路径发现脱离 cmd wrapper 的 Node 根 | 去掉会吞异常的兼容 kill，统一父树及退出确认；不再仅按包含 n8n 名字的命令批量结束不同安装 |
| Cloudflare Tunnel | renderer 与退出经 stopService 适配原有 stop；Windows 核对实际 cloudflared 路径后走通用父树 | 停止快照只有 PID/bin，不复制 API/tunnel token；父身份改变或孤立残留不能报告成功 |
| DNS / ftp-srv | 专用 fork 内模块自己 await 关闭 socket/server | 宿主 PID 仅用于登记与退出编排，不作为 Electron 进程树 kill 根；成功终态后原 worker 策略解 pin |

PostgreSQL `fast` 为数据库有序关闭并中断活跃事务，`-w/-t` 规定等待与上限，见 [PostgreSQL pg_ctl 文档](https://www.postgresql.org/docs/current/app-pg-ctl.html)。MongoDB 管理员数据库及认证要求见 [MongoDB shutdownServer 文档](https://www.mongodb.com/docs/manual/reference/method/db.shutdownServer/)；本轮没有增加认证/TLS 配置界面或自动猜测凭据。

### 本轮文件调整与原因

| 文件 | 调整与原因 |
| --- | --- |
| `src/main/core/ServiceProcess.ts` | 删除生产退出 kill/命令快照计时器；保存模块 stopArgs 与 companion；按实例调用 stopService、检查 code、失败保留/继续及并发退出复用；DNS 无版本参数也能登记，避免 JSON.parse(undefined) |
| `src/main/core/ForkManager.ts` | 全部 stopService 请求恢复实际运行参数；共享调度不认识模块私有字段，专用 fork 路由保持原有策略 |
| `src/main/core/IPCHandler.ts` | 仅成功终态更新运行登记；有 stopArgs 才登记启动 PID，保留参数和面板类型，避免 Node/Python 面板覆盖数据库根；stopService 成功时也注销当前请求实例，避免父自然退出/空停止清单留下陈旧登记 |
| `src/main/core/MCPTools.ts` | 启动保存 stopArgs；stop_all 遍历包括面板的完整登记，并按实际成功 PID 注销，避免运行展示过滤面板后漏清或误删 |
| `src/fork/BaseManager.ts` | 启动成功后调用模块 serviceStopArgs；面板调用 companionStopArgs；模块决定停止签名，main 不做数据库/项目映射 |
| `src/fork/module/Base/index.ts` | 默认停止参数、Windows 严格目标发现/实际 EXE 识别、真实退出确认、只删除已停止实例的共用 app PID；Unix 模块原信号策略保留 |
| `src/shared/Process.ts` | 新增 ProcessKillServiceTreesStrict，从已确认 PID 清单压缩树根；异常父子环不得变成空目标成功；任意进程工具原单 PID 执行器保留 |
| `src/shared/StopProcessList.ts` | 支持用已有列表收集项目子孙，父归属与子孙收集不重复跨时点查询 |
| `src/fork/module/Php.win/index.ts` | 停止首轮读取未缓存列表，避免刚启动即退出漏 spawner；父树/孤立回收规则复用上一轮 |
| `src/fork/module/LanguageProject/index.ts` | 保存 PID/typeFlag/父命令的停止参数；Windows 只复核父并树停止，拒绝未经归属确认的孤立进程 |
| `src/fork/module/ModuleCustomer/index.ts` | 保存 PID/父命令签名；自定义启动对象不会被当作停止版本；与项目使用相同父树语义 |
| `src/fork/module/Mongodb/index.ts` | 去掉停止期间下载；核对当前端口/目标、admin 关闭及真实退出；DbGate 错误传播与独立面板停止参数 |
| `src/fork/module/Postgresql/index.ts` | 记录实际 DATA_DIR；核对 PID 文件、程序/目录及 pg_ctl 等待；原生错误不再在 Windows 被吞成成功；pgAdmin 树停止/独立参数 |
| `src/fork/module/Mysql/index.ts`、`Mariadb/index.ts` | 目标发现复用 Base；原生回退统一树执行；只返回实际目标/当前登记 PID，避免共用文件指向另版本时误注销 |
| `src/fork/module/Redis/index.ts` | 统一 Base 目标、树执行、退出确认；Commander 严格传播错误；支持独立面板停止参数 |
| `src/fork/module/DbGate/index.ts`、`Redis/RedisCommander.ts` | runtime 已确认私有目录的目标用通用树执行器；既有结果验证、注入执行器与私有 PID 生命周期保留 |
| `src/fork/module/ClickHouse/index.ts` | 父/watchdog 与面板共用树执行并确认退出；增加独立 CH-UI 参数，不复制数据库关闭策略到 main |
| `src/fork/module/Temporal/index.ts` | 独立 UI 登记与停止参数；未缓存查询、按实际目录识别、树执行及退出确认；避免数据目录改名后漏 UI |
| `src/fork/module/Neo4j/index.ts` | 停止参数保留实例目录；停止和结果查询不用缓存/吞异常；Windows 用通用树，Unix TERM 保留 |
| `src/fork/module/N8N/index.ts` | 模块停止改用通用目标发现/树执行；补充端口/package 归属而非名称批量 kill，严格确认后按实际 PID 清文件 |
| `src/fork/module/CloudflareTunnel/index.ts`、`CloudflareTunnel.ts` | 增加 stopService 适配同一个 stop，成功返回停止 PID，运行登记脱离 token；Windows 父程序归属与树执行 |
| `src/render/core/CloudflareTunnel/CloudflareTunnel.ts` | 原 controller 的停止命令改为 stopService；单例所有者、重入/通知/监听终态清理仍由它负责 |
| `src/fork/module/DNS/index.ts`、`FTPSrv/index.ts` | 统一启动/停止 PID 终态；专用 fork 中等待模块自身服务关闭，而不是 OS 结束 Electron worker |
| 本文 | 追加当前统一调用链、逐文件原因、模块策略、多实例审计及实际验证范围；注明旧章节描述已被替换 |

### 多实例及失败边界复核

- **逐登记实例**：退出不再只取 MongoDB/PostgreSQL 的首个 item，也不删除整个模块。常规服务仍沿用 bin 唯一的既有运行状态；PID 签名项目/自定义命令和隧道可共享语言程序，但按 PID 登记，不因同一个 bin 折叠。此处的多实例指已经成功登记的实例，没有新增同一个数据库 bin 多数据目录并行运行的产品能力。
- **共用 PID 文件**：Base、MySQL、MariaDB、MongoDB、PostgreSQL、Redis、n8n 不直接清掉另一实例覆盖的 app PID。PostgreSQL 不把该文件的陌生 PID 混入本次成功列表；MySQL/MariaDB 不返回未经当前版本归属确认的原始文件 PID，避免 main 删除另一登记并跳过后续退出。
- **面板与父**：面板参加退出遍历但不覆盖数据库运行状态。父模块通常合并返回面板停止 PID，后续遍历跳过已注销项。面板失败则模块失败；面板已停但数据库失败属于部分完成，不伪报整个服务成功；重试可再次执行幂等面板清理。
- **新鲜快照**：Base、PHP、项目、自定义模块、MySQL/MariaDB、Neo4j、Temporal 停止绕过短缓存。ClickHouse、Cloudflare 与面板 runtime 的 Windows 查询本身使用严格实际查询。末次确认是确认 PID 是否消失，不是为正常子孙增加身份授权流程。
- **原生数据库关闭**：MongoDB 明确连接已核对的配置端口，不猜默认端口关闭其他实例；PostgreSQL 将实际数据目录带回退出。若启用认证/TLS、只绑定非 loopback、PID 文件不符或查询受限，停止可失败并留日志；这不能靠吞异常修复。本轮未自动强停这两种原生关闭失败的数据库。
- **父缺失与 PID 变化**：树执行保留上一轮父创建时间保护。PHP 有模块特有的孤立 worker 归属回收；项目/自定义命令/隧道没有同等孤立进程证明，因此活父不存在而残留子进程时保守失败。模块查询与权限执行不是一个原子事务，不能承诺完全不存在 PID 复用竞态。
- **当前退出行为**：停止失败仍会记录后继续后续资源回收和应用退出；保留内存登记不等于阻止退出，也不等于跨重启持久化重试。没有新增退出失败交互框或统一强停按钮。完整退出并不证明每项清理成功。
- **并发边界**：本轮收敛重复退出到同一 Promise，没有新增全应用任务取消/等待所有启动终态的机制。退出快照针对当时已登记的成功实例；退出期间尚未完成登记的启动、应用被 OS 强制终止、未通过服务生命周期启动的任意外部进程，不在此统一编排保证内。
- **路径**：通用树执行器继续使用固定系统程序路径。新增 mongosh/pg_ctl 调用为已有应用程序的绝对路径和参数数组，shell=false，支持中文/空格。n8n 等已有启动/版本发现代码不属于本轮改造，本文不宣称全仓库 PATH 依赖都已经排除。
- **平台范围**：main 统一编排跨平台生效；Windows 常规树停止和 MongoDB/PostgreSQL 严格确认是本轮重点。非 Windows 模块原信号、等待和尽力处理大体保留，Unix PostgreSQL 原等待超时处理没有在本轮全面重写。

### 本轮检查记录与帮助程序版本

已静态检查生产退出入口移除、UI/MCP/退出参数恢复、成功/失败响应语义、全部登记遍历、companion 登记与跳过、共用 PID 文件、父树压缩、PHP 与数据库调用链、DNS/FTP 专用 worker 生命周期及 Windows 真实退出查询。`git diff --check` 通过。

遵循本轮约束，没有新增/运行测试、类型检查、格式化工具、构建，也没有启动/停止实机 PHP、MongoDB、PostgreSQL 或其他服务。因此这里记录代码路径和静态复核结论，尚不代表 Windows 四 worker、数据库自定义目录/端口及所有授权模式已实机验收。

本轮没有修改 Go 源码，复用已存在的第 29 版树协议，因此不再递增 HelperVersion；`src/helper-go/main.go` 与 `src/shared/AppHelperCheck.ts` 仍为 29。帮助程序二进制没有重建，既有第 29 版源码变更的产物重建/版本与指纹同步仍是发布前需要完成的步骤。

## 第二十二轮：移除通用停止的同 EXE 扫描（2026-10-02）

### 原因与实施范围

用户可能使用 FlyEnv 安装的程序自行启动另一份服务。同一个实际 EXE 路径只证明使用相同程序，不能证明该实例由 FlyEnv 管理。本轮按用户明确选择，删除 `Base.windowsServiceTargets` 最后的实际 EXE 全列表扫描，不替换为其他扫描方式；保留登记/PID 文件查找和服务名加命令行归属标记查找。

操作契约：进程和目标发现仍由 fork 模块拥有，生命周期仍是原 `stopService` 请求；由 UI、MCP、退出或启动前清理调用。中间日志与进度、成功/失败终态、重入处理、父/companion 顺序均沿用既有实现，不新增 renderer 状态、持久化、IPC 或独立停止流程。确认父后仍收集完整子孙并复用树执行器，停止后的结果确认保持原逻辑。

### 代码调整

- `src/fork/module/Base/index.ts`：删除 `EXECUTABLE === version.bin` 的遍历及其专用 import；保留候选 PID 信息不可读时的防御检查，因此没有删除 `PItem.EXECUTABLE` 字段。补充方法和两条目标来源的注释，明确相同程序路径不构成通用扩展停止目标的依据。
- 本文：记录删除原因、剩余目标来源、影响范围及验证限制，覆盖第二十一轮曾提及的通用实际 EXE 扫描。
- `windows-service-stop-review.md`：给 R01 补充处理状态，区分已移除的 EXE 扫描与仍保留的命令行标记匹配问题。

此修改影响所有复用 `windowsServiceTargets` 的 Windows 模块。模块专用的 PHP 等归属判断未调整；macOS/Unix 不执行该方法，未改其路径或命令行判定。Go RPC 和执行器未改，因此不递增 HelperVersion。

### 检查范围与剩余边界

本轮仅做修改前后源代码核对，不新增或运行测试、构建、类型检查及真实进程停止。后续验收应覆盖：登记父及子孙正常停止、PID 缺失时服务名与标记恢复、仅实际 EXE 相同但不满足剩余归属条件的独立实例不被选入，以及模块专用停止仍正常工作。

用户在第二十三轮明确：完全复用 FlyEnv 数据目录与内部启动命令的手动实例视为 FlyEnv 服务，保留第二条来源属于期望行为。第二十二轮只移除第三条；其他 review 项的后续修复见下章。

## 第二十三轮：服务停止 review 修复（2026-10-02）

### 范围和用户确认的归属规则

实施计划见 [服务停止修复计划](windows-service-stop-fixes-plan.md)，发现与状态见 [服务停止 review](windows-service-stop-review.md)。本轮处理 R02–R12，并修正 PostgreSQL 数据目录前缀、MongoDB 多监听者及复核中发现的停止失败传播问题。

用户已确认两条目标来源足够：登记/私有 PID 文件，以及服务名加 FlyEnv 命令行归属标记。不恢复相同实际 EXE 路径全列表扫描。完全复用 FlyEnv 数据目录及内部启动命令的手动实例按 FlyEnv 服务处理；单纯使用 FlyEnv 安装的程序自行运行另一配置不因为 EXE 相同而被扩展为通用停止目标。

保持同一入口：renderer 服务生命周期、MCP、main 退出均调用 fork `stopService`。fork 模块决定父归属、原生关闭/信号策略、companion 和结果确认；共享 Windows 权限层选择普通权限、当前管理员、UAC 或 Helper。Go 是其中一个执行后端，没有第二套模块服务停止编排。

### main：受理、排队、登记和退出的完整顺序

1. `ServiceLifecycle.serviceLifecycleAction` 统一识别 `startService`、`stopService`、Cloudflare 的 `start` 和 `open*` 面板入口。IPC 与原始 ForkManager 边界共享分类，避免页面之外的调用绕过退出限制。`app.start` 是应用信息操作，未误归为外部服务启动。
2. `ServiceProcess.runLifecycle` 按模块串行执行已受理的 UI/MCP 操作，跟踪 Promise 到消费终态结束，包括处理返回 PID、停止参数和登记。等待的不只是 fork 回复：登记也必须已完成。
3. 每次新启动/更新运行登记递增 `generation`。停止参数在实际派发时深拷贝，保存 `rootPid`、`rootGeneration` 及当时各登记代次。请求明确带 PID 时只匹配这个 PID，不因找不到它而回退到同 bin 的新实例。
4. 停止成功仅注销派发快照内的对应代次；启动返回的旧停止 PID/stale bin 也只清启动派发前的登记。后续同 PID/bin 新登记不能被旧回包删除。模块确认停止成功时允许注销请求的原根；失败则不做成功注销。
5. 应用退出先关闭窗口操作和首次认证选择，再同步关闭 ServiceProcess 和 ForkManager 的新生命周期入口；随后等待已受理的消费操作和原始 fork 请求结算，最后读取运行登记执行停止。已受理操作持有临时许可，退出自有停止持有 shutdown 许可；许可在任务结束时撤销，派生计时器不能永久绕过退出限制。
6. `ServerManager.stopServer()` 已调用 `ServiceProcess.stop()`，因此移除 Application 中多余的第二次停止遍历。退出逐登记实例调用 fork 模块 `stopService`，严格检查 `code=0`，成功才清对应代次；父模块已经回收 companion 时，后续遍历跳过已注销项。
7. 单个实例失败记录日志并继续其他实例，沿用现有退出策略。最后销毁 fork 并继续 hosts 等资源清理。保留内存登记便于当前运行中的重试，但不阻止退出，也不提供下次启动自动重试。

MCP 的启动、停止、stop_all、重启共用模块队列。内部版本切换调用内部停止实现，避免在已经持有队列时再次排队形成自等待。旧版本停止失败立即终止切换，保留旧登记，不启动新版本、不修改 current。插件正常停止及运行时 smoke 启停也纳入受理/登记规则；本轮修改 smoke 的生产编排入口，没有执行 smoke。

### fork：归属不可读、子孙信任和结果确认

- **Base**：候选登记/PID 文件指向的活父没有 COMMAND 时明确报错；仅有 EXE 不能补认归属。两个目标来源和模块既有 marker 不变，不重新扫描同 EXE 的独立实例。
- **PHP**：候选包括运行登记、模块 PID 文件及实际版本 PID 文件。活候选 COMMAND/EXE 不可读不能进入“空列表成功”。正常 spawner/父已确认后，其 worker 直接进入父树，不增加逐 worker 预检；仅独立孤立 worker 使用既有 PHP ini/程序归属证据。执行后同时等待原树清单退出及检查模块残留，不能只确认 spawner 和一个 worker 消失。
- **ClickHouse**：候选活父不可读报错；父已缺失但仍有历史 PPID 子进程时报错；watchdog 尚未证明归属且后代命令不可读也不能当成 stale 清登记。已确认父的正常后代仍随树执行。
- **项目/自定义服务**：先确认父创建身份，收集当时全部子孙，再对 Windows 父调用树执行器；执行后等待原清单全部消失。父在权限等待期间退出而子孙仍活着，最终结果是失败，不能返回停止 PID 清状态。Unix 保留 TERM、短等待、INT 策略，改用严格执行和相同结果确认。
- **隧道**：Windows 仍验证 cloudflared 根的模块归属，树执行后确认原子孙；Unix 保留 INT，但不再吞异常清 PID，并补结果确认。没有活父却存在历史 PPID 时拒绝补认。

结果确认是“执行后是否消失”，与“停止前是否有权结束每个 worker”不同。正常树仍只验证父，执行时由系统结束后代。查询错误直接传播，轮询超时明确失败；不将异常转换为空列表、不在超时后默认成功。

Unix 批量信号与进程自然退出存在竞态：命令报错后，仅在严格新鲜查询证明原目标全部消失时视为幂等成功；有残留或查询失败仍报错。Windows Go taskkill 也仅在所有已持有原进程句柄均为退出状态时接受其非零返回，不能仅靠数字 PID 不存在吞错。

### DbGate：打开与停止共享同一个 runtime

`DbGateRuntime` 拥有 openFlight、stopFlight、私有 entry 归属及 PID/端口文件。打开遇到进行中的停止先等待；停止遇到进行中的打开先结算再清理，不能在 PID 尚未落盘时返回空目标成功。

`stopOwned(expectedPid?)` 使用私有 PID 文件、独立面板已登记的 PID 和私有 entry 发现候选，并在同一份严格进程列表里验证归属。正常 MongoDB 停止不把 mongod PID 传给 DbGate，独立面板的 dbGateOnly 分支才传面板登记 PID。父命令不可读、父缺失但还有历史 PPID、查询失败均报错；陌生 PID 不能直接 kill。

等待退出增加明确超时。只有 kill 与结果确认都成功后才删除文件，删除失败也向上传播；取消 UAC 或超时不能在 finally 中抹掉重试依据。打开后的健康检查失败，先清理已确认面板树；删除原“未取得归属清单时直接结束 firstPid”的兜底。openInternal 内部清理使用私有 stopOwned，避免公开 stop 等待当前 openFlight 造成自等待。

面板已停而数据库停止失败属于部分完成；数据库模块整体仍失败。重试可幂等处理已经退出的面板，不把整体失败改成成功。

### 数据库：原生关闭目标与参数防御

**MySQL/MariaDB** 使用已选择版本目录下的绝对 mysqladmin/mariadb-admin EXE，通过 `execFile` 参数数组调用：配置文件、TCP/127.0.0.1、明确端口、用户、密码分别为参数，shell=false、隐藏窗口、有限超时。中文、空格、引号、&、% 不经过 shell 展开。错误日志只取安全的错误码，不打印带密码的 execFile 错误对象/完整命令。

端口必须从当前配置明确解析为 1–65535；读取/解析失败不猜 3306 发 shutdown。原生关闭前要求唯一实际监听 PID 属于已确认实例。无法核对或原生关闭失败时，按模块既有回退策略处理已确认进程：重新查询当前归属，并与最初目标取交集，不在回退阶段扩大实例；执行层仍复核创建身份。停止后等待最初目标消失并重新检查原目标残留，才清理实例文件。

**MongoDB** 保留现有 mongosh admin shutdown；读取当前端口并要求查询所得监听者非空、全部属于已确认目标。不能因为共享端口的某一个 PID 属于 FlyEnv 就向可能落到另一实例的连接发 shutdown。缺少 mongosh 时沿用模块既有进程停止回退，停止期间不下载程序；认证/TLS/非 loopback 配置不能完成当前关闭时明确失败。

**PostgreSQL** 保留 Windows pg_ctl 与实际 DATA_DIR 的关闭方式。匹配 postgres 进程时解析完整 `-D` 数据目录参数，支持引号、空格，Windows 规范化大小写/斜线，避免 dbPath 子串匹配另一 dbPath2。Unix pg_ctl 错误、PID 文件等待超时及活进程等待超时均传播，禁止等待结束后无条件成功。

### Windows 普通/UAC/Helper 与 Go 的当前停止协议

1. 模块先取得归属证据；共享权限层在展示 UAC 前保存实际父/独立目标的创建时间。普通树只为根建立身份，工具单 PID/端口为实际请求目标建立身份。
2. 首选原生 `Process.StartTime` 完整 UTC 时间。读取因访问拒绝失败时，用普通权限的精确 PID CIM 查询尝试取得创建时间与实际 EXE 路径；两种查询都不能取证则保留失败，不能在提权后盲认当前数字 PID。
3. 对 CIM 取证成功的目标，普通执行仍先尝试；执行访问拒绝才按已选 UAC/Helper 路由。执行前使用相同来源重查身份，CIM 还须核对程序路径。模块自身更早的归属查询完全不可读仍可能直接失败，本轮不承诺任何企业限制都能自动提升解决。
4. Helper 签名 RPC 统一：`kill(signal, pids, tree, identities)`；`killPorts(ports, identities)`。普通 PID 不再丢掉身份数组。Go 保留 Unix 老两参数用法，但 Windows 活目标没有原身份必须拒绝。
5. Go 在执行前校验参数形状、数量、数字范围、重复身份、来源、时间、CIM 必需路径；原生打开目标句柄，检查创建时间、保护名字和必要路径，所有根通过后才调用固定系统 taskkill。请求 PID <=4、Helper 自身及受保护系统进程拒绝。句柄在执行期间保留，树模式只检查根。
6. 原生时间按完整精度比较；CIM DMTF 是微秒精度，Go 在该精度比较并额外比较规范路径。不能把两种时间原样混比造成普通服务永远不匹配。CIM 查询使用 DateTime UTC，不套用只接收 DMTF 字符串的转换函数。
7. 端口模式执行时重新查询监听者，只允许原快照的现存目标；原目标消失可幂等，新监听者或同 PID 新创建时间拒绝，不自动结束新的占用者。
8. Go Unix kill/端口 kill 的实际命令错误向上传播。lsof 无匹配的退出 1 仅在 stdout/stderr 均为空时作为空端口；真实查询错误不能伪造空列表。

原有 HMAC、nonce、防重放、客户端 SID/PID/EXE 验证保持；它们验证请求来源，创建身份验证停止目标，两者职责不同。已经管理员运行的 FlyEnv 继续直接执行；UAC 后端不要求安装 Helper。

### 项目/自定义服务的启动身份和 macOS 兼容

新增 `ServiceProcessIdentity` 使用实际返回的 PID 与启动阶段创建时间：Windows 从精确 PID 的 CIM DateTime 取 UTC；Unix 用固定 `/bin/ps -p PID -o lstart=`，LC_ALL/LANG=C，避免中文月份解析问题。停止比较同来源原创建字符串，不要求完整二进制路径，也不要求 macOS 进程标题保持启动时的 COMMAND。

启动采样暂时失败最多重试三次，注册时间上界冻结不扩大；终端分支启动前移除历史私有 PID 文件。停止参数分别为 `[pid, typeFlag, identity]`、`[pid, identity]`；main 只保存/转发，不保存项目密码、完整启动命令或环境变量作为停止凭据。

持续查询失败仍保留实际 PID 和缺少 created 的未验证身份，自动停止活父明确失败。不能到停止时仅凭“创建于启动时间窗口”补认身份，窗口内也可能 PID 复用。此限制替代原永久保存空 COMMAND 的错误：正常进程标题不可读/改变不再妨碍创建身份，真实身份完全无法获取仍安全拒绝。启动后采样与真实创建并非原子操作，Unix lstart 只有秒精度；极端同秒复用不能靠本轮实现完全排除。

### 本轮文件与处理原因

| 文件 | 修改与原因 |
| --- | --- |
| `src/main/core/ServiceLifecycle.ts`（新增） | 共用入口分类、异步上下文临时许可及任务完成撤销；退出拒绝新请求同时允许结算旧请求 |
| `src/main/core/ServiceProcess.ts` | 模块队列/在途消费、登记 generation、停止快照、按代次注销、退出等待；避免漏登记或旧回包删新实例 |
| `src/main/core/ForkManager.ts` | 原始 fork 生命周期入口关闭/在途跟踪；移除全局根据当前登记重写 stop 参数，改由消费者派发快照 |
| `src/main/core/IPCHandler.ts` | UI 实际派发时捕获参数/代次，成功消费时按原快照登记清理，不拼接旧签名多余参数 |
| `src/main/core/MCPTools.ts` | 同队列/快照、内部重启与切换、旧停止失败中断；stop_all 继续包含 companion |
| `src/main/Application.ts` | 退出封闭与结算顺序、去掉重复 stop、插件停止和 smoke 使用相同登记规则 |
| `src/fork/module/Base/index.ts`、`Php.win/index.ts`、`ClickHouse/index.ts` | 不可读归属明确失败；PHP 完整树退出确认；父缺失/未知不能当作 stale 成功 |
| `src/fork/module/DbGate/index.ts`、`Mongodb/index.ts` | 面板 flight 协调、严格确认后清文件、正确面板登记 PID；MongoDB 全部监听者归属 |
| `src/fork/module/Mysql/index.ts`、`Mariadb/index.ts` | 原生命令绝对路径/参数数组、安全诊断、明确端口核验和限于原目标的既有回退 |
| `src/fork/module/Postgresql/index.ts` | 数据目录完整参数匹配，Unix 原生失败/超时传播 |
| `src/shared/ServiceProcessIdentity.ts`（新增） | 创建时间采样/父验证、Unix 严格信号、全树退出确认；不增加模块专用共享字段 |
| `src/fork/module/LanguageProject/index.ts`、`ModuleCustomer/index.ts` | 创建身份停止参数、终端旧 PID 清理、父缺失拒绝、停止成功前确认全部原子孙 |
| `src/fork/module/CloudflareTunnel/CloudflareTunnel.ts` | Windows 原子孙退出确认；Unix 失败保留运行状态 |
| `src/fork/Helper.ts` | 所有 Windows 停止模式把原目标身份传给签名 Helper RPC |
| `src/shared/WindowsPrivilegeOperation.ts`、`WindowsProcessSafety.ts`、`Process.win.ts`、`WindowsHelperFallback.ts` | StartTime 拒绝时 CIM 取证、来源固定、普通/UAC 脚本相同身份重查与目标保护 |
| `src/helper-go/main.go`、`module/tool.go`、`utils/process_tree*.go` | RPC 解析、单 PID/端口/树同一原生目标保护、查询/执行错误传播、幂等退出句柄确认 |
| `src/helper-go/contract/helper-contract.json`、`scripts/helper-contract-check.ts` | 协议说明/反射校验适配新增身份参数；本轮未运行检查脚本 |
| `src/shared/AppHelperCheck.ts`、`src/helper-go/main.go` | HelperVersion 同步由 29 递增到 30，防止旧程序被误判为实现新协议 |
| 本文、review、修复计划 | 记录授权范围、完整顺序、每项修复原因与尚未验收的边界 |

### 检查与发布边界

本轮做源码交叉核对：UI/MCP/退出/插件入口、队列与许可、代次/参数签名、DbGate 失败状态、数据库命令路径及端口、CIM DateTime 与时间精度、RPC 参数、Go 版本同步、父确认后信任子孙、执行后结果确认。新增/调整逻辑均补充原因与边界注释。

`git diff --check` 无空白错误；Git 提示少数既有 CRLF 文件在后续操作时会规范化为 LF，本轮未批量转换行尾。

未新增或运行测试、类型检查、格式化工具、构建，未实际启动或停止服务。Helper 30 目前只是源码版本，二进制没有重建；发布前仍需生成新产物并同步既有打包/指纹流程。文档里的“已处理”指代码路径已修改，不能代替 Windows 普通/UAC/管理员/新版 Helper 及 macOS 的实机验收。

后续重点：PHP 四 worker 全部退出；启动/面板打开时退出；同 bin 新旧登记和旧回包；DbGate 取消/查询失败/超时后重试；MCP 旧停止失败；中文/特殊字符密码；数据库端口变更/共享监听；身份读取被拒绝；授权等待时父退出留子孙、PID/端口复用；项目创建时间采样持续受限；macOS 进程标题改变及秒精度边界。

## 服务停止独立实施审核修复（2026-10-03）

服务停止的当前完整逻辑及本轮逐文件修复理由移至 [独立实施文档第 11 节](windows-service-stop-implementation.md)，审核逐项回执见 [独立审核第 7 节](windows-service-stop-implementation-review.md)。这里保留历次版本和检查历史，不以旧记录代表当前源码。

本轮 Go/TS Helper 发布版本及独立版本断言统一为 **32**：Windows 端口/进程结构化查询、严格 Unix 监听解析属于 Go 行为变更，需要新发布版本；没有构建或替换 Helper 二进制。停止归属仍只有登记/私有 PID 和名称加 FlyEnv 命令标记，不恢复按同 EXE 全扫描；确认父后信任正常子孙。

补齐版本/配置边界、MySQL 分组实际 PID/统一停止契约、renderer 终态/重入/状态通知次序、退出在途写入与有界未知收口、Helper 准备异常与禁止未知写请求重放。没有新增/运行测试、构建、类型检查、格式化或实机服务操作，不能沿用此前已通过结果。

## 首次授权弹窗自动停用帮助程序（2026-10-03）

按用户要求，`Choice.vue` 移除“同时停用此前安装的帮助程序”checkbox、局部 ref 和专属样式，只提交授权方式。后续按用户要求同时移除弹窗和设置 tooltip 中的自动停用说明。`Controller.showChoice` 按选择方式确定停用行为，UAC 固定执行停用，Helper 不执行停用，不再消费弹窗的 disableHelper 输入。首次弹窗和设置页采用同一策略，去掉说明文字不改变自动停用和失败提示。

所有者仍为跨页面控制器，生命周期、choiceId 去重、进度/终态及失败提示沿用原实现，没有新状态存储或 IPC。先保存 UAC 偏好，再等待定向停用；失败保持 UAC，并提示用户通过设置维护按钮重试。停用仍只处理当前账户的任务/后台进程，保留安装文件；需要系统批准时使用现有 UAC 流程。本次未运行测试、构建或实机授权操作。
