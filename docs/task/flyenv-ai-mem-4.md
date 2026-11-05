用户:
关于SQLite我有不同意见。 之前FlyEnv的管理后台，使用的SQLite，但是出现过几次丢失数据的情况。我怀疑是高并发时的写入有问题。用户使用时，也可能会同时运行很多个AI Agent，我不太信任SQLite。 而且FlyEnv已经提供了各种数据库/队列/缓存模块， 为什么不可以用？ 这是一个用户选择问题，而不是FlyEnv没有。 我觉得功能效果还是比较重要的。首先是需要真正有用。

chatgpt:
我觉得你的意见是对的，而且这实际上改变了整个方案的设计出发点。

我上一版过于强调了「降低安装和使用门槛」，为了让插件开箱即用，牺牲了一部分系统能力。对于一个准备长期使用、多个 AI Agent 可能同时访问、不断积累重要数据的记忆系统，这个取舍不一定正确。

我现在更倾向于：把它设计成一个真正的高可靠性、高并发、支持多种存储后端的 Memory Engine，FlyEnv 负责提供和管理基础设施。

FlyEnv 已经有数据库、队列、缓存等模块，没必要为了减少一个数据库服务，就把核心系统限制在 SQLite 上。

而且你说的另一个观点也很重要：

基础设施是否需要安装，应该是用户的选择；记忆系统本身是否真正好用，才是我们应该优先解决的问题。

## 一、先谈 SQLite：你的担忧有技术依据

SQLite 并不是不可靠的数据库。它在单机应用、嵌入式系统中非常成熟。

但它有一个与我们这个场景不太匹配的特点：SQLite 同一时刻只能有一个写事务。

即便使用 WAL 模式，也主要是改善读写并发，让读操作不必一直等待写操作；它并没有变成支持多个并发写入者的数据库。

假设同时运行：

- Codex Agent
- Claude Code
- 一个后台自动化 Agent
- 一个负责项目分析的 Agent

它们可能同时执行：

1. 搜索记忆。
2. 新增记忆。
3. 更新已有记忆。
4. 合并重复记忆。
5. 执行后台记忆整理。

这样就会出现多个写入事务竞争的问题，需要处理锁等待、重试、事务冲突和写入超时。

不过，这里我想区分两个问题：

- 并发写入限制：SQLite 的确存在，这是它的架构特性。
- 已经提交的数据丢失：不能简单归因于并发。还需要检查事务管理、WAL 检查点、连接关闭、备份方式、文件系统和异常退出处理。

所以，FlyEnv 之前遇到的数据丢失问题值得单独复盘，但即使不考虑那几次事故，我也不建议把 SQLite 作为这个产品的主存储。

参考：[SQLite Isolation](https://www.sqlite.org/isolation.html?utm_source=chatgpt.com)、[SQLite WAL Mode](https://www.sqlite.org/wal.html?utm_source=chatgpt.com)。

## 二、我会重新确定基础设施架构

现在我更倾向于采用三个核心基础设施，而不是一个 SQLite 文件。

PostgreSQL：主数据库

核心必选

所有原始事件、记忆、关系、版本和元数据的权威存储。

Qdrant：向量检索

强烈推荐

语义搜索、相似记忆检索、混合检索。

Redis / RabbitMQ：任务队列

推荐

异步记忆提取、Embedding、索引更新、后台整理和失败重试。

这三个组件的职责不能混淆。

### 1. PostgreSQL 是唯一权威数据源

我会让 PostgreSQL 保存所有真正重要的数据：

- 原始记忆事件。
- 结构化记忆。
- 记忆历史版本。
- 实体及关系。
- 项目和用户信息。
- 来源证据。
- 任务处理状态。

这里推荐 PostgreSQL，不是单纯因为它是一个成熟的数据库，而是它的 MVCC 机制更适合多个 Agent 同时读写。不同事务可以通过版本快照并发读取，而普通读取不会阻塞写入；真正竞争同一行的写操作仍然需要通过行锁和事务正确处理。

[image](https://www.google.com/s2/favicons?domain=https://www.postgresql.org\&sz=32)

PostgreSQL+1



例如，三个 Agent 同时写入不同项目的记忆，不应该因为其中一个正在写入就让其他 Agent 等待。

同时，所有更新都需要事务、乐观版本控制、幂等 ID 和必要的行级锁。

### 2. Qdrant 不应该只是一个可有可无的优化

这里我想修正之前的开发计划。

我之前把向量检索放到了 Phase 2，我现在认为这个决定不合适。

真正好用的长期记忆系统，第一版就应该具备语义检索能力。

想象一下：

以前 Agent 保存了一条记忆：

> The Ubuntu tray popup stopped responding after upgrading FlyEnv.

现在用户问：

> 我之前是不是遇到过 Linux 托盘的问题？

两句话可能没有太多共同关键词。

只有关键词搜索可能找不到，而向量检索能够找到语义相关的信息。

当然，向量检索也不是万能的。对于 PHP 8.4、某个具体插件名、Issue ID 等，精确关键词又非常重要。

因此我推荐 Qdrant 采用 Dense Vector + Sparse/BM25 的混合检索，再结合 PostgreSQL 中的元数据过滤和排序。

Qdrant 本身支持多阶段查询、Dense/Sparse 混合搜索，以及 RRF 等结果融合方式。

[image](https://www.google.com/s2/favicons?domain=https://qdrant.tech\&sz=32)

Qdrant+1



还有一个选择：

如果 FlyEnv 对应的 PostgreSQL 版本可以提供 pgvector，也可以允许用户直接用 PostgreSQL 承担向量存储，减少一个服务。

因此可以提供两种模式：

| 模式         | 架构                    | 适用场景            |
| ---------- | --------------------- | --------------- |
| Integrated | PostgreSQL + pgvector | 减少服务数量          |
| Dedicated  | PostgreSQL + Qdrant   | 专用向量检索和更灵活的检索配置 |

pgvector 支持 HNSW 和 IVFFlat 索引，能够实现精确或近似向量搜索。

[image](https://www.google.com/s2/favicons?domain=https://github.com\&sz=32)

GitHub



我的默认推荐是 PostgreSQL + Qdrant，但不强制所有用户都运行两个服务。

### 3. Redis / RabbitMQ 用于异步工作，不是主数据库

长期记忆有大量工作不应该阻塞 Agent 当前任务：

- 记忆去重。
- Embedding 生成。
- Qdrant 索引写入。
- 记忆聚合。
- 冲突检查。
- 经验总结。
- 后台清理。

这部分可以交给任务队列。

例如：

```
Agent
  |
  v
Memory MCP
  |
  v
PostgreSQL Transaction
  |
  +---- 保存记忆
  |
  +---- 保存 Outbox Event
              |
              v
          Task Queue
              |
       +------+------+
       |      |      |
    Embed  Index   Analyze
       |      |      |
       +------+------+
              |
              v
            Qdrant
```

这里我特别建议采用 Transactional Outbox：

主数据库保存记忆和待处理事件必须处于同一个事务。

这样即使 Redis 或 RabbitMQ 暂时停止，记忆仍然已经可靠写入 PostgreSQL。队列恢复后再继续处理。

Redis Streams 有消费组、Pending 消息、重新认领未确认消息和重放机制，可以承担这一工作；但不能把 Redis 队列当成记忆的唯一持久化来源。

[image](https://www.google.com/s2/favicons?domain=https://redis.io\&sz=32)

Docs+1



缓存则可以后续根据性能情况添加，不需要在第一版强制依赖 Redis 缓存。

## 三、数据库和服务应该让用户自己选择

这一点我完全赞同。

我不建议把技术架构强行写死成：

```
PostgreSQL + Qdrant + Redis
```

而是让插件提供基础设施配置页面。

[Toystack Documentation](https://images.openai.com/static-rsc-4/flNex8eCSto5HvN8QuZGCM0cw8GklqYtylkfqachpyC4CPSaH8LhIjS41KKd8rGwddtiuAh_4w1pe70vkCJx9l11y8J0vOlIBP9CS3u00Nc6PopZ2XtP6muXhSLtSVUWHlwvYzIAICGYRCnKfUCEJb5uNhVECsx0KoFdm1xY_3Q?purpose=inline)

[documentation.toystack.ai](https://documentation.toystack.ai/?utm_source=chatgpt.com)

我设想：

| 配置项            | 可选项                                      |
| -------------- | ---------------------------------------- |
| Main Database  | PostgreSQL、MySQL、MariaDB                 |
| Vector Storage | Qdrant、pgvector                          |
| Task Queue     | Redis Streams、RabbitMQ、内置数据库任务队列         |
| Cache          | Redis、None                               |
| Embedding      | 本地模型、OpenAI-compatible API、其他兼容 Provider |
| LLM            | 可选配置，用于后台记忆处理                            |

其中有一点需要注意：不同数据库不一定具有完全相同的检索和事务能力。

我建议采用 Provider 接口，但不是承诺所有数据库组合在第一天都具备相同功能。

例如：

- PostgreSQL 是首个完整支持的主数据库。
- MySQL/MariaDB 作为后续主数据库适配器。
- Qdrant 是独立向量后端。
- pgvector 是集成向量后端。
- Redis/RabbitMQ 作为可切换的异步队列。

FlyEnv 只需要提供服务发现和连接信息，插件负责测试连接、初始化 Schema、检查扩展和验证运行状态。

还有一个细节：如果用户已经在 FlyEnv 安装并运行了 PostgreSQL，不应该要求他再创建一个重复的 PostgreSQL 实例。 直接选择已有实例、数据库和独立账号即可。

## 四、还有一个关键问题：Agent 已经有模型，记忆插件还需要模型吗？

这里我想进一步区分两个事情。

你说得没错，用户已经在使用 Codex、Claude Code 等 AI Agent，因此通常不需要我们再提供一个大模型。

但是，Agent 使用的模型，并不意味着 MCP Server 可以直接调用它。

MCP Server 通常只是 Agent 的工具服务，不能默认访问宿主 Agent 的模型 API、历史对话或模型上下文。

还有一个值得注意的技术变化：MCP 的 Sampling 功能在 2026 年 7 月 28 日的协议修订中已经被标记为弃用，新实现不应该把它作为长期依赖。

[image](https://www.google.com/s2/favicons?domain=https://github.com\&sz=32)

GitHub+1



所以我建议将模型相关的工作分开处理。

### 1. Agent 负责日常记忆理解

这是默认模式。

Agent 在执行任务时：

- 自己判断哪些信息值得记住。
- 自己总结事件和解决方案。
- 自己提取用户偏好。
- 自己判断是否需要更新旧记忆。
- 调用 MCP 将结构化内容交给 Memory Engine。

这样无需记忆插件自己再运行一个 LLM。

### 2. Embedding Provider 负责语义向量化

这是一个独立能力。

需要注意，聊天模型和 Embedding 模型不是同一种接口。不能假设用户有 GPT 或 Claude，就意味着 Memory MCP 可以拿到其 Embedding 能力。

我建议支持：

- 本地 Embedding 模型。
- Ollama 等本地模型服务。
- OpenAI-compatible Embedding API。
- 其他自定义 Provider。

Embedding 是真正实现语义记忆检索的重要基础，我倾向于把它放进第一版，而不是只做关键词检索。

### 3. LLM Provider 作为可选的高级能力

后期可以增加：

- 自动记忆合并。
- 自动记忆分类。
- 冲突检测。
- 后台经验总结。
- 周期性记忆整理。

这些功能可以直接通过用户配置的模型 Provider 调用。

这样既不绑定 GPT、Claude，也不限制本地模型。

我认为这种设计同时解决了模型独立性和记忆质量问题。

## 五、真正需要重点解决的还是并发和数据一致性

如果同时有五个 Agent 在工作，我希望系统具备下面的行为：

假设：

```
Codex       ----\
Claude Code -----+---- Memory MCP ---- PostgreSQL
Agent 3     -----+                  \
Agent 4     -----+                   Qdrant
Agent 5     ----/                    Redis
```

它们可以分别启动自己的 MCP Server 进程，但共享同一个数据库和向量索引。

我会重点实现四项机制：

1\. Idempotency

每个写入请求具有唯一请求 ID。Agent 因为超时而重试，不会重复创建记忆。

2\. Optimistic Concurrency

每条记忆有版本号。两个 Agent 同时修改同一条记忆时，避免后写入的数据无条件覆盖先前的数据。

3\. Transactional Outbox

PostgreSQL 中记忆保存成功，但 Qdrant 更新失败，不会造成数据永久不一致。后台任务会重新处理。

4\. Background Job Recovery

队列中的任务需要有状态、重试次数、失败记录和死信处理。即使 FlyEnv 或 Agent 异常退出，也能够恢复。

尤其需要注意：

PostgreSQL 是唯一事实来源，Qdrant 是可以重新构建的检索索引，Redis/RabbitMQ 是任务处理设施。

这样即使 Qdrant 数据丢失，也可以从 PostgreSQL 重新生成索引。

## 六、我会重新调整第一版的功能范围

我现在不建议第一版只做 CRUD。

如果要证明这个产品真正有用，我认为第一版就应该实现完整的基本记忆闭环。

## Memory Engine V1

建议作为首个正式版本目标

基础设施

- PostgreSQL 主存储。
- Qdrant 或 pgvector。
- Embedding Provider。
- Redis / RabbitMQ 异步处理适配。
- MCP Server。

记忆能力

- 自动记忆提取（由 Agent 完成）。
- 结构化记忆保存。
- 语义 + 关键词混合检索。
- 用户、全局、项目记忆隔离。
- 重复记忆识别。
- 旧记忆更新和历史追踪。
- 来源记录。
- 记忆删除。
- 多 Agent 共享。

  产品功能
- 基础设施连接管理。
- MCP Agent 一键配置。
- Memory Rules 自动安装。
- 记忆管理界面。
- 数据导入、导出和备份。
- 基础任务监控。

我会把自动反思、复杂知识图谱、多层经验推导留到后面。

但语义检索、混合检索、并发安全、数据可靠性不应该被推迟。

## 七、我建议最终采用的架构

# FlyEnv Memory Plugin

Local-first · Model-independent · Multi-Agent Shared Memory

Agent Integration

Codex

Claude

Others

MCP + Memory Instructions

Memory Core

Ingestion

数据写入

Retrieval

混合检索

Memory Manager

去重、更新、版本

Task Manager

异步任务

Infrastructure Providers

PostgreSQL

主存储

Qdrant

向量检索

Redis

任务队列

所有服务都通过 FlyEnv 选择、安装和管理

## 八、最后，我想确定一个关键方向

我现在的推荐是：

以 PostgreSQL + Qdrant + Embedding Provider 作为功能完整的标准部署方案；Redis/RabbitMQ 提供异步处理能力。允许用户选择现有服务、切换 Provider，而不是强制所有组件。

另外，主数据库应该先把 PostgreSQL 做完整，不建议为了所谓的数据库无关性，一开始就同时开发 PostgreSQL、MySQL、MariaDB 三套实现。把 Adapter 接口设计好，后续再扩展。

我还有一个产品层面的建议：

不要将它定位成「FlyEnv 的 AI 记忆功能」，而是定位成一个可以独立使用、通过 FlyEnv 安装和管理的通用开源 AI Memory MCP Server。

以后即使用户不使用 FlyEnv，也应该可以独立部署这个记忆服务；而 FlyEnv 提供最方便的安装、数据库管理、MCP 配置和可视化管理体验。

这样项目本身也有独立发展的空间。

我认为这比单纯做一个轻量级 SQLite MCP 插件更值得投入。
