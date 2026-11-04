# MariaDB Cluster 插件实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 复制 `plugins/mysql-cluster` 为 `plugins/mariadb-cluster`，功能界面一致，引擎机制按 MariaDB 适配（无 Group Replication）。

**Architecture:** 全量复制 + 系统性适配；插件自包含，宿主 `src/` 零改动；构建后经 PluginManager 自发现并写入 `plugins/registry.json`。

**Tech Stack:** TypeScript / Vue 3 / Element Plus / mysql2 驱动 / Node 内置 test runner / esbuild+Vite（`yarn plugin:build mariadb-cluster`）。

## Global Constraints

- 设计文档：`docs/superpowers/specs/2026-10-22-mariadb-cluster-design.md`（身份/命名/端口/目录的唯一事实来源）
- 插件 id/flag：`mariadb-cluster`；fork IPC `app-fork:mariadb-cluster`；进度事件 `APP-Mariadb-Cluster-Progress`；存储键 `flyenv-plugin-mariadb-cluster-v1`
- 目录：`<MariaDBDir>/mariadb-cluster`、`<BaseDir>/mariadb-cluster/data`；PID 文件 `mariadb.pid`；配置文件仍 `my.cnf`
- 端口基准 13307；管道前缀 `FlyEnvMDBC_`；Unix socket `/tmp/flyenv-mdbc-`；asideIndex 28；图标 `@/svg/mariaDB.svg?raw`；路由 `/mariadb-cluster`
- MariaDB 版本下限 10.4；模式仅 `standalone` | `replication`
- **禁止改名**：宿主 `I18nT('mysql.*')` 键、`@/components/Mysql/*` 与 `MySQLManage` 宿主类名、`mysql2` 驱动包名、DbGate 的 `dbgate-mysql-dumper` pin
- 保留 mysql-cluster 最近的 Windows 修复（services.ts 分隔符归一、InstanceDialog busy 守卫、runtime.ts detached:false + leader 折叠）——复制当前源码即自带，不得回退
- 每个任务结束必须可独立验证；最终验收：单测全绿 + `yarn plugin:build mariadb-cluster` 成功

---

### Task 1: 机械复制与身份批量改名

**Files:**
- Create: `plugins/mariadb-cluster/**`（整体复制）
- Delete: `plugins/mariadb-cluster/fork/groupReplication.ts`、`plugins/mariadb-cluster/fork/gtid.ts`、`plugins/mariadb-cluster/tests/groupReplication.test.ts`

**Interfaces:**
- Produces: 后续所有任务基于 `plugins/mariadb-cluster/` 内文件工作；fork 默认导出模块 `type='mariadb-cluster'`。

- [ ] **Step 1: 复制并删除 GR 专属文件**

```bash
cp -r plugins/mysql-cluster plugins/mariadb-cluster
rm plugins/mariadb-cluster/fork/groupReplication.ts plugins/mariadb-cluster/fork/gtid.ts plugins/mariadb-cluster/tests/groupReplication.test.ts
```

- [ ] **Step 2: 批量改名脚本**（按序执行，长串优先；在 Git Bash 下运行）

```bash
cd plugins/mariadb-cluster
FILES=$(grep -rl --exclude-dir=node_modules . -e 'mysql' -e 'MySQL' -e 'Mysql' -e 'MYSQL')
for f in $FILES; do
  sed -i \
    -e 's/APP-Mysql-Cluster-Progress/APP-Mariadb-Cluster-Progress/g' \
    -e 's/flyenv-plugin-mysql-cluster-v1/flyenv-plugin-mariadb-cluster-v1/g' \
    -e 's/MYSQL_CLUSTER_DBGATE_/MARIADB_CLUSTER_DBGATE_/g' \
    -e 's/MYSQL_CLUSTER_TEST_BIN/MARIADB_CLUSTER_TEST_BIN/g' \
    -e 's/mysql-cluster/mariadb-cluster/g' \
    -e 's/MysqlCluster/MariadbCluster/g' \
    -e 's/mysqlCluster/mariadbCluster/g' \
    -e 's/FlyEnvMC_/FlyEnvMDBC_/g' \
    -e 's/flyenv-mc-/flyenv-mdbc-/g' \
    -e 's/window\.Server\.MysqlDir/window.Server.MariaDBDir/g' \
    -e 's/global\.Server\.MysqlDir/global.Server.MariaDBDir/g' \
    -e 's/MySQL Cluster/MariaDB Cluster/g' \
    "$f"
done
cd ../..
```

- [ ] **Step 3: 残留清点**

Run: `grep -rn -i 'mysql' plugins/mariadb-cluster --include='*.ts' --include='*.vue' --include='*.json' --include='*.md' | grep -v -E "I18nT\('mysql\.|@/components/Mysql|MySQLManage|mysql2|dbgate-mysql-dumper" `
Expected: 输出一份残留清单（引擎机制相关的 mysqld/mysqlx/版本判断等），交给 Task 2-7 逐个处理；确认 `I18nT('mysql.`、`@/components/Mysql`、`MySQLManage`、`mysql2`、`dbgate-mysql-dumper` 均已保留未动。

- [ ] **Step 4: 验证复制完整**

Run: `ls plugins/mariadb-cluster/fork plugins/mariadb-cluster/render plugins/mariadb-cluster/tests`
Expected: 与 mysql-cluster 同构（除已删 3 个 GR 文件）；`plugin.json` 已含 `mariadb-cluster` 字样。

---

### Task 2: shared.ts + policy.ts（MariaDB 语义）

**Files:**
- Modify: `plugins/mariadb-cluster/shared.ts`
- Modify: `plugins/mariadb-cluster/policy.ts`
- Test: `plugins/mariadb-cluster/tests/policy.test.ts`

**Interfaces:**
- Produces: `ClusterMode = 'standalone' | 'replication'`；`InstanceSpec`/`ClusterSpec` 无 `groupPort/groupUuid`；policy 导出 `MARIADB_MIN_VERSION = '10.4'` 与 `supportedMariaDBVersion(version: string): boolean`（解析 `^(\d+)\.(\d+)\.(\d+)`，要求含 `-MariaDB` 语义由 probeEngine 负责，此处仅版本号：major>10 || (major===10 && minor>=4)）。**删除** `replicationCapabilities`；调用方改为无分支的 slave/master 语法（Task 4/5/6 跟进）。

- [ ] **Step 1: 改 shared.ts**：`ClusterMode` 删 `'group-replication'`；删 `InstanceSpec.groupId/groupPort`、`ClusterSpec.groupUuid`；角色类型保留 `'SOURCE'|'REPLICA'|'STANDALONE'`，删 `'PRIMARY'|'SECONDARY'`。
- [ ] **Step 2: 改 policy.ts**：删 `replicationCapabilities`；新增 `MARIADB_MIN_VERSION`/`supportedMariaDBVersion`；模式校验删除 GR 分支与 "3/5/7/9 节点" 规则；删除 `/maria/i` 拒绝与 "MySQL 8.0.13/8.0.27" 文案，改为 "MariaDB 10.4 或更高"；`normalizedPath`、端口/套接字/目录校验保持。
- [ ] **Step 3: 适配 policy.test.ts**：版本用例改 10.3（拒绝）/10.4、11.4（通过）；删除 GR 用例。
- [ ] **Step 4: 运行** `node --import tsx --test plugins/mariadb-cluster/tests/policy.test.ts`（本任务内 config/runtime 尚未改完，仅 policy 测试需绿）。

---

### Task 3: fork 引擎身份（catalog/processIdentity/paths/command）

**Files:**
- Modify: `plugins/mariadb-cluster/fork/catalog.ts`（probeEngine）
- Modify: `plugins/mariadb-cluster/fork/processIdentity.ts`
- Modify: `plugins/mariadb-cluster/fork/paths.ts`
- Modify: `plugins/mariadb-cluster/fork/command.ts`（错误文案）
- Test: `plugins/mariadb-cluster/tests/catalog.test.ts`、`runtime.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `supportedMariaDBVersion`。
- Produces: `probeEngine(spec, mode)` 要求 `--version` 输出含 `MariaDB` 且含 `` `Ver ${spec.engine.version}` ``；程序名正则接受 `mariadbd|mysqld`。

- [ ] **Step 1: probeEngine 重写**

```typescript
export async function probeEngine(spec: InstanceSpec, mode: ClusterMode = 'standalone'): Promise<void> {
  await access(spec.engine.bin, constants.X_OK)
  const output = await runCommand(spec.engine.bin, ['--no-defaults', '--version'], 10_000)
  if (!/mariadb/i.test(output) || !output.includes(`Ver ${spec.engine.version}`))
    throw new Error('MariaDB binary version does not match the selected installation')
  if (!supportedMariaDBVersion(spec.engine.version))
    throw new Error('MariaDB 10.4 or later is required')
  // MariaDB 无 Group Replication；mode 取值已由 policy 限定为 standalone/replication。
  void mode
}
```

（删除 GR 插件探测块；import 改为 `supportedMariaDBVersion`。）

- [ ] **Step 2: processIdentity.ts**：程序名正则改 `/(?:^|[\\/])(?:mysqld|mariadbd)(?:\.exe)?$/i`；`'mysqld' + rest` 改 `'mariadbd' + rest`。
- [ ] **Step 3: paths.ts**：`mysql.pid` → `mariadb.pid`；`my.cnf` 不变。
- [ ] **Step 4: command.ts** 错误文案 MySQL→MariaDB。
- [ ] **Step 5: 适配 catalog.test.ts / runtime.test.ts** 中的 mysqld 进程行为 mariadbd、`--initialize-insecure` 行为 install-db 形态。
- [ ] **Step 6: 运行** `node --import tsx --test plugins/mariadb-cluster/tests/catalog.test.ts plugins/mariadb-cluster/tests/runtime.test.ts`

---

### Task 4: fork/config.ts（MariaDB 配置键集）

**Files:**
- Modify: `plugins/mariadb-cluster/fork/config.ts`
- Test: `plugins/mariadb-cluster/tests/`（配置渲染相关用例，含 catalog/files 测试）

**Interfaces:**
- Consumes: Task 2 的 `ClusterMode`（无 GR）。
- Produces: `renderConfig(spec, mode, paths, platform)`；`validateConfigEdit` 的新 `protectedKeys`。

- [ ] **Step 1: renderConfig 重写要点**：
  - 删除 `loose-mysqlx=0`、`sql-require-primary-key=ON`、整个 `mode === 'group-replication'` 块
  - 删除 `replicationCapabilities` 三元：固定 `log-slave-updates=ON`、`skip-slave-start=ON`，删除 `replica-preserve-commit-order`
  - 复制模式键集：`gtid-strict-mode=ON`、`log-bin=<datadir>/binlog`、`binlog-format=ROW`、`log-slave-updates=ON`、`skip-slave-start=ON`
  - 保留：basedir/datadir/bind-address/port/socket/pid-file/log-error/slow-query-log/server-id、Windows `enable-named-pipe=ON`
- [ ] **Step 2: protectedKeys 正则收窄**：

```typescript
/^(?:loose-)?(?:basedir|datadir|port|socket|pid-file|bind-address|server-id|log-error|slow-query-log-file|log-bin.*|binlog.*|relay-log.*|slave.*|skip-slave.*|read-only|enable-named-pipe|named-pipe|skip-networking|skip-name-resolve|init-file|skip-grant-tables|gtid-strict-mode|gtid-domain-id)$/
```

（删除 mysqlx.*/plugin-load.*/group-replication.*/gtid-mode/enforce-gtid.*/log-replica-updates/replica.*/skip-replica.*/super-read-only/sql-require-primary-key。）
- [ ] **Step 3: 适配相关测试**（配置快照断言改为新键集）。
- [ ] **Step 4: 运行** 相关测试文件。

---

### Task 5: fork/initialize.ts + runtime.ts（初始化与启动）

**Files:**
- Modify: `plugins/mariadb-cluster/fork/initialize.ts`
- Modify: `plugins/mariadb-cluster/fork/runtime.ts`
- Test: `plugins/mariadb-cluster/tests/process-start.test.ts`

**Interfaces:**
- Consumes: Task 3 的 processIdentity；Task 4 的 renderConfig。
- Produces: `initializeInstance(catalog, id, emit)` 使用 install-db；`runtime.start` 复制模式用 `--skip-slave-start=OFF --read-only=ON`。

- [ ] **Step 1: initialize.ts**——二进制解析（参照宿主 `src/fork/module/Mariadb/index.ts:96-102` 的候选名）：

```typescript
const resolveInstallDbBin = async (enginePath: string, windows: boolean): Promise<string> => {
  const names = windows
    ? ['mariadb-install-db.exe', 'mysql_install_db.exe']
    : ['mariadb-install-db', 'mysql_install_db']
  for (const name of names) {
    const bin = join(enginePath, 'bin', name)
    if (await access(bin).then(() => true, () => false)) return bin
  }
  throw new Error('This installation does not contain mariadb-install-db')
}
```

调用：`run(bin, args, 180_000)`，Windows args = `[`--datadir=${spec.dataDir}`, `--config=${catalog.paths(id).config}`]`；Unix args = `[`--datadir=${spec.dataDir}`, `--basedir=${spec.engine.path}`, '--auth-root-authentication-method=normal', `--defaults-file=${catalog.paths(id).config}`]`（spawn 传参不带引号）。

- [ ] **Step 2: runtime.ts**：
  - init 检测：由 `--initialize` 正则改为扫描全量 `rows`，程序名匹配 `/(?:^|[\\/])(?:mariadb-install-db|mysql_install_db)(?:\.exe)?/i` 且 COMMAND 含 `spec.dataDir` → 报 'Instance initialization is in progress'
  - 复制模式启动参数：`--skip-slave-start=OFF`；副本追加 `--read-only=ON`（**无** `--super-read-only=ON`）
  - 首启 init-file 内容：`SET SESSION sql_log_bin=0;\nALTER USER 'root'@'localhost' IDENTIFIED VIA mysql_native_password USING PASSWORD(${escape(credential.password)});\n`
  - 保留 detached:false（Windows）与 leader 折叠逻辑不动；'ready for connections' 日志等待不变（MariaDB 同样输出该行）
- [ ] **Step 3: 适配 process-start.test.ts**（init-file 内容、install-db 参数断言）。
- [ ] **Step 4: 运行** `node --import tsx --test plugins/mariadb-cluster/tests/process-start.test.ts`

---

### Task 6: fork/replication.ts + index.ts + service.ts（复制方言与 GR 拆除）

**Files:**
- Modify: `plugins/mariadb-cluster/fork/replication.ts`
- Modify: `plugins/mariadb-cluster/fork/index.ts`
- Modify: `plugins/mariadb-cluster/fork/service.ts`
- Test: `plugins/mariadb-cluster/tests/replication.test.ts`

**Interfaces:**
- Consumes: Task 2 shared 类型。
- Produces: fork 模块无 `configureGroupReplication`/`groupReplication`；`replicationStatus` 对 standalone→STANDALONE、replication→SOURCE/REPLICA。

- [ ] **Step 1: replication.ts 方言重写**：
  - `replicaStatus`：仅 `Slave_IO_Running/Slave_SQL_Running/Seconds_Behind_Master/Master_Port`（删 `??` 现代列回退）
  - `configureReplicaChannel(session, sourcePort, account)`（删 version/sourceUuid 参数）：
    - 查询 `SHOW SLAVE STATUS`；retarget 判断用 `Master_Port`；已有 channel 指向其他源时报错（MariaDB 无 source UUID，用 `Master_Host+Master_Port` 判断）
    - 新 channel：`CHANGE MASTER TO MASTER_HOST='127.0.0.1', MASTER_PORT=?, MASTER_USER=?, MASTER_PASSWORD=?, MASTER_USE_GTID=slave_pos`
    - retarget 时 `STOP SLAVE` + `CHANGE MASTER TO MASTER_PORT=?`
    - 需要启动时 `START SLAVE`；结束 `SET GLOBAL read_only=ON`（无 super_read_only）
  - `ensureReplicationAccount`：删除 `@@GLOBAL.super_read_only` 探测与恢复块（MariaDB 无此变量）；保留 `GRANT REPLICATION SLAVE ON *.*`
  - `configure()`：删除 `SELECT @@server_uuid` 验证（MariaDB 无 server_uuid）；source 验证改为 `SELECT @@server_id` 非空
- [ ] **Step 2: index.ts**：删 `GroupReplicationService` import/getter、`configureGroupReplication` 方法；`replicationStatus` 删 GR 分支；`this.type = 'mariadb-cluster'`（已由 Task 1 改名）。
- [ ] **Step 3: service.ts**：`this.type = 'mariadb'`。
- [ ] **Step 4: 适配 replication.test.ts**（Slave_* 列、CHANGE MASTER 语句、无 super_read_only）。
- [ ] **Step 5: 运行** `node --import tsx --test plugins/mariadb-cluster/tests/replication.test.ts`

---

### Task 7: fork/manage.ts + dbgate*.ts（管理与备份）

**Files:**
- Modify: `plugins/mariadb-cluster/fork/manage.ts`
- Modify: `plugins/mariadb-cluster/fork/dbgate.ts`、`dbgateInstall.ts`（仅文案/注释核对）
- Test: `plugins/mariadb-cluster/tests/manage.test.ts`

**Interfaces:**
- Produces: 备份命令候选 `[mariadb-dump(.exe), mysqldump(.exe)]`，无 `--set-gtid-purged`。

- [ ] **Step 1: manage.ts**：
  - `assertWritable`：删除 `@@GLOBAL.super_read_only` 与 GR primary 检查，仅查 `@@GLOBAL.read_only`
  - 备份二进制：`const names = windows ? ['mariadb-dump.exe', 'mysqldump.exe'] : ['mariadb-dump', 'mysqldump']`，按存在性选取（dirname(spec.engine.bin) 同级）
  - mysqldump 参数删除 `--set-gtid-purged=OFF`
- [ ] **Step 2: dbgate.ts**：确认 `stopInstance` 最后实例关闭面板逻辑与文案（"A running MariaDB instance..."）；`dbgateInstall.ts` 的 `dbgate-mysql-dumper` pin **保留**。
- [ ] **Step 3: 适配 manage.test.ts**（备份参数断言、无 super_read_only）。
- [ ] **Step 4: 运行** `node --import tsx --test plugins/mariadb-cluster/tests/manage.test.ts`

---

### Task 8: render 身份与宿主集成批量

**Files:**
- Modify: `render/Module.ts`、`render/manager.ts`、`render/aside.vue`、`render/startup/register.ts`、`render/startup/ClusterModule.ts`、`render/controller.ts`、`render/dbgate*.ts`、`render/Files/*`、其余残留

**Interfaces:**
- Produces: 模块 typeFlag/路由/存储键/IPC/事件名全部为 mariadb-cluster 身份；宿主集成指向 mariadb。

- [ ] **Step 1: Module.ts**：label "MariaDB Cluster"、图标 `@/svg/mariaDB.svg?raw`、asideIndex 28、platform 不变。
- [ ] **Step 2: aside.vue**：路由 `/mariadb-cluster`、图标、标题、`AsideSetup('mariadb-cluster')`。
- [ ] **Step 3: 宿主集成点**（installations.ts、Services.vue、Instances.vue、ServiceActions.vue、InstallationManage.vue、startup/register.ts）：
  - `BrewStore().module('mysql')` → `'mariadb'`；`fetchVerion/brewInfo/portInfo('mysql')` → `'mariadb'`
  - `config.server?.mysql?.current` → `.mariadb.current`；`setup.mysql?.dirs` → `setup.mariadb?.dirs`
  - `ServiceActionStore.delVersion/updatePath(row, 'mysql')`、`setInstalledVersionNote(..., 'mysql')` → `'mariadb'`
  - 自定义路径对话框 `{ flag: 'mysql' }` → `'mariadb'`；`MySQLManage.init('mysql')` → `init('mariadb')`（类名不改）
  - `I18nT('mysql.manage')` 等宿主键**保留不改**
- [ ] **Step 4: controller.ts**：删除 GR RPC（`configureGroupReplication`）调用与分支；类名已是 MariadbCluster*；`summarize`/topology 角色 SOURCE/REPLICA 保留。
- [ ] **Step 5: 验证** `grep -rn "groupReplication\|group-replication\|groupPort\|groupUuid" plugins/mariadb-cluster/render` → 仅剩 Task 9 待处理的表单文件清单。

---

### Task 9: render 表单/引擎/版本页（GR 移除与 MariaDB 匹配）

**Files:**
- Modify: `render/InstanceDialog.vue`、`render/form.ts`、`render/formValidation.ts`、`render/engine.ts`、`render/versionUse.ts`、`render/Versions.vue`

- [ ] **Step 1: InstanceDialog.vue**：模式下拉仅 standalone/replication；删除 GR 副本数选项（3/5/7/9 仅 GR 用，replication 用 1–15 input）、groupPort 展示与提交字段、groupUuid；默认名 'MariaDB'；保留 Task 1 已改名的端口基准 13307 与 busy 守卫。
- [ ] **Step 2: form.ts**：`createDraftRequest` 删 groupPort/groupUuid 生成；`suggestStartPort` 删 groupPort 扫描与 `+100` 保留区间逻辑。
- [ ] **Step 3: formValidation.ts**：删 `/maria/i` 拒绝；版本下限改 `supportedMariaDBVersion`；删 GR 节点数规则与 groupPort 校验。
- [ ] **Step 4: engine.ts**：`mariadbd-safe → mariadbd` 重写；二进制正则 `/(?:^|[/\\])(?:mariadbd|mysqld)(?:\.exe)?$/i`；Macports `/\/opt\/local\/lib\/mariadb[^/]*\//i`、Homebrew `/\/(?:homebrew\/)?opt\/mariadb(?:@[^/]+)?\//`。
- [ ] **Step 5: versionUse.ts**：公式名正则 `/^mariadb(?:@?[0-9.]+)?(?:-server)?$/`。
- [ ] **Step 6: Versions.vue**：下载链接 `https://mariadb.org/download/`；`type-flag="mariadb"`。
- [ ] **Step 7: 验证** `grep -rn "groupReplication\|group-replication\|groupPort\|groupUuid" plugins/mariadb-cluster` → 零残留。

---

### Task 10: lang + plugin.json + README

**Files:**
- Modify: `lang/en.ts`、`lang/zh.ts`、`plugin.json`、`README.md`

- [ ] **Step 1: plugin.json**：id/name/label "MariaDB Cluster"、asideIndex 28、版本 0.1.0、描述改写（standalone + GTID 主从，无 GR 措辞）。
- [ ] **Step 2: lang**：全文 MySQL→MariaDB（Task 1 已做粗替换，本步精修）；删除 GR 专属 key（groupHint/grHint/groupCountInvalid/groupVersionRequired 等）及其中英文引用点；复制版本要求文案 "MariaDB 10.4 或更高"；检查 render 中对被删 key 的引用同步删除。
- [ ] **Step 3: README.md**：目录/存储键/命令改 mariadb；支持版本 "MariaDB 10.4+"；删除 GR 章节；测试命令 `node --import tsx --test plugins/mariadb-cluster/tests/*.test.ts`。
- [ ] **Step 4: 验证** `grep -rn "groupReplication\|grHint\|groupHint" plugins/mariadb-cluster/render plugins/mariadb-cluster/lang` → 零残留。

---

### Task 11: tests 收尾

**Files:**
- Modify: `plugins/mariadb-cluster/tests/**`（约 29 个文件）

- [ ] **Step 1: 全量运行** `node --import tsx --test plugins/mariadb-cluster/tests/*.test.ts`，收集失败清单。
- [ ] **Step 2: 逐文件适配**：env 变量改名断言（ui.test.ts 的 `FlyEnvMDBC_abc_1`、端口 13307）、native.test.ts（`MARIADB_CLUSTER_TEST_BIN` 指向 mariadbd、install-db 流程、删 GR 场景、`/Ver (\d+\.\d+\.\d+)/` 版本解析保留）、transport/startup 测试的 `MariaDBDir`、dbgateInstall.test.ts 保留 dumper pin 断言。
- [ ] **Step 3: 全绿** `node --import tsx --test plugins/mariadb-cluster/tests/*.test.ts` → 0 fail。

---

### Task 12: 构建与验收

- [ ] **Step 1:** `yarn plugin:build mariadb-cluster` → 成功；`plugins/registry.json` 出现 mariadb-cluster 条目。
- [ ] **Step 2:** `yarn plugin:test mariadb-cluster`（构建契约检查）通过。
- [ ] **Step 3:** 全量单测复跑 + `grep -rn -i "mysql" plugins/mariadb-cluster | grep -v -E "I18nT\('mysql\.|@/components/Mysql|MySQLManage|mysql2|dbgate-mysql-dumper|mysqldump|mysql_install_db|mysql_native_password"` 人工复核残留均为引擎机制有意保留项。
- [ ] **Step 4:**（手动，本机 Windows）`yarn plugin:dev mariadb-cluster`：创建 replication 集群 → 启动无终端窗口、身份验证通过 → `SHOW SLAVE STATUS` 双 Yes → 停止无残留进程。

## Self-Review 记录

- Spec 覆盖：身份命名(T1/T8/T10)、引擎差异 1-8(T3-T7)、Windows 修复保留(全局约束)、渲染 GR 移除(T8/T9)、语言/文档(T10)、测试(T2-T7/T11)、构建验收(T12)。无占位符；接口名跨任务一致（`supportedMariaDBVersion`、`MARIADB_MIN_VERSION`、probeEngine 签名）。
- 已知风险：MariaDB 10.4+ 的 `IDENTIFIED VIA mysql_native_password` 语法、install-db Windows `--config` 参数在真机验收（T12 Step 4）确认。
