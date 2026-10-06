# 性能诊断统一常量开关

## 实施约定

本次仅统一性能观察开关，沿用现有业务归属：main 管理 worker 和缓存，fork 模块执行
服务/hosts/环境变量操作，renderer 保持现有操作控制器。观察器不拥有业务状态，
不开新 IPC，不保存用户设置，不增加模块或 Pinia 状态，不需要模块约束例外。

关闭诊断后，开始、进度、成功、失败、重入规则、进程清理和后台通知均按原链路执行。
真实失败继续由原业务错误路径返回；诊断失败不改变业务结果。并发请求原有隔离保持。

## 实施范围与验收边界

统一覆盖操作计时、服务停止阶段、跨 main/fork 边界、worker 启动、PATH 阶段及广播、
Windows 授权执行阶段和项目环境计时。帮助程序安装/认证故障及真实操作错误保留。
产品功能本身的耗时结果（例如请求计时工具）不属于调试日志，不受开关影响。

本轮按会话约束不新增或运行测试、构建；进行源代码和引用静态检查。
后续验收应分别检查常量 false 时无性能日志、true 时有日志、计时脚本开启时有报告，
并确认关闭日志不影响失败回包、并行停止、hosts/PATH 写入和后台通知。

## 唯一开关与打包方式

运行时代码只调用 `src/shared/PerformanceDiagnostics.ts` 的日志/计时方法。
`PERFORMANCE_DIAGNOSTICS_ENABLED` 仅在该文件内部使用，不导出给业务文件。该文件
没有静态依赖，不加载 shared/utils、Electron 或模块树，可用于轻量 worker 与 renderer。

直接修改这一行即可，目前为 true，以便继续诊断：

```typescript
const PERFORMANCE_DIAGNOSTICS_ENABLED: boolean = true
```

- true：开启性能计时和阶段调试日志。
- false：关闭性能计时和阶段调试日志。

开发、打包、插件与源码计时脚本统一调用同一套方法，方法内部读取这个常量。开关不读取环境变量，
不按 NODE_ENV、运行平台、开发/发布或压缩模式切换，也没有缺配置回退分支。
Windows 和 macOS/Linux 使用相同的常量。

需要不含性能日志的正式包时，把常量改为 false，再执行 `yarn build:win` 等既有
打包命令即可。需要诊断包或运行计时脚本时改为 true。已生成的产物使用打包时的
常量值，修改源码后应重新构建；不增加运行时设置项或 IPC。

此前为环境变量增加的 configs/performance-diagnostics.ts 已删除；esbuild、Vite 和
插件构建里的开关注入同步移除。普通 TypeScript 常量导入已经足够，不保留另一份
构建开关或读取逻辑，也不会因为直接运行源码而报环境变量未配置。

## 调整位置及原因

- **OperationTiming**：关闭时直接调用原业务函数，不创建计时范围，不分发观察事件。
  同步返回值和异步错误照常传播；存在观察器并不意味着可绕过发布开关。
- **ServiceStopDiagnostics、WindowsPathDiagnostics**：仅保留 Node 请求范围与元信息，调用统一 logger。
  服务停止的真实首表仍由 ServiceStopContext/参数承载，与诊断 ALS 分开；关闭诊断
  不改变 PID 选取、父子排序、并行停止、退出确认或 PATH 更新结果。
- **ForkItem、fork/index、fork/runtime**：停止耗时范围、初始化诊断元信息和下一轮探针
  受开关控制。轻量引导仍按原方式导入 runtime；导入失败继续记录错误并非零退出。
- **ForkManager、ServiceProcess**：缓存指标、批量快照和正常停止阶段日志关闭；快照
  获取失败、单实例停止失败、退出未完成等错误继续保留。缓存的 TTL、失效、合并查询
  和实例登记均不受开关控制。
- **WindowsActionStage、WindowsActionPipe、WindowsElevation、WindowsRunAs**：关闭时生成
  同名空阶段函数，不创建 PowerShell 阶段时钟/数组；C# 启动阶段函数不输出日志，
  Node 不分派阶段事件。认证终态不再附加 actionStages 和计时字段。即使调用者主动
  传 reportTiming=true，也不能绕过统一常量。
- **WindowsHelperFallback、WindowsPrivilegeOperation**：关闭 PowerShell 停止事件收集、
  成功执行和身份快照调试日志。实际路径验证、权限分类、进程身份及原生句柄处理
  保持原逻辑。关闭时不访问未创建的事件列表。
- **WindowsEnvironmentBroadcast、WindowsDnsRefresh**：正常后台阶段关闭，故障信息
  保留。通知照常调度和启动，DNS 照常尽力刷新；日志开关不引入等待或影响主结果。
- **EnvSyncLocal、Tool.win/init、LanguageProjects/Project、ServiceManager/EXT/store**：
  原来分散的控制台计时、项目环境步骤日志和 renderer PATH 调试 IPC 同样受控。
  原业务错误仍返回界面；项目状态、shell 安装和环境同步仍由原所有者负责。
- **现有 VM 回归脚本**：补充新增轻量依赖的映射，避免源文件新增 import 后替身
  加载器报 Unexpected dependency。本轮未执行这些脚本。

## 保留内容与检查到的边界

不修改通用 appDebugLog；它仍承担帮助程序安装、修复、签名、认证和真实故障诊断。
Go Helper 的已有身份/执行诊断也保留，本轮没有修改 Go 或帮助程序版本。
产品请求计时工具的测量结果不是调试日志，不受影响。

关闭 PowerShell 阶段采集时，必须同时关闭 actionStages.ToArray 回传，否则空函数
没有初始化列表，会把已完成业务错误地变为回包失败；本次已同时处理。nonce、digest、
READY/LAUNCH、启动错误信息和经过身份认证的业务回包保持完整，不把诊断开关当作
授权判断。真实错误继续传播，不因关闭日志而变成成功或触发重试。

缓存到期、业务超时、租约、未知执行状态、PID 创建时间和退出确认中的时间是业务
判断依据，保留这些时间计算；关闭日志不能改变业务安全边界。部分调用点仍构造轻量
阶段参数，公共日志入口会立即返回，不序列化、不落盘；不是把所有 Date.now 全局禁用。

静态检查记录：此前涉及的 28 个 TypeScript 文件解析未发现语法问题；本次改为常量后
再次检查修改文件语法及引用，并确认已移除环境变量读取和构建注入；`git diff --check`
无空白错误，仅出现工作区已有 CRLF 提示。该检查不替代构建或 Windows 实机验收。

新增性能打点调用 PerformanceDiagnostics.ts 的统一方法，不导入开关，不自行 JSON.stringify、
直接落盘或 console.time。已有 Node 请求可以沿用 OperationTiming/对应上下文适配入口。
真实故障日志继续走原错误通道，或显式 fault=true 调用统一 logger，不因关闭性能日志丢失。

## 本轮收敛实现与操作约定

日志格式、序列化、写入容错、计时器、同步/异步计时包装、脚本诊断生成统一放在
PerformanceDiagnostics.ts。常量仅此文件内部使用，业务文件调用方法。
ServiceStopDiagnostics、WindowsPathDiagnostics、OperationTiming 仅保留 Node 异步上下文、
请求关联和协议适配，公共文件不能静态依赖 Node、Electron 或 utils，避免 renderer
不可加载或轻量 worker 为第一条日志加载整个业务依赖树。

日志传输仍由既有 appDebugLog、renderer debug.log 或 worker 的内置 appendFile 承担，
通过回调交给统一方法，不建立全局注册器/写入队列/新 IPC。主业务开始、进度、终态、
重复调用、服务交互及生命周期仍由既有模块管理；诊断回调异常只丢失日志，业务错误
原样传播。关闭常量后不创建计时范围、不调用性能日志 sink，真实错误可显式保留。
本轮只做静态检查，不新增/运行测试、构建。

### 统一 API 的职责

- writePerformanceLog：唯一序列化和写入方法；检查开关、延迟采集数据、固定 UTC、
  捕获同步/异步日志错误。关闭时不调用 writer；故障日志可以显式 fault=true 保留。
- bindPerformanceLogger：绑定请求元信息和起点，返回阶段 logger。请求元信息优先于
  普通阶段数据，防止阶段数据改掉关联 ID；所有实际写入委托 writePerformanceLog。
- beginPerformanceStage、timePerformanceSync、timePerformanceOperation、measurePerformanceStep：
  统一阶段时钟、幂等 finish、同步/异步异常传播、观察器隔离及独立步骤计时。
- performanceDiagnosticNow/Elapsed：分派、查询等既有边界需要跨回调持有起点时使用，
  不让业务文件再实现时钟/耗时差值的开关判断。
- buildPerformanceStagePrelude、buildPerformanceProcessStopPrelude、buildPerformanceScriptTiming、
  native 诊断生成方法：固定 PowerShell/C# 阶段采集的统一生成入口。两个停止脚本共用
  一份事件收集方法；关闭时不创建/访问列表，也不生成未使用的 native timer 声明。

OperationTiming 只管理 AsyncLocalStorage 观察器与固定 stderr 协议转换；
ServiceStopDiagnostics 只提供 stopId/首表来源/模块等上下文；WindowsPathDiagnostics
只提供 PATH 请求关联。三者已经移除自己的时钟、JSON 序列化、日志写入容错与开关。
保留这些适配层，是因为 Node ALS 不能静态放到 renderer/轻量引导共用的公共文件。

worker 引导仍使用内置 appendFile 回调，不导入 utils；renderer 仍使用既有 debug.log
回调。回调只运送已经序列化的文本，不再实现各自的性能日志格式或判断开关。

本轮额外检查：开关引用仅位于统一文件；公共诊断文件无静态 import；固定脚本标记
生成也集中于此。27 个相关 TypeScript 文件语法解析、公共导出引用检查无发现，
git diff --check 无空白错误。未执行测试/构建，Windows 实机与完整类型检查未覆盖。
