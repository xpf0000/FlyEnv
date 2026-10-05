# 服务停止首表直接传参

## 1. 为什么修改

批量停止本来已在主进程派发前查询完整进程列表，再让 fork 按 batchId 请求同一表，
增加了 Map、登记/释放、请求/响应和批次失效处理。用户要求直接给 stopService 传表，
本轮按该方案删除批次取表协议。该文档描述当前实现，旧文档中的 batchId 取表为历史方案。

Windows kill 仍由 ProcessKillStrict 一次普通权限 taskkill 执行，原序去重；不重新排序、
校验身份、扩树或转发 UAC/Helper。进程归属及父先子后集合仍由模块首次列表筛选/建树负责。

## 2. 当前完整链路

1. ServiceProcess.stopRegisteredInstances 复制本轮运行登记、停止参数及代次；空集合立即返回。
2. 清除普通停止短缓存，调用 ForkManager.fetchStopProcessListSnapshot 一次。查询可与同一
   时段的普通请求共享 in-flight，但各服务不会分别发起查询。
3. 取得列表后保存在本轮局部变量中，构造 `{ processList, reason }`。列表查询失败时，
   不派发任何本轮停止命令，返回逐项失败并保留登记。
4. Promise.all 并行派发原模块 stopService；ForkItem 把列表/原因与原命令一起发送。
   本轮发送的是同一次采样的内容，跨进程 IPC 会复制数据，不是共享可变 JS 对象。
5. fork/index 解包，BaseManager 把可选停止参数统一插入内建 stopService 第二位置。
   原登记的业务参数保持原样，统一在 dispatcher 顺延，不修改 renderer 请求和 stopArgs。
6. stopService 在本次异步调用范围绑定传入参数。StopProcessListFetch 第一时间返回
   processList，不访问 provider、不发送取表 IPC、不受 650ms TTL 或模块加载延迟影响。
   companion 等内层调用自动复用同一列表；多个并行请求的参数互不覆盖。
7. 各模块筛选自己的根/后代，将已选 PID 集合原序传入 ProcessKillStrict。
8. 命令及模块终态按原链路返回；失败只影响该实例，成功按登记代次注销。本轮完成后
   不再调用 endBatch，局部表引用随调用生命周期释放；普通短缓存仍按原 TTL 管理。

## 3. 参数位置与兼容

| 内建入口 | fork 内实际参数 |
| --- | --- |
| Base 常规模块 | version、stopOptions、原扩展参数 |
| MySQL | version、stopOptions、原 group options |
| 语言项目 | pid、stopOptions、typeFlag、identity |
| 自定义服务 | pid、stopOptions、identity |
| Cloudflare Tunnel | item、stopOptions |
| DNS | 可选 version、stopOptions；只关闭 socket，不 kill 宿主 |

单独停止没有传表时，dispatcher 仍插入 undefined，确保原 MySQL group 等第二业务参数
不会被误读成停止参数。现有 PHP 计时脚本直接调用 stopService(version) 仍可使用。
插件 dispatcher 保留外部原有 stopService 参数签名，不插入参数；只绑定本次请求范围。
插件构建使用 bundle:true，会带入自己的公共代码副本；ServiceStopContext 因此通过固定
Symbol.for 在同一个 Node 进程中共用 AsyncLocalStorage 容器，使重新构建后使用公共取表
方法的插件也能读到传入表。共享的是隔离每次异步请求的容器，不是可被覆盖的全局首表。
Base 默认沿用现有调用范围；插件若继承 Base
但沿用旧签名传第二业务参数，Base 将它还原到 args，兼容内部继承转发及旧扩展参数。

已经安装的旧插件包不会因宿主更新而改变其内联代码：原签名和停止流程继续可调用，但
不会自动获得直接首表复用及新的退出策略，需重新构建插件包。自行实现 stopService 或
自行查询进程的插件同样保留原参数；只有读取公共停止上下文/取表工具才能复用该首表。
当前仓库 MailPit、Kafka 插件均继承 Base，没有覆写 stopService，重新构建即可接入。

已搜索 UI ModuleInstalledItem、MySQL 分组、语言项目、自定义服务、隧道、DNS、FTP、
MCP 单项/批量、主进程退出/插件停用及插件运行检查入口：这些入口仍发送原业务参数，
不应自行插入 undefined 或首表，否则 dispatcher 会重复插入。只有绕过 dispatcher 直接
调用内建方法时才使用新签名，例如 MySQL 直接调用为 stopService(version, undefined,
{ group })；仓库现有此类内部转发已核对，PHP 计时脚本的一参数调用无需调整。

AsyncLocalStorage 仅承载已经直接传入的参数及 reason，让 companion/诊断等深层调用共用，
不保存批次 ID、不管理表的缓存或生命周期、不触发额外查询。它防止同一 fork 多版本并行
操作相互覆盖；不能改为模块或 global.Server 上可被下一请求覆盖的属性。

## 4. 保留的查询与边界

- 单独停止未传表：原 main 650ms/in-flight 缓存及普通取表 IPC 保留；主通道失败可本地查询。
- 传入空数组：使用空数组本身，不退回 IPC 或本地查询，避免换成另一个采样时点。
- 初始表只用于发现：waitForServiceProcessExit 仍用 fetchStopProcessListLocal 查询真实新表。
- 应用退出强制停止按既有策略跳过结果全量确认；数据库、普通交互停止保留原确认策略。
- 主进程明确编排的退出、MCP 模块批量停止和插件停用直接传表；UI 独立并行请求仍用短缓存。
- 每个请求携带自己的表，重叠调用不共享“当前批次”变量；晚到模块不会重查或读其他批次。
- 直接 taskkill 仍有首次采样与实际执行之间的 PID 复用窗口；此次传参简化不改变该执行语义。

## 5. 逐文件处理原因

- ServiceStopContext.ts：用 processList 替换 batchId，保留请求范围及退出原因；固定 Symbol
  复用同一进程的异步范围容器，解决插件内联公共代码后无法读取宿主上下文的问题。
- ServiceProcess.ts：取一次表随并行请求传递，删除登记/释放分支，日志只写条数和原因。
- ForkManager.ts：提供一次取表方法，删除 begin/end 批次 API。
- StopProcessListCache.ts：删除批次 Map、UUID、冻结/登记/释放和 batch-hit 事件，保留普通短缓存。
- ForkItem.ts、fork/index.ts：原命令一次携带表，解包后传入 dispatcher，不再按 ID 取表。
- BaseManager.ts：统一插入第二参数，保留业务参数位置；插件保持旧签名。
- Base、MySQL、语言项目、自定义服务、隧道、DNS：公开停止入口接收参数并绑定请求范围，
  不把列表混入业务配置或 _stopServer 扩展参数。
- StopProcessList.ts：传入表优先直接返回，删除批次 IPC 字段及不可用批次回退处理。
- StopProcessListBridge.ts、StopProcessListClient.ts：只服务普通短缓存查询，不再传递 batchId。
- ServiceStopDiagnostics.ts：以 snapshotSource=stop-argument、snapshotCount、reason 和既有 stopId
  说明当前数据来源，保留停止前 PID/实际命令/退出码等细分日志，不额外查询或输出全机命令行。

Go Helper 代码未修改，帮助程序版本仍为 35；本轮不需要重新升级协议版本。

## 6. 复核与验证范围

已核对内建 stopService 覆盖入口和直接调用、查询/退出确认的分离、空列表、插件签名、
MySQL group 参数和语言/自定义服务身份参数顺延。源码语法解析及 diff 空白检查作为静态复核，
不等于类型检查或运行时验证。未新增/运行测试、构建、真实服务启动停止或 UAC/Helper 操作。
实机日志应显示一次初始 snapshot、各模块 snapshotSource=stop-argument，以及原序 kill 命令；
明确批量请求不会再出现批次取表 IPC，旧 batch-created/hit/released 事件已移除。
