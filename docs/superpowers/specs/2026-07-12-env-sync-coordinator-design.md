# 跨 Fork 运行环境同步设计

日期：2026-07-12

## 背景

`src/shared/EnvSync.ts` 当前通过进程内单例缓存系统运行环境：

- Windows 执行内联 PowerShell，读取 Machine 和 User 环境变量并计算可用的 `PATH`、`CMDPath`、`PowerShellPath` 和 `SystemPath`。
- macOS/Linux 使用 `shell-env` 获取登录 shell 环境，再补充 FlyEnv 需要的常用路径。
- 成功结果保存在当前 Node.js 进程的 `AppEnv` 等字段中。

该缓存只能在单个进程内生效。启动组并发启动多个服务时，`ForkManager` 会将任务分配给多个 UtilityProcess，每个 Fork 都有独立的 `EnvSync` 实例，因此会重复执行 PowerShell 或 `shell-env`。同一个 Fork 内同时进入 `sync()` 时，也可能在 `AppEnv` 写入之前重复执行本地加载。

项目已经通过 Main Bridge、Fork Client 和 Main 内存缓存解决了服务停止阶段的跨 Fork 进程列表重复查询。运行环境同步适合采用相同的进程边界，但还需要处理环境修改后的全局失效、Windows 派生路径同步以及加载期间发生失效的竞态。

## 目标

1. Main 进程成为应用内唯一的正常环境加载执行者。
2. 同一缓存窗口内的多个 Fork 和 Main 调用方共享同一份环境快照。
3. 并发缓存 miss 共用同一个正在执行的加载 Promise。
4. 快照在成功获取后固定五分钟过期，访问缓存不延长过期时间。
5. 任意进程调用 `EnvSync.clean()` 时，使 Main 和全部 Fork 的环境快照失效。
6. 失效期间正在执行的旧环境查询不能回灌缓存或返回给失效后的调用方。
7. 保持现有 `EnvSync.sync()`、`EnvSync.clean()` 和公共字段的调用方式基本兼容。
8. Main IPC 不可用时允许 Fork 本地降级，环境同步优化不能阻断服务启动或命令执行。
9. 环境快照只保存在内存中，不将可能包含敏感信息的完整环境变量写入日志或磁盘。

## 非目标

- 不引入文件锁、共享内存、数据库或外部缓存服务。
- 不持久化环境快照到 `electron-store`。
- 不改变服务启动命令、shell 选择、代理配置格式或 PATH 拼接规则。
- 不保证已经开始执行的命令会在并发 `clean()` 后切换到新环境。
- 不在本次工作中重构所有直接读取 `EnvSync.AppEnv` 的业务代码；调用方仍应在需要新环境前调用 `sync()`。

## 已确认约束

- 采用 Main 进程集中协调方案。
- `EnvSync.clean()` 是全局失效操作，不再只清理当前进程。
- Fork 收到 Main 失效广播后立即清除本地快照。
- Main 正常路径失败时允许 Fork 执行本地环境加载。
- 缓存 TTL 从成功获取时间开始固定计算，不采用滑动过期。
- 系统代理作为动态覆盖层应用，不纳入共享基础环境快照的缓存身份。

## 方案对比

### 方案 A：Main 进程集中协调，Fork 按需请求

Main 保存环境快照、`inFlight` 和全局 revision。Fork 通过 UtilityProcess IPC 获取或失效快照。

优点：

- 能覆盖启动组、普通服务命令、Main NodePTY 和其他环境调用。
- 可复用现有 StopProcessList 与 BinVersionCache 的通信模式。
- 不需要将环境变量写入磁盘。
- 可以在一个位置完整处理 TTL、并发合并和失效竞态。

缺点：

- 需要新增 IPC 请求、响应和广播消息。
- Fork 本地缓存必须与 Main revision 保持一致。

### 方案 B：文件锁与临时环境快照

第一个进程获取文件锁并写入快照，其他进程读取文件。

优点：

- 不依赖 UtilityProcess 反向 IPC。

缺点：

- 环境变量可能包含 token、密码和代理凭据，不适合落盘。
- 需要处理锁残留、进程崩溃、文件权限、原子替换和版本兼容。
- Main 与 Fork 仍需额外的主动失效通知。

### 方案 C：启动组预取并向任务参数注入快照

启动组开始前获取一次环境快照，再作为任务上下文发送给每个 Fork。

优点：

- 能直接减少启动组中的重复加载。

缺点：

- 只覆盖启动组，其他并发 Fork 仍会重复执行。
- 污染现有模块命令参数边界。
- 无法自然处理任务执行期间的 `clean()`。

## 推荐方案

采用方案 A：Main 进程集中协调，Fork 按需请求。

## 环境快照

共享快照结构为：

```ts
export type EnvSyncSnapshot = {
  revision: number
  env: Record<string, string>
  cmdPath?: string
  powerShellPath?: string
  systemPath?: string
  fetchedAt: number
  expiresAt: number
}
```

字段语义：

- `revision`：Main 中当前环境世代。每次全局失效严格增加。
- `env`：不包含 `undefined` 的基础系统环境变量。
- `cmdPath`、`powerShellPath`、`systemPath`：Windows 环境加载时计算出的派生路径；非 Windows 可以省略。
- `fetchedAt`：Main 成功完成本地加载的时间。
- `expiresAt`：`fetchedAt + 5 分钟`，Fork 不得自行延长。

基础快照不主动合并 `global.Server.Proxy`。Main 和 Fork 在将快照应用到当前进程的 `AppEnv` 时，再使用当前进程收到的最新 `global.Server.Proxy` 覆盖基础环境。这样代理设置变化不会依赖五分钟快照过期。

IPC 使用 Electron UtilityProcess 的结构化克隆传输快照。构建快照时过滤值为 `undefined` 的环境项，并将其余值标准化为字符串。

## 架构与组件

### 1. 共享协议 `EnvSyncProtocol`

新增 `src/shared/EnvSyncProtocol.ts`，定义快照、请求响应类型和类型守卫。协议消息为：

```ts
type EnvSyncGetRequest = {
  type: 'env-sync-get'
  requestId: string
}

type EnvSyncGetResponse = {
  type: 'env-sync-get-response'
  requestId: string
  snapshot?: EnvSyncSnapshot
  error?: string
}

type EnvSyncInvalidateRequest = {
  type: 'env-sync-invalidate'
  requestId: string
}

type EnvSyncInvalidateResponse = {
  type: 'env-sync-invalidate-response'
  requestId: string
  revision?: number
  error?: string
}

type EnvSyncInvalidated = {
  type: 'env-sync-invalidated'
  revision: number
}
```

get 与 invalidate 都需要响应。invalidate 响应是 `clean()` 与后续 `sync()` 之间的顺序屏障；广播负责清除其他 Fork 的本地快照。

### 2. 本地环境加载与 `EnvSync` 访问层

修改 `src/shared/EnvSync.ts`，将职责分成两层：

1. 无共享缓存的本地加载函数，执行当前 PowerShell 或 `shell-env` 逻辑并返回基础环境与 Windows 派生路径。
2. 保持现有默认导出形式的 `EnvSync` 访问层，负责 provider、本地字段、当前快照和本进程 `inFlight`。

provider 接口为：

```ts
type EnvSyncProvider = {
  get(): Promise<EnvSyncSnapshot>
  invalidate(): Promise<number>
}
```

访问层行为：

- 有有效本地快照时，重新应用最新代理覆盖后返回 `AppEnv`。
- 本地快照过期时调用 provider.get()。
- 同一进程中的并发 `sync()` 共用一个 `inFlight`。
- 没有 provider 或 provider 请求失败时，调用无共享缓存的本地加载函数。
- IPC 失败产生的本地降级快照最多缓存五秒，之后重新尝试 provider。
- 应用快照时同时更新 `AppEnv`、`CMDPath`、`PowerShellPath` 和 `SystemPath`。
- 快照 revision 低于本地已知最小 revision 时丢弃并重新请求。

本地降级结果使用访问层内部的 `local-fallback` 标记，不伪造或推进 Main 的权威 revision。它只能在五秒降级窗口内满足当前进程调用；窗口结束后必须重新尝试 provider。

Main 和 Fork 都使用相同访问层。Main 在 `ForkManager` 初始化时将 Main Coordinator 注册为 provider，因此 NodePTY 等 Main 调用方与 Fork 共用同一份快照。

### 3. Main `EnvSyncCoordinator`

新增 `src/main/core/EnvSyncCoordinator.ts`，负责：

- 调用无共享缓存的本地环境加载函数。
- 保存最后一次成功的 `EnvSyncSnapshot`。
- 保存当前 `revision`，初始值为 0。
- 保存与当前 revision 绑定的 `inFlight` Promise。
- 支持失效事件订阅，让 ForkManager 清理 Main 本地访问层并广播给全部 Fork。
- 记录不包含具体环境键值的缓存事件。

`get()` 规则：

1. 缓存存在且当前时间小于 `expiresAt` 时直接返回。
2. 当前 revision 已有查询执行时返回同一个 Promise。
3. 否则记录查询开始 revision，并把 `{ revision, promise }` 作为当前 `inFlight` 后执行一次本地加载。
4. 加载成功且 revision 未变化时生成并缓存快照。
5. 加载完成时 revision 已变化，则丢弃结果并重新进入 `get()`，加入新 revision 的查询。
6. 加载失败时不写缓存，并在 `finally` 中仅当字段仍指向当前 Promise 时清除对应 `inFlight`，防止旧 revision 查询误删新 revision 查询。

`invalidate()` 规则：

1. `revision += 1`。
2. 清除已有快照。
3. 旧 revision 的 `inFlight` 可以自然完成，但结果不得写入缓存或返回给等待者。
4. 通知所有订阅者新的 revision。
5. 返回新的 revision 作为 invalidate 响应。

### 4. Main `EnvSyncBridge`

新增 `src/main/core/EnvSyncBridge.ts`，在普通 Fork 任务消息处理前识别 EnvSync 协议：

- get 请求调用 Coordinator.get()，把快照或错误返回原 UtilityProcess。
- invalidate 请求调用 Coordinator.invalidate()，把 revision 或错误返回原 UtilityProcess。
- 其他消息返回未处理，由 StopProcessListBridge、BinVersionCacheBridge 和现有任务回调继续处理。

所有 `ForkItem` 共享同一个 Coordinator 和 Bridge。

### 5. Fork `EnvSyncClient`

新增 `src/fork/EnvSyncClient.ts`，负责：

- 为 get 和 invalidate 请求生成唯一 `requestId`。
- 分别保存等待中的 get 与 invalidate Promise。
- 使用 10 秒安全超时，避免 Main 异常导致 Fork 永久等待，同时允许 Windows PowerShell 环境查询有足够时间完成。
- 根据 response 的 `requestId` 解决或拒绝 Promise。
- 接收 `env-sync-invalidated` 广播，更新最小 revision 并通知 `EnvSync` 访问层清除本地字段。
- 安全忽略已经超时的迟到响应。

Fork 入口在将 Main 消息转发给 `BaseManager.exec()` 之前，让 EnvSyncClient 优先处理协议响应和广播。这些消息不能进入模块命令分发器。

### 6. ForkManager 广播

扩展 `src/main/core/ForkManager.ts`：

- 持有唯一 EnvSyncCoordinator 和 EnvSyncBridge。
- 在 Coordinator 失效事件中清理 Main 的本地 EnvSync 快照。
- 将 `env-sync-invalidated` 发送给所有仍存活的普通 Fork、FTP Fork、DNS Fork 和 Ollama Chat Fork。
- 使用 Set 对 ForkItem 去重，单个 UtilityProcess 最多收到一次广播。
- UtilityProcess 已退出或 postMessage 失败时忽略该发送错误，不影响其他 Fork。

新创建的 Fork 不需要补发历史广播。它没有旧本地快照，第一次 `sync()` 会从 Coordinator 获取当前 revision。

Coordinator 订阅和 Fork 广播处理必须调用访问层内部的 `clearLocal(revision)`，不能调用公共 `clean()`。`clearLocal()` 只清除当前进程字段并提高本地最小 revision，不发送 invalidate 请求，从而避免失效广播形成递归循环。

## 正常数据流

```text
Main NodePTY ──────────────┐
Fork A EnvSync.sync() ────┼─> EnvSyncCoordinator.get()
Fork B EnvSync.sync() ────┤            │
Fork C EnvSync.sync() ────┘            ├─ fresh cache: 返回快照
                                       ├─ same-revision inFlight: 加入等待
                                       └─ miss: 执行一次 PowerShell/shell-env
```

一次加载在 `T0` 成功时：

- `fetchedAt = T0`。
- `expiresAt = T0 + 5 分钟`。
- `T0 + 5 分钟` 之前的调用使用同一快照。
- 访问缓存不修改 `expiresAt`。
- 到期后的第一个调用创建新查询，其余并发调用加入该查询。

## 全局失效数据流

```text
任意进程 EnvSync.clean()
  -> 立即清理当前进程本地字段
  -> provider.invalidate()
  -> Main revision + 1，清除共享快照
  -> Main 清理自身 EnvSync 本地快照
  -> Main 广播 env-sync-invalidated
  -> 所有 Fork 清理本地快照并记录最小 revision
  -> invalidate response 完成顺序屏障
  -> 后续 sync() 获取新 revision 的快照
```

`clean()` 保持对旧调用点兼容：

- 方法立即清理本地字段，并启动异步 invalidate。
- 内部保存 `invalidateInFlight`；同一进程的多次 clean 按 Promise 链串行发送，避免后发失效被先发请求的迟到响应覆盖。
- 随后的 `sync()` 必须先等待 `invalidateInFlight` 结束。
- 方法可以返回 `Promise<void>` 供新代码显式等待，但未 `await` 的旧代码仍通过内部屏障获得正确顺序。
- invalidate IPC 失败不让 `clean()` 对业务抛错；错误记录后，后续 `sync()` 按 provider 请求或本地降级规则继续。

## 竞态语义

### 加载期间失效

假设 revision 4 的查询正在执行，此时调用 `clean()`：

1. Main 将 revision 增加到 5 并清除快照。
2. revision 4 的查询完成后发现世代不匹配。
3. 旧结果不写缓存，也不返回给原等待者。
4. 原等待者重新进入 Coordinator.get()，创建或加入 revision 5 的查询。
5. 所有等待者最终收到 revision 5 的快照。

### 多次并发失效

每次 invalidate 都严格增加 revision。响应或广播乱序时，Main 和 Fork 只接受更大的 revision；较小 revision 的迟到消息不会降低本地最小 revision。

### 已经开始的命令

失效不会修改已经传给 child_process、node-pty 或服务进程的 env。保证边界为：invalidate 顺序屏障完成后开始的 `sync()` 必须返回新 revision。

## 直接状态修改清理

实施时应搜索直接修改以下字段的调用点：

- `EnvSync.AppEnv = undefined`
- `EnvSync.CMDPath = undefined`
- `EnvSync.PowerShellPath = undefined`
- `EnvSync.SystemPath = undefined`

这些调用必须替换为统一的 `EnvSync.clean()` 或内部专用的 `clearLocal(revision)`。业务模块不能绕过 Coordinator 只清理单个 Fork。

已知 `src/fork/module/Tool/path.ts` 在更新 PATH 后直接清理 `AppEnv`，应改为全局 clean。现有 Git 检测、AI CLI 检测、Windows Helper fallback 和 Main exec 调用可以保留 `clean()` 形式，由内部屏障提供兼容。

## 错误处理与降级

### Main 本地加载失败

- 当前共享 `inFlight` 的所有请求收到错误。
- 不缓存失败或空的异常占位结果。
- 清除 `inFlight`，下一次请求可以重新加载。
- Windows 当前能够回退到 `process.env` 的行为保持不变；该结果属于一次成功的本地加载。

### Fork get 请求失败或超时

- 删除 pending 请求。
- 执行当前 Fork 的本地环境加载。
- 同一个 Fork 的并发降级调用共用本地 `inFlight`。
- 降级结果最多缓存五秒，防止 Main 短暂异常时每条命令都重复执行，同时尽快恢复共享路径。
- Main 后续到达的迟到响应被忽略。

### Fork invalidate 请求失败或超时

- 当前 Fork 已经清除本地字段。
- invalidate 屏障以已处理错误的状态结束，不向业务抛出。
- 后续 `sync()` 先尝试 Main get；失败时执行本地降级。
- 无法保证 Main 不可达期间其他 Fork 同时失效，因此记录降级事件用于诊断。

### 广播失败

- 单个 UtilityProcess 的 postMessage 失败不阻断 Coordinator.invalidate()。
- 仍存活但漏掉广播的 Fork 在本地快照到期后会重新请求 Main。
- 正常路径下 UtilityProcess 通信可用，广播提供即时全局失效。

## 可观测性

调试事件只记录元数据：

- `hit`
- `miss`
- `join`
- `fetch-success`：耗时、环境变量数量、revision
- `fetch-error`：耗时、错误字符串、revision
- `invalidate`：新 revision
- `client-timeout`
- `local-fallback`
- `broadcast-failure`

日志不得输出完整环境对象、具体变量值、代理凭据或 PATH 内容。

## 实施范围

预计新增：

- `src/shared/EnvSyncProtocol.ts`
- `src/main/core/EnvSyncCoordinator.ts`
- `src/main/core/EnvSyncBridge.ts`
- `src/fork/EnvSyncClient.ts`
- `scripts/env-sync-coordinator-test.ts`

预计修改：

- `src/shared/EnvSync.ts`
- `src/main/core/ForkManager.ts`
- `src/fork/index.ts`
- `src/fork/module/Tool/path.ts`
- `package.json`

如实现中发现其他直接清理 EnvSync 公共字段的调用点，只进行统一失效接口替换，不做无关模块重构。

## 测试策略

### Coordinator 单元行为

1. 二十个并发 cache miss 只调用一次本地加载。
2. 查询进行期间的请求获得同一个最终快照。
3. 成功后五分钟内命中缓存且不延长过期时间。
4. 到期时第一个请求重新加载，其余请求加入新 `inFlight`。
5. 加载失败后不写缓存，下一次请求可以重试。
6. 成功获得空环境对象时仍按成功快照处理。
7. invalidate 清除缓存并严格增加 revision。
8. 加载期间 invalidate 时，旧结果不写缓存且等待者最终获得新 revision。
9. 多次失效消息乱序时只接受最大 revision。

### EnvSync 访问层

1. 快照正确设置 `AppEnv` 和三个 Windows 路径字段。
2. 当前 `global.Server.Proxy` 在每次应用快照时覆盖基础环境。
3. 同一进程并发 `sync()` 只调用一次 provider。
4. `clean()` 立即清理本地字段。
5. 未 await 的 `clean()` 后紧接 `sync()` 仍等待 invalidate 屏障。
6. 低于本地最小 revision 的快照被拒绝并重新请求。
7. provider 失败时本地加载只执行一次。
8. 本地降级快照五秒后重新尝试 provider。

### IPC 与广播

1. get 和 invalidate 响应按 requestId 正确匹配。
2. EnvSync 协议消息不进入 `BaseManager.exec()`。
3. 超时请求从 pending Map 中移除。
4. 迟到响应被安全忽略。
5. Main invalidate 后所有已存活 Fork 收到广播。
6. 普通 Fork、FTP、DNS 和 Ollama Fork 都在广播集合中。
7. 同一个 ForkItem 不会收到重复广播。
8. 新建 Fork 第一次 get 能获得当前 revision。

### 启动组回归

构造多个模拟 Fork 同时执行环境同步：

1. 同一批启动组任务只触发一次 Main 本地加载。
2. 所有模拟 Fork 获得相同 revision 和快照内容。
3. 某个 Fork clean 后，下一批任务只触发一次新加载。
4. 失效发生在第一批查询期间时，所有任务获得失效后的 revision。

### 现有回归命令

新增：

```bash
yarn test:env-sync-coordinator
```

同时运行：

```bash
yarn test:startup-groups
yarn test:stop-process-list-cache
yarn test:bin-version-cache
```

## 验收标准

1. 同一五分钟缓存窗口内，启动组无论使用多少 UtilityProcess，底层 PowerShell 或 `shell-env` 最多执行一次。
2. Main NodePTY 与 Fork 服务命令共享同一个 Coordinator 快照。
3. 同一个 Fork 内的并发 `sync()` 不会重复发起 IPC 或本地加载。
4. 所有正常响应包含一致的环境、Windows 派生路径和 revision。
5. 任意进程调用 `clean()` 后，Main 和所有可通信 Fork 的后续 `sync()` 获得更高 revision。
6. 失效期间完成的旧加载结果不会回灌缓存或返回给等待者。
7. 共享路径异常时 Fork 能本地降级，服务启动和命令执行不因缓存机制阻断。
8. 环境快照不落盘，调试日志不包含完整环境变量或敏感值。
9. 现有启动组、停止进程列表缓存和 bin 版本缓存测试继续通过。
