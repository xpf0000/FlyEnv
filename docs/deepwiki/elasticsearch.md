# Elasticsearch Deep Dive

> **模块类型**: Search Engine  
> **模块标识**: `elasticsearch`  
> **分析日期**: 2026-04-12  
> **分析基线版本**: 4.13.2

---

## Overview

Elasticsearch 是一个分布式搜索和分析引擎，FlyEnv 通过封装 Elasticsearch 的二进制分发版，提供一键启动/停止、版本管理和配置编辑功能。该模块属于 `searchEngine` 类型，支持从官方静态二进制包安装和多版本并行管理。

相关文档链接:
- [Base 模块](./base.md) - 服务基类，定义通用生命周期
- [Module 系统](./module-system.md) - 前端模块架构
- [FlyEnv 架构概述](https://deepwiki.com/xpf0000/FlyEnv/3-architecture-overview)

---

## Architecture

### Component Hierarchy

```
Main Process (Application.ts)
├── ForkManager
│   └── UtilityProcess
│       └── BaseManager
│           └── Elasticsearch (src/fork/module/Elasticsearch/index.ts)
└── WindowManager
    └── BrowserWindow
        └── Renderer Process
            ├── Module.ts (src/render/components/Elasticsearch/Module.ts)
            ├── Index.vue (src/render/components/Elasticsearch/Index.vue)
            ├── aside.vue (src/render/components/Elasticsearch/aside.vue)
            ├── Config.vue (src/render/components/Elasticsearch/Config.vue)
            └── Logs.vue (src/render/components/Elasticsearch/Logs.vue)
```

### Data Flow

```
User Action (Switch/Start/Stop)
    │
    ▼
Aside.vue ──IPC──► Module.start()/stop()
    │
    ▼
Module.ts ──IPC──► app-fork:elasticsearch
    │
    ▼
BaseManager.exec() ──► Elasticsearch.exec()
    │
    ▼
Elasticsearch._startServer() / _stopServer()
```

### Module Registration

Elasticsearch 模块通过 `Module.ts` 注册到 FlyEnv 应用框架：

| Field | Value | Description |
|-------|-------|-------------|
| `moduleType` | `searchEngine` | 模块分类 |
| `typeFlag` | `elasticsearch` | 唯一标识符 |
| `label` | `Elasticsearch` | 显示名称 |
| `isService` | `true` | 可作为服务启动/停止 |
| `isTray` | `true` | 显示在托盘菜单 |
| `asideIndex` | `3` | 侧边栏排序位置 |

Sources: src/render/components/Elasticsearch/Module.ts:4-14

---

## Data Model

### TypeScript Interfaces

#### SoftInstalled (Extended)

Elasticsearch 版本实例实现 `SoftInstalled` 接口，通过 `ModuleInstalledItem` 类扩展：

```typescript
interface SoftInstalled {
  typeFlag: AllAppModule      // 'elasticsearch'
  version: string | null      // 版本号，如 "8.11.0"
  bin: string                 // 可执行文件路径
  path: string                // 安装目录
  num: number | null          // 版本数值表示，如 811
  error?: string              // 错误信息
  enable: boolean             // 是否可用
  run: boolean                // 运行状态
  running: boolean            // 启动/停止进行中
  pid?: string                // 进程ID
  isLocal7Z?: boolean         // 是否为本地7z包
}
```

Sources: src/shared/app.d.ts:4-21

#### OnlineVersionItem

在线版本数据结构：

```typescript
interface OnlineVersionItem {
  url: string                 // 下载地址
  version: string             // 版本号
  mVersion: string            // 主版本号
  // 扩展属性（运行时添加）
  appDir: string              // 应用安装目录
  zip: string                 // 本地缓存包路径
  bin: string                 // 二进制文件路径
  downloaded: boolean         // 是否已下载
  installed: boolean          // 是否已安装
  name: string                // 显示名称
}
```

Sources: src/shared/app.d.ts:98-102, src/fork/module/Elasticsearch/index.ts:101-127

---

## Core Components

### 1. Elasticsearch Class (Fork Process)

后端核心类，继承自 `Base` 基类：

```typescript
class Elasticsearch extends Base {
  type = 'elasticsearch'
  pidPath: string

  init()                          // 初始化 PID 路径
  _startServer(version)           // 启动服务
  _stopServer(version)            // 停止服务（继承自 Base）
  fetchAllOnlineVersion()         // 获取在线版本列表
  allInstalledVersions(setup)     // 获取本地已安装版本
  _installSoftHandle(row)         // 安装后处理
  brewinfo()                      // Homebrew 信息
  portinfo()                      // MacPorts 信息
}
```

Sources: src/fork/module/Elasticsearch/index.ts:26-223

### 2. Module Class (Renderer Process)

前端模块管理类，管理版本列表和状态：

| Method | Description |
|--------|-------------|
| `fetchInstalled()` | 获取已安装版本列表 |
| `fetchStatic()` | 获取静态版本列表（在线） |
| `start()` | 启动当前选中版本 |
| `stop()` | 停止所有运行实例 |
| `onItemStart(item)` | 版本启动前回调（单例切换） |

Sources: src/render/core/Module/Module.ts:15-374

### 3. ModuleInstalledItem

单个版本实例的状态管理：

| Method | IPC Command | Description |
|--------|-------------|-------------|
| `start()` | `startService` | 启动服务 |
| `stop()` | `stopService` | 停止服务 |
| `restart()` | - | 重启服务 |
| `setEnv()` | - | 设置环境变量 |

Sources: src/render/core/Module/ModuleInstalledItem.ts:11-186

---

## Lifecycle Management

### Service Startup Flow

```
1. User clicks switch in aside.vue
        │
        ▼
2. AsideSetup.switchChange()
        │
        ▼
3. Module.start() / Module.stop()
        │
        ▼
4. ModuleInstalledItem.start()
   └── IPC: app-fork:elasticsearch startService
        │
        ▼
5. BaseManager.exec() → Elasticsearch.exec()
        │
        ▼
6. Base.startService() [inherited]
   ├── _linkVersion()      (Homebrew 版本链接)
   ├── _stopServer()       (停止现有实例)
   └── _startServer()      (启动新实例)
        │
        ▼
7. Elasticsearch._startServer()
   ├── 创建 baseDir
   ├── 设置 ES_HOME 环境变量
   ├── 设置 ES_PATH_CONF 环境变量
   └── 执行 elasticsearch -d -p {pidPath}
        │
        ▼
8. waitPidFile() 等待 PID 文件生成
        │
        ▼
9. 返回 PID，写入 pid/elasticsearch.pid
```

### _startServer Implementation

```typescript
_startServer(version: SoftInstalled) {
  return new ForkPromise(async (resolve, reject, on) => {
    // 1. 日志通知
    on({ 'APP-On-Log': AppLog('info', 'Starting...') })
    
    // 2. 准备目录
    const baseDir = join(global.Server.BaseDir!, 'elasticsearch')
    await mkdirp(baseDir)
    
    // 3. 平台特定环境变量
    const execEnv = isWindows() 
      ? `set "ES_HOME=${version.path}"\nset "ES_PATH_CONF=${configPath}"`
      : `export ES_HOME="${version.path}"\nexport ES_PATH_CONF="${configPath}"`
    
    // 4. 启动参数
    const execArgs = `-d -p "${this.pidPath}"`
    
    // 5. 执行启动
    const res = await serviceStartExec({
      version, pidPath, baseDir, bin, execArgs, execEnv, on,
      maxTime: isWindows() ? 120 : 60,
      timeToWait: isWindows() ? 1000 : 2000
    })
    resolve(res)
  })
}
```

Sources: src/fork/module/Elasticsearch/index.ts:36-99

### Service Stop Flow

Elasticsearch 使用 `-TERM` 信号停止服务（在 Base._stopServer 中定义）：

```typescript
// Base._stopServer 中定义的信号映射
const dis: { [k: string]: string } = {
  elasticsearch: 'org.elasticsearch.server/org.elasticsearch.bootstrap.Elasticsearch',
  // ...
}

// Elasticsearch 使用 TERM 信号
switch (this.type) {
  case 'elasticsearch':
  case 'mysql':
  case 'rabbitmq':
    sig = '-TERM'
    break
  default:
    sig = '-INT'
}
```

停止流程：
1. 读取 `pid/elasticsearch.pid` 获取 PID
2. 通过进程名匹配查找相关进程
3. 发送 `-TERM` 信号终止进程
4. 清理 PID 文件

Sources: src/fork/module/Base/index.ts:123-249

---

## API/IPC Interface

### Command List

| Command | Parameters | Returns | Description |
|---------|-----------|---------|-------------|
| `startService` | `version: SoftInstalled` | `{ 'APP-Service-Start-PID': string }` | 启动服务 |
| `stopService` | `version: SoftInstalled` | `{ 'APP-Service-Stop-PID': string[] }` | 停止服务 |
| `fetchAllOnlineVersion` | - | `OnlineVersionItem[]` | 获取在线版本 |
| `allInstalledVersions` | `setup: any` | `SoftInstalled[]` | 获取本地版本 |
| `installSoft` | `row: OnlineVersionItem` | `boolean` | 安装版本 |
| `brewinfo` | - | `any` | Homebrew 信息 |
| `portinfo` | - | `any` | MacPorts 信息 |

Sources: src/fork/module/Base/index.ts:34-121, src/fork/module/Elasticsearch/index.ts:36-223

### IPC Communication Pattern

```typescript
// Renderer → Main → Fork
IPC.send(
  'app-fork:elasticsearch',  // channel
  'startService',            // function name
  version,                   // SoftInstalled object
  ...params                  // additional params
).then((key: string, res: any) => {
  // res.code: 0=success, 1=error, 200=progress
  // res.data: return value
  // res.msg: error message or progress info
})
```

Sources: src/render/core/Module/ModuleInstalledItem.ts:44-92

---

## Configuration

### Config Files

Elasticsearch 模块支持编辑三个配置文件：

| Tab | File | Path | Description |
|-----|------|------|-------------|
| elasticsearch.yml | `elasticsearch.yml` | `{path}/config/elasticsearch.yml` | 主配置文件 |
| jvm.options | `jvm.options` | `{path}/config/jvm.options` | JVM 参数 |
| log4j2.properties | `log4j2.properties` | `{path}/config/log4j2.properties` | 日志配置 |

Sources: src/render/components/Elasticsearch/Index.vue:19-21

### Config.vue Implementation

配置编辑通过通用 `Conf` 组件实现：

```typescript
const file = computed(() => {
  if (currentVersion?.value?.path) {
    return join(currentVersion.value.path, 'config', props.name)
  }
  return ''
})
```

Sources: src/render/components/Elasticsearch/Config.vue:42-48

### Logs

日志文件路径：`{path}/logs/elasticsearch.log`

Sources: src/render/components/Elasticsearch/Logs.vue:39-44

---

## Platform Differences

| Feature | macOS/Linux | Windows | Notes |
|---------|-------------|---------|-------|
| 安装包格式 | `.tar.gz` | `.zip` | 通过 `_fetchOnlineVersion` 获取对应格式 |
| 启动命令 | `elasticsearch` | `elasticsearch.bat` | 自动检测平台后缀 |
| 启动超时 | 60秒 | 120秒 | Windows 启动较慢 |
| 等待间隔 | 2000ms | 1000ms | Windows 使用更频繁检查 |
| 环境变量格式 | `export KEY=value` | `set "KEY=value"` | 通过 `isWindows()` 判断 |
| 版本检测正则 | `/(Version: )(\d+(\.\d+){1,4})/` | 同上 | 通过 `--version` 输出解析 |

Sources: src/fork/module/Elasticsearch/index.ts:36-99, src/fork/module/Elasticsearch/index.ts:134-177

---

## Version Management

### Online Versions

从 FlyEnv API 获取可用版本：

```
POST https://api.one-env.com/api/version/fetch
{
  "app": "elasticsearch",
  "os": "mac" | "win" | "linux",
  "arch": "x86" | "arm"
}
```

Sources: src/fork/module/Base/index.ts:301-339

### Local Version Detection

扫描指定目录查找已安装版本：

```typescript
allInstalledVersions(setup) {
  const all = isWindows()
    ? [versionLocalFetch(setup?.elasticsearch?.dirs ?? [], 'elasticsearch.bat')]
    : [versionLocalFetch(setup?.elasticsearch?.dirs ?? [], 'elasticsearch', 'elasticsearch')]
  // 解析版本号：elasticsearch --version
  const command = `"${item.bin}" --version`
  const reg = /(Version: )(\d+(\.\d+){1,4})/g
}
```

Sources: src/fork/module/Elasticsearch/index.ts:134-178

### Installation Process

```
1. Download from row.url → row.zip
2. Unpack to row.appDir
3. Move child dir contents to parent (处理嵌套目录)
4. Mark as installed
```

Sources: src/fork/module/Elasticsearch/index.ts:180-191

---

## UI Components

### Index.vue Tabs

| Index | Label | Component | Description |
|-------|-------|-----------|-------------|
| 0 | Service | ServiceManager | 服务状态和控制 |
| 1 | Version Manager | VersionManager | 版本安装/切换 |
| 2 | elasticsearch.yml | Config | 主配置编辑 |
| 3 | jvm.options | Config | JVM 配置编辑 |
| 4 | log4j2.properties | Config | 日志配置编辑 |
| 5 | Log | Logs | 日志查看 |

Sources: src/render/components/Elasticsearch/Index.vue:36-43

### Aside.vue

侧边栏组件提供服务开关控制：

```typescript
const {
  serviceRunning,      // 当前运行状态
  serviceDisabled,     // 是否可交互
  serviceFetching,     // 操作进行中
  switchChange         // 开关切换处理
} = AsideSetup('elasticsearch')
```

Sources: src/render/components/Elasticsearch/aside.vue:29-52

---

## Integration Points

### AppServiceModule Registration

Elasticsearch 注册到全局服务模块管理器：

```typescript
AppServiceModule.elasticsearch = {
  groupDo,        // 分组操作（一键启动/停止）
  switchChange,   // 开关切换
  serviceRunning,
  serviceFetching,
  serviceDisabled,
  showItem
}
```

Sources: src/render/components/Elasticsearch/aside.vue:44-51, src/render/core/ASide.ts:17-19

### Store Integration

| Store | Usage |
|-------|-------|
| `AppStore` | 当前版本配置、页面状态 |
| `BrewStore` | 版本列表、安装状态 |

Sources: src/render/components/Elasticsearch/Config.vue:25-26

---

## Sources Summary

| File | Lines | Description |
|------|-------|-------------|
| src/fork/module/Elasticsearch/index.ts | 26-223 | 后端核心实现 |
| src/fork/module/Base/index.ts | 26-447 | 基类定义 |
| src/fork/BaseManager.ts | 34-315 | Fork 进程命令分发 |
| src/render/components/Elasticsearch/Module.ts | 1-15 | 模块注册 |
| src/render/components/Elasticsearch/Index.vue | 1-45 | 主界面 |
| src/render/components/Elasticsearch/aside.vue | 1-52 | 侧边栏 |
| src/render/components/Elasticsearch/Config.vue | 1-49 | 配置编辑 |
| src/render/components/Elasticsearch/Logs.vue | 1-45 | 日志查看 |
| src/render/core/Module/Module.ts | 15-374 | 前端模块管理 |
| src/render/core/Module/ModuleInstalledItem.ts | 11-186 | 版本实例管理 |
| src/render/core/ASide.ts | 1-122 | 侧边栏逻辑 |
| src/render/core/type.ts | 37-88 | 类型定义 |
| src/shared/app.d.ts | 1-131 | 共享类型 |
| src/shared/ForkPromise.ts | 1-60 | 异步 Promise 扩展 |
