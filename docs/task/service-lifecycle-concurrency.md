# 服务多版本启动与并行停止

## 修复范围与操作契约

用户要求 PHP-FPM 允许不同版本在启动中继续启动其他版本；退出停止需要与 UI 一键停止一样并行。源码定位到三个阻挡：服务列表/InstalledItem 的模块级忙碌判断、main 的模块级请求队列、退出逐项 await。renderer `Module.startSingleFlight` 已按 `isOnlyRunOne` 区分多版本，`Module.stop` 已并行提交，需修正外围链路而非增加第二套生命周期。

- 所有者：renderer 仍由既有 Module/InstalledItem 管理状态和 IPC；main 管理实例队列、登记代次和批量编排；fork 模块仍管理归属、父树停止、原生数据库关闭和 companion。
- 生命周期：每次请求从受理、参数/目标解析、排队到终态登记消费均进入退出 drain；关闭入口后拒绝新外部请求。每个实例自己的启动/停止互斥，不同 PHP 版本独立运行。
- 事件：进度不释放 flight；真正终态才更新 PID/状态和队列。批量停止等待所有实例结算，一项失败不取消其他实例。
- 交互：UI/退出保留原授权意图。普通权限停止可并行；需要提升时仍由原 FIFO 权限租约协调授权/维护操作。
- 重入：同版本 renderer flight 保留；main 同实例按队列排序，模块范围操作作为屏障等待该模块已有实例任务，并阻止后来实例任务越过。
- 批量停止：退出、MCP stop_all、插件停用复用登记快照的并行编排；UI 每版本 stopService 沿用同一 fork 停止契约和 main 实例排队规则。companion 仍登记和收尾，不把展示状态作为完整停止清单。
- 模块约束：PHP 的多版本队列策略放在 PHP 模块目录；通用队列只提供策略注册和实例/模块屏障机制。不添加新 Pinia、共享持久字段、新 IPC 或独立 start/stop 控制器，无需例外授权。
- 验收场景：PHP A 启动中启动 B；同版本重复启动；A 启动中停止 A；独占服务版本切换；同模块两个版本退出/一键停止并行；数据库与面板重复清理；某实例失败其他继续；drain 超时后迟到回包不登记。本轮仅源码复核，不新增或运行测试、构建或真实服务操作。

## 实施安排

1. 通用服务列表及 InstalledItem 的模块忙碌限制仅对独占模块生效，多版本模块只防本实例重入。
2. main 生命周期队列支持模块所有的实例键解析器；PHP UI/MCP 使用同一版本对象求键，目标解析仍受生命周期许可和预算保护。
3. 单实例 stop 按安装实例排队，独占 start 和模块级操作保持屏障。不同实例 stop 并行，同实例与启动按序。
4. 登记批量停止提取为公共并行编排，保留派发代次快照、错误隔离和真正终态消费，退出/MCP/插件共用。
5. 补充详细代码注释、最新链路与限制，完成源码语法和差异检查。

## 实际修改与原因

### 1. 服务列表只限制本行重入

`src/render/components/ServiceManager/setup.ts` 原先只要模块内任意版本 `running`，就直接从 `serviceDo` 返回。PHP 列表按钮只显示本行状态，因此另一个版本的按钮看起来可点，实际请求没有发出。

现在 `versionRunning` 仅对 `isOnlyRunOne` 的独占模块汇总忙碌状态；入口另外检查本行 `item.running`。`src/render/core/Module/ModuleInstalledItem.ts` 的通用入口同步使用相同规则，避免绕开服务列表的调用仍被整个模块阻挡。PHP/PHP-FPM 已声明 `isOnlyRunOne: false`，`Module.startSingleFlight` 已允许多版本，不需要新增 PHP 专用 UI 启动流程。

同实例的 start/stop Promise 仍由已有 WeakMap 管理：重复启动共用原请求，停止本实例时等待其启动终态；独占模块仍保留版本切换前先停止原版本的流程。

### 2. main 从模块串行改为实例队列与模块屏障

`src/main/core/ServiceProcess.ts` 的 `runLifecycle` 原先所有相同模块请求串行，renderer 并行提交也无法改变实际执行顺序。现在每个模块保存已受理请求的范围 Promise 和完成 Promise。

- 同实例请求等待此前同键的请求完成。
- 不同实例请求可以并行，但会等待此前目标范围解析完成，以判断是否冲突。
- 无法确定实例的请求使用空范围，作为模块屏障：等待此前全部请求；后来请求也等待该屏障完成。
- 默认 start 保留模块屏障，避免独占服务两个版本同时切换。模块可注册自己的多版本策略。
- 普通 stop 的安装对象按 bin 排队；PID 签名按 PID 排队；没有确定身份时继续使用模块屏障。

`src/fork/module/Php/lifecycle.ts` 是 PHP 自己的纯并发策略：相同安装 bin 使用同一键，不同安装 bin 独立。Windows 规范化路径并忽略大小写，macOS/Linux 保留大小写；路径本身不经 shell，不受空格或中文影响。启动前没有 PID，因此不能用 PID 把一个版本的 start 与 stop 关联。缺少 bin 时返回 undefined：启动保留模块屏障，停止沿用通用 PID/未知目标规则。

策略在 `ServiceProcess.ts` 的集成处注册；队列类不按 PHP 版本号分支，也不向通用服务对象增加 PHP 专用字段。PHP 的端口、配置目录和进程归属规则仍由原 fork 模块负责；本次并行许可不会消除这些已有资源约束。

队列在**受理时**冻结前驱，而非选版本完成后才入队。例如先受理一个查询较慢的 MCP start，随后受理 stop_all：stop_all 必须等该 start，较早 start 不能反过来等待后来 stop_all。否则会遗漏退出等待或构成环形等待。目标解析、排队、fork 请求和 PID 登记消费全部位于原六分钟操作预算中；取消/超时同时结算范围与完成 Promise，不让后续请求永久卡住。

### 3. UI 与 MCP 使用相同实例身份

`src/main/core/IPCHandler.ts` 向 `runLifecycle` 传入请求中的实例对象。停止的 generation/参数快照仍在真正派发时取得：同实例 start 刚完成后，stop 能使用刚登记的 PID，而不是入队前的旧值。

`src/main/core/MCPTools.ts` 在受理许可内解析已装版本，将结果交给相同队列并复用一次选中的对象。start/stop/restart 不各自重复选版本；MCP restart 持有同一范围直到停止和启动两步完成。目标解析失败也属于可 drain 的终态，不留下排队节点。

### 4. 批量停止共用并行编排

`ServiceProcess.stopRegisteredInstances` 为退出、MCP stop_all 和插件停用提供相同实现：

1. 同步冻结完整运行登记，包括被展示状态隐藏的 companion，以及每个实例启动时记录的 stopArgs、rootGeneration 和同模块登记代次。
2. 使用 `Promise.all(instances.map(...))` 启动各项停止；每项内部的 await 不会阻挡其他项。每个实例都调用原 `forkManager.send(module, 'stopService', ...args)`。
3. fork 进度不能视为成功；真正终态必须 `code === 0`，再按冻结的 generation 注销。迟到响应不能删除后来启动的实例。
4. 每项内部捕获失败并保留登记，其他项继续；等待全部结果后再返回逐项 stopped/skipped/failed。标签从运行登记读取，不假设所有 stopArgs 都以版本对象开头。

UI 的 `Module.stop()` 已使用 `Promise.all`，仍沿用 InstalledItem.stop 与原 fork 方法；主进程现在允许不同实例 stop 并行。退出不能调用 renderer 的 Module.stop，因为关闭窗口后 renderer 不再可靠，且 renderer 展示列表不包含完整 companion 登记。因此共用 main/fork 停止契约与并行规则，由 main 从自己的运行登记发请求。

`src/main/Application.ts` 插件停用在模块屏障内调用公共批量方法，全部结算后才检查失败或剩余登记，不能提前卸载正在停止的模块代码。MCP stop_all 同样在模块屏障内直接调用公共方法，不把每一项再排进自己的屏障后面而形成自等待。

### 5. 退出的完整顺序

Application 关闭新请求入口 → drain 已受理生命周期及 fork 请求 → ServiceProcess 取得最终运行登记 → 在 shutdown 许可内并行停止全部实例 → 等待全部终态并记录失败 → 回收 fork → 执行 hosts 清理及其余退出收尾。

顺序约束发生在这些阶段之间，不再逐服务串行停止。多个退出触发仍共享一次 stopPromise。`ServiceLifecycle.ts` 只更新对应注释，原许可、退出 drain 超时和迟到请求保护继续有效。

## 源码复核的边界

- 同版本 A 连续请求按序完成；A 与 B 的安装键不同，可同时派发。
- A start、模块 stop_all、B start 的受理顺序中，stop_all 等 A，B 等 stop_all；不能绕过批量停止。
- 异步选版本失败或排队超时会释放节点；较晚请求仍等待其余存活前驱，不能因中间节点取消就越过更早的同实例任务。
- 退出先 drain 后取登记，避免刚启动成功的版本遗漏清理。超时的旧消费者仍不能登记或注销新实例。
- MongoDB/PostgreSQL 等仍通过原模块的数据库原生关闭、公共父树停止/退出确认收尾；不同实例可以并行，每个实例内部必要顺序保留。
- companion 仍由所属 fork 模块管理；现有模块内部 stop flight 只在其所属 worker 内复用。本次未增加跨 worker 的 companion flight，也未把 companion 排除出退出清单。
- 普通权限停止不占全局提升租约，可以并行；确实需要 Helper/UAC 的提升操作仍遵守原 FIFO 租约。因此并行提交不承诺授权弹窗也同时出现，或真实停止耗时固定为某个值。
- 本次只修改 TypeScript/文档，未修改 Go Helper 执行逻辑，不需要提升 Helper 版本。停止 PID 选择、父树归属、CIM 首次快照和退出确认规则保持原实现。
- 既有耗时脚本仍按两个 PHP 版本串行调用，适合测单实例阶段开销；其 serial-batch 结果不能当作本次退出并行耗时。

## 检查范围

本轮进行 TypeScript 源码语法解析、导入使用检查、差异空白检查及上述控制流复核；没有执行测试、构建、完整类型检查或真实服务启动/退出操作。PHP-FPM 实际双版本启动、Windows/macOS 退出并行和数据库/companion 并发收尾仍需实机确认，不能把源码检查描述成运行验证通过。

实际检查结果：8 个改动 TypeScript 文件的源码解析无语法诊断，导入引用检查未发现未使用导入；本次涉及的已跟踪文件 `git diff --check` 返回 0。源码解析不是类型检查，也不能证明并发场景的运行结果。
