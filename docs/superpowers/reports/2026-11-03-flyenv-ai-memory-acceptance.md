# AI Memory 开发者预览验收

验收环境：2026-11-04～05，macOS ARM64，Electron 39.8.10。只使用构造样例及隔离的插件目录、userData、项目目录和 MCP token；没有操作正式记忆库、已安装 Helper 或系统 hosts。真实客户端仅 Codex、Kimi，未继续测试 Claude Code。

## 验证入口

- `yarn tsx scripts/ai-memory-acceptance.ts`：生产 PluginManager、MCPServer、IPCHandler、ForkManager、专属 worker 和正式插件；真实 HTTP 与 renderer IPC 双向操作，随后运行两个外部 CLI。
- `yarn tsx scripts/ai-memory-app-smoke.ts`：完整 Application、真实 renderer 和插件页面，独立数据根；验证分页、编辑保存中离开页面再返回、持久版本、中文及深浅色显示。关闭时排空测试 worker 后退出，避免调用会清理系统 hosts 的应用退出流程。
- `yarn tsx --test plugins/ai-memory/tests/*.test.ts` 与本计划宿主测试：故障注入、协议、存储、并发、缓存、生命周期、审批及审计。
- `yarn plugin:test ai-memory`、`yarn test:renderer-operation-boundaries`：实际插件打包、初始化/关闭、规则资源字节一致及页面操作归属。

`--skip-agents` 只跳过外部 CLI；`--retrieval-only` 和 `--retrieval-baseline-only` 仅用于对照场景定向复测，不能单独当作完整 Agent 验收。最终使用无参数的完整命令通过。脚本退出后清理临时数据库，报告保留构造数据的调用证据。

## V1 完成标准与证据对应

| 标准 | 证据与边界 |
| --- | --- |
| 跨 Agent 共享及重启 | 下方客户端结果；生产 HTTP 通过真实宿主退出/新 PID、同数据根重新读取 revision 2，原 store 仍返回 revision 1 回执。 |
| 不同记录并发、幂等和同 revision 竞争 | record-store、scope-coordinator、memory-api、acceptance 测试；HTTP/UI 同 revision 更新得到一个 success、一个 conflict。 |
| 16 KiB、中文/emoji、完整原文 | validation、record-store、memory-api 测试；超限、坏 UTF-8、无效历史、正文缺失或哈希错误均不伪报成功。 |
| 读取/删除顺序及晚到响应 | deletion、controller 测试；逻辑删除先行时拒绝新读，已取得旧快照可晚到；UI 删除后丢弃过时 detail/search。 |
| 删除回执、partial 与恢复 | deletion 和 acceptance 测试；相同请求重放、不同请求 already_deleted、清理受阻及重启恢复；永久无内容凭据防止旧写复活。 |
| 原子提交及缓存发布 | atomic-file、record-store、memory-api、acceptance；JSON rename 前保留旧版，之后未确认同步为 unknown，恢复后原请求确认；缓存失败仅附加警告。 |
| 唯一所有者与实际 exit | worker lifecycle、DataRootLease、孤儿进程及 Electron/ASAR 探针；回调结算不等于退出。Electron 本机随宿主退出，额外 Node 孤儿验证存活 owner 拒绝接管。 |
| 审批、禁用、升级和页面重入 | registry、worker、controller 测试；阶段 B 真实安装/升级/卸载冒烟；审批后和 worker ready 后均复验。 |
| 项目路径隔离 | project-registry、memory-api；原生 realpath/大小写/特殊字符、同名目录、worktree、未知子目录和失效旧根按 ID 访问。真实 CLI 从子目录使用确认根，另验证独立子项目。Windows junction 未验收。 |
| 映射与坏条目失败边界 | project-registry、acceptance；previous 失败不覆盖主映射，损坏不初始化空库；保留未映射 ID，坏记录只影响自身，global 独立服务。 |
| 容量、懒加载和协调器回收 | scope-cache、search-pagination、scope-coordinator；精确容量边界、有界读取、冷加载单次、闲置回收及更新后 cursor 失效。见容量报告。 |
| 诊断无内容及身份来源 | audit、registry 测试与生产 HTTP 断言；200 条易失白名单，嵌套 ID/revision、命中数投影，原始内容/异常不持久化。客户端身份仅自报，未识别名称为 other。 |
| 冻结问题与无答案项 | 40 道固定构造问题；原始查询、手写别名分别统计；两个 CLI 各用同一组 8 题对比完整 MEMORY.md。见下方结果。 |
| Explicit 与 Automatic | 实际 search/store/get 调用、回执丢失确认、写入拒绝；90 行任务日志包含 3 个预标注机会，再以新会话验证上下文变化。此项不是强制触发模型上下文压缩的测试。 |
| 对照的可解释性 | 同一客户端沿用相同 CLI 设置，冻结资料/问题；未取得服务端解析模型标识，未强制相同 token 上限，不能声称严格模型/上下文预算控制或 token 节省。 |

## 真实客户端结果

版本：codex-cli 0.166.0；kimi-cli 2.4.1。CLI 版本由可执行文件报告，MCP 客户端名称/版本仅为自报，诊断将未识别名称归为 other。

| 场景 | 观测结果 |
| --- | --- |
| Codex 保存 → Kimi 新会话读取 | 通过；`71d29d70-8562-8e90-9a6d-0306a333e06b`，revision 1，实际 get 验证。 |
| Kimi 保存 → 重启后 Codex 从子目录读取 | 通过；`d0f3f2e8-0723-8880-a67a-f26e37ea667a`，revision 1，实际 get 验证。 |
| 独立子项目写入与父项目隔离 | 通过；`610c3fd4-4f02-8eb5-a6a2-6a165309b291`，revision 1，实际 get 验证。 |
| Explicit 无效路径 | 两个客户端均实际调用 store，返回 failed/invalid_project_path，并如实说明未保存；没有改用其他范围。 |
| Explicit 未知回执 | 两个客户端均重放同一个 store，请求 ID 和全部参数一致，得到原提交回执，get 验证且只有一条记录。 |

Kimi 首次未知回执样例只做 search/get，未确认原请求。中英文规则明确要求重放同一个写工具后，真实客户端复测通过；未通过放宽服务端幂等规则掩盖问题。

| Automatic 客户端 | 重要机会覆盖 | 临时/额外误存 | 新会话无新事实时新增 | 新会话 get |
| ---------------- | ------------ | ------------- | -------------------- | ---------- |
| codex            | 3/3          | 0             | 0                    | True       |
| kimi             | 3/3          | 0             | 0                    | True       |

Automatic 以实际成功 store 回执计数，未把口头承诺算作保存。样例是 90 行构造任务日志中的三个稳定机会，随后启动新会话读取；不代表真实多小时任务或模型强制压缩。

| 40 题生产 HTTP 检索       | 划分    | Recall@5           | 无答案误召回 |
| ------------------------- | ------- | ------------------ | ------------ |
| 原始问题                  | tune    | 0.9166666666666666 | 0/0          |
| 原始问题                  | heldout | 1                  | 0/8          |
| 手写别名（非 Agent 扩词） | tune    | 1                  | 0/0          |
| 手写别名（非 Agent 扩词） | heldout | 1                  | 0/8          |

| 实际客户端 | 完整 MEMORY.md | MCP 检索/读取 |
| ---------- | -------------- | ------------- |
| codex      | 8/8            | 8/8           |
| kimi       | 8/8            | 8/8           |

固定资料 SHA-256：`4bd62feb8cbf8be0bc2f18fbc5100b022f0036afcded1df49e55b9387467b574`；问题 SHA-256：`1040a2c6563f28f729ca5a5a8337c145adb6147bd54b923957d0b650fc57040d`。端到端沿用阶段 A 的同一组 8 道题，服务端测试先清理之前的 global 生命周期样例，baseline 和 MCP 使用相同 16 条资料。

客户端真实搜索包含其自主组织的查询；该端到端得分不能拆成一个受控的“扩词算法收益”。原始查询、手写别名和实际客户端最终答案分开列出。未采集到 Kimi token usage 或服务端解析模型标识；Codex 的 token usage 仅作观测，不据此宣称节省：

| Codex 检索方式 | input_tokens | cached_input_tokens | output_tokens |
| -------------- | ------------ | ------------------- | ------------- |
| baseline       | 18485        | 12288               | 236           |
| memory         | 80554        | 68864               | 692           |

完整场景的首轮在对照阶段因 Codex baseline 为 4/8 而退出非零；生产 MCP 两端均为 8/8。定位到 baseline 只标注 project、未给每条资料绑定实际项目根（同时清理了重复根提示），补齐与 MCP 相同的 project_path 元数据后，定向复测两个客户端的 baseline/MCP。上表取最终对照结果；初始失败记录保留，不将其算作插件收益。比较器只报告 baseline 得分，生产 MCP 的 8/8 仍是本组验收门槛。

## 可靠性及平台范围

仅声明 macOS ARM64。锁、原子替换、目录同步、进程崩溃和原生依赖 ASAR 布局的证据见[运行时报告](2026-11-03-flyenv-ai-memory-runtime.md)。未执行 Windows/Linux/其他架构原生验收，也未模拟存储设备断电；不得据进程 SIGKILL 结果承诺任意断电不丢失。

容量默认值来自[容量报告](2026-11-03-flyenv-ai-memory-capacity.md)，千条数据均为生成样例；冷加载指插件缓存为空，没有清空 OS 文件缓存，不代表实际个人长期库或独立精确堆上界。

未知回执场景由测试 HTTP 代理将一个已提交的 store 成功响应替换为 `unknown`，客户端随后按规则确认原请求；不是生产开关，也不等于穷尽所有网络断线/重连时序。文件系统真实提交故障另由 Engine/AtomicFile 测试覆盖。

## 检查与交付边界

相关自动回归 **143/143** 通过；插件实际打包/初始化/关闭与规则资源校验、renderer 操作边界通过。95 个改动代码文件 ESLint 与 Prettier 通过。全量 `vue-tsc --noEmit` 扩大堆后完成，仍有 59 条、归一化后 53 组既有诊断；按文件/错误消息归一化行号与基线比较无新增，不能称全量类型检查通过。此交付为本地可测试预览，不包含 registry 发布、上传插件、合并主分支或正式安装包发布。

自动规则安装、完整历史 UI/回滚、路径重绑定、多个 worktree 共享身份、在线备份恢复及语义搜索仍按 V1 后置。复制规则成功、配置连接成功、实际调用成功分别呈现，未把手工接入称为一键安装。

## 最终分支审查

一次独立审查后的修复、RED→GREEN 证据及未验证范围见[审查处理](2026-11-05-flyenv-ai-memory-review.md)。最终公开工具名保持已批准的 `flyenv_memory_*`；审查后的完整客户端验收从头运行，包含全部共享/重启/未知/自动/对照场景。

本地最终构建保留在 `tmp/ai-memory-preview-package/`，脱敏调用证据、界面截图和检查日志保留在 `tmp/ai-memory-preview-evidence/final-acceptance/`；这些是当前工作区的忽略产物，不随 Git 分发。复现入口为上方脚本。
