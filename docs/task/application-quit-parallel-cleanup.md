# FlyEnv 退出清理并行调整

## 目标与原因

用户要求检查完整退出链路，将能够独立执行的操作并行。原 Application.doStop 在完成
服务停止和 fork 回收后才清理 hosts。2026-10-04 18:59 的实机日志中，服务停止耗时
6588ms，hosts 清理耗时 4265ms，两段串行使总退出耗时达到 10870ms。

本次沿用 flyenv-module-boundaries、flyenv-failure-boundaries 的所有权及失败边界，
直接调整现有 Application 的执行顺序，不新增退出控制器、队列、IPC 或配置。

## 实施计划与操作契约

- 所有者：Application 持有退出防重 stopPromise，并负责本轮清理任务的启动、等待和
  收尾；ServiceProcessManager 管理服务登记，ForkManager 管理请求和 worker。
- 生命周期：菜单退出、正常 app.quit、relaunch 共用 Application.stop/doStop。
- 起点：同步关闭服务和原始 fork 请求入口，权限协调器禁止新选择但保留已选授权。
- 必要前置：等待已受理生命周期请求及其终态消费者，再等待原始 fork 请求结算。
  消费者可能继续派发配置/hosts 等请求，不能把这两个屏障直接改成一次 Promise.all。
- 中间事件：保留各 quit 阶段日志；增加 quit.parallel-cleanup.begin/completed，
  覆盖 HTTP、MCP、服务停止和 hosts 清理这一组任务的实际重叠区间。
- 并行范围：两个屏障完成后，在同一轮中发起四个独立任务。同步清理函数仍直接调用，
  没有 Promise 或外部等待可重叠，不将它们包装成虚假的异步任务。
  HTTP/MCP 放在 drain 后，避免提前关闭已受理业务发送终态所需的通信连接。
- 终态：等待所有并行任务 settle，再回收 fork，释放权限协调器，销毁托盘。
  阶段 completed 表示等待已结束，不保证每项业务成功；失败保留单项 failed 日志。
- 重复调用：沿用 stopPromise，同一退出过程只执行一轮；不改变服务自身批量防重。
- 失败范围：每项按原 catch 记录错误；Promise.allSettled 防止某个任务或其日志函数
  异常导致提前回收其他任务所需资源。hosts 的取消/未知写入结果不自动重放。
- 服务交互：服务内部继续共用首表并行停止，退出 kill 不增加结果查询；数据库确认
  策略不变。启动组的串行启动/停止和 UI/MCP 单独服务操作不受此调整影响。
- 生命周期检查：复核迟到启动登记、关门前 hosts 写入、单项拒绝、UAC 取消、退出防重、
  fork/权限资源释放顺序；本次只做静态检查，不新增/运行测试或真实服务操作。

## 全部退出操作与依赖

| 操作 | 当前处理 | 依赖或说明 |
| --- | --- | --- |
| 窗口退出标记 | 同步 | 防止窗口关闭流程重入；保留窗口供既有授权收尾使用 |
| Windows 权限 beginShutdown | 同步 | 取消未完成首次选择，已选方式仍可处理必要清理 |
| 服务与 fork 接口关门 | 同步 | 禁止退出过程中提交新的普通服务/hosts 操作 |
| service-drain | 等待 | 必须先完成迟到的 PID 登记及完整终态消费者 |
| fork-drain | 在 service-drain 后等待 | 等消费者可能继续派发的原始请求，防止 hosts 清理后又被旧请求写回 |
| 快捷键注销 | 同步 | 不含异步等待，逐项 catch 保留 |
| 屏幕监听销毁 | 同步 | 清理事件监听及 debounce timer |
| SiteSucker 销毁 | 同步 | 停止既有下载/抓取任务、窗口及状态，不提前加载未使用模块 |
| OAuth 取消 | 同步 | 标记取消并关闭回调 HTTP 服务 |
| PTY 清理 | 同步 | 对已加载 PTY runtime 清理终端，不等待新增外部进程 |
| Capturer 清理 | 同步 | 停止捕获状态与窗口通知 |
| 静态 HTTP stopAll | 并行组 | 与服务和 hosts 无相互依赖；原接口只是发起 server.close，未新增关闭确认 |
| MCP stopLoaded | 并行组 | 关闭已加载服务器与连接；服务/fork 门禁已关闭，不再接纳新业务 |
| ServiceProcessManager.stop | 并行组 | 使用最终服务登记和批次首表，内部各实例已经并行 |
| ServerManager.cleanHosts | 并行组 | drain 后无旧站点请求继续写入；由 main 直接操作系统文件，不依赖服务退出或 fork 回收 |
| hosts 读取、写入、DNS 启动 | 保留顺序 | 必须先读取和写入成功，才尝试 DNS 刷新；无变更不写入、不申请 UAC |
| DNS 刷新 | 仅等待 spawn | 附加动作，不等待退出码，失败不覆盖 hosts 已写入结果 |
| fork destroy | 并行组全部结算后 | 服务仍需 worker；同时保留 EnvSync provider 到 hosts 收尾结束 |
| 权限协调器 dispose | 并行组及 fork 回收之后 | hosts 或服务仍可能需要租约；不能因 hosts 提前完成就撤销其他清理的权限 |
| 托盘销毁 | 最终同步收尾 | 不含可缩短等待的异步任务 |

## 调整后的链路

1. 设置退出标记，关闭权限首次选择、服务请求和 fork 请求入口。
2. service-drain → fork-drain，等待关门前请求及其消费者结算。
3. 按原逻辑执行快捷键、屏幕、SiteSucker、OAuth、PTY、Capturer 的同步清理。
4. 同时启动 HTTP 关闭、MCP 关闭、服务批量停止、hosts 清理，等待四项全部 settle。
5. 回收 fork（包含版本缓存落盘、EnvSync provider 释放和 worker 销毁）。
6. 最后释放权限协调器、销毁托盘，记录 quit.returned；Launcher 继续实际退出。

## 退出时的 UI IPC 边界（2026-10-07）

- 复用 WindowManager.willQuit 作为唯一退出标记；Application.doStop 在首次 await
  前设置它，app.quit、菜单退出及 relaunch 共用现有退出流程，无新增状态或配置。
- IPCHandler 的 command/event 入口在触发业务监听器前拒绝新 UI 请求；窗口统一
  sendCommandTo 在退出时停止回包，AppNodeFn 直接发送的旧回调同步解除窗口目标。
- 已接纳请求的 main/fork 终态消费者继续完成 PID 登记和 drain，随后仍按原契约
  停服务与清理 hosts；UI 通知是附加动作，停止发送不能跳过必要清理或改变其结果。
- 重复退出仍复用 stopPromise；TrayManager 对销毁后的显示调用安全返回，destroy
  即使重复执行也先取消弹窗布局等待与定时器，再检查原生托盘是否已销毁。
- 回归覆盖退出入口拦截、迟到异步回包、迟到启动 PID 登记、首次 drain 前关闭入口、
  退出防重及托盘生命周期；未进行真实系统服务退出或 macOS 发布包验收。

## 修改文件

- src/main/Application.ts：将原四个串行 await 放入同一组 Promise.allSettled；保留
  逐项 catch、计时、hosts 诊断/交互上下文；把 fork 回收和权限 dispose 放在组后。
- src/main/core/ServerManager.ts：修正 stopServer/cleanHosts 的调用顺序注释。
- src/main/core/WindowsPrivilegeCoordinator.ts：修正退出阶段资源保留期限的注释。
- 相关历史说明补充当前链路引用，避免旧的串行顺序被误认为当前行为。

## 耗时预期与边界

服务和 hosts 不再相加，退出耗时主要取决于并行组中耗时最长的任务。按上一份日志，
可重叠约 4 秒，但并发启动 PowerShell、worker 和 UAC 会影响实际用时，不能把历史
串行时间当成新流程实测值。UAC 确认仍需要用户完成；等待旧请求、数据库确认以及
资源回收仍受各自原有约定约束。

## 静态复查与验证记录

已核对 UI/MCP 请求的关门行为、生命周期消费者的后续派发、原始 fork 请求跟踪、
Host.writeHosts 的写入终态、main 的文件执行入口、数据库确认以及权限租约释放。
两层 drain 继续由原有超时机制收口未知请求；未知副作用不宣称已撤销，也不重放。

三个修改的 TypeScript 文件语法解析无诊断，相关 diff 空白检查通过。没有新增/运行
测试、构建、完整类型检查、格式工具或真实系统操作。并行后实际耗时与 UAC 显示时机
需通过下一份实机日志确认；静态检查不能证明新流程已经实机通过。
