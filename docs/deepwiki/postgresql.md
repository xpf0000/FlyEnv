# PostgreSQL Deep Dive

> **模块类型**: Database Server  
> **模块标识**: `postgresql`  
> **分析日期**: 2026-04-12  
> **分析基线版本**: 4.13.2

---

## Overview

PostgreSQL 模块为 FlyEnv 提供开源关系型数据库的完整生命周期管理，支持多版本共存、数据目录自定义、pgvector 扩展安装等高级功能。

相关文档链接:
- [MySQL Deep Dive](./mysql.md) - 同类型数据库模块对比
- [MariaDB Deep Dive](./mariadb.md) - 同类型数据库模块对比
- [Base Module](./base-module.md) - 继承的基类实现

---

## Architecture

### Component Hierarchy Diagram

```
PostgreSQL Module
├── Fork Process (src/fork/module/Postgresql/index.ts)
│   └── Manager extends Base
│       ├── _startServer()     # 服务启动
│       ├── _stopServer()      # 服务停止
│       ├── fetchAllOnlineVersion()  # 在线版本获取
│       ├── allInstalledVersions()   # 本地版本扫描
│       ├── brewinfo()         # Homebrew 信息
│       ├── portinfo()         # MacPorts 信息
│       ├── fetchLastedTag()   # pgvector 最新标签
│       └── installPgvector()  # pgvector 安装
│
├── Renderer Components
│   ├── Module.ts              # 模块注册配置
│   ├── Index.vue              # 主页面容器
│   ├── aside.vue              # 侧边栏控制
│   ├── Config.vue             # 配置文件管理
│   ├── Logs.vue               # 日志查看
│   └── Extension/             # 扩展管理
│       ├── index.vue
│       └── setup.ts
│
└── Shared Setup
    └── setup.ts               # 数据目录状态管理
```

### Data Flow Sequence

```
1. User Action (Toggle Switch)
   │
   ▼
2. aside.vue - AsideSetup('postgresql')
   │ IPC: app-fork:postgresql
   ▼
3. Fork Process - Base.exec(fnName)
   │
   ├── startService() → _stopServer() → _startServer()
   │
   └── stopService() → _stopServer()
   │
   ▼
4. PostgreSQL Process (pg_ctl)
   │
   ▼
5. PID File & Status Update
```

Sources: src/fork/module/Postgresql/index.ts:38-455 src/render/components/PostgreSql/aside.vue:1-81

---

## Data Model

### Core Types

| Type | Source | Description |
|------|--------|-------------|
| `SoftInstalled` | `@shared/app` | 已安装软件版本信息 |
| `OnlineVersionItem` | `@shared/app` | 在线版本列表项 |
| `AppModuleItem` | `@/core/type` | 应用模块配置项 |
| `AppServiceModuleItem` | `@/core/ASide` | 服务模块状态接口 |

### PostgreSQL Module Configuration

```typescript
// Module registration
interface AppModuleItem {
  moduleType: 'dataBaseServer'
  typeFlag: 'postgresql'
  label: 'PostgreSQL'
  icon: SVGImport
  index: AsyncComponent  // Index.vue
  aside: AsyncComponent  // aside.vue
  asideIndex: 9
  isService: true
  isTray: true
}
```

Sources: src/render/components/PostgreSql/Module.ts:1-15 src/render/core/type.ts:97-133

### PostgreSQL Setup State

```typescript
interface PostgreSqlSetup {
  dir: Record<string, string>  // key: bin path, value: custom data dir
  init(): void                 // Load from localForage
  save(): void                 // Persist to localForage
}
```

Sources: src/render/components/PostgreSql/setup.ts:1-26

### Pgvector Extension State

```typescript
interface PgsqlExtensionSetup {
  installEnd: boolean
  installing: boolean
  list: { [binPath: string]: Array<{name: string, installed: boolean}> }
  tagVersion: string          // e.g., 'v0.7.4'
  fetching: Partial<Record<string, boolean>>
  xterm: XTerm | undefined
  reFetch: () => void
}
```

Sources: src/render/components/PostgreSql/Extension/setup.ts:9-25

---

## Core Components

### Fork Process Manager

The `Manager` class extends `Base` and implements PostgreSQL-specific logic.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `init()` | - | void | 空实现，无需初始化 |
| `_startServer()` | version: SoftInstalled, DATA_DIR?: string | ForkPromise<{pid: string}> | 启动 PostgreSQL 服务 |
| `_stopServer()` | version: SoftInstalled, DATA_DIR?: string | ForkPromise<{pids: number[]}> | 停止 PostgreSQL 服务 |
| `fetchAllOnlineVersion()` | - | ForkPromise<OnlineVersionItem[]> | 获取在线版本列表 |
| `allInstalledVersions()` | setup: any | ForkPromise<SoftInstalled[]> | 扫描本地已安装版本 |
| `brewinfo()` | - | ForkPromise<any> | 获取 Homebrew 版本信息 |
| `portinfo()` | - | ForkPromise<any> | 获取 MacPorts 版本信息 |
| `fetchLastedTag()` | - | ForkPromise<string> | 获取 pgvector 最新标签 |
| `installPgvector()` | version: SoftInstalled, tag: string | ForkPromise<void> | 安装 pgvector 扩展 |

Sources: src/fork/module/Postgresql/index.ts:38-455

### Data Directory Resolution

```
DATA_DIR Resolution Logic:

1. If custom dir set in PostgreSqlSetup.dir[version.bin]:
   → Use custom directory

2. Otherwise:
   → {Server.PostgreSqlDir}/postgresql{majorVersion}
   
   Example: /Users/xxx/FlyEnv-Data/postgresql/postgresql16
```

Sources: src/render/components/PostgreSql/Index.vue:70-89 src/fork/module/Postgresql/index.ts:51-54

---

## Lifecycle Management

### Service Startup Flow

```
_startServer(version, DATA_DIR)
│
├── 1. Compute paths
│   ├── dbPath = DATA_DIR || {PostgreSqlDir}/postgresql{major}
│   ├── confFile = {dbPath}/postgresql.conf
│   ├── pidFile = {dbPath}/postmaster.pid
│   └── logFile = {dbPath}/pg.log
│
├── 2. Check if data directory initialized
│   └── exists(confFile) ?
│       ├── YES → goto 5
│       └── NO → continue
│
├── 3. Initialize data directory (initdb)
│   ├── Windows: initdb.exe -D "dbPath" -U root
│   └── Unix: initdb -D "dbPath" -U root --locale=$LOCALE --encoding=UTF8
│
├── 4. Post-initialization
│   ├── Update locale settings (Windows)
│   └── Copy postgresql.conf → postgresql.conf.default
│
└── 5. Start service (pg_ctl start)
    ├── Windows: serviceStartExecCMD()
    └── Unix: serviceStartExec() with LC_ALL/LANG env
```

Sources: src/fork/module/Postgresql/index.ts:141-301

### Service Stop Flow

```
_stopServer(version, DATA_DIR)
│
├── 1. Compute paths
│   ├── dbPath = DATA_DIR || default
│   ├── pidFile = {dbPath}/postmaster.pid
│   └── logFile = {dbPath}/pg.log
│
├── 2. Execute pg_ctl stop
│   └── pg_ctl stop -D dbPath -l logFile
│
├── 3. Wait for PID file removal (non-Windows)
│   └── Poll for 10 seconds max
│
├── 4. macOS: Wait for process exit
│   ├── Scan process list for postgres processes
│   ├── Filter by dbPath in command
│   └── Retry up to 15 seconds + 500ms grace
│
└── 5. Cleanup
    ├── Remove app pid file
    └── Return collected PIDs
```

Sources: src/fork/module/Postgresql/index.ts:46-139

### Process Identification Mapping

| Service Type | Process Name | Signal |
|-------------|--------------|--------|
| postgresql | `postgres` | `-INT` |
| mysql | `mysqld` | `-TERM` |
| mariadb | `mariadbd` | `-TERM` |
| mongodb | `mongod` | `-TERM` |

Sources: src/fork/module/Base/index.ts:161-176 src/fork/module/Base/index.ts:218-236

---

## Configuration

### Configuration Files

| File | Path | Description |
|------|------|-------------|
| postgresql.conf | `{dbPath}/postgresql.conf` | 主配置文件 |
| postgresql.conf.default | `{dbPath}/postgresql.conf.default` | 默认配置备份 |
| pg.log | `{dbPath}/pg.log` | 运行日志 |
| postmaster.pid | `{dbPath}/postmaster.pid` | PID 文件 |

### Locale Configuration (Windows)

```
On Windows after initdb, following settings are updated:
- lc_messages = '{Server.Local}'
- lc_monetary = '{Server.Local}'
- lc_numeric = '{Server.Local}'
- lc_time = '{Server.Local}'
```

Sources: src/fork/module/Postgresql/index.ts:280-291

---

## API/IPC Interface

### IPC Commands

| Command | Handler | Description |
|---------|---------|-------------|
| `startService` | `Base.startService()` | 启动服务 |
| `stopService` | `Base.stopService()` | 停止服务 |
| `fetchAllOnlineVersion` | `Manager.fetchAllOnlineVersion()` | 获取在线版本 |
| `allInstalledVersions` | `Manager.allInstalledVersions()` | 扫描本地版本 |
| `brewinfo` | `Manager.brewinfo()` | Homebrew 信息 |
| `portinfo` | `Manager.portinfo()` | MacPorts 信息 |
| `fetchLastedTag` | `Manager.fetchLastedTag()` | pgvector 标签 |
| `installPgvector` | `Manager.installPgvector()` | 安装 pgvector |

### IPC Communication Pattern

```typescript
// Frontend
IPC.send('app-fork:postgresql', 'commandName', ...args)
  .then((key: string, res: any) => {
    IPC.off(key)
    // handle response
  })

// Fork Process (Base.exec)
exec(fnName: string, ...args: any): ForkPromise<any> {
  const fn = this[fnName]
  if (fn) {
    return fn.call(this, ...args)
  }
  return new ForkPromise((resolve, reject) => {
    reject(new Error(`No Found Function: ${fnName}`))
  })
}
```

Sources: src/fork/module/Base/index.ts:34-43 src/render/components/PostgreSql/Extension/setup.ts:154-166

---

## UI Components

### Component Structure

| Component | File | Responsibility |
|-----------|------|----------------|
| Module.ts | `Module.ts` | 模块注册与元数据 |
| Index.vue | `Index.vue` | 主容器，标签页切换 |
| aside.vue | `aside.vue` | 侧边栏服务开关 |
| Config.vue | `Config.vue` | 配置文件编辑器 |
| Logs.vue | `Logs.vue` | 日志查看器 |
| Extension | `Extension/index.vue` | pgvector 扩展管理 |

### Tab Structure (Index.vue)

| Index | Label | Component | Description |
|-------|-------|-----------|-------------|
| 0 | Service | ServiceManager | 服务控制面板 |
| 1 | VersionManager | VersionManager | 版本安装管理 |
| 2 | ConfigFile | Config | 配置文件编辑 |
| 3 | Log | Logs | 日志查看 |

Sources: src/render/components/PostgreSql/Index.vue:56-61

### Aside Component State

```
serviceDisabled = !currentVersion?.version 
                  || installed.length === 0 
                  || installed.some(v => v.running)
                  || !versionInitiated

serviceRunning = currentVersion?.run === true

serviceFetching = currentVersion?.running === true
```

Sources: src/render/core/ASide.ts:56-71

---

## Platform Differences

| Feature | macOS | Windows | Linux | Notes |
|---------|-------|---------|-------|-------|
| Data Directory | `~/FlyEnv-Data/postgresql/` | `%USERPROFILE%\FlyEnv-Data\postgresql\` | `~/.FlyEnv-Data/postgresql/` | User data directory |
| Binary Name | `pg_ctl` | `pg_ctl.exe` | `pg_ctl` | Control binary |
| Init Binary | `initdb` | `initdb.exe` | `initdb` | Database initialization |
| Start Method | `serviceStartExec()` | `serviceStartExecCMD()` | `serviceStartExec()` | Windows uses CMD wrapper |
| Locale Env | `LC_ALL`, `LANG` | `process.env` | `LC_ALL`, `LANG` | Environment variables |
| Post-init Config | No change | Update locale settings | No change | Windows-specific locale fix |
| Process Wait | 15s + 500ms grace | N/A | N/A | macOS shared memory release |

### Windows-Specific Implementation

```typescript
// Windows startup
const execArgs = `-D "${dbPath}" -l "${logFile}" start`
await serviceStartExecCMD({
  version,
  pidPath: pidFile,
  baseDir,
  bin,
  execArgs,
  execEnv: '',
  on
})

// Windows initdb
const command = `start /B ./${basename(initDB)} -D "${dbPath}" -U root > NUL 2>&1 &`
await execPromise(command)
```

### Unix-Specific Implementation

```typescript
// Unix startup with locale
const execEnv = `export LC_ALL="${global.Server.Local!}"
export LANG="${global.Server.Local!}"
`
const execArgs = `-D "${dbPath}" -l "${logFile}" start`
await serviceStartExec({
  version,
  pidPath: pidFile,
  baseDir,
  bin,
  execArgs,
  execEnv,
  on
})

// Unix initdb with locale
const command = `"${initDB}" -D "${dbPath}" -U root --locale=${global.Server.Local} --encoding=UTF8 && wait`
await execPromiseWithEnv(command, {
  env: {
    LC_ALL: global.Server.Local!,
    LANG: global.Server.Local!
  }
})
```

Sources: src/fork/module/Postgresql/index.ts:161-222 src/fork/module/Postgresql/index.ts:230-263

---

## Pgvector Extension

### Extension Detection

```typescript
// Check if pgvector is installed
const checkPaths = [
  join(version.path, 'share/postgresql/extension/vector.control'),
  join(version.path, `share/postgresql@${num}/extension/vector.control`),
  join(version.path, `vector.dylib`),   // macOS
  join(version.path, `vector.so`)       // Linux
]
```

### Installation Process

```bash
# Commands executed in XTerm
export PATH="{binDir}:$PATH"
cd /tmp
sudo -S rm -rf pgvector
git clone --branch {tag} https://github.com/pgvector/pgvector.git
cd pgvector
sudo -S make
sudo -S make install
sudo -S rm -rf pgvector
```

Sources: src/render/components/PostgreSql/Extension/setup.ts:44-111

---

## Version Management

### Online Version Fetching

```
API Endpoint: https://api.one-env.com/api/version/fetch
Request Body: {
  app: 'postgresql',
  os: 'mac' | 'win' | 'linux',
  arch: 'x86' | 'arm'
}
```

### Local Version Scanning

| Source | Pattern | Platform |
|--------|---------|----------|
| User Dirs | `setup.postgresql.dirs` | All |
| MacPorts | `/opt/local/lib/postgresql*/bin/pg_ctl` | macOS |

### Version Number Extraction

```
Command: "{bin}" --version
Regex: /(\s)(\d+(\.\d+){1,4})(.*?)/g
```

Sources: src/fork/module/Postgresql/index.ts:348-421 src/fork/module/Base/index.ts:301-339

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Data dir create fail | initdb failure | Check locale settings, disk space |
| Port conflict | Another PostgreSQL running | Change port in postgresql.conf |
| Shared memory error | Previous process not fully stopped | Wait longer (macOS 15s+ grace) |
| Permission denied | Wrong data dir ownership | Check directory permissions |

### Debug Logging

```typescript
// Debug log output
appDebugLog(`[PostgreSql][_stopServer][error]`, `${e}`)
console.log('PostgreSQL shutdown error: ', e)
console.log('PostgreSQL shutdown error version: ', version, bin)
```

Sources: src/fork/module/Postgresql/index.ts:63-65

---

## Sources Summary

| File | Lines | Description |
|------|-------|-------------|
| src/fork/module/Postgresql/index.ts | 1-455 | Fork 进程核心实现 |
| src/fork/module/Base/index.ts | 1-447 | 基类通用实现 |
| src/render/components/PostgreSql/Module.ts | 1-15 | 模块注册配置 |
| src/render/components/PostgreSql/Index.vue | 1-98 | 主页面组件 |
| src/render/components/PostgreSql/aside.vue | 1-81 | 侧边栏组件 |
| src/render/components/PostgreSql/Config.vue | 1-42 | 配置文件组件 |
| src/render/components/PostgreSql/setup.ts | 1-26 | 数据目录状态 |
| src/render/components/PostgreSql/Extension/setup.ts | 1-198 | pgvector 扩展管理 |
| src/render/core/type.ts | 1-174 | 类型定义 |
| src/render/core/ASide.ts | 1-122 | Aside 通用逻辑 |

---

*Generated following DeepWiki style guidelines*
