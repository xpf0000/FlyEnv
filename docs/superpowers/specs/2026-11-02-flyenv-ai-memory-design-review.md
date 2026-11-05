# FlyEnv AI Memory 插件设计审查

日期：2026-11-02。

审查对象：`docs/superpowers/specs/2026-11-02-flyenv-ai-memory-design.md`。

任务依据：`docs/task/flyenv-ai-mem-task.md`。

## 1. 总体结论

方案方向正确，任务要求基本全部覆盖，可以作为目标设计；建议补充以下契约并收敛第一版范围后再进入开发。JSON 保存元数据、Markdown 保存正文、按项目懒加载、Agent 自主决定记忆内容的主线合理。现有 FlyEnv 的 MCP 工具表为静态构建，普通 Fork worker 池也不能保证插件单例，因此宿主扩展确有必要。

## 2. 详情分页必须绑定固定版本

设计第 7、8 节目前只定义字符安全游标，`revision` 与 `cursor` 均为可选。如果第一次 get 未指定 revision，读取期间另一 Agent 更新了记忆，后续请求可能按相同 offset 读取新正文，把两个版本拼在一起。

实现契约应明确：

- 第一次 get 即固定 `revision + bodyId`。
- 后续游标绑定这两个值及 offset。
- 版本变化时返回冲突并附当前 revision，不能继续拼接。
- 明确游标使用字节偏移还是字符偏移，以及 UTF-8 边界规则。

## 3. forget 完成后的重试语义需要消除歧义

设计第 9.4 节先要求 tombstone 保存删除请求凭据，随后又说成功后“只保留无内容凭据”，没有明确 forget 成功回执是否永久保留。若清理结束后只保留防止 store 复活的凭据，原 forget 请求重试时无法通过“先查请求凭据”的规则，可能因旧 expected_revision 返回冲突，而不是返回原删除结果。

tombstone 应明确至少永久保留 `id`、`deleted_revision`、`operation=forget`、`request_id`、参数摘要及删除结果。同请求同参数返回原结果；同请求不同参数拒绝；不同请求重复删除返回 `already_deleted` 还是冲突，也应固定。

## 4. 专属 worker 的互斥与退出确认需要具体合同

现有 `src/main/Application.ts` 的 `stopPluginServices` 只停止已登记的外部服务，没有服务 PID 时会直接返回，不能停止 Memory worker。现有 `src/main/core/ForkItem.ts` 的请求结算也不等于操作系统进程已经退出。

实施计划应明确：

- worker 注册键至少包含规范化的 `dataRoot + pluginId + generation`。
- 关闭顺序为：拒绝新请求 → 排空已接受操作 → 等待 worker 真正 exit → 才允许新代次启动。
- 请求全部结算但进程尚未退出时，不能启动替代 worker。
- 异常退出后如何取得数据根所有权，不能只依赖 FlyEnv 的单实例锁。
- 每次 tools/call 同时校验启用状态、安装代次和当前 worker 代次。

## 5. 动态工具目录和 Agent 规则接入承诺需要收窄

当前 `src/main/core/MCPServer.ts` 为每个 HTTP 请求重新创建 transport 和 Server，不能自然地通过 tools/list_changed 通知已经连接的客户端。第一版应定义为：服务端工具目录立即更新，已连接 Agent 需要刷新工具或重连；除非专门改造成可持续通知的连接模型，否则不承诺主动推送。

现有 `src/render/components/MCP/setup.ts` 的 `addToClient` 只写 MCP 配置，并不安装 Memory Rules。规则安装需要单独列出各客户端的支持矩阵、文件位置、合并及重复安装规则；不支持的客户端应提供复制或下载规则，而不是统一宣称“一键安装”。

## 6. 修改原因需要进入历史数据模型

update 接收 `reason`，get 也承诺返回修改原因，但设计第 6 节的当前/历史快照字段中没有 `change_reason` 或等价字段。应将 `reason` 明确保存在每个 revision 的快照中，否则历史接口无法兑现。

## 7. 第一版仍需进一步收敛

当前方案虽然没有引入数据库、向量库和队列，但同时包含通用插件 MCP 基础设施、专属 worker 生命周期、完整历史、幂等、崩溃恢复、永久 tombstone、LRU 缓存淘汰、项目别名与搬家重绑定、管理 UI、规则安装、备份恢复，以及三平台故障验证和万条性能测试。它已经从“重型存储方案”变成了“较重的文件可靠性方案”。

并发写入、原子提交、版本冲突和请求幂等应保留；缓存淘汰、动态工具通知、复杂项目别名管理、完整历史 UI 可以后置。建议保留原设计文档作为完整目标设计，另划一个更小的 V1：单一专属 worker、懒加载 Map、五个 MCP 工具、基础管理页、两种主力 Agent 的真实跨会话验收，以符合原任务“简单、可日常使用”的目标。

本次为文档与现有代码的静态审查，未修改实现代码，未运行实现测试。
