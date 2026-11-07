# Homebrew 语言版本更新实施计划

> **For agentic workers:** Use superpowers:executing-plans for inline execution, or superpowers:subagent-driven-development if explicitly selected. Execute task by task with RED→GREEN verification; this document does not authorize implementation by itself.

**Goal:** 仅在 Homebrew 页提供确认后停止相关服务并升级的功能；用户手动处理配置和关联，成功刷新列表，失败明确提示。
**Architecture:** Homebrew 本地控制器拥有 renderer 操作，main 拥有包变更互斥和启动门禁，fork Brew 拥有真实包管理进程。数据与任务类型留在 Brew 模块目录；停止复用 ModuleInstalledItem.stop()，不实现配置迁移或自动恢复。
**Tech Stack:** Electron 39、Vue 3、TypeScript、reactiveBind、现有 ForkPromise/IPC 与 Homebrew CLI；不增加产品依赖。
**Spec:** docs/superpowers/specs/2026-11-07-homebrew-language-upgrade-design.md（用户已确认）。

## Global Constraints

- 只在“版本管理 → Homebrew”页提供更新入口；服务页不增加字段、按钮或更新提示。
- 不自动迁移关联设置、配置文件或扩展，不调整 PATH、别名、站点、启动组和已选版本。
- 用户确认后，停止相关服务，再执行升级；停止失败不执行 brew，已停止实例不自动恢复。
- 不自动启动或恢复任何服务；成功刷新服务列表，失败给出升级失败提示。
- 首版为 macOS 当前 Homebrew 实例的 PHP/PHP-FPM；其他来源、其他实例和数据库不借本功能升级。
- 升级同一配方的已确认目标；跨 PHP 系列明确显示，禁止静默换配方/tap 或强制 unpin。
- Homebrew 专用类型、状态和规则留在模块目录；不新增 Pinia、config.setup 属性或 SoftInstalled 专用字段。无约束例外授权。
- 不新增配置备份/迁移、持久恢复记录、自动回滚或跨重启自动修复框架。
- 页面离开不取消任务；code:200 为中间事件；网络/IPC 超时不代表真实进程退出。
- 不执行裸 brew upgrade；只用确认的绝对 brew 路径和参数数组，不加 sudo，不执行 renderer 传入的任意 shell。
- 不在日常 PHP/Homebrew 上做真实升级验收，不更改用户真实设置。

## Review Focus

1. “刷新”经现有 resetCurrentVersion 或 syncInstalledVersionNotes 间接改配置/删备注，仍然违反手动关联要求。
2. 同名 core/tap、多个 keg 和 Intel/ARM 双 Homebrew 可能把不相关服务误停。
3. 页面开关禁用不能阻止 MCP/启动组/raw fork 并发启动；同一目标确认后的变化不能静默接受。
4. 包进程超时、worker 退出、迟到回包和刷新失败不能使升级被重复执行或错误宣告回滚。
5. 取消警告、停止部分失败、跨系列目标和长任务离页重入必须向用户准确表达已发生的事实。

## Operation Contract

Owner：renderer `HomebrewUpgradeController` 单例；main `HomebrewOperationCoordinator` 持有互斥和只允许已停止目标执行的许可；fork `BrewPackageRunner` 持有真实子进程。

Lifetime：确认准备可取消；确认后依次 checking→stopping→upgrading→refreshing→succeeded/failed，未确认进程终态时为 unknown。状态随任务而非页面存在。重复确认复用同一 flight；同一 Homebrew 实例的安装/卸载/升级串行。失败不调用 start/restart，不重放命令。

停止是升级的必要依赖；brew 执行错误保留已停止及可能已有包变更的事实。成功后的列表刷新是附加步骤；失败仅提示“更新成功，但列表刷新失败”，不覆盖包成功或重跑升级。终态、通知和监听清理幂等。

## Interfaces and file map

新增类型集中在 `src/fork/module/Brew/UpgradeTypes.ts`，main/renderer 以 type-only 引入，不将其放进共享服务类型：
- `BrewIdentity`：brew 真实绝对路径、prefix、Cellar、架构。
- `BrewFormulaSnapshot`：完整配方/tap、安装收据身份、所有相关 keg 路径、已安装版本、stable/revision、pinned/outdated、资格/阻断原因、元数据指纹。
- `BrewUpgradePreview`：previewId、请求模块、配方快照、必须停止的实例快照、潜在影响集合与确认指纹；不包含配置正文或环境凭据。
- `BrewPackageAction = 'install' | 'uninstall' | 'upgrade'`。
- `BrewPackageResult`：operationId、action、outcome（succeeded/failed/unknown）、退出码/信号、可展示错误及有限日志信息；不含自动恢复动作。

协议由 main 生成/校验身份与 operationId；renderer 不得用伪造路径或“已经停止”的布尔值取得执行许可。

---

### Task 1: Homebrew 实际版本、更新资格和配方身份

**Files:** Create `src/fork/module/Brew/UpgradeTypes.ts`, `src/fork/module/Brew/UpgradeCatalog.ts`, `scripts/homebrew-upgrade-catalog-test.ts`; modify `src/fork/util/Version.ts`, `src/fork/module/Brew/index.ts`.
**Consumes:** 已有 brewInfoJson、BrewFormula 的 tap/receipt 规则和当前 Server.BrewBin/Cellar。
**Produces:** `inspectUpgrade(module: 'php', formula: string): Promise<BrewUpgradePreview>` 的只读底层数据；`getUpgradeCatalog(): Promise<BrewFormulaSnapshot[]>`。main 负责最终 previewId 和服务集合。

- [ ] 写测试：core 已装 8.5.7/可用 8.5.12 返回可更新；revision-only 也可更新；pinned 不可执行；最新版已安装不重复升级；core 与 shivammathur 不互认；Intel/ARM prefix 不互认；旧 keg 集合不丢失；单个无效配方不阻断其他配方。
- [ ] Run `tsx scripts/homebrew-upgrade-catalog-test.ts`；先看到缺少数据/能力导致 FAIL。
- [ ] 实现带绝对 brew 路径的 info/outdated 查询与 JSON 解析，保留既有 version/installed/name/flag 兼容；更新资格取 Homebrew 结果，系列变化作为确认信息，不阻断已确认的同配方升级。
- [ ] 将新元数据保存在 Homebrew 本地 catalog；`ModuleHomebrewItem` 不新增业务状态。源码历史 row 消费者仍正常安装/卸载。
- [ ] 用完整配方名、prefix、架构、receipt 与实际 Cellar 路径验证身份；不确定的必需身份返回明确阻断原因。元数据查询不得创建 ini 或改变安装。
- [ ] Run 同一命令，Expected: 所有 fixture PASS；保留旧 PHP tap 冲突回归。提交 `feat(homebrew): inspect installed and available formula versions`。

### Task 2: main 受理、包互斥和服务启动门禁

**Files:** Create `src/main/core/HomebrewOperationCoordinator.ts`, `scripts/homebrew-upgrade-admission-test.ts`; modify `src/main/core/IPCHandler.ts`, `src/main/core/ServiceProcess.ts`, `src/main/core/ForkManager.ts`, `src/main/Application.ts` as required for dependency wiring.
**Consumes:** Task 1 的可信配方快照和既有 ServiceProcess 实例/生命周期队列。
**Produces:** `prepareUpgrade(module, formula): Promise<BrewUpgradePreview>`；`beginUpgrade(previewId): Promise<{ operationId: string; targets: SoftInstalled[] }>`；`execute(operationId): ForkPromise<BrewPackageResult>`；只允许未执行任务的 `cancelPending(operationId)`。

- [ ] 写测试：确认取消无副作用；伪造 preview/路径/operationId 被拒绝；同 prefix 变更串行；等待先前受理请求结算后再确定相关运行实例；升级期间 UI/MCP/启动组/raw start 和 restart 不能绕过门禁；确认无关的实例仍可运行。
- [ ] Run `tsx scripts/homebrew-upgrade-admission-test.ts`，Expected: RED。
- [ ] main 基于当前受管实例与可信 Cellar/rack 身份生成停止集合。`beginUpgrade` 占有变更互斥并复核目标/固定状态/影响集合；变化返回“需重新确认”，不停止任何实例。
- [ ] 为既有服务受理链增加通用安装资源变更 gate，范围解析由 Homebrew/PHP 规则提供，不向 SoftInstalled 加包管理字段；无法确认拟启动目标是否相关时保留保守屏障，不把未知当作无关。
- [ ] 停止继续通过现有 ModuleInstalledItem.stop() 执行；execute 在 main 再确认相关生命周期终态与登记状态，不能信任 renderer 的自报结果。该 gate 不引入自动 start/恢复上下文。
- [ ] 所有 Homebrew 包变更入口接入同一协调器；只读查询可继续。gate 仅在执行终态、已确认无子进程的前置失败或明确取消前置阶段后释放。
- [ ] Run 同一命令，Expected: PASS；提交 `feat(homebrew): coordinate package mutations with service admission`。

### Task 3: fork 包进程、日志与真实终态

**Files:** Create `src/fork/module/Brew/BrewPackageRunner.ts`, `scripts/homebrew-package-runner-test.ts`; modify `src/fork/module/Brew/index.ts`, `src/main/core/ForkManager.ts`, `src/main/core/HomebrewOperationCoordinator.ts`.
**Consumes:** main 已受理的固定请求和 Task 1 类型。
**Produces:** 单次 `runPackage(action, snapshot, operationId, onProgress): Promise<BrewPackageResult>`；同一进程 owner 的查询/受控终止；统一安装、卸载和升级执行链。

- [ ] 写真实临时可执行文件测试：空格路径/参数注入不变成 shell；只执行确认的完整配方；退出 0/非 0/信号保留结果；stdout/stderr 持续有界转发；取消后等待实际 close；超时观察不释放仍运行的命令；worker 退出返回 unknown，不自动重跑。
- [ ] Run `tsx scripts/homebrew-package-runner-test.ts`，Expected: RED。
- [ ] Brew runner 使用 spawn 参数数组和已验证 brew 绝对路径；upgrade 参数固定为 `upgrade --formula <formula>`。scoped 环境禁用自动元数据更新，已确认后采用 Homebrew 支持的非询问模式；不强制 unpin/换源/清理，不记录环境凭据。
- [ ] 为包操作保持稳定 worker 归属和活跃请求；不能向池中任意另一个 worker 发送取消/查询。沿用 ForkItem 的 pin/终态 hook 扩展，不冒用 DNS/FTP 的服务 PID 状态。
- [ ] 子进程 close 才表示已确认完成；main 依据真实回调释放运行许可。执行中应用退出纳入已有 drain，不因普通 renderer 超时就直接退休 worker；确需终止时先收口真实进程，否则 unknown 保留 gate。
- [ ] 安装/卸载也复用该 owner，停止语义仍只属于本次更新，现有动作不能各自再执行 XTerm shell 命令。覆盖旧动作兼容测试。
- [ ] Run 同一命令，Expected: PASS；提交 `feat(homebrew): own package commands in the fork runner`。

### Task 4: renderer 操作控制器和不改关联的列表刷新

**Files:** Create `src/render/components/VersionManager/brew/UpgradeController.ts`, `scripts/homebrew-upgrade-controller-test.ts`, `scripts/homebrew-upgrade-refresh-test.ts`; modify `src/render/components/VersionManager/brew/setup.ts`, `src/render/core/Module/ModuleHomebrewItem.ts`, `src/render/core/Module/Module.ts`, `src/render/util/InstalledVersionNote.ts`.
**Consumes:** Task 2 prepare/begin/execute/cancelPending 和 Task 3 事件；既有 InstalledItem.stop 与 Module 安装清单。
**Produces:** `prepare(row): Promise<BrewUpgradePreview>`、`confirm(preview): Promise<BrewPackageResult>` 的单例控制器；模块通用 `InstalledRefreshOptions` 的 `updateCurrent`/`pruneNotes` 策略，默认保留原调用行为，更新刷新显式均设 false。

- [ ] 写测试：同一任务重复调用复用 flight；离页再入进度不丢；code:200 不清 loading；先 stop 再 execute；任一必需 stop 失败时 execute 次数为 0；停止部分完成保持事实，任何分支均不调用 start/restart。
- [ ] 写刷新回归：旧路径消失后，current、PATH、alias、host、StartupGroup、note 和配置文件字节/字段均不改变；刷新与普通请求合并时不得让保留策略丢失；清单仍正确展示新安装。
- [ ] Run `tsx scripts/homebrew-upgrade-controller-test.ts` 和 `tsx scripts/homebrew-upgrade-refresh-test.ts`，Expected: RED。
- [ ] singleton + reactiveBind 持有 checking/stopping/upgrading/refreshing/终态、不可变快照、IPC callback、notice 和清理。页面仅操作确认弹窗；用户取消 prepare 后不 begin，不发 stop。
- [ ] 删除现有两个入口各自拼接包管理 shell 的路径，委托同一 owner。页面的日志 terminal 挂载/卸载只影响展示，不结束命令。
- [ ] 给安装清单刷新增加模块无关策略，跳过 resetCurrentVersion 和旧备注 prune；只为本次刷新启用，不在公共服务模型放 Homebrew 标记。合并请求按不会扩大副作用的策略收口。
- [ ] brew 成功后并行刷新 Homebrew catalog/服务清单并分别收集结果；刷新失败只提示“更新成功，但列表刷新失败”，不改 succeeded、不再 execute。失败状态只允许用户重新检查后主动开始新任务。
- [ ] Run 两命令，Expected: PASS；提交 `feat(homebrew): control upgrades without migrating user settings`。

### Task 5: Homebrew 页面、警告及语言文案

**Files:** Modify `src/render/components/VersionManager/brew/index.vue`, `src/render/components/VersionManager/brew/setup.ts`, `src/lang/*/versionmanager.json`; create `scripts/homebrew-upgrade-ui-test.ts` if needed for consuming component behavior, not source-text assertions.
**Consumes:** Task 1 catalog 与 Task 4 controller。
**Produces:** 仅 Homebrew 页的已安装/可用状态、更新按钮、确认对话框、进度与日志。

- [ ] 写组件行为测试：旧版才有更新；pinned/身份不明有原因；目标跨系列明确显示；取消不 stop/execute；确认后只触发 controller；服务页没有新增字段/入口。
- [ ] Run `tsx scripts/homebrew-upgrade-ui-test.ts`，Expected: RED。
- [ ] 在 Homebrew 表内展示已安装与可用版本并保留原安装/卸载动作。确认框展示源/目标与需停止服务，正文使用 spec 第 3 节警告，不显示内部 token/jobId。
- [ ] 成功文案提示手动配置、手动启动；失败展示错误和日志，不提供“恢复服务”“自动迁移”按钮。列表刷新失败有独立文案。
- [ ] 所有已有语言包补齐新键，保证占位符一致；中英文人工检查，其他语言不得以 raw key 出现在产品中。
- [ ] Run 组件行为测试及 `node src/lang/check.mjs` 的新增键/占位符检查，Expected: 新增键无缺失/非法占位符；既有差异单列。提交 `feat(homebrew): expose confirmed upgrades in version manager only`。

### Task 6: 集成、真实前台验收与交付

**Files:** Add `test/fixtures/homebrew-upgrade-smoke-host.ts`, `scripts/homebrew-upgrade-app-smoke.ts`; update `scripts/renderer-operation-boundaries-test.ts`, `package.json`, and this plan's evidence section.
**Consumes:** Tasks 1–5 的完整链路。
**Produces:** 可复现的验收命令、结果和明确的实际硬件/包管理器验证范围。

- [ ] 先用真实 Application + 隔离 userData + 临时假 brew 可执行文件验证完整 UI/IPC/进程链：警告取消、运行中停止、停止失败、升级失败、成功刷新、无关联/配置写入、离页重入、并发启动阻挡与取消/退出。
- [ ] Run `tsx scripts/homebrew-upgrade-app-smoke.ts`，Expected: 所有检查点通过，真实日常服务/配置哈希不变，临时子进程已结束。新增 test/fixture 如被项目 ignore，必须在提交时显式纳入。
- [ ] 在明确隔离的 Homebrew 测试环境做 PHP 旧版→可用新版升级：确认停止顺序、真实退出结果、列表刷新、原配置/关联仍原值且服务未被重启。无法隔离时不动日常安装，并将真实升级验收列为尚未完成，不能用假 brew 通过代替。
- [ ] Run 新增测试、现有 StartupGroup/服务启动诊断/renderer 边界回归、定向类型/ESLint、main/fork 与 renderer 构建。既有全量类型问题按基线比较，不称全绿；只在新变更/失败说明需要时扩大检查。
- [ ] 独立审查对照五项 Review Focus；实质问题补回归并修复。交付记录明确成功/失败/unknown 与未验证范围。
- [ ] 提交 `test(homebrew): verify confirmed upgrades and preserved settings`；未经新的明确请求不执行真实用户升级或推送。

## Plan Self-Review / current state

- 用户已批准设计；本轮只生成计划，所有实现任务均未开始。
- 从元数据 → main 许可 → fork 执行 → renderer 控制器 → UI → 真实验收的接口已按依赖顺序定义。
- Review Focus 1 在 Task 4/6；2 在 Task 1/2/6；3 在 Task 2/6；4 在 Task 3/4/6；5 在 Task 4/5/6 中验收。
- 只刷新安装清单；不增加服务页字段、不自动设置关联/配置、不自动恢复服务；无新模块约束例外。
- 方案和计划尚未提交或推送。建议后续采用内联执行，以共享同一套生命周期与 IPC 上下文，完成后做一次独立审查。
