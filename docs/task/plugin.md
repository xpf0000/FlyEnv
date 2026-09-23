# FlyEnv插件市场

用户:
https://github.com/xpf0000/FlyEnv我想给FlyEnv添加插件市场的功能。 后续模块/工具可以以模块的方式开发/运行/测试/构建/安装/卸载。 先看下目前FlyEnv的运行逻辑， 然后仔细考虑下如何实现插件市场。

chatgpt:
我把当前 FlyEnv 的 Renderer、Fork、版本管理、Custom Module、模块生命周期和构建方式都过了一遍。结论很明确：

**FlyEnv 非常适合做插件市场，而且现在正是做这件事比较合适的阶段。**
但不建议先做“插件市场页面”，也不建议直接搞一个“下载 JS 然后 import”的机制。应该先把当前的内置模块体系抽象成真正稳定的 **Module Registry + Plugin Host + Plugin Package**。市场只是最后加在上面的分发层。

目前 FlyEnv 已经有大概 **60% 的插件基础设施**，真正缺的是“运行时注册”和“稳定插件 API”。

---

# 1. 先看 FlyEnv 现在实际上是怎么跑的

目前 Renderer 侧已经相当模块化。

`src/render/core/App.ts` 会：

```ts
const modules = import.meta.glob('@/components/*/Module.ts', { eager: true })
```

然后自动加载所有 `components/*/Module.ts`。也就是说新增一个 Redis、Neo4j 这类模块，在 UI 层本身已经不需要维护一个巨大的 import 列表。

比如 Redis 的定义非常干净：

```ts
const module: AppModuleItem = {
  moduleType: 'cacheAndQueue',
  typeFlag: 'redis',
  label: 'Redis',
  icon: import('@/svg/redis.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 11,
  isService: true,
  isTray: true
}
```



而 Redis 的主页面其实也已经是：

```text
ServiceManager
VersionManager
Config
Logs
+ Redis 自己的 Redis Commander 扩展
```

也就是说大量模块其实已经是“通用 UI + 少量模块特有逻辑”。

这是非常适合插件化的结构。

---

# 2. 真正阻止插件化的是 Fork 层

这里才是当前最大的技术债。

现在执行：

```ts
IPC.send('app-fork:redis', 'startService', ...)
```

最终进入 `BaseManager.exec()`。

但是 `BaseManager.ts` 里面是这样的：

```ts
if (module === 'apache') {
  await import('./module/Apache')
} else if (module === 'nginx') {
  await import('./module/Nginx')
} else if (module === 'php') {
  ...
} else if (module === 'redis') {
  ...
}
```

一直几百行。

更麻烦的是，`Version/index.ts` 为了执行：

```ts
allInstalledVersions()
```

又重新维护了一遍：

```ts
if (type === 'apache') ...
else if (type === 'nginx') ...
else if (type === 'redis') ...
```



这意味着现在所谓“模块自动加载”只有 Renderer 是自动的。

真正增加一个 FlyEnv 模块仍然需要：

```text
AppModuleEnum
Renderer Module.ts
Fork BaseManager.ts
Version/index.ts
Fork module
translations
UI
...
```

所以现在新增模块还是一种**编译期扩展**，不是**运行时插件**。

---

# 3. 另外一个非常有价值的东西：Customer Module

FlyEnv 其实已经有一个简化版“插件系统”了。

现在 `AppCustomerModule` 可以保存：

```text
id
typeFlag
label
icon
moduleType
isService
command
commandFile
pidPath
configPath
logPath
isSudo
```

并且存在 localForage 里。

Fork 端有统一的：

```text
module-customer
```

负责执行这些模块的 command / commandFile，管理 PID、停止进程、sudo、配置文件、日志等。

Renderer 甚至已经可以把 Customer Module 和内置模块混合在同一套 sidebar 中。

这个非常重要。

所以我不会把现有 Customer Module 扔掉。

我会把它升级成：

> **Declarative Plugin Runtime**

也就是“声明式插件”。

后面会详细说。

---

# 4. 我认为 FlyEnv 应该明确区分 Plugin 和 Module

这个概念最好一开始就定清楚。

**Plugin 是安装、更新、签名、版本、依赖的分发单位。**

**Module 是 Plugin 给 FlyEnv 提供的功能。**

例如：

```text
Plugin
flyenv.redis

    ↓ contributes

Module
redis
```

以后甚至可以：

```text
flyenv.redis-tools
    ├── Redis Commander
    ├── Redis Insight Launcher
    └── Redis Backup Tool
```

第一版可以限制：

> 一个 Plugin = 一个 Module

保持简单。

但是 manifest 数据结构不要把这个可能性堵死。

---

# 5. 我建议的最终架构

核心应该变成这样：

```text
                    FlyEnv Plugin Registry
                             │
             ┌───────────────┴───────────────┐
             │                               │
        Built-in Plugins               Installed Plugins
             │                               │
             └───────────────┬───────────────┘
                             │
                       Plugin Manager
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
      Renderer            Main/Fork         Marketplace
      Registry            Runtime            Manager
          │                  │
      Module UI        Module Registry
      Router                │
      Sidebar          Plugin Runtime
                             │
                       Native Services
```

这里最关键的是：

### Module Registry

以后 `BaseManager` 不应该知道 Redis、MySQL、PHP。

它只知道：

```ts
const runtime = await ModuleRegistry.load(moduleId)
runtime.exec(fn, ...args)
```

`Version/index.ts` 也一样：

```ts
const runtime = await ModuleRegistry.load(moduleId)

versions[moduleId] =
  await runtime.allInstalledVersions(setup)
```

这样你现在两个巨型 if/else 会一起消失。

---

# 6. Built-in Module 也必须走 Registry

这一点非常重要。

不要出现：

```text
内置模块走老系统
插件模块走 PluginManager
```

否则以后会维护两套架构。

应该先把现有模块改成：

```ts
registry.register({
  id: 'redis',
  loader: () => import('./module/Redis')
})

registry.register({
  id: 'mysql',
  loader: () => import('./module/Mysql')
})

registry.register({
  id: 'php',
  loader: () =>
    isWindows()
      ? import('./module/Php.win')
      : import('./module/Php')
})
```

然后：

```text
BaseManager
Version
MCP
Startup Group
Config / Log
Service lifecycle
```

全部通过这个 Registry 找模块。

**先做这个重构，但是不改变任何现有功能。**

这样风险最低。

同时还能保留 FlyEnv 现在非常好的 Lazy Loading：

> 没用 Redis 就不加载 Redis runtime。

当前 BaseManager 本来就是按使用情况动态加载模块的。

这个特性应该继续保留。

---

# 7. `AppModuleEnum` 必须逐步退出核心 API

现在：

```ts
export enum AppModuleEnum {
  nginx = 'nginx',
  redis = 'redis',
  neo4j = 'neo4j',
  ...
}

export type AllAppModule = keyof typeof AppModuleEnum
```

所有模块都是封闭的。

插件：

```text
rabbitmq-streams
victoriametrics
dragonfly
keydb
...
```

不可能运行时加入 TypeScript enum。

应该逐步改成：

```ts
export type ModuleId = string
```

内置模块依然可以提供：

```ts
export const CoreModule = {
  redis: 'redis',
  mysql: 'mysql',
  php: 'php'
} as const
```

方便内部获得类型提示。

但是 Plugin API 不能依赖 enum。

这是整个插件化里一个必须做的 breaking architecture change。

---

# 8. Plugin manifest 应该成为核心

我建议第一版 manifest 大概这样：

```json
{
  "schemaVersion": 1,

  "id": "com.flyenv.mailpit",
  "name": "Mailpit",
  "version": "1.0.0",

  "publisher": {
    "id": "flyenv",
    "name": "FlyEnv"
  },

  "engines": {
    "flyenv": ">=4.20.0",
    "pluginApi": "^1.0.0"
  },

  "platforms": [
    "windows-x64",
    "windows-arm64",
    "macos-x64",
    "macos-arm64",
    "linux-x64",
    "linux-arm64"
  ],

  "contributes": {
    "modules": [
      {
        "id": "mailpit",
        "name": "Mailpit",
        "type": "service",
        "category": "emailServer",

        "capabilities": [
          "service",
          "versions",
          "config",
          "logs"
        ]
      }
    ]
  },

  "runtime": {
    "type": "native",
    "entry": "dist/runtime.mjs"
  },

  "locales": {
    "en": "locales/en.json",
    "zh": "locales/zh.json"
  },

  "icon": "assets/icon.png"
}
```

这里要有三个不同的版本概念：

```text
schemaVersion
pluginApi
FlyEnv version
```

千万不要只靠：

```text
minFlyEnvVersion
```

否则以后 Plugin API 改一次就会很难维护。

---

# 9. 不建议插件直接 import FlyEnv 内部源码

比如绝对不要让插件这么写：

```ts
import { Base } from 'flyenv/src/fork/module/Base'
import { BrewStore } from 'flyenv/src/render/store/brew'
```

这种插件 API 基本等于没有 API。

你现在正在强化模块边界：新模块数据不能乱进共享 store、生命周期优先复用 `ModuleInstalledItem.start()/stop()/restart()`、Fork 对进程状态负责等，这个方向本身非常适合进一步抽成 Plugin API。([GitHub][1])

应该提供稳定的：

```ts
FlyEnvPluginContext
```

例如：

```ts
interface FlyEnvPluginContext {
  paths: {
    data: string
    cache: string
    runtime: string
  }

  logger: PluginLogger

  process: {
    spawn(...)
    kill(...)
    list(...)
  }

  files: {
    read(...)
    write(...)
    exists(...)
  }

  http: {
    fetch(...)
  }

  service: {
    savePid(...)
    readPid(...)
  }
}
```

于是插件 runtime：

```ts
export default definePluginRuntime({
  async start(ctx, version) {},
  async stop(ctx, version) {},
  async installedVersions(ctx) {},
  async onlineVersions(ctx) {},
  async install(ctx, version) {},
  async configFiles(ctx, version) {},
  async logFiles(ctx, version) {}
})
```

以后 FlyEnv 内部怎么调整 `Base`、`Fn.ts`、`global.Server`，插件都不用跟着改。

---

# 10. Renderer 不建议一开始支持“任意 Vue 插件”

这是我觉得最容易走错的一步。

现在：

```ts
import.meta.glob('@/components/*/Module.ts')
```

是 Vite **编译期**行为。

用户安装：

```text
plugins/foo/Index.vue
```

Vite 不可能突然认识这个 `.vue` 文件。

当然你可以让插件自己 build：

```text
dist/ui.mjs
```

然后 FlyEnv：

```ts
import(file:///xxx/plugins/foo/ui.mjs)
```

技术上可以研究实现。

但是马上会出现：

```text
Vue 版本
Element Plus 版本
CSS
Tailwind
依赖共享
路由
HMR
安全
renderer 权限
插件冲突
```

一大堆问题。

所以第一版我**强烈建议不给插件自由 Renderer API**。

---

# 11. 第一版 Plugin UI 应该是 Declarative UI

这其实和 FlyEnv 当前架构非常吻合。

例如一个 Plugin 说：

```json
{
  "ui": {
    "tabs": [
      "service",
      "versions",
      "config",
      "logs"
    ]
  }
}
```

FlyEnv 自动生成：

```text
Service
Version Manager
Config
Logs
```

你现在 Redis 页面其实就是这么组成的。

插件只负责提供：

```text
installedVersions()
onlineVersions()
install()
start()
stop()
configFiles()
logFiles()
```

FlyEnv Core 负责 UI。

这有几个巨大的好处：

```text
插件天然保持 FlyEnv UI 风格
不需要 Vue SDK
不受 Vue/Element Plus 升级影响
安全边界简单很多
插件体积很小
测试很容易
跨平台容易
```

我认为这应该成为 FlyEnv 插件系统的核心哲学：

> **插件提供能力，FlyEnv 提供界面。**

而不是 VS Code 那种“插件什么都能干”。

---

# 12. 现有 Customer Module 正好可以成为 Plugin Level 1

我甚至建议设计两个 Runtime Level：

| 类型                 | 能力                                 | 使用场景                |
| ------------------ | ---------------------------------- | ------------------- |
| Declarative Plugin | manifest + command + version rules | 大多数简单 CLI / Service |
| Native Plugin      | `runtime.mjs`                      | Redis/MySQL/复杂服务    |

Declarative Plugin 可以从你现有 `ModuleCustomer` 演化。

例如：

```json
{
  "runtime": {
    "type": "command",

    "start": {
      "executable": "{bin}",
      "args": ["--config", "{data}/config.toml"]
    },

    "stop": {
      "strategy": "pid-tree"
    },

    "health": {
      "type": "tcp",
      "port": 6379
    }
  }
}
```

现在 Customer Module 已经能处理 command、commandFile、PID、sudo、config、logs。

所以第一版市场甚至不用先解决任意 JS Runtime。

很多软件已经可以通过这种形式安装进 FlyEnv。

---

# 13. Version Provider 也应该插件化/声明化

目前每个模块都自己写：

```ts
fetchAllOnlineVersion()
allInstalledVersions()
installSoft()
```

例如 Redis 自己解析可下载版本、生成 appDir/bin/zip，再检查是否已下载、已安装。

这部分以后可以提供标准 provider：

```text
github-release
static-url
homebrew
macports
sdkman
local-directory
custom
```

Manifest：

```json
{
  "versions": {
    "providers": [
      {
        "type": "github-release",
        "repo": "axllent/mailpit",
        "asset": {
          "windows-x64": "*windows-amd64.zip",
          "macos-arm64": "*darwin-arm64.tar.gz"
        }
      }
    ],

    "detect": {
      "command": "{bin} --version",
      "regex": "(\\d+\\.\\d+\\.\\d+)"
    }
  }
}
```

这样很多新模块甚至**一行 TypeScript 都不需要写**。

我觉得这会成为 FlyEnv 插件生态非常有竞争力的一点。

---

# 14. Runtime Plugin 怎么加载

对于真正复杂的插件，我建议打包成单文件：

```text
runtime.mjs
```

不要让用户安装插件时：

```bash
npm install
```

这一点很重要。

插件开发者在 build 时：

```text
TypeScript
   ↓
esbuild
   ↓
runtime.mjs
```

依赖全部 bundle 进去。

FlyEnv 安装的是已经构建好的 artifact：

```text
foo.flyenv-plugin
```

实际上可以就是 zip：

```text
flyenv.plugin.json
dist/runtime.mjs
locales/
assets/
LICENSE
README.md
signature.json
```

运行时：

```ts
const url = pathToFileURL(runtimeEntry).href
const plugin = await import(url)
```

Fork 的 Node/ESM 环境本身非常适合做这个。

---

# 15. 但 Runtime Plugin 不要直接跑在 BaseManager 进程里

长远我建议：

```text
FlyEnv Fork
    │
PluginRuntimeManager
    │
    ├── Plugin Host A
    ├── Plugin Host B
    └── Plugin Host C
```

即一个 Plugin Host 独立进程。

原因不是单纯安全，而是：

```text
插件崩了不拖死所有服务
插件内存泄漏可以单独杀
插件更新可以单独 reload
开发模式可以热重启
不同插件依赖不会污染
```

不过这里有一个安全现实需要说清楚：

> **只要允许插件运行任意 Node.js，就不能靠 Node `vm` 或所谓 permissions 真正保证安全。**

Node 插件完全可以读用户文件、联网、执行进程。

所以市场以后最好区分：

```text
Verified / Trusted Native Plugin
Declarative Plugin
```

Native Plugin 安装时明确提示：

> This plugin can execute native code and access your development environment.

社区插件第一阶段甚至可以只开放 Declarative Plugin。

官方审核通过的插件才能使用 Native Runtime。

---

# 16. Plugin 安装位置

我建议完全放 FlyEnv Data Directory，不要放应用安装目录。

例如：

```text
FlyEnv Data/
  plugins/
    com.flyenv.mailpit/
      1.0.0/
      1.1.0/

  plugin-data/
    com.flyenv.mailpit/

  plugin-cache/

  plugins.json
```

`plugins.json`：

```json
{
  "com.flyenv.mailpit": {
    "version": "1.1.0",
    "enabled": true
  }
}
```

这样 FlyEnv 本身升级：

```text
4.20 → 4.21
```

插件完全不用重新安装。

也符合 FlyEnv 现在“应用程序和 Data Directory 分离”的整体设计思路。

---

# 17. 卸载插件和卸载软件必须分开

这个我建议从产品层面就规定死。

比如：

```text
Redis Plugin
Redis 7.4
Redis database data
```

三个完全不是一回事。

用户点击：

> Uninstall Redis Plugin

默认只能删除：

```text
插件代码
插件 manifest
插件 UI 注册
```

不要删除：

```text
Redis binaries
Redis config
Redis database
```

否则这个功能非常危险。

可以额外提供：

```text
☐ Also remove managed runtimes
☐ Also remove plugin data
```

而且默认不勾选。

---

# 18. Plugin SDK + CLI

如果你希望最终真的形成生态，这块必须一起做。

我会设计：

```bash
npx create-flyenv-plugin

flyenv-plugin dev
flyenv-plugin test
flyenv-plugin build
flyenv-plugin pack
flyenv-plugin validate
flyenv-plugin publish
```

目录：

```text
flyenv-plugin-mailpit/
├── flyenv.plugin.json
├── package.json
├── tsconfig.json
├── src/
│   └── runtime.ts
├── locales/
│   ├── en.json
│   └── zh.json
├── assets/
│   └── icon.png
└── tests/
    └── runtime.test.ts
```

`dev` 不是真安装。

可以：

```text
FlyEnv Settings
→ Developer
→ Load Unpacked Plugin
```

然后 FlyEnv 注册：

```text
D:/Projects/flyenv-plugin-test/
```

文件变化后：

```text
rebuild
→ Plugin Host restart
```

这对你自己以后开发模块也会方便很多。

---

# 19. Testing 应该成为 Plugin Contract 的一部分

你现在已经开始增加：

```text
test:module-onboarding
test:module-lifecycle-single-flight
test:renderer-operation-boundaries
```

这样的架构测试了。([GitHub][2])

Plugin SDK 应该继续这个思路。

`flyenv-plugin test` 自动检查：

```text
manifest schema
pluginApi compatibility
duplicate module ID
platform definitions
start/stop contract
installedVersions contract
onlineVersions contract
install lifecycle
PID cleanup
config/log paths
forbidden APIs
package integrity
```

然后 CI：

```text
Windows
macOS
Linux
```

跑同一套 contract tests。

这样市场才可能让别人开发插件，而不是最后每个插件都要你人工 debug。

---

# 20. Plugin Marketplace 第一版根本不需要服务器

我不建议一开始又给 FlyEnv 增加一个复杂后台。

完全可以建：

```text
FlyEnv-Plugins
```

或者：

```text
FlyEnv/plugin-registry
```

维护：

```text
registry.json
```

例如：

```json
{
  "plugins": [
    {
      "id": "com.flyenv.mailpit",
      "name": "Mailpit",
      "publisher": "FlyEnv",
      "latest": "1.2.0",
      "description": "...",
      "icon": "...",
      "downloads": {
        "1.2.0": {
          "url": "...",
          "sha256": "...",
          "signature": "..."
        }
      }
    }
  ]
}
```

Marketplace：

```text
FlyEnv
    ↓
registry.json / CDN
    ↓
plugin metadata
    ↓
GitHub Releases / R2
    ↓
.flyenv-plugin
```

以后插件多了再做真正的 API。

第一版完全够用。

---

# 21. 签名机制建议一开始就做

至少官方 Plugin 要有：

```text
SHA-256
+
Ed25519 signature
```

FlyEnv 内置官方 public key。

安装：

```text
download
↓
SHA256
↓
signature
↓
manifest validate
↓
compatibility validate
↓
unpack staging
↓
activate
```

不要：

```text
下载
↓
直接 unzip 到 plugins
```

建议：

```text
plugins/.staging/...
```

验证全部成功后再 atomic rename。

更新失败还能自动回滚前一版本。

---

# 22. 我建议的具体 FlyEnv 改造顺序

这部分是我认为最重要的落地路线：

1. **先做 ModuleRegistry。** 新建 `src/fork/core/ModuleRegistry.ts`，把 `BaseManager.ts` 和 `Version/index.ts` 的巨型 if/else 全部迁进去；现有所有模块行为保持完全不变。

2. **把 Module ID 从封闭 enum 解耦。** 新增 `ModuleId = string`，逐步把 `Record<AllAppModule,...>` 改成 runtime registry；`AppModuleEnum` 暂时保留给 core module 用，不需要一次性大改。

3. **建立 PluginManager。** 放在 Main Process，负责 `discover/install/update/enable/disable/uninstall/verify`。Main 才是插件安装状态的 source of truth，不再像 Customer Module 一样把市场插件存在 Renderer localForage。

4. **建立 Declarative Plugin。** 把现有 `ModuleCustomer` 做 adapter，让 manifest plugin 自动进入 sidebar、service lifecycle、config/log。先把市场跑起来，而且不用执行任意第三方 JS。

5. **建立 Native Runtime Plugin。** Plugin build 输出 `runtime.mjs`，Fork 的 ModuleRegistry 可以从 Data Directory 动态加载。复杂模块才用它。

6. **最后做 Marketplace UI + SDK。** Marketplace 只负责 Discover/Installed/Updates；SDK 提供 `create/dev/test/build/pack/validate`。然后选一个简单现有模块真正从 FlyEnv 主程序里拆出去验证全链路。

---

# 23. 第一个真正外置的模块，我建议不要选 Redis/MySQL

Redis 看起来简单，但其实已经有：

```text
配置生成
Windows 特殊启动
PID 特殊处理
Redis Commander companion runtime
brew
macports
static install
```

代码已经不简单了。

更不要先拿：

```text
MySQL
PHP
Nginx
```

做实验。

我会先选类似：

> **Mailpit**

这种生命周期相对简单、数据风险低、跨平台单 binary 类型的模块。

目标是最终做到：

```bash
git clone flyenv-plugin-mailpit

yarn install

yarn dev
```

FlyEnv 立即出现 Mailpit。

然后：

```bash
yarn test
yarn build
yarn pack
```

生成：

```text
mailpit-1.0.0.flyenv-plugin
```

双击或者 Marketplace Install。

FlyEnv 重启都不需要重新编译。

这条链路跑通之后，插件架构才算真正成立。

---

# 24. 最后给你一个核心判断

我觉得这件事对 FlyEnv 不只是一个“新增插件市场功能”。

它实际上可以解决 FlyEnv 现在越来越明显的一个长期问题：

> **FlyEnv 支持的软件越来越多，但所有模块代码都跟 FlyEnv Core 一起增长。**

现在已经有 PHP、Node、Python、Java、Go、Flutter、MySQL、PostgreSQL、MongoDB、ClickHouse、Neo4j、Qdrant、Redis、RabbitMQ、MinIO、RustFS、Elasticsearch、Temporal、AI CLI……README 本身已经是几十个模块了。([GitHub][3])

继续按现在模式加，最终：

```text
FlyEnv Core
=
Electron Shell
+
60 个模块
+
60 套下载逻辑
+
60 套特殊逻辑
+
60 套 UI
```

维护成本一定越来越高。

插件化以后应该变成：

```text
FlyEnv Core
=
Service Engine
+ Version Engine
+ Process Engine
+ UI Engine
+ Plugin Host
+ Marketplace
```

而：

```text
Redis
Neo4j
Temporal
Mailpit
Qdrant
Keycloak
...
```

只是插件。

**这其实比“插件市场”本身价值大得多——它是在把 FlyEnv 从一个越来越大的桌面应用，变成一个 Local Development Platform。**

如果由我来定架构，我会优先开始做 **ModuleRegistry 重构 → Plugin Manifest v1 → Declarative Plugin**。这三步完成后再做市场 UI。这样每一步都能独立验证，而且不会一下子把 FlyEnv 当前稳定的模块体系推翻。

[1]: https://github.com/xpf0000/FlyEnv/blob/master/AGENTS.md "FlyEnv/AGENTS.md at master · xpf0000/FlyEnv · GitHub"
[2]: https://github.com/xpf0000/FlyEnv/blob/master/package.json "FlyEnv/package.json at master · xpf0000/FlyEnv · GitHub"
[3]: https://github.com/xpf0000/FlyEnv "GitHub - xpf0000/FlyEnv: Native local development environment for Windows, macOS & Linux. A modern alternative to XAMPP, MAMP, Laragon and Laravel Herd, with runtimes, databases, web servers, local sites, HTTPS, AI coding tools and MCP. · GitHub"

用户:
这个有点复杂了。 我的想法是目前既定的逻辑先不要动，先额外实现插件的机制。 先解决一个问题，目前的模块越来越多，如果还是全默认显示，然后在设置里设置隐藏，不清楚的用户可能会觉得FlyEnv太臃肿了。 而且很多模块，可能大部分用户都用不到，对于后续还想继续增加模块的话，这个影响还是比较大的。 整体流程如下： 1. 插件开发。我是考虑在项目根目录下添加plugin文件夹。里面是一个一个插件。 每一个插件需要有完整的前后端。 插件开发可能无法弄成单独的项目或者SDK，毕竟需要在FlyEnv里运行，很多基础功能FlyEnv里也已经实现过了，插件开发的时候也能直接用。 项目运行命令需要新增插件开发调试，构建，构建调试命令。 插件调试就传插件名，代码里自动注册加载插件。构建就是把插件打包。 构建调试就是传插件名，代码里自动注册加载构建后的插件。 这里需要注意的就是引用路径的问题。需要保证开发/构建/调试都没有问题。 2. 插件加载。主进程里，有个插件管理组件，所有的加载的插件都在里面管理。分叉进程执行时，把插件信息传递到分叉进程。 Fork进程的后端加载逻辑里，目前是找不到对应的模块就报错，需要改为从插件里找模块，然后加载模块。前端也是类似的逻辑。 需要做好缓存机制，不要每次都重新加载。 3. 插件安装。安装就是把打包后的插件下载到数据文件夹的插件目录下。FlyEnv里自动扫描插件目录。记录已安装插件， 可安装插件等信息。 第三方插件需要给用户提醒。 4. 插件升级和卸载。就是更新和移除插件文件夹。需要注意文件占用的问题。 5. 插件市场。初期只显示官方插件。再额外加个第三方插件入口。 用户需要手动添加第三方插件的链接。插件链接就是个JSON文件，定义了插件的各项内容。

chatgpt:
对，这一版思路我更赞同。

**先不碰现有模块体系，额外增加 Plugin 通道。** 这样既能快速解决“模块越来越多导致 FlyEnv 看起来越来越臃肿”的问题，又不会因为插件化把现在几十个已经稳定运行的模块全部重构一遍。

从当前代码看，这个方案的切入点其实很清晰：Renderer 现在通过 `import.meta.glob('@/components/*/Module.ts')` 注册内置模块；Fork 的 `BaseManager` 则在找不到内置 module 时直接返回 `No Found Module`。所以第一版实际上只需要在这两个地方增加 **Plugin fallback**，不用改现有模块加载链路。

## 我建议把目标收敛成这样

第一阶段不要追求“通用插件平台”，而是定义：

> **FlyEnv Plugin = FlyEnv 仓库中开发、独立构建、运行时动态安装的一套完整 FlyEnv Module。**

它可以完整拥有：

```text
Frontend
Backend / Fork
assets
i18n
plugin.json
```

开发时享受 FlyEnv 源码环境，可以直接复用现有代码；发布以后变成独立构建产物。

这非常符合你的场景。

---

# 插件目录

我建议根目录直接这样：

```text
FlyEnv/
├── src/
├── plugins/
│   ├── mailpit/
│   │   ├── plugin.json
│   │   ├── render/
│   │   │   ├── Module.ts
│   │   │   ├── Index.vue
│   │   │   ├── aside.vue
│   │   │   └── ...
│   │   ├── fork/
│   │   │   └── index.ts
│   │   ├── shared/
│   │   ├── locales/
│   │   └── assets/
│   │
│   └── xxx/
│
├── scripts/
└── package.json
```

甚至可以让结构尽量对应现在的：

```text
src/render/components/MailPit
src/fork/module/MailPit
```

这样以后把某个现有模块改成 Plugin，基本就是“移动目录 + plugin.json”，而不是重写。

第一版我甚至建议：

> **一个 Plugin = 一个 Module**

先不要支持“一个插件贡献 5 个模块”“插件扩展其他模块”之类的东西。

以后需要了再扩。

---

# `plugin.json` 不需要复杂

第一版只需要类似：

```json
{
  "id": "mailpit",
  "name": "Mailpit",
  "version": "1.0.0",
  "description": "Local email testing server",
  "author": "FlyEnv",

  "apiVersion": 1,
  "minFlyEnvVersion": "4.19.0",

  "module": {
    "typeFlag": "mailpit",
    "moduleType": "emailServer",
    "isService": true,
    "isTray": true,
    "asideIndex": 10
  },

  "entry": {
    "render": "./render/index.js",
    "fork": "./fork/index.js"
  },

  "platforms": [
    "Windows",
    "macOS",
    "Linux"
  ]
}
```

这里我认为 `apiVersion` 还是值得保留。

即使现在没有 SDK，它也代表：

> FlyEnv Plugin Loader 协议版本。

以后 manifest 格式或者加载规则变了：

```text
apiVersion: 1
apiVersion: 2
```

就很好处理。

---

# 你的三个开发命令，我会这样定义

目前项目已经有统一的 `dev` / `build` 入口，而且使用 esbuild、Vite/Electron 这套构建链。

我建议增加：

```bash
yarn plugin:dev mailpit
```

等价于：

```text
Plugin Mode: source
Plugin: mailpit
Plugin Path: <repo>/plugins/mailpit
```

启动 FlyEnv，同时只额外注册这个插件。

然后：

```bash
yarn plugin:build mailpit
```

输出：

```text
dist/plugins/mailpit/
    plugin.json
    render/
        index.js
        style.css
    fork/
        index.mjs
    assets/
```

最后：

```bash
yarn plugin:debug mailpit
```

不是加载源码，而是加载：

```text
dist/plugins/mailpit/
```

这个命令极其重要。

因为它验证的是：

> Marketplace 用户实际安装后的运行环境。

否则经常会出现：

```text
plugin:dev 正常
↓
打包
↓
安装
↓
各种路径错误
```

所以你的“构建调试”这个想法我认为必须保留。

---

# 最关键的问题：引用路径

这应该是整个第一版最重点解决的问题。

开发阶段你肯定希望允许：

```ts
import { AppStore } from '@/store/app'
import ServiceManager from '@/components/ServiceManager/index.vue'
import { IPC } from '@/util/IPC'
import { isWindows } from '@shared/utils'
```

而不是插件开发者重新造一遍。

**我赞成。**

因为第一版主要还是 FlyEnv 官方插件，没有必要为了所谓“插件纯净性”牺牲开发效率。

但是构建的时候不能留下：

```ts
import xxx from '@/store/app'
```

因为安装后的：

```text
FlyEnv Data/plugins/mailpit/
```

根本不存在 `@/`。

所以 `plugin:build` 必须做：

```text
Plugin Source
      ↓
Resolve FlyEnv aliases
      ↓
Bundle dependencies
      ↓
Standalone plugin artifact
```

即：

```text
@/
→ <FlyEnv>/src/render/

@shared/
→ <FlyEnv>/src/shared/

@fork/
→ <FlyEnv>/src/fork/
```

插件源代码完全不用改。

---

# 但 Vue / Pinia 有一个例外

这个地方最好第一版就处理掉。

如果 Plugin Bundle 又打进去一份：

```text
Vue
Pinia
Vue Router
```

就可能出现两份 Vue Runtime。

特别是：

```text
provide/inject
Pinia store
currentInstance
Vue Router
```

这种东西容易出现非常难排查的问题。

所以 Renderer Plugin 构建时我建议：

```text
FlyEnv 源码组件
FlyEnv utils
普通 JS dependencies
        ↓
可以 bundle

Vue
Pinia
Vue Router
        ↓
使用 FlyEnv Host 中的实例
```

可以在 Renderer 初始化时暴露：

```ts
window.__FLYENV_PLUGIN_HOST__ = {
  Vue,
  Pinia,
  router
}
```

插件 Render 构建使用 Rollup/Vite library mode，把：

```text
vue
pinia
vue-router
```

设成 external，并指向：

```text
__FLYENV_PLUGIN_HOST__.Vue
__FLYENV_PLUGIN_HOST__.Pinia
...
```

插件最终可以构建成：

```text
IIFE / UMD
```

而不一定非得 ESM。

例如加载后：

```js
window.__FLYENV_PLUGIN_REGISTER__('mailpit', {
  module,
  components
})
```

这样反而比：

```js
import('file:///xxx/plugin.js')
```

稳定。

尤其 Electron Renderer 里涉及：

```text
file://
custom protocol
CSP
dynamic import
bare module import
```

IIFE 注册方式简单很多。

---

# Fork 就更简单

Fork 插件可以直接构建成：

```text
fork/index.mjs
```

Plugin Manager 告诉 Fork：

```ts
{
  mailpit: {
    path: '.../plugins/mailpit/1.0.0',
    forkEntry: '.../fork/index.mjs'
  }
}
```

现在 `BaseManager` 最后是：

```ts
} else {
  ProcessSendError(ipcCommandKey, 'No Found Module')
}
```



直接变：

```ts
} else {
  const plugin = await PluginLoader.loadModule(module)

  if (plugin) {
    doRun(plugin)
  } else {
    ProcessSendError(ipcCommandKey, 'No Found Module')
  }
}
```

**前面的几百行完全不动。**

也就是说：

```text
Redis
MySQL
PHP
...
↓
原来的逻辑


未知 module
↓
PluginLoader
```

非常低风险。

---

# 缓存方式我建议稍微改一下

不要：

```ts
Map<string, any>
```

最好：

```ts
Map<string, Promise<any>>
```

也就是：

```ts
const loading = new Map<string, Promise<any>>()

function loadPlugin(id: string) {
  if (loading.has(id)) {
    return loading.get(id)
  }

  const promise = doLoad(id)

  loading.set(id, promise)

  return promise
}
```

原因是可能同时收到：

```text
getVersion
getStatus
startService
```

三个请求。

如果只是对象缓存：

```text
请求 A：没加载
请求 B：没加载
请求 C：没加载

→ import 三次
```

Promise cache 可以保证第一次加载期间，其他请求直接等待。

成功以后 Promise 本身就相当于缓存。

这和现在 `BaseManager` 已经在做的：

```ts
if (!this.Redis) {
    this.Redis = await import(...)
}
```

思路完全一致，只是 Plugin 用 Map 动态管理。

---

# Plugin 信息不要每次 IPC 都传

你说：

> 分叉进程执行时，把插件信息传递到分叉进程。

思路是对的，但我会稍微调整：

> **Fork 创建时传一次 Plugin Snapshot。**

例如：

```json
{
  "mailpit": {
    "id": "mailpit",
    "version": "1.0.0",
    "path": "...",
    "forkEntry": "..."
  },

  "xxx": {
  }
}
```

Fork 内部：

```text
PluginRegistry
    ↓
Map<moduleId, PluginInfo>
```

执行请求的时候只传：

```text
module = mailpit
fn = startService
args...
```

跟现在完全一样。

安装/升级/卸载之后：

```text
Main PluginManager
↓
refresh()
↓
通知 Renderer
↓
通知 / 重启 Fork Plugin Registry
```

这样执行路径非常干净。

---

# Main Process 的 PluginManager 应该是唯一管理者

这部分我很赞同你的想法。

建议：

```text
src/main/plugins/
    PluginManager.ts
    PluginInstaller.ts
    PluginSourceManager.ts
```

PluginManager 管：

```text
Installed
Available
Enabled
Disabled
Official
Third-party
Update available
Invalid
Incompatible
```

Renderer 不自己扫描目录。

Fork 也不自己扫描目录。

全部：

```text
                Main PluginManager
                  /           \
                 /             \
          Renderer            Fork
```

避免未来三个进程对于“当前有哪些插件”理解不一致。

---

# Data Directory 不建议直接一插件一个目录覆盖

你提到升级、卸载时需要注意文件占用，这个问题在 Windows 尤其值得提前解决。

不要：

```text
plugins/
    mailpit/
        render.js
        fork.js
```

然后升级时直接删除覆盖。

我会用：

```text
plugins/
    mailpit/
        1.0.0/
        1.1.0/

plugins.json
```

其中：

```json
{
  "mailpit": {
    "activeVersion": "1.1.0"
  }
}
```

升级：

```text
下载 1.1.0
↓
plugins/.staging/
↓
校验
↓
移动到 mailpit/1.1.0
↓
activeVersion = 1.1.0
↓
重新加载
↓
尝试删除 1.0.0
```

如果：

```text
EPERM
EBUSY
```

删不掉：

```text
pendingDelete
```

下次 FlyEnv 启动时删除。

这比强制覆盖文件稳得多。

而且还能天然支持：

> 升级失败 → 回滚 1.0.0。

---

# 第一版升级/卸载，我甚至不建议追求完全 Hot Reload

尤其 Renderer Plugin 已经执行以后，JS Module 基本没有真正可靠的“卸载”。

所以第一版可以明确：

```text
Install
→ 可以立即启用

Update
→ 下载并切换版本
→ Restart FlyEnv to apply

Uninstall
→ Disable
→ Restart FlyEnv
→ 删除旧文件
```

产品体验完全可以接受。

反而能省掉大量：

```text
remove routes
remove Vue components
clear module cache
remove CSS
terminate fork state
clean IPC listener
```

这种边界问题。

等以后真有必要，再实现 Hot Reload。

---

# 服务型插件卸载还有一个特殊情况

假设：

```text
Redis Plugin
```

服务正在运行。

用户直接卸载插件：

```text
Plugin code 没了
Redis process 还活着
```

FlyEnv 下次连怎么 Stop Redis 都不知道。

所以服务插件卸载前最好检查：

```text
Plugin Module Running?
```

如果运行：

```text
Stop service first
```

成功以后才能卸载。

停止失败：

```text
Cancel
Force uninstall
```

Force 要明确警告。

---

# Marketplace 的设计我认为你这个方案就够了

初期：

```text
Plugin Marketplace
├── Official
├── Installed
└── Third-party Sources
```

Official 可以就是 FlyEnv 自己维护：

```text
https://flyenv.com/plugins/index.json
```

或者 GitHub/CDN。

例如：

```json
{
  "version": 1,
  "plugins": [
    {
      "id": "mailpit",
      "name": "Mailpit",
      "version": "1.2.0",
      "description": "...",
      "icon": "...",
      "homepage": "...",
      "package": {
        "url": "https://...",
        "sha256": "..."
      }
    }
  ]
}
```

完全不需要后台数据库。

---

# 第三方插件源，我非常赞成你说的“用户自己添加 URL”

比如用户添加：

```text
https://example.com/flyenv/plugins.json
```

FlyEnv 下载：

```json
{
  "name": "Someone Plugins",
  "plugins": [...]
}
```

这样 FlyEnv 官方完全不用承担：

```text
插件托管
审核
搜索
开发者账户
发布后台
版本数据库
```

第一阶段非常合理。

而且可以非常明确地区分：

```text
Official Plugin
```

和：

```text
Third-party Plugin
⚠ Not reviewed by FlyEnv
```

第三方源第一次添加时给一个一次性确认：

> Plugins from third-party sources can execute code on your computer and have access to your local development environment. Only add sources you trust.

这是必须的。

因为你的插件拥有 Fork Backend，本质上就是：

> 可以执行任意本地 Node.js 代码。

不用假装有什么沙箱。

---

# 结合你现在的思路，我建议实际开发顺序就是这 8 步

1. **Plugin source 规范**：先确定 `plugins/<id>`、`plugin.json`、`render`、`fork` 目录结构。

2. **完成三种运行模式**：`plugin:dev`、`plugin:build`、`plugin:debug`。先把“源码能跑 → 构建 → 构建产物还能跑”彻底打通，这是最关键的一关。

3. **实现 Main `PluginManager`**：先只支持指定本地插件，不急着 Marketplace。

4. **接入 Renderer**：保持现在内置的 `AppModules` 不动，额外增加 `PluginModules`，最后 UI 层使用类似 `BuiltInModules + PluginModules`。当前内置模块本身仍由 Vite 的 glob 机制加载。

5. **接入 Fork**：保持当前 `BaseManager` 所有 if/else 不动，只在最后 `No Found Module` 之前调用 `PluginLoader`。

6. **实现 Data Directory 安装**：`.zip/.flyenv-plugin → staging → validate → plugins/<id>/<version>`，并实现 enabled / activeVersion / pendingDelete。

7. **再实现 Official Marketplace**：先一个远程 JSON 就够。

8. **最后实现 Third-party Source**：添加 URL、刷新、安装、风险提示，不做审核、不做托管。

---

## 这里有一个很重要的产品策略变化

如果走你现在这个方案，我建议从这个版本开始制定一个规则：

> **FlyEnv Core 不再默认不断增加新模块。**

现在 FlyEnv 的 `AppModuleEnum` 已经有非常多 runtime、数据库、AI CLI、搜索引擎、对象存储等模块了。

以后可以变成：

```text
高频、基础、核心能力
→ Built-in

低频、垂直、第三方工具
→ Official Plugin

社区提供
→ Third-party Plugin
```

而且**现在这些已有模块一个都不用迁**。

插件机制稳定之后，如果你觉得：

```text
Temporal
Neo4j
Qdrant
ZincSearch
某些 AI CLI
...
```

确实太低频，再一个一个从 Core 移到 Official Plugin 都行。

这样风险会低很多。

---

我现在反而觉得你的这个版本比我上一版提的 Registry / Plugin API 重构更适合 FlyEnv：**先把 Plugin 当成“可动态安装的 FlyEnv 原生 Module”来做，而不是设计一个高度抽象的第三方插件平台。**

其中最值得先做一个技术 PoC 的其实只有一件事：

> **拿一个现有简单模块复制到 `/plugins/test-plugin`，确保 `plugin:dev`、`plugin:build`、`plugin:debug` 三种模式全部能正常显示 UI、调用 Fork、复用 FlyEnv 现有组件。**

只要这条链跑通，后面的安装、市场、更新、卸载基本都是工程量问题，不再有大的架构不确定性。

用户:
你能直接帮我实现吗？代码直接提交到FlyEnv的GitHub仓库。

chatgpt:
可以直接实现并提交。

我已经发起了 **GitHub 插件连接**。你需要先在上面的插件卡片里完成连接授权；目前我还没有对 `xpf0000/FlyEnv` 的写入权限，而且这个运行环境也无法直接通过 `git clone` 访问 GitHub，所以没有这个连接我无法真正创建分支、提交代码。

连接后我建议直接按这版范围动手，不再扩大架构：

* 新增根目录 `plugins/`
* 定义 `plugin.json` 和插件目录结构
* 增加 `plugin:dev <name>`
* 增加 `plugin:build <name>`
* 增加 `plugin:debug <name>`
* 实现 Main Process `PluginManager`
* Renderer 在现有内置 Module 加载之外，增加 Plugin Module 加载
* Fork 保持现有模块逻辑不动，找不到内置模块时 fallback 到 Plugin
* Plugin Loader 做 Promise 缓存
* 支持 Data Directory 下的插件扫描
* 先实现插件启用/禁用和本地加载基础
* 做一个真实测试插件验证完整前后端链路
* 不修改现有任何内置模块
* 暂时不做 Marketplace UI、远程安装、第三方源和自动更新，放到下一阶段

代码我会优先提交到单独分支，例如 `feature/plugin-system`，而不是直接改 `master`，这样你可以先 review，确认没问题再合并。

**连接 GitHub 后直接告诉我“已连接”即可，不需要再重复需求。**


已经直接提交到 FlyEnv 的 GitHub 仓库了。

我创建了分支：

`feature/plugin-system-mvp`

并开了 PR：

[PR #867 — Add plugin system MVP](https://github.com/xpf0000/FlyEnv/pull/867)

这一版实现的是我们刚刚确定的“**不动现有模块体系，额外增加 Plugin 通道**”的 MVP，主要包括：

* 根目录新增 `plugins/`
* `plugin.json` manifest + 校验
* `yarn plugin:dev <name>`
* `yarn plugin:build <name>`
* `yarn plugin:debug <name>`
* Main Process 新增 `PluginManager`
* 自动扫描 FlyEnv Data Directory 下的 `plugins`
* Renderer 启动时把插件 Module 合并到现有 `AppModules`
* 内置 Module 优先，插件不会覆盖现有 `typeFlag`
* Fork 的 `BaseManager` 原逻辑完全保留
* 内置模块找不到时才 fallback 到 `PluginLoader`
* Fork Plugin 使用 `Map<string, Promise<any>>` 做加载缓存
* Main → Fork 通过现有 `global.Server` 初始化链传递插件快照
* 插件支持独立 Renderer + Fork
* 新增 `plugins/example` 作为完整前后端示例
* 新增 `test:plugin-system`，会实际构建 example 插件并检查 Render/Fork 产物和接线

也就是说，现在整体链路已经形成：

```text
plugins/example
     ↓
plugin:build
     ↓
dist/plugins/example
     ↓
PluginManager
     ├── Renderer → AppModules
     └── Fork → global.Server.Plugins
                    ↓
               PluginLoader
                    ↓
            BaseManager fallback
```

现有模块：

```text
Redis
PHP
MySQL
Nginx
...
```

加载方式完全没有迁移。

只有：

```text
BaseManager
    ↓
现有模块没有找到
    ↓
PluginLoader
```

才会进入插件。

这一版我特意**没有继续做插件市场、远程下载、升级、卸载、第三方源、签名校验**。先把最关键的：

> 开发 → 构建 → 构建调试 → Main 注册 → Renderer 加载 → Fork 调用

这条链独立跑通。

有一点需要说明：当前运行环境无法直接 clone FlyEnv 并执行 `yarn`，GitHub 上这个 PR 目前也没有触发现成的 workflow run，所以我已经加入了 `yarn test:plugin-system`，但还没有在真实本地依赖环境里实际执行。**我建议你先不要 merge #867，下一步我们应该直接基于这个 PR 继续把构建错误和实际运行问题修到真正可以启动 example plugin 为止。**

另外，在实现过程中我已经确认了下一步最值得优先验证的点：**Renderer 插件构建后引用 FlyEnv 现有 `@/...` 代码时的单例依赖问题**。目前第一版采用 bundle 方式，普通工具/组件可以直接复用，但 Pinia Store、Vue Router 这类全局单例以后最好做 Host 共享机制。这个不影响先验证 Plugin MVP，但需要在正式把复杂模块迁成插件前解决。

用户:
1. 找一个真实的模块作为示例插件吧。目前的示例插件看不出来啥东西。

chatgpt:
已经改了，PR #867 现在用 **Mailpit 作为真实插件示例**，原来的 Hello World `plugins/example` 已经删除。

现在 `plugins/mailpit` 不是演示壳子，而是真正走插件链路：

* Fork 直接复用 FlyEnv 当前真实的 `src/fork/module/MailPit` 实现，并在 `plugin:build` 时打包进独立插件产物。
* Renderer 是插件自己的页面，可以扫描已安装 Mailpit、获取在线版本、安装版本、启动/停止服务、初始化配置、获取日志路径、打开 Mailpit Web UI。
* 插件使用 `mailpit-plugin` 作为 `typeFlag`，所以暂时可以和现有内置 `mailpit` 共存，方便对照验证。
* 同时补了 **Vue / Pinia / Vue Router Host Runtime 共享机制**，避免真实插件打包出第二套 Vue/Pinia，导致 Store、Router、生命周期失效。
* 新增 `@fork/*` 路径支持，插件后端可以直接复用 FlyEnv Fork 里的现有代码。

现在可以直接在你本地这个分支测试：

```bash
git checkout feature/plugin-system-mvp

yarn plugin:dev mailpit
```

也可以测试真正的构建产物：

```bash
yarn plugin:build mailpit
yarn plugin:debug mailpit
```

以及完整的插件构建测试：

```bash
yarn test:plugin-system
```

PR 还是原来的：

[https://github.com/xpf0000/FlyEnv/pull/867](https://github.com/xpf0000/FlyEnv/pull/867)

目前 GitHub 显示这个 PR **mergeable=true**。

有一个需要注意的点：这个 Mailpit Plugin 为了验证插件机制，会复用现有 Mailpit 的二进制目录、配置和默认端口，所以**内置 Mailpit 和 Mailpit Plugin 不要同时启动**。

我觉得现在这个示例已经比较有意义了，因为它真正验证的是：

```text
FlyEnv existing Mailpit Fork code
        ↓
plugins/mailpit
        ↓
plugin:build
        ↓
standalone plugin artifact
        ↓
PluginManager
        ↓
Renderer + Fork dynamic loading
        ↓
真实安装 / 启动 / 停止 Mailpit
```

下一步比较关键的其实就是你本地跑一下 `yarn plugin:dev mailpit`。如果出现构建或运行错误，把错误给我，我可以直接继续在 **#867** 上修。

用户:
设置->模块里，需要能体现和控制已安装插件的显示隐藏。 启动后的已安装版本的扫描，也需要处理插件的逻辑。

chatgpt:
已经继续改到 #867 里了，这两个点都接上了。

现在 `设置 -> 模块` 会把已安装插件和普通模块一起展示，但插件项会额外显示 **Plugin** 标识，悬停可以看到插件 `id + version`。显示/隐藏仍然复用现有的 `setup.common.showItem`，所以不单独增加一套插件可见性配置。隐藏服务插件时，现有 `watchShowHide()` 会负责停止服务；重新显示时会自动触发插件版本扫描。

启动后的版本扫描也已经区分了两条路径：

```text
内置模块
  ↓
app-fork:version
  ↓
Version.allInstalledVersions(...)
```

插件不再经过这个硬编码的 `Version/index.ts`：

```text
插件模块
  ↓
app-fork:<plugin-typeFlag>
  ↓
plugin.allInstalledVersions(setup)
  ↓
Module.applyInstalledVersions(...)
  ↓
BrewStore / currentVersion / service state
```

也就是说以后新增插件，只要它实现：

```ts
allInstalledVersions(setup)
```

就不需要再去修改 FlyEnv 的：

```text
src/fork/module/Version/index.ts
```

启动时，**可见且 `isService: true` 的插件**会和现有服务模块一起扫描；如果插件当前隐藏，则启动时不扫描，之后用户在设置里重新打开它时，`watchShowHide()` 会触发扫描。

Mailpit 示例也一起改了。现在它的已安装版本列表直接读取：

```ts
BrewStore().module('mailpit-plugin').installed
```

启动/停止直接走现有的：

```text
ModuleInstalledItem.start()
ModuleInstalledItem.stop()
```

所以它现在真正验证的是完整链路，而不是页面自己维护一份状态：

```text
PluginManager
    ↓
AppModules
    ↓
设置 -> 模块显示/隐藏
    ↓
App.vue startup initializeModules
    ↓
plugin allInstalledVersions()
    ↓
BrewStore
    ↓
Aside / Plugin Page
    ↓
start / stop
```

另外，Mailpit Plugin 的左侧菜单也改成遵守 `showItem`，设置里关闭后会真正从左侧隐藏。

PR 还是：

[https://github.com/xpf0000/FlyEnv/pull/867](https://github.com/xpf0000/FlyEnv/pull/867)

当前 GitHub 显示 `mergeable: true`。

本地优先建议跑这两个：

```bash
yarn test:plugin-system
yarn plugin:dev mailpit
```

其中 `test:plugin-system` 现在也加了这次两个功能的静态约束，防止以后插件扫描又被改回 `app-fork:version`，或者设置页丢掉插件标识。
