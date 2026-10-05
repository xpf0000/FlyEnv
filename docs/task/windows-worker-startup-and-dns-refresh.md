# Worker 加载与 Windows DNS 刷新优化

## 证据与实施计划

本轮范围：保留 worker 的选择、复用、闲置回收与重建策略，优化重建后的代码加载，并使
Windows DNS 刷新在启动成功后返回。服务停止的 PID 选择、顺序、命令及结果策略不变。

最新退出日志中，新 worker 的 spawned → entry-ready 约 5.4～5.8 秒；模块解析仅约
1～48 毫秒，不能把这段耗时归因于模块业务停止。退出 DNS 动作约 2.5 秒。
检查现有 dist/electron/fork.mjs，入口约 1.88 MB，顶层静态导入包含 sharp、mysql2、
ftp-srv、dns2、npm-check-updates。源码中的模块动态 import 在未开启 splitting 时
不能隔离这些外部依赖的加载。这个负担确实存在，但各依赖占用多少时间尚未实测。

实施顺序：

1. 两套 esbuild 配置的 fork 启用分块，固定 fork.mjs 入口，使用独立 fork-chunks 目录。
2. 拆出仅依赖 Node 内置模块的入口，记录首次执行及 runtime 动态导入耗时。
3. IPC 结果发送方法从 Fn 工具集合拆出，原 Fn 导出保留，避免入口仅为发消息加载工具集合。
4. 主进程退出清理与 fork 站点写入共用系统 ipconfig.exe 的非阻塞启动方法。
5. 更新原有源码检查脚本的运行时文件指向及当前链路说明；仅做源码静态检查，不运行测试或构建。

## 操作所有权与边界

> 退出阶段更新（2026-10-04）：hosts 清理现在与服务停止、HTTP/MCP 关闭并行；整组
> 结束后才回收 fork/权限资源，DNS 仍只等待 spawn。详见
> [退出清理并行调整](application-quit-parallel-cleanup.md)。

- Worker：主进程 ForkManager/ForkItem 继续管理进程生命周期；bootstrap 只加载 runtime。
  中间事件为 bootstrap-begin、runtime-import-begin；成功为 runtime-import-completed 与
  entry-ready，失败为 runtime-import-failed 及 worker 非零退出。原请求由已有退出回调结算。
  不增加 READY/ACK IPC、池状态、重建防重或 renderer 控制器。
- DNS：站点 hosts 写入由 Host.writeHosts 所有，退出 hosts 清理由 Application/ServerManager
  所有；共享执行器只负责尽力启动固定系统工具。终态为 spawn 成功或启动失败，分别返回
  true/false；失败仅记录，不否定已经成功的 hosts 写入。实际刷新结束不属于调用者等待
  的终态。并行调用各自启动一次，不增加全局配置、Pinia 或授权状态。
  子进程忽略标准流并解除引用，退出清理返回后可以继续刷新。
- 验证边界：后续实机应覆盖冷 worker、多服务并行重建、所有模块与插件加载、工具不存在/被
  策略拒绝、中文或空格系统路径，以及 FlyEnv 退出后 DNS 子进程继续执行。此轮不宣称实测通过。
- 无新增模块，无默认模块约束例外；没有新增 renderer 长任务或共享持久状态。

## 实施记录

### 逐文件改动原因

- `configs/esbuild.config.win.ts` 与 `configs/esbuild.config.ts`：devFork/distFork 都开启
  splitting，入口显式命名 fork，输出仍是 dist/electron/fork.mjs。新共享与业务块位于
  fork-chunks；main 仍用 chunks，两个构建不会互相覆盖。当前三平台打包配置的
  dist/electron/**/* 已覆盖这些文件。必须重新构建后才能生效；不能单独分发 fork.mjs。
- `src/fork/index.ts`：只静态引用 Node 内置的 fs/promises、os、path、perf_hooks，首条
  日志不再位于整棵业务依赖树执行之后。异步追加采用既有文件、UTF-8 和 boundary 格式，
  事件发生时固定 UTC/PID。运行时导入失败会记录原因并非零退出，由既有 ForkItem 退出
  路径处理请求；失败路径等待这一条诊断写入尝试，正常加载不等待磁盘。
- `src/fork/runtime.ts`：承接原入口的完整业务实现，provider 注册、parentPort 转发、
  插件语言桥、全局 Server 初始化、dispatcher 及 entry-ready 逻辑保留在同一进程。
  动态导入完成表示这些监听器已经安装，不表示每个业务模块都已加载。
- `src/fork/ProcessSend.ts`、`Fn.ts` 与 `BaseManager.ts`：IPC 发送工具独立且无外部包；
  runtime/dispatcher 直接引用它。Fn 重导出原三个名称，继续供模块和插件使用，成功、
  错误、进度的 code/on/key 及 errorCode 协议不变。本地 AppLogSend 使用同一发送器。
- `src/shared/WindowsDnsRefresh.ts`：固定系统工具路径经已有 WindowsSystemPaths 解析与
  文件检查，直接 spawn 参数数组，不通过环境 PATH、cmd、PowerShell、Helper 或 UAC。
  等待 spawn 成功，然后 unref；detached + stdio:ignore 避免父进程退出时等待子进程或
  标准流。error 监听器处理启动失败与迟到错误；不读取 stdout/stderr/退出码，不重试。
  绑定原诊断上下文后注册事件，保留退出 quitId/stopId。所有常规日志不等待磁盘。
- `src/main/core/ServerManager.ts` 与 `src/fork/module/Host/index.ts`：Windows 在实际
  hosts 写入成功且需要刷新时调用同一个执行器。计时阶段改为
  quit.dns-refresh-launch / hosts.refresh-dns-launch，明确返回的是启动成功。
  启动失败只记录并返回 false，调用者继续成功终态；hosts 内容/写入授权行为不变。
- 四个已有源码检查脚本（bin-version-cache、env-sync-coordinator、stop-process-list-cache、
  temporal-module）：检查 provider/初始化的位置从 index.ts 改为 runtime.ts，没有改变
  断言的业务规则或增加测试。language-bundle-audit 仍以实际 index.ts 为入口，其依赖
  图包含动态 runtime，无需改动。plugin-builder 仅更新插件桥所在文件的注释。
- 当前派发诊断文档更新 runtime 与 DNS 阶段名称，避免后续按旧 action/broker 关联 DNS。

### 当前 Worker 完整加载顺序

1. ForkManager/ForkItem 按既有规则选中或创建 worker，原 OS spawn 日志保留。
2. 新 worker 执行 fork.mjs，记录 fork.bootstrap-begin 和运行时导入开始；uptimeMs 只
   辅助观察 Node 运行时间，不能替代主进程记录的 OS spawn 时间。
3. 动态导入 runtime 块，执行其公共静态依赖，安装 provider、插件语言桥与消息监听器。
4. runtime 记录 fork.entry-ready，随后 bootstrap 记录 runtime-import-completed。
5. 原初始化/命令经 parentPort 进入 dispatcher；收到命令才动态加载对应业务模块。
   共享 chunk 由 Node 在本 worker 内缓存，多个模块使用同一导出实例。
6. worker 正常退出/闲置回收按原规则处理；导入失败由原退出路径结算请求。

分析下一份日志应按 workerPid 和事件 at 对齐：spawn → bootstrap 是 OS/Node 入口启动
窗口，runtime-import-begin → completed 是运行时加载窗口，command-received →
module-resolve-completed 是具体模块窗口。分块会把相关模块的必要加载移到该模块导入
阶段；不能只看 entry-ready 提前就认定整个服务停止快了，要同时看最终 request/quit 耗时。

### 当前 Windows DNS 完整顺序

实际 hosts 写入完成 → 校验实际 System32/ipconfig.exe → spawn /flushdns → spawn 成功
→ unref 并返回 → 调用者继续站点操作或退出 → 系统工具自行执行刷新并退出。

不读取实际刷新结果是本次明确约定。spawn 成功不证明刷新成功；企业策略或 DNS 服务
状态可能导致子进程之后返回非零，FlyEnv 不因此重试或请求授权。缺文件、无效系统路径
以及启动前拒绝只记录并返回 false，不抛出、不重试、不改变 hosts 写入成功结果。
调用者的 launch.completed 表示这次尽力启动尝试已返回，是否启动成功以 dns.refresh-spawned
或 dns.refresh-spawn-failed 日志为准。路径是 Unicode 参数，包含中文/空格不会发生 shell 转义或编码
解码问题。main/fork 的后续退出不等待刷新；系统或企业 Job 策略是否允许子进程独立
存活仍属实机边界。没有调整 Go Helper 的现有 DNS 接口，因此无需升级 Helper 版本。

### 源码复核与验证边界

静态遍历 runtime 的值导入/重导出图：38 个源码文件，无未解析本地路径，不再到达 Fn；
外部导入保留 fs-extra、electron-is、json5、pathe、shell-env、vue-i18n 等公共依赖。
sharp/mysql2/ftp-srv/dns2/npm-check-updates 不在这棵源码静态图里；这不是实际 esbuild
输出或各包加载时间的验证。现有 createRequire(import.meta.url) 的调用只解析包名/
内置模块，不依赖 fork.mjs 的相邻文件；chunk 移到子目录后仍可沿父目录查找 node_modules。

本轮 15 个新增/调整 TypeScript 文件语法解析无诊断，相关已跟踪文件的 git diff --check
通过；语法解析不等于完整类型检查或功能验证。

本轮未构建、未运行测试、未启动/停止真实服务或刷新系统 DNS。重新运行开发构建后，
需要用新日志验证是否减少冷启动总耗时；不承诺从 5 秒缩到某个尚未测得的数值。

### DNS 失败语义修正

之前把 DNS 工具启动失败向外抛出，会导致文件已写入但站点操作显示失败，这个处理不准确。
当前统一在 WindowsDnsRefresh 中吸收启动错误并记录；Host 的刷新异常保护也只记录，
避免计时包装等意外错误反过来否定 hosts 写入。ServerManager 的外层错误传播仍用于
真正的 hosts 读取/写入失败，DNS 失败不会再走该路径。DNS 成功或失败都不等待磁盘日志。

## Cron 加载与初始化细分日志计划

> 此节记录主动加载移除前的诊断过程；当前实现以文末“Cron 恢复按需加载”一节为准。

最新实机日志（2026-10-04 16:30）已确认：worker spawn → ready 约 621～702ms，但
initialization-returned → command-received 仍有 1997～2204ms。BaseManager.init 会
发起 Cron 动态导入；现有日志不足以把这段空档归因于 Cron。本轮仅补充阶段观测。

- 所有者：BaseManager 管理后台 Cron 导入；Cron 单例管理自身初始化及元数据同步；
  runtime 管理消息入口、Server/语言初始化。无 renderer 状态、新配置或持久字段。
- 关联：沿用初始化 requestKey、workerPid；Cron 内部使用 triggerModule 说明来源模块。
  导入和单例构造只记录进程级阶段，不增加 IPC 或全局诊断登记。
- 中间事件：parentPort 接收、语言应用、Cron 导入/模块执行/构造、同步 init 调用、
  配置加载、系统任务修复、下次执行时间计算、运行记录同步、必要配置保存。
- 终态：同步 init 返回与后台元数据同步完成分别记录，不能把前者当成后者。重复 init
  记录 skipped，保留原 initStarted 防重，不追加同步任务或重试。
- 失败范围：日志只是附加动作，失败不可阻断消息、停止或 Cron。业务步骤的错误仍经原
  Cron 后台 catch 处理，不转成服务停止失败；存储/修复等必要步骤不吞错后继续保存。
- 调度：不等待 Cron 初始化、不调整 worker 分派。仅增加一次 unref 的 setImmediate
  观测事件循环下一轮，不以诊断 timer 延长进程寿命。
- 检查：复核原有短路条件、重复初始化及后台失败路径，做源码语法/空白检查；不运行
  测试、构建、定时任务修复或真实服务操作。实际耗时待重新构建后的新日志。

### 细分日志实施与读取方法

`runtime.ts` 在 parentPort 回调最前面记录 fork.port-message-received，仅包含关联字段
和消息类型。与 main-command-sent 对照可观测消息到达窗口；与 command-received 对照
可观测 provider/兼容转发的窗口。语言包应用新增 fork.language-apply 的 begin/completed。
初始化末尾的 fork.initialization-next-turn.durationMs 表示安排 setImmediate 到执行的
延迟，并非 CPU 用时或 IPC 传输用时。这个回调可能先于 Cron 导入完成，不能用它单独
判定不存在后续阻塞；普通 Node 消息直达模式没有 parentPort 阶段。

`BaseManager.ts` 的 init 可选接收本次 requestKey/module，仅传给诊断，不进入模块服务
方法的业务参数。fork.cron-import.begin/completed/failed 覆盖动态依赖加载及模块执行；
fork.cron-init.begin/returned/failed 只覆盖同步 init 调用。失败计时以对应阶段起点计算，
背景错误仍由原 catch 接收，服务请求不会因此返回失败。

`Cron/index.ts` 在所有静态依赖加载后记录 cron.module-evaluation.begin，在默认单例
构造后记录 completed；其中 cron.constructor 进一步覆盖 Cron 自身字段及对象构造。
构造计时不包含 Base 的 super，完整模块执行区间包含它。模块执行事件无 requestKey，
按 workerPid 与 import 时间窗口关联；构造仍只发生一次，默认导出仍为相同单例。

Cron.init 的可选 requestKey/triggerModule 只关联日志，无参业务调用保持可用。重复调用
记录 cron.init.skipped/already-started，不新增同步。首次调用后台记录：

- cron.metadata-sync：完整元数据同步的 begin/completed/failed。
- cron.storage-load：配置读入、解析和规范化。
- cron.system-repair：已有系统任务修复，记录任务数，不记录任务内容。
- cron.next-runs：下次运行时间计算，记录是否变化。
- cron.run-records-sync：已有运行记录同步；next-runs-changed 时按原短路条件跳过。
- cron.storage-save：确有变更时保存；否则记录 no-change，不增加文件写入。

异步步骤复用公共 timeServiceStopBoundary，其重抛的业务错误最终仍由原 Cron catch
处理。日志本身由公共 logger 隔离，不等待写盘。此次没有为日志新增重试、查询、提权或
同步等待，initStarted、防重及原 || 短路行为保留。

下一份日志按相同 workerPid/requestKey 的阶段 at 排序：若 cron-import.begin 到
module-evaluation.begin 覆盖约两秒，而构造和同步 init 很短，说明加载依赖的时间值得
继续拆解；若 system-repair 等阶段覆盖空档，应进一步检查该阶段，但时间重合本身仍
不足以证明其阻塞了事件循环。同步初始化、异步加载与后台 I/O 的完成要分别解释。

本次三个调整源码文件语法解析无诊断，相关已跟踪文件 diff 空白检查通过；未运行测试、
完整类型检查、构建或真实初始化。新增日志需要重新构建后才会出现在下一份实机日志中。

## Cron 恢复按需加载（2026-10-04）

### 范围与操作契约

用户明确要求移除 BaseManager 中的主动加载，并取消旧脚本修复能力；不新增应用启动
维护入口。此次为现有模块的有限调整，沿用 flyenv-module-boundaries 和
flyenv-failure-boundaries 的归属及结果约定，不新增 renderer 状态、Pinia 或共享配置。

- 所有者与生命周期：BaseManager 仅在收到 cron 模块命令时加载其 worker 内单例；
  Cron 管理自身后台元数据同步；UI 的列表轮询由既有挂载/卸载逻辑管理。
- 起点与中间事件：进入任务页、刷新列表或操作任务触发既有 IPC；派发器按需导入、
  调用模块 init，再执行原方法。后台同步仍记录配置读取、时间计算、记录同步和保存。
- 终态与失败：业务请求由既有 ForkPromise 回调结算；后台元数据同步失败进入原 catch，
  不改变其他业务结果。没有旧脚本修复、重注册或新的退出等待。
- 重复调用：保留 Cron.initStarted 在同一 worker 内防重；不引入跨 worker 状态。
- 服务交互：PHP/Nginx 等请求不会再由 BaseManager.init 提前导入 Cron。任务的系统
  注册继续由添加、修改和启用等已有操作负责；系统调度执行不依赖 FlyEnv worker 常驻。
- 生命周期检查：检查普通 worker 初始化、首次/重复 Cron 请求、页面挂载及卸载轮询、
  原任务操作入口和后台失败边界；本次不新增或运行测试、构建及真实系统任务操作。

### 修改原因与文件

历史 f4b52a57 的主动初始化用于恢复系统任务；a16d257c 已将其改成元数据同步，
50174c54 又增加 Windows 旧包装脚本修复。现有 UI 的 getCronJobs 本身同步下次执行
时间和运行记录，列表每 20 秒刷新，不需要服务停止 worker 提前加载 Cron。

1. BaseManager.ts：init 仅清理插件缓存，移除主动导入、Cron 初始化及专用诊断参数。
   cron 命令分支保留按需导入，并通过原 doRun 调用 init。
2. runtime.ts：恢复 manager.init() 无参调用，修正已过时的后台 Cron 注释；消息到达、
   语言应用和下一轮事件循环诊断保持可用。
3. Cron/index.ts：取消旧脚本修复阶段，init 恢复无参；后台元数据同步和原短路条件保留。
   模块执行诊断只在实际导入 Cron 时出现，不再依赖已移除的主动导入日志。
4. Cron/SystemScheduler.ts、WindowsSystemScheduler.ts：移除 repair 接口、平台转发、
   旧版本检测函数和仅修复所需的文件读取依赖。正常创建任务仍生成当前版本脚本。
5. package.json 与 scripts/windows-cron-wrapper-migration-test.ts：删除取消功能对应
   的测试脚本及组合命令引用；保留正常脚本生成、运行测试入口，不运行它们。

### 行为与耗时边界

已有旧脚本不会在初始化或进入页面时被自动迁移；任务新增、修改或重新启用仍按原
apply 流程生成脚本。此行为是用户明确要求取消自动修复的结果。

取消提前加载后，新 worker 的实际服务模块仍可能加载 Base/Fn 共同依赖；不能将此前
Cron 导入的约两秒直接算成退出总耗时收益，实际效果需看后续真实日志。

### 本次静态复核

五个修改的 TypeScript 源文件语法解析无诊断，package.json 解析通过，相关已跟踪文件
diff 空白检查通过。源码搜索确认：BaseManager 仅 cron 命令分支保留动态导入，runtime
调用与管理器无参 init 一致；Cron 无 repair、旧版本检测及迁移测试命令残留。
未运行测试、构建、完整类型检查、系统任务操作或真实服务启停；耗时改善未做实机验证。
