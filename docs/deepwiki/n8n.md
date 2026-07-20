# n8n Deep Dive

> **模块类型**: AI/自动化  
> **模块标识**: `n8n`  
> **分析日期**: 2026-04-12  
> **分析基线版本**: 4.13.2

---

## Overview

n8n 是一个开源的工作流自动化平台，FlyEnv 将其作为 AI 类模块集成，提供可视化界面来管理 n8n 服务的生命周期、环境配置和用户管理。与其他模块不同，n8n 采用 SQLite 直接操作实现离线用户管理，无需依赖 n8n 服务运行状态即可管理用户数据。

相关文档链接:
- [Node.js 模块](./nodejs.md) - n8n 基于 Node.js 运行，版本管理依赖 npm
- [Ollama 模块](./ollama.md) - 同属 AI 类别模块

---

## Architecture

### Component Hierarchy Diagram

```
FlyEnv Application
├── Main Process (Application.ts)
│   └── ForkManager
│       └── Fork Process (BaseManager)
│           └── N8N Module (src/fork/module/N8N/)
│               ├── index.ts          # Main module class
│               ├── version.ts        # Version management
│               ├── utils.ts          # Env & path utilities
│               └── database.ts       # SQLite user operations
│
└── Renderer Process (Vue 3 App)
    └── N8N Components (src/render/components/N8N/)
        ├── Module.ts       # Module registration
        ├── Index.vue       # Main layout with tabs
        ├── aside.vue       # Sidebar service control
        ├── Manager.vue     # Version management (npm install)
        ├── Config.vue      # Environment configuration
        ├── Users.vue       # User management UI
        ├── Logs.vue        # Service logs
        └── setup.ts        # Manager composable
```

### Data Flow Sequence

```
1. User Action (UI)
   │
   ▼
2. IPC Request (Renderer)
   │ IPC: app-fork:n8n
   ▼
3. Main Process → ForkManager
   │
   ▼
4. Fork Process (BaseManager.exec())
   │
   ▼
5. N8N Module Method Execution
   ├── _startServer() / _stopServer()
   ├── userList() / userCreate() / userDelete()
   ├── resetOwnerDB() / scanDataDir()
   └── ...
```

### Service Architecture

```
n8n Service Lifecycle
├── Environment Setup
│   ├── initConfig()         # Create n8n.env if not exists
│   ├── parseEnvFile()       # Load environment variables
│   └── resolveDataDir()     # Determine data directory
│
├── Start Sequence (_startServer)
│   ├── Create base directory
│   ├── Parse environment file
│   ├── Build execEnv (SET/export commands)
│   ├── serviceStartExec()   # Spawn process
│   ├── checkPid()           # Wait for process detection
│   └── _autoSetupOwner()    # Auto-configure owner (if first run)
│
└── Stop Sequence (_stopServer)
    ├── Windows: Multi-strategy process kill
    │   ├── PID file-based kill
    │   ├── Port-based kill
    │   └── Process name pattern kill
    └── Unix: Base class standard stop
```

Sources: src/fork/module/N8N/index.ts:54-612 src/fork/module/N8N/utils.ts:1-193

---

## Data Model

### Core Types

| Type | Source | Description |
|------|--------|-------------|
| `SoftInstalled` | `@shared/app` | Standard installed software metadata |
| `OnlineVersionItem` | `@shared/app` | Online version with URL and version string |
| `ForkPromise<T>` | `@shared/ForkPromise` | Promise with progress callbacks |

### n8n User Type (SQLite)

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | UUID primary key |
| `email` | string | User email (unique) |
| `firstName` | string | First name |
| `lastName` | string | Last name |
| `password` | string | Bcrypt hashed password |
| `roleSlug` | string | Role: `global:owner`, `global:admin`, `global:member` |
| `disabled` | boolean | Account disabled flag |
| `createdAt` | string | ISO timestamp |
| `updatedAt` | string | ISO timestamp |
| `isPending` | boolean (computed) | True if password is empty/null |

Sources: src/fork/module/N8N/database.ts:15-45

### Environment Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `N8N_PORT` | `5678` | HTTP server port |
| `N8N_HOST` | `localhost` | Bind host |
| `N8N_PROTOCOL` | `http` | Protocol scheme |
| `N8N_PATH` | `/` | URL base path |
| `N8N_USER_FOLDER` | `~/.n8n` | Data directory path |
| `N8N_OWNER_EMAIL` | - | Initial owner email |
| `N8N_OWNER_PASSWORD` | - | Initial owner password |
| `N8N_ENCRYPTION_KEY` | - | Credentials encryption key |
| `DB_TYPE` | `sqlite` | Database type |
| `WEBHOOK_URL` | - | Public webhook URL |
| `N8N_LOG_LEVEL` | `info` | Log verbosity |
| `EXECUTIONS_PROCESS` | `main` | Execution mode |

Sources: src/fork/module/N8N/utils.ts:157-193

---

## Core Components

### N8N Class (Backend)

Extends `Base` class, implements n8n-specific service management.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `init()` | - | void | Sets `pidPath` to `BaseDir/n8n/n8n.pid` |
| `_startServer()` | `version: SoftInstalled` | `ForkPromise<{APP-Service-Start-PID: string}>` | Starts n8n service with env config |
| `_stopServer()` | `version: SoftInstalled` | `ForkPromise<{APP-Service-Stop-PID: string[]}>` | Windows: multi-strategy kill; Unix: inherits Base |
| `initConfig()` | - | `ForkPromise<string>` | Creates default `.env` file if missing |
| `checkRunning()` | - | `ForkPromise<{running, pid, status}>` | HTTP health check + port fallback |
| `getRunningVersion()` | - | `ForkPromise<{version}>` | Fetches version from `/api/v1/info` |
| `resetOwnerDB()` | - | `ForkPromise<void>` | Deletes `database.sqlite` for fresh setup |
| `fetchAllOnlineVersion()` | - | `ForkPromise<OnlineVersionItem[]>` | npm registry query |
| `allInstalledVersions()` | - | `ForkPromise<SoftInstalled[]>` | Scans common npm paths |
| `getDataDir()` | - | `ForkPromise<{path}>` | Returns effective data directory |
| `setDataDir()` | `newPath: string` | `ForkPromise<void>` | Updates `N8N_USER_FOLDER` in env |
| `scanDataDir()` | - | `ForkPromise<string[]>` | Scans system for n8n data directories |
| `userChangeOwnerPassword()` | `newPassword: string` | `ForkPromise<void>` | Direct DB password update |

Sources: src/fork/module/N8N/index.ts:54-612

### User Management Methods (delegated to database.ts)

| Method | Parameters | Description |
|--------|-----------|-------------|
| `userList()` | - | Query all users from SQLite |
| `userCreate()` | `email, firstName, lastName, role, password` | Create new user with bcrypt hash |
| `userDelete()` | `userId: string` | Delete user (protects owner) |
| `userSetDisabled()` | `userId, disabled` | Enable/disable account |
| `userSetRole()` | `userId, roleSlug` | Change role (protects owner) |
| `userSetName()` | `userId, firstName, lastName` | Update name fields |
| `userResetPassword()` | `userId, newPassword` | Reset any user's password |

Sources: src/fork/module/N8N/database.ts:1-318

### Utility Functions (utils.ts)

| Function | Returns | Description |
|----------|---------|-------------|
| `getEnvFilePath()` | `string` | Path to `n8n/n8n.env` |
| `getPort()` | `Promise<string>` | Reads `N8N_PORT` (default 5678) |
| `parseEnvFile()` | `Promise<Record<string,string>>` | Parses env file to dict |
| `getN8nConfig()` | `Promise<{port,email,password}>` | Core config values |
| `resolveDataDir()` | `Promise<string>` | Effective data directory |
| `resolveN8nModulesDir()` | `Promise<string\|null>` | Finds n8n's node_modules for sqlite3/bcryptjs |
| `runNodeScript()` | `Promise<string>` | Execute JS via system node |
| `getSqlite3Path()` | `Promise<string>` | Path to n8n's sqlite3 module |
| `getBcryptPath()` | `Promise<string>` | Path to n8n's bcryptjs module |
| `getDbFilePath()` | `Promise<string>` | Path to `database.sqlite` |

Sources: src/fork/module/N8N/utils.ts:1-193

---

## Lifecycle Management

### Start Service Flow

```
_startServer(version)
│
├── 1. Environment Preparation
│   ├── mkdirp(BaseDir/n8n)
│   └── initConfig() → creates n8n.env if missing
│
├── 2. Configuration Loading
│   ├── parseEnvFile(envFile) → opt dict
│   └── resolveDataDir() → effectiveDataDir
│
├── 3. Environment Variable Setup
│   ├── Windows: SET KEY=VALUE\r\n format
│   └── Unix: export KEY="VALUE"\n format
│
├── 4. Process Spawn
│   ├── Windows: serviceStartExecCMD()
│   └── Unix: serviceStartExec()
│   └── Args: 'start'
│
├── 5. Process Detection (checkPid)
│   ├── Poll process list for 'n8n' + 'start'
│   ├── Max 10 attempts, 2s interval
│   └── Returns PID on success
│
└── 6. Auto Owner Setup (conditional)
    ├── Checks if database.sqlite exists
    ├── If N8N_OWNER_EMAIL + N8N_OWNER_PASSWORD set
    ├── Polls /healthz endpoint (30 attempts, 2s)
    └── POSTs to /rest/owner/setup
```

### Stop Service Flow (Windows Special)

```
_stopServer(version)
│
├── 1. PID File Kill
│   ├── Read pid/{type}.pid
│   └── Get process tree by PID
│
├── 2. Port-based Kill
│   ├── getPort() → N8N_PORT
│   └── fetchProcessPidByPort(port)
│
├── 3. Pattern Kill
│   └── ProcessListSearch('\\n8n\\')
│
├── 4. Execute Kill
│   └── ProcessKill('-9', [...allPids])
│
└── 5. Cleanup
    └── _cleanupPidFiles()
```

Sources: src/fork/module/N8N/index.ts:75-126 src/fork/module/N8N/index.ts:148-258

---

## Configuration

### Configuration File Structure

```
{BaseDir}/
└── n8n/
    ├── n8n.env          # Active configuration
    └── n8n.env.default  # Backup of initial config
```

### Default Env Template

```bash
# n8n Environment Configuration
N8N_PORT=5678
N8N_HOST=localhost
N8N_PROTOCOL=http
N8N_PATH=/

N8N_USER_FOLDER=
N8N_SKIP_OWNER_SETUP=false
N8N_OWNER_EMAIL=
N8N_OWNER_PASSWORD=

DB_TYPE=sqlite
EXECUTIONS_PROCESS=main
EXECUTIONS_MODE=regular

N8N_BASIC_AUTH_ACTIVE=false
N8N_ENCRYPTION_KEY=
WEBHOOK_URL=
N8N_LOG_LEVEL=info
```

### Config UI Components

| Component | File | Responsibility |
|-----------|------|----------------|
| `Config.vue` | `src/render/components/N8N/Config.vue` | Env file editor with common settings panel |
| `Common.vue` | `@/components/Conf/common.vue` | Reusable common settings form |
| `Conf` | `@/components/Conf/index.vue` | Base configuration editor component |

Common settings managed via UI:
- `N8N_PORT`, `N8N_HOST`, `N8N_PROTOCOL`, `N8N_PATH`
- `N8N_USER_FOLDER`, `N8N_ENCRYPTION_KEY`
- `DB_TYPE`, `EXECUTIONS_PROCESS`, `EXECUTIONS_MODE`
- `N8N_METRICS`, `N8N_LOG_LEVEL`, `N8N_LOG_OUTPUT`

Sources: src/fork/module/N8N/utils.ts:157-193 src/render/components/N8N/Config.vue:1-262

---

## API/IPC Interface

### Command Protocol

All commands sent via `IPC.send('app-fork:n8n', command, ...args)`:

| Command | Parameters | Returns | Description |
|---------|-----------|---------|-------------|
| `startService` | `version: SoftInstalled` | `{APP-Service-Start-PID}` | Start n8n service |
| `stopService` | `version: SoftInstalled` | `{APP-Service-Stop-PID}` | Stop n8n service |
| `initConfig` | - | `string` (env file path) | Initialize config file |
| `checkRunning` | - | `{running, pid, status}` | Health check |
| `getRunningVersion` | - | `{version}` | Get running version |
| `resetOwnerDB` | - | `void` | Reset database for fresh setup |
| `fetchAllOnlineVersion` | - | `OnlineVersionItem[]` | Get npm versions |
| `allInstalledVersions` | - | `SoftInstalled[]` | Get installed versions |
| `getDataDir` | - | `{path}` | Get data directory |
| `setDataDir` | `newPath: string` | `void` | Set data directory |
| `scanDataDir` | - | `string[]` | Scan for data dirs |
| **User Management** |
| `userList` | - | `User[]` | List all users |
| `userCreate` | `email, firstName, lastName, role, password` | `User` | Create user |
| `userDelete` | `userId: string` | `void` | Delete user |
| `userSetDisabled` | `userId, disabled` | `void` | Toggle account |
| `userSetRole` | `userId, roleSlug` | `void` | Change role |
| `userSetName` | `userId, firstName, lastName` | `void` | Update name |
| `userResetPassword` | `userId, password` | `void` | Reset password |
| `userChangeOwnerPassword` | `newPassword: string` | `void` | Change owner password |

Sources: src/fork/module/N8N/index.ts:54-612

---

## UI Components

### Component Structure

```
Index.vue (Main Layout)
├── Tab: Service (index 0)
│   └── Service component + Dashboard button (when running)
├── Tab: Version Manager (index 1)
│   └── Manager.vue
├── Tab: Config File (index 2)
│   └── Config.vue
├── Tab: Users (index 3)
│   └── Users.vue
└── Tab: Logs (index 4)
    └── Logs.vue
```

### Component Details

| Component | File | Responsibility |
|-----------|------|----------------|
| `Index.vue` | `src/render/components/N8N/Index.vue` | Tab container, dashboard link |
| `aside.vue` | `src/render/components/N8N/aside.vue` | Sidebar service toggle, running check on startup |
| `Manager.vue` | `src/render/components/N8N/Manager.vue` | npm version install/uninstall via xterm |
| `Config.vue` | `src/render/components/N8N/Config.vue` | Env file editor with common settings |
| `Users.vue` | `src/render/components/N8N/Users.vue` | User management UI (600+ lines) |
| `Logs.vue` | `src/render/components/N8N/Logs.vue` | Service log viewer |
| `setup.ts` | `src/render/components/N8N/setup.ts` | N8NManager class for version management |
| `Module.ts` | `src/render/components/N8N/Module.ts` | Module registration config |

### Users.vue Features

| Feature | Implementation |
|---------|----------------|
| Data Directory Display | Shows `N8N_USER_FOLDER` path, scan/change buttons |
| User List Table | Columns: Name, Email, Role, Status, Actions |
| Add User | Dialog with email, name, role, password |
| Edit Name | First/last name update |
| Change Role | Member/Admin toggle (owner protected) |
| Enable/Disable | Account status toggle (owner protected) |
| Reset Password | Password change for any user |
| Delete User | Confirmation dialog (owner protected) |
| Change Owner Password | Direct DB password update |
| Scan Data Directory | Auto-detect n8n installations across system |

Sources: src/render/components/N8N/Users.vue:1-608

---

## Platform Differences

| Feature | macOS | Windows | Linux | Notes |
|---------|-------|---------|-------|-------|
| Start Service | `serviceStartExec()` | `serviceStartExecCMD()` | Same as macOS | Windows uses CMD wrapper |
| Stop Service | Base class (PID file) | Multi-strategy kill | Base class | Windows needs special handling |
| Process Detection | `lsof -ti :port` | `fetchProcessPidByPort()` | Same as macOS | |
| Data Directory | `~/.n8n` | `%APPDATA%/n8n`, `%USERPROFILE%/.n8n` | `~/.n8n` | Windows scans multiple locations |
| Binary Location | `/usr/local/bin/n8n` | `%APPDATA%/npm/n8n.cmd` | `/usr/bin/n8n` | |
| npm Global Path | `~/.npm-global/bin` | `%APPDATA%/npm` | `~/.npm-global` | |

### Windows Stop Service Special Handling

Windows 版的停止服务实现了三层兜底策略：

1. **PID File Kill**: 读取 `pid/n8n.pid`，终止该进程及其子进程
2. **Port Kill**: 通过端口查找监听进程 (`fetchProcessPidByPort`)
3. **Pattern Kill**: 进程名匹配 `\n8n\` 的 node.exe 进程

Sources: src/fork/module/N8N/index.ts:75-126

---

## Database Operations

### SQLite Direct Access Architecture

n8n 用户管理采用直接 SQLite 数据库操作，核心设计决策：

```
User Management Flow
├── FlyEnv IPC Command
│   └── database.ts method
│       └── Node.js script (temp file)
│           └── System Node executable
│               └── n8n's sqlite3/bcryptjs modules
│                   └── database.sqlite
```

### Why Direct DB Access?

1. **Offline Operation**: 无需 n8n 服务运行即可管理用户
2. **No Credentials Required**: 不需要 owner 密码
3. **Fast Operations**: 绕过 HTTP API，直接 SQL 执行
4. **Reliable**: 避免 n8n API 版本变更影响

### DB Method Implementation Pattern

```typescript
// 1. Build Node.js script as string
const script = `
const sqlite3 = require(${JSON.stringify(sqlite3Path)});
const d = new sqlite3.Database(${JSON.stringify(dbFile)}, ...);
d.all('SELECT ...', [], function(err, rows) {
  process.stdout.write(JSON.stringify(rows));
  d.close(() => process.exit(0));
});
`;

// 2. Write to temp file & execute via system node
const output = await runNodeScript(script);

// 3. Parse JSON output
resolve(JSON.parse(output));
```

Sources: src/fork/module/N8N/database.ts:1-318

---

## Version Management

### Online Version Fetch

- **Source**: npm registry (`https://registry.npmjs.org/n8n`)
- **Filter**: 仅保留稳定版本 (`/^\d+\.\d+\.\d+$/`)
- **Limit**: 最新 20 个版本
- **Sort**: 语义化版本降序

### Installed Version Detection

Scans common installation paths:

| Platform | Paths |
|----------|-------|
| Windows | `%APPDATA%/npm/n8n.cmd`, `%USERPROFILE%/AppData/Roaming/npm/n8n.cmd` |
| Unix | `/usr/local/bin/n8n`, `/usr/bin/n8n`, `/opt/homebrew/bin/n8n` |
| npm Global | `~/.npm-global/bin/n8n`, `~/.yarn/bin/n8n`, `~/.volta/bin/n8n`, `~/.nvm/default/bin/n8n` |
| PATH | `which n8n` / `where n8n` fallback |

### Install/Uninstall

Uses npm global install/uninstall via xterm terminal:

```bash
npm install -g n8n@{version}
npm uninstall -g n8n@{version}
```

Sources: src/fork/module/N8N/version.ts:1-121 src/render/components/N8N/setup.ts:70-101

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| sqlite3 module not found | n8n not installed globally | Install n8n via Manager tab |
| Database locked | n8n is running | Stop n8n service first |
| Owner setup fails | Port conflict or slow startup | Check N8N_PORT, increase health check timeout |
| User changes not reflected | Browser cache | Refresh n8n web UI |
| Data directory not found | Custom N8N_USER_FOLDER | Use "Scan Data Directory" feature |

### Debug Logging

n8n module uses `appDebugLog` for troubleshooting:

```typescript
import { appDebugLog } from '@shared/utils';
appDebugLog('[resolveN8nModulesDir][error]', error);
```

Sources: src/fork/module/N8N/utils.ts:100-103

---

## Sources Summary

| File | Lines | Responsibility |
|------|-------|----------------|
| `src/fork/module/N8N/index.ts` | 1-612 | Main module class |
| `src/fork/module/N8N/version.ts` | 1-121 | Version management |
| `src/fork/module/N8N/utils.ts` | 1-193 | Utilities & env handling |
| `src/fork/module/N8N/database.ts` | 1-318 | SQLite user operations |
| `src/render/components/N8N/Module.ts` | 1-15 | Module registration |
| `src/render/components/N8N/Index.vue` | 1-71 | Main layout |
| `src/render/components/N8N/aside.vue` | 1-88 | Sidebar control |
| `src/render/components/N8N/Manager.vue` | 1-122 | Version manager |
| `src/render/components/N8N/Config.vue` | 1-262 | Configuration editor |
| `src/render/components/N8N/Users.vue` | 1-608 | User management |
| `src/render/components/N8N/setup.ts` | 1-138 | Manager composable |
