# MariaDB Cluster 插件设计（参照 mysql-cluster）

日期：2026-10-22
来源插件：`plugins/mysql-cluster`（目标：功能与界面完全一致；MariaDB 机制不同的地方按 MariaDB 单独处理）

## 目标与范围

创建自包含插件 `plugins/mariadb-cluster`，完整复制 mysql-cluster 的功能与界面：

- 多实例管理（创建/编辑/删除集群、独立实例生命周期、启动/停止/重启、启动组）
- 复制拓扑（GTID 主从）
- 数据库管理（库/用户/密码/备份）、配置文件编辑、DbGate 面板、安装管理、开机自启投影

**明确排除**：Group Replication 模式。MariaDB 没有 group_replication 插件（其多主方案 Galera 是另一套体系，不在本期范围）。模式仅保留 `standalone` 与 `replication`。

**模块边界契约**（遵循 AGENTS.md 新模块约束）：

- 持久化：独立存储键 `flyenv-plugin-mariadb-cluster-v1`（StorageGetAsync/StorageSetAsync），不写 `config.setup`
- 渲染状态：模块本地类 + reactiveBind，不新增 Pinia store
- 服务生命周期：复用 `ModuleInstalledItem.start/stop/restart`，参数经 `startExtParam/stopExtParam`（aside/manager 注册）
- 模块自有类型、helper、策略全部留在 `plugins/mariadb-cluster/` 内，不改宿主通用代码（宿主无需任何改动：`src/` 中对 `mysql-cluster` 零引用，插件经 PluginManager 自发现）

**失败边界契约**（遵循 flyenv-failure-boundaries）：逐实例操作互不影响，部分失败要区分 skipped/failed/completed；补充动作（如 DbGate 面板关闭）失败不得覆盖主操作结果。

## 方案选择

采用**全量复制 + 系统性适配**（方案 A）。放弃"抽取共享内核"（方案 B，会给已稳定的 mysql-cluster 带来回归风险，且插件打包要求目录自包含）与"单插件双引擎"（方案 C，破坏插件隔离）。

## 身份与命名

| 项 | 值 |
|---|---|
| 插件 id / typeFlag / fork IPC | `mariadb-cluster` / `app-fork:mariadb-cluster` |
| 进度事件 | `APP-Mariadb-Cluster-Progress` |
| 存储键 | `flyenv-plugin-mariadb-cluster-v1` |
| 数据目录 | `<MariaDBDir>/mariadb-cluster`、`<BaseDir>/mariadb-cluster/data` |
| 路由 / 图标 / asideIndex | `/mariadb-cluster` / `@/svg/mariaDB.svg` / 28 |
| 起始端口建议基准 | 13307（避开 mysql-cluster 的 13306） |
| Windows 命名管道 | `FlyEnvMDBC_<id>_<n>`；Unix socket `/tmp/flyenv-mdbc-<id>-<n>.sock` |
| PID 文件 | `mariadb.pid`；配置仍 `my.cnf` |
| 宿主集成 | `BrewStore().module('mariadb')`、`app-fork:mariadb`、`config.server.mariadb.current`、`setup.mariadb.dirs`、`MySQLManage.init('mariadb')`、`ServiceActionStore*(…, 'mariadb')` |

## MariaDB 引擎差异适配（fork 侧）

1. **二进制**：`mariadbd[.exe]`（兼容 `mysqld` 别名）。`processIdentity.ts` 程序名正则改为 `/(?:^|[\\/])(?:mysqld|mariadbd)(?:\.exe)?$/i`；`catalog.ts probeEngine` 改为要求输出行含 `MariaDB` 且匹配所选版本（拒绝纯 MySQL）。
2. **初始化**：用 `mariadb-install-db`/`mysql_install_db`（在引擎 bin 同级查找，参照宿主 `src/fork/module/Mariadb` 的查找方式）+ `--datadir/--basedir`，替代 `mysqld --initialize-insecure`。首次启动仍走 init-file 设密码：`ALTER USER 'root'@'localhost' IDENTIFIED VIA mysql_native_password USING PASSWORD(<pwd>);`（兼容 unix_socket 默认认证）。`runtime.ts` 的"初始化进行中"检测改为在全量进程表中识别 install-db 程序 + dataDir。
3. **配置渲染**（config.ts）：删除 `loose-mysqlx`、`gtid-mode`、`enforce-gtid-consistency`、`sql-require-primary-key`、`replica-preserve-commit-order` 及全部 GR 配置块；复制模式使用 `log-bin`、`binlog-format=ROW`、`log-slave-updates=ON`、`skip-slave-start=ON`、`gtid_strict_mode=ON`。`protectedKeys` 正则同步收窄。
4. **复制 SQL**（replication.ts）：仅 `CHANGE MASTER TO MASTER_HOST/PORT/USER/PASSWORD, MASTER_USE_GTID=slave_pos`、`START/STOP SLAVE`、`SHOW SLAVE STATUS`、`Master_*`/`Slave_*` 列；去掉 `GET_*_PUBLIC_KEY`、`super_read_only`、`@@server_uuid`（拓扑身份用 server_id）。`runtime.ts` 副本启动参数只保留 `--read-only=ON`，`--skip-slave-start=OFF`。
5. **备份**（manage.ts）：`mariadb-dump[.exe]` 优先、回退 `mysqldump[.exe]`；删除 `--set-gtid-purged`。
6. **版本策略**（policy.ts）：`replicationCapabilities` 重写为 MariaDB 语义（始终 slave/master 语法、无 GR 层）；版本下限 10.4（`mariadbd` 命名起点）；删除所有 `/maria/i` 拒绝逻辑（policy.ts、formValidation.ts、catalog.ts）。
7. **shared.ts**：`ClusterMode` 去掉 `'group-replication'`；删除 `groupPort`/`groupUuid` 字段。
8. **删除文件**：`fork/groupReplication.ts`、`fork/gtid.ts` 及对应测试。
9. **沿用本次 mysql-cluster 的 Windows 修复**：路径分隔符归一（services.ts/manager.ts）、端口 watch busy 守卫（InstanceDialog.vue）、Windows `detached:false` + 进程树 leader 折叠（runtime.ts）——复制当前源码即自动包含。

## 渲染侧

- 全部文件随复制重命名标识（类名、flag、路由、文案 MySQL→MariaDB）
- `InstanceDialog.vue`：模式下拉去掉 group-replication、去掉 groupPort 展示、副本数规则仅 standalone/replication；默认端口基准 13307
- `engine.ts`/`versionUse.ts`：路径与公式名正则改 mariadb（`/opt/local/lib/mariadb-*/`、`/opt/homebrew/opt/mariadb@*/`、`mariadbd-safe→mariadbd`、`^mariadb(?:@?[0-9.]+)?(?:-server)?$`）
- `installations.ts`：宿主集成点全部切到 `'mariadb'`（见上表）
- lang/en.ts、lang/zh.ts：全文 MySQL→MariaDB，删除 GR 相关 key，复制版本要求文案改为 MariaDB 10.4+
- DbGate 面板共享语义与 mysql-cluster 保持一致（同 MongoDB 的既有共享注意事项原样保留）

## 测试

- 复制 `tests/` 全部用例并适配：版本/模式策略、配置渲染键集、复制 SQL、mariadbd 进程身份、install-db 初始化、备份参数
- 删除 GR 相关测试（groupReplication.test.ts 及 native 中的 GR 场景）
- 环境变量改名 `MYSQL_CLUSTER_TEST_BIN`→`MARIADB_CLUSTER_TEST_BIN`（指向 mariadbd），DbGate 原生测试变量同步改名
- 验收：`node --import tsx --test plugins/mariadb-cluster/tests/*.test.ts` 全绿 + `yarn plugin:build mariadb-cluster` 成功 + registry.json 自动登记

## 验收标准

1. 插件构建通过并写入 `plugins/registry.json`（id=mariadb-cluster）
2. 单元测试全绿
3. Windows 本机实测：创建复制集群 → 初始化 → 启动（无终端窗口、身份验证通过）→ 主从状态正常 → 停止清理干净
