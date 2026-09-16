# Apache Kafka 集成调研

> **调研主题**: Kafka 是否可集成进 FlyEnv
> **调研日期**: 2026-09-16
> **Kafka 参考版本**: 4.3.1
> **结论**: 可行，建议先支持单节点 KRaft，再逐步扩展管理能力

---

## 结论摘要

Apache Kafka 可以在 Windows、macOS 和 Linux 上直接运行，但官方发布的不是三套平台专用原生二进制，而是一套基于 JVM 的 Kafka 二进制发行包：`kafka_2.13-4.3.1.tgz`。

同一个发行包包含 Java JAR、Unix shell 脚本和 Windows `.bat` 脚本。三平台都需要 Java 17 或更高版本；Kafka 4.x 使用 KRaft，不再需要 ZooKeeper。

官方资料：

- [Kafka 官方下载页](https://kafka.apache.org/community/downloads/)
- [Kafka 4.3.1 官方下载目录](https://downloads.apache.org/kafka/4.3.1/)
- [Kafka Quick Start](https://kafka.apache.org/quickstart/)
- [Kafka 4.3 升级说明](https://kafka.apache.org/43/getting-started/upgrade/)
- [Kafka 官方 Windows 脚本目录](https://github.com/apache/kafka/tree/trunk/bin/windows)

---

## 三平台分发形式

| 平台 | 官方直接分发物 | 启动入口 | 是否需要额外 Kafka 运行时 |
|---|---|---|---|
| Windows | `kafka_2.13-4.3.1.tgz` | `bin\\windows\\kafka-server-start.bat` | 不需要 ZooKeeper，需要 Java 17+ |
| macOS | `kafka_2.13-4.3.1.tgz` | `bin/kafka-server-start.sh` | 不需要 ZooKeeper，需要 Java 17+ |
| Linux | `kafka_2.13-4.3.1.tgz` | `bin/kafka-server-start.sh` | 不需要 ZooKeeper，需要 Java 17+ |

macOS 和 Linux 使用同一套 `.sh` 脚本；Windows 使用 `bin\\windows` 下的 `.bat` 脚本。Kafka 并不是针对每个平台分别编译的单一 `exe`、`dylib` 或 ELF 服务程序，而是由 Java 进程加载 Kafka JAR 运行。

Kafka 4.3.1 官方下载目录包含约 130 MB 的 `kafka_2.13-4.3.1.tgz`，同时提供签名和 SHA-512 校验文件。

---

## 启动命令

以下命令使用 Kafka 4.x 的单节点 KRaft 模式。`format` 只允许在新数据目录上执行一次，不能在每次启动时重复执行。

### Linux / macOS

```bash
tar -xzf kafka_2.13-4.3.1.tgz
cd kafka_2.13-4.3.1

KAFKA_CLUSTER_ID="$(bin/kafka-storage.sh random-uuid)"
bin/kafka-storage.sh format --standalone \
  -t "$KAFKA_CLUSTER_ID" \
  -c config/server.properties

bin/kafka-server-start.sh config/server.properties
```

停止服务：

```bash
bin/kafka-server-stop.sh
```

### Windows PowerShell

```powershell
cd kafka_2.13-4.3.1

$KAFKA_CLUSTER_ID = & .\bin\windows\kafka-storage.bat random-uuid
.\bin\windows\kafka-storage.bat format `
  --standalone `
  -t $KAFKA_CLUSTER_ID `
  -c .\config\server.properties

.\bin\windows\kafka-server-start.bat .\config\server.properties
```

停止服务：

```powershell
.\bin\windows\kafka-server-stop.bat
```

Windows 官方脚本目录同时提供 `kafka-storage.bat`、`kafka-server-start.bat`、`kafka-server-stop.bat`、`kafka-topics.bat`、`kafka-console-producer.bat` 和 `kafka-console-consumer.bat` 等命令。

---

## 默认单节点配置

FlyEnv 不能直接使用发行包中指向安装目录的数据路径，应生成模块专属配置，将数据和日志放在 FlyEnv 的服务目录中。

建议配置：

```properties
process.roles=broker,controller
node.id=1
controller.quorum.voters=1@127.0.0.1:9093
listeners=PLAINTEXT://127.0.0.1:9092,CONTROLLER://127.0.0.1:9093
advertised.listeners=PLAINTEXT://127.0.0.1:9092
controller.listener.names=CONTROLLER
log.dirs=<FlyEnv Kafka data directory>
```

建议默认目录：

```text
app/kafka/<version>/
server/kafka/
├── config/
├── data/
├── logs/
└── pid/
```

其中客户端默认端口为 `9092`，KRaft Controller 默认使用 `9093`。`advertised.listeners` 必须与客户端实际连接地址一致，否则客户端可能可以连上端口但无法正常生产或消费消息。

---

## FlyEnv 集成可行性

FlyEnv 已有可复用的基础设施：

- `cacheAndQueue` 模块分类可容纳 Kafka。
- RabbitMQ 已提供服务启动、停止、配置、日志、版本安装和 Windows 进程处理参考。
- Java 模块已提供 JDK 版本发现和安装能力。
- 现有版本管理支持压缩包下载、解压、安装目录扫描和多版本切换。
- Fork 进程适合持有 Kafka 的长生命周期 Java 子进程。

主要代码参考：

- [`src/render/core/type.ts`](../../src/render/core/type.ts)
- [`src/fork/module/RabbitMQ/index.ts`](../../src/fork/module/RabbitMQ/index.ts)
- [`src/render/components/RabbitMQ/Module.ts`](../../src/render/components/RabbitMQ/Module.ts)
- [`src/fork/module/Java/index.ts`](../../src/fork/module/Java/index.ts)
- [`src/fork/BaseManager.ts`](../../src/fork/BaseManager.ts)

原生模块需要增加：

1. `src/fork/module/Kafka/index.ts`，负责版本安装、Java 校验、KRaft 初始化、启动、停止、状态检测、配置和日志路径。
2. `src/render/components/Kafka/`，提供服务、版本、配置和日志页面。
3. `AppModuleEnum`、Fork 分发、菜单、图标和翻译注册。
4. Kafka 专属数据目录、PID 管理和启动失败诊断。
5. Windows `.bat` 与 macOS/Linux `.sh` 两套启动命令适配。

## 推荐实施范围

第一版建议只支持：

- Kafka 4.3.x
- Java 17+
- 单节点 KRaft
- 默认端口 9092 / 9093
- 配置文件编辑
- 日志查看
- Topic 列表、创建、删除
- 简单生产/消费测试
- Windows、macOS、Linux 三平台生命周期验证

第一版暂不建议加入：

- ZooKeeper
- 多节点集群编排
- Kafka Connect
- Schema Registry
- Kafka Web 管理面板
- 自动集群迁移和复杂版本升级

如果目标只是快速提供本地开发 Kafka，Podman Compose 是更低成本的 MVP；Apache 官方也提供 `apache/kafka:4.3.1` 镜像。[Kafka Docker 文档](https://kafka.apache.org/43/getting-started/docker/)

---

## 风险与注意事项

- Kafka 是 JVM 服务，默认内存开销高于 Redis 和 Memcached，应在 FlyEnv 中设置适合开发机的堆内存。
- KRaft cluster ID 和数据目录必须持久化，不能每次启动重新生成或 format。
- Kafka 版本升级不能简单覆盖正在使用的数据目录，需要明确兼容性和 metadata version 策略。
- Windows 需要验证 `.bat` 脚本、Java 路径、路径空格和进程退出行为。
- FlyEnv 的进程存活状态应以受控进程和 PID/进程树检测为准，而不是仅以 Renderer 状态为准。
- Kafka 没有 RabbitMQ Management 那样的内置完整 Web 管理界面，第一版可先依赖 Kafka CLI。

## 最终判断

Kafka 具备 Windows、macOS、Linux 三平台直接运行能力，FlyEnv 可以基于同一个 Kafka JVM 发行包实现跨平台模块；从工程实现角度可行性较高，最大工作量集中在 Java 依赖绑定、KRaft 首次初始化、持久化数据保护和 Windows 进程生命周期管理。
