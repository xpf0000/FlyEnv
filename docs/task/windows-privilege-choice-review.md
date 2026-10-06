# Windows 权限方式代码复查报告

日期：2026-09-30。

状态：原始复查完成；2026-09-30 已核对并实施修复，处理范围、误判更正和待验证场景见文末及实现文档。本页保留原始意见以便追溯。

本文是对 [权限选择方案](windows-privilege-choice-plan.md) 与 [实现与代码复查说明](windows-privilege-choice-implementation.md) 的独立代码复查结论，按六个分区（主进程协调核心、UAC 执行链、持久化与配置保护、renderer 控制器与生命周期、fork 停止链路、测试与文档一致性）逐条核实，关键发现均经人工复核。

## 总体结论

实现与方案/实现文档主体一致：首次选择协调、FIFO 租约、桥接去重、revision 广播、saveConfig 字段保护、UAC 执行器握手/迟到窗口、定向停用 Helper、后台请求不弹窗等核心机制均真实落地；三个新测试入口实跑通过；33 语言文案与已知失败旧回归的披露属实。同时发现 8 项 major 问题与若干 minor 问题，记录如下。

## Major：发布前建议处理

1. **Cloudflare Tunnel 吞错修复端到端无效。** 内层 `src/fork/module/CloudflareTunnel/CloudflareTunnel.ts:281` 已改为 Windows 抛错，但模块入口 `src/fork/module/CloudflareTunnel/index.ts:57-68` catch 后无条件 `resolve(true)`，renderer `src/render/core/CloudflareTunnel/CloudflareTunnel.ts:82-95` 的 `stop()` 不看 `res.code`、无条件清 PID 并置 `run=false`。Windows 上取消 UAC 后隧道仍在运行，UI 显示已停止，`restart()` 会再起一个进程。修正点 7 对该模块实际未生效。
2. **ClickHouse Windows 停止仍显式吞错。** `src/fork/module/ClickHouse/index.ts:325` 的 `ProcessKill(...).catch(() => {})` 把严格化后的权限错误再次吞掉，随后删 PID 文件并报成功；`_stopCHUI` 的 `.catch(() => [])` 与已为 Temporal 修复的属同一问题类，本轮遗漏。
3. **Mysql/Mariadb 单实例 Windows 停止绕开严格链。** `src/fork/module/Mysql/index.ts:154-245`、`src/fork/module/Mariadb/index.ts:458-560` 各自覆盖 `_stopServer`：先删 PID 文件再杀进程，taskkill 兜底被 `try{}catch{}` 吞掉，无条件发 Stop-Success。本轮仅修复了 Mysql 分组（`stopGroupService`）；文档"Windows 服务停止走严格接口"的表述不覆盖单实例，需改造或明确披露。
4. **内置模块独占前置 stop 是死代码，修正点 8 对内建模块生产环境不生效。** `src/render/core/Module/Module.ts:163` 为 `installItem._onStart = this.onItemStart`（未绑定 this），`ModuleInstalledItem.ts:59` 以 item 为接收者调用时 `this.isOnlyRunOne` 为 undefined，首行即 return；nginx/mysql/php 等内置模块的前置 stop、interactive 传递、失败阻断及 `startExtParam` 均不执行。该接线 bug 在 HEAD 既有（非本次回归），但测试以 stub/原型调用绕过了它。修法为 `.bind(this)`；注意绑定后 `startExtParam` 首次真正生效，需回归 PostgreSql/Consul/Minio 等模块。自定义模块路径（`ModuleCustomer.ts:231` 已 bind）不受影响。
5. **`Base._stopServer` reject 后缺 return。** `src/fork/module/Base/index.ts:330-340`：`StopProcessListFetch()` 失败时 `reject(e)` 后继续发 `APP-Service-Stop-Success` 进度并 `remove(appPidFile)`（resolve 无效但副作用已发生）。属既有 bug；本轮移除 Helper 兜底后，普通权限 CIM 查询失败（如企业策略限制 PowerShell）的可达性提高。需补 `return`。
6. **UAC 启动失败被误分类为"状态未知"并永久锁死重试。** `src/shared/WindowsElevation.ts:254`、`src/shared/WindowsHelperInstaller.ts:204`：launcher catch 取最内层 `NativeErrorCode`，非 Win32 异常（Session 0/交互窗口站限制、策略拦截 Start-Process 等）时为 null，落入 unknown 分支；脚本 digest 进入 uncertain 集合后，同一动作在本进程内永久无法重试，尽管脚本从未运行。建议 launcher 同时输出异常类型全名，能确认子进程从未启动的归入 `elevation_launch_failed`。
7. **"拒绝系统 PID"名不副实。** `src/shared/WindowsHelperFallback.ts:1809` 仅拒绝 `Id -le 4` 与执行器自身 PID；csrss/lsass/svchost 等关键系统进程均通过校验，UAC 批准后 `Stop-Process -Force` 杀错可致系统崩溃。建议增加关键进程名/路径黑名单，文档表述同步收紧。
8. **被替换或报错但未退出的 fork worker 形成幽灵租约。** `src/main/core/ForkItem.ts`：`onMessage` 对已被替换的旧 child 仍走 bridge 处理（reply 静默丢弃、不触发 detach）；`dispatch` 在特定时序替换 child 时不 kill/detach 旧实例；`onError` 不清理权限 owner。旧 worker 持有的全局 FIFO 租约阻塞后续全部 UAC/安装请求直至进程自然退出。正常退出与主动销毁路径已覆盖，仅"异常但存活"路径缺失。

## Minor：排期处理

- **管道身份边界缺口（需实机验收显式覆盖）。** nonce/管道名/digest 明文出现在非提升 launcher 进程命令行，同用户进程可经 WMI 读取；管道无 OS 级对端鉴权，理论上同用户恶意进程可抢先连接并伪造成功终态。方案 §6.1"管道访问与对端校验覆盖原用户和批准 UAC 的管理员"未完全满足，不得以随机管道名宣称身份边界。
- `src/shared/WindowsHelperInstaller.ts:110-121` 缺"首份认证终态"守卫，与业务执行器不对称。
- kill 请求含重复 PID 时必然误报"进程身份已变化"（`killPorts` 有去重，`kill` 无）；目标在捕获后自行退出时被静默跳过并返回成功（假成功）。
- 只读查询动作脚本固定，一次超时后 digest 被 uncertain 永久锁死至重启；uncertain 阻断对无副作用查询过严。
- `src/shared/WindowsHelperDisable.ts:66-69` 停用前存在性探测用原令牌，实例目录 ACL 拒绝遍历时（部分安装）不提权直接失败。
- Node 直执文件路径只在构造时检查 reparse point，执行时无复核；`readFileByRoot` 的 PS 与 Node 路径 BOM 处理不一致。
- `src/main/core/ConfigManager.ts:254-255` 字符串键 `setConfig` 路径绕过权限字段保护（当前无活跃调用方，建议收口）；choiceVersion 的 `=== 1` 字面量散布约 7 处，版本升级时易漏改，应统一使用常量。
- 权限广播发往托盘但托盘未注册监听（死发送，无功能损害）；全量 Server 广播携带更新 revision 时 AppStore 不同步，设置页可能短暂展示过期偏好。
- `src/render/components/LanguageProjects/ProjectItem.ts:110-144` stop 无超时兜底，fork 崩溃时 Promise 永久挂起并连带 restart 挂起；后台启动组遇 isSudo 项目仍弹密码框（`ProjectItem.ts:195` 无视 interactive）。
- `src/fork/module/Tool/process.ts` 的 killPorts 严格化实际改变了 macOS/Linux 行为，与"非 Windows 平台行为不变"的声明不符（修复方向合理，但发布说明应如实声明）；Windows 上任何 DNS 刷新失败（含 DNS Client 服务禁用等非权限原因）现在使 writeHosts 失败，影响面需在发布说明注明。
- `src/main/core/AppNodeFn.ts:382-389` 自启动错误以字符串回传，`errorCode` 丢失，renderer 无法区分取消授权与其他失败。
- `src/render/components/Setup/WindowsElevationMethod/index.vue` 的"停用旧 Helper"复选框常显（仅切到 UAC 时生效），易误解；`Controller.ts` 冲突拒绝提示复用 `base.loading` 文案；过期弹窗关闭时向 main 多发一次冗余 cancel（无害）。
- 文档口径三处需修正：修正点 4 称"Helper 业务获得租约后再次核验"，实际 helper 分支无租约无核验（无实际风险，表述超出实现）；"拒绝系统 PID"表述强于实现；Unix 行为变化未披露。另 `application:reset` 会静默清除确认标记，下次提权重新询问，迁移边界未在文档说明。

## 已核实与预期一致的部分

首次选择单窗口/共享 Promise/5 分钟超时/取消不保存/保存失败可重试/旧 choiceId 拒绝、先 settle 后通知；租约 UUID+owner 双匹配与退出批量回收、迟到租约归还；bridge 128 份终态缓存与断连回收；原子保存（单 set 同事务）、旧 method 仅展示、普通 saveConfig 字段保护、revision 单调过滤；ALS 交互意图全链传递、MCP/退出清理默认非交互；UAC 执行器先 listen 后启动、digest 校验、首份终态、8MiB 双限、unref 与迟到窗口、四类错误分类；停用 Helper 的任务主体逐项核对、先禁后停、按 exe+SID+instanceId 过滤；renderer Controller 的 6 分钟超时、进度保留、终态清理、operationKey 防重与冲突拒绝；重启"stop 成功才 start"。测试声明全部属实，33 语言措辞精确，已知失败旧回归（startup-group、startup-hosts-sync）披露诚实。

## 建议优先级

1. 先修 Major 1、2、5（吞错/状态残留，改动小、收益直接），再处理 4（`_onStart` 绑定，需回归 startExtParam 相关模块）。
2. Major 3 要么改造走统一权限链，要么在实现文档中明确披露缺口。
3. Major 6、7 建议在实机验收前修掉；Major 8 可排期但建议补齐"异常但存活"worker 的 owner 清理。
4. 同步修正三处文档口径（见 Minor 末条）。

## 本轮处理回执（2026-09-30）

Major 1、2、3、5、6、7、8 有对应代码风险，已实施停止链路、启动分类、进程保护和 fork owner 清理修改；管道原生身份检查及关联 Minor 同步处理。完整文件说明、原因、当前逻辑和待验证范围见 [实现文档第三轮处理记录](windows-privilege-choice-implementation.md#第三轮-review-处理记录2026-09-30)。本轮尚未运行测试/构建或真实 UAC，原始报告中的测试通过属于修改之前。

两项原始判断更正：Major 4 不成立，生产 BrewStore 创建 Module 时已经绑定 onItemStart；Minor 所称“Helper 业务无租约无再次核验”不成立，Helper.ts 已通过 withWindowsElevationLease(..., 'helper') 排队并核验当前方式。此外，永久 digest 阻断只属于业务执行器，安装器没有同样的集合；目标已自行退出可作为停止操作的幂等成功，查询失败/身份变化不能当成退出。
