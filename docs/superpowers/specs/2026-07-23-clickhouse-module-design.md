# FlyEnv 新增 ClickHouse 模块 — 设计文档

- 日期：2026-07-23
- 状态：设计已确认（macOS 在线多版本已核实修正）
- 涉及仓库：`E:\Github\FlyEnv`（桌面端）、`E:\Github\FlyEnv-Admin`（版本后台）

## 1. 背景与目标

FlyEnv 当前数据库类模块（`dataBaseServer` 分组）有 MySQL / MariaDB / PostgreSQL / MongoDB。
目标：新增 ClickHouse 列式（时序/分析）数据库模块，形态与现有数据库模块一致：
服务启停、在线版本安装、配置文件编辑、日志查看、托盘集成。

代码现状：两个仓库全文搜索 `clickhouse`（大小写不敏感）均为零匹配，纯新增，无兼容负担。

## 2. 已确认的决策

| 决策点 | 结论 | 理由 |
| --- | --- | --- |
| Windows 平台 | 不支持，`platform: ['macOS', 'Linux']` | ClickHouse 官方无 Windows 原生服务端（官方方案为 WSL2），与 FlyEnv 现有"原生 exe"模式不符；后续可迭代补 WSL2 方案 |
| 在线版本数据源 | FlyEnv-Admin 新增抓取类，桌面端走统一通道 `api.one-env.com` | 与所有现有模块一致；有 Redis 缓存（6h）与手工版本合并能力 |
| 功能范围 | 基础版：启停 + 版本管理 + 配置编辑 + 日志 + 托盘 | 通用组件全部可复用；领域功能（密码/备份/库管理）后续迭代 |
| MCP 集成 | 纳入 v1 | 改动小（3 个文件的 flag 列表），保持 AI 工具一致性 |

## 3. 平台与安装来源矩阵

在线版本**全平台统一来自 GitHub Releases 资产**（`ClickHouse/ClickHouse` 仓库，
API 与 Admin 现有 `Base.fetchFromGitHubReleases` 同源）。已于 2026-07-23 通过
GitHub API 核实：近期每个 release（stable 与 lts 频道）均固定挂 50 个资产，
四个平台的文件齐全。

| 平台 | 在线版本（api.one-env.com ← GitHub Releases） | 资产命名 | Homebrew |
| --- | --- | --- | --- |
| Linux x86_64 | ✅ 多版本 | `clickhouse-common-static-{version}-amd64.tgz`（压缩包） | — |
| Linux arm64 | ✅ 多版本 | `clickhouse-common-static-{version}-arm64.tgz`（压缩包） | — |
| macOS x86_64 | ✅ 多版本 | `clickhouse-macos`（裸二进制） | ✅ `clickhouse` formula |
| macOS arm64 | ✅ 多版本 | `clickhouse-macos-aarch64`（裸二进制） | ✅ `clickhouse` formula |
| Windows | ❌ 模块不显示 | — | — |

关键事实（2026-07-23 逐一验证）：

- tag 形如 `v{version}-stable` / `v{version}-lts`（另有 `-new` 等频道，**过滤只保留 -stable / -lts**）。
- 版本资产 URL：`https://github.com/ClickHouse/ClickHouse/releases/download/{tag}/{asset}`，
  302 跳转到 release-assets.githubusercontent.com，四个平台资产均已验证可下载。
- Linux 用 `common-static` 单包即可——ClickHouse 是单一静态二进制，`clickhouse server` 即可运行。
- macOS 资产是**裸二进制**（非压缩包，约 160MB+），桌面端需自定义 `installSoft`
  （下载 → `chmod 755` → 落位为 `bin/clickhouse`），不复用 `Base.installSoft` 的 zip 解压流程。
- Homebrew 保留，作为 macOS 的备选安装渠道。
- `packages.clickhouse.com` 的 tgz 与 GitHub 资产为同一批文件（已验证 200），
  统一用 GitHub Releases 单一代码路径即可，无需双源。

## 4. FlyEnv-Admin 侧改动

版本数据链路：桌面端 `POST /api/version/fetch {app, os, arch}` → `version.controller.ts` 动态调用
`versionService[app](dto)` → 懒加载 `module/<app>.ts` 抓取 → 合并 `sys_service_version`
表手工版本 → 写 Redis（key `version:{app}:{os}:{arch}`，TTL 6h）→ 返回
`{code:200, data:[{url, version, mVersion, versionSort}]}`。

改动文件（4 必需 + 3 可选）：

1. **新建 `servers/src/api/version/module/clickhouse.ts`**（核心，约 50 行）
   - `class ClickHouse extends Base`，实现契约 `VersionClass`（`module/type.d.ts`）。
   - 数据源统一为 GitHub Releases（复用 `Base.fetchFromGitHubReleases`，或按其模式用
     releases API 的资产列表直接匹配 `browser_download_url`）：
     - 过滤 tag：只保留 `-stable` / `-lts` 后缀（排除 `-new`、`-prestable` 等）。
     - `linux(arch)`：匹配资产 `clickhouse-common-static-{version}-amd64.tgz`（arch=x86）
       / `clickhouse-common-static-{version}-arm64.tgz`（arch=arm）。
     - `mac(arch)`：匹配资产 `clickhouse-macos`（arch=x86）/ `clickhouse-macos-aarch64`（arch=arm）。
     - `win()`：返回 `[]`。
   - 版本字符串保留频道后缀（如 `25.8.28.1-lts`、`26.7.1.1315-stable`），mVersion 分组规则
     按 `Base` 现有机制（前 2 段），实现时确认 stable/lts 同 minor 不冲突。
   - `Base` 自带 HEAD 验证可兜底老旧 tag 缺资产的情况。
   - 方法名必须恰好为 `clickhouse`（controller 按 app 名动态分发；无连字符无需转换）。
2. `servers/src/api/version/version.req.dto.ts` — `@IsIn([...])` 数组与 `app` 联合类型加 `'clickhouse'`（不加会被 ValidationPipe 400 拒绝）。
3. `servers/src/api/version/version.service.ts` — 加 `private ClickHouseModule: VersionClass` 声明与 `async clickhouse(dto)` 方法（照抄现有模块模板：懒加载 `import('./module/clickhouse')` 后走统一 `fetch()`）。
4. `servers/src/api/version/dto/version.dto.ts` — `app` 联合类型加 `'clickhouse'`（管理后台手工版本维护需要）。
5. 可选（管理后台"版本管理"页一致显示）：`client/src/views/version/manage/index.vue`、`client/src/views/version/manage/list.vue`、`client/src/api/version.ts` 三处加 `'clickhouse'`。

**部署前提**：Admin 改动需部署到 `api.one-env.com` 后桌面端才能看到在线版本
（Redis 缓存 6h，桌面端请求体带 `nocache: 'xpf0000'` 可跳缓存验证）。

## 5. 桌面端 fork 模块

新建 `src/fork/module/ClickHouse/index.ts`，`class ClickHouse extends Base`，`this.type = 'clickhouse'`。
整体照搬 `src/fork/module/Postgresql/index.ts` 的模式：

- `fetchAllOnlineVersion()`：调 `this._fetchOnlineVersion('clickhouse')`（`Base/index.ts:443`，POST api.one-env.com），随后为每项补全 `appDir`/`zip`/`bin`/`downloaded`/`installed` 本地字段。
- `installSoft(row)`：
  - Linux（tgz）：复用 `Base.installSoft`（下载 → 解压到 `app/clickhouse-{version}`，`bin` 指向解压出的 `clickhouse` 二进制）。
  - macOS（裸二进制）：自定义实现——下载到 `app/clickhouse-{version}/clickhouse`，`chmod 755`，`bin` 指向该文件。
- `brewinfo()`：返回 brew formula `clickhouse` 信息（macOS）。
- `allInstalledVersions(setup)`：扫描 `app/clickhouse-*` 目录 + brew 安装，版本号用 `bin --version` 解析。
- 首次启动生成配置（写入 `global.Server.ClickHouseDir`）：
  - `config.xml`：HTTP 端口 8123、Native 端口 9000、数据目录 `server/data/clickhouse`、日志目录；均为非特权端口，无需 root。
  - `users.xml`：`default` 用户、空密码、监听本机。
- `_startServer(version)`：`clickhouse server --config-file=<ClickHouseDir>/config.xml --pid-file=<pid路径>` 前台 spawn，复用 Postgresql 的 `serviceStartSpawn` 模式；pid 由 `Base.appPidFile('clickhouse')` 管理。
- `_stopServer(version)`：`Base` 通用实现（读 pid → SIGTERM）即可，ClickHouse 收到 SIGTERM 正常退出。
- `getConfigFiles(version)`：`config.xml`、`users.xml`（供 Conf 编辑器与 MCP `read_config`）。
- `getLogFiles()`：`server.log`、`server.err.log`。

## 6. 渲染端

新建 `src/render/components/ClickHouse/`：

- `Module.ts`：`moduleType: 'dataBaseServer'`（归入"数据库"侧栏分组）、`typeFlag: 'clickhouse'`、`label: 'ClickHouse'`、`platform: ['macOS', 'Linux']`、`isService: true`、`isTray: true`、`asideIndex` 排在 mongodb 之后。
- `Index.vue`：照搬 Postgresql 结构——Service / VersionManager / Config / Logs 四个 tab，全部复用通用组件（`ServiceManager/index.vue`、`VersionManager/index.vue`）。
- `aside.vue`：`AsideSetup('clickhouse')`。
- `clickhouse.ts`：模块 Pinia store，照搬 Postgresql。
- `src/render/svg/clickhouse.svg`：官方黄黑 logo 图标。

路由（`src/render/router/index.ts`）、侧栏分组、Setup 显隐、启动组、托盘状态均靠
`import.meta.glob('@/components/*/Module.ts')` 自动发现，零手工注册。

语言文件：不加专属 json（参照 postgresql 先例，label 直接用 `'ClickHouse'`；分组名 `aside.dataBaseServer` 已有现成翻译）。

## 7. 注册点清单（必改）

1. `src/render/core/type.ts` — `AppModuleEnum` 加 `clickhouse = 'clickhouse'`（无特权端口，**不**加 `AppWithRoot`）。
2. `src/fork/BaseManager.ts` — exec 分发链加 `else if (module === 'clickhouse')` 分支。
3. `src/fork/module/Version/index.ts`（约 93 行）— `allInstalledVersions` 分发链加分支。
4. `src/global.d.ts` — `ServerType` 加 `ClickHouseDir?: string`；`src/main/utils/ServerPath.ts` — `SetupGlobalPaths` 设置 `global.Server.ClickHouseDir = join(runpath, 'server/clickhouse')` 并加入 `createBaseDirectories`。
5. MCP（v1 纳入）：`src/main/core/mcpToolMetadata.ts`（flag 列表 + `MCP_DATABASE_FLAGS`）、`src/main/core/MCPTools.ts`（`SINGLE_INSTANCE_SERVICES` 与提示文案）、`src/main/core/MCPContextResolver.ts`（`DATABASE_FLAGS`）三处加 `clickhouse`。

## 8. 验证方案

项目无自动化测试体系，以手动验证为主，关键检查点：

1. Admin 本地起服务后：`POST /api/version/fetch {app:'clickhouse',os:'linux',arch:'x86'}` 返回多条版本且 URL 可下载；`os:'mac',arch:'arm'` 返回多条且 URL 指向 `clickhouse-macos-aarch64` 资产；`os:'win'` 返回空数组。
2. 桌面端 `yarn dev`：
   - Linux：在线安装任一版本 → 启动 → `curl http://127.0.0.1:8123/ping` 返回 `Ok.` → HTTP 接口执行 `SELECT 1` → 停止 → 托盘/侧栏状态正确。
   - macOS：在线安装任一版本（裸二进制流程）→ 同上验证；brew 源安装走现有 brew 流程。
3. 配置编辑器能打开并保存 `config.xml`/`users.xml`；日志页能看到 server.log。
4. Windows 构建下该模块不出现在侧栏与 Setup。

## 9. 明确不做（YAGNI）

- Windows 任何形式的支持（WSL2 / Podman 容器均留待后续迭代）
- 数据库管理、备份、密码修改 UI 等领域功能
- ClickHouse 集群/分片配置
- AI 助手专属任务（`src/render/components/AI/Fn/`）
- Admin 侧定时抓取（现有"按需实时抓取 + 缓存"模式不变）
- 模块专属语言文件

## 10. 风险与注意点

- **macOS 裸二进制与 Gatekeeper**：资产未做 Apple 公证，但通过 FlyEnv 内建下载器（非浏览器/LaunchServices）落盘的文件不带 `com.apple.quarantine` 属性，fork 进程直接 spawn 执行不触发 Gatekeeper 拦截，与 brew 安装行为一致。实现时需确保 `chmod 755`。
- **频道后缀与版本排序**：版本字符串带 `-stable`/`-lts` 后缀，`Base` 按 mVersion 分组排序时需确认后缀参与比较不会把同 minor 的 stable/lts 混为一组；老旧 tag 可能缺 macOS 资产，靠资产匹配 + HEAD 验证自然过滤。
- **GitHub API 限流**：Admin 走 `Base` 的 GitHub API（带 token），匿名限流 60 次/h，复用现有 token 机制即可，无新增成本。
- **Admin 需先部署**：桌面端发布节奏依赖 api.one-env.com 部署，否则在线列表为空（brew 源不受影响）。
- **资产体积**：单平台单版本约 150–170MB，下载耗时与进度提示走 `Base` 现有下载进度机制。
- **顺带发现的安全问题**：`FlyEnv-Admin/servers/src/api/version/request.ts` 内有明文硬编码的 GitHub token 已随仓库公开，建议尽快吊销轮换（与本需求无关，不纳入本次改动）。
