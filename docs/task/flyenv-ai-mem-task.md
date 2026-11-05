# FlyEnv AI Agent 记忆插件 方案整理

docs/task/flyenv-ai-mem-1.md
docs/task/flyenv-ai-mem-2.md
docs/task/flyenv-ai-mem-3.md
docs/task/flyenv-ai-mem-4.md
这四个文件, 是和chatgpt讨论的关于FlyEnv AI Agent 记忆插件的相关内容. 其中有比较完善但很复杂的方案, 也有更配适FlyEnv的简化的方案.
但是现在感觉还是有点复杂. 实际上lokikill123/codex-token-skills下的memory这个skill, 就使用了一种非常简单的方式, 实现了很简单的记忆功能.
我现在的想法是, 使用json文件和md文件, 作为数据持久化的介质.
MCP调用时, 传递项目路径, 数据按需加载到内存里, 需要使用数据时, 直接使用内存中的数据.
记忆保存由AI Agent来决定, 把内容主题化, tag化, 保存标题,摘要,tag,原始内容等数据. 原始内容保存成md文件, 按需加载.
可以看下是否能借鉴docs/task/flyenv-ai-mem-2.md里的记忆类型, 记忆模型等设计.

看下我的想法是否可行, 有哪些需要完善的地方, 帮我补充完善下, 然后设计个方案吧.
