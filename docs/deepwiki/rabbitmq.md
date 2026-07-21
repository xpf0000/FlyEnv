# RabbitMQ Deep Dive

> **模块类型**: 消息队列 (Message Queue)  
> **模块标识**: `rabbitmq`  
> **分析日期**: 2026-04-12  
> **分析基线版本**: 4.13.2

---

## Overview

RabbitMQ 模块为 FlyEnv 提供 AMQP 消息队列服务的生命周期管理，支持 Erlang/OTP 分布式节点配置、管理插件自动启用、EPMD (Erlang Port Mapper Daemon) 进程管理等功能。

相关文档链接:
- [Base 模块](./base.md) - 服务生命周期基类
- [Node.js 模块](./nodejs.md) - 常用搭配使用的运行时

---

## Architecture

### Component Hierarchy Diagram

```
RabbitMQ Module
├── Fork Process (src/fork/module/RabbitMQ/index.ts)
│   ├── RabbitMQ Class (extends Base)
│   │   ├── init() - Initialize baseDir & pidPath
│   │   ├── _startServer() - Start RabbitMQ service
│   │   ├── _initConf() - Generate env config file
│   │   ├── _initPlugin() - Enable management plugin
│   │   └── _initEPMD() - Windows EPMD process handler
│   └── Base Class (src/fork/module/Base/index.ts)
│       ├── startService() - Orchestrate start/stop
│       ├── _stopServer() - Process termination
│       └── exec() - IPC command dispatcher
│
├── Renderer Process
│   ├── Module.ts - Module registration
│   ├── Index.vue - Main view (Service/Manager/Config/Logs)
│   ├── aside.vue - Sidebar switch control
│   ├── Config.vue - Environment config editor
│   └── Logs.vue - Log file viewer
│
└── Configuration Files
    ├── rabbitmq-{v}.conf (macOS/Linux) - Shell env vars
    ├── rabbitmq-{v}.bat (Windows) - Batch env vars
    └── rabbitmq-{v}-default.conf - Default config backup
```

### Data Flow Sequence

```
1. User toggles switch in aside.vue
   │
   ▼
2. AsideSetup() calls IPC: app-fork:rabbitmq/startService
   │
   ▼
3. Fork Process (Base.startService)
   │   ├── _stopServer() - Kill existing process
   │   └── _startServer() - Module-specific start
   │
   ▼
4. RabbitMQ._startServer()
   │   ├── _initEPMD() [Windows only]
   │   ├── _initConf() - Create env config file
   │   ├── _initPlugin() - Enable rabbitmq_management
   │   └── serviceStartExec/serviceStartExecCMD
   │
   ▼
5. Process spawned with RABBITMQ_CONF_ENV_FILE
   │
   ▼
6. PID detection via mnesia-{v}/*.pid file
   │
   ▼
7. Response: { 'APP-Service-Start-PID': pid }
```

---

## Data Model

### TypeScript Type Hierarchy

| Type | Location | Description |
|------|----------|-------------|
| `AppModuleItem` | src/render/core/type.ts | Module registration interface |
| `SoftInstalled` | @shared/app.d.ts | Installed version metadata |
| `OnlineVersionItem` | @shared/app.d.ts | Online version download info |

### Module Registration Type

```typescript
interface AppModuleItem {
  moduleType: 'dataQueue'     // Module category
  typeFlag: 'rabbitmq'        // Unique identifier
  label: 'RabbitMQ'           // Display name
  icon: Promise<string>       // SVG icon import
  index: AsyncComponent       // Main view component
  aside: AsyncComponent       // Sidebar component
  asideIndex: 12              // Sidebar order
  isService: true             // Service lifecycle enabled
  isTray: true                // Tray menu enabled
}
```

Sources: src/render/components/RabbitMQ/Module.ts:4-14 src/render/core/type.ts:58

### SoftInstalled Extended Properties

RabbitMQ 使用标准的 `SoftInstalled` 类型，关键字段：

| Field | Type | Description |
|-------|------|-------------|
| `bin` | string | Path to rabbitmq-server executable |
| `path` | string | Installation directory |
| `version` | string | Semantic version (e.g., "3.12.0") |
| `num` | number | Normalized version for sorting |
| `run` | boolean | Current running state |
| `enable` | boolean | Version detection success |

---

## Core Components

### RabbitMQ Class (Fork Process)

| Method | Visibility | Returns | Description |
|--------|------------|---------|-------------|
| `init()` | public | void | Initialize baseDir and pidPath |
| `initConfig()` | public | ForkPromise<string> | Public API for config initialization |
| `_initConf()` | private | ForkPromise<string> | Generate environment config file |
| `_initPlugin()` | private | Promise<void> | Enable rabbitmq_management plugin |
| `_initEPMD()` | private | Promise<void> | Start EPMD daemon on Windows |
| `_startServer()` | protected | ForkPromise<{pid: string}> | Start RabbitMQ service |
| `fetchAllOnlineVersion()` | public | ForkPromise<OnlineVersionItem[]> | Fetch downloadable versions |
| `allInstalledVersions()` | public | ForkPromise<SoftInstalled[]> | Scan local installations |

Sources: src/fork/module/RabbitMQ/index.ts:35-421

### Environment Config Generation

RabbitMQ 使用环境变量配置文件而非传统配置文件：

**macOS/Linux** (`rabbitmq-{v}.conf`):
```bash
NODE_IP_ADDRESS=127.0.0.1
NODENAME=rabbit@localhost
RABBITMQ_LOG_BASE=/path/to/log-{v}
MNESIA_BASE=/path/to/mnesia-{v}
PLUGINS_DIR="/path/to/plugins"
```

**Windows** (`rabbitmq-{v}.bat`):
```batch
set "NODE_IP_ADDRESS=127.0.0.1"
set "NODENAME=rabbit@localhost"
set "RABBITMQ_LOG_BASE=C:\path\to\log-{v}"
set "MNESIA_BASE=C:\path\to\mnesia-{v}"
set "PLUGINS_DIR=C:\path\to\plugins"
```

Sources: src/fork/module/RabbitMQ/index.ts:80-95

---

## Lifecycle Management

### Service Startup Sequence

```
Base.startService(version)
    │
    ├── 1. Validate binary and version exist
    │
    ├── 2. _linkVersion() - Homebrew version linking (macOS/Linux)
    │
    ├── 3. _stopServer() - Kill existing processes
    │      ├── ProcessListFetch() / ProcessPidList()
    │      ├── ProcessSearch() for matching binaries
    │      └── ProcessKill() for each PID
    │
    ├── 4. _startServer(version) - RabbitMQ-specific start
    │      │
    │      ├── [Windows] _initEPMD()
    │      │      ├── Check if epmd.exe already running
    │      │      ├── Query ERLANG_HOME from PowerShell
    │      │      └── Start epmd.exe in background
    │      │
    │      ├── _initConf(version)
    │      │      ├── Create log-{v} directory
    │      │      ├── _initPlugin() - Enable management plugin
    │      │      └── Write env config file
    │      │
    │      ├── Create mnesia-{v} directory
    │      │
    │      ├── Remove stale .pid files
    │      │
    │      ├── Spawn process:
    │      │   export RABBITMQ_CONF_ENV_FILE="..."
    │      │   rabbitmq-server -detached
    │      │
    │      └── Poll for PID file (max 20 x 500ms)
    │          └── Resolve with PID from mnesia-{v}/*.pid
    │
    └── 5. Persist PID to pid/rabbitmq.pid
```

Sources: src/fork/module/Base/index.ts:88-121 src/fork/module/RabbitMQ/index.ts:170-266

### Plugin Initialization

Management 插件在首次配置时自动启用：

| Platform | Method | Command |
|----------|--------|---------|
| Windows | Direct execution | `rabbitmq-plugins.bat enable rabbitmq_management` |
| macOS/Linux | Helper process | `Helper.send('rabbitmq', 'initPlugin', baseDir)` |

Sources: src/fork/module/RabbitMQ/index.ts:104-118

---

## Configuration

### Config File Locations

| Platform | File Path | Format |
|----------|-----------|--------|
| macOS/Linux | `{BaseDir}/rabbitmq/rabbitmq-{v}.conf` | Shell env vars |
| Windows | `{BaseDir}/rabbitmq/rabbitmq-{v}.bat` | Batch set commands |
| All | `{BaseDir}/rabbitmq/rabbitmq-{v}-default.conf` | Backup copy |

Sources: src/fork/module/RabbitMQ/index.ts:65-69 src/render/components/RabbitMQ/Config.vue:33-45

### Log File Detection

日志文件路径从配置文件中动态解析：

```typescript
// 1. Read env config file
const content = await fs.readFile(confFile)

// 2. Extract NODENAME value
const name = content
  .split('\n')
  .find(s => s.includes('NODENAME'))
  ?.split('=')
  ?.pop()
  ?.replace('"', '')
  ?.trim() ?? 'rabbit@localhost'

// 3. Construct log path
filepath = join(logDir, `${name}.log`)
```

Sources: src/render/components/RabbitMQ/Logs.vue:47-55

---

## API/IPC Interface

### Supported IPC Commands

| Command | Parameters | Returns | Description |
|---------|------------|---------|-------------|
| `startService` | version: SoftInstalled | { 'APP-Service-Start-PID': string } | Start RabbitMQ service |
| `stopService` | version: SoftInstalled | void | Stop RabbitMQ service |
| `initConfig` | version: SoftInstalled | string (confFilePath) | Initialize env config |
| `fetchAllOnlineVersion` | - | OnlineVersionItem[] | Get downloadable versions |
| `allInstalledVersions` | setup: AppSetup | SoftInstalled[] | Scan local versions |
| `brewinfo` | - | BrewInfo[] | Get Homebrew formula info |
| `portinfo` | - | PortInfo | Get MacPorts info |

Sources: src/fork/module/Base/index.ts:34-43 src/fork/module/RabbitMQ/index.ts

### Version Detection

| Platform | Binary | Command | Regex |
|----------|--------|---------|-------|
| Windows | rabbitmqctl.bat | `"path" version` | `/(.*?)(\d+(\.\d+){1,4})(.*?)/g` |
| macOS/Linux | rabbitmqctl | `"path" version` | `/(.*?)(\d+(\.\d+){1,4})(.*?)/g` |

Sources: src/fork/module/RabbitMQ/index.ts:330-356

---

## Platform Differences

| Feature | macOS/Linux | Windows | Notes |
|---------|-------------|---------|-------|
| EPMD handling | Not needed | Required | Windows requires explicit EPMD startup |
| Config format | Shell env | Batch vars | Different syntax for env variables |
| Plugin init | Helper process | Direct exec | Unix uses privileged helper |
| Version linking | Homebrew unlink/link | N/A | Only for Homebrew installs |
| Binary names | `rabbitmq-server` | `rabbitmq-server.bat` | Windows batch wrappers |
| Path separators | Forward `/` | Backward `\` | Normalized via `pathFixedToUnix()` |

### Windows-Specific EPMD Management

Windows 平台需要显式管理 Erlang Port Mapper Daemon：

```typescript
async _initEPMD() {
  // 1. Check if already running
  const pids = await ProcessListSearch('epmd.exe', false)
  if (pids?.length > 0) return
  
  // 2. Find ERLANG_HOME
  const stdout = await execPromise(
    'Write-Host "##FlyEnv-ERLANG_HOME$($env:ERLANG_HOME)FlyEnv-ERLANG_HOME##"',
    { shell: 'powershell.exe' }
  )
  
  // 3. Locate epmd.exe
  const bin = join(erlangHome, 'erts-{version}', 'bin/epmd.exe')
  
  // 4. Start in background
  await execPromise('start /B ./epmd.exe > NUL 2>&1', {
    cwd: dirname(bin),
    shell: 'cmd.exe'
  })
}
```

Sources: src/fork/module/RabbitMQ/index.ts:120-168

---

## UI Components

### Component Hierarchy

```
Index.vue (Main View)
├── el-radio-group (Tab navigation)
│   ├── tab[0]: Service component
│   │   └── Service control (start/stop)
│   │   └── Management UI link (port 15672)
│   ├── tab[1]: Manager component
│   │   └── Version installation/management
│   ├── tab[2]: Config.vue
│   │   └── Conf component (env file editor)
│   └── tab[3]: Logs.vue
│       └── LogVM component (log viewer)
│
aside.vue (Sidebar)
├── Icon block (running state indicator)
├── Title "RabbitMQ"
└── el-switch (service toggle)
```

Sources: src/render/components/RabbitMQ/Index.vue src/render/components/RabbitMQ/aside.vue

### State Management

| State | Store | Accessor | Description |
|-------|-------|----------|-------------|
| Current version | AppStore | `config.server.rabbitmq.current` | Selected version path |
| Installed list | BrewStore | `module('rabbitmq').installed` | All installed versions |
| Running state | BrewStore | `currentVersion.run` | Service running status |

Sources: src/render/components/RabbitMQ/Index.vue:45-56

---

## Directory Structure

```
{FlyEnv BaseDir}/rabbitmq/
├── rabbitmq-{v}.conf        # Environment config (Unix)
├── rabbitmq-{v}.bat         # Environment config (Windows)
├── rabbitmq-{v}-default.conf # Default config backup
├── log-{v}/                 # Log directory per version
│   └── rabbit@localhost.log # Node log file
└── mnesia-{v}/              # Mnesia database per version
    └── rabbit@localhost.pid # PID file
```

---

## Sources Summary

| File | Lines | Description |
|------|-------|-------------|
| src/fork/module/RabbitMQ/index.ts | 1-421 | Core service implementation |
| src/fork/module/Base/index.ts | 1-150 | Base class lifecycle methods |
| src/render/components/RabbitMQ/Module.ts | 1-15 | Module registration |
| src/render/components/RabbitMQ/Index.vue | 1-70 | Main view component |
| src/render/components/RabbitMQ/aside.vue | 1-52 | Sidebar control |
| src/render/components/RabbitMQ/Config.vue | 1-61 | Config editor |
| src/render/components/RabbitMQ/Logs.vue | 1-69 | Log viewer |
| src/render/core/type.ts | 58 | AppModuleEnum definition |
