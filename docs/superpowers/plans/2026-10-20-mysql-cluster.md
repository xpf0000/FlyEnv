# MySQL Cluster Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for direct execution in this session, or superpowers:subagent-driven-development if the user selects delegation. Steps use checkbox syntax for tracking. Approved for direct execution; tasks 1–10 implemented. Final evidence: ../reviews/2026-10-21-mysql-cluster.md.

**Goal:** 交付具有实例/服务/版本三个 Tab、独立实例、一键主从复制和单主 Group Replication 的独立 MySQL Cluster 插件。

**Architecture:** `plugins/mysql-cluster` 持有所有实例领域状态与 Fork 运行清单，renderer 本地 singleton 通过 `reactiveBind` 暴露，复用 `ModuleInstalledItem` 生命周期。安装候选和下载继续属于内置 mysql 模块；插件 Fork 通过精确配置身份管理多进程，直接使用 mysql2 配置和检查复制。

**Tech Stack:** TypeScript、Vue 3、Element Plus、FlyEnv 插件 API v1、mysql2、Node child_process、node:test/tsx、现有 Vite/esbuild 插件打包器。

**Spec:** [已确认设计](../specs/2026-10-20-mysql-cluster-design.md)

## Global Constraints

- 插件 ID/typeFlag：`mysql-cluster`；初始版本：`0.1.0`；名称：MySQL Cluster。
- 精确三个 Tab：MySQL 实例、服务、版本；保留现有内置 MySQL 模块。
- 独立实例选择宿主已安装版本；一键复制面向 MySQL 8.0 与 8.4，同组使用完全相同的安装版本，实际能力检查决定能否启用。
- 主从默认一主一从；GR 默认三节点单主，首版节点数允许 3、5、7、9，固定 XCom。
- 一键创建仅针对插件新建空节点；无已有数据迁移、混合版本、远程主机、半同步、多主 GR、普通主从自动选主或 Router/Shell 下载管理。
- 插件领域数据使用 `StorageGetAsync`/`StorageSetAsync`，key 为 `flyenv-plugin-mysql-cluster-v1`；无新增 Pinia、无 `config.setup` 或其他共享配置领域数据。
- 模块本地 singleton + `reactiveBind`；启停复用公共 ModuleInstalledItem + startExtParam/stopExtParam；插件属性不进入公共服务类型。
- 长操作必须有 owner、不可变请求、进度、声明的终态、重入锁、通知和清理；code 200 是非终态。
- Fork 持有真实进程/端口/PID/SQL 状态；停止按完整 defaults-file 身份，不能仅匹配共用 mysqld。
- 默认关闭 MySQL X Protocol；端口、Socket/命名管道、目录、日志、配置及 PID 均按实例隔离。
- 新建表单输入控件占所属列 100%；双语 en/zh，其他语言回退英文；通用列表弹窗沿用宿主样式。
- 保存成功后发布领域状态；必要失败传播，逐项结果保留；通知/日志失败不覆盖成功结果；重试不重复初始化、不自动删数据。
- 默认删除保留业务数据；复制组成员不能单独删除；只读副本禁止管理写操作。
- 原生验收仅用独立临时空数据根；不操作用户现有 MySQL；不自动安装、发布或激活插件。
- Default Module Constraints 四项均满足；无例外授权。宿主通用组件接口仅作可选、默认保持旧行为的扩展。

## Review Focus

1. 同一个安装路径下两个实例和内置 MySQL 同时运行：停止 A 不能停止 B 或内置实例；绑定 Task 3/10。
2. 初始化成功后清单/Storage/刷新失败：重入保留完成事实，不重初始化或递归删除；绑定 Task 2/6。
3. GR 全停恢复、GTID 分叉或一个节点不可达：不能固定引导第一节点，也不能强制假定最新；绑定 Task 5/10。
4. 密码/路径/数据库名包含引号、空格、反引号、美元符：不经 shell 展开，不串实例，不把密码放进错误日志；绑定 Task 1/3/7。
5. 版本安装操作隐含卸载冲突公式，或删除包无法准确对应安装路径：先检查实际移除候选；无法确认时拒绝插件入口移除并解释；绑定 Task 9。

## Operation Contracts

本计划引用设计第 7 节完整契约；以下落实到实现 owner：

- **发现**：`MysqlClusterController.load/refresh` → Fork catalog；同请求合并，完整成功快照后更新，失败保留旧列表；不持久化 run 布尔。
- **创建**：controller 的 `create` 跨页面存活；Fork catalog/runtime 持有实例准备锁；阶段 validated/prepared/initialized/started/replicating/verifying；成功/部分完成/失败/未知为终态，逐节点保留副作用。
- **实例生命周期**：controller 保存 ModuleInstalledItem 身份，公共 start/stop/restart 持有请求；Fork 持有每实例锁及进程。重复动作复用 Promise；相反动作等待原终态或明确拒绝；停止失败禁止启动依赖步骤。
- **组生命周期/恢复**：controller 组合公共生命周期，按拓扑等待必要依赖；Fork SQL 编排持有组锁。组停止逐节点收集；GR 全停恢复使用全体成员证据，未知不强制 bootstrap。
- **管理/配置/日志/备份/删除**：controller 持有完整 request、进度、互斥、通知、监听清理；Fork 持有文件/连接/进程；页面仅调用。取消目录选择无副作用；备份逐库返回结果；删除依赖真实停止。
- **版本安装**：继续由宿主安装 owner 持有，插件仅提供移除前置检查与安装后候选刷新。
- **测试覆盖**：Task 6 验证重入、进度、终态、页面重入；Task 3 验证进程失败/重试与退出清理；Task 4/5 验证父节点依赖及恢复；Task 7 验证补充失败不否定主结果。

## Task 1: Domain model, validation and compatibility

**Files:** Create `plugins/mysql-cluster/{shared.ts,policy.ts}`, `tests/policy.test.ts`。

**Interfaces:**
- Produce `ClusterMode = 'standalone' | 'replication' | 'group-replication'`、`InstanceId = string`。
- Produce `EngineRef { version, path, bin, source, name? }`、`InstanceSpec { id, name, engine, port, socket, dataDir, serverId, groupId?, groupPort? }`、`ClusterSpec { id, name, mode, memberIds }`、`SavedCatalog { schemaVersion: 1, instances, clusters }`。
- Produce `CreateRequest { cluster, instances, credentials }`；credentials 为独立参数，不能进入普通进度或服务停止快照。
- Produce `Platform = 'macOS' | 'Windows' | 'Linux'`、`Credential { user: string, password: string }`、`Credentials = Record<InstanceId, Credential>`、`EventSink = (event: OperationEvent) => void`；可等待外部操作的 deps 全部返回 Promise。
- Produce `InstanceSnapshot { id, state, pid?, role?, replication?, error? }`，state 明确 stopped/running/unknown/missing，replication 明确 online/recovering/error/unknown。
- Produce `OperationEvent { operationId, instanceId?, stage, message? }`、`ItemOutcome { id, status, stage, error? }`、`OperationResult { status, items }`；status 使用 completed/failed/skipped/unknown，聚合另外允许 partial。
- Produce `validateCatalog(value: unknown): SavedCatalog`、`validateCreateRequest(request: CreateRequest, platform: Platform): void`、`replicationCapabilities(version: string): ReplicationCapabilities`。

- [ ] Write policy regressions：重复 ID、同组混版本、GR 数量边界、端口交叉、目录祖先/别名重叠、Socket 语义/长度、受管理配置项，以及包含空格和 shell 符号的合法路径。
- [ ] Run `node --import tsx --test plugins/mysql-cluster/tests/policy.test.ts`，确认因缺实现失败。
- [ ] Implement schema/校验/版本能力，不新增外部依赖；命名、默认值和数量限制与设计一致。
- [ ] Run the same command，要求全部通过；commit only this task's files。

## Task 2: Instance catalog, configuration and safe initialization

**Files:** Create `fork/{catalog.ts,config.ts,initialize.ts,paths.ts}`、`tests/{catalog,config,initialize}.test.ts`。

**Consumes:** Task 1 的 schema 与 capability。
**Produces:** `instancePaths(root: string, id: string): InstancePaths`；`InstanceCatalog.read(): Promise<RuntimeCatalog>`、`prepare(request: CreateRequest): Promise<PreparedCatalog>`、`removeRecords(ids: string[]): Promise<void>`；`initializeInstance(spec: InstanceSpec, credentials: Credentials, emit: EventSink): Promise<InitializationResult>`；`renderConfig(spec: InstanceSpec, mode: ClusterMode): string`、`validateConfigEdit(spec: InstanceSpec, text: string): void`。

`RuntimeCatalog` 保存配置身份、初始化阶段和已完成副作用，不保存 renderer run 状态；目录位于 `Server.MysqlDir/mysql-cluster/`，每实例一个 ID 子目录，外部自选 datadir 只记录引用。使用原子替换写入清单/配置。

- [ ] Write tests：完整组前检失败零初始化、非空目录/部分初始化拒绝、缺工具、真实临时目录原子写失败、初始化后清单写失败和重试、datadir symlink/realpath 重叠、Windows 命名管道/Unix Socket、X Protocol 关闭。
- [ ] Run Task 2 test files，确认缺实现失败。
- [ ] Implement 基于真实二进制的只读能力探测、目录/端口检查、配置及初始化；使用 argv 和连接操作，不把密码放 shell 参数；密码本地准备不制造冲突 GTID。
- [ ] Initialization outcome unknown preserves files and blocks automatic reinitialization；只允许已经确定为空、未开始的目录再次初始化。
- [ ] Run Task 2 tests，要求通过；commit task files。

## Task 3: Independent service lifecycle and process identity

**Files:** Create `fork/{index.ts,runtime.ts,processIdentity.ts}`、`tests/{runtime,identity}.test.ts`。

**Consumes:** InstanceCatalog、初始化与配置输出，Base 精确停止/退出确认工具。
**Produces:** Fork `startService(item: SoftInstalled, context: InstanceContext)`、`stopService(item: SoftInstalled, context: InstanceContext)`、`listInstances(): ForkPromise<InstanceSnapshot[]>`、`allInstalledVersions(): ForkPromise<SoftInstalled[]>`；context 只含实例 ID/身份，不携带凭据。`MysqlInstanceRuntime.start/stop/discover` 内部接口均消费实例 ID，重读 Fork 清单。

按实例创建独立 runtime/Base 适配对象，禁止异步改写共享 Base.type/pidPath。服务 descriptor 使用 config 文件作为唯一 `bin` 身份，版本安装 executable 单独来自 EngineRef；返回精确 `APP-Service-Start-Item`、PID、Stop-Args。插件停止使用其原有业务参数顺序并继承 StopProcessContext，不插入内置 MySQL 的特殊第二参数。
适配对象覆盖自己的 appPidFile/pidPath 和 `_linkVersion`（no-op），避免 Base 把配置路径当成 Homebrew 安装进行 link；适配对象的 start/stop 共用实例锁。

- [ ] Write tests：同一 mysqld 的 A/B/内置配置共存只停止 A；伪 PID、不可读候选、共享前提失败；终态前进度；启动失败清理仅限本次新进程；超时/停止失败保留未知；登记参数可在 renderer 消失后停止。
- [ ] Run Task 3 tests，确认失败。
- [ ] Implement spawn argv、PID/config 精确身份、SQL/连接就绪、实例级互斥和进程状态恢复；复用 Base stop helpers，禁止模块单 PID 文件。
- [ ] Expose Fork `prepareInstances(request: CreateRequest)`、`initializeInstance(id: string, credential: Credential)`、`removeRecords(ids: string[])` 的 ForkPromise wrappers；handlers 消费已声明 schema，进度与终态严格分开。
- [ ] `allInstalledVersions` 返回实例 service descriptors 供宿主发现；controller 维护可重用 lifecycle item 身份。Task 6 的初始化必须在宿主实例发现前设置插件当前版本持久化策略，见下文的通用 opt-out。
- [ ] Run Task 3 tests，要求通过；commit task files。

## Task 4: GTID source/replica provisioning and monitoring

**Files:** Create `fork/{sql.ts,replication.ts}`、`tests/{sql,replication}.test.ts`；Modify `fork/index.ts` 暴露配置/查询入口。

**Consumes:** Task 1/2/3 models、config、runtime；mysql2。
**Produces:** `withInstanceConnection<T>(id: string, credential: Credential, fn: (connection: Connection) => Promise<T>): Promise<T>`；`configureReplication(cluster: ClusterSpec, credentials: Credentials, emit: EventSink): Promise<OperationResult>`、`readReplicationStatus(id: string, credential: Credential): Promise<ReplicationStatus>`。

- [ ] Write tests：8.0.23 前后语法、独立 server_id/UUID、GTID 自动定位、源启动失败阻断建链、从节点建链失败不覆盖源结果、线程错误/延迟 NULL、SQL 参数含引号、连接关闭与脱敏；不得回退 3306。
- [ ] Run Task 4 tests，确认失败。
- [ ] Implement 固定实例目标连接、最小权限复制账号、版本分支、只读副本、真实线程及进度检查；只使用已验证的新空节点，禁止 RESET GTID 或自动提升副本。
- [ ] Run Task 4 tests，要求通过；commit task files。

## Task 5: Group Replication provisioning and full-stop recovery

**Files:** Create `fork/{groupReplication.ts,gtid.ts}`、`tests/{groupReplication,gtid}.test.ts`；Modify `fork/index.ts` 暴露配置/查询/恢复入口。

**Consumes:** 固定实例连接、runtime 状态、事件和逐项结果。
**Produces:** `configureGroupReplication(cluster: ClusterSpec, credentials: Credentials, emit: EventSink): Promise<OperationResult>`、`readGroupStatus(cluster: ClusterSpec, credentials: Credentials): Promise<GroupStatus>`、`planGroupRecovery(cluster: ClusterSpec, credentials: Credentials): Promise<GroupRecoveryPlan>`、`recoverGroup(plan: GroupRecoveryPlan, credentials: Credentials, emit: EventSink): Promise<OperationResult>`。

- [ ] Write tests：插件/变量缺失、仅首节点 bootstrap、成功和失败都关闭 bootstrap、关闭失败阻断其他节点；恢复通道与 ONLINE/PRIMARY；多成员 GTID 包含关系、分叉、不可达成员、执行中崩溃后的 prepared GTID；不能任意选第一行或强制多数派。
- [ ] Run Task 5 tests，确认失败。
- [ ] Implement 单主/XCom、组 UUID/seeds/recovery、增量恢复与健康验证；bootstrap 使用 try/finally 且失败保持可见；等待有预算，不盲目重试整个建组。
- [ ] Full-stop recovery starts owned members in recovery inspection mode，收集已执行/恢复 GTID 并选完整候选；任一必要证据未知则不 bootstrap。SQL 证据不足时使用 MySQL 官方 crash-recovery 检查方式，原始输出不泄露秘密。
- [ ] Run Task 5 tests，要求通过；commit task files。

## Task 6: Controller, storage and public lifecycle binding

**Files:** Create `render/{controller.ts,manager.ts,lifecycle.ts}`、`tests/{controller,lifecycle}.test.ts`；Modify `src/render/core/Module/Module.ts`、`src/render/core/type.ts`、`src/render/store/brew.ts`。

**Consumes:** 已定义 Fork methods、公共 ModuleInstalledItem、Storage、BrewStore mysql 候选。
**Produces:** `MysqlClusterController.load/refresh/create/save/remove/runInstance/runGroup` 返回 Promise，使用 OperationResult；`MysqlClusterManager = reactiveBind(new MysqlClusterController(deps))`；`serviceItem(id: string): ModuleInstalledItem` 保留对象身份；start/stop 参数仅含实例上下文。

通用宿主补充 `Module.persistCurrentVersion: boolean = true` 及 `AppModuleItem.persistCurrentVersion?: boolean`；BrewStore 在创建及 reconcile 时、调用 watchShowHide 之前应用该元数据。`resetCurrentVersion` 在 false 时不写共享配置。插件 Module.ts 声明 `persistCurrentVersion = false`、`isOnlyRunOne = false`；manager 注册 start/stop 参数。不能依靠创建 module 后再赋值避免首次发现竞态。该字段不包含插件专用数据，旧模块默认行为不变。

- [ ] Write tests：读取合并、Storage 坏数据不清空旧状态、保存后发布、失败重试、部分创建保留、相同操作共享 Promise、相反操作顺序、code 200 保留 busy、终态 off、页面卸载重入、通知失败、丢失/迟到广播。
- [ ] Add lifecycle tests：调用真实 ModuleInstalledItem（仅传输/存储边界替换），验证公共 start/stop/restart 与插件扩展参数；默认 Module 持久化行为保持，插件 opt-out 在首次 watchShowHide 和热启用下 config 均无领域写入；实例 identity 不随刷新重建。
- [ ] Run Task 6 tests，确认失败。
- [ ] Implement operation owner/deps 注入、immutable snapshot、生命周期绑定与拓扑编排；组编排不直接发送启停 IPC。模块清单与 renderer 偏好保存故障分别报告，先记录事实再通知。
- [ ] Run Task 6 tests，要求通过；commit task files。

## Task 7: Per-instance configuration, logs and database management

**Files:** Create `fork/manage.ts`、`render/{manage.ts,Config.vue,Logs.vue}`、`render/manage/{Index.vue,DatabaseTable.vue,DatabaseDialog.vue,PasswordDialog.vue}`、`tests/manage.test.ts`；Modify `fork/index.ts` 暴露管理/config/log handlers。

**Consumes:** withInstanceConnection、当前角色查询、controller operation owner、公共 Conf/Log UI。
**Produces:** Fork `readConfig/saveConfig/getDatabasesWithUsers/addDatabase/passwordChange/backupDatabase` 使用实例 ID；controller 公开对应方法并隔离实例 credentials/备注/备份设置；`BackupResult` 逐库报告 completed/failed/skipped/unknown。

- [ ] Write tests：A/B 共用 engine 仍密码/库列表/备注/备份完全隔离；角色刷新后非 PRIMARY 拒绝写；密码变化的复制传播语义；参数和标识符注入边界；连接/子进程终态清理；备份成功后打开目录失败不改备份结果；config 原子保存失败；禁止编辑受管理键。
- [ ] Run Task 7 tests，确认失败。
- [ ] Adapt current MySQL Manage UI 能力到插件本地 controller，去除 bin/major-version 索引和不可靠连接回退；数据库名/用户输入按驱动或标识符转义处理，备份使用 spawn argv 并通过受控文件/输入传递凭据。
- [ ] 保留密码查看/显隐/保存、备注、备份目录和逐库备份能力；禁止副本写操作及以关闭只读模式绕过；配置保存不自动重启。
- [ ] Run Task 7 tests，要求通过；commit task files。

## Task 8: Plugin registration and instance/cluster UI

**Files:** Create `plugin.json`、`render/{Module.ts,aside.vue,Index.vue,Instances.vue,InstanceDialog.vue,InstanceActions.vue,lang.ts}`、`lang/{index.ts,en.ts,zh.ts}`、`tests/ui.test.ts`；Modify `scripts/renderer-operation-boundaries-test.ts`。

**Consumes:** controller singleton、已有 MySQL svg、异步弹窗工具、配置/日志/数据管理视图。
**Produces:** 独立 /mysql-cluster 路由，首个 Tab 完整创建/列表/菜单/进度/组操作；其他两 Tab 按 Task 9 接入。

- [ ] Write real Vue component tests：三模式表单、节点预览与默认值、列信息、可用/不可用候选、运行中身份字段锁定、组成员不可单删、通用菜单每项真实调用、部分完成错误展示、表单宽度及所有标签英文回退。
- [ ] Extend boundary audit：扫描本插件 entry pages/dialogs，禁止页面直接持有 IPC/长操作 error/notice/listener cleanup；controller singleton 必须被入口绑定。
- [ ] Run UI/boundary tests，确认新覆盖失败。
- [ ] Implement 三 Tab 外框、首 Tab 列表与弹窗、组标题/逐节点状态、100% 表单控件、Socket 平台语义、路径提示/打开、深浅色和横向滚动。
- [ ] Aside 注册 module lifecycle 扩展参数，组入口调用 controller 的拓扑操作；不得用通用 module.start() 只启动一个成员。异步进口需在读取实例前完成 Task 6 的配置。
- [ ] Run UI tests and `yarn test:renderer-operation-boundaries`，要求通过；commit task files。

## Task 9: Reuse service/version panels with guarded removal

**Files:** Create `render/{Services.vue,Versions.vue,versionUse.ts}`、`tests/versionPanels.test.ts`；Modify `src/render/components/ServiceManager/{index.vue,EXT/index.vue}`、`src/render/components/VersionManager/index.vue`、`VersionManager/{static,brew,port}/{index.vue,setup.ts}`；Create `src/render/components/VersionManager/RemovalPolicy.ts`。

**Consumes:** mysql installed provider、宿主 ServiceManager/VersionManager、controller/Fork 的实例引用及真实运行快照。
**Produces:** ServiceManager optional `showServiceControls?: boolean` 默认 true，以及 optional `beforeRemove`；VersionManager optional `beforeRemove: RemovalGuard`，传递给 source views/setup；`RemovalCandidate { source, name?, path?, bin?, version? }`、`RemovalGuard = (candidate: RemovalCandidate) => Promise<boolean>`。宿主接口均通用，不携带 mysql-cluster 字段。

- [ ] Write tests：普通宿主无 props 时行为不变；插件服务页无启停/默认实例管理；保留环境/别名/备注/目录/刷新；Static/Homebrew/MacPorts 卸载前 guard 均生效，拒绝时没有 queue/下载/卸载副作用。
- [ ] Include install-with-conflict case：Homebrew 安装需要移除旧公式时，对实际待移除公式调用 guard；无法准确解析候选身份时拒绝插件入口移除，不能仅按显示版本号匹配。
- [ ] Run Task 9 tests，确认失败。
- [ ] Implement optional generic interfaces，服务页 `type-flag="mysql"` 隐藏运行操作，版本页 `type-flag="mysql"` 复用安装源；插件 guard 读取已知引用和必要新鲜状态，只阻止相关运行实例受破坏，不自动停止任何实例。
- [ ] Refresh installed candidates on page entry、安装终态及打开创建弹窗；移除静态包和已知安装引用后显示 missing 并保留实例数据。
- [ ] Run Task 9 tests plus host default-behavior regression，要求通过；commit task files。

## Task 10: Native acceptance, review and distributable artifact

**Files:** Create `README.md`、`tests/native.test.ts`（由明确环境变量启用，默认 skip）；Update plugin registry only through normal builder；update plan completion evidence。

**Consumes:** 完整插件及临时隔离 MySQL 可执行程序。
**Produces:** `dist/plugins/mysql-cluster/mysql-cluster-0.1.0.flyenv-plugin`、相同构建生成的 registry SHA-256，以及真实通过/未验收平台说明。

- [ ] Read failure-boundaries skill again for review；逐项检查新增 throw/reject/return、批量停止/清理、未知结果和附加动作；检查 spec 每节都有实现/证据。
- [ ] Run all focused tests: `node --import tsx --test plugins/mysql-cluster/tests/*.test.ts`。
- [ ] Run targeted ESLint for plugin and changed host files，`yarn test:renderer-operation-boundaries`；跑项目已有类型检查方式并分离既有诊断，不用全仓无关修复掩盖新增错误。
- [ ] Locate available MySQL read-only；有兼容二进制时启用 native tests，使用 OS 临时目录、随机空闲端口和仅本次创建进程，验证两独立实例互不停止、主从真实复制、三节点 GR 角色/复制/单节点故障选主及完整全停恢复。
- [ ] Native tests always clean up only their own exact instances；缺平台/版本/binary 时明确 skip 并记录证据，禁止把适配器通过称为原生通过。
- [ ] 使用真实 Vue 浏览器预览检查所有三个 Tab、创建/管理/日志/配置、深浅色、窄窗/溢出和全宽控件；关闭预览时不触碰用户服务。
- [ ] Run `yarn plugin:build mysql-cluster`，检查 archive manifest、render/fork payload、CSS、lang 和 SHA-256 与 registry 相同；不运行默认操作 Mailpit 的全局 plugin:test。
- [ ] Review full diff and package，必要修复后只重跑受影响检查；完成源码和 README commit，最终交付明确未发布/未激活及平台验收范围。

## Execution handoff

推荐直接在当前会话逐项实现：Fork runtime、controller、复制与 UI 的接口相互依赖，
按上述顺序执行便于持续联调，避免额外的跨代理接口交接。
若用户选择子代理方式，执行前再读取 subagent-driven-development；当前不启动代理。

用户已批准计划并选择直接执行；现已完成实现及一次独立审查修复。执行使用 executing-plans、
using-git-worktrees、test-driven-development；交付前使用 verification-before-completion
和 requesting-code-review。隔离 checkout 创建后先确认依赖与可运行检查，再按任务推进。

## Execution status — 2026-10-21

Tasks 1–10 are complete with the scoped rulings and verification evidence in
[execution and review report](../reviews/2026-10-21-mysql-cluster.md). The original
step checklist is retained as planned test intent; the report records actual evidence and limitations.
