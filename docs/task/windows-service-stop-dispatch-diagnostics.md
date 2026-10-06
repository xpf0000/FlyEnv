# 服务停止派发与退出清理阶段日志

## 为什么补充

2026-10-04 现场日志显示：退出首表查询 832ms，六个服务收到相同的 380 条首表，PHP
实际停止方法耗时 413/508ms，但多数模块比 Nginx 晚约 3.9 秒进入停止方法。原日志
不能区分选池、worker 创建/入口加载、初始化消息处理、命令传输和模块动态导入。
服务停止后还有 4496ms 的提权动作和 3265ms 的普通动作，缺少直接标明 hosts/DNS 的阶段。
这些时间是该次日志的观测值，不能据此认定所有环境都慢在相同环节。

本次只补充原链路的观测点。完整停止逻辑仍见
[首表直接传参](windows-service-stop-direct-snapshot.md)及
[统一执行说明](windows-service-stop-unified-execution.md)。不增加查询、kill、READY/ACK
或取表 IPC，不改变 stopService 业务参数、普通权限 taskkill、数据库确认及退出顺序。

## 关联字段与时间口径

- 新事件写入 `[ServiceStop][boundary]`，仍在系统 TEMP 的 flyenv-debug.log 中。
- `requestKey` 使用原命令 IPC key：连接主进程发送、fork 收命令、模块解析及返回。
  内建模块在 dispatcher 建立诊断范围，公共停止日志复用同一个 key 和 stopId。
- `workerPid` 标识执行请求的 utility process；`sourcePid` 标识边界事件发生的进程。
  worker 尚未 spawn 时 PID 可能缺失，不能把缺失理解为创建失败。
- 原 `[ServiceStop][diagnostic]` 增加 `loggerPid`。已有 action/query 的 sourcePid 保留
  真实 PowerShell/源事件进程，不能用写日志的 Node PID 覆盖它。
- `at` 在事件调用时取 UTC 时间；`durationMs` 用同进程 performance.now 的差值。
  新边界日志不 await 磁盘追加，落盘行号不保证事件顺序，应按时间与请求编号对照。
  跨进程 UTC 差值可能受系统校时影响，不能相减不同进程的单调时钟。
  worker 被强制销毁时，尚未落盘的异步日志可能缺失；不能仅凭缺行认定命令未执行。
- `quitId` 只关联本轮 Application.doStop 的已有退出流程，不是首表批次登记或授权凭据。
  hosts 清理在独立诊断范围中记录 quitId/stopId，现有 actionId 日志也能关联该 stopId。
- 不输出 Server、业务扩展参数、数据库口令、hosts 内容或全机命令行。

## 派发的完整观测顺序

1. `fork.main-worker-created`：已有 worker 构造路径完成创建请求。
2. `fork.main-worker-spawned`：main 收到 OS spawn，记录创建到 spawn 的耗时。
3. `fork.entry-ready`：fork 静态依赖已经加载，命令监听器已经安装。
   ESM 依赖在入口正文之前执行，不能在此事件之前假报 JS 入口已就绪。
4. `fork.main-worker-selected`：普通池选中 worker，记录选池/必要创建耗时、是否 loading、
   primary 与任务数。此时 requestKey 尚未生成，通过模块/worker/时间关联下一事件。
5. `fork.main-dispatch-begin`：ForkItem 生成原 requestKey，记录 worker 年龄及状态。
   重建时记录 `fork.main-worker-recreated`，不把退休 worker 的状态当成新 worker 的状态。
6. `fork.main-initialization-send-begin/sent`：包括原 Server/Language 快照序列化及发送。
7. `fork.initialization-received/returned`：fork 收到并同步处理初始化消息。
   原 manager.init 仍可能发起未等待的后台 Cron 导入，returned 不表示该任务完成。
8. `fork.main-command-send-begin/sent` → `fork.command-received`：原停止请求传输窗口，
   只记录首表条数/原因，不展开表；没有新增业务消息或确认往返。
9. `fork.module-resolve-begin/completed`：原内建/插件解析，包括缓存命中或必要动态导入。
10. `fork.module-init-begin/returned`：原 target.init 的同步调用耗时；不改变既有是否等待
    Promise 的行为，不声称模块自行发起的后台任务完成。
11. `fork.stop-invoke`：真正进入公开停止方法；随后的 module.stop-begin、发现 PID、
    有序 kill/命令输出、数据库退出确认及 PID 文件清理使用原诊断日志。
12. `fork.stop-completed/failed` → `fork.main-terminal-received`：原停止结果回传；code=200
    仍只是进度，不记录成终态。命令成功不等于已经确认全进程树消失。

worker 创建就绪事件发生在生命周期中，不要求每次热 worker 请求重新出现前三步。
worker 自然退出、错误、主动退休及其停止请求结算分别记录 worker-exited、worker-error、
worker-retired、main-request-retired；不能把销毁连接后的失败结算当成服务停止成功。
派发、初始化/导入或同步调用异常记录 dispatch-failed，模块缺失记录 module-resolve-failed。
fork 入口保存 requestKey/module 后再交给会 shift commands 的 dispatcher，错误日志不会
因此关联到错误参数。插件保留原方法签名；旧插件内联诊断实现未必包含新增字段。

## 退出清理的观测顺序

Application 使用已有 stopPromise 防重，每次真实 doStop 记录 quit.begin。已有等待步骤
分别记录 begin、completed 或 failed：service-drain、fork-drain、http-stop、mcp-stop、
services-stop、forks-destroy、hosts-cleanup，前缀均为 quit。原 catch/继续退出行为保留。
不存在的可选运行时会立即返回；completed 表示该步骤返回，不表示此前失败已被消除。
最后 quit.returned 给出整个 doStop 的耗时，不宣称所有清理动作成功。

ServerManager.cleanHosts 在 hosts-cleanup 范围内进一步拆分：

- `quit.hosts-read`：读取真实系统 hosts 的路径和耗时。
- `quit.hosts-skipped`：没有路径，或者没有完整托管块变化；不写文件、不刷新 DNS。
- `quit.hosts-write`：operation=tools.writeFileByRoot，记录写入的真实文件与阶段耗时。
- `quit.dns-refresh-launch`：operation=ipconfig.flushdns，只等系统工具启动，不等刷新结果。

写入失败不继续刷新 DNS；DNS 启动失败仅记录，不否定 hosts 写入。当前实现见
[worker 加载与 DNS 刷新](windows-worker-startup-and-dns-refresh.md)：DNS 刷新不再走
action/broker，因此 launch.completed 只表示尽力启动尝试已返回，不保证已启动或已刷新。

## 逐文件原因及后续读取方法

- ServiceStopDiagnostics.ts：公共非阻塞边界 logger、已有退出步骤计时包装，保留真实源 PID。
- ForkManager.ts：覆盖进入 ForkItem 前的选池/创建时间。
- ForkItem.ts：覆盖主进程序列化、发送、worker 事件和原请求终态，不保存首表副本。
- fork/index.ts：轻量入口、运行时导入计时；runtime.ts 覆盖就绪、初始化与收命令。
- BaseManager.ts：统一覆盖各模块解析、初始化及公开停止调用，不在 PHP 单独堆日志。
- Application.ts：分段记录已有退出等待/回收，hosts 动作建立可关联的诊断范围。
- ServerManager.ts：明确系统文件写入/DNS 刷新及跳过原因，不输出文件内容。

下一份日志先按 requestKey 对齐 sent/received/resolve/invoke/terminal；若 sent→received
较长，再对照 workerPid 的 spawned→entry-ready。若 received→resolve-completed 较长，
再查看模块动态解析。最后按 quitId 区分服务总时间、worker 回收和 hosts/DNS 清理。
这样才能用实际阶段证据确认约 3.9 秒空档的原因，而不是继续推测。

本轮为日志补充，没有修改 Go Helper 或升级其版本。七个源码文件语法解析无诊断，
相关已跟踪文件 diff 空白检查通过；未运行功能测试、完整类型检查、构建或真实服务停止。
