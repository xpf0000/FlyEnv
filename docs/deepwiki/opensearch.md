# OpenSearch 集成调研

> **调研主题**: OpenSearch 是否可集成为 FlyEnv 内置模块（对应 [issue #880](https://github.com/xpf0000/FlyEnv/issues/880)）
> **调研日期**: 2026-10-02
> **参考项目**: opensearch-project/OpenSearch
> **结论**: 可行性高，**以插件形式集成**（目录 `plugins/opensearch/`，参照现有 `plugins/kafka/` 骨架）。OpenSearch 与现有 Elasticsearch 模块几乎同构（JVM 服务、`config/` + `logs/` 布局、`-p` PID 文件参数），fork 端可参照 Elasticsearch 模块（约 253 行）和 kafka 插件（751 行）实现。做成插件后不受内置模块的版本数据源约束——插件自带版本抓取器，直接抓 `artifacts.opensearch.org`/GitHub tags，无需等 one-env API 加条目。主要缺口仍是 **macOS 无官方发行包**。建议第一期先覆盖 Linux/Windows 静态包安装与安全插件一键关闭，Dashboards 作为第二阶段。

---

## 结论摘要

OpenSearch 是 Elasticsearch 7.10 的 Apache 2.0 分支，官方在 `artifacts.opensearch.org` 提供 Linux x64/arm64 的 tar.gz/deb/rpm 和 Windows x64 的 zip，下载 URL 规则稳定、可直接拼接。它自带 bundled JDK，无需用户预装 Java；启动方式、配置文件布局（`opensearch.yml` / `jvm.options` / `log4j2.properties`）、日志目录、`-p <pid>` 参数都与 Elasticsearch 一致，正好是 FlyEnv 现有 Elasticsearch 模块的姊妹实现。

issue 作者希望的三点——版本管理、本地开发可关安全插件、可选 Dashboards——都有官方支持路径。安全插件可通过 `opensearch.yml` 中 `plugins.security.disabled: true` 关闭；Dashboards 是独立制品，可后续作为同一模块组下的第二个服务或独立模块提供。

主要约束：

- **macOS 无官方构建**。OpenSearch 官方制品只有 Linux 和 Windows；macOS 只能靠 Homebrew formula（已有 `opensearch` 3.9.0，仅见 Apple Silicon bottle，Intel Mac 需实测）或用户自行安装。可复用 kafka/ES 的 `brewinfo()` 路径。
- **版本列表由插件自带抓取器实现**。内置模块统一走的 `https://api.one-env.com/api/version/fetch` 对 `app=opensearch` 返回 `400 app 类型错误`（实测）；但插件不走这条路——参照 `plugins/kafka/fork/Kafka/version.ts` 继承 `OnlineVersionFetchBase` 的模式，OpenSearch 插件用 GitHub tags/releases API 取版本号，再按 `artifacts.opensearch.org` 的稳定 URL 规则拼接下载地址，完全不依赖服务端加条目。

官方资料：

- [OpenSearch 官网制品页（按版本）](https://opensearch.org/artifacts/by-version/)
- [OpenSearch 安装文档](https://docs.opensearch.org/latest/install-and-configure/install-opensearch/index/)
- [关闭 Security 插件官方文档](https://docs.opensearch.org/latest/security/configuration/disable-enable-security/)
- [opensearch-project/OpenSearch GitHub](https://github.com/opensearch-project/OpenSearch)
- [OpenSearch Dashboards GitHub](https://github.com/opensearch-project/OpenSearch-Dashboards)

---

## 发行方式与支持平台

官方制品统一托管在 `artifacts.opensearch.org`，URL 规则稳定（本次调研已逐一实测 HTTP 206 可下载，支持断点续传）：

```text
https://artifacts.opensearch.org/releases/bundle/opensearch/{version}/opensearch-{version}-linux-x64.tar.gz
https://artifacts.opensearch.org/releases/bundle/opensearch/{version}/opensearch-{version}-linux-arm64.tar.gz
https://artifacts.opensearch.org/releases/bundle/opensearch/{version}/opensearch-{version}-windows-x64.zip
https://artifacts.opensearch.org/releases/bundle/opensearch-dashboards/{version}/opensearch-dashboards-{version}-linux-x64.tar.gz
https://artifacts.opensearch.org/releases/bundle/opensearch-dashboards/{version}/opensearch-dashboards-{version}-windows-x64.zip
```

每个制品另有同名 `.sig` 签名文件，可用于校验。

| 平台 | 官方制品 | FlyEnv 集成方式 |
|---|---|---|
| Linux x64 | tar.gz / deb / rpm | 静态 tar.gz 下载，与 ES 模块一致的 `unpack` + `moveChildDirToParent` 流程 |
| Linux arm64 | tar.gz / deb / rpm | 同上 |
| Windows x64 | zip（`bin/opensearch.bat`） | zip 下载，对应 ES 模块 Windows 分支 |
| Windows arm64 | **无** | 不支持 |
| macOS（Apple Silicon / Intel） | **无官方构建** | Homebrew formula `opensearch`（当前 3.9.0；官方 bottle 仅见 arm64 macOS，Intel Mac 需实测），复用 ES 模块的 `brewinfo()`/`portinfo()` 路径；或用户手工安装后经本地版本扫描纳入 |

版本线：当前主线为 3.x（本次调研时最新 3.9.0，2026-09-29 发布），2.19.x 为维护线（最新 2.19.6）。按 `mVersion` 分组（3.9 / 3.8 / … / 2.19）即可套用现有版本管理 UI。

注意：**GitHub Releases 不挂二进制资产**（实测 `opensearch-project/OpenSearch` 最新 release `assets: 0`，只有源码），因此仓库里现成的 `OnlineVersionFetchBase.fetchFromGitHubReleases` 只能用来取版本号列表，下载 URL 需按上面的规则自行拼接。

另有 `opensearch-min` 制品（无安全特性的精简包，仅 Linux tar.gz）。官网对其有显著警示（"contains no security features … end users are not suggested to use"），且本次调研中按其命名规则拼接的 URL 返回 403，实际路径未确认。**不建议**把 min 包作为"免安全插件"的捷径；关安全插件用配置开关即可（见下文）。

---

## 服务与配置能力

启动方式与 Elasticsearch 完全同构：

```bash
# Linux / macOS（brew 安装）前台启动并写 PID
OPENSEARCH_HOME=<installDir> OPENSEARCH_PATH_CONF=<installDir>/config \
  bin/opensearch -p <pidPath>

# Windows
set "OPENSEARCH_HOME=..." & set "OPENSEARCH_PATH_CONF=..." & bin\opensearch.bat
```

对应 kafka 插件 `_startServer`（`plugins/kafka/fork/Kafka/index.ts:207-373`）的 Windows `serviceStartExecCMD` / Unix `serviceStartSpawn` 双分支模式；env 变量只需把 ES 模块的 `ES_HOME`/`ES_PATH_CONF` 换成 `OPENSEARCH_HOME`/`OPENSEARCH_PATH_CONF`。

- **bundled JDK**：tar.gz/zip 发行包内置 JDK，不依赖系统 Java，因此**不需要** kafka 插件那套 Java 绑定（`policy.ts`/`store.ts`/`startExtParam` 注入）。
- **配置文件**：`<path>/config/` 下 `opensearch.yml`、`jvm.options`、`log4j2.properties`，与 ES 模块 `getConfigFiles()` 的三个 tab 一一对应。端口（默认 HTTP 9200、性能分析 9600）写在 `opensearch.yml`，沿用"只展示/编辑配置、不代管端口"的现有模式即可。
- **日志**：`<path>/logs/` 下 `opensearch.log`、`opensearch_server.json`、`opensearch_deprecation.json`、`gc.log`。
- **进程识别**：插件 bundle 的 Base 副本不含 `opensearch` 条目，因此**不要**改基类表——像 kafka 一样在插件 fork 模块里重写两个钩子：`_stopSearchName()` 返回 `'org.opensearch.bootstrap.OpenSearch'`、`_stopSignal()` 返回 `'-TERM'`（参照 `plugins/kafka/fork/Kafka/index.ts:381-387`），停止逻辑完全复用基类 `_stopServer`。

### 关闭安全插件（issue 的核心诉求之一）

官方支持多档，建议 FlyEnv 提供"本地开发模式"开关，在首次安装后改写配置：

1. **推荐**：`opensearch.yml` 增加 `plugins.security.disabled: true`（[官方文档](https://docs.opensearch.org/latest/security/configuration/disable-enable-security/)）。纯 HTTP、无认证，适合本机开发。
2. tar.gz 发行包的 `config/opensearch.yml` 默认已带 demo 安全配置（自签名证书、TLS）；关闭安全时应一并移除/注释这些 demo 段，并跳过 demo 安装脚本（Docker 侧对应 `DISABLE_INSTALL_DEMO_CONFIG=true`，tar 包则是不运行 `install_demo_configuration` 相关配置）。
3. 2.12+ 在启用安全插件时首次启动要求设置初始管理员密码（tar 包通过 `OPENSEARCH_INITIAL_ADMIN_PASSWORD` 环境变量）；选择"关闭安全插件"可整体绕过该要求。
4. 也可 `./bin/opensearch-plugin remove opensearch-security` 彻底移除插件，但不可回退，不如配置开关灵活，不建议作为默认。

### OpenSearch Dashboards（可选，第二阶段）

Dashboards 是独立制品（Node 运行时，自带 bundled Node），默认端口 5601，配置 `config/opensearch_dashboards.yml`，日志 `<path>/logs/`。要点：

- 制品同样有 Linux tar.gz（x64/arm64）和 Windows zip，**无 macOS 官方构建**。
- 若 OpenSearch 侧关闭了安全插件，Dashboards 侧也必须移除对应插件：`bin/opensearch-dashboards-plugin remove securityDashboards`，否则会出现登录页/报错。
- 建议作为**第二个插件**（`plugins/opensearch-dashboards/`）或同一插件目录下的第二个 typeFlag，复用同一套生命周期；独立于 OpenSearch 插件更符合"一个模块管一个进程"的现有边界，也避免 Dashboards 的 Node 运行时拖累核心服务的发布。

---

## 在线版本列表如何获取（插件方案）

插件不使用内置模块的 `Base._fetchOnlineVersion()`（one-env API，实测对 `opensearch` 返回 `400 app 类型错误`）。参照 kafka 插件的 `OnlineVersionFetchBase` 子类模式（`plugins/kafka/fork/Kafka/version.ts`，它用 `fetchFromApacheCDN` 抓 Apache CDN），OpenSearch 插件自实现版本源：

1. 用 GitHub tags/releases API 取版本号列表（`opensearch-project/OpenSearch`；实测最新 release 二进制资产数为 0，tags 仅用于版本号），按 `mVersion` 分组（3.9 / 3.8 / … / 2.19）。
2. 按平台拼接下载 URL（规则见上文"发行方式与支持平台"，已实测可下载），并用 `OnlineVersionFetchBase` 现成的 URL 存活探测标记 `downloaded`/`installed`。
3. 每个条目补齐 `appDir`（`AppDir/opensearch/v{version}/`）、`zip`（`Cache/static-opensearch-{version}.tar.gz`，Win 为 `.zip`）、`bin`（`bin/opensearch` / `bin\opensearch.bat`），与 ES 模块 `fetchAllOnlineVersion`（`src/fork/module/Elasticsearch/index.ts:103-134`）的补全逻辑一致。

macOS 走 `brewinfo()`（formula `opensearch`，当前 3.9.0，仅见 Apple Silicon bottle）+ 本地扫描兜底，同 ES 模块的 mac 路径。

---

## FlyEnv 现有基础与插件结构

整体参照 `plugins/kafka/`（骨架最完整的现有插件），fork 模块本体大量借鉴内置 `src/fork/module/Elasticsearch/index.ts`（253 行）：

```text
plugins/opensearch/
├── plugin.json                 # 清单：apiVersion 1、id=opensearch、module{typeFlag, moduleType:'searchEngine', ...}、entry{render, fork}
├── lang/{en.ts, zh.ts, index.ts}   # 插件侧字典 + createT(getLocale) 工厂（"本地开发模式"等插件专属文案；通用文案直接用宿主 I18nT）
├── fork/
│   ├── index.ts                # 入口：import OpenSearch from './OpenSearch'; export default
│   ├── lang.ts                 # 用 @lang/runtime 的 AppI18n 绑定（须防御旧宿主）
│   └── OpenSearch/
│       ├── index.ts            # extends Base，this.type='opensearch'；_startServer/_stopSearchName/_stopSignal/fetchAllOnlineVersion/allInstalledVersions/_installSoftHandle/getConfigFiles/getLogFiles
│       └── version.ts          # OnlineVersionFetchBase 子类：GitHub tags + artifacts.opensearch.org URL 拼接
└── render/
    ├── Module.ts               # AppModuleItem：typeFlag/label/icon(defineAsyncComponent 懒加载 index & aside)
    ├── lang.ts                 # 用 @lang/index 的 AppI18n 绑定
    ├── Index.vue               # tabs = Service / VersionManager / Config(opensearch.yml/jvm.options/log4j2.properties) / Logs，直接用宿主 ServiceManager/VersionManager/Conf/Log 组件（构建时桥接）
    ├── aside.vue               # AsideSetup + AppServiceModule 注册；无需 startExtParam（bundled JDK）
    ├── Config.vue / Logs.vue
    ├── store.ts                # 模块本地单例（reactiveBind + StorageGet/SetAsync）："本地开发模式"开关等设置
    └── opensearch.svg
```

关键机制（插件路径下**不需要**改动的宿主代码）：

- **fork 分发**：`src/fork/BaseManager.ts:648-655` 内置模块不匹配时兜底走 `PluginLoader.load(module)`，插件默认导出的 Base 子类直接参与调度，无需注册表。render 端照常 `IPC.send('app-fork:opensearch', ...)`。
- **renderer 加载**：`src/render/core/Plugin.ts` 把 render 产物包成 Blob URL 动态 import 进 `AppModules`；宿主运行时包（vue/element-plus/IPC/ASide/ServiceManager 等）经 `__FLYENV_PLUGIN_HOST__` 桥接。
- **构建**：`yarn plugin:dev opensearch`（构建到 `tmp/plugins/` 并以 `FLYENV_PLUGIN_PATH` 启动 FlyEnv 调试）、`yarn plugin:build opensearch`（产物 `dist/plugins/opensearch/`，`--archive` 打成 `.flyenv-plugin` 并自动 upsert `plugins/registry.json`）。
- **安装/更新**：Plugin Market 从 registry 条目 `artifact.url` 下载 7z 归档，SHA-256 校验 + installToken 安全门，用户侧无需任何手动目录操作。
- **typeFlag 唯一性**：PluginManager 拒绝重复 typeFlag；与内置 `elasticsearch` 不冲突，可共存。

实现注意点（参照 `plugins/README.md` 的既有约定）：

- `allInstalledVersions` 里必须先清 `versionDirCache`（README 明确要求）；本地扫描用 `versionLocalFetch` 搜 `opensearch(.bat)`，版本号从 `bin/opensearch --version` 输出正则取（`Version: x.y.z` 格式同 ES）。
- `_installSoftHandle`：Windows `zipUnpack`，其余平台 `super._installSoftHandle` + `moveChildDirToParent`（OpenSearch 包内同样有一层顶层目录需摊平）。
- "本地开发模式"开关：状态存插件 render 侧 `store.ts`（`StorageSetAsync`/`StorageGetAsync`，不新建 Pinia、不进 `config.setup`）；勾选后对当前版本执行一次性配置改写（见上文"关闭安全插件"四档中的 1+2），并提示重启服务生效。启停完全复用 `ModuleInstalledItem.start()/stop()`。
- 生命周期与清理：遵循 AGENTS.md 的模块边界——fork 模块拥有进程/PID/端口真相，render 页只绑定状态；安装/下载进度走基类回调。

---

## 数据与许可

- OpenSearch 与 OpenSearch Dashboards 均为 **Apache 2.0**，再分发官方制品无许可证障碍。插件需附带 LICENSE 声明（Plugin Market 安装时强制 license 校验，参照 `plugins/README.md` 发布 checklist）。
- 目录布局沿用 FlyEnv 惯例：`AppDir/opensearch/v{version}/` 为程序目录，`Cache/static-opensearch-{version}.tar.gz`（Win 为 `.zip`）为下载缓存；数据、配置、日志默认在版本目录内（与 ES 模块一致），用户换版本时数据目录隔离，需要在插件页提示。卸载插件默认不清除这些数据。

## 主要风险

- **macOS 缺口**：无官方构建，Homebrew 仅确认 Apple Silicon bottle；Intel Mac 体验和"无 brew 用户"场景需要降级为"手工安装 + 本地扫描纳入"。这是与 ES 模块体验差距最大的一点，应在插件页明示。
- **版本源的外部依赖**：GitHub tags API 有匿名限流（60 次/小时/IP)——宿主 renderer 的 `fetchVerion` 已对版本列表做 localStorage 缓存（TTL 1 小时），插件无需自实现缓存，限流风险很低；`artifacts.opensearch.org` 的 URL 规则若未来变更，存活探测会整体失败，需给出降级提示（可手动安装后经本地扫描纳入）。
- **demo 安全配置差异**：tar 包默认带 TLS + demo 证书，与 ES 近年默认体验不同；"本地开发模式"开关的实现要覆盖移除 demo TLS 段、`plugins.security.disabled`、Dashboards 插件移除三处，否则用户会遇到 9200 走 HTTPS、Dashboards 卡登录页等经典问题。
- **min 包误导**：官网明确不建议终端用户使用 min 包且 URL 未确认，不要把它当作"无安全版"暴露给用户。
- **2.x/3.x 配置差异**：初始管理员密码、安全插件行为在 2.12 前后有变化，配置模板需按大版本区分。
- **插件打包约束**：fork 端只能 import `@fork/*`、`@shared/*` 和宿主桥接清单内的模块（见 `plugins/README.md` 引用规则）；不要 import 内置 `Elasticsearch` 模块本体，需要的逻辑复制进插件。

## 最终判断

OpenSearch 适合以**插件**形式集成进 FlyEnv：`plugins/opensearch/`，骨架照抄 kafka，服务逻辑照抄内置 Elasticsearch 模块，版本源自带（GitHub tags + artifacts.opensearch.org 拼接），不依赖 one-env API 加条目，也不动任何内置模块代码。建议分两期：

1. **第一期（`plugins/opensearch`）**：Linux x64/arm64 + Windows x64 静态包安装、版本管理、启停、配置/日志 tab、"本地开发模式（关闭安全插件）"开关；macOS 走 Homebrew/本地扫描。
2. **第二期（`plugins/opensearch-dashboards`，可选）**：Dashboards 独立插件，与安全插件开关联动处理 `securityDashboards` 插件移除。

发布流程：`yarn plugin:build opensearch --archive` 自动重算 sha256 并 upsert `plugins/registry.json`，填 `artifact.url` 上传归档后用户即可在 Plugin Market 安装。
