# llama.cpp 模型关联与高级设置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 FlyEnv 按模型保存 mmproj 与推理设置，通过同一预检和命令构建链完成预览、启动及失败报告，解决 #905 的图片输入启动参数缺失。

**Architecture:** 插件 controller 管理配置、预检与应用操作；fork 管理文件身份、运行时能力、实际启动与运行快照。继续使用 ModuleInstalledItem 的 start/stop/restart，通过模块 startExtParam 传不可变快照。设置页持有编辑草稿，Storage 保存服务公共配置与每模型配置。

**Tech Stack:** 现有 TypeScript、Vue 3、Element Plus、reactiveBind、Storage、ForkPromise、Node 文件/子进程 API；验证使用现有 tsx、node:test、assert、esbuild 与 Vue compiler/custom renderer，不新增测试框架。

**Spec:** [已批准的设计方案](../specs/2026-10-17-llamacpp-model-settings-design.md)，用户于 2026-10-17 批准并要求编写本计划。

## Global Constraints

- “沿用当前单个 llama-server、一次加载一个主模型的模式”。不引入 Router、聊天界面、全局配置管理器。
- “模块数据只使用 StorageGetAsync / StorageSetAsync；不新增 Pinia，不写入 config.setup”。无例外授权。
- “保持 src/ 无宿主行为变更”；产品修改在 `plugins/llamacpp/`，仅更新现有 `scripts/renderer-operation-boundaries-test.ts` 对该插件的边界覆盖，不新增 package.json 命令。
- “只有一个候选也只推荐，不静默保存关联”；不把同仓库、同名或 BF16 当作兼容性证明。
- “新高级项默认均为‘跟随运行时默认’，未显式设置就不输出对应参数”；保留迁移前基础数值和合法 0/-1。
- “保存不自动启停”；“保存并应用”失败后不自动重放启动；切换模型的原有回退须有可靠旧快照与已确认清理。
- “预览和启动调用同一函数”；不执行用户输入的 shell 字符串，不增加敏感 IPC 通道，不改变现有认证能力。
- “实际安装二进制仍须按自身能力检测”；不以 b10549 作为最低运行时版本，不按 build 编号猜开关，保留旧构建能力差异。
- UI 保留“服务 / 版本管理 / 模型 / 设置 / 日志”五个顶层页签；中英文对等，其他语言按现有插件规则回退。
- 不自动提交、推送、发布、更新 registry URL、激活插件或升级用户运行中的插件；每任务提供建议提交点，执行提交须处于用户选择的开发流程内。
- 本文件是执行计划，当前只写文档；下面的测试/构建/实机操作均未在本轮执行。后续执行时遵守届时用户授权与 token-saver 测试约束，不能把列出的检查当作已通过。

## Review Focus

1. 同一个 `repo/main/path` 被上游替换：旧配置不能悄悄沿用新内容；有指纹差异要求确认，缺少证据则标记未知。由任务 1、2、4 的替换/迁移案例覆盖。
2. Windows 路径、引号、JSON、负数和以 `--` 起始的值：不得错误切词、执行 shell 或绕开受控参数。由任务 8、9 的参数/复制案例覆盖。
3. 保存、切模型、侧栏启动与迟到 IPC 同时发生：不得混合快照、覆盖新预览或在超时后把旧应用标成成功。由任务 5、6、9 的并发/页面重入案例覆盖。
4. 下次配置已解除投影，但旧进程仍使用它，或 worker 重建丢失快照：删除与恢复必须按真实运行信息决定，未知状态不能视为安全停止。由任务 4、5、7 覆盖。
5. 配置已写入但停止/启动/能力观察失败：保存事实、运行事实与补充信息分别报告，不重复下载/启动。由任务 5、7、12 的失败注入覆盖。

---

## 执行组织与文件边界

建议当前会话顺序执行；任务 1—7 为阶段 A，8—9 为阶段 B，10—11 为阶段 C，12—13 为阶段 D。任务依赖下列顺序，不在共享工作目录内并发修改 controller、types 或设置页。

实施前读取 `.codex/skills/flyenv-module-boundaries/SKILL.md` 与 `docs/skills/flyenv-failure-boundaries/SKILL.md`；执行器按 using-git-worktrees 检测是否需要隔离。当前计划不创建工作树，不改变分支。

### 生产文件

- `shared/types.ts`：通用模型/运行时类型；新增 `shared/settings.ts` 保存 V2 配置和启动契约，`shared/launchOptions.ts` 保存字段描述与来源规则，`shared/modelFile.ts` 保存角色/标识/候选纯规则。
- `fork/gguf.ts`：受限 GGUF 信息读取；新增 `fork/modelReferences.ts` 解析引用，`fork/capabilities.ts` 探测并缓存 help/设备，`fork/launchArguments.ts` 解析额外参数与选项归一化。
- 新增 `fork/prepareLaunch.ts`：文件与能力预检、统一 argv、显示命令；`fork/config.ts` 保留网络、API key、health 等现有公用行为并转调新构建链。
- `fork/LlamaCpp/index.ts`：prepare/inspect/status IPC、现有启动接入、active/last-success 快照、删除最终检查；`fork/models.ts` 只补文件描述、指纹与辅助操作失败隔离。
- 新增 `render/profiles.ts`：Storage 仓库、迁移与串行提交；新增 `render/launchController.ts`：完整配置预览/应用 operation，由现有 `LlamaCppController` 组合持有，不创建第二个全局域状态。
- `render/controller.ts`：连接上述对象和已有下载/选择/切换；`render/aside.vue` 接收运行时完整身份而非只传 backend。
- `render/settings/Index.vue`：服务/模型二级导航；新增 `ServiceSettings.vue`、`ModelSettings.vue`、`useSettingsDraft.ts` 及 `sections/` 分组，页面持有草稿。
- `render/Index.vue`、`render/models/Index.vue`：页面导航入口、投影摘要、关联动作；`lang/en.ts`、`lang/zh.ts`：所有新增 UI/终态说明。
- `plugin.json`、新增 `README.md`：最终版本与功能边界/验收记录。现有 builder 打包时会生成 `plugins/registry.json` 中 llama-cpp 的版本/校验元数据，任务 13 单独核对；这不是新共享域状态或宿主代码改动。

### 聚焦验证文件

验证只放在 `plugins/llamacpp/tests/`：`profiles.test.ts`、`files.test.ts`、`capabilities.test.ts`、`launch.test.ts`、`controller.test.ts`、`settings.test.ts`、`arguments.test.ts`、`advanced.test.ts`，以及共享 `harness.ts`、`fixtures.ts`。每个测试文件有明确行为边界，不为每个 bug 新建仓库根脚本。

采用 node:test，`yarn tsx --test <文件>` 运行；对 Vue/controller/fork 的宿主 import 使用 esbuild 只替换边界依赖，沿用 `plugins/dameng/tests/renderer.test.ts` 的技术方式，不复制达梦业务策略。测试生产导出函数/真实 controller 和编译后的组件，不复制实现算法。

## 先固定的数据与接口契约

以下是跨任务接口。类型名称变更必须同步所有消费任务，不能各自造相似结构。

- `ModelKey = string`，值为现有 `modelFileKey({repoId, revision, path})`；迁到 `shared/modelFile.ts` 后在旧 controller 路径重新导出，避免破坏现有页面 import。
- `FileFingerprint = { sha256?: string; size: number; mtimeMs?: number; resolvedRevision?: string }`；SHA 优先使用已验证下载记录，不在每次预览读完整大文件；没有 SHA 的外部文件采用 stat 检测并显示未验证，不宣称 stat 能证明内容相同。
- `ModelFileRef` 为 `{kind:'managed'; fileKey:ModelKey; fingerprint?:FileFingerprint}` 或 `{kind:'external'; path:string; fingerprint?:FileFingerprint; allowUnverified?:boolean}`。
- `ServiceSettings = {host:string; port:number; apiKeyFile?:string; revision:number}`；`LlamaCppSettingsV2 = {schemaVersion:2; revision:number; service:ServiceSettings; selectedModelKey?:ModelKey; initialBase:BaseSettings; modelProfiles:Record<ModelKey,ModelProfile>}`。
- `BaseSettings`：`contextSize?:number; threads?:number; threadsBatch?:number; batchSize?:number; ubatchSize?:number; parallel?:number; alias?:string`。缺省不发参数，旧基础值迁移后仍显式保留。
- `BackendSettings`：`gpuLayers?:number|'auto'|'all'; gpuDevice?:string; splitMode?:string; tensorSplit?:number[]; mainGpu?:number; projectorOffload?:boolean; projectorDevice?:string; draftGpuLayers?:number|'auto'|'all'; draftDevice?:string`。
- `ModelProfile`：`modelKey; fingerprint?; revision; base; multimodal; performance; chat; speculation; sampling; extraArgsText; backendOverrides:Partial<Record<RuntimeBackend,BackendSettings>>`；boolean 的 undefined 表示跟随默认。
- `multimodal`：`mode:'unset'|'text'|'projector'; projector?:ModelFileRef; imageMinTokens?:number; imageMaxTokens?:number; batchMaxTokens?:number`；休眠 projector 值保留但不生成依赖。
- `performance`：`flashAttention?:'auto'|'on'|'off'; cacheTypeK?:string; cacheTypeV?:string; kvOffload?:boolean; loadMode?:string; continuousBatching?:boolean; contextShift?:boolean`。
- `chat`：`reasoning?:'auto'|'on'|'off'; reasoningBudget?:number; reasoningEffort?:string; reasoningFormat?:string; jinja?:boolean; template:{kind:'model'}|{kind:'builtin';name:string}|{kind:'file';file:ModelFileRef}; templateKwargs?:Record<string,unknown>`。
- `speculation` 是 `{mode:'default'|'none'}`、`{mode:'draft';file:ModelFileRef;maxTokens?:number;minTokens?:number;threads?:number}`、`{mode:'mtp';maxTokens?:number;minTokens?:number}`、`{mode:'ngram';size?:number}` 的判别联合。
- `sampling`：`temperature?; topP?; topK?; minP?; repeatPenalty?; presencePenalty?; frequencyPenalty?; seed?; maxTokens?`，均为 number。
- `LaunchInput = {service:ServiceSettings; profile:ModelProfile; model:LocalModel; files:LocalModel[]}`；`RuntimeTarget` 使用完整 `SoftInstalled`，身份由插件已有 `variantFromInstalled`/runtimeIdentityKey 取得，不信任 renderer 传入的 backend 声明。
- `ValidationIssue = {code:string; field?:string; severity:'input'|'blocking'|'unverified'|'info'; messageKey:string; args?:Record<string,string|number>}`，UI 通过语言包展示，不能把原始用户文本当作 HTML。
- `LaunchReport = {requestKey:string; issues:ValidationIssue[]; prepared?:PreparedLaunch}`；`PreparedLaunch` 包含 `bin,args,env,cwd,runtimeKey,requestKey,dependencies,resolvedInput,display`。只有无 input/blocking 且必要语义已解析时产生可执行的 prepared。
- `ActiveLaunchSnapshot = {launch:PreparedLaunch; pid:string; startedAt:number; observation:RuntimeObservation}`；`LaunchState` 区分 stopped、running-known、running-unknown、unknown。停止后的 last-success 只能用于用户恢复或原有切换回退，不能当作当前进程仍活着。
- `launchConfigKey(input, runtimeKey):string` 只规范化服务值、目标模型、有效 backend 值、实际参与的模型设置与文件引用，不纳入 UI 状态、无关模型清单、配置 revision 或休眠附件；用于 dirty/pending 和请求去重，不作为文件已校验的凭据。

## 操作所有权与失败契约

- 页面：编辑模型/预览运行时、草稿、dirty、展开分组、离页确认；离页不取消已接受的保存/应用/下载。
- `ProfilesRepository`：串行持久化；更新函数基于最新 V2 构建整份写入，写成功后才发布新域状态；同一目标 revision 过期时报冲突，不覆盖其他模型最近保存结果。
- `LaunchController`：previewOperation、applyOperation、notice、请求深拷贝、single-flight、generation、IPC 清理及普通应用失败后的显式恢复。
- `LlamaCppController`：下载/切模型/删除域命令；与 LaunchController 共用一个模块 mutation admission，防止应用期间切模型/删除运行时/改选中项。
- fork：二进制与依赖检查、真实 spawn/health/stop、PID/运行快照；仅真实停止终态允许清除当前依赖。
- 预览中间态：checking-runtime / resolving-files / building；终态 ready / invalid / failed。相同请求复用；新 generation 不接收旧结果，但旧 IPC 仍到真实终态释放。
- 保存中间态 validating / saving；终态 saved / failed。没有正式 Storage 写成功就不变更正式 profile。
- 应用中间态 preflight / saving / stopping / starting / observing；终态 success / failed / partial / unknown。先预检，再保存，再通过通用生命周期应用；重复点击同一请求复用，不同请求拒绝并提示等待。
- `code:200` 及 PID/日志只算中间事件；`code:0` 才是普通 IPC 成功；应用还需通用生命周期返回 true 和可靠 fork 状态。通知/推荐/能力观察失败不改变已完成主结果。
- 预检失败不停止旧服务；写失败不启停；写成功后启停失败保留“已保存”；停止或失败进程清理未确认时不自动恢复、不再次 spawn。既有下载成功与关联保存失败分别结算。

共享准入具体使用插件内 `ModuleMutationGate.run(kind, requestKey, work)`：相同 kind/key 复用在途 promise，其他变更拒绝并提示等待；gate 只覆盖 apply/switch/delete/runtime-remove/一次性恢复，普通 Storage 保存由 repository 队列处理。应用执行期间拒绝更改其目标 service/profile/selectedModel，防止已预检快照被保存覆盖；更新无关模型仍可排队。sidebar 的 startParameters 必须遵守该 gate，只有当前应用持有的同运行时启动覆盖可通过。host 生命周期超时或 fork 清理未知时，标 unknown 并阻止新应用/恢复；仅在既有 fork 状态读回或通用 stop 明确确认后解除，不用 UI running=false 解锁。

## 阶段 A：每模型配置与 mmproj 闭环

### Task 1：V2 类型、配置迁移与原子发布

**Files:** 新增 `shared/settings.ts`、`render/profiles.ts`、`tests/profiles.test.ts`、`tests/fixtures.ts`；修改 `shared/types.ts`、`shared/modelFile.ts`，先保留旧 LaunchProfile 作为迁移类型。

**Interfaces:** `migrateSettings(legacy:unknown, files:LocalModel[]):LlamaCppSettingsV2`；`createModelProfile(model:LocalModel, initialBase:BaseSettings):ModelProfile`；`ProfilesRepository.load(files)`、`commitProfile(profile, expectedRevision)`、`commitService(service, expectedRevision)`、`selectModel(key)`、`removeProfile(key)` 返回完整持久化后的 V2；storage 以构造参数注入 `{get,set}`。

- [ ] **Step 1 — 写失败用例：** 构造旧 host=127.0.0.1、port=8080、context=8192、threads=4、gpuLayers=0，含两个模型和一个投影；断言迁移只为两个主模型复制基础设置而不关联投影，CUDA 设备仅进入 CUDA override；新模型不继承最近编辑的附件/参数；同 key 不同 SHA 保留旧 profile 指纹，交由 prepare 返回替换确认问题；V2 重读不再迁移。

```ts
assert.equal(v2.schemaVersion, 2)
assert.equal(v2.modelProfiles[keyA].base.contextSize, 8192)
assert.equal(v2.modelProfiles[keyA].multimodal.mode, 'unset')
await assert.rejects(repository.commitProfile(changed, originalRevision))
assert.deepEqual(repository.current, beforeFailedWrite)
```

- [ ] **Step 2 — 运行红测：** `yarn tsx --test plugins/llamacpp/tests/profiles.test.ts`，缺少新导出/持久化语义时 FAIL，记录失败断言；不以工具找不到代替有效红测。
- [x] **Step 3 — 实现：** 使用新键 `flyenv-llama-cpp-settings-v2`；load 优先有效 V2，否则读取原 settings/models；新键损坏不能吞掉并覆盖，给出恢复错误。全部迁移写成一份 V2，保留旧键。保存队列基于最新 current 合并指定字段；失败不发布，UI 旧 revision 的保存报 stale-draft。默认基础值沿用 8192/4/0，旧数据覆盖它们。
- [ ] **Step 4 — 验证：** 重跑同一文件，验证两个不同模型交错保存均保留、同模型旧草稿拒绝、失败后可重试、相同 SHA 重下载沿用/不同 SHA 要确认，全部 PASS。
- [ ] **Step 5 — 建议提交点：** `feat(llamacpp): persist per-model settings with v2 migration`，只包含本任务产品与验证文件。

### Task 2：文件角色、引用检查和投影推荐

**Files:** 修改 `shared/modelFile.ts`、`shared/types.ts`、`fork/gguf.ts`、`fork/models.ts`；新增 `fork/modelReferences.ts`、`tests/files.test.ts`；扩充 fixtures。

**Interfaces:** `inspectGGUF(path, limits):Promise<GGUFDescription>`；`describeModelFile(file):ModelFileDescription`；`rankProjectors(model, files):ProjectorCandidate[]`；`resolveModelReference(ref, role, context):Promise<ResolvedDependency>`。角色为 main/projector/draft-or-mtp/shard/support/unknown，描述包含证据等级、原因和指纹。

- [ ] **Step 1 — 写失败用例：** 用合成 GGUF 头/张量目录构造主模型、projector、draft、分片、未知和损坏文件；一个损坏项不终止其他候选；同 commit 排前、同 main 仅弱推荐；只有一个 BF16 也不自动关联，Q4/Q8 可共享；外部路径、可读性、替换指纹逐项验证。

```ts
assert.equal(projector.role, 'projector')
assert.equal(isStandaloneGGUFPath('mmproj-BF16.gguf'), false)
assert.equal(rankProjectors(main, candidates)[0].file.fileKey, sameCommitKey)
assert.equal(profile.multimodal.mode, 'unset')
await assert.rejects(resolveModelReference(shardRef, 'projector', context))
```

- [ ] **Step 2 — 运行红测：** `yarn tsx --test plugins/llamacpp/tests/files.test.ts`，先确认角色与引用行为 FAIL。
- [x] **Step 3 — 实现：** 复用现有 GGUF 随机读取器，不读权重；读入预算 16 MiB、单字符串 64 KiB、计数上限沿用现有 100 万张量/metadata，循环检查总时间 2 秒并在 finally 关闭 fd，超限标 unknown 并附原因。格式损坏不能允许确认；新 projector 架构无法识别时可经 allowUnverified 明确引用。managed 引用在模型根目录约束内按 sidecar/文件记录解析，external 仅引用原文件；不伪造 resolvedRevision，不每次全文件 hash。
- [ ] **Step 4 — 验证：** 重跑文件测试，加入 `main` 上游变化、同名不同 repo、Windows/Unix 路径、休眠引用不参与依赖、主模型检查继续拒绝辅助文件，全部 PASS。下载时描述/推荐失败只返回未知信息，不删除已完成的有效下载。
- [ ] **Step 5 — 建议提交点：** `feat(llamacpp): classify gguf files and resolve projector references`。

### Task 3：运行时能力与选项描述

**Files:** 新增 `fork/capabilities.ts`、`shared/launchOptions.ts`、`tests/capabilities.test.ts`；修改 `fork/config.ts`；fixtures 保存小型、注明来源的旧/新 help 片段，不提交完整上游源码。

**Interfaces:** `readRuntimeCapabilities(runtime, deps):Promise<RuntimeCapabilities>`；`parseRuntimeHelp(text):RuntimeCapabilities`；`readRuntimeDevices(runtime, deps):Promise<DeviceInfo[]>`；`OptionDescriptor` 具有 canonicalName、aliases、arity、valueKind、repeatable、controlled、fieldPath；基础描述先覆盖原有参数与投影参数。

- [ ] **Step 1 — 写失败用例：** 同义短长名、正反开关、参数必选/可选值、枚举、旧版无值 Flash Attention、新版 on/off/auto、未知语法；相同二进制只读一次 help、mtime 改变失效、设备刷新不改 profile；help 超时清理进程。

```ts
assert.equal(caps.byAlias['-mm'].canonicalName, 'mmproj')
assert.deepEqual(caps.byAlias['--flash-attn'].values, ['on', 'off', 'auto'])
assert.equal(parseRuntimeHelp(unrecognisedHelp).status, 'unknown')
assert.equal(probeCallsAfterSameBinary, 1)
assert.equal(probeCallsAfterBinaryReplacement, 2)
```

- [ ] **Step 2 — 运行红测：** `yarn tsx --test plugins/llamacpp/tests/capabilities.test.ts`。
- [x] **Step 3 — 实现：** help 会话缓存键使用规范 bin 路径、runtime identity、size、mtime；复用当前 help 60 秒/2 MB 上限并覆盖 stdout/stderr/error/close/timeout；设备单独缓存 30 秒且可显式刷新。存在性与语义分离，未知 help 不返回 supported=true；基础网络/模型管理选项描述为 controlled。
- [ ] **Step 4 — 验证：** 重跑该文件；旧构建不因为缺少新增 flag 而无法使用基础功能；子进程超时后不留 timer/缓存的 rejected promise，全部 PASS。
- [ ] **Step 5 — 建议提交点：** `feat(llamacpp): detect runtime options and device capabilities`。

### Task 4：统一 prepare 与实际启动、运行快照

**Files:** 新增 `fork/prepareLaunch.ts`、`tests/launch.test.ts`、`tests/harness.ts`；修改 `fork/config.ts`、`fork/LlamaCpp/index.ts`、`shared/settings.ts`；此阶段 `fork/launchArguments.ts` 只承担结构化基础项构建。

**Interfaces:** `prepareLaunch(input:LaunchInput, runtime:SoftInstalled, deps:PrepareDeps):Promise<LaunchReport>`；fork IPC `prepareModelLaunch(input,runtime)`、`inspectModelReference(ref,role)`、`getLaunchState()`；`_startServer(version,input:LaunchInput)` 内部重新 prepare。扩展插件自己的 `createLlamaCppModule` 测试依赖以替换 prepare/spawn/health/observe，不修改 Base 或宿主通用类。

- [ ] **Step 1 — 写失败用例：** 真实命令生成函数的 projector 路径进入一次 mmproj；text/unset 不发；指定缺失附件阻止 spawn；传错 runtime backend 不能覆盖已安装身份；预览 prepared.args 与实际 spawn 参数相等；health 通过才创建 active snapshot；失败清理未知保留 unknown。

```ts
assert.equal(prepared.args.filter(x => x === '--mmproj').length, 1)
assert.deepEqual(spawnArgs, report.prepared!.args)
assert.equal(spawnCountAfterMissingProjector, 0)
assert.equal(stateAfterHealthSuccess.kind, 'running-known')
assert.equal(stateAfterUnconfirmedCleanup.kind, 'unknown')
```

- [ ] **Step 2 — 运行红测：** `yarn tsx --test plugins/llamacpp/tests/launch.test.ts`，调用真实模块 `_startServer().on()` 验证，不只测字符串拼接。
- [x] **Step 3 — 实现：** prepare 将已有网络/API key 规则与文件、能力结果统一成 report；普通保存可包含 blocking/unverified，只有 apply 要求 prepared。非空 extraArgs 在任务 8 前明确 blocking，不能忽略。启动继续 serviceStartSpawn + 现有 health/stop；成功保留 active 和 last-success，停止仅在真实成功清 active。重建模块且有现存进程只返回 running-unknown；不写新的磁盘进程账本。
- [ ] **Step 4 — 验证：** 新增模型路径含空格/中文、休眠投影、主模型被替换、进程在启动检查期间退出、重建 worker 丢快照和 supplementary observation 失败的用例，重跑 launch/files/capabilities，全部 PASS。
- [ ] **Step 5 — 建议提交点：** `feat(llamacpp): prepare projector launches and retain active snapshots`。

### Task 5：controller 保存、预检、应用与一次性恢复

**Files:** 新增 `render/launchController.ts`、`tests/controller.test.ts`；修改 `render/controller.ts`、`render/aside.vue`、`shared/settings.ts`、`scripts/renderer-operation-boundaries-test.ts`；语言包补终态文案。

**Interfaces:** `LaunchController.preview(input,runtime)`、`saveModel(profile,expectedRevision)`、`saveService(service,expectedRevision)`、`applyModel(profile,runtime,service)`、`applyService(serviceDraft,runtime,service)`、`restoreLastSuccess(runtime,service)`；`LlamaCppController.startParameters(version):Promise<[LaunchInput]>`；`ModelService` 在插件内补 `restart():Promise<string|boolean>`。保存/应用响应含 saved、applied、launchState、issues，不能只返回一个 boolean。

- [ ] **Step 1 — 写失败用例：** 保存失败不变正式域状态；预检失败 stop=0；重复应用只一次 restart；A 模型预览晚到不能覆盖 B；保存期间侧栏开始启动时只能使用一个完整已发布快照；Storage 成功、stop 失败返回 saved=true/applied=false，启动数不增加；进度 200 不释放 off，0/错误各释放一次。

```ts
assert.equal(stopCallsAfterInvalidPreflight, 0)
assert.equal(restartCallsAfterDoubleApply, 1)
assert.deepEqual(resultAfterStopFailure, expectedSavedButNotApplied)
assert.equal(controller.previewOperation!.requestKey, latestRequestKey)
assert.equal(ipcOffCallsAfterProgress, 0)
```

- [ ] **Step 2 — 运行红测：** `yarn tsx --test plugins/llamacpp/tests/controller.test.ts`，以 deferred promises 控制存储、IPC、stop/start 的返回顺序。
- [x] **Step 3 — 实现：** 组合 ProfilesRepository 与具名 LaunchController，旧 profile 读访问短期作为只读兼容 getter，去除 startParameters 中的隐式 save。apply 先预检，再存，再 restart/start；公共设置更改也显示 pending，服务页读取 active endpoint 与 saved endpoint 两种来源。和现有 switch/delete/runtime remove 共享 mutation admission；页面不持有 IPC callback。一次性启动覆盖绑定 runtime identity 和 operation id，经 aside startExtParam 消费，finally 清除；不改正式保存配置。
- [ ] **Step 4 — 验证：** 旧进程清理确认后用户显式恢复一次；未知时禁止；应用失败不自动重试；sidebar 与 apply 同时调用、公共生命周期超时后迟到 success、离页重入、旧 generation finally 不清新操作、输入在预检期间改变仍使用原快照等全部 PASS。stop/start 的字符串结果不得当作 true。
- [ ] **Step 5 — 建议提交点：** `feat(llamacpp): own settings apply and preview operations in controller`；边界脚本仅扩充插件页面不拥有应用 IPC 与 controller 所有权的覆盖。

### Task 6：设置导航、基础参数和 mmproj 编辑闭环

**Files:** 新增 `render/settings/ServiceSettings.vue`、`ModelSettings.vue`、`useSettingsDraft.ts`、`sections/BaseSettings.vue`、`sections/MultimodalSettings.vue`、`tests/settings.test.ts`；修改现有设置 Index、主 Index、models Index 和语言包。

**Interfaces:** 页面本地 `SettingsLocation = {section:'service'|'model';modelKey?:string}`；`open-settings` / `open-repository` 事件由顶层接收；`useSettingsDraft` 提供 load/dirty/save/discard/requestLeave。两个编辑器复用 repository/launch controller，不各自维护保存实现；外部文件选择经 controller 的 `pickReference(role)` 调现有 dialog 再 fork inspect，结果只回到发起草稿。主模型指纹改变时，明确确认“沿用原配置”后调用 `acknowledgeReplacement(modelKey,fingerprint,expectedRevision)` 更新指纹和 profile revision，未经确认不能启动。

- [ ] **Step 1 — 写失败用例：** 编译并挂载真实编辑器；修改编辑模型不改变服务选择；仅一个候选不自动保存；选 projector 后保存，下一次 startParameters 有该引用；外部选择器取消不改原值，迟到返回不覆盖另一模型；页面未保存输入在离页确认前保留；服务 key 创建继续原有接口。

```ts
assert.equal(serviceSelectedKeyAfterEditorChange, keyA)
assert.equal(saved.multimodal.projector!.kind, 'managed')
assert.equal(saved.multimodal.mode, 'projector')
assert.equal(saveCallsAfterCandidateDiscovery, 0)
assert.equal(draftAfterPickerCancel, draftBeforePicker)
```

- [ ] **Step 2 — 运行红测：** `yarn tsx --test plugins/llamacpp/tests/settings.test.ts`，使用 Vue compiler/custom renderer 与受控 dialog，不以源码 regex 代替交互验证。
- [x] **Step 3 — 实现：** 保留五个顶层 tab；设置二级 service/model，主模型行“配置”、投影行“关联到模型”、服务页“模型配置”均进入同一编辑器。多模态 unset/text/projector、文件来源与候选理由、外部未知确认、休眠附件、基本 CPU/GPU 设置及实际运行/待重启摘要。page 中维护 editor key、检查目标 runtime 和 dirty；切顶层 tab 也经过 leave guard。查看仓库时 keep-alive 或顶层局部草稿缓存保证返回不丢编辑内容，真正离开模块再清理。
- [ ] **Step 4 — 验证：** 保存/放弃/继续编辑、恢复默认仅改当前草稿、外部文件不可删除、当前运行模型才能保存并重启、未安装运行时可保存但不能标兼容、服务地址/端口改后仅 pending、窄窗单列与底部操作可达等用例 PASS；人工检查暗色/亮色和长文件名，不运行整站 UI 构建代替该检查。
- [ ] **Step 5 — 建议提交点：** `feat(llamacpp): edit model settings and associate projectors in ui`。

### Task 7：引用删除保护、下载后关联与模型切换

**Files:** 修改 `render/controller.ts`、`render/profiles.ts`、`fork/modelReferences.ts`、`fork/LlamaCpp/index.ts`、`render/models/Index.vue` 和语言包；扩充 files/controller/launch/settings 测试。

**Interfaces:** `collectModelReferences(settings,fileKey):ReferenceUsage[]`；fork `deleteLocalModel(path)` 接口保留；controller 删除前返回引用清单；`switchModel` 复用共享 admission 和 prepare/旧运行快照，保留既有调用入口。下载完成后 controller 提供非阻塞关联入口，下载 operation 不等待用户选择。

- [ ] **Step 1 — 写失败用例：** 两个 profile 引用同一 mmproj 时删除被阻止并列两个模型；配置解除关联但 active 仍使用时拒删；worker 无快照但运行中保守禁删；无效 candidate 不影响有效 candidate；下载成功后关系保存失败不再次调用 download。

```ts
assert.equal(usages.length, 2)
assert.equal(deleteCallsWhileActiveSnapshotUsesFile, 0)
assert.equal(deleteCallsWhileRunningUnknown, 0)
assert.equal(downloadCallsAfterAssociationRetry, 1)
assert.equal(newStartCallsAfterStopFailure, 0)
```

- [ ] **Step 2 — 运行红测：** `yarn tsx --test plugins/llamacpp/tests/files.test.ts plugins/llamacpp/tests/controller.test.ts plugins/llamacpp/tests/launch.test.ts`。
- [x] **Step 3 — 实现：** renderer 用正式 profiles 检查所有引用，fork 用已有进程快照/active dependencies 作为最后运行边界，不复制执行层 PID 检查。删除主模型只删除该 profile，附件不级联；文件删除成功但 Storage 清理失败报告部分完成，仅重试元数据清理，不重放文件删除。未知依赖期间阻止插件文件删除。模型切换先预检目标再 stop；新模型失败的回退最多一次且用真实旧快照，已确认新进程清理才允许回退。
- [ ] **Step 4 — 验证：** 停止失败/清理未知/回退失败、外部附件永不删、已删除文件与残留配置可修复、通知/候选刷新失败不改变下载 success，全部 PASS。阶段 A 通过 mmproj 最小文字+图片实机流程后才可声称核心问题已修复。
- [ ] **Step 5 — 建议提交点：** `fix(llamacpp): protect referenced files and preserve partial outcomes`。

## 阶段 B：额外参数与完整命令预览

### Task 8：额外参数词法、来源冲突与动态能力映射

**Files:** 扩充 `fork/launchArguments.ts`、`shared/launchOptions.ts`、`fork/prepareLaunch.ts`、`fork/modelReferences.ts`；新增 `tests/arguments.test.ts`，扩充 capabilities/launch 测试。

**Interfaces:** `tokenizeExtraArgs(text):ArgumentToken[]` 保留行列与引号信息；`parseExtraArgs(tokens,caps):ParsedOption[]`；`mergeLaunchOptions(structured,extra,caps):MergedOptions`；`buildLaunchArguments(merged):string[]`。ParsedOption 归一 canonical/negation/source/values；MergedOptions 提供文件依赖与 controlled 参数错误。

- [ ] **Step 1 — 写失败用例：** 覆盖双/单引号、Windows 反斜杠、JSON 单 argv、等号、短别名、无值开关、负数、作为值的 `--literal`、未闭合引号；默认表单可被 extra 补充，显式重复即使相同也拒；正反项冲突；已知 repeatable 保留顺序。投影 unset + extra mmproj 生效，text + extra mmproj 拒绝。

```ts
assert.deepEqual(argvForWindowsPath, ['--mmproj', 'C:\\Models\\My Model\\mmproj.gguf'])
assert.equal(kwargsValues.length, 1)
assert.equal(mmprojSources.length, 1)
assert.equal(duplicateIssue.code, 'duplicate-option-source')
assert.equal(hostOverrideIssue.code, 'controlled-option')
```

- [ ] **Step 2 — 运行红测：** `yarn tsx --test plugins/llamacpp/tests/arguments.test.ts`。
- [x] **Step 3 — 实现：** 按已批准方案规则分词；不展开变量、不执行管道，独立未引号控制操作符报 input 错误。受控列表覆盖 model/-m、hf/model-url 等替代来源、host/port/认证、日志定位、Router 模式、help/version/list-devices 等退出模式，随 caps 归一别名；不禁止合法 argv 值里的 &/#/$。未知 flag 语法无法解析可保存但 blocking 应用。mmproj/draft/template-file 都转成相同引用解析；跨格式路径比较由 fork 本机 path 处理。保留 --no-mmap 等旧兼容项，不静默改写用户 flag。
- [ ] **Step 4 — 验证：** 重跑 arguments/launch/capabilities；补 heredoc/重定向样式文本、引号内合法控制字符、未知 enum、不完整 help、相同参数不同别名、extra GPU 设备在 CPU 后端明确报错。继承的已知 LLAMA_ARG/MTMD 参数在 prepare 中列来源，关键受控项必须显式保持一致，无法确定的环境影响标未知；不修改 EnvSync 公共代码。
- [ ] **Step 5 — 建议提交点：** `feat(llamacpp): parse extra arguments with conflict and dependency checks`。

### Task 9：参数编辑、命令复制与预览状态

**Files:** 新增 `render/settings/sections/ExtraArguments.vue`、`render/settings/CommandPreview.vue`；修改 ModelSettings、useSettingsDraft、launchController；prepareLaunch 补 display formatter；扩充 arguments/settings/controller 测试。

**Interfaces:** `formatInvocation({bin,args,cwd},platform:'win32'|'posix'):string`；`moveExtraOptionToForm(fieldPath)` 修改本地草稿并从原文本移除对应 token span；preview(input,runtime) 返回 report，页面不自行拼 argv。显示模式 draft/saved/active，目标运行时只用于检查，不调用选择版本逻辑。

- [ ] **Step 1 — 写失败用例：** 带引号/空格/单引号/JSON 的命令正确复制；显示字符串不回流到 spawn；extra 来源只读标签与“移到表单”前后 prepared.args 相同；旧请求晚到/卸载后返回/重入保留 operation，不覆盖新草稿；仅更新其他模型不让当前模型显示 pending。

```ts
assert.deepEqual(argsAfterMoveToForm, argsBeforeMoveToForm)
assert.equal(runtimeSelectionCallsAfterPreviewTargetChange, 0)
assert.equal(activeSnapshotAfterDraftEdit, originalActiveSnapshot)
assert.equal(pendingAfterUnrelatedModelSave, false)
assert.equal(previewKeyAfterOldResponse, latestKey)
```

- [ ] **Step 2 — 运行红测：** `yarn tsx --test plugins/llamacpp/tests/arguments.test.ts plugins/llamacpp/tests/settings.test.ts plugins/llamacpp/tests/controller.test.ts`。
- [x] **Step 3 — 实现：** 多行参数区、行列错误、字段来源、能力检查目标选择、折叠命令预览和 argv 列表；Windows 标注 PowerShell 格式，Unix POSIX 格式，cwd 单独显示，复制内容包含必要进入 cwd 的说明/命令。已有 key 文件只显示路径，不读取密钥；低频 CLI 名放提示。输入有错误时展开摘要，默认 300ms 防抖预览；operation 实际 owner 仍是 controller。
- [ ] **Step 4 — 验证：** spawn argv 与预览相同、PowerShell 单引号双写/尾反斜杠、POSIX 单引号转义、未安装/检查失败不影响保存、running-unknown 不伪造 active、A→B→A 草稿保护，全部 PASS。阶段 B 可单独形成高级用户可用的发布闭环。
- [ ] **Step 5 — 建议提交点：** `feat(llamacpp): preview launch commands and edit extra arguments`。

## 阶段 C：常用高级参数表单

### Task 10：资源、性能与多模态细项

**Files:** 新增 `render/settings/sections/PerformanceSettings.vue`；扩充 BaseSettings/MultimodalSettings、launchOptions、launchArguments、prepareLaunch；新增 `tests/advanced.test.ts`，扩充 settings 测试。

**Interfaces:** launchOptions 的描述表补齐设计 §6.2—6.4；`validateModelFields(profile,caps,backend):ValidationIssue[]` 返回字段级问题，编码器写 canonical argv。UI 只消费描述/能力和值，不产生第二套启动规则。

- [ ] **Step 1 — 写失败用例：** 用表驱动覆盖 context/threads/threadsBatch/gpuLayers/device/batch/ubatch/parallel/alias、Flash Attention、K/V cache、KV offload、load mode、continuous batching、context shift、多 GPU、projector offload/device、image min/max、mtmd batch。每项覆盖 undefined 不发、显式值准确、unsupported 保留但应用阻止；旧默认 profile 的 argv 与升级前基础行为一致。

```ts
assert.equal(defaultNewAdvancedFlags.length, 0)
assert.deepEqual(kvArgs, ['--cache-type-k', 'q8_0', '--cache-type-v', 'f16'])
assert.equal(cpuEffective.gpuLayers, 0)
assert.equal(cudaSaved.gpuDevice, 'CUDA0')
assert.equal(issueForMinGreaterThanMax.field, 'multimodal.imageMinTokens')
```

- [ ] **Step 2 — 运行红测：** `yarn tsx --test plugins/llamacpp/tests/advanced.test.ts plugins/llamacpp/tests/settings.test.ts`。
- [x] **Step 3 — 实现：** 既有 context 128—1048576、threads 1—512、GPU 数值 0—999 范围保留；context=0、gpu auto/all 仅能力支持时开放。新批次/槽/token 数为有限正整数，imageMin 允许 0；上下界由实际能力收紧，无明确上限不自设“智能推荐”硬上限。ubatch≤batch、imageMin≤imageMax、tensor split 非负且总和>0并匹配显式设备数。CPU 有效参数清空设备并使用0层，GPU profile 原值保留；extra 中显式不兼容值不能静默覆写。老版 loadMode 仅准确映射 mmap/mlock，不能虚构 none/dio 支持。
- [ ] **Step 4 — 验证：** 新/旧 help 下同一模型不丢配置；默认、显式 false/0 分别正确；无 projector 时投影专属细项显示休眠且不发参数；K/V 类型来自实际能力列表，后端未验证组合只告知不假判成功；布局错误导航到对应分组，全部 PASS。
- [ ] **Step 5 — 建议提交点：** `feat(llamacpp): configure performance memory and multimodal options`。

### Task 11：模板、思考模式与采样默认值

**Files:** 新增 `render/settings/sections/ChatSettings.vue`、`SamplingSettings.vue`；扩充 shared/settings、launchOptions、launchArguments、modelReferences 和语言包；扩充 advanced/arguments/settings 测试。

**Interfaces:** 同一字段验证/编码器补齐设计 §6.5、§6.7；`knownTemplateThinkingKeys(template):string[]` 只返回已验证映射，未知模板不给猜测；选择模板文件仍用 ModelFileRef，本轮模板文件仅作 external 引用，不新建模板下载管理；普通文本模板不通过 GGUF 检查器，但参与 active dependencies 和路径检查。

- [ ] **Step 1 — 写失败用例：** reasoning mode/budget/effort/format、jinja、三种模板来源和 kwargs；JSON 对象合法，array/null/未闭合 JSON 拒绝；reasoningBudget=0/-1、seed=0/-1、topK=0 不丢失；已知 thinking 冲突定位，未知模板提示语义未确认；template-file 从 extra 也跟踪依赖。

```ts
assert.deepEqual(budgetArgs, ['--reasoning-budget', '0'])
assert.equal(JSON.parse(kwargsArg).enable_thinking, false)
assert.equal(templateArgs.filter(x => x === '--chat-template-file').length, 1)
assert.equal(seedZeroArgs.at(-1), '0')
assert.equal(issueForArrayKwargs.severity, 'input')
```

- [ ] **Step 2 — 运行红测：** `yarn tsx --test plugins/llamacpp/tests/advanced.test.ts plugins/llamacpp/tests/arguments.test.ts plugins/llamacpp/tests/settings.test.ts`。
- [x] **Step 3 — 实现：** 模板互斥，默认用模型内置；显式 --jinja 在需要的模板参数前编码。思考预算允许 -1/0/正整数，强度和格式根据能力，旧版本无统一接口不自动替换 kwargs。采样 temperature≥0、topP/minP∈[0,1]、topK≥0整数、repeatPenalty>0、presence/frequency 为有限数、seed=-1或uint32、maxTokens=-1或非负整数；当前 runtime 更严格时按其收紧。页面明确“客户端请求可能覆盖采样默认值”。
- [ ] **Step 4 — 验证：** 关闭 Jinja 的模板依赖冲突、文件缺失、extra 与表单双源冲突、中英文模型/未知模板、思考格式与思考开关独立、request sampling 未被 FlyEnv 重写，全部 PASS；不新增“开启 Cline 工具调用”开关。
- [ ] **Step 5 — 建议提交点：** `feat(llamacpp): configure chat templates reasoning and sampling defaults`。

## 阶段 D：投机解码、观察与发布验收

### Task 12：普通 draft、内置 MTP、ngram 与实际能力观察

**Files:** 新增 `render/settings/sections/SpeculationSettings.vue`、`fork/observation.ts`；扩充 launchOptions/launchArguments/modelReferences、fork 模块、controller 和语言包；扩充 advanced/launch/controller/settings 测试。

**Interfaces:** `validateSpeculation(profile,descriptions,caps)`；编码 speculation 联合；`observeRuntime(endpoint,apiKeyFile,caps):Promise<RuntimeObservation>`，结果含 reported modalities/template caps 或 unavailable 原因。fork 在 health success 后启动有界观察，不把观察作为必要成功条件；controller 能补拉当前状态。

- [ ] **Step 1 — 写失败用例：** default 无 flag、none 显式禁用、draft 要文件、MTP 不要 mmproj/draft假冒、ngram 不要文件；明显 tokenizer/架构冲突阻止，证据缺失只 unverified；max/min/threads 和 draft GPU 的有效来源；观察 API 404/401/timeout 不触发 stop、不推翻成功。

```ts
assert.equal(defaultSpeculationArgs.length, 0)
assert.equal(mtpArgs.includes('--spec-type'), true)
assert.equal(mtpArgs.includes('--mmproj'), false)
assert.equal(childServiceStartCallsForDraft, 0)
assert.equal(startResultAfterObservationFailure.ok, true)
```

- [ ] **Step 2 — 运行红测：** `yarn tsx --test plugins/llamacpp/tests/advanced.test.ts plugins/llamacpp/tests/launch.test.ts plugins/llamacpp/tests/controller.test.ts`。
- [x] **Step 3 — 实现：** 支持能力确证的普通 draft 策略、draft-mtp 与 ngram-simple；不支持的版本保留值并禁止应用，不用字符串替换猜旧策略。draft max/min 为非负整数且 min≤max，ngram size 为正整数；MTP 只有明确模型证据才显示“包含 MTP”，否则“待加载验证”。EAGLE/DFlash/DSpark及独立 MTP 不表单化，extra 合法时仍可走统一验证。观察请求每次超时 1500ms、总预算 5 秒，使用现有认证；优先已确认支持的 /props 或 /v1/models，不能因此开启修改 props 的服务 flag。
- [ ] **Step 4 — 验证：** startup health success先结算，观察未处理 rejection 为0；旧观察结果不写新 active pid；模态缺失显示未知，不因为 argv 有 projector 就显示图片已支持；draft 权重没有第二个常驻进程；共享文件删除保护覆盖 draft；另测 MTP 与已配置投影可同时进入 argv，不把本任务无投影 fixture 的断言推广成禁用组合，全部 PASS。
- [ ] **Step 5 — 建议提交点：** `feat(llamacpp): configure speculation and observe runtime capabilities`。

### Task 13：完整验证、打包与实机验收记录

**Files:** 修改 `plugins/llamacpp/plugin.json`；新增 `plugins/llamacpp/README.md`；现有 builder 生成 `plugins/registry.json` 的 llama-cpp 版本/校验条目；维护本计划的执行记录与阶段勾选，不修改 registry 发布地址；必要时修复前述任务所属文件，不为验收新建一次性脚本。

**Interfaces:** 包保持 plugin apiVersion=1、id/typeFlag=`llama-cpp`、既有 render/fork entry；全部阶段完成后插件版本从当前 0.1.1 升到 0.2.0。若中间发布则在该阶段另外确定版本，本任务不得覆盖已经存在的更高版本。

- [x] **Step 1 — 运行聚焦集合：** `yarn tsx --test plugins/llamacpp/tests/*.test.ts`，预期全部 PASS，无挂起测试/残留探测子进程；此前每个核心缺陷已记录有效红测，不在最终临时补一批只镜像实现的断言。
- [x] **Step 2 — 运行必要仓库检查：** `yarn test:renderer-operation-boundaries`、`yarn plugin:test llamacpp`；`yarn eslint plugins/llamacpp scripts/renderer-operation-boundaries-test.ts` 检查本次范围，并核对 `git diff -- src` 为空。记录 `yarn vue-tsc --noEmit` 的结果，逐项区分执行前基线和本次新增错误，本次文件不得增加诊断；不能把已有错误当通过。不重复跑无关数据库/Helper 测试。
- [x] **Step 3 — 构建插件包：** `yarn plugin:build llamacpp`，预期生成 `dist/plugins/llamacpp/llama-cpp-0.2.0.flyenv-plugin` 及 builder 对应元数据；核对 manifest/version、包大小与 SHA-256，并检查 `plugins/registry.json` 仅 llama-cpp 条目的生成信息改变、artifact.url 保持原值，记录该元数据尚未发布。普通 plugin contract/build 不代表真实模型能运行。
- [ ] **Step 4 — 在临时 FlyEnv 数据根的目标环境验收：** 至少一套 GPU 多模态环境、CPU 基础环境及一套缺少新参数的旧 runtime；优先用户 issue 的 Windows x64/CUDA12.4/b10549/Qwen3.5-9B+mmproj，并记录实际驱动/build/文件指纹。真实数据库/其他服务不参与操作，用户现存模型文件不移动覆盖。
- [ ] **Step 5 — 执行并记录用户流程：** 下载或选择已下载文件→候选确认关联→保存→预览单一 mmproj→启动→最小文字与图片请求→停启→重开 FlyEnv→切另一个模型再切回；再验证 Cline 的 Base URL/别名/图片请求。记录服务器最小请求和 Cline 结果，避免把客户端格式问题混入启动结论。
- [ ] **Step 6 — UI 与失败验收：** 亮/暗色、窄窗、长中文路径、dirty 离页、默认/unsupported、保存成功但停止失败、缺失投影、丢运行快照、重复点击/离页重入分别记录。无相应硬件/模型时标“未验证”，不伪称所有 GPU/模态/MTP 都已支持；未获真实执行授权时保留该步骤待验收，不擅自操作用户正在运行的服务。
- [x] **Step 7 — 文档与建议提交点：** README 写配置归属、关联/额外参数规则、默认值、兼容与已验证矩阵、partial/unknown说明；`feat(llamacpp): release model settings and multimodal configuration`。仅记录包产物，不自动提交发布或激活插件。

## 设计覆盖与完成定义

- 设计 §1—4：任务 1、4、5，覆盖公共/模型边界、迁移、backendOverrides和不可变配置。
- 设计 §5：任务 2、4、6、7，覆盖托管/外部关联、推荐、共享、失效与删除保护。
- 设计 §6：任务 10—12 逐组覆盖全部已承诺高级表单；不表单化的扩展项由任务 8 承接。
- 设计 §7、§9：任务 3、4、8，统一真实能力、参数解析、冲突、文件依赖和必要预检。
- 设计 §8：任务 6、9—12，保留导航、同一编辑器、草稿保护、预览与运行/待应用状态。
- 设计 §10—11：任务 4、5、7、12，覆盖 operation contract、IPC终态、生命周期与最小失败边界。
- 设计 §12—15：本计划文件落点、阶段 A—D 与任务 13；最终实机报告按完成/失败/跳过/未知分别列出。

单项任务完成须有代码、对应行为验证与明确剩余限制；阶段完成不代表后续阶段已经支持。全目标完成须核心真实图片流程成立、保存重启保留、跨模型隔离正确、运行/下次配置不混淆、必需检查通过，并交付可核验插件包和验收记录。

## 执行交接

用户已授权在当前会话执行；实现位于隔离工作区 `.worktrees/llamacpp-settings`，分支 `codex/llamacpp-settings`。任务 1—12 的代码已实现并完成聚焦自动化验证，任务 13 的本地构建/记录已完成，原生/视觉验收仍待执行；未执行的原生/视觉验收保留待办，不自动提交、合并、发布或激活。

执行记录见下文；建议提交点尚未执行。


## 2026-10-17 执行与验收记录

- 工作区：`.worktrees/llamacpp-settings`；分支 `codex/llamacpp-settings`；基线 `825e521d`。产品实现仅在插件，宿主 src 差异为空；边界检查扩展既有脚本，没有新增 package.json 命令。
- 任务 1—12 已落地。描述表统一基础/性能/多模态/聊天/采样字段，复用 `OptionFields.vue`，未机械拆分各组文件；词法/来源规则放 `shared/extraArguments.ts` 供 renderer 与 Fork 共用，文件 I/O 留在 Fork。此为文件组织调整，不缩减功能分组。
- 失败边界：预检和持久化是应用的必要依赖；健康检查决定实际启动成功；能力观察仅附加；下载目录登记和删除后记录清理保留已完成文件事实，支持仅补登记/清理；无新增提权、数据库操作或服务接管。
- 独立代码审查已完成，指出的保存期间可变快照、默认值修订号、服务输入、sidecar 指纹、worker 重建/外部退出依赖、任意文件名投影、能力报告/设备展示均已修正。回归先复现失败再修复，未再次委托重复审查。
- 聚焦测试覆盖迁移与并发持久化、sidecar 实际 I/O、元数据/分片分类、CLI help/别名/多值、额外来源冲突、性能/CPU 休眠、模板/合法零值、MTP+投影及 tokenizer 冲突、应用重入/快照、失效结果、补登记、真实 Vue 编辑和默认恢复、Fork 当前/上次成功状态、HTTP 模态报告及附加失败。原生启动/健康和宿主能力边界使用受控替身，不等同真实推理。
- 可视检查尝试：隔离 Vite 加载真实组件+Element Plus，纯模拟目录/IPC，无用户数据；内置浏览器不可用，Chrome 连接超时，已停止预览服务器。亮/暗色、窄窗、长路径视觉结果仍未验证。
- 未找到可用本机 llama-server/GGUF；Windows CUDA/Qwen/Cline、真实文字/图片、CPU/旧版加载、MTP 及原生跨平台生命周期均待验收。未下载大模型、移动用户文件或操作现存服务。

- 最终聚焦集合：36/36 PASS；`test:renderer-operation-boundaries` PASS；`plugin:test llamacpp` PASS（0.2.0）。修改文件 ESLint 无错误/警告，`git diff --check` PASS。
- `vue-tsc --noEmit` 退出 2：基线 55 项，当前 53 项既有诊断，本次新增 0；修正 aside 原有的两项签名诊断，未修改 logs/runtime 中其他既有问题。全插件 ESLint 退出 1：120 项均为未修改 config/release/runtime 三文件的既有 Prettier 诊断，没有顺手重排无关文件。
- 补充 Fork 回归：进程退出清除当前依赖、保留上次成功；PID 被其他程序复用时不能冒充当前运行快照。复用同一进程列表和已记录 PID，不重复执行查询或添加停止流程。

- 最终产物：`dist/plugins/llamacpp/llama-cpp-0.2.0.flyenv-plugin`，346604 字节，SHA-256 `74489d2aebe85ba225cb5a19a678cd1552e016b31bba90a5c1d076f114b7b344`。7z 完整性、解包 manifest apiVersion=1/id/version、README/render/fork 与构建目录逐字节一致，registry SHA 匹配。registry 仅 llama-cpp version/SHA 改变，发布 URL 保持空值；未提交、合并、上传、安装或激活。


## 本地合并授权

用户在实现交付后明确要求“合并到 master 主分支”，授权为本次代码和文档创建本地提交并合并 master；不包含推送或发布。合并前重新运行 36 项聚焦测试、renderer 边界和插件契约，全部通过。原生与视觉待验收项保持记录。


## 0.2.1：首次设置读取修复

- 用户报告“模型设置”首次进入因 `StorageGetAsync` 的 `Error('no found')` 中断。使用真实宿主 Storage.ts、仅替换 localForage I/O，已复现缺少 V2、首次安装缺少目录/旧配置三项失败。
- owner 不变：controller.init 单飞加载模型目录，ProfilesRepository 加载/迁移域配置；无新页面状态、IPC、Pinia、共享配置或服务流程，无需例外授权。
- 读取为迁移必要依赖：仅宿主约定的 `no found` / `expire` 转为空值；I/O 故障继续拒绝，不能回退默认值或写入新配置。已有 V2 结构损坏仍拒绝并保留原数据；迁移写入失败也继续传播。原有初始化失败后的显式重试保留，不添加自动重试。
- 回归覆盖真实读取契约：旧配置迁移、新装默认值及重开、过期记录、真实读取故障无写入/恢复后重试、损坏 V2 不覆盖。只修插件存储适配，不修改宿主 Storage.ts。

- 修复验证：新增 5 项使用真实宿主读取函数的回归；修复前 3 项以 `no found` 复现，修复后全部通过，全插件聚焦集合 41/41 PASS，renderer 边界、0.2.1 插件契约、修改文件 ESLint、diff 检查通过。类型检查仍为 53 项既有诊断，本次新增 0。
- 0.2.1 产物 `/Users/x/Desktop/WorkSpace/GitHub/FlyEnv/dist/plugins/llamacpp/llama-cpp-0.2.1.flyenv-plugin`，346881 字节，SHA-256 `dc7d9eeec1a5aa8de1d80a7760e32c3a39cf105d4fd5dfaead24e754b96cc18d`；7z 完整性、解包内容和 registry 校验匹配，发布 URL 保持空值。本次修复在 master 工作区，未提交、发布或自动替换用户正在使用的插件。


## 0.2.2：帮助续行覆盖参数定义

- 用户提供本机 b10545 macOS arm64 Metal 运行时和 JiRackUltra_1b_Q3_K_M.gguf。只读执行该二进制 --help，并走实际 GGUF/sidecar/能力/prepare 路径，精确复现 `Unknown or unverifiable option: 4`。
- 根因：帮助说明的缩进续行 `--threads)` 被识别为声明，将原始 `-t, --threads N` 的 arity=1 覆盖为 0。仅解析声明列的选项并校验选项 token 边界，说明续行继续归到前一个选项，不推断或强行覆盖参数数目。
- 生命周期/失败归属不变：capabilities/prepare 属于 Fork；没有新 IPC、持久域状态或服务路径。解析失败仍阻止启动，不能靠跳过裸值 4 放过实际未知参数；已有配置不改变。
- 先保存本机原始帮助关键片段，新增解析器和完整 prepare 红测。将用用户提供的同一运行时/模型复验，若做原生启动则使用独立临时端口、日志和本次 child PID，结束仅停止本次创建进程，不操作用户现存服务或改写模型。

- 本机结果：修复前相同 runtime/model 的真实 prepare 返回 Unknown or unverifiable option: 4；修复后 issues=[]，argv 保留 --threads 4。独立端口 57290、context=512、GPU layers=0 原生启动，/health=ok、/completion=200 且生成 4 token；仅本次创建 PID 76278 收到 SIGINT 并退出 0，已 wait 确认不再运行。没有测试 GPU 卸载或图片能力。

- 最终验证：新增 2 项针对真实 b10545 帮助片段的回归先失败后通过，全部聚焦 43/43 PASS；边界、0.2.2 插件契约、修改文件 ESLint、diff 检查通过。全仓类型仍为 53 项既有诊断，新增 0。宿主 src 未修改。
- 0.2.2 包 347096 字节，SHA-256 `f496437f9771831a723366530a79a0cb8965af0720c4d2639ecb955c611f7b7b`；7z 完整性、解包 manifest/README/render/fork 和 registry 校验匹配，发布 URL 保持空值。包含前一轮 0.2.1 的存储修复；master 工作区尚未提交发布/激活。

### 2026-10-17 启动后确认误报修复（0.2.3）

- 实证：宿主 ForkManager 使用 worker 池，start 与 getLaunchState 可落到不同实例；仅内存快照不能满足原计划。修正 Task 4 的“不写磁盘”假设：插件 Fork 在健康成功后原子保存启动凭据，包含实际 argv、PID、进程创建时间，其他 worker 以同一进程表和 PID 文件验证，绝不从保存配置推测运行参数。文件位于插件运行目录，仅为进程证据；配置仍经 Storage，宿主 src、Pinia、共享类型和公共生命周期不变，无新增例外。
- 所有者/生命周期：Fork 持有进程证据，跨 worker/页面存在；controller 仍持有 apply、generation 与通知。准入、重复调用、start/restart/stop 使用原有 gate 和 ModuleInstalledItem，不新建启停流程。健康成功为启动终态；快照写入和 HTTP observation 是附加动作，失败只使确认未知，不反转启动成功、不停止或重放。保存失败/真实启停失败仍传播。
- 凭据仅在 PID、创建时间及二进制一致时是 active；缺失/损坏/无法核验为 running-unknown，禁止删除未知依赖。停止和外部退出保留历史 lastSuccess，不能用它证明活进程。观察缓存以启动身份隔离，迟到观察不得覆盖新启动凭据。
- apply 用本次 refresh 返回值确认，避免后续并发刷新阻止当前响应发布导致误报。start=true 后状态查询失败/unknown/running-unknown 给出 saved=true/applied=false 的警告；确认停止或启动了不同配置仍报告部分失败。
- 回归：跨 worker 读取与依赖保护、创建时间不同的 PID 复用、缺损凭据、快照写失败仍启动成功、迟到观察隔离、并发 refresh、查询失败不重放；聚焦测试、宿主边界检查及用户 b10545/模型在隔离目录和端口的原生启动验证。保留用户现有 8080 服务。

- 验证完成：先复现跨 worker/并发 refresh/错误通知 3 项红测，修复后共 47/47 PASS；renderer-operation-boundaries、插件契约、修改文件 ESLint 和 git diff --check 通过；全仓类型 53 项既有诊断，新增 0；src 无改动。
- 原生证据：用户 b10545-macos-arm64-metal + JiRackUltra_1b_Q3_K_M.gguf，以真实 prepare/health/observation、真实 ps 创建时间和 controller apply 验证；仅 spawn/PID 文件边界替换到隔离 BaseDir（不声称覆盖整个宿主公共生命周期）。worker A 启动、worker B 确认，返回 Settings applied/saved=true/applied=true/running-known；端口 59983、PID 78961，/completion HTTP 200 生成 4 token，SIGINT 退出 0。用户原 PID 77918 仍运行。未验证 GPU offload、图片或 Windows 原生流程。
- 0.2.3 包 347939 字节，SHA-256 `ebfab0153eb6f3c79cd5f5b52e37227837b3617cf402f78662ea9ac5582aa044`；7z 完整性、解包 manifest/README/fork/render 与 registry 均核验；发布 URL 仍空，未提交/发布/激活。包括 0.2.1 存储和 0.2.2 参数解析修复。已有旧版启动进程缺少凭据时保持未确认，用户更新后显式保存并应用建立新凭据。

### 0.2.4：按用户要求移除启动后配置确认

用户明确否决启动后的配置确认流程，本节覆盖之前 0.2.3 的磁盘凭据方案及相关验收要求。应用成功条件改为预检通过、Storage 保存成功、既有 ModuleInstalledItem start/restart 返回 true；不再为成功应用查询运行状态、对比 requestKey，或因快照不可用显示警告。真实保存、停止、启动/健康检查失败仍保留原错误与已保存事实。

所有者/生命周期：仍由插件 controller 持有 apply 单飞和终态通知，Fork 持有服务启停与内存运行依赖，组件只绑定状态；没有新 IPC、Pinia、共享配置或宿主改动，无约束例外。删除仅为该确认新增的 launch-state/launch-observation 磁盘读写、进程创建时间采样及缓存测试；保留原本供展示、依赖删除保护及手动恢复使用的内存记录，worker 无记录不影响应用成功。界面移除运行配置对比标记，缺少记录只显示暂无记录。

回归验证：start/restart 返回 true 时，运行记录缺失/不同且状态查询不可用仍直接成功、只执行一次启停；启动不为配置确认采样进程或写凭据；原有预检失败不停止服务、保存后启停失败保留部分完成、依赖删除保护继续验证。包版本 0.2.4；不操作当前运行服务，不提交发布。

- 完成验证：应用不查配置、启动不采样/写凭据两项回归先失败后通过；全部 44/44 PASS，renderer 边界、0.2.4 插件契约、修改文件 ESLint、diff 检查通过。全仓类型仍为 53 项既有诊断，新增 0，宿主 src 无改动。
- 产物：dist/plugins/llamacpp/llama-cpp-0.2.4.flyenv-plugin，346692 字节，SHA-256 `d16f11f8248176a1018cce1e726b969e8783648eecfd728bbc03536dd21dbd29`；7z 完整性/解包 manifest、确认代码与文案移除、registry SHA 核验通过，URL 保持空值。未提交发布/激活或操作已有服务。

### 0.2.5：服务与模型设置表单布局

- 用户指定上下结构；现有 Element Plus 表单统一 label-position=top，字段说明跟随控件。投影模式说明、文件选择、外部路径及同仓库文件入口集中到关联区域；选模型后的服务模型按钮归入模型字段。服务/模型共用页内滚动与底部操作区，子表单（模板、投机等）的文件按钮和说明也遵守相同间距；窄窗口换行且长路径不撑开页面。
- 仅插件组件模板和 scoped-by-root CSS/说明文案，无新 IPC、共享配置、Pinia 或操作。草稿/选择仍归组件，异步保存/应用/文件选择仍由既有 controller/Fork 流程执行，操作准入、生命周期、重复调用、进度和错误边界保持原契约；不重新加入启动后配置确认，无约束例外。
- 投影限制已核对用户 b10545 --help 和同 tag common/arg.cpp：--mmproj FILE 写入单个 params.mmproj.path；每个实例选择一个文件，不添加多选假支持。

- 验证：44/44 聚焦测试、renderer 边界、0.2.5 插件契约、修改文件 ESLint/diff 检查通过；全仓类型 53 项既有诊断，新增 0，src 无改动。真实组件 + Element Plus 独立浏览器检查服务/模型、深浅色、560px 窄窗和长中文外部路径，viewport/document 均 560px，浏览器异常 0；截图在 /tmp/llamacpp-layout-shots，不等同 Electron 内整体验收。独立预览/浏览器已退出，未操作运行服务。
- 包 dist/plugins/llamacpp/llama-cpp-0.2.5.flyenv-plugin，347776 字节，SHA-256 `5bb51787430bd3dfa9ed53a4609528bff68beaef9d8f9c9039b82d8d9f32e38e`；7z 完整性、解包 manifest/样式/README 与 registry 校验通过，URL 保持空值，未提交发布激活。

### 0.2.6：设置区域自适应双列

- 按用户反馈，上下结构只约束标签/控件，不要求每个字段整行。基础资源、性能、多模态细项、模板思考、投机数值及采样分组采用两列；服务地址与端口并排。文件路径、模板 JSON、tensor ratio、额外参数等长内容保留整行。保留所有原 v-model、事件和异步流程，仅改插件模板与 CSS，无新增状态/IPC/生命周期或约束例外。
- 设置滚动区域使用 inline-size container query：按实际内容区宽度（640px 断点）切为单列，避免侧栏占位后仍挤双列。真实 Vue/Element Plus 浏览器验证宽区域双列、同一宽窗口但600px面板单列、560px窗口单列且无横向溢出；深浅色截图继续保存在 /tmp/llamacpp-layout-shots。预览/独立浏览器已退出，未操作服务。
- 44/44 回归、renderer 边界、0.2.6 契约、修改文件 ESLint 与 diff 检查通过；src 无改动。仅模板和 CSS 调整，未重复全仓类型检查。包 347951 字节，SHA-256 `6762353af4920a7d85a47dc998c6903496057411f1366f7a87e3115a3fbc554d`，7z/解包双列与容器样式/manifest/registry 核验通过；未提交发布激活。

### 0.2.7：标题操作与两组参数并排

- 按用户要求，OptionFields 的跟随运行时默认按钮移入 label slot，标题行满列宽，按钮右对齐并使用 warning link；保留合法零值、false 的重置入口及原 change 行为，点击阻止 label 默认聚焦。统一标签最小高度使同排控件对齐。GPU 分配比例取消跨列，与主 GPU 编号并排；OptionFields 添加尾部默认 slot，让 Jinja 与模板来源在同一个 grid 内并排，避免嵌套分组造成空列。窄区域仍由原容器查询转单列，JSON/文件维持整行。
- 仅插件模板/CSS，无新状态、IPC、生命周期或约束例外；未加入启动后确认。44/44 回归、renderer 边界、0.2.7 契约、ESLint/格式与diff检查通过，src 无改动，未重复全仓类型检查。
- 真实组件浏览器检查：两组字段及输入控件 y 坐标分别相同；标题 warning 按钮到字段右边距为 0，点击后输入回到默认且重置入口消失；560px 下单列且无横向溢出，深浅色截图 /tmp/llamacpp-titles-shots。预览与独立浏览器已关闭，未操作服务。
- 包 348193 字节，SHA-256 `f09ff528860d94ba702e1473a236285bf79d718f831cc5faa1bbfac8d5800c93`；7z完整性、manifest、标题样式和registry核验通过，URL保持空值，未提交发布激活。

### 0.2.8：输入控件占满表单列

- 按用户要求，基础资源、主 GPU 编号及其余设置分组的 input/select/input-number/textarea 统一 width/max-width=100%，移除 input-number 和数字 wrapper 的两处320px上限及数字专属 class。文件选择改为下拉框整行、按钮在下，避免按钮挤占输入宽度；保留双列/单列、自适应、标题warning重置与原绑定。仅模板/CSS，无新状态/IPC/生命周期，无约束例外。
- 44/44 回归、renderer边界、0.2.8契约、修改文件ESLint/格式/diff检查通过，src未改，未重复全仓类型检查。真实Vue/ElementPlus浏览器展开所有分组并启用draft/builtin模板：模型51个输入控件与服务4个控件均与所属form-item content等宽（差<1px），宽窗和560px窄窗均通过、无横向溢出；截图/tmp/llamacpp-widths-shots，预览与独立浏览器已关闭，未操作服务。
- 包348201字节，SHA-256 `b7dea3d31a37bab11f7f0207c9a68183e223ee383fce9f76f10dd93281301942`；7z完整性、manifest、无320px残留的打包样式及registry核验通过；URL空，未提交发布激活。

### 0.2.9：本地模型下载记录与磁盘可用性同步

- 根因已确认：controller.init 从 Storage 直接发布全部历史下载记录；模型页、设置候选和仓库已下载标记都把记录当作文件存在。用户目录只有Q3，但历史Q4记录仍被列出，切换预检因此触发ENOENT。
- Fork 新增插件内批量文件可用性检查：每项检查绝对路径、常规文件和可读性，返回 available/missing/unverified 与原因；ENOENT/ENOTDIR 只影响该文件，权限/I/O错误标未核验，不冒充文件删除。无需扫描权重、散列、停止服务或后台轮询。
- renderer singleton controller 保留原始下载记录，localModels 只暴露已核验可用项；原始记录与全部profiles仍保存，不自动改选服务模型。初始化、模型页进入/本地刷新时核验；操作owner覆盖单飞promise、状态/错误通知和终态。页面只绑定刷新命令/状态，无新Pinia或共享配置，无约束例外。
- 文件检查为独立逐项结果；通道失败显示扫描失败，不清空Storage或配置。迟到检查只更新同一记录对象，不能覆盖并发下载的新记录或恢复已删除记录。下载已完成仍独立成功，注册重试只写元数据；所有目录持久化写原始记录。缺失服务模型不自动切换，设置编辑回退到可用候选或显示空状态，实际启动继续严格预检；不重新加入启动后配置确认。
- 验证：真实临时文件删除/恢复、混合候选、单项权限错误、通道失败不改持久数据、重入复用和迟到扫描/下载竞态，既有存储与UI交互回归，实际用户Q3/Q4路径只读检查；构建0.2.9并验证包，不操作当前服务或自动下载模型。

- 实现完成：原始目录记录独立保留，localModels getter 仅发布 available 状态；模型页添加本地刷新/扫描错误展示，模型设置挂载时重查，缺失选择回退为可用编辑对象或空状态但不改服务默认模型。新增真实Vue回归覆盖原服务模型缺失后编辑可用模型、设置为服务模型及保存，缺失profile与原目录记录均保留。
- 首个红测准确复现 Q3 存在/Q4 不存在却同时出现在列表；修复后47/47 PASS（3项新增真实文件/竞态测试与扩展Vue流程），renderer边界、0.2.9契约、ESLint/diff通过；全仓类型53项既有，新增0，src无改动。实际用户目录只读调用新检查器，Q3=available/Q4=missing，未写用户文件或启停服务。
- 0.2.9 包349053字节，SHA-256 `119529165234490db8c0a96918ed9446c768b6fd27cea351c07779317e009699`；7z完整性/解包manifest/render/fork检查与registry核验通过，URL保持空值，未提交发布激活。

### 0.2.10：Windows 运行时目录重命名失败

- 用户错误定位到 staging/runtime → runtimes/<id>，位于解压、--version 探测和 manifest 写入之后。代码目前对 rename 的 EPERM/EACCES/EBUSY 立即失败；Windows 既可能是短暂共享占用，也可能是真实权限或目标目录问题，单凭该错误不能断言杀毒软件是根因。
- 所有者仍为 Fork runtime installer；controller 单飞、进度和终态、现有通用服务停止契约不变。仅对 Windows 的三种可重试 rename 错误做次数/总等待有上限的退避，覆盖旧目录备份、新目录就位与旧目录恢复；不重放下载、解压或探测，不复制覆盖运行目录，不提权、不修改 ACL、不执行额外进程查询。其他平台/其他错误立即传播。
- 安装成功条件仍是已验证目录完成就位。备份移走后就位失败必须恢复；恢复失败必须报告原安装错误与恢复错误、保留备份位置，不再静默吞掉。最终目录被其他操作占用时不覆盖。激活成功后的备份/暂存清理仍为附加动作，不否定成功或重放安装。存在性检查只有确定缺失才返回 false，权限/IO 失败不得被当作目录不存在。
- 回归通过真实临时目录+Windows错误注入覆盖：短暂占用成功且下载/探测只执行一次、持续占用有界失败并恢复旧版本、备份/恢复占用重试、恢复失败保留原文件和错误、非Windows/非共享错误不重试、清理失败不翻转成功。当前无Windows宿主，不把注入测试当作用户机器实测。模块边界无新增例外，src保持不变。
- 补充目录语义验证：全新安装的 runtimes 父目录及版本目录都不存在时正常创建父目录并就位；覆盖旧版本前先备份，目标同样不存在。模拟父目录在安装中被外部删除时为 ENOENT，立即报错且不作为占用重试；外部新建冲突目标时保留其内容和旧备份，不覆盖。默认存在性检查的 EACCES 必须传播、ENOENT 才按缺失处理。
- 实现与审查完成：同一目录移动最多 6 次尝试，退避100/200/400/800/1000ms，合计等待2.5秒；备份/就位/恢复共用策略，原安装错误及恢复错误共同报告。新回归首轮5项失败准确暴露立即失败与静默恢复错误，修复后全60/60通过；renderer操作边界、0.2.10插件契约、修改TS文件ESLint及diff检查通过。全仓类型仍为53项既有诊断，按路径/错误内容比较新增0；src无改动。未操作用户运行中的服务或本地模型，Windows实机尚未验证。
- 0.2.10包349536字节，SHA-256 `17cb2f2da8717da1da8824c47b850583abb15dac7e8721175995b71973e86814`；7z完整性、解包manifest/fork/README及registry版本/散列核验通过，下载URL为空；未提交、发布或激活。
