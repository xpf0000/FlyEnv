# Neo4j Windows 启动与 Java 自动绑定设计

日期：2026-08-07

状态：已确认，待实施计划

## 目标

解决两个 Neo4j 模块运行时问题：

1. Windows 启动 `neo4j.bat` 时不显示 PowerShell 窗口。
2. Neo4j 与 Java 的本地已安装列表变化后，为尚未绑定 Java 的 Neo4j 安装自动选择并保存兼容 JDK，使其可直接启动。

## 设计

Windows 的子进程仍归 Neo4j fork 模块所有。Neo4j 在 Windows 使用专用的隐藏启动适配：显式以无配置、非交互、隐藏窗口的 PowerShell/批处理入口启动 Neo4j，并保留隐藏 `cmd` 启动回退。该适配保留既有 `JAVA_HOME`、`NEO4J_CONF`、PID、日志和 HTTP 健康检查；不改变其他服务的通用启动语义。

Java 绑定继续由 `Neo4jJavaBindingManager` 这个模块本地 singleton 持有，并以 `StorageGetAsync`/`StorageSetAsync` 持久化。该 singleton 在 Neo4j aside 初始化一次，持续观察 Neo4j 和 Java 模块的已安装列表。每次变化都序列化执行对账：删除不再存在的 Neo4j 路径绑定；仅对没有绑定的受支持 Neo4j 版本，从当前可用且兼容的 Java 候选中选取策略推荐项并保存。已有用户绑定不被自动替换。

## 所有权与操作契约

| 项目 | 所有者 | 生命周期 |
| --- | --- | --- |
| Neo4j Java 绑定与安装列表对账 | `Neo4jJavaBindingManager` singleton | 应用运行期间，aside 首次挂载至退出 |
| 行内 Java 下拉选择 | Neo4j 页面 | 页面挂载期间 |
| Neo4j 进程、PID、日志、端口、健康检查 | fork `Neo4j` 模块 | 进程生命周期 |
| 服务启动/停止 IPC 与重复调用 | 既有 `ModuleInstalledItem.start/stop` | 操作终止前 |

启动事件保持为 `start-requested`、Java 校验、实例配置、进程创建、健康就绪、成功或失败。进程启动和健康检查仍由 fork 发出终止事件；本次不新增 renderer 长操作控制器。重复启动和停止沿用共享生命周期。列表对账可重复执行；串行队列确保重叠 watch 事件不会交叉写入存储。

## 验证

- 先添加覆盖 Windows 隐藏启动适配和单例 watch 初始化位置的失败测试。
- 添加覆盖“无绑定时选取兼容推荐 JDK、保留已有绑定、清除孤立绑定”的失败测试。
- 运行 Neo4j policy、renderer、service-lifecycle、renderer-operation-boundaries 检查，以及新增聚焦测试。

## 范围限制

- 不增加 Pinia store，不写入 `config.setup`，不更改通用服务启动语义。
- 不改变已有用户 Java 选择，也不尝试自动安装 Java。
- 不直接启动 Java 主类，保持对 Neo4j 官方启动脚本的兼容性。
