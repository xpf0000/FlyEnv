# MySQL Cluster

FlyEnv 独立插件，提供 **MySQL 实例 / 服务 / 版本** 三个 Tab。

## 功能

- 独立实例：选择已安装 MySQL、端口、Socket（Windows 为命名管道）和数据目录。
- 一键主从：新建一主多从，自动配置 GTID、复制账号、只读副本和复制通道。
- 一键 Group Replication：3/5/7/9 个本机节点、单主、XCom，自动建组及检查 ONLINE/PRIMARY。
- 实例与组的启动、停止、重启；通用操作菜单含编辑、配置、错误/慢日志、数据管理和连接信息。
- 数据管理包含数据库/用户列表、新建数据库及授权、密码管理、备注、备份目录和逐库导出。
- 安装版本继续由内置 MySQL 管理；服务页隐藏运行操作，插件入口阻止卸载运行实例依赖的版本。
- 中文/英文界面；其他语言回退英文；深浅色及窄窗布局。

## 使用范围

一键复制支持 **MySQL 8.0.13 及以上版本（包含 8.x Innovation 和 9.x）**，同组使用完全相同的安装版本；
GR 至少需要 8.0.27，且安装包必须实际包含 GR 插件。
独立实例还支持具有 `--initialize-insecure` 的 MySQL 5.7 安装；MariaDB 不作为 MySQL 接纳。
创建前会检查真实二进制版本、目录、端口、Socket 和数据路径重叠。

首版仅新建本机空数据节点，不导入已有数据、不自动克隆或覆盖数据库、不支持混合版本组。
普通主从不自动提升副本；GR 自动选主由 MySQL 执行，插件不提供 Router 或统一连接端口。
多个本机节点仍共享整机故障边界。

## 插件独立性

0.1.1 起全部适配均在插件内，不需要这次功能新增的宿主接口。服务及版本页面由插件渲染，
继续使用既有 MySQL 安装源、公共 `ModuleInstalledItem` 启停和主进程进程登记机制。
宿主普通安装扫描返回空集合；插件专用查询向本地生命周期 registry 提供实例描述，
因此不会把某个集群实例写为宿主的“当前版本”。未修改宿主类或原型。

安装、卸载、进度、终端输出、取消及清理由插件本地 singleton 持有，切换 Tab 不终止任务。
MacPorts 卸载不使用 `--follow-dependents`；有其他依赖时由包管理器拒绝卸载，不连带删除。
下载包卸载只允许 FlyEnv 安装目录内的版本，拒绝含实例数据或仍被进程使用的目录。

插件领域状态始终留在模块本地 singleton，通过 `reactiveBind` 暴露；使用独立
`StorageGetAsync` / `StorageSetAsync`，不新增 Pinia，不写 `config.setup`。
实例启停复用公共 `ModuleInstalledItem.start/stop/restart`。

## 数据与恢复

- 程序安装目录与实例数据分离，多个实例可共享同一套 mysqld。
- Fork 清单、配置、PID 和日志位于 `<MysqlDir>/mysql-cluster/`；新建数据默认位于 `<BaseDir>/mysql-cluster/data/`（即 `server/mysql-cluster/data/`），逐实例目录可单独指定。
- renderer Storage key 为 `flyenv-plugin-mysql-cluster-v1`，按实例隔离备注、备份设置及明确保存的凭据。
- 新建时的 Root 密码默认仅保留在当前会话；在数据管理或组凭据窗口中可选择在本机记住。
- 初始化未知或目录非空时不自动重建；失败后保留数据和逐节点结果。
- 编辑已有实例时可改名称、端口和 Socket；未初始化且为空的数据目录可修改，已初始化数据目录、引擎版本和拓扑不可直接替换。
- 多节点配置更新使用持久化中间记录；中断后禁止启动不一致的节点，显式重试编辑可恢复配置一致性。
- 删除先确认所有目标已停止，只移除管理记录，保留原数据与可检查的配置/日志。
- 全组停止后的 GR 恢复比较所有成员事务历史；GTID 分叉、无法确认成员或尚有未应用事务时拒绝强制 bootstrap。
- 对副本及非 ONLINE PRIMARY 的管理写入会被拒绝，不通过关闭只读模式绕过限制。

## 验证

聚焦回归：

```sh
node --import tsx --test plugins/mysql-cluster/tests/*.test.ts
yarn test:renderer-operation-boundaries
yarn plugin:build mysql-cluster
```

原生验收须显式提供 MySQL 测试二进制，测试会读取其实际版本。测试仅创建临时空目录和自己的进程，
不读取或操作用户现有服务；未设置环境变量时原生测试跳过。

```sh
MYSQL_CLUSTER_TEST_BIN=/path/to/mysql-8.4.8/bin/mysqld \
  node --import tsx --test plugins/mysql-cluster/tests/native.test.ts
```

当前原生验收环境为 **macOS arm64 / Oracle MySQL Community 8.4.8 及 Homebrew MySQL 9.6.0**，已验证：

- 带空格的引擎/配置/数据路径、带引号与反斜线的测试密码。
- 同一二进制的独立实例及精确停止。
- 主从真实数据复制、数据库/用户授权、只读写入拒绝及 mysqldump 导出。
- 三节点 GR 真实复制、主节点退出后的选主、重新加入和全停恢复。

浏览器使用真实 Vue 视图及隔离的 IPC/目录选择适配器，检查三个 Tab、运行中版本卸载阻止、
三模式表单、全宽控件、600px 窄窗、深浅色、双语、数据库管理及副本只读按钮。
这类界面验收不等同于 Electron 或其他平台的原生联调。

Windows、Linux、MySQL 8.0 与其他 MySQL 构建的原生验收仍待完成；Windows 测试还需要
宿主 Helper/进程查询环境，不能把 macOS 的通过结果视为跨平台通过。

构建产物为 `dist/plugins/mysql-cluster/mysql-cluster-0.1.6.flyenv-plugin`；
构建会生成匹配的 registry SHA-256，空下载 URL 表示尚未发布。

0.1.1 的独立宿主回归覆盖本地生命周期身份保持、原宿主零新增配置写入、自动扫描与专用查询隔离、安装进度/取消/重入、失败后的真实安装状态刷新及包目录保护。

0.1.2 将服务/版本页面按主程序页面复制适配，服务页移除启停及 phpMyAdmin 入口；修复侧栏重复选中和响应式设置写入 IndexedDB 的克隆错误。复制模式不再限制 8.0/8.4 系列，9.6.0 已通过实际主从及 GR 验收。

0.1.3 修复节点启动凭据及复制 RPC 参数的 Electron 克隆错误；创建/编辑错误改为模态提示，必填项显示标识；停止的节点只显示启动，运行的节点显示停止/重启；创建默认端口根据已有 SQL/GR 端口自动分配，可手动覆盖。

0.1.4 将创建/编辑错误改用公共 Element 消息，隐藏数据根目录并保留逐节点自定义路径；卡片和列表统一图标及状态颜色。配置沿用 PHP 抽屉/编辑器工具布局并保留插件配置校验，日志直接复用公共 Log 组件；数据管理复制主程序 MySQL 页面、按实例适配列表/密码/备注/备份，连接信息复制后显示结果提示。

0.1.5 将卡片内相同的 MySQL 版本/路径集中到头部（不同则保留逐行列）；编辑/删除统一 Element Plus 图标，启停/重启加载动画与操作图标互斥，重启进度显示在重启按钮。

0.1.6 按模式显示状态列：独立实例隐藏角色/复制延迟，GR 隐藏复制延迟，主从复制保留两列。
