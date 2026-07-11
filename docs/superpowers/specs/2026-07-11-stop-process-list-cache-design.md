# 服务停止进程列表缓存设计

日期：2026-07-11

## 背景

服务版本启动时会先调用停止逻辑，确保旧进程被清理。当群组启动或多版本启动在短时间内并发发生时，`ForkManager` 可能将任务分配到多个 UtilityProcess。每个停止阶段都会独立获取完整系统进程列表：

- macOS/Linux 执行 `ps axo user,pid,ppid,command`。
- Windows 通过 Helper 或 PowerShell 执行 `Get-CimInstance Win32_Process`。

同一批并行停止在时间上看到的进程状态基本一致，重复的全量枚举不会提供有意义的额外信息，尤其在 Windows 上会带来明显的时间和资源开销。

## 目标

1. 将服务停止使用的进程列表缓存统一放在主进程。
2. 多个 Fork 在短时间内停止服务时共享同一份进程快照。
3. 缓存在获取完成后固定 350ms 过期。
4. 并发缓存 miss 共用同一个正在执行的获取任务。
5. 不因服务 kill、stop 完成或 start 完成主动清除缓存。
6. 缓存只用于服务停止阶段，不改变其他进程查询的实时语义。
7. 主进程缓存不可用时，停止服务仍能回退到当前 Fork 本地查询。

## 非目标

- 不引入文件缓存、共享内存或外部缓存服务。
- 不更改服务启动、停止、信号选择或 PID 归属校验逻辑。
- 不将普通 `ProcessListFetch()`、进程工具页、端口工具或服务状态检查改为缓存读取。
- 不保证一个完整群组生命周期只查询一次。两次停止查询相隔超过 350ms 时应重新获取。

## 方案对比

### 方案 A：主进程预先向每个启停任务注入进程快照

`IPCHandler` 在收到 `startService` 或 `stopService` 时先获取主进程缓存，然后将快照作为任务上下文发送给 Fork。

优点：

- Fork 不需要反向请求主进程。

缺点：

- 任务尚未进入停止阶段就会发生进程查询。
- 需要向任务命令注入额外上下文，容易影响已有的模块参数。
- 对不使用进程列表的停止实现也会提前获取快照。

### 方案 B：Fork 停止阶段按需请求主进程缓存

仅在停止代码实际需要进程列表时，Fork 才通过 UtilityProcess IPC 请求主进程。

优点：

- 作用域与停止阶段完全一致。
- 不改变现有服务方法的参数形式。
- 不需要查询的停止实现不产生额外开销。
- 后续可以独立替换主进程内的原始进程查询实现。

缺点：

- 需要在现有主进程与 UtilityProcess 通信上增加一类请求/响应消息。

### 方案 C：Go Helper 内缓存

将 350ms 缓存放到 Go Helper 的 `ProcessList` 和 `ProcessListWin` 中。

优点：

- 多个 Fork 本来就通过 Helper socket 汇聚。

缺点：

- Helper 不可用或走 fallback 时无法共享缓存。
- 会改变 Helper 普通进程查询的实时语义，不符合“只在停止服务里使用缓存”的边界。
- 需要重新构建和发布各平台 Helper。

## 推荐方案

采用方案 B：Fork 停止阶段按需请求主进程缓存。

## 架构与组件

### 1. 主进程 `StopProcessListCache`

新增主进程服务，负责：

- 保存最后一次成功获取的标准化 `PItem[]`。
- 在获取成功时记录 `expiresAt = performance.now() + 350`。
- 缓存未过期时直接返回快照。
- 缓存过期但已有查询正在执行时，返回同一个 `inFlight` Promise。
- 查询失败时不写入缓存，并始终在 `finally` 中清理 `inFlight`。

不提供 kill 或 start 事件驱动的主动失效接口。

### 2. 原始进程查询

主进程缓存调用无缓存的原始查询实现：

- macOS/Linux 优先使用已有 Helper，不可用时执行 `ps axo user,pid,ppid,command`。
- Windows 优先使用 Helper，不可用时执行 `Get-CimInstance Win32_Process`。

Windows 的 Helper JSON 或 PowerShell JSON 在主进程中解析为 `PItem[]`。主进程缓存与 Fork 只交换统一结构，不传递平台原始文本。

为避免将查询失败误判为有效空列表，原始查询应有一个能够拒绝 Promise 的严格入口。成功获取的空列表可以缓存，执行或解析失败不应缓存。

### 3. UtilityProcess IPC 协议

在共享类型中定义两类消息：

```ts
type StopProcessListRequest = {
  type: 'stop-process-list-request'
  requestId: string
}

type StopProcessListResponse = {
  type: 'stop-process-list-response'
  requestId: string
  list?: PItem[]
  error?: string
}
```

`ForkItem.onMessage()` 在进入现有任务回调处理前识别 `stop-process-list-request`，调用主进程缓存，并通过发出请求的 UtilityProcess 返回响应。

Fork 入口在将主进程消息转发给 `BaseManager.exec()` 之前识别 `stop-process-list-response`，根据 `requestId` 解决或拒绝本地等待的 Promise。这类协议消息不进入模块命令分发器。

### 4. Fork 停止快照客户端

Fork 侧客户端负责：

- 为每个请求生成唯一 `requestId`。
- 保存本地 pending Promise 映射。
- 发送请求并处理对应响应。
- 对请求设置 10 秒超时，防止 UtilityProcess 在主进程异常时永久挂起，同时为 Windows 上较慢的 CIM 查询保留足够时间。
- 主进程返回错误或请求超时时，回退到当前 Fork 的无缓存本地查询。

回退可能导致当次停止重新执行系统查询，但它保证缓存优化不会成为停止服务的必要依赖。

### 5. 停止专用查询接口

保留现有通用接口的实时行为，新增语义明确的停止专用接口：

```ts
StopProcessListFetch(): Promise<PItem[]>
StopProcessPidList(): Promise<PItem[]>
StopProcessListSearch(search: string, caseSensitive?: boolean): Promise<PItem[]>
```

- `StopProcessListFetch()` 和 `StopProcessPidList()` 都返回主进程中的同一种标准化 `PItem[]`。
- 它们的命名区分现有 Unix 和 Windows 调用点，但底层可共享同一个 Fork 客户端。
- `StopProcessListSearch()` 先获取停止快照，再使用已有的纯搜索逻辑进行筛选，避免 `ProcessListSearch()` 在 Windows 上隐式重新查询。

不将缓存透明注入现有 `ProcessListFetch()` 或 `ProcessPidList()`，从而保证普通调用点不会意外使用 350ms 快照。

## 停止阶段边界

以下调用属于停止阶段，应使用停止专用查询：

- `Base.stopService()` 调用的 `_stopServer()`。
- `Base.startService()` 在 `_startServer()` 之前执行的 `_stopServer()`。
- 服务模块覆写的 `_stopServer()`。
- `ModuleCustomer.stopService()` 和 `LanguageProject.stopService()` 中的进程树获取。
- 停止流程内部为确认进程已退出而执行的进程查询。如果轮询间隔超过 350ms，下一轮自然会获取新快照。

以下调用不属于停止阶段，不使用缓存：

- `_startServer()` 中的进程发现或启动结果校验。
- 进程管理工具、端口管理工具和普通进程搜索。
- 与服务停止无关的后台状态检查。
- `ServiceStart` 等启动辅助逻辑中的进程查询。

## 数据流

1. Fork 内的停止实现调用停止专用查询。
2. Fork 客户端向所属 UtilityProcess 的主进程句柄发送请求。
3. `ForkItem` 转交请求给共享的 `StopProcessListCache`。
4. 缓存命中时直接返回；缓存 miss 时创建或复用 `inFlight`。
5. 主进程将标准化 `PItem[]` 返回请求 Fork。
6. Fork 继续使用已有 `ProcessOwnedPidsByPid`、`ProcessSearch`、`ProcessPidsByPid` 和 `ProcessKill` 逻辑。

## 缓存语义

假设一次原始查询在 `T0` 完成：

- `T0` 写入缓存。
- `T0 + 349ms` 内的停止请求使用该快照。
- `T0 + 350ms` 及之后到达的首个停止请求触发新的原始查询。
- 原始查询执行期间的所有停止请求共用当前 `inFlight`，不受查询本身耗时影响。
- kill、stop 结果、start 结果和服务运行状态变更均不修改 `expiresAt`。

缓存中的数组在主进程中按快照对待，不应被主进程调用方修改。UtilityProcess IPC 传递的是结构化克隆，各 Fork 可以在本地进行搜索和构造进程树。

## 错误处理

- 主进程原始查询失败：拒绝所有共享当前 `inFlight` 的请求，不写入缓存。
- Fork 收到主进程错误：执行当前平台的本地无缓存查询。
- Fork 请求超时：删除 pending 记录并执行本地回退。超时后到达的响应应被安全忽略。
- UtilityProcess 退出：拒绝该 Fork 的未完成请求，不影响主进程缓存。
- 缓存中有效空列表：按成功结果处理并缓存 350ms。

## 实施范围

预计涉及：

- 新增主进程停止进程列表缓存组件。
- 新增共享 IPC 消息类型。
- 扩展 `ForkItem` 对 Fork 反向请求的处理。
- 扩展 Fork 入口对主进程响应的分流。
- 新增 Fork 停止快照客户端和停止专用查询接口。
- 替换 `Base._stopServer()` 以及服务模块覆写停止方法中的进程列表获取。
- 替换 `ModuleCustomer.stopService()` 和 `LanguageProject.stopService()` 中的进程树查询。

实施时应按方法边界审查调用点，不能仅根据文件或函数名全局替换。同一模块可能在启动检查和停止逻辑中同时使用进程列表，只有停止路径应切换到新接口。

## 测试策略

### 主进程缓存行为

1. 十个并发 cache miss 只调用一次原始查询。
2. 查询进行期间的请求共用同一个 Promise。
3. 查询完成后第 349ms 的请求命中缓存。
4. 查询完成后第 350ms 及之后的请求重新查询。
5. 原始查询耗时不占用 350ms 有效期。
6. 查询失败后下一个请求能够重试。
7. 成功获取的空列表会缓存。
8. kill 或 start 事件不改变缓存有效期。

### IPC 与回退

1. 多个 UtilityProcess 能同时请求并共享同一主进程结果。
2. 请求与响应按 `requestId` 正确匹配。
3. 停止进程列响应不会被误传给 `BaseManager.exec()`。
4. 主进程返回错误时使用 Fork 本地查询。
5. 请求超时时使用 Fork 本地查询。
6. 超时后到达的迟到响应不会导致未处理异常。

### 作用域回归

1. `Base.startService()` 内部的预停止使用主进程缓存。
2. 显式 `stopService()` 使用主进程缓存。
3. `_startServer()` 中的进程查询保持实时。
4. 工具页和非停止调用保持实时。
5. PostgreSQL 等停止退出轮询在间隔超过 350ms 后会获取新快照。

## 可观测性

为了确认优化实际生效，调试日志应能区分：

- 原始进程列表获取次数。
- `inFlight` 合并次数。
- 350ms 缓存命中次数。
- 主进程请求失败和 Fork 本地回退次数。
- 原始查询耗时与返回进程数量。

这些日志不输出完整进程命令行，避免将可能包含敏感参数的进程信息写入日志。

## 验收标准

1. 一批在 350ms 缓存窗口内进入停止阶段的多版本服务，底层只执行一次全量进程列表获取。
2. 多个 UtilityProcess 能共享主进程缓存，不依赖请求是否落在同一 Fork。
3. 缓存不因 kill、stop 或 start 主动失效，仅按 350ms TTL 失效。
4. 只有停止阶段使用缓存，其他进程列表调用保持原有行为。
5. 主进程缓存或 IPC 异常不会阻断服务停止，Fork 本地查询回退可正常工作。
6. 现有 PID 归属校验、子进程树计算、停止信号和服务结果保持不变。
