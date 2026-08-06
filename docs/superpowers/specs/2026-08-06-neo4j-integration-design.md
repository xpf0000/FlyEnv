# Neo4j 图数据库集成设计

日期：2026-08-06

状态：设计已获用户确认，待实施计划

## 目标

为 FlyEnv 增加 Neo4j Community 服务支持，覆盖安装、版本管理、启动、停止、配置、日志和 Browser 入口。线上版本目录由 `/Users/x/Desktop/WorkSpace/GitHub/nest-admin` 提供；Neo4j 解压到本地后，版本扫描、Java 选择和服务生命周期全部由 FlyEnv 负责。

## 非目标

- 不支持 Neo4j Enterprise、集群和 Aura。
- 不自动安装 APOC、GDS 或其他插件。
- 不实现备份恢复、集群拓扑和远程数据库管理。
- 不让 FlyEnv 在启动本地 Neo4j 时依赖 `nest-admin` API。
- 不改造所有现有 Java 服务；本次只为 Neo4j 提供可复用的 Java 运行时绑定接口。

## 版本范围

以 2026-08-06 为基准，近两年的边界为 2024-08-06。Neo4j `5.23.0` 于 2024-08-13 发布，因此线上最小支持版本固定为 `5.23.0`。

`nest-admin` 返回所有 `5.23.0` 及以上的 GA 服务版本，包括 `5.23.x`、`5.24.x`、`5.25.x`、`5.26.x`、`2025.*` 和 `2026.*`。预览版、Enterprise 版本、Browser 标签和其他非服务标签排除在外。版本边界是固定的最小版本，而不是每次请求按发布日期滚动计算。

Neo4j 主程序包是 Java 分发包，线上接口保留 `os` 和 `arch` 参数以兼容现有协议。Unix 平台使用 `neo4j-community-{version}-unix.tar.gz`，Windows 使用 `neo4j-community-{version}-windows.zip`。服务包的架构适配由本地 JDK 负责。

## 跨仓库边界

### nest-admin

`nest-admin` 只维护可下载版本目录：

- 新增 `neo4j` 到版本请求 DTO、服务动态加载和前端版本管理类型。
- 新增 Neo4j 版本抓取模块，读取官方稳定标签并生成下载 URL。
- Neo4j 版本抓取保留所有正式 patch 版本，不复用只保留每个中版本最新项的逻辑。
- 通过 HEAD 或等价可用性校验过滤不存在的下载包。
- 继续使用 Redis `version:neo4j:{os}:{arch}` 缓存。
- 后台版本管理提供 Neo4j Tab、手动添加、编辑、删除和线上抓取查看。

`nest-admin` 不保存或返回本地已安装版本、Java 绑定、运行 PID、数据目录或启动状态。FlyEnv 安装后不需要回调后台同步本地状态。

### FlyEnv

FlyEnv 负责本地所有运行时行为：

- 扫描由线上安装或用户手动放置的 Neo4j 目录。
- 识别 Neo4j 版本和可执行入口。
- 根据本地版本选择兼容 JDK。
- 保存每个安装实例的 Java 绑定。
- 管理配置、数据、日志、PID、端口和 Browser。
- fork 进程负责真实子进程，renderer 只展示状态和发出命令。

## 本地 Java 兼容策略

FlyEnv 内置集中式 `Neo4jJavaPolicy`，输入本地扫描到的 Neo4j 版本，输出允许和推荐的 Java 主版本：

```ts
type Neo4jJavaPolicy = {
  supportedMajor: number[]
  recommendedMajor: number
}
```

初始策略固定为 Neo4j 官方兼容矩阵：5.23–5.26 使用 Java 17/21 并优先 Java 21；2025.01–2025.09 使用 Java 21；2025.10 及以后使用 Java 21/25，并优先 Java 21。策略是 FlyEnv 本地代码，不由 `nest-admin` 下发。

本地服务列表通过 Java 模块已有的安装扫描结果构造候选项，只显示匹配 `supportedMajor` 的 JDK。没有匹配 JDK 时，Neo4j 行显示明确的不可启动原因，并提供跳转 Java 模块的入口。

## 本地状态和持久化

Java 绑定属于 Neo4j 的领域设置，不属于线上版本数据。建议在 Neo4j 模块 store 中维护，并通过 FlyEnv 本地配置持久化：

```ts
type Neo4jJavaBinding = {
  javaHome: string
  javaMajor: number
}

type Neo4jSetup = {
  javaByBin: Record<string, Neo4jJavaBinding>
}
```

key 使用规范化后的 Neo4j `bin` 或安装路径，避免同一版本安装在不同目录时相互覆盖。重新扫描本地版本时，绑定按路径恢复；路径不存在时清理孤立设置。绑定变更在服务运行时禁止，必须先停止服务。

安装版本的 `SoftInstalled` 快照可以携带本次启动所需的 `javaHome`，但它不是持久化真相；持久化真相仍是 Neo4j 模块 store。

## 本地目录和配置

程序目录与运行数据分离：

```text
app/neo4j/{version}/
server/neo4j/instances/{instanceKey}/
  conf/
  data/
  logs/
  import/
  plugins/
```

首次运行时创建实例目录和本地配置副本，不直接修改发行包内的默认配置。使用 `NEO4J_CONF` 指向实例配置，并设置 `server.directories.data`、`server.directories.logs`、`server.directories.import` 等路径，避免切换版本或删除程序目录时误删数据库数据。

配置页面至少支持 `neo4j.conf` 编辑和默认端口展示。Browser 链接默认使用 `http://127.0.0.1:7474`；如果用户修改 HTTP 监听端口，模块应从有效配置中解析并更新链接。

## FlyEnv 模块结构

新增或调整：

- `src/fork/module/Neo4j/index.ts`
- `src/render/components/Neo4j/Module.ts`
- `src/render/components/Neo4j/Index.vue`
- `src/render/components/Neo4j/aside.vue`
- Neo4j 配置、日志和 Java 运行时选择组件
- `AppModuleEnum`、`BaseManager`、`ServerPath`、图标和国际化资源

Renderer 模块归类为 `dataBaseServer`，启用服务和托盘入口。服务列表通过 `ServiceManager` 现有 column/action slot 增加“Java 运行时”列，不把 Java 选择逻辑复制到通用服务表。

## 安装和本地扫描

线上安装继续走 FlyEnv 既有 `_fetchOnlineVersion('neo4j')`、下载和解压流程。安装项根据平台识别：

- Unix：`bin/neo4j`、`bin/neo4j-admin`
- Windows：`bin/neo4j.bat`、`bin/neo4j-admin.bat`

本地扫描覆盖静态安装目录和用户配置的自定义目录。版本优先从发行目录名读取，并用 `neo4j version` 或 `neo4j-admin version` 校验；无法识别时保留错误状态，不把未知目录当作可启动服务。

低于 `5.23.0` 的本地版本可以被扫描出来，但标记为当前产品不支持，不进入正常启动路径；这不需要访问 `nest-admin`。

## 启动流程

1. renderer controller 获取版本对应的 Java 绑定和不可变启动快照。
2. fork 模块校验 `javaHome/bin/java` 存在，并执行版本检查。
3. 创建或校验实例的 conf/data/logs 目录。
4. 若数据目录尚未初始化，renderer 通过密码输入框取得初始密码；密码只在内存中传递给 fork。
5. fork 设置 `JAVA_HOME`、`PATH`、`NEO4J_CONF`，使用 `neo4j console` 启动。
6. 写入 Neo4j 专属 PID 文件和启动日志。
7. 等待 PID 存在并探测 HTTP 7474 和 Bolt 7687；健康检查成功后才报告服务启动完成。
8. renderer 更新运行状态并启用 Browser 按钮。

初始密码不能写入普通配置、命令历史或日志。若数据目录已经初始化，则不再自动调用初始密码命令。

## 停止流程

1. renderer controller 发出停止请求并锁定该实例的 Java 绑定。
2. fork 首先调用 Neo4j 自带停止命令，使用同一个 `JAVA_HOME` 和 `NEO4J_CONF`。
3. 等待 PID 退出、端口释放和子进程退出。
4. 停止命令失败时，仅按 Neo4j PID 文件、安装路径和命令行标记校验后回收所属进程。
5. 清理 PID 状态，保留日志文件。

绝不使用 `java` 进程名进行全局停止，避免误杀 Tomcat、Maven 或用户自行启动的 Java 进程。

## 操作所有权契约

| 项目 | 所有者 |
|---|---|
| Java 绑定 | Neo4j 模块 store |
| 行内选择器、弹窗和显示筛选 | mounted Vue page |
| 启动密码、启动/停止操作状态 | Neo4j 模块本地 singleton controller |
| 子进程、PID、端口、健康状态 | fork Neo4j 模块 |
| 配置和日志文件 | fork Neo4j 模块，renderer 只打开或展示 |

启动操作事件：`start-requested`、`java-validated`、`config-ready`、`process-started`、`health-ready`、`started` 或 `failed`。

停止操作事件：`stop-requested`、`graceful-stop`、`process-stopped`、`stopped` 或 `failed`。

同一版本重复启动复用当前 promise；已有其他版本运行时拒绝启动并提示先停止。重复停止幂等成功。页面销毁不会取消正在运行的安装、启动或停止操作，重新进入页面可以重新绑定状态。

## 测试和验收

### nest-admin

- DTO 接受 `neo4j`，其他非法 app 仍被拒绝。
- 过滤出 `5.23.0` 及以上 GA 标签，排除预览、Enterprise 和 Browser 标签。
- Unix/Windows URL 生成正确。
- 版本包 HEAD 校验和 Redis 缓存有效。
- 后台 Neo4j Tab 可查看、添加、编辑和删除版本。

### FlyEnv 自动化/静态验证

- 版本策略覆盖 5.23、5.26、2025 和 2026 版本格式。
- JDK 候选过滤、推荐版本和无兼容 JDK 错误提示。
- Java 绑定按安装路径持久化和恢复。
- 重复启动、启动失败重试、页面重入和终端清理。
- PID 归属校验不会匹配其他 Java 服务。

### 跨平台手工验收

- macOS Apple Silicon、macOS Intel。
- Windows x64。
- Linux x64，并抽测 ARM64。
- 新安装、已有数据目录、手动本地目录、切换多个 Neo4j 版本。
- Browser、7474/7473/7687 端口、配置和日志查看。

## 风险和处理

- Neo4j 新版本可能改变 Java 要求：集中维护 `Neo4jJavaPolicy`，新增版本先按未知策略阻止启动并提示更新 FlyEnv。
- 发行包 URL 可能下线：后台抓取时做可用性校验，允许管理员手动覆盖 URL。
- 版本升级可能涉及数据库格式：不同安装实例默认使用独立 data 目录，不自动迁移数据。
- GPLv3 合规：采用运行时下载 Community 包，不将 Neo4j 二进制打包进 FlyEnv 安装器，并在产品说明中标注许可证。
