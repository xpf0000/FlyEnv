# AI Agent 的记忆问题：为什么存在，以及目前主流的解决方案

这是一个很值得研究的方向。尤其是现在 AI Agent 正从一次性对话工具，逐渐发展成能够长期执行任务、操作软件、管理项目、使用外部工具的智能体，记忆（Memory）正在成为 Agent 基础设施中非常重要的一层。

我先说一个核心判断：

现在 AI 模型缺少的并不是知识，而是持续、准确、可更新地理解和记住一个用户、一项任务、一个项目在长期交互中积累的信息的能力。

这与模型本身的智力水平并不是一回事。

即使使用最先进的大模型，也不能直接解决这个问题。因为模型的上下文窗口、模型参数、对话历史、外部记忆数据库，是四种不同的东西。

下面从技术原理、主流开源项目、实现方式和未来发展几个方面调研。

## 一、为什么 AI 模型已经这么强了，还是有记忆问题？

### 1. 上下文窗口不等于记忆

这是最容易混淆的一个概念。

现在的模型上下文窗口已经非常大，几十万甚至上百万 Token 都不稀奇。但这不意味着它真正拥有长期记忆。

可以把它们理解成：

| 概念                   | 类比         | 作用                 |
| -------------------- | ---------- | ------------------ |
| 模型参数（Weights）        | 大脑的基础知识和能力 | 预训练获得的知识、推理能力      |
| Context Window       | 工作记忆       | 当前任务中能够直接读取的信息     |
| Conversation History | 历史记录       | 过去发生过的对话           |
| External Memory      | 长期记忆       | 从历史中提取、保存、检索有价值的信息 |

例如：

你今天告诉 Agent：

- 我正在开发 FlyEnv。
- FlyEnv 不打算替代 Docker。
- 我希望优先发展插件市场。
- 以后回答 FlyEnv 用户邮件时，尽量使用第一人称 I，而不是 We。

今天的对话中，模型当然能够理解这些信息。

但下个月你重新开启一个对话，模型不一定还能获取这些内容。

即使把过去所有聊天记录都放进上下文，也会遇到成本、检索效率、上下文干扰等问题。

因此，大上下文解决的是一次能够读取多少信息，而长期记忆解决的是哪些信息应该被保留，以及什么时候应该重新使用这些信息。

### 2. 模型本身不会自动修改自己的参数来记住你

大模型的参数是在训练阶段形成的。

正常推理过程中：

- 用户输入不会自动修改模型权重。
- 对话不会自动变成模型的新知识。
- 关闭会话不会让模型自动保存这次交互。
- 新的对话也不会天然继承旧对话。

当然，可以通过微调、持续训练等方式更新模型，但这不是个人 Agent 的理想记忆方案。

原因包括：

1. 更新模型成本高。
2. 无法方便地针对某条记忆进行删除或修改。
3. 新知识可能干扰旧知识。
4. 很难精确区分用户偏好、临时任务和客观事实。
5. 不适合频繁更新的个人信息和项目状态。

所以，目前主流方案都是将记忆放在模型外部。

### 3. 真正困难的是：记什么、怎么记、什么时候忘记

这才是 Agent Memory 最核心的问题。

假设用户连续三个月与 Agent 交流了 1000 次。

里面可能包含：

- 用户长期偏好。
- 正在开发的项目。
- 项目架构和技术选型。
- 临时任务。
- 某次错误日志。
- 已经失效的配置。
- 用户随口提到的一件事情。
- 已经被推翻的决策。

如果把这些信息全部存下来，记忆库很快就会变成另一个庞大的聊天记录数据库。

如果只提取关键词，又会丢失上下文和信息之间的关系。

因此，记忆系统需要解决至少五个问题：

| 问题           | 具体含义             |
| ------------ | ---------------- |
| Extraction   | 从对话中提取值得记住的信息    |
| Organization | 如何组织、分类和关联记忆     |
| Retrieval    | 当前任务需要哪些历史记忆     |
| Update       | 如何处理新旧信息冲突、变化和过期 |
| Forgetting   | 如何识别无价值信息并遗忘     |

这五个问题共同构成了长期记忆系统。

## 二、目前主流 AI Agent 记忆工具有哪些？

截至 2026 年 11 月，已经形成了比较明确的技术路线。它们并不是简单地把聊天记录存进向量数据库，而是在尝试建立不同形式的长期知识系统。

我认为最值得关注的是下面五个项目。

[Mem0 - Apps Documentation](https://images.openai.com/static-rsc-4/6vqEhqjHXikJuIjOA_Z8kB9yotEAeJ15Mkv59669iHjLec7A5JBc3iKxOAEbrM6DK4-cnYZunrES8VYSt5ay2pbXqFoU36065kY0r2_wLXHdJdGDJkXtf1unujFyT-b7sqPktPecfKsFyuU-aUnX70ii-m9SVr6U4ow2UWKemQ0?purpose=inline)

1\. Mem0

通用记忆层

GitHub: [mem0ai/mem0](https://github.com/mem0ai/mem0?utm_source=chatgpt.com) · Apache 2.0

给现有 AI Agent 增加长期记忆，重点是自动提取、更新、检索用户和 Agent 的记忆。

[Zep - AI Tool Review | LinkGo](https://images.openai.com/static-rsc-4/7B-J3yNAFpMDci4JHBE2eA9LX4QpJ2nR1XuGiMyXesviOcxNqqsEAsMNHtpiS_LUlnpyeXs1D9Slr57tZfb5usJKPJ7XIYM4v-tXe99Coph4TUT9nuRIRLG5Wp_X133IKDw8Ndh0HzHN3tIZZAxeDPqCa6HNrSuhOf38lFeAidg?purpose=inline)

2\. Zep / Graphiti

知识图谱 / 时间记忆

GitHub: [getzep/graphiti](https://github.com/getzep/graphiti?utm_source=chatgpt.com) · Apache 2.0

将对话转化为带有时间信息的实体和关系，尤其擅长处理事实变化、事件顺序和历史状态。

[Stateful AI Agents: A Deep Dive into Letta (MemGPT) Memory Models | by piyush jhamb | Feb, 2026 | Medium](https://images.openai.com/static-rsc-4/eS6RmKuCfJ_vtp_WnPXD8S5YpGTmrbhPulnz94S_khZAPX_SNHx_VmQ5YtlF_rX674BPtvWQSPcFZiRQfXXMrdOyyZQ8q0H36UDFi2Ba83vxL7yccp_H6HNHT6QVlWyYgLDsXFugRCxnsezWRzMa04y83rUbh_OcoMu6ie68KPg?purpose=inline)

3\. Letta

Agent 原生记忆

GitHub: [letta-ai/letta](https://github.com/letta-ai/letta?utm_source=chatgpt.com) · Apache 2.0

从 Agent 自身的运行时和记忆管理入手，让 Agent 能够主动读写、整理和管理自己的记忆。

[Hindsight | Awesome MCP Servers](https://images.openai.com/static-rsc-4/9s5STnKCF4g2Fh-tdeAEifRQdrwiTC6v6sOnbl0frXxUTOinidUPiVIlBJ-afnIYPrgih8aU2AlgjKxM1xeguAc7ZHirfuQJHr1rBvtY3neWIR7mN6rhGPpsFyaWHK9NsWLpYN4vSgprugy7fVB5Pg25-2AFXzIXVu0qPhgT8uc?purpose=inline)

4\. Hindsight

认知型记忆

GitHub: [vectorize-io/hindsight](https://github.com/vectorize-io/hindsight?utm_source=chatgpt.com) · MIT

采用 Retain、Recall、Reflect 三种操作，并区分客观事实、经验、观察和信念。

[Cognee: 지식 그래프와 벡터 검색을 결합하여 AI 에이전트에 장기 기억을 부여하는 오픈소스 지식 엔진 - 읽을거리&정보공유 - PyTorchKR](https://images.openai.com/static-rsc-4/x3Ykr4W40tHK6eEos_2CBwgydNXfJRCN274mwJNT25J3USbCVnS5q4Pziu3PH6pDY_StYjQ0o3euI1j9GWYdHRrwfJ0lUecX7u90VRznNesUH9Yq4HQexkEgGfKz8j1lAJb22C42YR4OOj3doKVqrrh5I8tdtKRZ-aX9pZpEl1o?purpose=inline)

5\. Cognee

知识管理 / 图谱构建

GitHub: [topoteretes/cognee](https://github.com/topoteretes/cognee?utm_source=chatgpt.com) · Apache 2.0

把非结构化数据转换成可检索的知识图谱，适合项目知识库、文档和复杂关系记忆。

另外还有一个值得关注的项目：

LangMem：[langchain-ai/langmem](https://github.com/langchain-ai/langmem?utm_source=chatgpt.com)。它是 LangChain 生态中的长期记忆 SDK，提供记忆提取、更新、搜索，以及后台记忆管理机制。

下面具体拆解它们的实现方式。

## 三、这些工具具体是怎么解决记忆问题的？

### 1. Mem0：自动提取 + 向量检索 + 记忆更新

[Fireworks Tech Graph: The Claude Code Skill That Turns Text Into Production-Grade UML Diagrams (SVG+PNG)](https://images.openai.com/static-rsc-4/dXEQ3OGDZ7wk15SBPhX9q1Xfg2Hq-JHRaf6bfdp7G785C8B9BjTS_OdX4FgudKWPJ6AKqK29JsTEhXea5wbYZWVliwtRLLHDJ9jKL_YW3AzzXn9nXjkG1aXcfqvelHeSFdzN7peTMrh48_1IGHNX-f2ulPfVLYJHFbVYtwefUb8?purpose=inline)

[pasqualepillitteri.it](https://pasqualepillitteri.it/en/news/2333/fireworks-tech-graph-claude-code-skill-uml-diagrams-svg-png?utm_source=chatgpt.com)

Mem0 是我认为最值得先研究的项目之一。

它的核心思路是：不保存全部对话，而是让 LLM 从对话中提取有价值的事实，再单独保存。

举个例子：

用户说：

> 我正在使用 FlyEnv 开发本地 PHP 环境，主要使用 PostgreSQL。我不打算用 Docker，因为我希望直接管理本机服务。

Mem0 可以提取出：

```
[
  {
    "memory": "User is developing FlyEnv",
    "category": "project"
  },
  {
    "memory": "User prefers PostgreSQL",
    "category": "preference"
  },
  {
    "memory": "User prefers native local development over Docker",
    "category": "preference"
  }
]
```

然后通过 Embedding 将记忆向量化，存入向量数据库。

它主要有几个步骤：

1. Add：从新对话中提取信息。
2. Update：识别新信息是否与已有记忆重复或冲突。
3. Search：根据当前对话检索相关记忆。
4. Delete：删除不再需要的记忆。

这里有个重要细节：Mem0 在 2026 年更新了记忆算法，采用单次提取和多信号检索，包括语义相似度、BM25 关键词和实体匹配，以及时间信息。

它的新版还将 Agent 自己确认执行的动作作为记忆来源。

官方公布的新版基准测试成绩：

| 测试          | Mem0 公布成绩 |
| ----------- | --------- |
| LoCoMo      | 92.5      |
| LongMemEval | 94.4      |
| BEAM 1M     | 64.1      |

注意：这是 Mem0 官方测试成绩，部分结果使用其托管平台的专有优化，不能直接视为开源版本的实测成绩。

[image](https://www.google.com/s2/favicons?domain=https://mem0.ai\&sz=32)

mem0.ai+1



优点：

- 集成成本相对低。
- 不需要改变现有 Agent 架构。
- 有 Python、Node.js SDK。
- 支持用户级、Agent 级和会话级记忆。
- 可自托管，也有云服务。

缺点：

- 记忆提取和更新仍然依赖模型判断。
- 向量相似度不等于事实正确性。
- 对复杂项目状态、依赖关系和时间线的表达能力有限。

官方项目：[Mem0 Documentation](https://docs.mem0.ai/?utm_source=chatgpt.com)

### 2. Zep / Graphiti：用时间知识图谱记忆世界

[Stop Using RAG for Agent Memory](https://images.openai.com/static-rsc-4/3G53YWkOOP0whkRQ6oNDUTRLfVJPK-iXljsHUFKtJeLtF4cZROWARGBjDdu9E7oBS3WJ--hb58IAm0Jnpi1VUaADn8CTvL2Zp7HeVxc6CCL49k13mAwUzY_GvKylzGio2dAc8XNuNSu6-v-FuGs-oKA-SczvCAZS-pE-jSDbiS8?purpose=inline)

[blog.getzep.com](https://blog.getzep.com/stop-using-rag-for-agent-memory/?utm_source=chatgpt.com)

Graphiti 的设计理念和 Mem0 不太一样。

它认为，单纯存储一条条文本记忆是不够的，应该建立实体之间的关系，并记录关系在什么时间成立。

例如：

用户先说：

> FlyEnv 使用 MySQL。

过了一段时间又说：

> FlyEnv 的某个项目已经迁移到 PostgreSQL。

如果只是简单的向量检索，可能会同时检索到两条信息，却不知道哪个是最新状态。

Graphiti 会尝试建立类似这样的关系：

```
Project: FlyEnv
    |
    | uses_database
    |
    +---- MySQL
    |     valid: Jan - Mar
    |
    +---- PostgreSQL
          valid: Mar - Present
```

它主要解决三个问题：

- Entity：实体识别，例如用户、项目、软件、公司。
- Relationship：实体之间的关系。
- Temporal：关系的生效时间和失效时间。

它能够根据新信息更新旧关系，同时保留历史信息。

例如可以回答：

- 现在项目使用什么数据库？
- 项目之前使用过什么数据库？
- 什么时候发生了迁移？
- 哪些其他项目也依赖 PostgreSQL？

这比普通向量数据库更适合需要长期追踪状态的 Agent。

需要注意：Zep 是商业产品及服务，Graphiti 是其开源的时间知识图谱引擎。研究开源实现时，重点应放在 Graphiti 上。

优点：

- 关系表达能力强。
- 支持时间维度。
- 适合长期项目、组织和复杂业务记忆。
- 可以进行多跳关系检索。

缺点：

- 构建和维护图谱需要额外计算。
- 需要图数据库等存储基础设施。
- 简单的用户偏好记忆可能用不上这么复杂的架构。

官方项目：[Graphiti GitHub](https://github.com/getzep/graphiti?utm_source=chatgpt.com)。

### 3. Letta：把记忆管理交给 Agent 自己

[Claude Code 记忆机制图解：为什么不用向量数据库？ | 小林面试笔记](https://images.openai.com/static-rsc-4/RPVecNQM0teNUdrO5cwDbd-uFR2kfevMW0nRKmgd9AwPQikurstzJBWLkaIE77oPst0JpFglGLd78ej3dZWrB-p8m0qxqjI1K3i3q87-0E1Zmz4y89RT3sgkxPDkI3vv-WgbmFHa9HCgeKDRwrA7WryCxwnelG76LyEkfNFIUXE?purpose=inline)

[xiaolinnote.com](https://www.xiaolinnote.com/claudecode/source/cc_memory.html?utm_source=chatgpt.com)

Letta 的前身是 MemGPT，它的思路非常有意思：

不是单纯给 Agent 增加一个外部记忆库，而是把记忆管理设计成 Agent 本身的能力。

它借鉴了操作系统的虚拟内存概念。

传统计算机有：

- CPU 高速缓存。
- 内存。
- 硬盘。

Letta 将类似思想应用于 Agent：

| 记忆层             | 作用                  |
| --------------- | ------------------- |
| Core Memory     | 当前 Agent 能直接读取的核心记忆 |
| Archival Memory | 长期归档记忆              |
| Recall Memory   | 历史消息和对话检索           |

例如 Core Memory 中可以始终保持：

```
User:
- FlyEnv author
- Prefers native development
- Focuses on plugin ecosystem

Current Project:
- FlyEnv plugin marketplace
- Current priority: plugin architecture
```

当 Agent 需要了解某个很久以前讨论过的技术细节时，可以主动搜索 Archival Memory。

这套机制的特点是：

- Agent 能够主动决定什么时候搜索记忆。
- Agent 可以主动更新核心记忆。
- 可以把不常用的信息移出核心上下文。
- 记忆管理成为 Agent 的工具调用能力。

与 Mem0 相比，Letta 更偏向完整的 Agent Runtime，而不是独立的 Memory API。

优点： Agent 自主性高，记忆与 Agent 生命周期结合紧密。

缺点： 如果只是给现有 Agent 增加记忆，整体架构改造可能比较大。

官方项目：[Letta Documentation](https://docs.letta.com/?utm_source=chatgpt.com)。

### 4. Hindsight：更接近人类认知结构的记忆系统

[Hindsight AI Architecture: 4 Memory Networks for Learning | Vectorize AI, Inc. posted on the topic | LinkedIn](https://images.openai.com/static-rsc-4/zEsDY222QxjR0MdhfUEVP0NIBuga7UEE_h76skCIidY3NTlvcjTnKIwep5wVWnrwKpxe0Ms4yrQc_s5RIvlHe53BGajCPnyirEA53EJmKzVj8CNFClajTpnLhy8aR8qJ67d2eXFxN0k44wiCM1k53QGFGpaIic_eSRnJhA-8mv4?purpose=inline)

[linkedin.com](https://www.linkedin.com/posts/vectorizeio_hindsight-building-ai-agents-that-actually-activity-7417400260420972545-iJ0o?utm_source=chatgpt.com)

Hindsight 是我认为技术思路非常值得关注的一个项目。

它不仅考虑保存事实，还试图让 Agent 具备一种持续积累经验、形成判断并根据新信息修正判断的能力。

它将记忆分为四种网络：

| 记忆类型        | 主要内容      | 示例                            |
| ----------- | --------- | ----------------------------- |
| World       | 客观世界事实    | FlyEnv 支持 Windows、macOS、Linux |
| Experience  | 经历和历史事件   | 曾经处理过 Ubuntu 托盘无法点击的问题        |
| Observation | 从经历中总结的观察 | 某些 Linux 桌面环境存在托盘兼容性问题        |
| Opinion     | 根据证据形成的判断 | 应优先保持 Linux 托盘兼容性             |

它提供三个核心操作：

1

Retain — 记住

从对话、事件和信息中提取内容，建立实体、关系和时间信息。

2

Recall — 回忆

根据问题检索相关记忆，支持多种检索策略和 Token 预算控制。

3

Reflect — 反思

对已有事实和经验进行综合推理，形成观察和观点，并根据新证据调整。

这里最有意思的是 Reflect。

传统记忆系统通常回答：

> 用户之前说过什么？

Hindsight 还希望回答：

> 根据用户过去的经历，我能总结出什么规律？这些规律是否需要随着新信息调整？

这使它不再只是一个历史信息检索系统，而是尝试成为 Agent 的经验系统。

在 2026 年 ACL Demo 论文中，Hindsight 报告了使用开源 20B 模型时，LongMemEval 83.6%、LoCoMo 83.2% 的成绩；使用 Gemini 3 Pro 时，LongMemEval 达到 91.4%。这些数字同样需要结合各自测试设置理解。

[image](https://www.google.com/s2/favicons?domain=https://aclanthology.org\&sz=32)

ACL Anthology+1



我认为它最有价值的地方： 将事实记忆、经验记忆和观点记忆分开处理。这对于需要长期工作的 AI Agent 很重要。

项目：[Hindsight GitHub](https://github.com/vectorize-io/hindsight?utm_source=chatgpt.com)。

### 5. Cognee：把记忆构建成可持续更新的知识库

[topoteretes/cognee | zdoc.app](https://images.openai.com/static-rsc-4/xqg1XK2Ow3WuEp9VYK3KWkaxmOybaNSqiEFvruTNu5c9I3-VcaDQexETLKWvDSlBbVlnkDX3TC7ZN98yYzHkMB5tcoZ2EeUZqLZW6RbQoCQ5nGZnK6e1WcntdSkhohxGXEKB_nOrH-MEhZsjun5pF_2U1qkvpmJ86GGZ9_SmN-M?purpose=inline)

[zdoc.app](https://www.zdoc.app/en/topoteretes/cognee?utm_source=chatgpt.com)

Cognee 与前面几个项目相比，更偏向知识工程。

它的核心流程可以概括为：

```
原始数据
   |
   v
Add
   |
   v
Cognify
   |
   +---- 实体提取
   +---- 关系提取
   +---- 知识图谱构建
   +---- 向量索引
   |
   v
Search
   |
   v
返回相关知识
```

它有一个比较重要的设计：不只是对聊天记录做 Embedding，而是通过知识处理流水线，把文档、文本和其他数据转换成结构化知识。

例如，把一个项目的：

- README。
- 技术文档。
- GitHub Issues。
- PR 讨论。
- 架构决策。
- 代码结构。

统一导入后，建立相互关联的知识。

当 Agent 需要回答：

> 为什么这个模块要采用当前的架构？

它可以搜索相关文档、历史决策和实体关系，而不是只依赖某个相似度最高的文本片段。

官方 API 将核心过程划分为 `add`、`cognify`、`search`，同时提供多种检索方式，包括图谱检索、文本块检索和时间检索。

[image](https://www.google.com/s2/favicons?domain=https://docs.cognee.ai\&sz=32)

Cognee Documentation



优点：

- 适合大量非结构化资料。
- 适合复杂知识关系。
- 可以组合向量检索和知识图谱。
- 对项目知识库、企业知识库比较有价值。

缺点：

- 构建知识图谱有一定成本。
- 处理流程比普通向量检索复杂。
- 如果只是记住用户的几个偏好，显得过于重型。

项目：[Cognee GitHub](https://github.com/topoteretes/cognee?utm_source=chatgpt.com)。

## 四、这些工具的技术路线有什么不同？

把它们放在一起看，会发现其实存在四种不同的设计理念。

路线 A：事实提取型

Mem0

对话 → 提取事实 → 存储 → 检索 → 更新

目标是以较低成本，让 Agent 记住用户和历史交互中最有价值的信息。

路线 B：关系图谱型

Zep / Graphiti / Cognee

数据 → 实体 → 关系 → 时间 → 图谱检索

目标是让 Agent 理解复杂知识之间的关联。

路线 C：Agent 自主管理型

Letta / LangMem

Agent → 记忆工具 → 自主读写 → 后台整理

目标是让记忆成为 Agent 自己的一项能力。

路线 D：认知经验型

Hindsight

事实 + 经历 → 观察 → 观点 → 反思更新

目标是让 Agent 不只是记住历史，还能够从历史中积累经验。

还有一点值得注意：这些路线并不是互斥的。

例如，可以用 Mem0 处理用户偏好，用 Graphiti 处理项目关系，用 Hindsight 处理经验总结，再通过 Agent Runtime 决定什么时候调用它们。

不过，组件越多，维护成本和信息一致性问题也越大，不能简单认为堆叠越多越好。

## 五、还有哪些值得关注的项目？

| 项目          | 定位     | 值得关注的地方         |
| ----------- | ------ | --------------- |
| LangMem     | SDK    | 语义记忆、程序性记忆、后台整理 |
| Memobase    | 用户画像   | 结构化用户档案、属性更新    |
| MemOS       | 记忆操作系统 | 记忆生命周期、管理与调度    |
| Supermemory | 个人知识记忆 | 跨来源的个人知识管理      |
| MemoryOS    | 分层记忆   | 短期、中期、长期记忆      |

其中我会特别留意 MemOS 和 Memobase：前者尝试把记忆提升到操作系统级别的抽象，后者则强调结构化用户画像。它们与单纯的向量检索有不同的产品定位。

相关研究可以参考这篇综述：[Memory in the Age of AI Agents](https://openreview.net/pdf/180d26775b5edf368b1aea4bcf724855acc29c14.pdf?utm_source=chatgpt.com)。

[image](https://www.google.com/s2/favicons?domain=https://openreview.net\&sz=32)

OpenReview



## 六、它们的效果到底怎么样？有没有统一的评测标准？

这是调研过程中我觉得特别值得提醒的一点。

目前 Agent Memory 领域还没有一个能够完全代表真实生产能力的统一排名。

比较常见的测试包括：

| Benchmark        | 主要测试内容                         |
| ---------------- | ------------------------------ |
| LoCoMo           | 多轮、多会话对话记忆，单跳、多跳和时间推理          |
| LongMemEval      | 长期对话记忆、用户偏好、知识更新、跨会话检索         |
| BEAM             | 大规模历史数据下的记忆能力，包含百万到千万 Token 级别 |
| MemoryAgentBench | 记忆检索、更新、整合和遗忘等能力               |
| DolphinBench     | 长期记忆对 Agent 实际任务执行的帮助          |

这里有一个容易踩的坑：

记忆检索准确率，不等于 Agent 的实际记忆能力。

比如：

用户之前说过项目使用 MySQL，后来改成 PostgreSQL。

一个系统如果能检索出这两条信息，却仍然回答 MySQL，那么它虽然检索到了记忆，但并没有正确理解当前状态。

因此，我认为至少应该分别评估：

1. Recall：能不能找回正确的信息？
2. Update：能不能正确处理新旧信息？
3. Temporal Reasoning：能不能区分过去、现在和未来？
4. Conflict Resolution：能不能处理相互矛盾的信息？
5. Relevance：能不能避免把不相关的记忆塞进上下文？
6. Action Improvement：记忆是否真正改善了 Agent 的实际任务完成率？

### 一个很有意思的现象

2026 年出现了一些独立的 Agent Memory 对比测试。

例如，一个 2026 年 9 月的五套系统测试，在统一模型和测试环境下，得到的 Recall 成绩如下：

| 系统             | Recall |
| -------------- | ------ |
| GoodMem（优化配置）  | 57.6%  |
| Letta          | 52.2%  |
| Mem0           | 50.0%  |
| LangMem        | 45.7%  |
| Zep / Graphiti | 37.0%  |

这并不意味着这些工具的实际能力只有 37%～58%。

它只是一个特定数据集、模型、检索设置和评判方式下的结果。与厂商公布的 80%～90% 以上成绩也不能直接对比。

但它说明了一件重要的事情：

选择记忆工具时，不要只看官方 Benchmark 分数，更应该用自己的真实任务进行测试。&#x20;

[image](https://www.google.com/s2/favicons?domain=https://github.com\&sz=32)

GitHub+2



如果是准备将记忆系统用于真实 Agent，我建议自己构造一套测试数据：

- 同一个事实在不同会话中重复出现。
- 用户修改之前的偏好。
- 项目技术方案发生变化。
- 新旧信息相互冲突。
- 某些信息已经过期。
- 一个问题需要组合三段不同时间的历史信息才能回答。

这些测试往往比单纯的语义检索测试更有意义。

## 七、如果自己设计一套 AI Agent Memory，应该怎么设计？

这里我想进一步讨论一个问题：如果不直接使用 Mem0、Letta 这些框架，而是自己构建一个记忆层，合理的架构应该是什么样的？

我的判断是：不能只采用向量数据库，应该采用分层记忆 + 多种检索方式 + 记忆生命周期管理。

### 1. 建立分层记忆

我比较推荐下面这种结构：

L1：Working Memory（工作记忆）

当前上下文，直接注入模型

- 当前任务
- 当前项目状态
- 当前对话的关键背景
- 本次任务的执行进度

L2：Semantic Memory（语义记忆）

长期事实和用户画像

- 用户偏好
- 长期目标
- 项目基础信息
- 技术选型
- 重要约束

L3：Episodic Memory（情景记忆）

历史事件和经历

- 以前讨论过什么
- 做过哪些修改
- 遇到过哪些问题
- 某个决策是怎么产生的

L4：Knowledge Memory（知识记忆）

结构化知识和复杂关系

- 实体及实体关系
- 项目架构
- 技术文档
- 依赖关系
- 时间线

L5：Raw History（原始历史）

完整、可追溯的原始记录

- 完整对话
- 工具调用
- 执行结果
- 文件和外部资料引用

这里有几个重要区别：

- L1 应该很小，保证模型能够快速读取。
- L2 保存稳定、长期有价值的信息。
- L3 保存历史事件，方便回溯。
- L4 保存复杂的知识结构和关系。
- L5 是原始证据，其他记忆都应该能够追溯到来源。

并不是每个 Agent 都需要独立部署五种数据库。它们首先是逻辑层，可以共享底层存储。

### 2. 记忆应该有生命周期

我认为这是很多早期 Memory 实现容易忽略的地方。

一条记忆不应该只有 `content` 和 `embedding`。

至少应该包含：

```
{
  "id": "memory_001",
  "type": "preference",
  "content": "Prefers native local development over Docker",
  "subject": "user",
  "source": "conversation_123",
  "created_at": "2026-11-02T10:00:00Z",
  "updated_at": "2026-11-02T10:00:00Z",
  "valid_from": null,
  "valid_until": null,
  "confidence": 0.98,
  "importance": 0.9,
  "status": "active"
}
```

需要考虑：

- 来源：这条信息从哪里来？
- 时间：什么时候获得的？
- 可信度：是用户明确表达，还是模型推断？
- 重要程度：是否值得长期保存？
- 有效性：现在是否仍然有效？
- 状态：是否被新信息取代？

尤其是 `source` 和时间信息，非常重要。

否则一旦模型错误提取信息，就很难定位错误来源。

### 3. 记忆的写入不应该只发生在对话结束时

可以把记忆写入分为三个阶段：

1. 实时记忆提取

   用户表达了明确的长期偏好、项目决策或重要事实时，及时识别并保存。
2. 任务结束后的记忆整理

   Agent 完成一项任务后，总结本次任务的重要结果、遇到的问题和最终决策。
3. 后台记忆 Consolidation（整合）

   定期检查重复记忆、冲突记忆、过期记忆，将零散事件归纳为更稳定的知识。

Letta 的 Dreaming 机制就是值得参考的实现思路之一：使用后台 Agent 检查近期对话、整合经验、调整记忆结构，而不打断正在进行的交互。

[image](https://www.google.com/s2/favicons?domain=https://docs.letta.com\&sz=32)

Letta Docs+1



### 4. 检索不能只靠向量相似度

假设用户问：

> FlyEnv 上次那个 Ubuntu 托盘问题，最后是怎么解决的？

如果仅依靠 Embedding，可能会找到很多关于 Ubuntu、Tray、Linux 的资料。

更合理的方式是组合检索：

| 检索方式             | 用途              |
| ---------------- | --------------- |
| Vector Search    | 语义相似度           |
| Full-text / BM25 | 精确关键词           |
| Entity Search    | 根据项目、用户、软件等实体搜索 |
| Temporal Search  | 根据时间和当前状态搜索     |
| Graph Search     | 沿实体关系查找相关信息     |

然后进行 Reranking（重排序），最后只将相关记忆放入上下文。

检索结果还应携带来源和时间，便于模型判断可靠性。

### 5. 记忆管理必须允许人工干预

这是一个非常容易被忽略的问题。

记忆系统不应该完全由 AI 黑盒管理。

至少需要：

- 查看当前记住了什么。
- 修改错误记忆。
- 删除指定记忆。
- 查看记忆来源。
- 查看记忆更新时间。
- 查看哪些旧记忆已被替代。
- 区分用户明确提供的信息和模型推断的信息。

尤其是用户偏好和项目配置，错误记忆可能持续影响后续大量任务。

## 八、我的最终判断：现在应该重点关注哪几个？

如果从技术成熟度、社区、实际应用价值和架构创新几个维度考虑，我会这样选择：

| 使用场景           | 优先研究      | 原因                |
| -------------- | --------- | ----------------- |
| 给现有 Agent 增加记忆 | Mem0      | 接入简单，通用性好         |
| 长期个人 AI 助手     | Letta     | Agent 身份和记忆生命周期结合 |
| 复杂项目、时间线和状态追踪  | Graphiti  | 时间知识图谱            |
| 大量文档和项目知识      | Cognee    | 知识图谱构建和多种检索       |
| 经验积累和持续反思      | Hindsight | 事实、经历、观察、观点分层     |
| LangGraph 项目   | LangMem   | 与现有 Agent 工作流结合紧密 |

### 如果让我选择三个项目深入研究

第一名：Mem0

优先落地

最适合研究如何低成本实现自动提取、记忆更新和混合检索。

[GitHub](https://github.com/mem0ai/mem0?utm_source=chatgpt.com) · [文档](https://docs.mem0.ai/?utm_source=chatgpt.com)

第二名：Letta

架构研究

最适合研究 Agent 如何自主管理长期记忆、维护状态以及进行后台记忆整理。

[GitHub](https://github.com/letta-ai/letta?utm_source=chatgpt.com) · [文档](https://docs.letta.com/?utm_source=chatgpt.com)

第三名：Hindsight

技术创新

最适合研究如何从历史事件中提炼经验、形成判断，以及根据新证据修正旧判断。

[GitHub](https://github.com/vectorize-io/hindsight?utm_source=chatgpt.com) · [文档](https://hindsight.vectorize.io/?utm_source=chatgpt.com)

## 九、一个我认为未来很重要的发展方向

我觉得目前 AI Agent Memory 还处于从 RAG 向真正的长期认知系统演进的阶段。

早期：

```
对话
  ↓
保存聊天记录
  ↓
向量检索
  ↓
注入上下文
```

现在：

```
对话 / 工具调用 / 外部事件
          ↓
      记忆提取
          ↓
   分类、关联、去重
          ↓
    长期记忆数据库
          ↓
    检索、排序、过滤
          ↓
      Agent 推理
          ↓
      执行任务
          ↓
   结果反馈、记忆更新
```

未来更值得期待的是：

```
       Agent Experience
               |
               v
       Memory Formation
               |
               v
       Knowledge Evolution
               |
               v
       Reasoning & Reflection
               |
               v
       Improved Agent Behavior
               |
               +--------> New Experience
```

也就是说，Agent 不只是记住以前发生过什么，还能根据以前的执行结果调整以后的行为。

不过，这里有个非常重要的边界：

记忆不等于事实，经验不等于规则，模型总结出来的观点也不一定正确。

因此，未来真正优秀的记忆系统，不只是保存和检索，还必须具备来源追溯、可信度评估、冲突处理、时间管理和可控遗忘能力。

另外，个人和企业记忆涉及隐私。生产环境还需要做好用户隔离、访问控制、数据加密、删除传播和敏感信息过滤。特别是多 Agent 共享记忆时，不能默认所有 Agent 都有权读取所有内容。

## 十、结合 FlyEnv，我觉得还有一个值得探索的应用场景

FlyEnv 已经有 MCP Server，可以让 Codex、Claude Code 等 AI Coding Agent 操作本地软件、服务、网站和数据库。

这其实是一个很好的长期记忆应用场景。

例如，一个 Coding Agent 第一次操作 FlyEnv：

- 安装 PHP 8.4。
- 创建 Laravel 项目。
- 配置 Nginx。
- 创建 MySQL 数据库。
- 配置 Redis。
- 修改项目环境变量。

任务结束后，记忆系统保存的就不应该只是聊天内容，而应该是：

```
Project: my-laravel-app

Environment:
  PHP: 8.4
  Database: MySQL 8.4
  Redis: Enabled

Services:
  Nginx: my-laravel-app.test
  MySQL: 127.0.0.1:3306

Decisions:
  - Uses native PHP, not Docker
  - Uses FlyEnv managed MySQL

Previous Issues:
  - PHP extension intl was missing
  - Fixed by enabling the extension

Current Status:
  - Running successfully
```

下次 Agent 再次接手这个项目时，就可以直接恢复项目背景，而不需要重新探索整个环境。

更进一步，可以区分：

1. User Memory：用户习惯、开发偏好。
2. Project Memory：项目配置、依赖和架构。
3. Environment Memory：本机运行环境和服务状态。
4. Experience Memory：以前解决过的问题和有效方案。

这样 Agent 不仅知道用户是谁，还知道项目之前发生过什么，以及以前哪些操作有效。

这比简单地把聊天记录做成向量数据库更有实际价值。

最后总结：

我认为值得花时间深入研究的，不是单纯的 Vector Database，而是完整的 Agent Memory Architecture。

如果准备自己实现，我会优先采用 Mem0 的自动记忆提取和混合检索思路，参考 Letta 的 Agent 自主管理机制，再研究 Hindsight 的经验和反思机制。

这三者结合起来，比单独采用任何一个项目都更接近我理解的长期记忆系统。

目前最值得先动手阅读的三个仓库：

- [Mem0](https://github.com/mem0ai/mem0?utm_source=chatgpt.com)
- [Letta](https://github.com/letta-ai/letta?utm_source=chatgpt.com)
- [Hindsight](https://github.com/vectorize-io/hindsight?utm_source=chatgpt.com)
