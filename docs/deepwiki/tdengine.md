# TDengine 集成调研

> **调研主题**: TDengine 是否可集成进 FlyEnv  
> **调研日期**: 2026-09-29  
> **参考产品**: TDengine TSDB-OSS 3.x（实现时应重新确认可下载的稳定版本）  
> **结论**: 可以集成。技术上可行性较高，但要先验证官方服务包能否在不执行系统级安装的情况下，以独立数据目录和前台进程运行；平台覆盖也需按架构区分。

---

## 结论摘要

TDengine 是原生时序数据库服务，核心进程为 `taosd`，主要通过 TCP 6030 提供原生连接；`taosAdapter` 提供 WebSocket/REST 接入，常用端口为 6041。官方 Community/OSS 服务发行包包含服务和 CLI 等组件，也提供 Windows、Linux 与 macOS 安装包。

平台表显示，服务器支持 Linux x64/ARM64、Windows x64，以及 macOS 14+ ARM64；macOS x64（Intel）未列为当前官方验证的平台。客户端连接器的平台范围更广，不能据此推断服务器也支持同样的平台。

集成的关键难点不是服务管理代码，而是官方安装器的系统级行为：Linux 安装默认写入 `/usr/local/taos`、`/etc/taos`、`/var/lib/taos` 等路径并注册 systemd 服务；Windows 和 macOS 也提供安装器与系统服务启动方式。FlyEnv 若希望保持独立安装目录、无需管理员权限、可由 Fork 进程掌控生命周期，就应基于官方发行包测试直接启动 `taosd`，并为它提供独立配置、数据和日志路径，而不调用整套系统安装流程。

官方资料：

- [TDengine 下载与安装](https://docs.tdengine.com/operations-and-tooling/operations/install/)
- [官方支持平台矩阵](https://docs.tdengine.com/reference/supported/)
- [TDengine Quick Start](https://docs.tdengine.com/quick-start/)
- [网络端口与网络配置](https://docs.tdengine.com/operations-and-tooling/operations/network/)
- [TDengine OSS 开源与许可说明](https://tdengine.com/open-source/)
- [TDengine GitHub Releases](https://github.com/taosdata/TDengine/releases)

---

## 产品组件与部署形式

| 组件 | 用途 | 第一版是否需要 |
|---|---|---|
| `taosd` | 数据库核心服务 | 必需 |
| `taos` | SQL 命令行工具 | 建议随服务版本提供 |
| `taosAdapter` | WebSocket/REST 接入层 | 可选；需要应用通过 WebSocket 或 HTTP 连接时再启用 |
| `taosKeeper`、`taosExplorer`、`taosX` | 监控、管理 UI、数据集成等配套能力 | 暂不纳入最小本地服务 |

官方完整服务包包含 `taosd`、`taosAdapter`、`taosc`、CLI 和其他工具。官方文档展示的标准安装方式会安装系统服务；Linux 也明确支持在没有 systemd 时直接运行 `/usr/local/taos/bin/taosd`。TDengine 服务端仓库的开发说明使用 `taosd -c <配置目录>` 指定独立配置目录。因此，FlyEnv 可行的目标运行形态是解压/安装可携带的官方服务包后直接管理服务进程，但“是否能在所有平台绕过安装器，并把配置、数据、日志都重定向到 FlyEnv 目录”仍应通过小型技术验证确认，尤其是 Windows/macOS。

推荐的 FlyEnv 目录布局：

```text
app/tdengine/<version>/       # 官方程序文件
server/tdengine/<version>/    # taos.cfg、数据、日志、PID/运行状态
```

默认服务器端口为 TCP `6030`。`taosAdapter` 通常使用 `6041`，只在启用它时显示和检查该端口。TDengine 节点配置还涉及 `fqdn`、`firstEp` 等参数；单机开发场景应验证 loopback/FQDN 配置，避免把集群部署指南里的多节点设置直接带入默认配置。

---

## 平台可行性

| 平台 | 官方服务端支持情况 | 集成判断 |
|---|---|---|
| Linux x64 / ARM64 | 官方矩阵列出主流 Linux 发行版和两种架构 | 可行；需适配发行版包、glibc 与运行库要求 |
| Windows 10/11 x64、Windows Server x64 | 官方矩阵支持 x64；安装器要求 Microsoft Visual C++ Redistributable 2015–2022 x64 | 可行；需验证免安装启动、运行库缺失提示、进程树回收和带空格路径 |
| macOS 14+ ARM64 | 官方矩阵列出 ARM64 | 可行；应覆盖 Apple Silicon，并验证安装器外启动与数据路径 |
| macOS Intel x64 | 当前服务器支持矩阵未列出 | 不应承诺原生支持；可评估用户自备兼容环境或容器方案 |
| Windows ARM64 | 当前服务器矩阵未列出 | 不纳入初版支持承诺 |

官方客户端/连接器虽支持更多平台，但那只说明客户端可以从这些平台连接服务，不代表相应平台有受支持的 `taosd` 服务端包。

---

## FlyEnv 集成基础

现有代码已经有可复用的数据库服务和服务模块模式：

- `AppModuleTypeEnum` 有 `dataBaseServer` 分类，ClickHouse 已在此分类下注册。
- `AppModuleEnum` 已包含 ClickHouse 等模块 ID；Fork 的 `BaseManager` 对数据库模块采用按需导入和模块分发。
- ClickHouse 与 RabbitMQ 模块可作为版本管理、配置/日志页面、端口检查和 Fork 服务生命周期的实现参考。
- FlyEnv 的 Fork 进程适合承载受控的长生命周期数据库进程；TDengine 的子进程、PID、端口和存活状态应以 Fork/进程检查为准。

若实施原生模块，主要工作包括：

1. 新增 TDengine Fork 模块，完成官方版本下载/安装、架构筛选、配置初始化、启动/停止、状态检测、CLI/日志路径管理。
2. 新增 renderer 模块页面，复用通用服务生命周期，提供版本、配置、日志和连接信息。
3. 接入模块枚举、Fork 分发、菜单、图标和翻译。
4. 只在 `taosd` 核心服务需要时申请端口 6030；将 Adapter 作为可选组件，单独管理 6041。
5. 确保数据目录和 cluster/node 标识持久化，重启时不重复初始化已有数据。

### 状态归属与操作约定

- **Fork 模块负责**：真实 `taosd`/可选 Adapter 子进程、PID、端口、存活检测、停止顺序和启动诊断。
- **renderer 页面负责**：当前页面的选择、输入框、对话框和展示过滤条件。
- **长操作**：下载、安装、配置初始化等若可能跨页面存活，应由模块内单例 controller 持有生命周期；页面只绑定状态并发出命令。
- **服务启停**：优先使用 `ModuleInstalledItem.start()`、`stop()`、`restart()`，通过模块的 `startExtParam`/`stopExtParam` 传入 TDengine 参数。除非验证共享接口无法覆盖进程要求，才设计额外启停工作流。
- **模块数据**：使用 `StorageSetAsync` / `StorageGetAsync` 存取模块专属数据；不新增 Pinia store，也不把模块状态写入 `config.setup`。
- **操作合同**：实现计划需写清 owner、启动/中间/终止事件、重复调用行为、服务交互、页面卸载后的继续行为及生命周期验证。

---

## 推荐实施范围

第一版建议：

- 只集成 TDengine TSDB-OSS 官方 Server 包，不集成 Enterprise 专属服务或 License Center。
- 只支持经过验证的 Linux x64/ARM64、Windows x64、macOS ARM64；明确 macOS 最低版本，并以当期官方矩阵为准。
- 先支持单节点本地实例、启动/停止/重启、端口检查、配置查看/编辑、日志和 CLI 入口。
- 默认只启动 `taosd`；`taosAdapter` 作为明确可选项，避免让最简单的本地服务启动依赖多余组件。
- 保留用户数据目录，版本升级前提示备份；不在每次启动时重建数据或覆盖用户配置。
- 若没有可供 FlyEnv 管理的免特权官方包，优先把“连接现有 TDengine”作为低成本接入功能，或评估通过 Podman 提供容器化本地实例，而不是把系统安装器隐式包装成 FlyEnv 安装。

第一版暂不做：

- 多节点集群编排和节点发现。
- taosKeeper、taosExplorer、taosX、Grafana 插件及企业功能的统一生命周期管理。
- 跨主版本的数据自动迁移或覆盖安装。
- 对当前官方服务器矩阵未覆盖的平台作兼容承诺。

---

## 风险与待验证事项

- **便携式运行验证是开工门槛**：分别在 Windows、Linux、macOS 目标架构上检查 `taosd -c` 是否能从 FlyEnv 目录运行，并能将配置、数据和日志完全指向用户目录。确认停止后没有遗留子进程。
- **Windows 安装依赖**：官方安装说明提到 VC++ Redistributable；需判断直接运行包是否也依赖它，并提供可读的缺失依赖提示。
- **文件和端口管理**：TDengine 使用多个组件与配置参数；默认只启用必要端口，并绑定本地开发所需地址，避免无意监听外网。
- **数据兼容性**：版本切换不能只替换程序目录；升级和降级必须遵循 TDengine 对元数据与数据文件的兼容约束，并提供备份提示。
- **许可合规**：官方说明 TDengine OSS 核心使用 AGPLv3。若 FlyEnv 负责下载官方发行物，需保持来源、许可证和版权信息清晰；若随 FlyEnv 安装包再分发二进制，应单独审核 AGPLv3 的分发义务与第三方组件许可。
- **平台表维护**：安装支持矩阵可能随版本调整；版本列表应按操作系统和架构过滤，不要仅依据连接器矩阵开放下载。

## 最终判断

TDengine 可以集成到 FlyEnv 的数据库服务体系，整体判断为**有条件可行**。FlyEnv 现有模块架构足以承载管理界面和进程生命周期；是否能达到 RabbitMQ/ClickHouse 那样的独立安装体验，取决于官方发行包能否在 Linux、Windows 和 Apple Silicon 上绕开系统级安装器并可控地重定向所有运行数据。建议先做一个验证原型，再决定原生模块与容器方案；平台支持至少应把 macOS Intel 和 Windows ARM 排除在初版承诺之外。
