# FlyEnv AI Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现经效果与数据可靠性验证的 AI Memory 开发者预览，让 Codex、Kimi 通过 FlyEnv 按项目共享、更新和删除记忆。

**Architecture:** 记忆业务集中在 `plugins/ai-memory/`，以每条 JSON 元数据和不可变 Markdown 正文持久化。宿主提供声明式 MCP 注册、专属 worker 路由、数据目录排他所有权和退出等待；UI/MCP 使用同一个 MemoryEngine。按“效果实验 → 宿主最小验证 → 可靠闭环 → 日常预览”的顺序交付。

**Tech Stack:** 仓库现有 TypeScript、Vue 3、Element Plus、Electron utilityProcess、Node 文件 API、MCP SDK、tsx/node:test；不引入数据库、向量服务或额外常驻进程。进程持有的锁原语在 Task 2 实测选定。

**Spec:** [目标设计](../specs/2026-11-02-flyenv-ai-memory-design.md)；[V1 范围与验收](../specs/2026-11-02-flyenv-ai-memory-v1.md)。冲突时以 V1 范围为准，可靠性语义仍遵循目标设计。

状态：2026-11-03 编写；设计已获用户认可，本计划尚未执行。测试命令与通过条件是实施要求，不是已取得的结果。

## Global Constraints

- 数据根由宿主确定为 `<BaseDir>/plugins-data/ai-memory`，不随插件代码版本变化，不接受 MCP 指定数据目录，不向项目仓库写记忆。卸载默认保留数据。
- 只有 `project`、`global`；project 使用绝对根路径、realpath 与稳定 UUID。同名目录和 worktree 隔离，未知子目录只返回祖先候选，独立新建须显式 `create_project=true`；搜索不登记项目。
- 八种类型固定为 `preference/fact/event/procedure/project_state/decision/observation/note`。标题 120 字符、摘要 600 字符、最多 12 个 tag、正文最多 **16 KiB UTF-8**；超限拒绝，不截断。字符限额按 Unicode code point 计数，字节限额按 UTF-8 计数。
- 五个 MCP 工具固定为 `flyenv_memory_search/get/store/update/forget`。get 一次返回一个完整 revision，无正文 cursor；search 默认 8 条、最多 20 条，文本预算默认 8 KiB、最大 32 KiB，保留摘要分页。
- 唯一 worker、稳定数据根互斥键、进程持有的目录排他锁、稳定 scope 协调队列缺一不可。generation 是 owner 属性，不能成为互斥键；PID 文件、超时删锁不能替代内核锁。
- JSON 为提交边界，正文先落盘；projects 主映射覆盖前保存上一有效快照。成功后才发布缓存，结果未知时阻止依赖写入；原子替换不等于所有断电场景保证。
- revision、request_id、历史快照与无内容 tombstone 均为 V1 必须项。不能裁剪幂等凭据、自动合并记录、静默重试冲突或用新 ID 重放未知操作。
- 不新增 Pinia，不写 `config.setup`；偏好用 `StorageGetAsync/StorageSetAsync`，领域与操作状态用插件局部 class + `reactiveBind`。JSON/MD 是用户指定的 fork 侧数据介质，无须复制到 renderer Storage。
- 无软件版本、服务端口或外部服务，不伪造 `SoftInstalled`。通用 worker 生命周期由宿主管理；没有申请新的模块约束例外。
- 诊断最多 **200 条易失记录**；正文、标题、摘要、来源内容、查询原文及原始异常不得进入通用审计。日志/通知失败不得改变已提交结果。
- 规则复制/下载是手工接入预览，不能标成已安装或真实调用成功。自动规则接入、主动工具变更通知、完整历史 UI、正文分页、别名/重绑定、批量删除和备份向导不在本次实现内。
- 只对完成原生文件系统、锁、进程生命周期验收的平台声明支持。无权限或无对应机器时记录未验收，不能用路径模拟测试替代。

## Review Focus

1. 相同名称、软链接/junction、大小写、路径组件相似、未知子目录和已搬走根目录：隔离正确且不会自动认领父项目；Task 6、10 验证。
2. JSON 已替换但响应丢失、同步失败、删除中途退出：可凭原请求确认，旧 store/update 不能复活数据；Task 7、8 验证。
3. 回调已结算但进程仍活着、宿主崩溃留下 worker、审批期间换代：不能启动第二个写入者或派发旧请求；Task 2、4、5 验证。
4. 嵌套参数、伪装成 ID 的敏感文本、未知/停用工具、原始错误消息：所有审计出口都不能落盘内容；Task 5、10 验证。
5. 淘汰遇到读/写/冷加载、分页中发生更新、坏记录与总容量超限、映射损坏：不产生第二条队列、不伪装完整结果、global 可独立工作；Task 6、8、9 验证。

---

## 交付顺序与阶段门槛

| 阶段 | 任务 | 可独立验收的交付 | 进入下一阶段的条件 |
| --- | --- | --- | --- |
| A 效果实验 | 1 | 临时单进程样例、检索器、规则、对照报告 | 30～50 条预标注问题有真实结果；关键失败已修正或明确需要调整设计 |
| B 宿主最小验证 | 2–5 | API 兼容门槛、极简插件、工具目录、唯一 worker、退出等待 | 原生锁/替换原型通过；极简插件证明 UI/MCP 同状态，禁用与换代无竞态 |
| C 可靠闭环 | 6–11 | 映射与记录协议、五个工具、管理页、诊断与手工规则入口 | 故障、并发、隔离、容量和 controller 合同通过 |
| D 日常预览 | 12 | 双 Agent 实际使用、资源默认值与平台验收报告 | 每项有证据；未通过项如实保留，不提前发布支持声明 |

宿主能力与记忆业务分阶段提交，但共用本计划定义的接口，避免两套独立方案在路由/数据根/终态上分歧。默认按任务顺序执行；不得在 Task 5 通过前接正式记忆文件共享写入。

执行准备：按 `using-git-worktrees` 检查/建立隔离工作区，把本计划和两份已确认 spec 带入；保留当前工作区中任务稿、review 和 `plugins/registry.json` 的已有改动。记录已有检查基线，后续提交只暂存本任务文件，不使用 `git add .`。本轮写计划不创建 worktree、不提交代码。

## 文件职责与接口地图

下列路径标记“新增”均在执行时创建；同一文件可被后续任务扩展。测试文件在各任务中列出。

| 文件 | 方式 | 职责 |
| --- | --- | --- |
| `plugins/ai-memory/shared.ts`、`core/validation.ts`、`core/search.ts`（均在该插件目录下） | 新增 | 插件局部协议、校验、纯检索算法；无宿主业务泄漏 |
| `plugins/ai-memory/core/limits.ts` | 新增 | 测试资源上限与实测后固定的预览默认上限 |
| `plugins/ai-memory/fork/AtomicFile.ts`、`ProjectRegistry.ts`、`ScopeCoordinator.ts`、`RecordStore.ts`、`Deletion.ts`、`ScopeCache.ts`、`MemoryEngine.ts` | 新增 | 各自负责文件提交、路径映射、scope 排队、版本记录、删除恢复、缓存、业务入口；这些文件全部位于 `fork/` |
| `plugins/ai-memory/plugin.json`、`fork/index.ts`、`render/Module.ts`、`render/aside.vue` | 新增 | 非服务插件声明与标准入口 |
| `plugins/ai-memory/render/controller.ts`、`manager.ts`、`Index.vue`、`MemoryEditor.vue`、`MemorySetup.vue`、`lang.ts` | 新增 | 操作控制、依赖绑定、页面与编辑草稿、设置和诊断展示；均位于 `render/` |
| `plugins/ai-memory/lang/en.ts`、`zh.ts`、`index.ts`；`assets/memory-rules.md`；`README.md` | 新增 | 中英文、随包规则、手工接入和离线备份恢复说明；相对路径均以插件根为准 |
| `src/shared/plugin/PluginMCP.ts`、`PluginRuntime.ts`；`src/shared/mcpRuntimeCatalog.ts` | 新增 | 只定义通用声明、运行时身份、工具描述/诊断协议 |
| `src/shared/plugin/PluginManifest.ts`、`scripts/plugin-builder.ts` | 修改 | manifest/API 兼容校验、catalog 元数据透传、打包兼容性 |
| `src/main/core/PluginWorkerRegistry.ts`；`src/fork/runtime/DataRootLease.ts`、`PluginWorkerRuntime.ts` | 新增 | 主进程 owner、worker 内进程锁与 ready/shutdown 协议 |
| `src/main/core/ForkManager.ts`、`ForkItem.ts`；`src/fork/index.ts`、`BaseManager.ts`、`PluginLoader.ts` | 修改 | 专属路由、真实 exit、运行时初始化与旧插件兼容 |
| `src/main/plugins/PluginManager.ts`、`src/main/Application.ts` | 修改 | 安装代次、动态目录同步、停用/换代/退出顺序 |
| `src/main/core/PluginMCPRegistry.ts`、`PluginMCPAudit.ts` | 新增 | 动态工具注册/派发令牌，以及白名单诊断投影/易失环 |
| `src/main/core/MCPServer.ts`、`MCPAudit.ts`、`MCPRuntime.ts`、`IPCHandler.ts` | 修改 | HTTP 调用与全部审计出口接入、未启动服务时的工具列表 IPC |
| `src/render/components/MCP/setup.ts`、`Tools.vue`；`src/render/components/Setup/Plugins/controller.ts`、`index.vue` | 修改 | 动态工具开关、兼容提示，不往静态内置工具表加入 Memory 名称 |
| `src/render/components/MCP/clientConfig.ts` | 新增 | 从既有 addToClient 提取可复用的客户端配置请求；复用现有配置构造和 fork 方法 |
| `scripts/plugin-mcp-runtime-smoke.ts`、`scripts/plugin-memory-runtime-probe.ts`、`scripts/ai-memory-acceptance.ts` | 新增 | 临时数据根下的宿主集成、原生原型、完整插件验收；不碰用户数据 |
| `docs/superpowers/reports/2026-11-03-flyenv-ai-memory-*.md` | 新增 | 实际执行后填写 effect/runtime/capacity/acceptance 四份报告，不预写通过结论 |

### 接口约定

- `plugins/ai-memory/shared.ts` 定义 `ScopeRef = { scope: 'global' } | { scope: 'project'; project_path: string }`、`ResolvedScope = { key: string; directory: string; projectId?: string }`。后者只能由 registry 创建，不接受网络输入的磁盘路径。
- 同文件定义 `MemoryMethod = 'search' | 'get' | 'store' | 'update' | 'forget'`，`MemoryInputs`/`MemoryOutputs` 按这五个方法映射目标设计 §8 的字段和结果；`MemoryAPI.call<M extends MemoryMethod>(method: M, input: MemoryInputs[M]): Promise<MemoryResult<MemoryOutputs[M]>>` 是测试 harness、fork 适配及 controller 共用边界。
- `MemoryResult<T>` 使用可判定 `outcome`，可含 `data/id/revision/warnings/error_code`；覆盖 `success/partial/failed/conflict/unknown/deleted/already_deleted/busy`。`request_conflict/capacity_exceeded/project_selection_required/owner_busy/cursor_invalid` 等属于 `error_code`；不得用错误字符串冒充成功。Task 1 固定此映射及 schema，所有层保持一致。
- 记录类型 `MemoryDraft/MemorySnapshot/MemoryRecord/MemoryTombstone/SearchHit/SearchPage/ScopeBudgets` 同属插件：source 的 kind、agent、description 必填；每版含 change_reason，初版为 initial。schema 同时限制可扩张字符串/数组，附属字段的具体限额记录在 `limits.ts`，不靠 JSON 文件总限额代替输入校验。
- `PluginRuntimeDescriptor` 包含 `pluginId/moduleId/dataRoot/installGeneration/workerGeneration`；dataRoot 由宿主规范化实际目录。`DataRootLease.acquire(dataRoot): Promise<Lease>` 返回进程持有的 `Lease.release(): Promise<void>`；仅 worker 完成排空且不再读写时正常释放，崩溃释放由操作系统完成。
- `PluginWorkerRegistry.dispatch(descriptor, method, args)` 只接受当前 owner；`close(pluginId): Promise<void>` 只有真实进程退出才成功。`ForkItem.closeAndWait(): Promise<void>` 使用实际子进程句柄的退出事件，不读逻辑 childExited 判断完成。
- `PluginMCPRegistry.replace(snapshot)` 更新目录；`listTools()` 返回内置及动态描述；`capture(name)` 生成带安装/worker 身份的派发令牌，`dispatch(token,args)` 再校验。首次 lazy worker 创建必须 singleflight；令牌与派发绑定同一个 ready owner。
- `ScopeCoordinator.run<T>(scope: ResolvedScope, work: (lease: ScopeLease) => Promise<T>): Promise<T>` 按 scope.key 排队；`ScopeLease` 在该文件定义，只在回调内有效并携带只读 scope。MemoryEngine 每次操作只入队一次，RecordStore/Deletion/ScopeCache 消费同一 lease，不在队列内再次排队；早期单测用 coordinator.run 模拟 Engine。多 scope 搜索逐个固定快照，不同时嵌套持有两个 scope。
- controller 依赖注入 `MemoryAPI`、Task 10 的 `MemoryAdminAPI`、偏好读写、MCP 配置、复制/导出、打开目录和通知函数。生产 `manager.ts` 绑定宿主 IPC；测试可替换依赖。响应丢失保留原 request_id 与参数，不自动重建操作。

### 状态与操作合同

| 操作 | Owner / 生命周期 | 开始与中间事件 | 终态与重复调用 | 服务交互 / 必测项 |
| --- | --- | --- | --- | --- |
| 范围加载、搜索、详情 | MemoryController；可跨页面；缓存归 worker | 固定请求条件，loading；code 200 非终态 | result/partial/error；冷加载合并；旧 UI 请求代次不能覆盖新条件 | 无服务；重入、旧响应、监听释放、忙时不淘汰 |
| 保存、更新、归档、删除 | MemoryController；worker scope 队列权威 | 固定输入/request_id，queued/writing/cleaning | success/partial/conflict/failed/unknown；双击复用当前操作；终态释放 busy 与监听 | 无服务；离页仍完成，原请求确认，删除恢复，通知失败不重写 |
| 配置 MCP、复制/导出规则 | MemoryController；每个客户端/动作独立 | 配置写入、复制或导出处理中 | 各自成功/失败；同客户端在途复用；复制不表示安装 | 复用既有 Agent 配置 fork 方法；一个客户端失败不撤销另一个成功结果 |
| 读取诊断、打开数据目录、恢复指引 | MemoryController；跨页面等待至终态 | 只读诊断/宿主确定目录；显式请求恢复检查 | 各自结果/失败；诊断失败不改记忆结果 | 无服务；错误可见，不在 UI 传任意目录替换数据根 |
| 停用、升级、卸载、应用退出 | PluginWorkerRegistry + worker runtime | accepting → draining → closing | stopped 必须真实 exit；重复 close 复用 Promise；无法确认保持失败/busy | 不调用版本服务启动流程；退出顺序、超时 unknown、旧 worker 存活拒绝接管 |

### 失败传播合同

| 步骤 | 类别 | 失败可阻断的范围与已完成事实 |
| --- | --- | --- |
| 取得目录锁、映射解析、写 previous、正文提交、记录 JSON 提交 | 必要依赖 | 阻断依赖写入；登记已成功但正文失败可留空项目，不能报告记忆已保存 |
| JSON 已替换后的持久性确认 | 必要依赖 | 返回 unknown、冻结该范围后续写入；重载凭据确认，不能重放已可能完成的操作 |
| 每条坏记录、每个 pending 删除清理 | 独立单项 | 收集 skipped/partial 原因，继续其他有效项；共享 scope 总预算不足仍报告 capacity_exceeded |
| forget 受管理文件清理、complete 回执 | 必要依赖 | 未完成不能返回完整删除成功；已 tombstone 的数据继续不可读，保留已清理事实 |
| 通知、诊断、配置后的规则复制 | 附加或独立动作 | 只影响自身，不拒绝或重试已完成主操作；后台失败必须被接收 |

实现与最终 review 均按 `docs/skills/flyenv-failure-boundaries/SKILL.md` 逐项检查新增 throw/reject/return、批次汇总与调用层传播。

## Task 1：协议、检索与记忆规则的效果实验（阶段 A）

**Files — 新增：** `plugins/ai-memory/shared.ts`、`plugins/ai-memory/core/validation.ts`、`plugins/ai-memory/core/search.ts`、`plugins/ai-memory/core/limits.ts`、`plugins/ai-memory/assets/memory-rules.md`；`plugins/ai-memory/tests/fixtures/memories.json`、`plugins/ai-memory/tests/fixtures/queries.json`、`plugins/ai-memory/tests/evaluation.test.ts`、`plugins/ai-memory/tests/validation.test.ts`；`plugins/ai-memory/scripts/evaluate.ts`；`docs/superpowers/reports/2026-11-03-flyenv-ai-memory-effect.md`。

**Interfaces:** 产出上述 MemoryAPI/types/schema；`rankMetadata(records, input): SearchHit[]` 只接收已解析元数据；测试 harness 用同接口和临时单进程 Map，不提供真实持久写入服务。

- [ ] 固定脱敏样例、30～50 个问题、预标注相关 ID/无答案项与调试/验收拆分。覆盖自然改写、中英文、`issue-913` 等标识、更新后的决策、global、旧事件；记录原始 MEMORY skill 基线版本，未知真实数据用明确标记的构造案例，不捏造用户事实。
- [ ] 写 `validation.test.ts`：中文/emoji 的 16 KiB 边界、120/600 字符、12 tags、必填 source/reason、global 携带路径、相对路径、无效 UUID、get 携带 cursor 均按协议接受或拒绝；更新超限不得改变旧值。
- [ ] 写 `evaluation.test.ts`：精确标题/topic/tag 胜过摘要；非空查询无命中时 pinned 仍不返回；scope/status/过期先过滤，稳定同分顺序。先运行 `yarn tsx --test plugins/ai-memory/tests/validation.test.ts plugins/ai-memory/tests/evaluation.test.ts`，确认因未实现合同失败。
- [ ] 实现插件局部类型、输入校验与纯检索器：英文词、中文子串/双字、技术标识、queries 扩词；明确排序规则，不增加 Provider/Embedding 框架。`limits.ts` 为实验显式给定有限测试预算，标记为测试值，不宣称预览默认。
- [ ] 编写规则：先确认根目录/检索，Explicit 必须返回真实 ID/revision 或失败/未知；Automatic 及时保存稳定事实，source 不编造；冲突重新读、超时不换 ID；规则保存在 builder 会复制的 `assets/`。
- [ ] 实现 `evaluate.ts`，以单进程临时工具 harness 执行原始 query 与扩词 query 两组；与 MEMORY.md 在相同资料/模型/上下文预算下对照。报告有答案项 Recall@5、无答案误召回、Explicit 回执、Automatic 机会覆盖率/误存和实际 token 数据，缺少实测项标记未执行。
- [ ] 重跑两个测试并运行 `yarn tsx plugins/ai-memory/scripts/evaluate.ts --fixtures plugins/ai-memory/tests/fixtures --report docs/superpowers/reports/2026-11-03-flyenv-ai-memory-effect.md`。关键场景失败先归因和修正；85% 不是未经校准的硬门槛，不能把 harness 成功当实际 Agent 规则成功。
- [ ] 仅暂存本任务已列文件，提交 `feat(ai-memory): define protocol and evaluate retrieval rules`。阶段 A 报告需要真实 Agent 对照证据；未取得时保留门槛未通过，不标记整体实验完成。

## Task 2：目录锁与原子文件提交的原生验证（阶段 B 前置）

**Files — 新增：** `src/fork/runtime/DataRootLease.ts`；`plugins/ai-memory/fork/AtomicFile.ts`；`plugins/ai-memory/tests/atomic-file.test.ts`；`scripts/plugin-memory-runtime-probe.ts`；`test/fixtures/plugin-memory-runtime-probe-worker.ts`；`docs/superpowers/reports/2026-11-03-flyenv-ai-memory-runtime.md`。**条件修改：** 选定小型锁依赖后才修改 `package.json`、`yarn.lock` 和 `configs/esbuild.config.ts` 中其打包项。

**Interfaces:** 产出 `DataRootLease.acquire()`；`AtomicFile.replace(path, bytes): Promise<'committed'>`，失败用结构化错误携带 `failed | unknown` 提交状态；注入文件 IO/fault hook 仅供测试，无生产任意故障开关。

- [ ] 编写失败测试和原生 probe：双 utilityProcess 竞争同目录；持有者退出后释放；宿主退出但 worker 尚存拒绝第二宿主；锁文件存在不等于占用，禁止通过删除锁文件接管。probe 自己收尾所有测试子进程，所有路径使用临时目录。
- [ ] 运行 `yarn tsx --test plugins/ai-memory/tests/atomic-file.test.ts` 和 `yarn tsx scripts/plugin-memory-runtime-probe.ts`，确认缺少实现/锁适配时失败，而非静默跳过。
- [ ] 核实候选锁原语的官方 API、Electron ABI、目标架构、许可与打包行为，在 runtime 报告记录选型。锁对象使用目录中固定独立文件，锁由实际 worker 持有；无可行方案就保留阶段阻断并回到设计，不以 PID/超时删锁降级。
- [ ] 实现 `AtomicFile.replace`：同目录临时文件、写入/sync/关闭、rename 替换、支持处目录 sync；禁止先 unlink 旧文件。替换前失败保留旧版；替换后不能确认持久性返回 unknown。正文不可变文件的发布也复用这一原语。
- [ ] 在 Electron 实际运行环境重跑 probe；注入写入、sync、rename、rename 后同步失败，以及关键点强制退出，断言只见完整旧版/新版或明确 unknown。记录 OS、文件系统、Electron/Node、架构和同步能力；Node 单测不能替代 utilityProcess/打包测试。
- [ ] 为当前平台产出可重复结果；Windows/Linux 未运行就列未验收，仅对通过的平台继续预览。通过锁与提交门槛后，仅暂存本任务文件及实际需要的依赖变更，提交 `feat(plugins): validate exclusive data ownership primitives`。

## Task 3：通用插件能力声明与 API 兼容门槛

**Files — 新增：** `src/shared/plugin/PluginMCP.ts`、`src/shared/plugin/PluginRuntime.ts`；`plugins/tests/plugin-mcp-manifest.test.ts`。**修改：** `src/shared/plugin/PluginManifest.ts`、`scripts/plugin-builder.ts`、`src/main/plugins/PluginManager.ts`、`src/render/components/Setup/Plugins/controller.ts`、`src/render/components/Setup/Plugins/index.vue`；`plugins/README.md`。

**Interfaces:** manifest 新增 `runtime: { mode: 'dedicated', dataAccess: 'exclusive' }` 与 `mcp.tools[]`（name/description/inputSchema/method/readOnly/risky）及 `mcp.audit: 'metadata-volatile'`。`PluginMCPDeclaration`/`PluginRuntimeDescriptor` 来自通用 shared 文件；不定义 Memory 业务字段。

- [ ] 写兼容测试：新宿主接受 API 1 原插件及 API 2 新插件；API 1 声明新能力拒绝；未来 API 拒绝；空/重复/与内置冲突的工具名、无 fork、无专属模式、非法方法/原型方法、无效 schema 均拒绝。保留旧宿主严格 API 1 检查样例，确认 API 2 不会被静默安装。
- [ ] 运行 `yarn tsx --test plugins/tests/plugin-mcp-manifest.test.ts` 确认新声明尚不支持；实现最高 API 2、显式支持集合 `[1, 2]`，不把旧插件强制升级。
- [ ] 实现 manifest/catalog 的 `apiVersion` 元数据与兼容提示；catalog 缺字段保持旧格式兼容，最终安装仍校验包内 manifest。新工具默认关闭，初装不静默授予权限；mutating 工具走既有审批策略。
- [ ] builder 透传声明并验证打包后入口，沿用现有 assets 复制；测试用 `buildPlugin(name, { outputRoot: temp, archive: false })`。不要运行会更新正式 registry 的 `yarn plugin:build`。
- [ ] 重跑新测试及 `yarn tsx --test plugins/tests/plugin-manager-dev-mode.test.ts plugins/tests/plugin-startup.test.ts`；检查旧 API 插件行为无新增失败。仅暂存本任务文件，提交 `feat(plugins): declare MCP and dedicated runtime capabilities`。

## Task 4：专属 worker、ready 门槛与真实退出

**Files — 新增：** `src/main/core/PluginWorkerRegistry.ts`、`src/fork/runtime/PluginWorkerRuntime.ts`；`test/plugin-worker-lifecycle.test.ts`。**修改：** `src/shared/plugin/PluginRuntime.ts`、`src/main/core/ForkManager.ts`、`src/main/core/ForkItem.ts`、`src/main/Application.ts`、`src/main/plugins/PluginManager.ts`、`src/fork/index.ts`、`src/fork/BaseManager.ts`、`src/fork/PluginLoader.ts`。

**Interfaces:** 消费 Task 2/3；产出 `PluginWorkerRegistry.dispatch/close`、`ForkItem.closeAndWait`。worker runtime 执行 `initialize(descriptor): Promise<void>`，取得 lease 并 await 插件运行时初始化后才发 ready；shutdown 排空后退出。旧模块同步 init 行为保持兼容。

- [ ] 写 `plugin-worker-lifecycle.test.ts`：并发首调只创建一个 worker；UI/MCP 同 module 选中同 owner；生成新 installGeneration 不改变 dataRoot 锁键；未 ready 不执行；初始化失败释放资源且不发布 owner。
- [ ] 增加竞争测试：drain 完但真实 exit 未发生保持 stopping；退休进程也兑现 exit 等待；宿主停止无服务 PID 仍关闭插件 worker；审批旧代次/退出超时不能启动替代者；重复 close 等待同一过程。运行 `yarn tsx --test test/plugin-worker-lifecycle.test.ts` 确认 RED。
- [ ] 主进程按规范化实际 dataRoot 登记 owner，ForkManager 在普通池前识别 dedicated；新增 ready/shutdown 通道，由 worker runtime 负责锁与业务初始化。将 PluginManager/PluginLoader 现有两份 fork snapshot 类型统一引用 `PluginRuntime.ts`，带上通用运行时声明/代次；不要依赖当前未 await 的 `BaseManager.init()` 取得异步锁，不在模块 import 时打开库。
- [ ] 给每个实际 child 独立 exit Promise，retired 分支也先结算它；既有 childExited 只保留为禁止派发标志。close 关门→排空→关闭→等实际 exit；强制终止的未确认请求标 unknown，不自动 replay。
- [ ] 将禁用/升级/卸载/应用退出接入同一关闭入口，先停止专属 worker 再变更代码；失败保留旧 owner/busy，不继续替换。卸载不删持久目录，页面销毁不关闭 worker。
- [ ] 重跑生命周期测试及 Task 2 原生 probe，确认 actual exit 与锁释放均成立；仅暂存本任务文件，提交 `feat(plugins): own dedicated workers through actual exit`。

## Task 5：动态 MCP、全出口诊断与极简插件验收

**Files — 新增：** `src/main/core/PluginMCPRegistry.ts`、`src/main/core/PluginMCPAudit.ts`、`src/shared/mcpRuntimeCatalog.ts`；`test/plugin-mcp-registry.test.ts`、`test/plugin-mcp-audit.test.ts`；`plugins/tests/fixtures/mcp-runtime/plugin.json`、`plugins/tests/fixtures/mcp-runtime/fork/index.ts`、`plugins/tests/fixtures/mcp-runtime/render/Module.ts`、`plugins/tests/fixtures/mcp-runtime/render/Index.vue`；`scripts/plugin-mcp-runtime-smoke.ts`。**修改：** `src/main/core/MCPServer.ts`、`src/main/core/MCPAudit.ts`、`src/main/core/MCPRuntime.ts`、`src/main/core/IPCHandler.ts`、`src/main/core/ForkItem.ts`、`src/main/Application.ts`、`src/render/components/MCP/setup.ts`、`src/render/components/MCP/Tools.vue`。

**Interfaces:** 产出 registry 的 replace/listTools/capture/dispatch；`mcp:listTools` IPC 即使 HTTP 尚未启动也返回当前描述；`plugin:diagnostics` 返回指定插件的白名单易失记录。测试插件仅维护一个计数器和可控延迟，不实现 Memory。

- [ ] 编写 registry 测试：安装后可发现但默认未启用，开启后调用；禁用/卸载马上移除；同名冲突拒绝；等待审批时禁用/升级，批准后旧令牌仍被拒绝；lazy worker 只创建一次；保留现有无状态 transport，不加入 tools/list_changed。
- [ ] 编写 audit 测试：成功/业务失败/异常/审批取消/未知/停用工具分别输入嵌套正文、query、伪 ID、含内容的错误；包含 ForkItem 错误事件的 report 字段，audit.log/fork.error.txt 均无原文。第 201 条覆盖最旧一条，重启为空，诊断抛错不改变主结果。运行 `yarn tsx --test test/plugin-mcp-registry.test.ts test/plugin-mcp-audit.test.ts` 确认 RED。
- [ ] 注册表独立于 MCPServer 实例维护快照；接入既有 enabledTools/approval 配置。每次真正派发检查启用、安装/worker 代次，审批 await 后重验；UI 通用 fork 路由与 MCP 使用 Task 4 同入口。
- [ ] 在任何 `MCPAudit.log` 或错误日志前执行声明式审计策略：只允许工具、时间、经格式验证的 UUID/版本、结果/耗时/命中数/截断/错误码与标记来源的客户端身份；不保存 raw args、raw error。未知工具走无内容策略；停用/换代保留其日志策略，不能掉回旧参数日志分支。Memory 策略不再重复写 audit.log；带该策略的 dedicated worker 在 `ForkItem.onError` 也投影元数据，不能把原始 report 写进 fork.error.txt。仅收紧该声明路径，不顺手改造无关服务日志。
- [ ] 设置页改为读取运行时工具描述，保留内置翻译与动态 description 回退；开关/审批使用名称字符串，不把 Memory 名称塞入 `mcpToolCatalog.ts`。提示客户端刷新/重连，不能声称主动通知已实现。
- [ ] smoke 在独立 `FLYENV_DATA_ROOT` 下构建/安装极简 fixture，通过真实 UI IPC 与 HTTP 交替读写同一计数器，验证禁用拒绝、审批竞态、等待实际退出、升级和保留目录；复用现有 runtime-smoke 隔离方式，不操作用户服务。
- [ ] 运行两项新测试、`yarn tsx test/mcp-tool-metadata.test.ts`、`yarn tsx --test test/mcp-http-stop.test.ts`、`yarn tsx scripts/plugin-mcp-runtime-smoke.ts`。全部通过后更新 runtime 报告；仅暂存本任务文件，提交 `feat(mcp): expose plugin tools with private diagnostics`。这是接入真实存储前的阶段 B 门槛。

## Task 6：项目登记、上一版映射与显式恢复检查（阶段 C）

**Files — 新增：** `plugins/ai-memory/fork/ProjectRegistry.ts`；`plugins/ai-memory/tests/project-registry.test.ts`。**修改：** `plugins/ai-memory/shared.ts`（项目列表/候选/恢复报告类型）。

**Interfaces:** `ProjectRegistry.resolve(ref, { create, createProject }): Promise<ResolvedScope | MemoryResult<never>>`；`resolveById(projectId)` 仅供 UI；`listProjects()`；`inspectRecovery(): Promise<ProjectRecoveryReport>`。检查报告列出主映射/previous 有效性和未映射目录 ID，不自动恢复。

- [ ] 写隔离测试：同名目录、组件相似前缀、软链接/junction、大小写按实际卷行为、中文/空格、worktree；search 未知根无文件副作用；祖先候选不泄露记录，store 不确认拒绝，create_project 明确创建，已登记独立子项目精确命中。
- [ ] 写失败测试：previous 写失败保持主文件；主替换前失败保留旧映射；替换后同步失败 unknown；主映射损坏/缺失但存在项目目录不能建空库；global 独立可用。旧路径消失仍可按 ID 管理，恢复 previous 缺少的项目列为未映射且目录保留。
- [ ] 运行 `yarn tsx --test plugins/ai-memory/tests/project-registry.test.ts` 确认 RED；实现独立登记队列和 realpath/路径组件匹配，不统一 lower-case、不找 Git root、不绑定 remote URL。
- [ ] 用 AtomicFile 执行“校验旧映射 → 保存 previous → 提交主文件 → 发布”的必要顺序；首次空库与损坏库明确区分。新登记先完成才写记忆，失败不得声称保存成功。
- [ ] 实现显式恢复检查，仅用户请求时列项目目录；正常启动不扫描全项目。README/UI 将给出停用并等待 worker 退出、保留故障文件、显式复制已验证 previous、重新启用检查的步骤，不新增在线恢复/合并接口。
- [ ] 重跑测试；原生路径行为标记适用平台，不把模拟 case 当实机通过。仅暂存本任务文件，提交 `feat(ai-memory): isolate projects and preserve mapping recovery`。

## Task 7：scope 协调、记录提交、版本读取与幂等

**Files — 新增：** `plugins/ai-memory/fork/ScopeCoordinator.ts`、`plugins/ai-memory/fork/RecordStore.ts`；`plugins/ai-memory/tests/record-store.test.ts`、`plugins/ai-memory/tests/scope-coordinator.test.ts`。**修改：** `plugins/ai-memory/shared.ts`、`plugins/ai-memory/core/validation.ts`。

**Interfaces:** 按公共约定实现 `ScopeCoordinator.run` 与 `ScopeLease`，以 `retain/release` 管理引用；`RecordStore.store(lease,input)`、`update(lease,input)`、`get(lease,input)` 返回对应 MemoryResult。变更成功返回已提交 current 元数据供缓存发布，不直接依赖 ScopeCache，也不二次入队。

- [ ] 写测试：同 scope 并发不同记录均保存、相同 expected_revision 仅一个更新成功、跨 scope 可独立执行；同 store 请求同参数重放原结果/异参冲突；update 查凭据先于旧 expected_revision；重启后仍能识别旧成功请求。
- [ ] 写读取/故障测试：初版 reason=initial、历史保留各自 change_reason；正文未变复用引用，改变则新 bodyId；16 KiB UTF-8 校验；get 选定 revision 的正文长度/哈希正确，缺失/损坏/未知 schema 拒绝；JSON 前故障保留旧版，JSON 后同步失败返回 unknown 并阻断范围写入。
- [ ] 运行 `yarn tsx --test plugins/ai-memory/tests/record-store.test.ts plugins/ai-memory/tests/scope-coordinator.test.ts` 确认 RED；实现 deterministic UUID（scope key + request_id）与规范化请求 digest，记录/历史/请求凭据同 JSON 提交，不引入第二份事务日志。
- [ ] 实现正文先提交、完整 JSON 最后替换；业务 ID/body_ref 只能经 schema 与目录约束生成，不能越界访问。孤立 MD/临时文件追踪本次操作，维护时经引用核对才清理，不误删历史引用。
- [ ] get 的选版/读 MD/校验/固定结果全部在同 scope 队列内，响应发送在队列外；未知提交恢复先读持久凭据确认，缓存发布失败只失效重载不重写。协调对象仅无引用/排队/活跃操作时可回收。
- [ ] 重跑两项测试及 atomic-file 测试；仅暂存本任务文件，提交 `feat(ai-memory): commit revisions with durable request receipts`。

## Task 8：无内容删除凭据与 pending 恢复

**Files — 新增：** `plugins/ai-memory/fork/Deletion.ts`；`plugins/ai-memory/tests/deletion.test.ts`。**修改：** `plugins/ai-memory/fork/RecordStore.ts`、`plugins/ai-memory/shared.ts`（均在插件内）。

**Interfaces:** `Deletion.forget(lease,input)`、`resumePending(lease,id)` 消费同一 ScopeLease，不嵌套排队；RecordStore 所有入口先识别 tombstone。清理返回结构化逐项结果，scope 恢复可继续其他记录。

- [ ] 写测试：tombstone 只含 schema/id/deleted_revision/forget 请求摘要与清理状态；提交后 current/历史均 deleted；旧 store/update 不复活；同请求 complete 重放 success、pending 继续清理、同 ID 异参冲突、另请求 complete=already_deleted/pending=deletion_pending。
- [ ] 写顺序测试：get 先固定快照后故意延迟发送，forget 成功后旧响应允许晚到；forget 先提交则随后逻辑 get deleted；成功响应后新 get 必须 deleted。不得通过发送前二次查询创造不可兑现的撤回保证。
- [ ] 写清理故障测试：任一受管理文件删除失败保留 pending/partial；文件清完但 complete 写失败保留事实；多个 pending 中一个失败不阻断其余；总 scope 容量超限仍能按 ID 删除/恢复；未访问 scope 不扫描。运行 `yarn tsx --test plugins/ai-memory/tests/deletion.test.ts` 确认 RED。
- [ ] 实现 tombstone 提交→发布删除状态→清理该 ID 全部受管理正文/历史/临时文件→complete 回执；重试只恢复原删除，不覆盖原 request_id、不增加删除版本，回执永久保留且无内容。
- [ ] 实现 scope 首次访问的有界恢复入口，与正常操作共享队列，失败逐条收集；直接按 ID get/写入也必须识别 pending/deleted。重跑删除、记录和协调测试，确认已完成主结果不被诊断失败改写。
- [ ] 仅暂存本任务文件，提交 `feat(ai-memory): recover deletion without reviving content`。

## Task 9：有界懒加载、搜索分页与容量实测

**Files — 新增：** `plugins/ai-memory/fork/ScopeCache.ts`；`plugins/ai-memory/tests/scope-cache.test.ts`、`plugins/ai-memory/tests/search-pagination.test.ts`；`plugins/ai-memory/scripts/measure-capacity.ts`；`docs/superpowers/reports/2026-11-03-flyenv-ai-memory-capacity.md`。**修改：** `plugins/ai-memory/core/search.ts`、`plugins/ai-memory/core/limits.ts`、`plugins/ai-memory/fork/RecordStore.ts`（插件内）。

**Interfaces:** `ScopeCache.withSnapshot(lease, fn)` 在已有 ScopeLease 内加载/固定元数据，不重复入队；`publish(lease, current)` 只在已提交后调用，`invalidate(scopeKey)` 用于无法发布时失效。SearchPage 含 results/truncated/next_cursor/warnings，各 scope generation 绑定游标。

- [ ] 写加载测试：同 scope 冷加载 singleflight，目录枚举/文件读取并发有界，搜索零 MD 读取；单 JSON 过大/损坏逐条 partial，总读取预算超出返回 capacity_exceeded 而非假完整子集；实际读取设字节上限，不能仅 stat 后无界 readFile。
- [ ] 写生命周期测试：忙 scope 不被淘汰、全忙返回 busy，按插入顺序释放空闲缓存但不创建第二队列；变更/淘汰重载产生新 generation；pending 恢复不进入常驻搜索 Map，超预算仍可走 Task 8 按 ID 通路。
- [ ] 写分页测试：默认 8/最多 20 条、8 KiB 默认/32 KiB 最大输出预算；完整序列化文本计字节；游标绑定过滤/范围/generation，更新或重载后 cursor_invalid；include_global 每个范围独立校验，不承诺跨范围原子快照；预算不足不可无限返回相同游标。
- [ ] 运行 `yarn tsx --test plugins/ai-memory/tests/scope-cache.test.ts plugins/ai-memory/tests/search-pagination.test.ts` 确认 RED；实现元数据 Map、单次加载、有限队列/读取、分页与提交后缓存发布。坏文件原因只返回受控代码，原始内容不进入日志。
- [ ] 编写容量脚本，运行 `yarn tsx plugins/ai-memory/scripts/measure-capacity.ts --records 1000 --report docs/superpowers/reports/2026-11-03-flyenv-ai-memory-capacity.md`；另跑 Task 1 真实样例，记录总 JSON 字节、current/history 比例、冷加载/热搜索、峰值内存及文件并发。
- [ ] 根据报告在 `limits.ts` 固定单 JSON、scope 读取、缓存元数据字节和读取并发的预览默认值，再做上下边界测试。扩写前预算不足保留旧版，不裁剪历史；若 history 已主导不可接受成本，先反馈布局问题，不静默扩大预算。
- [ ] 重跑相关单测和效果验收集，记录限额选择依据；仅暂存本任务文件，提交 `feat(ai-memory): bound metadata caching and search pagination`。

## Task 10：MemoryEngine、五个工具与插件入口

**Files — 新增：** `plugins/ai-memory/fork/MemoryEngine.ts`、`plugins/ai-memory/fork/index.ts`、`plugins/ai-memory/plugin.json`、`plugins/ai-memory/render/Module.ts`、`plugins/ai-memory/render/aside.vue`、`plugins/ai-memory/render/Index.vue`（最小入口，Task 11 完成）；`plugins/ai-memory/tests/memory-api.test.ts`。**修改：** `plugins/ai-memory/shared.ts`（插件内），`scripts/plugin-test.ts` 仅在通用 runtime 合同需要时扩展，旧 API 测试保持有效。

**Interfaces:** `MemoryEngine implements MemoryAPI`，组合 Task 6–9；fork 暴露五个同名方法。插件 shared.ts 定义 UI 专用 `MemoryAdminAPI`：`listProjects/inspectRecovery` 和 `callForProject(projectId, method, input)`，后者 input 为对应 MemoryInputs 去掉 scope/project_path 的字段，仅在内部把已登记 ID 解析为 ResolvedScope；MCP 不接受 project_id。

- [ ] 写契约测试：五个 manifest schema 与实际校验一致；search 的 global 结果须 global get；未知项目空结果/候选不创建库；reason/source/status/expired/archive 语义正确；缺失旧根的项目仍可经 UI ID 编辑/删除。
- [ ] 写输出测试：普通成功及 already_deleted 不设 MCP isError；参数/冲突/unknown/删除 partial 设 isError 且保留机器字段；有效但跳过坏记录的搜索可返回非错误 partial+warnings；消息发送失败不撤销提交。运行 `yarn tsx --test plugins/ai-memory/tests/memory-api.test.ts` 确认 RED。
- [ ] 按现有非服务插件继承 Base，模块 import 无 IO；只有 runtime 已持锁并 await 初始化后创建 Engine。声明 API 2/dedicated/exclusive/metadata-volatile；search/get 只读，store/update/forget 声明变更风险，使用宿主工具开关和审批。
- [ ] 实现参数→范围→协调/业务→结果适配；所有 UI/MCP 经过同一 Engine。内部管理方法不注册为 MCP，不允许调用方传 body_ref/数据根/任意方法名；诊断只读取已校验的结果元信息。
- [ ] 运行 API 测试、`yarn plugin:test ai-memory`，以及前面插件单测；确认打包入口存在且规则 asset 被包含。打包验证使用临时输出，未正式登记/发布 registry。
- [ ] 仅暂存本任务文件，提交 `feat(ai-memory): expose the five memory tools through one engine`。

## Task 11：管理页、操作 controller 与手工接入

**Files — 新增：** `plugins/ai-memory/render/controller.ts`、`plugins/ai-memory/render/manager.ts`、`plugins/ai-memory/render/MemoryEditor.vue`、`plugins/ai-memory/render/MemorySetup.vue`、`plugins/ai-memory/render/lang.ts`；`plugins/ai-memory/lang/en.ts`、`plugins/ai-memory/lang/zh.ts`、`plugins/ai-memory/lang/index.ts`；`plugins/ai-memory/README.md`；`plugins/ai-memory/tests/controller.test.ts`；`src/render/components/MCP/clientConfig.ts`。**修改：** 插件 `plugins/ai-memory/render/Module.ts`、`plugins/ai-memory/render/Index.vue`、`plugins/ai-memory/render/aside.vue`；`src/render/components/MCP/setup.ts`、`scripts/renderer-operation-boundaries-test.ts`。

**Interfaces:** `MemoryController` 持有上述操作合同；`manager.ts` 导出 `reactiveBind(new MemoryController(deps))`。`clientConfig.ts` 定义 `ClientConfigResult = { success: boolean; errorCode?: string }` 和 `configureMCPClient(client: MCPHttpClientFlag, config: { serverUrl: string; token: string }): Promise<ClientConfigResult>`；从既有 addToClient 提取请求，复用 `@shared/mcpClientConfig` 的客户端类型和原 `addMcp` fork 方法，原设置页与插件 controller 共用，不复制一份 MCPSetup 单例。

- [ ] 写 controller 测试：请求输入快照固定、双击不新建 request_id、code 200 保持 busy、终态移除监听、离页后完成/重入可见、旧搜索不盖新筛选、unknown 保留原请求供确认、失败重试；通知抛错不改变成功。
- [ ] 补独立结果测试：一个客户端配置失败不影响另一个；配置成功/规则复制失败分别显示；复制/下载不等于安装或调用验证；读取诊断失败不影响编辑。运行 `yarn tsx --test plugins/ai-memory/tests/controller.test.ts` 确认 RED。
- [ ] 实现 controller/manager 依赖与模块局部 Storage 偏好。页面只拥有筛选、选中项、对话框、输入草稿，不注册操作 IPC/终态通知；变更归档也走 update + revision/reason。
- [ ] 完成一页范围切换、摘要检索/过滤/分页、正文和来源、编辑/归档/删除、当前版本与原因；项目路径失效仍列旧 ID；映射异常给出明确诊断，不把空列表冒充无记忆。Markdown 展示关闭原始 HTML，不自动加载 source URI。
- [ ] 同页加入现有 MCP 配置入口、Memory Rules 复制/下载/手工说明、最近诊断、打开数据目录和离线备份恢复步骤。配置写入复用提取后的通用函数；规则使用已打包 asset，保持中英文文本和错误状态一致。
- [ ] 明确备份需停用插件并等实际 worker 退出后复制整个数据根；恢复前保留当前目录，再检查 projects/previous 与未映射目录。说明搬家路径为新项目、FlyEnv 退出服务不可用、删除不覆盖外部备份；不实现备份向导或一键规则安装。
- [ ] 给边界脚本添加 memory 页不得直连操作 IPC 的断言，不扩大允许名单；运行 controller 测试、`yarn test:renderer-operation-boundaries`、`yarn plugin:test ai-memory`。开发态人工检查编辑、分页、深浅色、离页重入、配置与诊断展示。
- [ ] 仅暂存本任务文件，提交 `feat(ai-memory): add management and manual agent onboarding`。

## Task 12：完整集成、真实 Agent 与平台验收（阶段 D）

**Files — 新增：** `scripts/ai-memory-acceptance.ts`；`plugins/ai-memory/tests/acceptance.test.ts`；`docs/superpowers/reports/2026-11-03-flyenv-ai-memory-acceptance.md`。**修改：** 插件 README、effect/runtime/capacity 报告，必要时修复对应已实现文件并补有意义的回归测试。

**Interfaces:** acceptance 脚本复用隔离宿主/插件构建入口与 MemoryAPI，不启动第二套长期 MCP。输入只有测试场景/临时根，输出结构化检查结果及证据位置，不导出真实记忆内容。

- [ ] 先定义完整集成断言并运行确认尚缺端到端覆盖：HTTP 写/UI 读及反向，跨两个项目/global 隔离，重启恢复，响应丢失后原请求确认，同 revision 竞争，pending 删除恢复，工具停用/审批/升级与真实 exit 竞争。
- [ ] 实现验收 harness，用 Task 2 故障点在临时库重放关键提交阶段；检查完整旧版/新版/unknown、映射 previous 失败、坏记录隔离、容量边界、诊断无内容。运行 `yarn tsx scripts/ai-memory-acceptance.ts` 和 `yarn tsx --test plugins/ai-memory/tests/acceptance.test.ts`。
- [ ] 执行真实 Codex 保存→Kimi 新会话检索/get，以及反向；重启 FlyEnv 后再读；包含从子目录启动、独立子项目、Explicit 成功/失败/unknown、Automatic 长任务/上下文变化。记录实际工具调用、ID/revision、客户端版本与自报身份来源，不把连接成功当规则生效。
- [ ] 使用冻结验收问题重跑 Task 1 对照，原始查询/扩词/端到端分别统计；报告 Automatic 机会覆盖率与误存，不承诺每次执行。关键问题失败先修根因再验证，不靠调低标准过关。
- [ ] 在每个拟声明平台运行原生 probe、完整集成与打包冒烟；记录同步/锁/退出的实际边界。当前机器不能执行的平台留未验收，manifest/README 只声明已验证支持，不能把杀进程恢复写成断电绝对可靠。
- [ ] 执行最终相关检查：`yarn tsx --test plugins/ai-memory/tests/*.test.ts`、本计划新增宿主测试、`yarn plugin:test ai-memory`、`yarn test:renderer-operation-boundaries`；对改动文件运行 ESLint/Prettier，执行 `yarn vue-tsc --noEmit` 并与执行前基线比对，只能声称新引入诊断已消除或如实说明残留。已通过且无相关修改的原生慢测试不无故重复。
- [ ] 检查四份报告和 V1 每条完成标准的证据；复核失败传播、数据锁所有权、默认容量来源、审计各分支与延后范围。仅暂存本任务文件/明确修复，提交 `test(ai-memory): verify shared memory preview end to end`。

## 完成与交接

完成表示阶段门槛和 V1 验收均有证据；若缺实际 Agent 或某平台环境，报告具体未执行项，不把计划勾完当产品完成。实现结束可交付可测试的本地插件与宿主变更，发布 registry、上传插件、合并或发布正式易用版不在本计划授权内。

正式易用版另起任务：核实 Codex/Kimi 当时的官方配置/规则支持，设计无覆盖合并、重复安装/卸载及真实调用验证。不能把本预览的复制按钮改名为“一键安装”来代替该工作。

### 计划自检（2026-11-03）

- 范围覆盖：目标设计 §4/映射恢复 → Task 6；§5–8/数据与检索 → Task 1、7、9、10；§9/并发提交删除 → Task 2、4、7、8；§10/宿主 → Task 3–5；§11–12/操作与界面 → Task 11；§13/V1 验收 → Task 1、9、12。
- 五类 Review Focus 均有归属测试；计划区分必需、独立与附加失败，未把删除清理或 previous 写入当可忽略日志。
- 共享接口局限于声明/路由/诊断，Memory 类型留插件；插件 `core/` 与 `fork/` 职责独立，UI/MCP 的派发终点一致。
- 当前只有计划文档；无实现代码、产品测试结果或平台通过声明。执行时先读两份 spec 与本计划，再按门槛推进。
