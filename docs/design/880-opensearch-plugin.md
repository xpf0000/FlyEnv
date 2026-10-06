# #880 OpenSearch 插件 — 集成设计

> 目标:以**插件**形式(`plugins/opensearch/`)为 FlyEnv 增加 OpenSearch 服务管理,
> 对应 [issue #880](https://github.com/xpf0000/FlyEnv/issues/880)。
> 调研依据:[docs/deepwiki/opensearch.md](../deepwiki/opensearch.md)。
> 形态参照:`plugins/kafka/`(骨架)、`src/fork/module/Elasticsearch/index.ts`(服务逻辑)。

## 1. 背景与结论先行

**结论:骨架照抄 kafka 插件,服务逻辑照抄内置 Elasticsearch 模块,版本源复用 `OnlineVersionFetchBase.fetchFromGitHub`,不改任何宿主代码。**

issue #880 需求逐条映射:

| # | issue 原文要点 | 方案落点 |
| --- | --- | --- |
| 1 | Version management(版本管理) | §5.2 版本源(基类 `fetchFromGitHub` + artifacts.opensearch.org URL 拼接)+ 宿主 VersionManager 组件 |
| 2 | Option to disable the security plugin(可关安全插件) | §7「本地开发模式」开关,fork 侧改写 `opensearch.yml` |
| 3 | Optional OpenSearch Dashboards support(可选 Dashboards) | 第二期独立插件 `plugins/opensearch-dashboards/`,见 §10 |

为什么做成插件而不是内置模块(已确认的方向):

- 插件自带版本抓取器,**绕开** `api.one-env.com` 没有 `opensearch` 条目的前置依赖(实测返回 `400 app 类型错误`)。
- 不改内置模块清单、不改基类公共表、不注册 `AppModuleEnum`,宿主代码零改动。
- fork 分发兜底(`src/fork/BaseManager.ts:648-655` → `PluginLoader.load`)和 renderer 动态加载(`src/render/core/Plugin.ts`)都已支持,`IPC.send('app-fork:opensearch', ...)` 直接可用。

## 2. 现有架构关键事实(集成依据)

### 2.1 插件骨架(以 kafka 为范本)

```text
plugins/opensearch/
├── plugin.json               # apiVersion 1,id/version/module{typeFlag,moduleType,...}/entry{render,fork}
├── lang/
│   ├── en.ts / zh.ts         # 插件侧字典
│   └── index.ts              # createOpenSearchT(getLocale) 工厂(精确 locale → 基础语言 → en → key)
├── fork/
│   ├── index.ts              # 入口:import OpenSearch from './OpenSearch'; export default
│   ├── lang.ts               # @lang/runtime AppI18n 绑定(须 `AppI18n?.()?.global?.locale ?? 'en'` 防御旧宿主)
│   └── OpenSearch/
│       ├── index.ts          # 模块本体,extends Base(从 @fork/module/Base 导入,构建时打包进插件)
│       ├── version.ts        # OnlineVersionFetchBase 子类:在线版本源
│       └── security.ts       # 「本地开发模式」配置改写(见 §7)
└── render/
    ├── Module.ts             # AppModuleItem(defineAsyncComponent 懒加载 index/aside)
    ├── lang.ts               # @lang/index AppI18n 绑定
    ├── Index.vue             # tabs = Service / VersionManager / Config×3 / Logs
    ├── aside.vue             # AsideSetup + AppServiceModule 注册
    ├── Config.vue / Logs.vue
    ├── store.ts              # 模块本地单例(reactiveBind + StorageGet/SetAsync)
    └── opensearch.svg
```

### 2.2 可复用的宿主能力

| 能力 | 来源 | 用法 |
| --- | --- | --- |
| 服务启停/PID/进度 | fork `Base`(`src/fork/module/Base/index.ts`) | `installSoft`(`:513`,含下载/进度/失败清理)、`_stopServer`(`:315`,经钩子定制)、`startService` 自动 `saveAppPid` |
| 进程启动原语 | `@fork/util/ServiceStart` / `@fork/util/ServiceStart.win`(经 `@fork/Fn` 再导出,**不是 Base 成员**) | `serviceStartSpawn`(Unix)/`serviceStartExecCMD`(Windows),kafka 导入先例 `Kafka/index.ts:26` |
| 本地版本扫描 | `@fork/Fn`(定义在 `src/fork/util/Version.ts`) | `versionLocalFetch`(`Version.ts:352`)、`versionBinVersion`(`:164`,经 `TaskQueue.run` 排队调用);扫描前先清 `versionDirCache`(普通对象,`for...delete` 循环,见 §5.1) |
| 版本抓取基类 | `src/fork/util/OnlineVersionFetch/base.ts` | `OnlineVersionFetchBase.fetchFromGitHub`(`:78-128`):tags 抓取/过滤/mVersion 分组/URL 存活探测/降序排序全部内建;kafka 用 `fetchFromApacheCDN` 为先例 |
| 页面组件 | 宿主桥接(`__FLYENV_PLUGIN_HOST__`) | `ServiceManager`、`VersionManager`、`Conf`、`Log` 组件直接 import,构建时桥接不打包 |
| 生命周期 | render `ModuleInstalledItem` | `start()/stop()/restart()`;本插件无额外启动参数(bundled JDK),**不需要** `startExtParam` |
| 模块状态持久化 | `StorageSetAsync`/`StorageGetAsync` | render `store.ts`;不新建 Pinia、不进 `config.setup` |
| 构建发布 | `scripts/plugin-builder.ts` | `yarn plugin:dev opensearch` 调试;`yarn plugin:build opensearch` 出包(默认即 minify + archive + upsert `plugins/registry.json`) |

### 2.3 与内置 Elasticsearch 模块的逻辑对应

| ES 模块(`src/fork/module/Elasticsearch/index.ts`) | OpenSearch 插件 |
| --- | --- |
| `this.type = 'elasticsearch'` | `this.type = 'opensearch'` |
| env `ES_HOME`/`ES_PATH_CONF` | env `OPENSEARCH_HOME`/`OPENSEARCH_PATH_CONF` |
| bin `elasticsearch`/`elasticsearch.bat`,参数 `-p <pidPath>` | bin `opensearch`/`opensearch.bat`,同样 `-p <pidPath>` |
| `_fetchOnlineVersion('elasticsearch')`(one-env API) | 自带 `version.ts`(§5.2) |
| 基类表 `_stopSearchName`/`_stopSignal` 内置 ES 条目 | 插件内重写钩子:`_stopSearchName()`→`'org.opensearch.bootstrap.OpenSearch'`,`_stopSignal()`→`'-TERM'`(参照 `plugins/kafka/fork/Kafka/index.ts:381-387`;**不改基类**) |
| `getConfigFiles`:elasticsearch.yml/jvm.options/log4j2.properties | opensearch.yml/jvm.options/log4j2.properties |
| `getLogFiles`:elasticsearch.log 等 4 个 | opensearch.log/opensearch_server.json/opensearch_deprecation.json/gc.log |
| `_installSoftHandle`:Win `zipUnpack`,其余 `super` + `moveChildDirToParent` | 相同(OpenSearch 包同样有一层顶层目录) |
| 自实现 `brewinfo()`/`portinfo()`(不在 Base 上,ES 模块自有,`Elasticsearch/index.ts:195-223`) | 同样自实现 `brewinfo()`(formula `opensearch`) |

## 3. 决策记录

| # | 决策 | 理由 |
| --- | --- | --- |
| D1 | 插件而非内置模块 | 绕开 one-env API 依赖;宿主零改动;kafka/llamacpp 已有先例 |
| D2 | 版本源 = 基类 `fetchFromGitHub` + `artifacts.opensearch.org` URL 拼接 | 官方制品 URL 规则稳定(调研已实测 206);GitHub releases 无二进制资产(assets:0),tags 仅取版本号;分组/探测/排序复用基类,不自写 |
| D3 | 关安全插件用 `plugins.security.disabled: true` + 清理 demo TLS 配置,**不用** opensearch-min 包 | 官方明确警示 min 包不建议终端用户使用,且其 URL 未确认可下载 |
| D4 | macOS 走 `brewinfo()` + 本地扫描,不提供静态包 | 官方无 macOS 构建;brew formula 仅确认 Apple Silicon bottle |
| D5 | Dashboards 为第二期独立插件 | 一个模块管一个进程;Node 运行时与 JVM 服务发布节奏不同 |
| D6 | 「本地开发模式」开关状态存插件 render `store.ts` | AGENTS.md 新模块约束:`StorageSetAsync`,不进 `config.setup`,不建 Pinia |
| D7 | 安装/下载/启停完全复用基类与 `ModuleInstalledItem` | ES 模块先例证明无需自定义工作流;无例外授权需求 |

**例外授权记录**:无。默认模块约束全部满足(不碰 `config.setup`、不建 Pinia、复用共享生命周期、模块私有逻辑不出插件目录)。

## 4. plugin.json

```jsonc
{
  "apiVersion": 1,
  "id": "opensearch",
  "name": "OpenSearch",
  "version": "0.1.0",
  "author": "FlyEnv",
  "description": {
    "en": "OpenSearch search & analytics engine (Apache 2.0 fork of Elasticsearch).",
    "zh": "OpenSearch 搜索与分析引擎(Elasticsearch 的 Apache 2.0 分支)。"
  },
  "module": {
    "typeFlag": "opensearch",
    "moduleType": "searchEngine",
    "label": "OpenSearch",
    "asideIndex": 4,                 // 紧随内置 Elasticsearch(asideIndex 3)
    "isService": true,
    "isTray": true,
    "platform": ["Windows", "macOS", "Linux"]   // 合法值仅这三种写法,校验见 PluginManifest.ts:133-140
  },
  "entry": { "render": "render/Module.ts", "fork": "fork/index.ts" }
}
```

`typeFlag` 全局唯一(PluginManager 拒绝重复),与内置 `elasticsearch` 共存。

注意:`FlyEnvPluginManifest` **没有 license 字段**(`src/shared/plugin/PluginManifest.ts:42-65`),不要加;Plugin Market 安装时强制的是 FlyEnv 商业许可校验(`verifyLicenseCode`),与插件的软件许可证无关。

## 5. Fork 端设计

### 5.1 模块本体 `fork/OpenSearch/index.ts`

`class OpenSearch extends Base`,`this.type = 'opensearch'`,`init()` 设 PID 路径 `global.Server.BaseDir + 'opensearch/opensearch.pid'`。

- **`_startServer(version)`**:Windows `serviceStartExecCMD`(cmd `set "OPENSEARCH_HOME=..."` 语法),mac/Linux `serviceStartSpawn`(env 对象);args `['-p', this.pidPath]`;启动前 `mkdirp(BaseDir/opensearch)`。结构照抄 ES 模块 `:36-101`;启动原语从 `@fork/Fn` 导入(非 Base 成员)。
- **停止**:不重写 `_stopServer`;重写 `_stopSearchName()`/`_stopSignal()` 两个钩子。
- **`allInstalledVersions`**:先清缓存——`versionDirCache` 是普通对象(`src/fork/util/Version.ts:204`),**没有 `.clear()` 方法**,照抄 kafka 的 `for (const k in versionDirCache) delete versionDirCache[k]`(`Kafka/index.ts:517-519`);再 `versionLocalFetch(dirs, binName, 'opensearch', binPaths)` 扫描;版本号经任务队列探测:`TaskQueue.run(versionBinVersion, bin, '"<bin>" --version', /(Version: )(\d+(\.\d+){1,4})(.*?)/g)`(ES 先例 `Elasticsearch/index.ts:151-155`,返回 `{version, error}`,取捕获组 2;**不要**直接调 `versionBinVersion(bin, regex)`——签名是 `(bin, command, reg, findInError?, timeoutMs?)`,且绕过队列);`brewinfo()` 补 mac brew 安装源。
- **`_installSoftHandle(row)`**:Win `zipUnpack`;其余 `super._installSoftHandle` + `moveChildDirToParent`(均从 `@fork/Fn` 导入)。
- **Homebrew 布局解析(`fork/OpenSearch/homebrew.ts`)**:brew 安装的 `version.path` 形如 `/opt/homebrew/Cellar/opensearch/<v>`,其 `bin/opensearch` 是 wrapper(自设 `JAVA_HOME` 后 exec `libexec/bin/opensearch`,brew 版无 bundled JDK),真实 home 是 `<path>/libexec`,`libexec/config` 是指向 `/opt/homebrew/etc/opensearch` 的符号链接。
  - `resolveHome(path)`:`existsSync(join(path, 'libexec/bin/opensearch'))` → `join(path, 'libexec')`,否则原样返回 `path`。
  - `resolveConfDir(path)` = `join(resolveHome(path), 'config')`。
  - `resolveLogsDir(path)`:读 `resolveConfDir(path)/opensearch.yml`,正则取 `^path.logs:\s*(.+)$`(去引号去尾空格),取不到回退 `join(resolveHome(path), 'logs')`。
  - `resolveClusterName(path)`:同理解析 `^cluster.name:\s*(.+)$`,默认 `opensearch`;主日志为 `<logsDir>/<clusterName>.log`。
  - `_startServer` 的 env 用 `OPENSEARCH_HOME=resolveHome(version.path)`、`OPENSEARCH_PATH_CONF=resolveConfDir(version.path)`;spawn 的 bin 仍用 `version.bin`(wrapper 自设 JAVA_HOME)。`getConfigFiles`/`getLogFiles`/`security.ts` 的 devMode 改写目标同样走上述解析。
- **`getConfigFiles()`/`getLogFiles()`**:见 §2.3 对应表(路径经 brew 布局解析)。
- **`applyDevMode(version, enable)`** 与 **`fetchDevModeState(version)`**:安全插件开关的 fork 侧命令(见 §7);IPC 动态分发是现成的(`Base.exec`),kafka 的 `fetchTopics/createTopic` 即先例。

### 5.2 版本源 `fork/OpenSearch/version.ts`

`class OpenSearchVersionFetch extends OnlineVersionFetchBase`,直接调基类 `fetchFromGitHub`(`base.ts:78-128`)——tags 抓取、版本过滤、`mVersion` 分组(每组取第一个 URL 存活的版本)、降序排序全部内建,**不自写 fetch/分页/探测**:

```ts
this.fetchFromGitHub(
  'opensearch-project/OpenSearch',
  (tag) => tag.name.match(/^\d+\.\d+\.\d+$/)?.[0] ?? '',   // versionFetch:只保留正式版本 tag
  2,                                                        // mvLength:mVersion = 前两段(3.9 / 2.19)
  (version) => urlFor(version),                             // urlFetch:按平台拼接(见下)
  '2.19.0'                                                  // minVersion:覆盖 2.19.x 维护线
)
```

平台 URL(调研实测可下载、支持断点续传):

```text
linux x64:   https://artifacts.opensearch.org/releases/bundle/opensearch/{v}/opensearch-{v}-linux-x64.tar.gz
linux arm64: https://artifacts.opensearch.org/releases/bundle/opensearch/{v}/opensearch-{v}-linux-arm64.tar.gz
win x64:     https://artifacts.opensearch.org/releases/bundle/opensearch/{v}/opensearch-{v}-windows-x64.zip
```

已知局限:`fetchFromGitHub` 只取 tags 第 1 页(GitHub 把 `per_page` 钳到 100)。OpenSearch 3.x 与 2.19.x 维护线均为近期 tag,page 1 足够;若实测覆盖不到 2.19.x,再评估——那是基类共有局限,不在插件内自写分页。

每个条目补全 `appDir`(`AppDir/opensearch/v{v}`)、`zip`(`Cache/static-opensearch-{v}.tar.gz`,Win `.zip`)、`bin`(`bin/opensearch`/`bin\opensearch.bat`)、`downloaded`/`installed`/`name`,与 ES 模块 `:108-127` 一致。

**限流与降级**:本插件**不需要自实现缓存**。宿主通用的版本列表缓存在 renderer:`src/render/util/Brew.ts` 的 `fetchVerion(typeFlag)`(由 `AppModuleSetup.fetchStatic()` 调用,Version Manager 走这条链路)以 `localStorage` key `fetchVerion-<typeFlag>` 缓存结果,TTL 1 小时,命中缓存时还会用 `fs.existsSync` 刷新每项的 `downloaded`/`installed`。它按 typeFlag 拼 IPC(`app-fork:<typeFlag>`),对插件 typeFlag 同样生效。因此 fork 侧每次被调用都直接抓新数据即可——前端缓存保证 1 小时内至多一次请求,远低于 GitHub 匿名限流(60 次/小时/IP)。GitHub 不可达/429 时 fork 返回错误,`fetchVerion` 走既有 `MessageError` + 空列表分支,用户稍后重试;也可手动下载放入 `AppDir/opensearch/` 后经本地扫描纳入。artifacts.opensearch.org 规则未来若变,存活探测会整体失败,走同一降级路径。

### 5.3 安装与目录

完全复用基类 `installSoft`(下载 + 进度回调 + 失败清理 zip+appDir)。目录:

```text
AppDir/opensearch/v{version}/          # 程序(内含 config/ logs/ data/,bundled JDK)
Cache/static-opensearch-{version}.tar.gz   # 下载缓存(Win 为 .zip)
BaseDir/opensearch/opensearch.pid      # PID
```

(`BaseDir`/`AppDir`/`Cache` 定义见 `src/main/utils/ServerPath.ts:106-120`,由主进程广播进 fork。)

数据默认在版本目录内(与 ES 模块一致),换版本即数据隔离;在插件页提示,卸载插件不清除上述目录。

## 6. Render 端设计

### 6.1 页面

`Index.vue` tabs(全部用宿主组件,构建时桥接):

| Tab | 组件 | 说明 |
| --- | --- | --- |
| Service | `ServiceManager` | 启停/当前版本 |
| Version Manager | `VersionManager` | 在线版本(静态包)+ brew + 本地扫描;macOS 无官方包,`:has-static="!isMacOS"`,且清掉内存中残留的 `LibUse['opensearch']='static'` 选中态 |
| Config | `Conf` | 单配置页:页头 `el-radio-group` 切换 opensearch.yml / jvm.options / log4j2.properties(模式参照 `src/render/components/ClickHouse/Config.vue`,编辑器用桥接的 `@/components/Conf/index.vue`,`:key="current"` 按文件重建) |
| Logs | `Log` | `<path.logs>/<cluster.name>.log`(解析 brew 布局与 yml) |

配置页照抄 ES 模式的合并版:一个本地 `Config.vue` 包装组件包桥接的宿主 `Conf`(自带编辑、保存、load default/custom 全套,render 侧经 `@/util/NodeFn` 写文件,fork 侧零代码)。**取当前版本用 `BrewStore().currentVersion('opensearch')`**(kafka `Config.vue:23-25` 先例),不要照抄 ES 的 `appStore.config.server[flag].current`(那会要求往 `config.setup` 里加模块状态,违反默认约束)。文件路径先 `fs.existsSync(join(path, 'libexec/config', current))`(`@/util/NodeFn` 的 render 侧 fs,kafka `Logs.vue` 有先例)判断 brew 布局,取 `libexec/config` 或 `config`。

`aside.vue`:`AsideSetup('opensearch')` + 注册进 `AppServiceModule`;不覆写 `startExtParam/stopExtParam`。

### 6.2 「本地开发模式」开关(UI)

宿主 `Conf` 组件支持 `showCommond` 时提供 default(原始文件)/common(快捷设置)切换和 `#common` 插槽。开关放在插件 `Config.vue` 的 `<template #common>` 里,仅 `opensearch.yml` 显示(`:show-commond="current === 'opensearch.yml'"`):一个 `el-switch` + 说明文案。

- 绑定 `store.ts` 的 `devMode`(按当前版本 `path` 记忆,不同版本独立)。
- 切换 → 调 `IPC.send('app-fork:opensearch', 'applyDevMode', version, enable)` → 成功后调 `conf.value.update()` 让 raw 编辑器同步磁盘最新内容,并提示「重启服务生效」,在服务运行中时提供一键 restart(走 `ModuleInstalledItem.restart()`)。
- 状态读取:页面挂载/切换版本/切入 common 视图(`@on-type-change`)时 `fetchDevModeState(version)` 从 `opensearch.yml` 实际内容解析(以文件为准,不轻信本地缓存)。

### 6.3 状态归属(AGENTS.md 模块边界)

| 状态 | 归属 |
| --- | --- |
| tab 选中、对话框、版本选择 | 挂载中的 Vue 组件 |
| `devMode` 设置(按版本) | 插件 render `store.ts`(`reactiveBind` 单例,`StorageSetAsync` 持久化) |
| 在线版本列表缓存 | **宿主共享机制**:`fetchVerion` 的 `localStorage` 缓存(TTL 1 小时),插件零代码 |
| 服务进程、PID、端口、存活 | fork 模块(进程真相);renderer 不用 `running` 标志代表真实状态 |
| 已装版本列表、公共设置 | 宿主既有 BrewStore/ AppStore |

## 7. 「本地开发模式」(关闭安全插件)详细方案

fork 侧 `security.ts` 对 `<path>/config/opensearch.yml` 做**幂等**改写。fork 侧没有现成的"配置行改写"通用工具(既有先例只有模板生成整文件,如 kafka `initConfig`),逐行注释方案是必要的新代码;yml 解析库(如 render 侧的 yamljs)不保注释,不适用。

**开启(enable)**:

1. 追加 `plugins.security.disabled: true`。
2. 注释/移除 tar 包自带的 demo 安全段:`plugins.security.ssl.transport.*`、`plugins.security.ssl.http.*`、`plugins.security.allow_default_init_securityindex`、`plugins.security.authcz.admin_dn`、`plugins.security.*dn*` 等(以 `plugins.security.` 前缀匹配,逐行注释而非删除,便于回滚)。
3. 2.12+ 无需再处理初始管理员密码(安全关闭后不再要求)。

**关闭(disable)**:移除 `plugins.security.disabled` 行、取消注释 demo 段;提示用户首次启动需设置 `OPENSEARCH_INITIAL_ADMIN_PASSWORD`(2.12+)。

**状态判定**:`fetchDevModeState` 解析 yml:存在未注释的 `plugins.security.disabled: true` → devMode=on。

Dashboards 联动:第一期不做;文档中写明「若自行安装 Dashboards,需同步 `bin/opensearch-dashboards-plugin remove securityDashboards`」。

## 8. 操作契约(长时操作)

| 操作 | Owner | 开始事件 | 中间事件 | 终止事件 | 重复调用 | 生命周期测试 |
| --- | --- | --- | --- | --- | --- | --- |
| 版本安装/下载 | 基类 `installSoft`(fork) | render 点安装 | `APP-On-Log` 进度 | ForkPromise resolve/reject | 基类按行锁定,重复点击忽略 | 下载中断清理 zip+appDir |
| 服务启停 | `ModuleInstalledItem` + fork 模块 | `start()/stop()` | PID 等待 | ForkPromise 终态 | `startSingleFlight` 单飞 | 停服后 `org.opensearch.bootstrap.OpenSearch` 进程消失 |
| applyDevMode | fork 命令;render 侧由 `store.ts` 持有进行中状态 | switch 切换 | 无(快操作) | resolve/reject + notice | 进行中禁用 switch(重入保护) | 重复切换幂等;yml 改写后内容符合预期;页面卸载重进状态仍从文件解析 |
| 版本列表抓取 | fork `version.ts` | VersionManager 打开 | 无 | resolve(列表)/reject(错误) | 前端 `fetchVerion` localStorage 缓存 TTL 内不发 IPC | 缓存命中时不发请求(DevTools 观察);模拟 GitHub 429 → 既有 `MessageError` + 空列表分支 |

通用规则:仅在声明的终止事件清理 renderer 操作状态;`code:200` 进度事件非终止。

## 9. i18n

- 通用文案(Service/Version Manager/Logs tab 名等)直接用宿主 `I18nT('base.*')`。
- 插件专属文案(「本地开发模式」开关说明、安全插件提示、降级报错)放 `plugins/opensearch/lang/{en,zh}.ts`,两侧 `lang.ts` 分别用 `@lang/index`、`@lang/runtime` 绑定。首版只做 en/zh,回退链兜底其余语言。

## 10. 第二期:OpenSearch Dashboards(范围外,仅预留)

独立插件 `plugins/opensearch-dashboards/`(typeFlag `opensearch-dashboards`):Node 服务(自带 bundled Node),bin `bin/opensearch-dashboards(.bat)`,配置 `config/opensearch_dashboards.yml`,默认端口 5601。安装时若检测到 OpenSearch devMode=on,自动执行 `bin/opensearch-dashboards-plugin remove securityDashboards`。无 macOS 官方构建,同 D4。

## 11. 构建、调试与发布

```bash
yarn plugin:dev opensearch        # 构建到 tmp/plugins/opensearch,FLYENV_PLUGIN_PATH 启动调试
yarn plugin:build opensearch      # 默认即 minify + 打 opensearch-<version>.flyenv-plugin + upsert plugins/registry.json(sha256 重算)
yarn plugin:build:all             # 构建全部插件
yarn plugin:runtime-smoke         # 运行时冒烟
```

注意:`plugin:build` 的 CLI 只认 `<name>` 和 `--all`,**没有 `--archive` 参数**(`scripts/plugin-builder.ts:379-411`)。

发布:填 registry 条目 `artifact.url` → 上传归档 → 用户在 Plugin Market 安装(SHA-256 + installToken 校验由宿主保证;另有 FlyEnv 商业许可校验,与插件软件许可证无关)。

## 12. 验证计划

1. **fork 单测/脚本**:版本源解析(mock GitHub tags + URL 探测,验证 `fetchFromGitHub` 返回的分组/排序);`security.ts` 对真实 tar 包自带 `opensearch.yml` 的幂等改写(开→关→开,内容 diff 符合预期)。
2. **运行时冒烟(Linux x64)**:`plugin:dev` 启动 → 安装 3.9.0 → 启动服务 → `curl localhost:9200` 返回 cluster JSON → 开 devMode → 重启 → `curl http://localhost:9200` 无认证可访问 → 停止 → 进程与 PID 清理。
3. **Windows**:zip 安装、启停、devMode(2.12+ 密码提示路径)。
4. **macOS(Apple Silicon)**:brew 路径识别、启停;无 brew 时本地扫描纳入手工安装。brew 启动用例:`OPENSEARCH_HOME=/opt/homebrew/Cellar/opensearch/<v>/libexec OPENSEARCH_PATH_CONF=.../libexec/config <v>/bin/opensearch -p <pid>` 起服务,`curl -s localhost:9200` 返回 cluster JSON(brew 版无 security 插件,直接可访问),验证 `resolveHome/resolveConfDir` 与实际布局一致。
5. **插件管理**:构建归档 → 本地 registry 安装 → 启停 → 更新版本 → 卸载(数据目录保留)。

## 13. 风险与开放问题

| 风险 | 缓解 |
| --- | --- |
| macOS 无官方包,Intel Mac 无 bottle | 页面明示;brew + 手工扫描兜底 |
| GitHub tags 限流 | 前端 `fetchVerion` 共享缓存(1 小时至多一次请求)+ 既有错误分支(§5.2) |
| `fetchFromGitHub` 只取 tags 第 1 页 | 3.x 与 2.19.x 均为近期 tag,足够;不足时再评估(基类共有局限) |
| artifacts URL 规则未来变更 | 存活探测失败时降级;插件可独立发版修复,不等宿主 |
| 2.x/3.x demo 配置段差异 | `security.ts` 按前缀匹配而非固定行号;以 3.x 实测为准,2.19.x 回归验证 |
| 用户把 devMode 服务绑到非 127.0.0.1 | yml 由用户自管;开关说明文案中警示「勿暴露到不可信网络」 |

开放问题:`plugins/registry.json` 官方目录是否接受收录(决定 `official` 字段与默认可见性);asideIndex 与后续内置模块排序的协调。
