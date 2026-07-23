# Temporal 集成设计（temporal + temporal-cli 双模块）

日期：2026-07-23
状态：已确认（用户批准）
涉及仓库：`E:\Github\FlyEnv`（客户端）、`E:\Github\FlyEnv-Admin`（one-env 服务端）

## 1. 目标与模块划分

在 FlyEnv 中集成 Temporal，新增**两个服务模块**（均可启停、均进托盘）：

| 模块 typeFlag | 定位 | 运行的二进制 | 配置形态 |
|---|---|---|---|
| `temporal` | 生产形态单机 Temporal 服务 | `temporal-server`（+ 可选 `ui-server` 组件提供 Web UI） | 完整 yaml（官方配置格式） |
| `temporal-cli` | 官方 dev server + CLI 工具 | `temporal server start-dev`（自带 Web UI） | key=value conf（启动时解析为 CLI flags） |

两者版本列表、安装目录、数据目录完全独立，互不依赖。

## 2. 已确认的决策

| 决策点 | 结论 |
|---|---|
| 服务运行方式 | standalone `temporal-server`（配置文件驱动）+ 独立 `ui-server` 组件提供 Web UI |
| temporal-cli 服务形态 | `temporal server start-dev`（自带 UI :8233、SQLite、自动创建 default namespace） |
| 持久层 | 仅 SQLite（default.db + visibility.db，自动建表），配置文件全开放编辑，高级用户可自行改 yaml 接 MySQL/PG |
| ui-server 管理 | 单一受管实例（phpMyAdmin 模式）：固定目录、自动取 one-env 最新版、无版本选择。依据：Temporal UI 兼容 temporal-server ≥ 1.16（官方声明），版本通用，故直接跟踪最新版 |
| 版本来源 | **全部走 one-env 服务端**（`Base._fetchOnlineVersion`），不直连 GitHub API，不含 brew；服务端收录方案见 §7 |
| CLI PATH | 不自动注入，用户可在 FlyEnv 的 PATH 设置里手动添加 |
| 分组 | 两个模块均归 `cacheAndQueue`（与 RabbitMQ 同组，任务/工作流基础设施定位） |

## 3. 官方分发事实（已核实，2026-07-23）

| 组件 | 仓库 | 资产命名 | 备注 |
|---|---|---|---|
| temporal-server | `temporalio/temporal` | `temporal_<ver>_{darwin,linux}_{amd64,arm64}.tar.gz`、`temporal_<ver>_windows_{amd64,arm64}.zip` | 约 90MB，二进制在包根 |
| temporal CLI | `temporalio/cli` | `temporal_cli_<ver>_*`（win 另有 `.zip`） | 约 110MB，内嵌 dev server 与 UI |
| ui-server | `temporalio/ui-server` | `ui-server_<ver>_{darwin,linux,windows}_{amd64,arm64}.tar.gz` | 全平台 tar.gz（**Windows 也是 tar.gz**），扁平结构（`ui-server` 在包根） |

注意：**`temporalio/ui` 仓库只发前端静态资源包**，ui-server 二进制在 `temporalio/ui-server` 仓库。

one-env 服务端收录的三个 app key（机制见 §7）：

- `temporal` → temporal-server
- `temporal-cli` → temporal CLI
- `temporal-ui` → ui-server

## 4. Temporal 模块设计

### 4.1 fork 侧 `src/fork/module/Temporal/index.ts`

以 Consul（`src/fork/module/Consul/index.ts`）为模板，`type = 'temporal'`，单例导出。

- `init()`：`this.pidPath = join(global.Server.BaseDir!, 'temporal/temporal.pid')`；UI 进程 pid：`BaseDir/temporal/temporal-ui.pid`
- `fetchAllOnlineVersion()`：`this._fetchOnlineVersion('temporal')`，逐版本拼 `appDir`（`AppDir/temporal/<ver>/`）、`bin`（`appDir/temporal-server[.exe]`）、`zip`（`Cache/temporal-<ver>.<zip|tar.gz>`），用 `existsSync` 补 `downloaded/installed`
- `_installSoftHandle(row)`：win `zipUnpack`、unix `unpack`；防御性 `moveChildDirToParent`；unix `chmod 0755`；macOS `binXattrFix`；最后 `spawnPromise(bin, ['--version'])` 验证可运行
- `initConfig(version)`：首次启动生成 `BaseDir/temporal/config/temporal-v<version>.yaml`，并保留 `temporal-v<version>.yaml.default` 副本（供配置编辑器"载入默认"）。配置内容基于官方教程的 SQLite 双库配置（见附录 A）：数据文件落 `BaseDir/temporal/data/`、`connectAttributes.setup: true`（自动建表）、frontend `grpcPort 7233 / httpPort 7243 / bindOnIP 127.0.0.1`、matching/history/worker `bindOnLocalHost`、pprof 7936
- `_startServer(version, uiFlag?: string)`（`uiFlag` 由渲染侧 `startExtParam` 传入，`'1'` 启用 UI）：
  1. `initConfig(version)`
  2. `serviceStartSpawn`：`temporal-server -r / -c <BaseDir/temporal/config> -e temporal-v<version> start`（官方 systemd 同款参数形式）
  3. 若 `uiFlag === '1'` 且 ui-server 已安装：首次生成 `BaseDir/temporal/config/temporal-ui.yaml`（单文件不按版本，见附录 B），再用 `serviceStartSpawn` 拉起 ui-server 子进程（`-r / -c <config目录> -e temporal-ui start`，pid 写入 `temporal-ui.pid`，outFile/errFile 显式指定为 `temporal-ui-start-out.log` / `temporal-ui-start-error.log`，避免与 server 日志同名冲突）；UI 未安装时仅记日志提示安装，不阻断启动
  4. 查询 `temporal-cli` 模块已安装版本；若有，异步执行 `<temporal bin> operator namespace create --namespace default --address 127.0.0.1:7233`（幂等；"已存在"错误忽略；重试 3 次每次间隔 3 秒等待 server 就绪；任何失败只记日志不阻断启动）
- `_stopServer(version)`（覆写，`Base.stopService` 内部调用的就是 `_stopServer`）：先按 `temporal-ui.pid` + 进程名 `ui-server` 停 UI 子进程，再调用 `super._stopServer` 停 temporal-server（默认 SIGINT，temporal-server 可优雅处理）
- `allInstalledVersions()`：`versionLocalFetch(setup?.temporal?.dirs ?? [], 'temporal', 'temporal-server')` + `versionBinVersion(bin, '"<bin>" --version', 版本号正则)`
- `getConfigFiles(version)`：返回该版本的 server yaml（+ ui yaml，若存在）
- `getLogFiles()`：启动 stdout/stderr 日志（`BaseDir/temporal/` 下 `*-start-out.log` / `*-start-error.log`）

**ui-server 组件方法**（单一受管实例，phpMyAdmin 模式；`Base.exec` 反射机制自动暴露为 IPC，无需额外注册）：

- 固定安装目录 `AppDir/temporal-ui/`（单实例，bin 为 `ui-server[.exe]`），版本号记录在同目录 `version.txt`
- `fetchUiLatest()`：`this._fetchOnlineVersion('temporal-ui')` 取第一条（服务端已按版本降序，第一条即最新），返回 `{ version, url, zip: Cache/temporal-ui-<ver>.tar.gz, appDir, bin, name }`
- `installUiLatest(row)`：复用 `Base.installSoft(row)`（下载缓存、进度回调、安装判定全套）；`_installSoftHandle` 内按 `row.zip` 扩展名分支（`.zip` → `zipUnpack`，否则 `unpack`——ui-server 在 **Windows 上也是 tar.gz**，不能按平台判断）；安装前清空 `appDir` 再解压（覆盖旧实例）；`chmod 0755` + `binXattrFix`（macOS）；成功后写 `version.txt`
- `uiServerInfo()`：返回 `{ installed: boolean, version: string | null }`（读 `version.txt` + bin 存在性）

### 4.2 Base/index.ts 修改

`Base._stopServer` 的进程名兜底字典 `dis` 增加：

```ts
'temporal': 'temporal-server',
'temporal-cli': 'temporal',
```

### 4.3 渲染侧 `src/render/components/Temporal/`

- `Module.ts`：`moduleType: 'cacheAndQueue'`、`typeFlag: 'temporal'`、`label: 'Temporal'`、`isService: true`、`isTray: true`、`icon: import('@/svg/temporal.svg?raw')`
- `Index.vue`：四 Tab（照 Consul）——服务（通用 `ServiceManager`）/ 版本管理（通用 `Manager`，`:has-static="true"`）/ 配置 / 日志；服务 Tab 上方加 **Web UI 区块**（单一受管实例，无版本选择）：
  - 启用开关（关 = 启动时不拉起 ui-server；状态持久化到 `setup.ts`）
  - 状态文本：未安装 / 已装版本号（调 `uiServerInfo`）；`安装` / `更新到最新版` 按钮（先 `fetchUiLatest` 再 `installUiLatest`，安装中禁用并转圈，日志走 AppLog 面板）
  - "打开 UI" 按钮：`shell.openExternal('http://127.0.0.1:8233/')`（照 MailPit/Minio），仅在服务运行且 UI 启用时可用
- `aside.vue`：`AsideSetup('temporal')` + `startExtParam` 返回 `[uiEnabled ? '1' : '0']`；注册到 `AppServiceModule.temporal`（支持一键启动组）
- `Config.vue`：编辑 server yaml；顶部 radio 可切换编辑 ui yaml（`temporal-ui.yaml`，若已生成）
- `Logs.vue`：标准日志查看，radio 切换 server/ui 的启动日志（`temporal-<ver>-start-out.log`、`temporal-ui-start-out.log` 等）
- `setup.ts`：localForage 持久化 UI 开关状态（单实例，无需记版本）

## 5. Temporal CLI 模块设计

### 5.1 fork 侧 `src/fork/module/TemporalCli/index.ts`

Consul 式服务模块，`type = 'temporal-cli'`。

- `init()`：`this.pidPath = join(global.Server.BaseDir!, 'temporal-cli/temporal-cli.pid')`
- `fetchAllOnlineVersion()`：`this._fetchOnlineVersion('temporal-cli')`，`bin = AppDir/temporal-cli/<ver>/temporal[.exe]`
- `_installSoftHandle(row)`：win 优先 `.zip` 资产（`zipUnpack`），unix `unpack`；`chmod 0755` + `binXattrFix`（macOS）+ `temporal --version` 验证
- `initConfig(version)`：生成 `BaseDir/temporal-cli/temporal-cli-v<version>.conf`（+ `.default` 副本），key=value 形式，key 与 `temporal server start-dev` 的 flag 一一对应。默认内容：

  ```ini
  ip=127.0.0.1
  port=7233
  http-port=7243
  ui-ip=127.0.0.1
  ui-port=8233
  db-filename=<BaseDir/temporal-cli/data/dev.db>
  log-level=info
  log-format=text
  headless=false
  ```

  最终以 `temporal server start-dev --help` 的实际 flag 集为准（实施时核实并裁剪，如 `--db-filename`、`--headless`、`--metrics-port` 等）。
- `_startServer(version)`：`initConfig` → 解析 conf 为 execArgs（`server start-dev --<key>=<value>...`，bool 型按 flag 语义处理）→ `serviceStartSpawn`（bin 为 `temporal[.exe]`，stdout/stderr 落 `BaseDir/temporal-cli/` 日志）
- `_stopService(version)`：`Base._stopServer`（默认 SIGINT；`dis` 字典已加 `'temporal-cli': 'temporal'`）
- `allInstalledVersions()` / `getConfigFiles()` / `getLogFiles()`：同 4.1 模式
- dev server 自动创建 default namespace，**无需 namespace 引导**；无 brew（版本来源全部 one-env）

### 5.2 渲染侧 `src/render/components/TemporalCli/`

- `Module.ts`：`moduleType: 'cacheAndQueue'`、`typeFlag: 'temporal-cli'`、`label: 'Temporal CLI'`、`isService: true`、`isTray: true`、`icon: import('@/svg/temporal-cli.svg?raw')`
- `Index.vue`：四 Tab（服务/版本/配置/日志）；服务 Tab 带"打开 UI"按钮（:8233）与一行提示文案：可在 FlyEnv 的 PATH 设置中手动加入该版本以在终端使用 `temporal` 命令
- `aside.vue` / `Config.vue` / `Logs.vue`：同 4.3 模式

## 6. 两模块关系与边界

- 默认配置下两者端口相同（7233/8233），**不能同时运行**；改其一配置即可并存。FlyEnv 不做跨模块端口仲裁，启动失败错误进 AppLog 面板（现有机制）
- `temporal` 模块的 namespace 自动引导依赖 `temporal-cli` 模块已装版本；未装时服务页提示用户手动执行（不阻断启动）
- `temporal` 的 Web UI 来自独立的 `temporal-ui` 组件源；`temporal-cli` 的 UI 内嵌于 dev server，无额外组件

## 7. one-env 服务端设计（`E:\Github\FlyEnv-Admin`）

### 7.1 现有机制（探索结论）

- 技术栈：NestJS + TypeORM（生产 MySQL）+ Redis（版本缓存），管理后台 Vue 3。版本相关代码全部在 `servers/src/api/version/`
- 端点 `POST /api/version/fetch`（`version.controller.ts`，免登录）：`app` 的连字符转下划线后**动态分发**到 `VersionService` 的同名方法（`temporal-cli` → `temporal_cli()`），controller 本身不用改
- 版本清单**不落库**：各 module 实时抓取 GitHub releases，结果写 Redis（key `version:{app}:{os}:{arch}`，TTL 6 小时），再合并 `sys_service_version` 表的手工记录（按 mVersion 去重）后返回 `[{version, mVersion, versionSort, url}]`
- 无定时同步任务；收录新 app = 新建 module 文件 + 若干处注册（最近先例：ClickHouse，commit `d66060b`/`0fb710a`/`96ffacc`）
- 基类 `module/base.ts` 提供 `fetchFromGitHubReleases(repo, versionFetch, mvLength, urlFetch, minVersion)`：按 mVersion（major.minor）分组，**每组只保留最新一个 URL 可达（HEAD 探测）的版本**——客户端看到的列表天然压缩，与 Consul/ETCD 等一致
- `os` 合法值 `'mac'|'win'|'linux'`；`arch` 合法值 `'x86'|'arm'`（客户端负责映射；**Windows 恒为 `x86`**，module 的 `win()` 方法无 arch 参数）

### 7.2 新建：三个抓取 module（参照 `Etcd.ts` 的 assets 匹配写法）

- `servers/src/api/version/module/temporal.ts`：`fetchFromGitHubReleases('temporalio/temporal', v => tag_name.replace(/^v/, ''), 2, urlFetch, '1.0.0')`；`mac`/`linux` 按 arch 匹配 `temporal_<ver>_darwin|linux_{amd64,arm64}.tar.gz`；`win()` 匹配 `temporal_<ver>_windows_amd64.zip`
- `servers/src/api/version/module/temporal-cli.ts`：repo `temporalio/cli`，资产前缀 `temporal_cli_<ver>_`，win 匹配 `_windows_amd64.zip`（优先 zip）
- `servers/src/api/version/module/temporal-ui.ts`：repo `temporalio/ui-server`，资产前缀 `ui-server_<ver>_`，win 匹配 `_windows_amd64.tar.gz`（**Windows 也是 tar.gz**）

### 7.3 修改：注册点

| 文件 | 改动 |
|---|---|
| `servers/src/api/version/version.service.ts` | 私有字段 `TemporalModule` / `TemporalCliModule` / `TemporalUiModule` + 懒加载方法 `temporal()`、`temporal_cli()`、`temporal_ui()`（**下划线命名**，照 `swoole_cli()` 先例） |
| `servers/src/api/version/version.req.dto.ts` | `@IsIn` 数组与 TS union 各加 `'temporal'`、`'temporal-cli'`、`'temporal-ui'`（**连字符形式**）。漏加会在校验层被 400 拒绝，是最易漏的一步 |
| `servers/src/api/version/dto/version.dto.ts` | union 同步加三个 key |

### 7.4 可选：管理后台

仅在需要后台手工补录/预览版本时改：`client/src/api/version/version.ts` union、`client/src/views/version/manage/index.vue` 的 `all` 数组、`list.vue` props union，各加三个 key。（MinIO 就没加，ClickHouse 加了；本方案默认加上，便于运营补录。）

### 7.5 不需要动

`version.controller.ts`（动态分发）、`version.entity.ts` / 表结构（新 app 共用 `sys_service_version`）、路由、权限配置。

### 7.6 服务端验证与部署

- 新建 `servers/scripts/temporal-version-test.ts`（照 `clickhouse-version-test.ts`）：3 模块 × 5 组 os/arch 共 15 组，断言版本号格式 `\d+\.\d+\.\d+` 且 URL 含正确资产名；`cd servers && npx ts-node scripts/temporal-version-test.ts`
- `npx tsc --noEmit` + `npm run build`
- 部署 api.one-env.com 并重启 NestJS。Redis key 按 app 隔离（`version:temporal:mac:arm` 等），新 key 无旧缓存，**无需清缓存**
- **上线顺序**：先部署服务端并验证 fetch 返回，再发布 FlyEnv 客户端

### 7.7 行为注意

- 每个 major.minor 只出最新一个 patch 版本（服务端 `Base` 分组策略），客户端不感知
- Windows 恒出 amd64 资产（服务端无 windows-arm 通道），Windows ARM 用户可手工添加自定义目录

## 8. 文件清单

### FlyEnv 客户端（新建）

| 文件 | 作用 |
|---|---|
| `src/fork/module/Temporal/index.ts` | temporal-server 服务 + ui-server 组件管理 |
| `src/fork/module/TemporalCli/index.ts` | temporal CLI 版本管理 + dev server 服务 |
| `src/render/components/Temporal/Module.ts` | 模块注册（服务模块） |
| `src/render/components/Temporal/Index.vue` | 四 Tab + Web UI 区块 |
| `src/render/components/Temporal/aside.vue` | 侧边栏启停开关 |
| `src/render/components/Temporal/Config.vue` | 配置编辑 |
| `src/render/components/Temporal/Logs.vue` | 日志查看 |
| `src/render/components/Temporal/setup.ts` | UI 开关/选中版本持久化 |
| `src/render/components/TemporalCli/Module.ts` | 模块注册（服务模块） |
| `src/render/components/TemporalCli/Index.vue` | 四 Tab + 打开 UI |
| `src/render/components/TemporalCli/aside.vue` | 侧边栏启停开关 |
| `src/render/components/TemporalCli/Config.vue` | conf 配置编辑 |
| `src/render/components/TemporalCli/Logs.vue` | 日志查看 |
| `src/render/svg/temporal.svg`、`src/render/svg/temporal-cli.svg` | 模块图标 |

### FlyEnv 客户端（修改）

| 文件 | 改动 |
|---|---|
| `src/render/core/type.ts` | `AppModuleEnum` 加 `temporal = 'temporal'`、`'temporal-cli' = 'temporal-cli'` |
| `src/fork/BaseManager.ts` | 属性 `Temporal: any`、`TemporalCli: any` + 两个懒加载分发分支 |
| `src/fork/module/Version/index.ts` | 两个 `allInstalledVersions` 分支 |
| `src/fork/module/Base/index.ts` | `dis` 字典加 `'temporal': 'temporal-server'`、`'temporal-cli': 'temporal'` |
| `src/main/core/mcpToolMetadata.ts` | `temporal` 与 `temporal-cli` 均进 MCP_LIFECYCLE_FLAGS / MCP_QUERYABLE_FLAGS / MCP_INSTALLABLE_FLAGS |

### FlyEnv-Admin 服务端

新建 3 个 module + 修改 3 处注册 + 可选后台 3 处 + 测试脚本 1 个，明细见 §7.2–§7.6。

### 不动

- 路由与侧边栏分组（`import.meta.glob` 自动扫描）
- i18n（复用现有 `base.*` / `service.*` / `appLog.*` key，零改动）
- `src/main/utils/ServerPath.ts`、`src/global.d.ts`（目录用 `join(BaseDir, ...)` 现拼）
- `static/tmpl/`（配置内联生成）
- PATH 生成逻辑（`src/fork/module/Tool/`）
- `AppWithRoot`（两模块均不需要 root）
- 服务端 `version.controller.ts`、entity/表结构、路由、权限

## 9. 目录与端口

- 二进制安装：`AppDir/temporal/<ver>/temporal-server[.exe]`、`AppDir/temporal-ui/<ver>/ui-server[.exe]`、`AppDir/temporal-cli/<ver>/temporal[.exe]`
- 下载缓存：`Cache/`（按 `_fetchOnlineVersion` 返回的扩展名命名）
- 运行数据 `BaseDir/temporal/`：`config/temporal-v*.yaml`、`config/temporal-ui-v*.yaml`、`data/default.db`、`data/visibility.db`、`temporal.pid`、`temporal-ui.pid`、启动日志
- 运行数据 `BaseDir/temporal-cli/`：`temporal-cli-v*.conf`、`data/dev.db`、`temporal-cli.pid`、启动日志
- 端口：7233 gRPC、7243 frontend HTTP、8233 Web UI、内部 membership/rpc 6933-6939/7234-7235 绑 localhost、pprof 7936
- 运行状态检测：FlyEnv 标准 pid 机制；日志：AppLog 面板 + Logs Tab

## 10. 错误处理

- 端口占用/启动失败：`serviceStartSpawn` 的 2 秒早退守卫捕获，错误进 `*-start-error.log` 与 AppLog 流式面板
- one-env 拉取失败/服务端未部署：版本列表为空，渲染侧展示现有错误提示（与 Consul 等模块一致）
- namespace 自动创建失败（CLI 未装/服务未就绪）：仅记日志，服务页提示手动执行
- UI 开关打开但 ui-server 未装：server 正常启动，Web UI 区块引导安装
- macOS Gatekeeper：所有 GitHub 下载的二进制安装后执行 `binXattrFix`

## 11. 外部依赖与风险

- **one-env 服务端先行**：客户端两个模块的安装功能依赖 §7 的服务端改动部署上线；顺序为先服务端、后客户端发布
- temporal-server 的 tar.gz 内部结构以"二进制在包根"为假设（依据官方教程），实施时以实际包为准，必要时 `moveChildDirToParent`
- `start-dev` flag 集以实施时 `temporal server start-dev --help` 实测为准
- 服务端 GitHub 抓取依赖 `servers/src/api/version/request.ts` 中配置的 token 额度；抓取失败时该 app 版本列表为空（Redis 缓存期内不受影响）

## 12. 验证

- 项目无单测框架。按 `scripts/` 现有传统加一个 tsx 冒烟脚本：conf 解析为 flags、yaml/conf 配置生成、`_fetchOnlineVersion` 返回结构处理
- 服务端验证见 §7.6
- `yarn dev` 手动全链路验证：
  1. 安装 temporal-server 版本 → 启动 → 7233 监听 → 停止干净无残留进程
  2. 安装 ui-server → 启用 Web UI → 启动 → :8233 可访问且能看到 default namespace（CLI 已装时）
  3. 安装 temporal-cli 版本 → 启动 dev server → :8233 可访问（自带 UI）→ `temporal workflow list` 连通
  4. 配置编辑后重启生效；停止后 pid 文件清理

## 附录 A：temporal-server 配置模板（SQLite 双库）

基于 [官方教程](https://learn.temporal.io/tutorials/infrastructure/configuring-sqlite-binary/)，路径与端口按本设计调整：

```yaml
log:
  stdout: true
  level: info
persistence:
  defaultStore: sqlite-default
  visibilityStore: sqlite-visibility
  numHistoryShards: 4
  datastores:
    sqlite-default:
      sql:
        pluginName: "sqlite"
        databaseName: "<BaseDir/temporal/data/default.db>"
        connectAddr: "localhost"
        connectProtocol: "tcp"
        connectAttributes:
          cache: "private"
          setup: true
    sqlite-visibility:
      sql:
        pluginName: "sqlite"
        databaseName: "<BaseDir/temporal/data/visibility.db>"
        connectAddr: "localhost"
        connectProtocol: "tcp"
        connectAttributes:
          cache: "private"
          setup: true
global:
  membership:
    maxJoinDuration: 30s
    broadcastAddress: "127.0.0.1"
  pprof:
    port: 7936
services:
  frontend:
    rpc:
      grpcPort: 7233
      membershipPort: 6933
      bindOnIP: '127.0.0.1'
      httpPort: 7243
  matching:
    rpc:
      grpcPort: 7235
      membershipPort: 6935
      bindOnLocalHost: true
  history:
    rpc:
      grpcPort: 7234
      membershipPort: 6934
      bindOnLocalHost: true
  worker:
    rpc:
      membershipPort: 6939
clusterMetadata:
  enableGlobalNamespace: false
  failoverVersionIncrement: 10
  masterClusterName: "active"
  currentClusterName: "active"
  clusterInformation:
    active:
      enabled: true
      initialFailoverVersion: 1
      rpcName: "frontend"
      rpcAddress: "127.0.0.1:7233"
      httpAddress: "127.0.0.1:7243"
dcRedirectionPolicy:
  policy: "noop"
```

## 附录 B：ui-server 配置模板

```yaml
temporalGrpcAddress: 127.0.0.1:7233
host: 127.0.0.1
port: 8233
enableUi: true
cors:
  allowOrigins:
    - http://localhost:8233
defaultNamespace: default
```
