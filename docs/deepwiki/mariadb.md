# MariaDB Deep Dive

> **模块类型**: 数据库服务器  
> **模块标识**: `mariadb`  
> **分析日期**: 2026-04-12  
> **分析基线版本**: 4.13.2

---

## Overview

MariaDB 模块为 FlyEnv 提供 MariaDB 数据库服务器的全生命周期管理，包括版本安装、服务启停、数据库管理、用户权限控制和数据备份等功能。与 MySQL 模块共享前端管理界面，但在后端拥有独立的服务管理实现。

相关文档链接:
- [MySQL 深度分析](./mysql.md) - 共享数据库管理 UI 的姊妹模块
- [Base 类深度分析](./base.md) - 服务模块基类

---

## Architecture

### Component Hierarchy Diagram

```
Renderer Process
├── MariaDB/Index.vue
│   ├── Service (ServiceManager/index.vue)
│   │   └── type-flag="mariadb"
│   ├── Manager (VersionManager/index.vue)
│   ├── Config (MariaDB/Config.vue)
│   └── Logs (MariaDB/Logs.vue)
├── Mysql/Manage/ (Shared UI)
│   └── index.vue - Database management dialog
└── MariaDB/aside.vue
    └── Sidebar service toggle

Main Process
├── ForkManager
│   └── UtilityProcess
│       └── BaseManager
│           └── Mariadb Manager (src/fork/module/Mariadb/index.ts)
└── WindowManager

Fork Process Commands
├── startService / stopService
├── passwordChange
├── getDatabasesWithUsers
├── addDatabase
├── backupDatabase
├── allInstalledVersions
├── fetchAllOnlineVersion
├── brewinfo / portinfo
└── installSoft
```

### Data Flow Sequence

```
1. User clicks service toggle (aside.vue)
   │
   ▼
2. AsideSetup('mariadb') - composable state management
   │ IPC: app-fork:mariadb
   ▼
3. Fork Process - Mariadb Manager
   │ ├── _stopServer() - graceful shutdown
   │ └── _startServer() - initialize & start
   ▼
4. Service Lifecycle
   ├── Data directory initialization (mariadb-install-db)
   ├── Configuration file generation (my-{version}.cnf)
   ├── Process spawn with ForkPromise
   └── PID tracking via pid/mariadb.pid
   ▼
5. State Update
   └── APP-Service-Start-PID / APP-Service-Stop-Success
```

### Module Registration

```typescript
// Module.ts - Module registration
const module: AppModuleItem = {
  moduleType: 'dataBaseServer',
  typeFlag: 'mariadb',
  label: 'MariaDB',
  icon: import('@/svg/mariaDB.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 7,
  isService: true,
  isTray: true
}
```

Sources: src/render/components/MariaDB/Module.ts1-15

---

## Data Model

### Core Types

| Type | Definition | Description |
|------|------------|-------------|
| `SoftInstalled` | `@shared/app` | Installed version metadata (bin, path, version, etc.) |
| `OnlineVersionItem` | `@shared/app` | Online version for download (url, version, appDir) |
| `MySQLDatabaseItem` | `Mysql/Manage/manage.ts` | Database with associated users |
| `Connection` | `mysql2/promise` | MariaDB connection handle |

### MariaDB Manager Class

```typescript
class Manager extends Base {
  type: string = 'mariadb'
  pidPath: string                // Initialized in init()
  
  // Core lifecycle
  _startServer(version, skipGrantTables?): ForkPromise
  _stopServer(version): ForkPromise
  
  // Database management
  passwordChange(version, user, password): ForkPromise
  getDatabasesWithUsers(version): ForkPromise
  addDatabase(version, data): ForkPromise
  backupDatabase(version, databases, saveDir): ForkPromise
  
  // Version management
  allInstalledVersions(setup): ForkPromise
  fetchAllOnlineVersion(): ForkPromise
  brewinfo(): ForkPromise
  portinfo(): ForkPromise
  
  // Installation
  installSoft(row): ForkPromise
  _installSoftHandle(row): Promise<void>
}
```

Sources: src/fork/module/Mariadb/index.ts39-43

### MySQLManage Reactive Store (Shared with MySQL)

| Property | Type | Description |
|----------|------|-------------|
| `userPassword` | `Record<string, MySQLUserItem>` | Cached user credentials per binary |
| `backupDir` | `Record<string, string>` | Last used backup directory per binary |
| `databaseRaw` | `MySQLDatabaseItem[]` | Current database list |
| `databaseSaved` | `Record<string, MySQLDatabaseSavedItem[]>` | Saved database metadata |
| `updating` | `Record<string, boolean>` | Password change in progress |
| `backuping` | `Record<string, boolean>` | Backup in progress |

Sources: src/render/components/Mysql/Manage/manage.ts24-38

---

## Core Components

### 1. Fork Module - Mariadb Manager

Located at `src/fork/module/Mariadb/index.ts`, extends `Base` class.

#### Initialization

```typescript
init() {
  this.pidPath = join(global.Server.MariaDBDir!, 'mariadb.pid')
}
```

Sets the PID file path for process tracking. The actual service data and configs are stored in version-specific directories.

Sources: src/fork/module/Mariadb/index.ts45-47

#### Service Start Sequence

```typescript
_startServer(version: SoftInstalled, skipGrantTables?: boolean)
```

| Step | Action | Details |
|------|--------|---------|
| 1 | Log start | `APP-On-Log` event with service name |
| 2 | Config setup | Generate `my-{version}.cnf` if not exists |
| 3 | Data init | Run `mariadb-install-db` if data directory empty |
| 4 | Start service | Spawn `mariadbd` with platform-specific args |
| 5 | Password init | Call `_initPassword()` for new installations |

Platform-specific startup parameters:

**Windows:**
- Uses `mariadbd.exe` with `--defaults-file`, `--pid-file`, `--standalone`
- Named pipe support when `skipGrantTables` is true
- Service started via `serviceStartExecCMD()`

**macOS/Linux:**
- Uses `mariadbd` with socket file `/tmp/mysql.sock`
- MacPorts-specific locale directory handling
- Service started via `serviceStartExec()`

Sources: src/fork/module/Mariadb/index.ts156-369

#### Service Stop Sequence

```typescript
_stopServer(version: SoftInstalled): ForkPromise
```

**Non-Windows:** Delegates to `Base._stopServer()` using TERM signal.

**Windows:** Graceful shutdown via `mariadb-admin.exe`:
1. Read port from config file
2. Execute shutdown command with credentials
3. Fallback to `taskkill` if graceful shutdown fails

```typescript
const command = `"${bin}" --defaults-file="${m}" --connect-timeout=1 
  --shutdown-timeout=1 --protocol=tcp --host="127.0.0.1" 
  --port=${port} -uroot -p${password} shutdown`
```

Sources: src/fork/module/Mariadb/index.ts93-154

### 2. Frontend Components

#### Index.vue

Main module view with tabbed interface:

| Tab | Component | Description |
|-----|-----------|-------------|
| 0 | Service | Service control and version selection |
| 1 | Manager | Version management (install/uninstall) |
| 2 | Config | Configuration file editor |
| 3 | Logs | Error log viewer |
| 4 | Logs | Slow query log viewer |

Features:
- phpMyAdmin quick access button
- Database management action (delegates to MySQL Manage component)

Sources: src/render/components/MariaDB/Index.vue1-100

#### aside.vue

Sidebar navigation item with service toggle:

```typescript
const {
  showItem,
  serviceDisabled,
  serviceFetching,
  serviceRunning,
  currentPage,
  groupDo,
  switchChange,
  nav,
  stopNav
} = AsideSetup('mariadb')
```

Registers with `AppServiceModule.mariadb` for global service control.

Sources: src/render/components/MariaDB/aside.vue1-48

#### Config.vue

Configuration management with dual-mode editing:

| Mode | Description |
|------|-------------|
| Text | Direct `.cnf` file editing |
| Common | Form-based key-value configuration |

Default configuration template:
```ini
[mariadbd]
bind-address = 127.0.0.1
sql-mode=NO_ENGINE_SUBSTITUTION
port = 3306
datadir=${dataDir}
```

Common settings include: port, buffer sizes, cache settings, max_connections.

Sources: src/render/components/MariaDB/Config.vue1-223

---

## Lifecycle Management

### Start Service Flow

```
User clicks Start
    │
    ▼
switchChange() in AsideSetup
    │
    ▼
IPC: app-fork:mariadb startService
    │
    ▼
Base.startService()
    │
    ├── _linkVersion() - Brew link on macOS
    │
    ├── _stopServer() - Stop any running instance
    │
    └── _startServer()
            │
            ├── Check/Create my-{version}.cnf
            │
            ├── Check/Init data directory
            │   └── mariadb-install-db
            │
            ├── Start mariadbd process
            │   ├── Windows: serviceStartExecCMD()
            │   └── Unix: serviceStartExec()
            │
            └── _initPassword() (first run only)
                    │
                    ├── Windows: mariadb-admin.exe
                    └── Unix: mariadb-admin via socket
    │
    ▼
Write PID to pid/mariadb.pid
    │
    ▼
Emit APP-Service-Start-Success
```

### Stop Service Flow

```
User clicks Stop
    │
    ▼
IPC: app-fork:mariadb stopService
    │
    ▼
_stopServer() - Platform specific
    │
    ├── Windows:
    │   ├── Try mariadb-admin shutdown
    │   └── Fallback to taskkill
    │
    └── Unix:
        └── Base._stopServer() with TERM signal
                │
                ├── Read PID from pid file
                ├── Find process by name (mariadbd)
                └── Send TERM signal
    │
    ▼
Remove pid/mariadb.pid
    │
    ▼
Emit APP-Service-Stop-Success
```

Sources: src/fork/module/Mariadb/index.ts93-154, src/fork/module/Base/index.ts123-250

---

## Configuration

### Configuration File Structure

| File | Location | Purpose |
|------|----------|---------|
| `my-{version}.cnf` | `MariaDBDir/my-{major.minor}.cnf` | Version-specific server config |
| `mariadb.pid` | `MariaDBDir/mariadb.pid` | Process ID tracking |
| `error.log` | `MariaDBDir/error.log` | Error log output |
| `slow.log` | `MariaDBDir/slow.log` | Slow query log |
| `data-{version}/` | `MariaDBDir/data-{major.minor}/` | Database files |

### Configuration Sections

```ini
[mariadbd]
bind-address = 127.0.0.1      # Network binding
sql-mode = NO_ENGINE_SUBSTITUTION
port = 3306                    # TCP port
datadir = /path/to/data       # Data directory
pid-file = /path/to/pid       # PID file
slow-query-log = ON           # Enable slow log
slow-query-log-file = /path   # Slow log location
log-error = /path/to/error    # Error log location
socket = /tmp/mysql.sock      # Unix socket (non-Windows)
```

Sources: src/fork/module/Mariadb/index.ts172-177

---

## API/IPC Interface

### Command List

| Command | Parameters | Returns | Description |
|---------|------------|---------|-------------|
| `startService` | `version: SoftInstalled` | `{APP-Service-Start-PID}` | Start MariaDB service |
| `stopService` | `version: SoftInstalled` | `{APP-Service-Stop-PID}` | Stop MariaDB service |
| `passwordChange` | `version, user, password` | `boolean` | Change user password |
| `getDatabasesWithUsers` | `version: SoftInstalled` | Database list with users | Query all databases |
| `addDatabase` | `version, data` | `{userExists}` | Create database and user |
| `backupDatabase` | `version, databases[], saveDir` | `error[]` | Backup databases |
| `allInstalledVersions` | `setup: any` | `SoftInstalled[]` | List installed versions |
| `fetchAllOnlineVersion` | - | `OnlineVersionItem[]` | List downloadable versions |
| `brewinfo` | - | Brew package info | Homebrew package metadata |
| `portinfo` | - | MacPorts info | MacPorts package metadata |
| `installSoft` | `row: OnlineVersionItem` | `boolean` | Download and install |

### IPC Protocol

Frontend to Fork:
```typescript
IPC.send(`app-fork:mariadb`, command, ...args)
  .then((key: string, res: any) => {
    // res.code: 0 = success, other = error
    // res.data: return data
    // res.msg: error message
  })
```

Progress events via `on()` callback:
- `APP-On-Log`: Log messages
- `APP-Service-Start-Success`: Service started
- `APP-Service-Stop-Success`: Service stopped

Sources: src/render/components/Mysql/Manage/manage.ts110-130, src/fork/module/Base/index.ts34-43

---

## Database Management

### Password Change Flow

```typescript
passwordChange(version, user, password)
    │
    ├── _startServer(version, true)  // Start with skip-grant-tables
    │
    ├── Wait 1 second
    │
    ├── Execute SQL (version-dependent):
    │   ├── >= 10.2.0: ALTER USER ... IDENTIFIED BY
    │   └── < 10.2.0: UPDATE mysql.user SET Password
    │
    ├── _stopServer(version)
    │
    └── Return success
```

Sources: src/fork/module/Mariadb/index.ts493-569

### Database Creation

```typescript
addDatabase(version, data: {database, user, password, charset})
    │
    ├── Ensure service is running
    │
    ├── Connect as root
    │
    ├── CREATE DATABASE IF NOT EXISTS
    │
    ├── CREATE USER (if not exists)
    │   └── or ALTER USER password (if exists)
    │
    ├── GRANT ALL PRIVILEGES
    │
    └── FLUSH PRIVILEGES
```

Sources: src/fork/module/Mariadb/index.ts693-776

### Backup

Uses `mariadb-dump` utility:

```bash
mariadb-dump -uroot -p${password} --port=${port} \
  --host="127.0.0.1" --single-transaction \
  --skip-add-locks --no-tablespaces ${database} > ${file}
```

Sources: src/fork/module/Mariadb/index.ts778-819

---

## Platform Differences

| Feature | macOS | Windows | Linux | Notes |
|---------|-------|---------|-------|-------|
| Binary name | `mariadbd` | `mariadbd.exe` | `mariadbd` | Windows has .exe suffix |
| Admin binary | `mariadb-admin` | `mariadb-admin.exe` | `mariadb-admin` | Password init/shutdown |
| Dump binary | `mariadb-dump` | `mariadb-dump.exe` | `mariadb-dump` | Backup utility |
| Install db | `mariadb-install-db` / `mysql_install_db` | `mariadb-install-db.exe` | Same as macOS | Fallback to legacy name |
| Socket | Unix socket `/tmp/mysql.sock` | Named pipe | Unix socket | Windows uses --protocol=pipe |
| Config path | `~/Library/Application Support/FlyEnv-Data/...` | `%ProgramFiles%/FlyEnv-Data/...` | `~/.config/FlyEnv-Data/...` | Platform-specific base dir |
| Shutdown | TERM signal | mysqladmin shutdown | TERM signal | Windows uses graceful first |
| Version sources | Brew, MacPorts, local | Local only | Local only | macOS has most sources |

### Windows-Specific Implementation

```typescript
// Shutdown command with full parameters
const command = `"${bin}" --defaults-file="${m}" --connect-timeout=1 
  --shutdown-timeout=1 --protocol=tcp --host="127.0.0.1" 
  --port=${port} -uroot -p${password} shutdown`

// Startup with standalone mode
const params = [
  `--defaults-file="${m}"`,
  `--pid-file="${p}"`,
  '--slow-query-log=ON',
  `--slow-query-log-file="${s}"`,
  `--log-error="${e}"`,
  '--standalone'
]
```

### macOS-Specific Implementation

```typescript
// MacPorts locale directory handling
if (version?.flag === 'macports') {
  params.push(`--lc-messages-dir="/opt/local/share/${basename(version.path)}/english"`)
}

// Version linking for Homebrew
_linkVersion(version) {
  const v = version.bin.split(global.Server.BrewCellar + '/').pop()?.split('/')?.[0]
  const command = `brew unlink ${v} && brew link --overwrite --force ${v}`
}
```

Sources: src/fork/module/Mariadb/index.ts208-289, src/fork/module/Base/index.ts53-82

---

## Version Management

### Version Detection

```typescript
allInstalledVersions(setup)
    │
    ├── Windows: versionLocalFetch(dirs, 'mariadbd.exe')
    │
    └── macOS/Linux:
        ├── versionLocalFetch(dirs, 'mariadbd-safe', 'mariadb')
        └── versionMacportsFetch(fpms)
    │
    └── Parse version: /(Ver )(\d+(\.\d+){1,4})([-\s])/g
```

Sources: src/fork/module/Mariadb/index.ts398-449

### Online Versions

Fetches from FlyEnv API:
```typescript
POST https://api.one-env.com/api/version/fetch
{
  app: 'mariadb',
  os: 'mac' | 'win' | 'linux',
  arch: 'x86' | 'arm'
}
```

Sources: src/fork/module/Base/index.ts301-339

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Port 3306 in use | MySQL/MariaDB already running | Change port in config or stop other service |
| Permission denied | Data directory permissions | Check directory ownership |
| Initialize failed | Corrupted data directory | Delete data-{version} folder to reinitialize |
| Password rejected | Root password changed | Use password reset flow (skip-grant-tables) |
| MacPorts path missing | Locale files not linked | Module auto-links share directory |

### Debug Logging

Enable via `APP-On-Log` events:
- Service start/stop messages
- Database initialization progress
- Password change status
- Backup operation results

Sources: src/fork/module/Mariadb/index.ts50-91

---

## Sources Summary

Key source files referenced:

| File | Lines | Description |
|------|-------|-------------|
| `src/fork/module/Mariadb/index.ts` | 1-822 | Core fork module implementation |
| `src/fork/module/Base/index.ts` | 1-447 | Base class with lifecycle methods |
| `src/render/components/MariaDB/Module.ts` | 1-15 | Module registration |
| `src/render/components/MariaDB/Index.vue` | 1-100 | Main view component |
| `src/render/components/MariaDB/aside.vue` | 1-48 | Sidebar component |
| `src/render/components/MariaDB/Config.vue` | 1-223 | Configuration editor |
| `src/render/components/Mysql/Manage/manage.ts` | 1-289 | Shared database management store |

---

*Document generated following DeepWiki style guidelines*
