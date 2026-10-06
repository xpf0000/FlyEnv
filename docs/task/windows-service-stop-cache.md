# 服务批量停止恢复共享进程缓存

> 2026-10-04 更新：明确的主进程批量停止已改为按 batchId 持有整批初始快照，不受短 TTL 影响；本页记录上一轮恢复短缓存的历史。当前链路、文件改动和边界见 [统一执行与批次快照](windows-service-stop-unified-execution.md)。

## 操作契约与实施计划

用户明确要求继续使用原有缓存：并行停止多个服务时，首次全量进程查询应共用 main 的查询和短时列表，不能每个 fork 各查一次。

- 所有者：main 的 `StopProcessListCache` 保持唯一跨 fork 缓存；模块仅从共享完整列表选取自己的目标。PID 归属、排序、实际停止和确认仍属于 fork/shared 服务工具。
- 生命周期：首次发现使用现有 650ms TTL 和 in-flight 合并。启动请求受理/终态、有效启动 PID 登记、main 一轮批量停止开始使旧缓存失效；失效前的查询不能重新填回缓存。
- 中间/终态：缓存 hit/join/miss/invalidate/query 结果进入现有 debug 日志，服务原 stopId/逐 PID 事件继续使用。成功后新鲜列表用于退出确认、残留检查和文件清理。
- 重入与并发：多个并行 stop 共用首次查询，不在每个 stop 中清缓存；旧 in-flight 的结果只完成原等待者，不能覆盖新一代缓存或清空新查询。
- 交互：不新增 renderer 状态、控制器、配置或模块协议；启动组串行、批量退出/UI 并行及数据库原生关闭政策继续使用现有编排。
- 检查范围：源码解析、引用/空白与失效竞态人工核对；本轮不新增/运行测试、构建或实际服务操作。

## 为什么分开发现与退出确认

停止前多个模块可共用同一份完整列表，各自按 PID/创建时间/专用配置选目标，因此首次查询恢复 `StopProcessListFetch`。停止后的确认不能继续拿这张停止前列表，否则已经结束的 PID 仍会显示存活；公共 `waitForServiceProcessExit` 和模块的末次确认保留严格本地新查询。本轮收益是减少重复的停止前全量查询，不能声称整个批量只需要两次查询。

缓存失效用于处理快速启动后立即停止：启动前后都撤销旧表，登记 PID 时再撤销一次，确保紧接着停止的请求不命中启动前列表。失效本身不发系统查询，下一位读取者查询，其他并行读取者共用该 Promise。

## 修改文件与完整逻辑

- `src/main/core/StopProcessListCache.ts`：新增 `invalidate(reason)`、失效代次和旧 Promise 保护。`get()` 仍先命中 650ms 内的结果，再合并正在查询的 Promise，最后才真正查系统。旧查询可以给原等待者返回，但失效后不得写回缓存；其 finally 也不能清掉新查询。
- `src/main/core/ForkManager.ts`：唯一 main 缓存提供公开失效入口；复用既有生命周期分类器，在 start/open 请求发出前及成功/失败终态清表。恢复 debug 缓存事件，日志不输出完整进程表或命令。
- `src/main/core/ServiceProcess.ts`：有效新 PID 登记立即清表，覆盖运行态广播早于启动最终响应的窗口；退出/MCP/插件一轮并行批量停止只在 map 前清一次，不能每实例清一次。
- `src/shared/StopProcessList.ts`：继续原 provider→main bridge/client→缓存通道，失败才走本地严格回退。未新增 IPC 字段、查询接口或第二份缓存。
- `src/fork/module/Base/index.ts`、`Php.win/index.ts`、`Php/index.ts`：首次列表改回共享入口；各实例仍独立从完整列表判归属、收集后代。Windows 首次创建时间与 EXE 身份继续原样传入父先子后执行器。
- `src/shared/ServiceProcessIdentity.ts`：登记项目/自定义服务的首次发现也共享列表，原启动证明仍核验当前根；Unix TERM/INT 的存活检查保留新查询，避免对已退出/新复用 PID 重放信号。
- `src/fork/module/Mysql/index.ts`、`Mariadb/index.ts`、`Neo4j/index.ts`：独立首次发现恢复共享入口，MySQL 分组也覆盖。Windows 普通数据库从 Base 继承同一缓存；原生关闭与末次实例残留检查不变。
- `src/fork/module/Temporal/index.ts`、`Postgresql/index.ts`：伴随程序停止的首次发现共享列表，已有传入首表时直接用它；启动存活观察、端口恢复、数据库退出确认保留新查询。
- `src/shared/ServiceStop.ts`：注释明确发现用缓存、执行后确认用新列表。没有把缓存发现和退出证据混用。
- 相关总实现和父先子后文档同步当前缓存行为；此前“停止发现绕过缓存”的说明为历史状态。

### 正常批量流程

1. main 在一轮批量停止开始清一次旧缓存，随后仍并行提交各实例原 stopService。
2. 第一位 fork 查询完整列表，其他并发请求 join；650ms 内的后续首次发现 hit，同一采样不重复 CIM。
3. 模块各自从完整表选根/后代，首次身份绑定原对象，父先子后提交完整 PID。
4. 各实例实际停止完成后，本地新查询确认本次原目标退出；PHP 残留回收和文件清理继续共用其末次列表。
5. 没有 main provider 的独立时间脚本继续本地查询，不会凭空获得跨 fork 缓存。其 queryCount 与真实应用批量退出不能直接等同。

### 边界与限制

- TTL 到期、分组/伴随停得较晚、不同批次边界或并行启动使缓存失效时，允许重新查询；不保证整个批次所有请求永远拿到同一时点。
- 对已缓存 PID 的执行仍核对首次创建时间，旧表不能授权 PID 后来的占用者；不能把缺字段/查询异常改成成功。
- 同一列表只用于发现。停止后确认、追加 worker 的检测、Unix 信号复核和数据库退出轮询仍新查；没有减少这类必要查询，也没有宣称总数固定两次。
- 查询失败传播，缓存不发布失败结果；若 main 通道失败，本地严格回退可能增加查询，这是故障恢复开销。
- 当前只是恢复停止前查询共享，权限 broker/PowerShell action 成本仍存在；最终耗时以实机日志为准。
- 新状态仅为 main 内存 revision/Promise，未新增配置或 Pinia；本轮无 Go 源码调整，Helper 版本保持 34。

## 本轮源码检查

- 14 个调整的 TypeScript 文件经 parser 读取，语法诊断为 0；不是完整类型检查。
- 核对 main→bridge→client→provider 既有通道、首次发现入口、保留新查询的位置、缓存回填与 finally 的代次/Promise 竞态，以及建树工具不修改共享首表。
- 修改文件的 `git diff --check` 无空白错误；未运行功能测试、类型检查、构建、格式工具或实际服务停止。缓存合并效果可由下一份真实应用 debug.log 的 hit/join/miss 观察，独立时间脚本没有 main provider 时仍本地查询。
