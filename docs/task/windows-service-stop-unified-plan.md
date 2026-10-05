# 服务停止统一入口与批次缓存实施计划

## 授权范围与操作契约

用户已要求实施：统一调用 ProcessKillStrict、移除 Windows 无条件 Helper 分支、兼容 UAC、批量共用同一批次初始列表。沿用已讨论的退出策略：强制停止在应用退出时不再全量查询，数据库原生关闭仍确认。

2026-10-04 用户进一步明确：FlyEnv Windows 服务均以当前账户权限启动，服务停止只需普通权限，不需要 UAC/Helper 恢复。本条取代此前停止失败后走权限恢复的安排；其他受保护文件、系统 PATH 等授权操作不属于服务 kill。本轮仅修改公共执行器、移除其无用权限上下文、保留初始身份校验并更新文档；不新增 renderer 状态、IPC 或模块工作流，错误仍由原模块与批次结算。

同日用户要求执行时不要重复校验已选 PID：删除 ProcessKillStrict 内的范围/数量检查与 stopWindowsSnapshotWithIdentity；删除执行层创建时间、路径、快照字段和启动证明二次检查。归属/启动身份继续由模块发现阶段筛选，公共执行器仅去重、排序、一次 taskkill、日志及原有命令结果处理。ServiceStop、Base、ServiceProcessIdentity 同步移除多余证明参数；批次与结果确认策略保持此前约定。

随后用户指出建树已有顺序：进一步删除 stopWindowsServiceSnapshot 的深度排序、根压缩与 executeProcessKill 转发层，ProcessKillStrict 直接按传入顺序去重、记录日志和执行命令；ServiceStop 不再传入列表给 kill。建树的父先子后顺序、批次快照、候选筛选和退出确认仍由原步骤负责，本次不增加状态或工作流。

主进程 ServiceProcess/ForkManager 在并行派发前取一次列表，fork 模块拥有服务归属、进程目标和附属服务顺序。表随 stopService 可选参数一次传入，调用范围隔离并发，局部引用随终态自然释放，不再登记批次或按 ID 请求列表。已有停止 flight 处理重复调用。进度不是终态，错误逐实例隔离；不新增 renderer 状态、配置或 Pinia。

## 实施顺序

### 2026-10-04 补齐派发前后与退出清理日志（用户已要求）

操作所有者仍为 main 的 ForkManager/ForkItem、fork dispatcher/服务模块及 Application
退出流程。本轮只记录现有操作：用原 requestKey 关联发送、收命令、模块解析/初始化、
停止调用及终态；worker 创建/spawn/入口就绪记录自身 PID。Application 的已有退出
flight 继续防重，hosts 写入及 DNS 刷新保留原顺序/授权/失败语义，记录独立阶段与耗时。
不新增 renderer 状态、批次登记、业务参数、系统查询或 IPC 往返，不修改服务目标。
日志失败不得影响业务；新边界日志不 await 磁盘写入，源时间在事件发生时采样。
实机观察场景为冷/热 worker、多版本并行停止、进度/终态、初始化失败、hosts 无变化、
写入失败/UAC 取消与 DNS 失败；本轮仅源码复核，不新增或运行测试。

- [x] 补齐发送/接收/模块解析/同步初始化/停止终态日志，用原 requestKey 关联。
- [x] 补齐 worker 创建、spawn、入口就绪及退出/退休日志，不新增确认 IPC。
- [x] 退出已有等待步骤计时，hosts 写入/DNS 刷新明确命名，并关联 quitId/stopId。
- [x] 七个源码文件语法复核；详细说明见 windows-service-stop-dispatch-diagnostics.md。

### 本次简化：快照直接作为停止参数传入（用户已批准）

主进程在并行派发前获取一次列表，并将 `{ processList, reason }` 随停止请求发送。
统一在 fork dispatcher 将可选停止参数插入 `stopService` 第二个位置，原模块业务参数
顺延；普通 Base、MySQL 分组、语言项目、自定义服务、隧道和 DNS 的覆盖入口同步处理。
模块在本次调用的异步范围内使用该参数；StopProcessListFetch 直接读随请求传入的表，
内层 companion 也共用它。范围由调用持有，不新增全局状态、配置、Pinia 或 renderer 工作流。
插件保留既有业务签名，在 dispatcher 绑定同样的请求范围，避免破坏外部覆盖方法。
调用兼容复核发现插件 bundle 会内联另一份公共上下文；同一进程通过固定 Symbol
复用 AsyncLocalStorage 容器，仍由各请求独立持有值，不增加全局批次表或 IPC。
旧已安装插件仍按原签名执行其内联实现，重新构建后才能获得首表复用；外部自定义
停止方法不强制改签名。仅静态源码复核，不新增或运行测试。
进度/终态、停止 flight、原生数据库关闭、退出确认和逐项失败隔离沿用现有链路。

- [x] 删除批次 Map、batchId、开始/结束登记和批次取表 IPC 字段。
- [x] 主进程将完整列表随原 stopService 消息发送；公共/特殊入口使用统一可选参数。
- [x] 单独停止继续走 650ms/in-flight 缓存；确认结果仍读新表；空列表直接使用不回查。
- [x] 补齐注释，完整当前说明见 windows-service-stop-direct-snapshot.md；源码/语法复核，不新增或运行测试。

- [x] ProcessKillStrict 普通 Windows 使用完整系统 taskkill 路径和 execFile 参数数组；一次命令传全部 PID，无 /T。仅全部目标明确已退出时接受非零结果，其他错误直接传播，不重放 PowerShell 或请求 UAC/Helper。
- [x] 原服务树公开入口移除，排序/身份准备收为内部步骤；UAC 一次动作执行 taskkill，Go 有序集合一次请求连续 TerminateProcess，取消逐 PID 阻塞等待，Go/TS 发布版本同步升级为 35。
- [x] 移除上述早期执行身份准备和启动证明重复比较；只保留已有表中的父先子后排序/诊断，避免单个字段不可用阻断完整 PID 集合。命令非零后的 Node 零信号探测保留，非执行前校验。
- [x] 再移除执行前重复排序和列表参数；服务收集时的父先子后列表原序传入 ProcessKillStrict，命令顺序日志继续记录。仅源码复核，不运行停止测试。
- [x] 主进程取一次快照随停止请求直接传入，取表 IPC 只服务普通短缓存；已删除 batchId、Map 与登记/释放协议。fork 的异步范围只绑定已传入值。
- [x] Redis Commander/DbGate 首次停止发现接入共享快照，活性/停止确认仍使用新查询。退出强制停止跳过额外全量确认；PID 文件根据命令成功结果清理，不伪造最终系统列表。
- [x] 逐文件原因、完整链路及边界见 windows-service-stop-unified-execution.md。仅源代码复核，不新增/运行测试、构建或格式工具。

## 后续实机验证场景（本轮不执行）

首表随请求发送、跨 TTL/晚派发不再取表；两个并发请求不混表；空列表不回查；MySQL group、语言标记/身份、插件旧签名正常；初始查询失败不派发；中文路径/无 PATH 的 taskkill 启动；普通成功、全部已退出的幂等成功、权限不足/启动失败/超时直接失败且没有授权弹窗；PHP 多版本、数据库原生退出、附属进程、启动组串行与 UI/MCP 普通停止。
