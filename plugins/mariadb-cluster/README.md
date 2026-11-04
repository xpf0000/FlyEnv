# MariaDB Cluster

FlyEnv 独立插件，提供 **MariaDB 实例 / 服务 / 版本** 三个 Tab。

## 功能

- 独立实例：选择已安装 MariaDB、端口、Socket（Windows 为命名管道）和数据目录。
- 一键主从：新建一主多从，自动配置 GTID、复制账号、只读副本和复制通道。
- 实例与组的启动、停止、重启；通用操作菜单含编辑、配置、错误/慢日志、数据管理和连接信息。
- 数据管理包含数据库/用户列表、新建数据库及授权、密码管理、备注、备份目录和逐库导出。
- 任意实例运行时，实例标题右侧显示 DbGate 入口；自动读取已安装的 NodeJS 运行时，无需显示 NodeJS 模块，首次打开会安装面板。面板与 MongoDB 共用 `server/dbgate/` 的安装、工作区、凭据及进程；已安装时直接复用，缺失时安装到该全局目录。最后一个实例停止时关闭全局面板，MongoDB 下次使用时再开启。
- 安装版本继续由内置 MariaDB 管理；服务页隐藏运行操作，插件入口阻止卸载运行实例依赖的版本。
- 中文/英文界面；其他语言回退英文；深浅色及窄窗布局。
- 创建/编辑表单逐项显示必填、名称重复、端口冲突、Socket 与数据目录的校验原因，顶层“集群名称”与内部“实例名称”明确区分。数据目录可直接输入，也可通过输入框右侧文件夹按钮选择；已初始化实例的目录仍保持锁定。

## 使用范围

一键复制与独立实例均要求 **MariaDB 10.4 及以上版本**，同组使用完全相同的安装版本；MySQL 安装不作为 MariaDB 接纳。
创建前会检查真实二进制版本、目录、端口、Socket 和数据路径重叠。

首版仅新建本机空数据节点，不导入已有数据、不自动克隆或覆盖数据库、不支持混合版本组。
普通主从不自动提升副本，插件不提供 Router 或统一连接端口。
多个本机节点仍共享整机故障边界。

## 插件独立性

全部适配均在插件内，不需要新增的宿主接口。服务及版本页面由插件渲染，
继续使用既有 MariaDB 安装源、公共 `ModuleInstalledItem` 启停和主进程进程登记机制。
宿主普通安装扫描返回空集合；插件专用查询向本地生命周期 registry 提供实例描述，
因此不会把某个集群实例写为宿主的“当前版本”。未修改宿主类或原型。

安装、卸载、进度、终端输出、取消及清理由插件本地 singleton 持有，切换 Tab 不终止任务。
MacPorts 卸载不使用 `--follow-dependents`；有其他依赖时由包管理器拒绝卸载，不连带删除。
下载包卸载只允许 FlyEnv 安装目录内的版本，拒绝含实例数据或仍被进程使用的目录。

插件领域状态始终留在模块本地 singleton，通过 `reactiveBind` 暴露；使用独立
`StorageGetAsync` / `StorageSetAsync`，不新增 Pinia，不写 `config.setup`。
实例启停复用公共 `ModuleInstalledItem.start/stop/restart`。

## 数据与恢复

- 程序安装目录与实例数据分离，多个实例可共享同一套 mariadbd。
- Fork 清单、配置、PID 和日志位于 `<MariaDBDir>/mariadb-cluster/`；新建数据默认位于 `<BaseDir>/mariadb-cluster/data/`（即 `server/mariadb-cluster/data/`），逐实例目录可单独指定。
- renderer Storage key 为 `flyenv-plugin-mariadb-cluster-v1`，按实例隔离备注、备份设置及明确保存的凭据。
- 新建时的 Root 密码默认仅保留在当前会话；在数据管理或组凭据窗口中可选择在本机记住。
- 普通启动、停止和重启不要求 Root 密码，复用公共进程启动检查和实例进程身份判断，不通过 SQL 登录或 TCP 探测判定启动结果。首次启动仍使用创建时的密码设置 Root 账号。
- 主从实例重启会由 MariaDB 自动续接已保存的复制通道，从节点保持只读。首次创建仍自动配置复制；修改源端口后，可启动所有成员，再点击组头部的“配置 / 恢复复制”应用通道配置。
- 初始化未知或目录非空时不自动重建；失败后保留数据和逐节点结果。
- 编辑已有实例时可改名称、端口和 Socket；未初始化且为空的数据目录可修改，已初始化数据目录、引擎版本和拓扑不可直接替换。
- 多节点配置更新使用持久化中间记录；中断后禁止启动不一致的节点，显式重试编辑可恢复配置一致性。
- 删除先确认所有目标已停止，只移除管理记录，保留原数据与可检查的配置/日志。
- 复制恢复与日常启停分开：节点重新加入或全组停止后，先启动所有成员，再点击“配置 / 恢复复制”并提供各节点 Root 凭据。
- 对副本的管理写入会被拒绝，不通过关闭只读模式绕过限制。

## 验证

插件入口会将本地 Tailwind utilities 编译进 `render/style.css`，使用宿主相同的主题，
仅扫描本插件的 renderer，不重复注入 Preflight；安装版无需依赖宿主预先生成插件新增的工具类。
打包样式回归：`node --import tsx --test plugins/tests/cluster-styles.test.ts`。

聚焦回归：

```sh
node --import tsx --test plugins/mariadb-cluster/tests/*.test.ts
yarn plugin:build mariadb-cluster
```

原生验收须显式提供 MariaDB 测试二进制，测试会读取其实际版本。测试仅创建临时空目录和自己的进程，
不读取或操作用户现有服务；未设置环境变量时原生测试跳过。

```sh
MARIADB_CLUSTER_TEST_BIN=/path/to/mariadb-10.11/bin/mariadbd \
  node --import tsx --test plugins/mariadb-cluster/tests/native.test.ts
```

浏览器使用真实 Vue 视图及隔离的 IPC/目录选择适配器，检查三个 Tab、运行中版本卸载阻止、
两种模式表单、全宽控件、600px 窄窗、深浅色、双语、数据库管理及副本只读按钮。
这类界面验收不等同于 Electron 或其他平台的原生联调。

Windows、Linux 与其他 MariaDB 构建的原生验收仍待完成；Windows 测试还需要
宿主 Helper/进程查询环境，不能把 macOS 的通过结果视为跨平台通过。

构建产物为 `dist/plugins/mariadb-cluster/mariadb-cluster-0.1.0.flyenv-plugin`；
构建会生成匹配的 registry SHA-256，空下载 URL 表示尚未发布。
