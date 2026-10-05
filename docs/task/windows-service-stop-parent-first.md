# Windows 服务按父先子后停止

> 2026-10-04 更新：当前统一使用 ProcessKillStrict，一次传入有序 PID；已取消逐 PID 阻塞等待，不再保证父已退出后才结束子。普通路径直接启动一次 taskkill.exe，退出强制停止跳过全量确认。以下保留上一轮原句柄顺序执行的历史，当前实现见 [统一执行与批次快照](windows-service-stop-unified-execution.md)。

## 操作契约与实施计划

用户明确要求取消 taskkill `/T`，恢复一次传入多个 PID 的停止方式，并先结束父进程，避免 PHP spawner 在 worker 先退出后补建进程。

- 所有者：fork 模块仍从首次完整列表确认服务根及全部后代；共享 Process 工具计算父先子后的显式顺序；普通权限/UAC 和 Go Helper 按该顺序结束目标并确认原句柄退出。
- 状态：本次目标、创建身份、执行顺序只存在于函数局部和现有 ALS，不新增配置、Pinia 或 renderer 控制器。
- 中间/终态：日志包含首次完整目标、父根、实际有序派发、每个 PID 的结束请求/结果；最后仍用新列表确认原目标消失，成功才清理文件。PHP 原有一次补停保留。
- 并发：实例间并行、启动组串行保持；一次服务请求内部按父先子后，不依赖 taskkill 多个 `/PID` 的内部处理顺序。
- 归属：仅模块确认根的服务归属，后代继承该归属，不逐个匹配服务路径或配置；执行端仍绑定原创建时点和持有句柄，防止快照后的 PID 复用误杀。
- 权限：普通拒绝继续进入用户选定 UAC/Helper；已结束目标幂等跳过，查询/权限/未知结果保持原错误分类，失败不能伪造成功。
- 检查：源码检查、顺序与边界复核；本轮不新增/运行功能测试、构建或实际进程结束。

## 查询缓存现状

main 的 `StopProcessListCache` 及 bridge/client 保留，ForkManager 配置 TTL 650ms；用户随后明确要求继续用于批量退出后，Base/PHP、登记服务、分组与伴随模块的停止前发现已恢复 `StopProcessListFetch`，跨 fork 共用 in-flight 查询与短缓存。公共退出确认及模块末次检查仍使用 `fetchStopProcessListLocal` 的严格新查询，避免把停止前的表用于退出确认。

启动受理/终态、有效 PID 登记以及 main 一轮批量停止开始会使旧缓存失效，解决快速启动后立即停止的旧表问题；每个单独 stop 不清缓存，保持并行查询共享。完整实现与理由见 [服务批量停止恢复共享进程缓存](windows-service-stop-cache.md)。此前“真实停止不使用缓存”的说明属于恢复前状态。

## 本次实现与理由

| 文件 | 调整及理由 |
| --- | --- |
| `src/shared/Process.ts` | 公共排序器从现有完整目标和有效父子边确定根，按祖先深度排序。根深度为 0，先停止所有根，再按层结束后代。身份来自同一列表，完整有序集合一次提交；不重新查询、不动态扩树。深度每个目标只计算一次。 |
| `src/shared/WindowsProcessSafety.ts` | 服务 ALS 从仅根扩为完整集合。`cim` 根必须有创建时点和 EXE；新增 `cim-descendant` 标识继承根归属的后代，只需要首次创建时点。后代不独立匹配服务配置/安装路径。 |
| `src/shared/WindowsPrivilegeOperation.ts` | 普通/UAC/Helper 共用完整首次身份，取消另行采样。登记启动证明仍只约束根，不要求后代拥有启动登记；后代不能增加授权范围。 |
| `src/shared/WindowsHelperFallback.ts` | 服务分支先打开并持有原进程对象，预检完整目标，然后按提交顺序 `Process.Kill()`、`WaitForExit(10000)`。确认父已经退出才处理后代；删除原 `/T` 脚本及 taskkill 子进程。普通工具保留原独立 PID/端口行为。 |
| `src/shared/ServiceStop.ts` | 公共阶段注释与新行为同步。完整原目标的退出确认、末次新鲜列表、成功后文件清理仍共用原实现。 |
| `src/shared/WindowsElevation.ts` | 认证结果继续携带真实逐 PID 事件，上限与 4096 目标对齐，补充事件总数和是否截断，避免后半批的实际执行记录被旧 2048 条上限丢弃。 |
| `src/helper-go/utils/process_tree_windows.go` | 服务分支保留调用方顺序，不能用 Go map 遍历顺序。预先持有 `QUERY_LIMITED_INFORMATION / SYNCHRONIZE / TERMINATE` 句柄，按序 `TerminateProcess` 并等待原句柄 signaled；取消 `/T`。普通工具仍可使用完整系统路径的 taskkill，但没有 `/T`。 |
| `src/helper-go/main.go`、`module/tool.go`、`utils/process_tree.go` | 同步后代身份协议、参数上限与说明，普通 PID/端口模式拒绝后代来源；RPC 的第三布尔位置和旧函数名保留，语义改为显式有序服务集合。 |
| `src/shared/AppHelperCheck.ts`、`scripts/helper-version-sync-test.ts` | 与 Go 发布版本一起从 33 改为 34。旧 Helper 必须按既有安装流程更新才能执行新协议；版本常量和断言更新不等于二进制已经重新构建。 |
| `scripts/helper-contract-check.ts` | 静态协议检查同步识别 `kill` 服务模式的后代来源，端口/明确普通模式字面量不接受；没有运行检查脚本。 |

### 当前完整停止顺序

1. 模块通过 main 共享查询/650ms 缓存读取完整进程列表，包含 PID、PPID、创建时间、EXE 和命令。沿登记/PID 文件、专用数据目录/配置等既有规则确认根，过滤无效候选；不全量匹配同 EXE 实例。
2. 在同一列表收集后代，继续排除“子创建早于当前父”的历史 PPID 假边。公共工具计算完整有序 PID 和首次身份。孤立且已经独立确认归属的目标作为单独根。
3. 一次权限动作/RPC 传入全部有序 PID。根要求创建时间和 EXE 一致；后代继承树归属，只做原对象绑定。原生创建时间与 CIM 按微秒精度对齐，不为 worker 发 CIM 查询。
4. 执行端在任何结束前预检所有活目标并保留句柄；开始结束后，逐个确认当前原对象退出，再继续下一个。不存在/自然退出的原对象幂等跳过，创建时间变化或访问拒绝保持真实失败。
5. 普通权限被拒绝时沿现有授权方法执行同一有序集合，不逐 PID 申请 UAC。不同服务实例仍由现有批量编排并行停止；一个服务内按父先子后执行。
6. 成功后读取新鲜列表核对本次全部原 PID，PID 已被新对象复用不算原进程残留。PHP 保留一次有界额外 worker 回收：先确认新目标仍属于本版本专用配置，再共用以上执行器；没有无限重试。
7. 最终确认成功才清理 PID 文件并返回成功；权限取消、真实残留、查询异常不能伪装为成功。

### 边界与防御

- PID 去重时保留顺序；限制数字、范围、当前执行 PID，拒绝未知/重复/请求外身份。服务完整集合最多 4096 个目标，普通进程与端口请求仍最多 256 个；启动登记证明仍最多 256 个根。
- 整批预检失败时还未开始杀进程；原对象创建时间不匹配不会将新占用者纳入目标。开始执行后的错误传播，finally/defer 释放已打开句柄，停止注册/文件不能提前清理。
- 并发停止仍各有 ALS 身份和 stopId，没有跨服务共享可变有序集合。main 现有并行调度与启动组串行策略没有更改。
- 不依赖 taskkill 对多个 `/PID` 的内部顺序；直接用系统进程对象/句柄确保父先子后，也避免每 PID 启动一个 taskkill 的开销。正常执行立即完成时不会固定等待十秒，十秒只是单目标退出上限。
- 首次列表完成到父结束之间仍可能出现新 worker；本次减少其中的 taskkill 启动间隔，但不宣称彻底消除该窗口。PHP 原一次补停和详细日志继续保留。
- Windows 外保持原信号/原生数据库关闭语义；MySQL/MariaDB 原生关闭后的强制回收调用公共有序执行器。PostgreSQL/MongoDB 原生关闭顺序及禁止强杀政策保持。

### 日志口径

- `kill.tree-selection`：完整 `targetPids`、`rootPids`、`descendantPids` 和实际 `orderedPids`。
- `kill.dispatch`：实际完整提交顺序、首次创建身份、缺席根；不再仅传根让 `/T` 扩展。
- 普通/UAC `action.execution`：每个 PID 的 `preflight-request/identity`、`before-stop-identity`、`stop-process-request`、`process-exited` 或真实 skip/error，附 UTC 时点。
- Go `helper-execution`：完整接收顺序、`parentFirst=true`、身份观察、每个 PID 的 `terminate-request` 和 `process-exited`。普通工具仍可能有 taskkill 日志；服务分支不会生成 taskkill 子进程。

本轮源码检查记录在下方；没有新增/运行功能测试、编译 Helper 或实际结束服务。实机是否减少新 worker 和具体耗时，需要下一份日志验证。

## 源码检查记录

- 本轮涉及的 9 个 TypeScript 文件由 TypeScript parser 读取，语法诊断为 0；这不是完整类型检查。
- 从实际服务模板及共享查询/保护模板重建 PowerShell 源文本（含中文路径），仅交给 PowerShell parser，语法诊断为 0；没有执行脚本、查询进程或 kill。
- 检查了 Go RPC `kill/killPorts` 的来源边界、顺序保留、句柄释放、原生 Windows API 参数签名，以及三个版本定义均为 34。未编译 Go，不把人工/API 源码核对当成构建通过。
- 修改文件差异空白检查通过；服务代码中的 `/T` 仅剩历史说明/取消说明，不再作为执行参数。
