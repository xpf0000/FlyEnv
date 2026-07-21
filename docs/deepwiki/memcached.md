# Memcached Deep Dive

> **模块类型**: dataQueue (数据队列/缓存)  
> **模块标识**: `memcached`  
> **分析日期**: 2026-04-12  
> **分析基线版本**: 4.13.2

---

## Overview

Memcached 是一个高性能的分布式内存对象缓存系统，FlyEnv 通过封装 Memcached 二进制程序，提供跨平台的缓存服务生命周期管理。与其他数据库模块不同，Memcached 采用极简的架构设计，无需复杂配置即可快速启动。

相关文档链接:
- [Base 模块](./base.md) - 所有服务模块的基类
- [Redis](./redis.md) - 另一个缓存/数据队列模块
- [Module 系统](./module-system.md) - 模块管理通用机制

---

## Architecture

### Component Hierarchy Diagram

```
Renderer Process (Vue 3)
├── Memcached/Module.ts          # 模块注册
├── Memcached/Index.vue          # 主界面 (Service + VersionManager)
├── Memcached/aside.vue          # 侧边栏控制
├── core/Module/Module.ts        # 模块核心类
│   └── installed: ModuleInstalledItem[]
│       └── start() / stop()
└── store/brew.ts                # 状态管理

Main Process (Electron)
└── ForkManager
    └── UtilityProcess
        └── BaseManager
            └── Memcached (fork/module/Memcached/index.ts)
                ├── _startServer()    # 启动服务
                ├── _stopServer()     # 停止服务 (继承 Base)
                ├── allInstalledVersions()  # 版本管理
                └── fetchAllOnlineVersion() # 在线版本获取
```

### Data Flow Sequence

```
1. User clicks start switch in aside.vue
   │
   ▼
2. AsideSetup.switchChange() (core/ASide.ts:96-106)
   │ IPC: app-fork:memcached
   ▼
3. Main Process → ForkManager
   │
   ▼
4. Fork Process (BaseManager.exec)
   │ command: startService
   ▼
5. Memcached.startService() → Base.startService()
   │ calls: _stopServer() → _startServer()
   ▼
6. Platform-specific startup
   ├─ macOS/Linux: serviceStartExec() with shell script
   └─ Windows: serviceStartExecWin() with helper
   ▼
7. PID persisted to pid/memcached.pid
```

---

## Data Model

### TypeScript Interfaces

```typescript
// Module 定义 (src/render/components/Memcached/Module.ts:4-14)
interface AppModuleItem {
  moduleType: 'dataQueue'       // 模块分类
  typeFlag: 'memcached'         // 唯一标识
  label: 'Memcached'            // 显示名称
  icon: SVG                     // 模块图标
  index: Component              // 主界面组件
  aside: Component              // 侧边栏组件
  asideIndex: 10                // 排序索引
  isService: true               // 可启动/停止
  isTray: true                  // 托盘显示
}

// SoftInstalled - 已安装版本信息 (src/shared/app.ts)
interface SoftInstalled {
  version: string | null        // 版本号
  bin: string                   // 可执行文件路径
  path: string                  // 安装路径
  num: number | null            // 版本数字 (用于排序)
  enable: boolean               // 是否可用
  run: boolean                  // 是否运行中
  running: boolean              // 是否操作中
  pid?: string                  // 进程ID
  typeFlag: AllAppModule        // 模块标识
}

// OnlineVersionItem - 在线版本 (src/render/store/brew.ts:26-36)
interface OnlineVersionItem {
  appDir: string                // 应用目录
  zip: string                   // 下载包路径
  bin: string                   // 二进制路径
  downloaded: boolean           // 是否已下载
  installed: boolean            // 是否已安装
  url: string                   // 下载URL
  version: string               // 版本号
  mVersion: string              // 主版本
}
```

---

## Core Components

### 1. Memcached Fork Module

**File**: `src/fork/module/Memcached/index.ts`

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `init()` | - | void | 初始化 PID 路径 |
| `_startServer()` | version: SoftInstalled | ForkPromise | 平台特定的启动逻辑 |
| `_stopServer()` | version: SoftInstalled | ForkPromise | 停止服务 (继承 Base) |
| `allInstalledVersions()` | setup: any | ForkPromise<SoftInstalled[]> | 获取本地版本列表 |
| `fetchAllOnlineVersion()` | - | ForkPromise<OnlineVersionItem[]> | 获取在线版本 |
| `_installSoftHandle()` | row: any | Promise<void> | Windows 安装处理 |
| `brewinfo()` | - | ForkPromise | Homebrew 信息 |
| `portinfo()` | - | ForkPromise | MacPorts 信息 |

Sources: src/fork/module/Memcached/index.ts:26-207

### 2. Base Class (Inherited)

**File**: `src/fork/module/Base/index.ts`

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `startService()` | version, ...args | ForkPromise | 完整的启动流程 |
| `_stopServer()` | version, ...args | ForkPromise | 进程终止逻辑 |
| `_linkVersion()` | version | ForkPromise | Homebrew 版本链接 |
| `waitPidFile()` | pidFile, errLog, maxTime | Promise | 等待 PID 文件生成 |
| `installSoft()` | row | ForkPromise | 下载安装流程 |

Sources: src/fork/module/Base/index.ts:26-447

### 3. Frontend Module Class

**File**: `src/render/core/Module/Module.ts`

| Property/Method | Type | Description |
|----------------|------|-------------|
| `typeFlag` | AllAppModule | 模块标识 |
| `isService` | boolean | 是否为服务模块 |
| `isOnlyRunOne` | boolean | 是否只允许单实例 |
| `installed` | ModuleInstalledItem[] | 已安装版本列表 |
| `start()` | Promise<string \| boolean> | 启动当前版本 |
| `stop()` | Promise<string \| boolean> | 停止所有实例 |
| `fetchInstalled()` | Promise<boolean> | 获取已安装版本 |

Sources: src/render/core/Module/Module.ts:15-374

---

## Lifecycle Management

### Service Startup Flow

```
startService() (Base.ts:88-121)
    │
    ├─► 1. Version validation
    │   - Check binary exists
    │   - Check version is set
    │
    ├─► 2. Link version (Homebrew)
    │   - brew unlink <old>
    │   - brew link --overwrite --force <new>
    │
    ├─► 3. Stop existing instance
    │   _stopServer(version)
    │
    ├─► 4. Start new instance
    │   _startServer(version) → see below
    │
    └─► 5. Persist PID
        Write to pid/memcached.pid
```

### Platform-Specific Start Logic

**macOS/Linux** (`_startServer` lines 68-88):

```typescript
const execArgs = `-d -P "${this.pidPath}" -vv`
// -d: daemon mode
// -P: PID file path
// -vv: verbose logging

await serviceStartExec({
  version,
  pidPath: this.pidPath,
  baseDir,
  bin,
  execArgs,
  execEnv: '',
  on
})
```

**Windows** (`_startServer` lines 48-67):

```typescript
const execArgs = `-d -P \"${this.pidPath}\"`
// Note: Windows version doesn't use -vv flag

await serviceStartExecWin({
  version,
  pidPath: this.pidPath,
  baseDir,
  bin,
  execArgs,
  execEnv: '',
  on,
  checkPidFile: false  // Different from Unix
})
```

Sources: src/fork/module/Memcached/index.ts:36-89

### Service Stop Flow

```
_stopServer() (Base.ts:123-250)
    │
    ├─► 1. Get process list
    │   - Windows: ProcessPidList()
    │   - Unix: ProcessListFetch()
    │
    ├─► 2. Collect PIDs to kill
    │   ├─ From pid file (pid/memcached.pid)
    │   ├─ From version.pid
    │   └─ From process search (name: 'memcached')
    │
    ├─► 3. Filter by FlyEnv data directories
    │   Only kill processes with:
    │   - BaseDir in command
    │   - AppDir in command
    │
    ├─► 4. Send kill signal
    │   - Windows: ProcessKill('-INT', pids)
    │   - Unix: ProcessKill('-INT', pids)
    │   (Memcached uses -INT, not -TERM)
    │
    └─► 5. Cleanup
        Remove pid file
```

Sources: src/fork/module/Base/index.ts:123-250

---

## API/IPC Interface

### Command List

| Command | Parameters | Action | Returns |
|---------|-----------|--------|---------|
| `startService` | SoftInstalled, ...args | 启动服务 | `{ 'APP-Service-Start-PID': string }` |
| `stopService` | SoftInstalled, ...args | 停止服务 | `{ 'APP-Service-Stop-PID': string[] }` |
| `allInstalledVersions` | setup | 获取本地版本 | `SoftInstalled[]` |
| `fetchAllOnlineVersion` | - | 获取在线版本 | `OnlineVersionItem[]` |
| `installSoft` | row | 安装版本 | `boolean` |
| `brewinfo` | - | Homebrew 信息 | `brew info` JSON |
| `portinfo` | - | MacPorts 信息 | `port search` 结果 |

### IPC Communication Pattern

```typescript
// Frontend → Main → Fork (start example)
IPC.send(
  'app-fork:memcached',    // Channel
  'startService',          // Command
  JSON.parse(JSON.stringify(this)),  // Version data
  ...params                // Additional params
).then((key: string, res: any) => {
  // Response codes:
  // code: 0  → Success
  // code: 1  → Error (res.msg)
  // code: 200 → Progress/Log (res.msg)
})
```

Sources: src/render/core/Module/ModuleInstalledItem.ts:44-93

---

## Platform Differences

| Feature | macOS | Windows | Linux | Notes |
|---------|-------|---------|-------|-------|
| Installation | Homebrew / MacPorts / Static | Static ZIP | apt / Static | Windows 使用非官方移植版 |
| PID File | `${MemcachedDir}/memcached.pid` | Same | Same | Unix socket path differs |
| Start Args | `-d -P "pid" -vv` | `-d -P \"pid\"` | Same as macOS | Windows 无 `-vv` |
| Daemon Mode | Native `-d` flag | Native `-d` flag | Native `-d` flag | Memcached 内置守护进程 |
| Process Kill | `-INT` signal | `-INT` signal | `-INT` signal | Memcached 响应 INT 信号 |
| Version Detection | `memcached -V` | `memcached.exe -V` | Same | Regex: `/(\s)(\d+(\.\d+){1,4})/` |

### Windows-Specific Installation

Windows 版本使用 `nono303/memcached` 的预编译二进制，包含依赖库：

```typescript
// _installSoftHandle (lines 153-177)
const tmpDir = join(global.Server.Cache!, `memcached-${row.version}-tmp`)
await zipUnpack(row.zip, tmpDir)

// Source directory varies by build:
let dir = join(tmpDir, `memcached-${row.version}`, 'libevent-2.1', 'x64')
if (!existsSync(dir)) {
  dir = join(tmpDir, `memcached-${row.version}`, 'cygwin', 'x64')
}

// Copy all files to appDir
const allFile = await getAllFileAsync(dir, false)
for (const f of allFile) {
  await copyFile(join(dir, f), join(row.appDir, f))
}
```

Sources: src/fork/module/Memcached/index.ts:153-177

---

## Version Management

### Local Version Detection

```typescript
// allInstalledVersions (lines 112-151)
const all = [
  versionLocalFetch(
    setup?.memcached?.dirs ?? [],
    isWindows() ? 'memcached.exe' : 'memcached',
    'memcached'  // bin name for version check
  )
]

// Version detection command
const command = `"${item.bin}" -V`
const reg = /(\s)(\d+(\.\d+){1,4})(.*?)/g
```

### Online Version Fetch

```typescript
// fetchAllOnlineVersion (lines 91-110)
const all: OnlineVersionItem[] = await this._fetchOnlineVersion('memcached')
// API: POST https://api.one-env.com/api/version/fetch
// Body: { app: 'memcached', os: 'mac'|'win'|'linux', arch: 'x86'|'arm' }
```

---

## UI Components

### Component Structure

```
Memcached/Index.vue
├── el-radio-group (tab switcher)
│   ├── tab[0]: Service (ServiceManager)
│   └── tab[1]: VersionManager
└── Components
    ├── ServiceManager/index.vue  # 服务控制面板
    └── VersionManager/index.vue  # 版本管理

Memcached/aside.vue
├── Icon (memcached.svg)
├── Title ("Memcached")
└── el-switch (start/stop toggle)
```

### Module Registration

```typescript
// Module.ts (lines 4-15)
const module: AppModuleItem = {
  moduleType: 'dataQueue',
  typeFlag: 'memcached',
  label: 'Memcached',
  icon: import('@/svg/memcached.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 10,
  isService: true,
  isTray: true
}
```

Sources: src/render/components/Memcached/Module.ts:4-15

---

## Configuration

### Global Paths

| Variable | Value | Description |
|----------|-------|-------------|
| `global.Server.MemcachedDir` | `~/Library/Application Support/FlyEnv/memcached` | Memcached 工作目录 |
| `global.Server.BaseDir` | `~/Library/Application Support/FlyEnv` | FlyEnv 基础目录 |
| `global.Server.AppDir` | `~/Library/Application Support/FlyEnv/app` | 应用安装目录 |
| `global.Server.Cache` | `~/Library/Application Support/FlyEnv/cache` | 下载缓存目录 |
| `this.pidPath` | `${MemcachedDir}/memcached.pid` | PID 文件路径 |

Sources: src/fork/module/Memcached/index.ts:32-34

### Generated Files

```
~/Library/Application Support/FlyEnv/memcached/
├── memcached.pid                    # 当前进程 PID
├── memcached-{version}-start-out.log   # 启动日志
└── memcached-{version}-start-error.log # 错误日志
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Start fails silently | Port 11211 in use | Check `lsof -i :11211` |
| PID file not found | Daemon failed to start | Check error log file |
| Version not detected | Binary not executable | Check permissions `chmod +x` |
| Windows start fails | Missing libevent DLL | Ensure all DLLs copied during install |

### Debug Logging

```typescript
// Start process generates logs
const outFile = join(baseDir, `${typeFlag}-${versionStr}-start-out.log`)
const errFile = join(baseDir, `${typeFlag}-${versionStr}-start-error.log`)

// Real-time logs via IPC
on({
  'APP-On-Log': AppLog('info', 'message')
})
```

Sources: src/fork/util/ServiceStart.ts:77-78

---

## Sources Summary

| File | Lines | Description |
|------|-------|-------------|
| src/fork/module/Memcached/index.ts | 1-207 | 后端核心逻辑 |
| src/fork/module/Base/index.ts | 1-447 | 服务基类 |
| src/fork/util/ServiceStart.ts | 1-444 | 服务启动工具 |
| src/render/components/Memcached/Module.ts | 1-15 | 模块注册 |
| src/render/components/Memcached/Index.vue | 1-29 | 主界面 |
| src/render/components/Memcached/aside.vue | 1-47 | 侧边栏 |
| src/render/core/Module/Module.ts | 1-374 | 前端模块类 |
| src/render/core/Module/ModuleInstalledItem.ts | 1-186 | 已安装版本项 |
| src/render/core/ASide.ts | 1-122 | 侧边栏逻辑 |
| src/render/core/type.ts | 1-174 | 类型定义 |
| src/render/store/brew.ts | 1-109 | 状态管理 |

---

*文档生成时间: 2026-04-12*
