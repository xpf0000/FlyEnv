用户:
整体思路很好。 但是现阶段我想更简单点。 毕竟你方案里明确提到需要PostgreSQL，Python， TypeScript， Redis， Qdrant等服务， 而FlyEnv目前对这些已经天然支持了。 另外这个问题的前提是已经在用本地AI Agent了，肯定是有AI模型可用了。 所以我的想法是， 把这个功能开发成FlyEnv的插件， 做成MCP的形式，FlyEnv是可以一键设置各个AI Agent的MCP配置的。这样用户使用是最简单的。我个人也可以日常使用并持续优化。你觉得哪？

chatgpt:
我非常赞同，而且我认为这个方向比之前设计的独立 Memory Infrastructure 更适合现阶段。

甚至我觉得，这可以成为 FlyEnv 插件市场里一个很有价值的插件。

FlyEnv 不只是管理本地开发环境，还可以管理本地 AI Agent 的长期记忆。

你已经具备几个很好的基础条件：

- FlyEnv 有插件体系，可以独立开发和迭代。
- FlyEnv 已经具备 MCP Server 相关能力。
- FlyEnv 可以帮助用户配置不同 AI Agent 的 MCP。
- FlyEnv 能够提供数据库、运行时和其他基础服务。
- 你自己就在日常使用 Codex、Claude Code 等 AI Coding Agent，可以持续拿真实场景测试。

这样就没有必要一开始做一个复杂的云端记忆平台，也没有必要把所有组件设计成必须部署的微服务。

我会把之前的方案大幅简化，重新定义这个项目。

# 一、重新定义产品

我暂时还是用 `Memoria` 作为代号。

# Memoria

FlyEnv Plugin · Universal AI Memory

# One Memory. Every Agent.

Give your AI agents a persistent memory that follows you across conversations, projects, and AI models.

Local First

数据保存在本地

MCP Native

通过 MCP 接入 Agent

Shared Memory

多个 Agent 共享记忆

Persistent

跨会话持续积累

它只做一件事：

为本地 AI Agent 提供一套统一的、持久化的、可以共享和管理的记忆系统。

它不负责：

- 自己运行一个 AI Agent。
- 提供大模型。
- 提供复杂的 Agent Workflow。
- 取代 Codex、Claude Code 等工具。
- 建立一个独立的云端 AI 平台。

它负责：

- 保存记忆。
- 检索记忆。
- 更新记忆。
- 管理记忆。
- 管理记忆生命周期。
- 让不同 Agent 共享记忆。

这才是合理的产品边界。

# 二、整体架构：极简化

我会先采用下面这个架构。

## AI Agents

Codex

Claude Code

Other Agents

MCP Interface

统一协议

memory_search · memory_store · memory_update · memory_forget

FlyEnv Memory Plugin

Memory Manager

记忆管理

Search Engine

记忆检索

Lifecycle

更新和遗忘

Memory UI

可视化管理

Local Storage

SQLite 优先

Episodes · Memories · Evidence · Indexes

一个本地记忆库，供所有已授权 Agent 共同使用。

这里有一个重要调整：

模型的理解、分析和记忆提取，尽量交给正在工作的 Agent；FlyEnv 插件主要负责可靠的数据管理和检索。

这样就不需要插件自己再维护一个 LLM 服务，也不需要额外配置一套模型 API。

不过，有一个技术细节需要明确：

MCP Server 不会天然获得宿主 Agent 当前正在使用的模型调用权限。即使 Codex 或 Claude Code 已经有可用模型，插件也不能默认直接调用它。

因此第一版应该让 Agent 在调用 MCP 工具时，利用自己当前的模型完成记忆提取和判断，将结构化结果交给插件保存。插件本身不需要调用模型。

以后可以增加可选的 Embedding Provider，或者研究客户端支持的 MCP Sampling，但不应该把它们作为第一版的前提。

# 三、基础设施尽可能精简

我调整后的第一版技术选型：

| 组件               | 第一版方案            | 是否必需      |
| ---------------- | ---------------- | --------- |
| 数据库              | SQLite           | 必需        |
| 全文搜索             | SQLite FTS5      | 必需        |
| 向量搜索             | 暂不强制             | 可选        |
| PostgreSQL       | 后续可选             | 否         |
| Qdrant           | 后续可选             | 否         |
| Redis            | 暂不使用             | 否         |
| Python / Node.js | 使用插件自身已有运行环境     | 不额外要求用户安装 |
| LLM              | 使用连接的 Agent 当前模型 | 不由插件提供    |

为什么第一版我反而推荐 SQLite？

因为这是一个主要服务于个人本地 AI Agent 的插件。

SQLite 有几个明显优势：

- 不需要启动数据库服务。
- 不需要端口配置。
- 数据库就是一个文件。
- 备份和迁移简单。
- 可以使用 FTS5 做全文检索。
- 对个人记忆的数据规模完全够用。

FlyEnv 已经可以管理 PostgreSQL、Qdrant 等服务，不代表所有用户都应该为了记忆功能再安装和运行这些服务。

后面可以把存储做成 Provider：

```
Storage Provider
    |
    +---- SQLite       (Default)
    |
    +---- PostgreSQL   (Optional)
    |
    +---- Qdrant       (Optional Vector Backend)
```

但不要过早实现所有 Provider。

另外，初期不需要将完整聊天记录全部保存。只保存 Agent 认为值得长期保留的记忆，以及必要的来源片段即可。原始事件存档可以作为后续可选功能。

# 四、MCP 工具应该尽可能少

我不想第一版就暴露十几个 MCP 工具。

工具越多，Agent 使用起来越复杂，也容易出现重复调用和不一致的行为。

我建议第一版只实现五个工具。

| MCP Tool        | 功能        |
| --------------- | --------- |
| `memory_search` | 搜索相关记忆    |
| `memory_store`  | 保存新记忆     |
| `memory_update` | 更新已有记忆    |
| `memory_forget` | 删除记忆      |
| `memory_list`   | 查看某个范围的记忆 |

### 1. memory_search

这是最重要的工具。

参数：

```
{
  "query": "How did we fix the Ubuntu tray issue?",
  "scope": "project",
  "project_id": "FlyEnv",
  "limit": 10
}
```

返回：

```
{
  "memories": [
    {
      "id": "mem_001",
      "type": "experience",
      "content": "Ubuntu 25.04 tray issue was resolved by switching to classic tray popup style.",
      "created_at": "2026-10-18",
      "source": "conversation"
    }
  ]
}
```

第一版搜索使用：

- FTS5 全文搜索。
- 关键词匹配。
- Tag 匹配。
- 项目及范围过滤。
- 时间和重要程度排序。

后面再增加向量检索。

### 2. memory_store

Agent 决定某个信息值得长期记住时调用。

```
{
  "scope": "project",
  "project_id": "FlyEnv",
  "type": "decision",
  "content": "FlyEnv is moving toward an independent plugin marketplace architecture.",
  "tags": ["architecture", "plugin"],
  "source": {
    "type": "conversation",
    "description": "Plugin architecture discussion"
  }
}
```

注意：重要信息应该尽量附带来源，而不是只留下模型加工后的文字。

### 3. memory_update

用于纠正和更新。

例如：

```
{
  "id": "mem_001",
  "content": "The project now uses PostgreSQL instead of MySQL.",
  "reason": "Database migration"
}
```

这里不应该直接覆盖旧记录。

插件应该保留历史版本和替代关系。

### 4. memory_forget

支持删除某条记忆、某个项目的记忆，或者指定范围的记忆。

涉及批量删除时应该要求 Agent 明确确认用户意图。

### 5. memory_list

查看某个项目、用户或类型下的记忆。

这样 Agent 也能够自行检查之前记住了什么。

# 五、这里有一个比 MCP 本身更重要的东西：Memory Rules

我认为这是这个方案能不能真正好用的关键。

单纯把 MCP 配置写入 Codex 或 Claude Code，并不意味着 Agent 就会自动使用记忆。

MCP 只是让 Agent 拥有了调用工具的能力。

我们还需要告诉 Agent：什么时候应该读取记忆，什么时候应该保存记忆，什么东西不应该保存。

所以我建议除了 MCP Server，还提供一份统一的 Memory Instructions / Skill。

例如：

Memory Rules

核心组成部分

提供给各个 Agent 的通用记忆行为规范

开始任务时

- 如果任务涉及已有项目，先调用 `memory_search`。
- 优先读取相关项目记忆和用户偏好。
- 不要假设历史记忆一定是当前事实。

执行任务时

- 如果发现历史信息与当前事实不一致，进一步核实。
- 不要因为一次临时对话就修改长期用户偏好。
- 不要把推测作为已经确认的事实。

任务结束时

- 保存有长期价值的决策。
- 保存重要项目状态变化。
- 保存经过验证的问题解决方案。
- 保存值得长期使用的用户偏好。
- 不要保存普通闲聊、临时输出和大量原始日志。

这份规则可以由 FlyEnv 根据不同 Agent 生成对应的安装格式。

例如：

- Codex：对应的项目或全局指令文件。
- Claude Code：对应的 Rules / Skills。
- 其他 Agent：支持的指令或 Skill 机制。

我的建议是，在 FlyEnv 的 Agent 集成里，提供两个独立选项：

1. Configure MCP：添加记忆服务器。
2. Install Memory Rules：安装记忆使用规范。

默认可以一起配置，但允许用户分别管理。

MCP + Memory Rules 才构成完整的记忆接入。

# 六、记忆数据模型：第一版只保留必要字段

我会砍掉之前设计的很多复杂字段。

第一版只需要两个主要数据表。

`memories`：

```
CREATE TABLE memories (
    id TEXT PRIMARY KEY,

    scope TEXT NOT NULL,
    scope_id TEXT,

    type TEXT NOT NULL,
    content TEXT NOT NULL,

    tags TEXT,

    importance REAL DEFAULT 0.5,
    confidence REAL DEFAULT 1.0,

    status TEXT DEFAULT 'active',

    source_agent TEXT,
    source_session TEXT,
    source_excerpt TEXT,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    superseded_by TEXT,
    expires_at TEXT
);
```

`memory_history`：

```
CREATE TABLE memory_history (
    id TEXT PRIMARY KEY,

    memory_id TEXT NOT NULL,

    previous_content TEXT,
    new_content TEXT NOT NULL,

    change_reason TEXT,

    changed_at TEXT NOT NULL
);
```

FTS5 建立独立全文索引。

第一版的记忆类型，我只预设几个：

```
preference
fact
project
decision
experience
procedure
observation
```

不需要把用户画像、知识图谱、反思记忆全部设计成独立的数据系统。

以后要增加新的类型，只需要扩展类型定义。

另外，原始记忆的来源要尽量保留。第一版可以保留必要的引用信息和证据片段，完整 Episode Store 则等后面有需要再做。

## 记忆范围

第一版我只保留三种 Scope：

| Scope   | 作用     | 示例             |
| ------- | ------ | -------------- |
| Global  | 所有项目通用 | 用户偏好、长期习惯      |
| Project | 某个具体项目 | FlyEnv 架构、开发决策 |
| Session | 临时任务   | 当前任务的短期上下文     |

Agent 名称不应该成为记忆隔离条件。

例如 Codex 保存的记忆，Claude Code 应该可以读取。

`source_agent` 只是记录信息来源，而不是把数据锁定给某一个 Agent。

这正是共享记忆的价值。

# 七、插件界面应该怎么做？

我不想把这个插件做成一个只有配置选项的后台模块。

记忆本身应该是可以被用户浏览、理解和管理的。

我会设计四个主要页面。

## 1. Overview

[Introducing the Mnemosyne Dashboard — Mnemosyne Blog](https://images.openai.com/static-rsc-4/47Fwkc370hdOLpDWKmDdmsVF5Qx_f1mAYm8Tf4BaXpKRzkD8Ttr16hABeOSxZdaUq_AhLyUs_F3UkCDgwYhts3uQWDD7VW_UqhHT5Twnd5WYtyMS4yFZGPrZUc8pQu-rx2ucqdnC2KU42VVtouwIEt-wwjWo4Bf6pc8xD-71eFE?purpose=inline)

[mnemosyne.site](https://mnemosyne.site/en/blog/mnemosyne-dashboard/?utm_source=chatgpt.com)

显示：

- Total Memories。
- Global Memories。
- Project Memories。
- Recent Updates。
- Connected Agents。
- 最近的记忆活动。

重点是让用户知道记忆系统正在工作，而不是一个黑盒。

## 2. Memories

[GitHub - misaelzapata/memoirs: Local-first long-term memory engine for AI agents · MCP + HTTP + CLI · SQLite + sqlite-vec + FTS5 · 100% local, no cloud · GitHub](https://images.openai.com/static-rsc-4/gTZ1xbeJlhZ6edvC710jPnlJ2297YuR25RSaIiZdYBEo4lRPVlzayjrmCYL6D8PHkK2QaH3NjG9MKUYAXSbJbdJ4yNGu1h6EhTTCADQtfPwM9vk5H09vf_T0NkIleyRTtaszYMZK00XId1E-QhsPRjCmfwgX_V8riLl72JH7sUo?purpose=inline)

[github.com](https://github.com/misaelzapata/memoirs?utm_source=chatgpt.com)

核心页面。

可以：

- 查看所有记忆。
- 按类型筛选。
- 按项目筛选。
- 搜索内容。
- 查看详情。
- 编辑和删除。
- 查看来源和更新时间。

我认为这个页面的体验非常重要。

如果 Agent 错误地记住了一件事情，用户应该可以很容易发现并修正。

## 3. Projects

[Tokanban Web UI | Kanban, tasks, memory, and activity dashboard](https://images.openai.com/static-rsc-4/ggAkWVGM-gt6ILjLDVhrwgyCwu5-DAOEnE0xpHBlt0jefNxsALG60HPnm7ab2hs37P1XdgrjAFkZYAUhJ1QJtmCvh7Al7o5GQQJOlJBJDGhFsQsXPfTflPtSnPTSoCNQECaIQ0AdtE9VLjsq02Rz6YrMG29WzWebQNPMOSmzywc?purpose=inline)

[tokanban.com](https://tokanban.com/web-ui?utm_source=chatgpt.com)

按项目查看记忆。

例如：

```
Projects
  |
  +---- FlyEnv
  |       128 Memories
  |
  +---- Website
  |        32 Memories
  |
  +---- Personal
          16 Memories
```

每个项目有独立的记忆空间。

Global Memory 则可以被多个项目使用。

## 4. Agents

[Model Context Protocol (MCP) Settings in Pieces Desktop](https://images.openai.com/static-rsc-4/UgZoB2qTB7fkEaZXyxMnEn9WjK0cwBLwKXjzIk_muQ6QAzX0gZNxuRlKoVBdRABT3n8yxofLP3SuGPyNa7RXmt_ysRj0YPJzOQ82BrByk45zqy-9K_6j3wrdx2wTsKqe4QKdJF_VO3NpCJUGfaWwitER9YM7ji0nFc8yT2F4Gfs?purpose=inline)

[docs.pieces.app](https://docs.pieces.app/products/desktop/configuration/mcp?utm_source=chatgpt.com)

显示：

- 已配置哪些 Agent。
- MCP 是否配置成功。
- Memory Rules 是否安装。
- 最近连接时间。
- 最近调用次数。
- 是否允许读取或写入记忆。

这里可以直接复用 FlyEnv 已有的 Agent MCP 配置管理能力。

# 八、用户实际使用流程

这是我认为最重要的产品体验。

## 第一次安装

1. 在 FlyEnv 插件市场安装 Memory 插件
2. 启用 Memory

   插件自动初始化 SQLite 数据库。
3. 选择要接入的 AI Agent

   例如 Codex、Claude Code。
4. 一键配置 MCP + Memory Rules

   FlyEnv 自动完成配置。
5. 开始使用

   不需要额外配置数据库、模型 API 或向量服务。

## 日常使用

Codex

"之前 FlyEnv 的 Windows 插件安装流程有什么设计上的考虑？"

Memory

检索 FlyEnv 项目的相关决策、历史事件和经验。

Codex

根据历史记忆回答，并在完成新的重要任务后保存新的记忆。

而且，当你下次换成 Claude Code：

它仍然能够读取同一份记忆。

这就是我认为最值得做的事情。

# 九、开发优先级：第一版应该克制

我建议分三个小阶段，不要一开始做完整认知系统。

| 阶段      | 内容                               | 优先级 |
| ------- | -------------------------------- | --- |
| Phase 1 | SQLite、MCP、Memory Rules、基础搜索和增删改 | 必须  |
| Phase 2 | 混合检索、Embedding、来源追踪、记忆冲突管理       | 后续  |
| Phase 3 | 自动整合、关系图谱、经验提炼、反思                | 长期  |

第一版明确不做：

- 独立 LLM 服务。
- 独立 Embedding 服务。
- 知识图谱。
- Redis。
- PostgreSQL。
- 分布式部署。
- 自动后台反思 Agent。
- 复杂的多租户管理。

我甚至建议先不要做自动记忆整合。

先确保 Agent 能够正确保存和读取信息，再根据日常使用中遇到的实际问题逐渐优化。

## 第一版验收标准

我会设计一个非常简单但有效的测试：

1. 使用 Codex 讨论一个 FlyEnv 的架构决策。
2. 让 Codex 将该决策保存到 Memory。
3. 关闭 Codex。
4. 打开 Claude Code。
5. 询问刚才的架构决策。
6. Claude Code 能够找到并准确解释之前的讨论。
7. 再修改该决策，检查旧信息是否仍然可追溯。
8. 删除该记忆，确认其他 Agent 也不再能读取。

如果这一套流程可以稳定工作，第一版就已经有很大的实用价值。

# 十、我认为还应该增加一个非常实用的功能：Memory Export / Import

既然我们强调 Memory 不属于某个 Agent，那么记忆数据也应该可以独立迁移。

例如：

```
FlyEnv Memory
    |
    +---- Export
    |       |
    |       +---- memories.json
    |       +---- history.json
    |
    +---- Import
    |
    +---- Backup
    |
    +---- Restore
```

这样用户可以：

- 更换电脑。
- 更换 AI Agent。
- 更换底层数据库。
- 备份长期积累的记忆。
- 将记忆迁移到另一个安装了 FlyEnv 的设备。

数据格式应该公开，尽量避免私有格式锁定。

这对一个本地优先的产品尤其重要。

# 十一、我对这个方向的最终判断

我认为这个方案值得做，而且比之前设计的完整 Memory Engine 更适合 FlyEnv 的产品定位。

它有三个很明显的优势。

第一，使用门槛非常低。

用户不用理解什么是向量数据库、知识图谱、Embedding、Reranker。

安装插件、配置 Agent、开始使用即可。

第二，解决的是实际存在的问题。

现在不同 AI Agent 之间的对话和经验往往是割裂的。

用户今天用 Codex，明天用 Claude Code，后天用其他 Agent，不应该每次都重新介绍自己和项目。

第三，FlyEnv 有自己的使用场景。

这个插件可以直接接入 FlyEnv 已有的 MCP 生态，而且你自己就是重度 AI Coding Agent 使用者。

你可以每天使用它，逐渐发现：

- 哪些记忆应该自动保存。
- 哪些记忆不应该保存。
- Agent 为什么没有正确调用记忆。
- 什么情况下搜索结果不准确。
- 历史记忆冲突应该怎样处理。

这比一开始闭门设计一个庞大的记忆系统更有价值。

## 最后，我想再强调一个设计取舍

我建议把这个项目的目标定为：

# Build a Shared Memory for All Your AI Agents.

A local-first memory plugin that allows different AI agents to remember, share and evolve knowledge across conversations and projects.

核心原则

- One Memory Store
- Any AI Agent
- Any AI Model
- No Mandatory External Services
- Full Local Data Ownership

我的建议是：先把 Phase 1 做出来，不要急于追求 Memory 的智能程度。

先让多个 Agent 真正共享一份可靠的长期记忆，再逐步增加更聪明的记忆整理和检索能力。

我认为这条路线不仅开发成本可控，而且很适合通过 FlyEnv 插件市场逐步发展成一个独立的开源项目。
