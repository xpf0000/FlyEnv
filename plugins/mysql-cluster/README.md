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

一键复制面向 **MySQL 8.0 / 8.4**，同组使用完全相同的安装版本；异步复制至少需要
8.0.13，GR 至少需要 8.0.27，且安装包必须实际包含 GR 插件。
独立实例还支持具有 `--initialize-insecure` 的 MySQL 5.7 安装；MariaDB 不作为 MySQL 接纳。
创建前会检查真实二进制版本、目录、端口、Socket 和数据路径重叠。

首版仅新建本机空数据节点，不导入已有数据、不自动克隆或覆盖数据库、不支持混合版本组。
普通主从不自动提升副本；GR 自动选主由 MySQL 执行，插件不提供 Router 或统一连接端口。
多个本机节点仍共享整机故障边界。

## 配套宿主改动

**本插件需要与当前分支的 FlyEnv 宿主改动一起使用。** 仅把插件包安装到较早的宿主，
不会自动更新宿主代码；缺少必要能力时插件显示升级提示并阻止实例操作。

这些通用接口默认保持其他模块原行为：

- `AppModuleItem.persistCurrentVersion` 和 `Module.persistCurrentVersion`：实例集合不写共享“当前版本”，BrewStore 首次扫描前应用该元数据。
- ServiceManager 的 `showServiceControls` / `beforeRemove`。
- VersionManager 及 Static/Homebrew/MacPorts 视图的 `beforeRemove`。

插件领域状态始终留在模块本地 singleton，通过 `reactiveBind` 暴露；使用独立
`StorageGetAsync` / `StorageSetAsync`，不新增 Pinia，不写 `config.setup`。
实例启停复用公共 `ModuleInstalledItem.start/stop/restart`。

## 数据与恢复

- 程序安装目录与实例数据分离，多个实例可共享同一套 mysqld。
- Fork 清单、配置、PID 和日志位于 `<MysqlDir>/mysql-cluster/`；数据目录可单独指定。
- renderer Storage key 为 `flyenv-plugin-mysql-cluster-v1`，按实例隔离备注、备份设置及明确保存的凭据。
- 新建时的 Root 密码默认仅保留在当前会话；在数据管理或组凭据窗口中可选择在本机记住。
- 初始化未知或目录非空时不自动重建；失败后保留数据和逐节点结果。
- 编辑已有实例时可改名称、端口和 Socket；已有数据目录、引擎版本和拓扑不可直接替换。
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

原生验收须显式提供 MySQL 8.4.8 测试二进制。测试仅创建临时空目录和自己的进程，
不读取或操作用户现有服务；未设置环境变量时原生测试跳过。

```sh
MYSQL_CLUSTER_TEST_BIN=/path/to/mysql-8.4.8/bin/mysqld \
  node --import tsx --test plugins/mysql-cluster/tests/native.test.ts
```

当前原生验收环境为 **macOS arm64 / Oracle MySQL Community 8.4.8**，已验证：

- 带空格的引擎/配置/数据路径、带引号与反斜线的测试密码。
- 同一二进制的独立实例及精确停止。
- 主从真实数据复制、数据库/用户授权、只读写入拒绝及 mysqldump 导出。
- 三节点 GR 真实复制、主节点退出后的选主、重新加入和全停恢复。

浏览器使用真实 Vue 视图及隔离的 IPC/目录选择适配器，检查三个 Tab、运行中版本卸载阻止、
三模式表单、全宽控件、600px 窄窗、深浅色、双语、数据库管理及副本只读按钮。
这类界面验收不等同于 Electron 或其他平台的原生联调。

Windows、Linux、MySQL 8.0 与其他 8.4 构建的原生验收仍待完成；Windows 测试还需要
宿主 Helper/进程查询环境，不能把 macOS 的通过结果视为跨平台通过。

构建产物为 `dist/plugins/mysql-cluster/mysql-cluster-0.1.0.flyenv-plugin`；
构建会生成匹配的 registry SHA-256，空下载 URL 表示尚未发布。
