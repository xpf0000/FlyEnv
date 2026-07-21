# MongoDB Deep Dive

> **模块类型**: 数据库 (NoSQL Document Store)  
> **模块标识**: `mongodb`  
> **分析日期**: 2026-04-12  
> **分析基线版本**: 4.13.2

---

## Overview

MongoDB 模块为 FlyEnv 提供 MongoDB 文档数据库的管理能力，支持多版本安装、服务启停控制、配置文件管理和日志查看。该模块采用标准的 FlyEnv 服务模块架构，在 Windows 平台使用 MongoDB Shell (mongosh) 进行服务关闭操作。

相关文档链接:
- [MySQL Deep Dive](./mysql.md) - 关系型数据库对比
- [PostgreSQL Deep Dive](./postgresql.md) - 另一文档型数据库
- [Redis Deep Dive](./redis.md) - 内存数据库

---

## Architecture

### Component Hierarchy

```
Main Process (Application.ts)
├── ForkManager
│   └── UtilityProcess
│       └── BaseManager
│           └── Mongodb (src/fork/module/Mongodb/index.ts)
└── WindowManager
    └── BrowserWindow
        ├── MongoDB/Index.vue (Main View)
        ├── MongoDB/aside.vue (Sidebar Control)
        ├── MongoDB/Config.vue (Configuration)
        └── MongoDB/Logs.vue (Log Viewer)
```

### Module Registration

MongoDB 模块通过 `Module.ts` 注册到应用核心：

| Property | Value | Description |
|----------|-------|-------------|
| `moduleType` | `dataBaseServer` | 模块分类标识 |
| `typeFlag` | `mongodb` | 唯一类型标识符 |
| `label` | `MongoDB` | 显示名称 |
| `isService` | `true` | 是否为服务模块 |
| `isTray` | `true` | 是否在托盘菜单显示 |
| `asideIndex` | `8` | 侧边栏排序索引 |

Sources: src/render/components/MongoDB/Module.ts1-15

---

## Data Model

### TypeScript Interfaces

#### AppModuleItem (Module Definition)

```typescript
interface AppModuleItem {
  moduleType: string           // 'dataBaseServer'
  typeFlag: AllAppModule       // 'mongodb'
  label: string               // 'MongoDB'
  icon: Promise<any>          // SVG icon import
  index: AsyncComponent       // Main view component
  aside: AsyncComponent       // Sidebar component
  asideIndex: number          // 8
  isService: boolean          // true
  isTray: boolean            // true
}
```

#### SoftInstalled (Version Instance)

```typescript
interface SoftInstalled {
  version: string | null      // Semantic version
  bin: string                // Binary path (mongod)
  path: string               // Installation directory
  num: number | null         // Numeric version for sorting
  error?: string            // Error message if detection failed
  enable: boolean           // Version detected successfully
  run: boolean              // Service is running
  running: boolean          // Start/stop operation in progress
  pid?: string              // Process ID
  typeFlag: AllAppModule    // 'mongodb'
}
```

Sources: src/render/store/brew.ts9-24 src/render/core/type.ts46

#### OnlineVersionItem (Downloadable Version)

```typescript
interface OnlineVersionItem {
  appDir: string             // Target installation directory
  zip: string               // Cache zip file path
  bin: string               // Binary path after extraction
  downloaded: boolean       // Zip exists in cache
  installed: boolean        // Already extracted
  url: string              // Download URL
  version: string          // Version string
  mVersion: string         // Major.minor version
}
```

Sources: src/render/store/brew.ts26-36

---

## Core Components

### 1. Fork Process - Manager Class

MongoDB 模块的核心类继承自 `Base`，位于 `src/fork/module/Mongodb/index.ts`。

#### Class Definition

```typescript
class Manager extends Base {
  mongoshVersion = '2.5.2'    // MongoDB Shell version for Windows
  type = 'mongodb'
  pidPath: string            // Set in init()
}
```

#### Key Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `init()` | - | `void` | Initialize PID path |
| `initMongosh()` | - | `ForkPromise<boolean>` | Download/setup MongoDB Shell (Windows) |
| `_startServer()` | `version: SoftInstalled` | `ForkPromise<void>` | Start MongoDB daemon |
| `_stopServer()` | `version: SoftInstalled` | `ForkPromise<{APP-Service-Stop-PID: number[]}>` | Stop service |
| `fetchAllOnlineVersion()` | - | `ForkPromise<OnlineVersionItem[]>` | Fetch downloadable versions |
| `allInstalledVersions()` | `setup: any` | `ForkPromise<SoftInstalled[]>` | Scan installed versions |
| `_installSoftHandle()` | `row: any` | `Promise<void>` | Post-install hook |
| `brewinfo()` | - | `ForkPromise<any>` | Query Homebrew formulae |
| `portinfo()` | - | `ForkPromise<any>` | Query MacPorts packages |

Sources: src/fork/module/Mongodb/index.ts35-335

### 2. Frontend - Module Structure

#### Index.vue (Main View)

Tab-based interface with 4 sections:

| Tab Index | Component | Description |
|-----------|-----------|-------------|
| 0 | `Service` | Service control panel |
| 1 | `Manager` | Version manager |
| 2 | `Config` | Configuration file editor |
| 3 | `Logs` | Log viewer |

Sources: src/render/components/MongoDB/Index.vue1-38

#### aside.vue (Sidebar Control)

Provides quick service toggle in the sidebar:

| Property | Type | Description |
|----------|------|-------------|
| `serviceRunning` | `boolean` | Current service state |
| `serviceDisabled` | `boolean` | Toggle disabled state |
| `serviceFetching` | `boolean` | Operation in progress |
| `showItem` | `boolean` | Module visibility |

Sources: src/render/components/MongoDB/aside.vue1-53

### 3. Configuration Component

Config.vue manages MongoDB configuration files:

| Property | Value | Description |
|----------|-------|-------------|
| `typeFlag` | `'mongodb'` | Module identifier |
| `fileExt` | `'conf'` | Config file extension |
| `file` | Computed | Path: `mongodb-{v}.conf` |

Configuration file path format:
```
{MongoDBDir}/mongodb-{major.minor}.conf
```

Sources: src/render/components/MongoDB/Config.vue1-58

---

## Lifecycle Management

### Service Startup Sequence

```
User clicks Start / switchChange()
    │
    ▼
AsideSetup.switchChange() / Module.start()
    │ IPC: app-fork:mongodb startService
    ▼
Base.startService() (Base/index.ts:88-121)
    │
    ├── 1. Validate binary exists
    ├── 2. Validate version is set
    ├── 3. _linkVersion() for Homebrew
    ├── 4. _stopServer() - Stop existing
    └── 5. _startServer() - Start new
        │
        ▼
Manager._startServer() (Mongodb/index.ts:144-215)
    │
    ├── 1. Create data directory: data-{v}
    ├── 2. Generate config if not exists
    │   └── Template: static/tmpl/mongodb.conf
    └── 3. Execute mongod with args
        └── Platform-specific execution
```

### _startServer Implementation

```typescript
_startServer(version: SoftInstalled) {
  // 1. Extract major.minor version
  const v = version?.version?.split('.')?.slice(0, 2)?.join('.')
  
  // 2. Define paths
  const confFile = join(global.Server.MongoDBDir!, `mongodb-${v}.conf`)
  const dataDir = join(global.Server.MongoDBDir!, `data-${v}`)
  const logPath = join(global.Server.MongoDBDir!, `mongodb-${v}.log`)
  
  // 3. Create data directory with 0777 permissions
  if (!existsSync(dataDir)) {
    await mkdirp(dataDir)
    await chmod(dataDir, '0777')
  }
  
  // 4. Generate config from template
  if (!existsSync(confFile)) {
    const tmpl = join(global.Server.Static!, 'tmpl/mongodb.conf')
    let conf = await readFile(tmpl, 'utf-8')
    conf = conf.replace('##DB-PATH##', pathFixedToUnix(dataDir))
    await writeFile(confFile, conf)
  }
  
  // 5. Start with platform-specific args
  const execArgs = `--config "${confFile}" --logpath "${logPath}" --pidfilepath "${pidPath}"`
  // Unix: add --fork flag
}
```

Sources: src/fork/module/Mongodb/index.ts144-215

### Service Shutdown Sequence

MongoDB implements platform-specific shutdown logic:

#### Non-Windows (macOS/Linux)

Uses Base class default implementation with TERM signal:

| Step | Action | Description |
|------|--------|-------------|
| 1 | Process list fetch | Get all running processes |
| 2 | PID collection | Collect from pid file and version.pid |
| 3 | Process search | Find mongod processes matching FlyEnv paths |
| 4 | Signal send | Send `-TERM` signal to collected PIDs |
| 5 | Cleanup | Remove pid file |

#### Windows

Uses MongoDB Shell for graceful shutdown:

| Step | Action | Description |
|------|--------|-------------|
| 1 | Init mongosh | Ensure MongoDB Shell is available |
| 2 | Execute shutdown | `mongosh.exe --eval "db.shutdownServer()"` |
| 3 | PID collection | Collect from pid file and version |
| 4 | Return result | Return stopped PIDs |

```typescript
_stopServer(version: SoftInstalled) {
  if (!isWindows()) {
    return super._stopServer(version)  // Use Base implementation
  }
  // Windows: Use mongosh for graceful shutdown
  await this.initMongosh()
  const mongosh = join(appDir, 'mongosh', version, 'bin/mongosh.exe')
  await spawnPromise('mongosh.exe', ['--eval', `"db.shutdownServer()"`], {
    cwd: dirname(mongosh)
  })
  // Collect and return PIDs
}
```

Sources: src/fork/module/Mongodb/index.ts102-142 src/fork/module/Base/index.ts123-250

### Process Kill Signal Mapping

MongoDB uses `-TERM` signal for graceful shutdown on Unix platforms:

```typescript
switch (this.type) {
  case 'mysql':
  case 'mariadb':
  case 'mongodb':      // MongoDB uses TERM signal
  case 'tomcat':
  case 'rabbitmq':
  case 'elasticsearch':
  case 'etcd':
    sig = '-TERM'
    break
  default:
    sig = '-INT'
    break
}
```

Sources: src/fork/module/Base/index.ts219-232

---

## Configuration System

### Config File Structure

MongoDB configuration uses YAML format:

```yaml
systemLog:
  destination: file
  logAppend: true
storage:
  dbPath: /path/to/data        # Replaced from ##DB-PATH##
net:
  bindIp: 127.0.0.1, ::1       # IPv4 and IPv6 localhost
  ipv6: true
```

Sources: static/tmpl/macOS/mongodb.conf1-10

### Config File Naming Convention

| Platform | Path Pattern |
|----------|-------------|
| All | `{MongoDBDir}/mongodb-{major.minor}.conf` |

Example: `mongodb-7.0.conf` for MongoDB 7.0.x versions

### Data Directory Structure

```
{MongoDBDir}/
├── mongodb-{v}.conf      # Configuration file
├── mongodb-{v}.log       # Log file
├── data-{v}/             # Data directory
│   ├── journal/
│   ├── _mdb_catalog.wt
│   ├── collection-*.wt
│   ├── index-*.wt
│   └── ...
└── mongodb.pid           # PID file
```

---

## API/IPC Interface

### Command Dispatch

MongoDB module inherits command dispatch from `Base.exec()`:

```typescript
exec(fnName: string, ...args: any): ForkPromise<any> {
  const fn = this?.[fnName]
  if (fn) {
    return fn.call(this, ...args)
  }
  return new ForkPromise((resolve, reject) => {
    reject(new Error(`No Found Function: ${fnName}`))
  })
}
```

Sources: src/fork/module/Base/index.ts34-43

### Supported Commands

| Command | Parameters | Action | Response |
|---------|-----------|--------|----------|
| `startService` | `version: SoftInstalled` | Start MongoDB service | `{APP-Service-Start-PID: string}` |
| `stopService` | `version: SoftInstalled` | Stop MongoDB service | `{APP-Service-Stop-PID: number[]}` |
| `fetchAllOnlineVersion` | - | Get downloadable versions | `OnlineVersionItem[]` |
| `allInstalledVersions` | `setup: any` | Scan local installations | `SoftInstalled[]` |
| `_installSoftHandle` | `row: any` | Post-install processing | `void` |
| `brewinfo` | - | Query Homebrew formulae | Formula info |
| `portinfo` | - | Query MacPorts packages | Package info |
| `initMongosh` | - | Setup MongoDB Shell (Win) | `boolean` |

### Progress Callbacks

Commands use `ForkPromise` with progress callbacks via `on()`:

| Event | Payload | Description |
|-------|---------|-------------|
| `APP-On-Log` | `AppLog` | Log message |
| `APP-Service-Stop-Success` | `true` | Service stopped |
| `APP-Service-Start-PID` | `string` | Started process PID |
| `APP-Service-Stop-PID` | `number[]` | Stopped process PIDs |

---

## Platform Differences

| Feature | macOS | Windows | Linux |
|---------|-------|---------|-------|
| Binary name | `mongod` | `mongod.exe` | `mongod` |
| Shutdown method | TERM signal | mongosh shell | TERM signal |
| Config format | YAML | YAML | YAML |
| Version sources | Brew/Port/Local | Local only | Brew/Local |
| Mongosh required | No | Yes (2.5.2) | No |
| Fork flag | `--fork` | N/A (service) | `--fork` |

### Windows-Specific Implementation

Windows requires MongoDB Shell for graceful shutdown:

| Component | Details |
|-----------|---------|
| Version | 2.5.2 |
| Download URL | `https://downloads.mongodb.com/compass/mongosh-{version}-win32-x64.zip` |
| Install path | `{AppDir}/mongosh/{version}/` |
| Binary | `bin/mongosh.exe` |

Sources: src/fork/module/Mongodb/index.ts36-100

### Version Management Differences

| Platform | Source | Method |
|----------|--------|--------|
| macOS | Homebrew | `brew search -q --formula "/mongodb-(community|enterprise)(@[\d\.]+)?$/"` |
| macOS | MacPorts | `port search "^mongodb\d*$"` |
| Windows | Static | Download from MongoDB official |
| All | Local | Scan configured directories |

Sources: src/fork/module/Mongodb/index.ts246-333

---

## Version Management

### Online Version Fetching

Windows-specific implementation downloads from MongoDB official:

```typescript
fetchAllOnlineVersion() {
  const all: OnlineVersionItem[] = await this._fetchOnlineVersion('mongodb')
  all.forEach((a: any) => {
    a.appDir = join(global.Server.AppDir!, `mongodb-${a.version}`)
    a.zip = join(global.Server.Cache!, `mongodb-${a.version}.zip`)
    a.bin = join(a.appDir, 'bin/mongod.exe')
    a.downloaded = existsSync(a.zip)
    a.installed = existsSync(a.bin) || existsSync(dirOld)
  })
}
```

Sources: src/fork/module/Mongodb/index.ts217-244

### Local Version Scanning

| Platform | Directories | Binary Pattern |
|----------|-------------|----------------|
| Windows | `setup.mongodb.dirs` | `mongod.exe` |
| Unix | `setup.mongodb.dirs` | `mongod` |
| MacPorts | `/opt/local/bin`, `/opt/local/sbin` | `mongod` |

Version detection command:
```bash
"{bin}" --version
# Regex: /(v)(\d+(\.\d+){1,4})(.*?)/g
```

Sources: src/fork/module/Mongodb/index.ts246-289

---

## UI Components

### Service Manager Integration

MongoDB uses shared `ServiceManager` component for service control:

```vue
<Service v-if="tab === 0" type-flag="mongodb" title="MongoDB"></Service>
```

The Service component provides:
- Version selection dropdown
- Start/Stop/Restart buttons
- Status indicator
- Port display

### Version Manager Integration

```vue
<Manager
  v-else-if="tab === 1"
  type-flag="mongodb"
  url="https://www.mongodb.com/try/download/community"
  title="Mongodb"
></Manager>
```

Sources: src/render/components/MongoDB/Index.vue9-16

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Service won't start | Data directory permissions | Check `data-{v}` has write permission |
| Port conflict | Another MongoDB running | Stop other instances or change port |
| Config error | Invalid YAML syntax | Validate configuration file |
| Windows shutdown hang | Mongosh not initialized | Module auto-downloads mongosh on first use |

### Log File Locations

| Platform | Path |
|----------|------|
| All | `{MongoDBDir}/mongodb-{v}.log` |

---

## Sources Reference

Key implementation files:

| File | Lines | Purpose |
|------|-------|---------|
| `src/fork/module/Mongodb/index.ts` | 1-335 | Fork process core logic |
| `src/fork/module/Base/index.ts` | 1-447 | Base class with lifecycle |
| `src/render/components/MongoDB/Module.ts` | 1-15 | Module registration |
| `src/render/components/MongoDB/Index.vue` | 1-38 | Main view component |
| `src/render/components/MongoDB/aside.vue` | 1-53 | Sidebar control |
| `src/render/components/MongoDB/Config.vue` | 1-58 | Configuration editor |
| `src/render/components/MongoDB/Logs.vue` | 1-32 | Log viewer |
| `src/render/core/ASide.ts` | 1-122 | Sidebar composable |
| `static/tmpl/macOS/mongodb.conf` | 1-10 | Configuration template |
