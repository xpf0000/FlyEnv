# AI Memory 临时客户端实验

日期：2026-11-03。Codex CLI 0.166.0、Kimi Code 2.4.1；用户指定不测试 Claude Code。数据为固定的构造 Atlas 样例，不含真实个人记忆；只在单进程内存中保存，退出即丢失。

## 检索与 Explicit

两种方式使用同一份 16 条样例和 8 道抽样问题（6 道有答案、2 道无答案）；baseline 一次给出全部 MEMORY.md，memory 使用实际 MCP。每个客户端沿用同一 CLI 默认模型设置；未采集解析后的模型标识，不能把这一实验宣称为严格模型控制研究。

| 客户端 | 方式 | 最终 ID 答案正确 | 保存回执 |
| --- | --- | --- | --- |
| codex | baseline | 8/8 | not requested |
| codex | memory | 8/8 | 17393312-5043-44cc-806f-5b83198e6594 / revision 1; verified by get |
| kimi | baseline | 8/8 | not requested |
| kimi | memory | 8/8 | ea45a2c2-c2fd-4d11-a7d4-0de48a9e6bb8 / revision 1; verified by get |

memory 场景额外执行 Explicit store/get，所以 token 总量与 baseline 不能直接用于节省比例；本次不声称节省 token。原始 query 与手写别名的 40 题结果见 [检索报告](2026-11-03-flyenv-ai-memory-effect.md)。实际 MCP 调用记录单独保存在本计划忽略目录，未写入用户库。

## Automatic 短任务

规则提供三个预标注的稳定事件和两条临时进度，仅要求总结完成结果，没有额外命令“保存这些”。按实际 store 结果计数。

| 客户端 | 重要事件覆盖 | 临时/额外误存 |
| ------ | ------------ | ------------- |
| codex  | 3/3          | 0             |
| kimi   | 3/3          | 0             |

该结果不证明长任务、上下文压缩或所有会话都能触发；这些仍由最终预览验收验证。未测试跨会话持久化；实验服务器不具备正式存储语义。

## 实验中发现并处理

- Codex 最初因 MCP 审批设置拒绝调用，如实反馈未保存；用户随后授权只在临时测试进程中批准 search/get/store，未修改全局配置。
- Codex 曾使用 body/body_markdown 而非 content；服务拒绝且未写入。规则和工具说明补明确字段名后，保存及读回通过；未添加宽松别名掩盖协议错误。
- Kimi 2.4.1 的 prompt 模式拒绝与 --auto 同用；移除不适用选项，限制 Agent 配置只开放三个测试工具后通过。
- Codex 自身报告既有 token-saver skill frontmatter 警告；未修改用户 skill，此警告不等同于 MCP 失败。

配置依据：[Codex 官方配置](https://developers.openai.com/codex/config-reference)、[Kimi MCP](https://moonshotai.github.io/kimi-code/en/customization/mcp.html)、[Kimi Agent 工具白名单](https://moonshotai.github.io/kimi-code/en/customization/agents.html)。
