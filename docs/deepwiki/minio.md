# MinIO Deep Dive

> **模块类型**: Object Storage  
> **模块标识**: `minio`  
> **分析日期**: 2026-04-12  
> **分析基线版本**: 4.13.2

---

## Overview

MinIO 模块为 FlyEnv 提供高性能对象存储服务管理能力。MinIO 是一个与 Amazon S3 API 兼容的开源对象存储服务器，适用于存储非结构化数据（图片、视频、日志文件、备份等）。

相关文档链接:
- [Base 模块](./base.md) - 服务基类，MinIO 继承自此模块
- [Module 系统](./module-system.md) - 模块核心架构
- [MinIO 官方文档](https://min.io/docs/minio/linux/index.html)

---

## Architecture

### Component Hierarchy

```
Renderer Process
├── Module.ts (Module class)
│   └── installed: ModuleInstalledItem[]
│       └── start() / stop() / restart()
├── aside.vue (Sidebar Control)
│   └── el-switch (Service toggle)
├── Index.vue (Main Panel)
│   ├── Service (Service control)
│   ├── Manager (Version management)
│   ├── Config (Configuration editor)
│   └── Logs (Log viewer)
└── setup.ts (Storage dir persistence)

Fork Process
├── BaseManager
│   └── minio → Minio module
└── Minio/index.ts (Minio class)
    └── extends Base
        ├── _startServer()
        ├── _stopServer() (inherited)
        └── initConfig()
```

### Data Flow Sequence

```
1. User toggles service switch (aside.vue)
   │
   ▼
2. ModuleInstalledItem.start() / .stop()
   │ IPC: app-fork:minio
   ▼
3. BaseManager.exec() → Minio.exec()
   │
   ▼
4. Base.startService() / Base.stopService()
   │ calls
   ▼
5. Minio._startServer() / Base._stopServer()
   │ spawns
   ▼
6. minio process (system process)
```

Sources: src/render/components/Minio/aside.vue:14-20 src/render/core/Module/ModuleInstalledItem.ts:44-93 src/fork/module/Minio/index.ts:108-241

---

## Data Model

### TypeScript Interfaces

#### MinIO Configuration Environment Variables

| Variable | Type | Default | Category | Description |
|----------|------|---------|----------|-------------|
| `MINIO_ADDRESS` | string | `:9000` | Network | Bind address and port for S3 API |
| `MINIO_CONSOLE_ADDRESS` | string | - | Network | Static port for Web Console |
| `MINIO_CERTS_DIR` | string | `${HOME}/.minio/certs` | Security | TLS certificate directory |
| `MINIO_ROOT_USER` | string | `minioadmin` | Security | Root access key |
| `MINIO_ROOT_PASSWORD` | string | `minioadmin` | Security | Root secret key |
| `MINIO_BROWSER` | enum | `on` | General | Enable/disable Web UI |
| `MINIO_DOMAIN` | string | - | Network | Virtual host style domain |
| `MINIO_SITE_NAME` | string | - | General | Site identifier |
| `MINIO_SITE_REGION` | string | - | General | Server location |

Sources: src/render/components/Minio/Config.vue:40-347 src/lang/en/minio.json

#### Module Registration (AppModuleItem)

```typescript
{
  moduleType: 'objectStorage',
  typeFlag: 'minio',
  label: 'Minio',
  icon: import('@/svg/minio.svg?raw'),
  index: Index.vue,
  aside: aside.vue,
  asideIndex: 4,
  isService: true,
  isTray: true
}
```

Sources: src/render/components/Minio/Module.ts:4-14

#### Storage Directory State

```typescript
interface MinioSetup {
  dir: Record<string, string>  // Map<binaryPath, dataDirectory>
  init(): void
  save(): void
}
```

Sources: src/render/components/Minio/setup.ts:4-26

---

## Core Components

### Minio Class (Fork Process)

MinIO 服务核心类，继承自 Base 模块。

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `init()` | - | void | Initialize PID path: `{BaseDir}/minio/minio.pid` |
| `initConfig()` | - | ForkPromise<string> | Create config file: `{BaseDir}/minio/minio.conf` |
| `_startServer()` | version: SoftInstalled, DATA_DIR?: string | ForkPromise<void> | Start MinIO server process |
| `fetchAllOnlineVersion()` | - | ForkPromise<OnlineVersionItem[]> | Fetch available versions from MinIO official |
| `allInstalledVersions()` | setup: any | ForkPromise<SoftInstalled[]> | Scan local installed versions |
| `_installSoftHandle()` | row: any | Promise<void> | Install binary from downloaded zip |
| `brewinfo()` | - | ForkPromise<any> | Get Homebrew package info |

Sources: src/fork/module/Minio/index.ts:28-315

### Service Startup Parameters

The `_startServer()` method constructs the following command:

```bash
# macOS/Linux
export MINIO_ADDRESS=":9000"
export MINIO_ROOT_USER="minioadmin"
export MINIO_ROOT_PASSWORD="minioadmin"
...
minio server "{dataDir}" --address "{address}" --console-address "{console_address}" --certs-dir "{certs_dir}"

# Windows PowerShell
$env:MINIO_ADDRESS=":9000"
...
minio server `"{dataDir}`" --address "{address}" --console-address "{console_address}"
```

Sources: src/fork/module/Minio/index.ts:108-241

### Frontend Module Classes

#### Module (State Management)

| Property | Type | Description |
|----------|------|-------------|
| `typeFlag` | AllAppModule | Module identifier: `'minio'` |
| `isService` | boolean | Can start/stop: `true` |
| `isOnlyRunOne` | boolean | Single instance only: `true` |
| `installed` | ModuleInstalledItem[] | Installed versions list |
| `static` | ModuleStaticItem[] | Static/online versions |
| `startExtParam` | ExtParamFn | Callback for start parameters |

| Method | Description |
|--------|-------------|
| `fetchInstalled()` | Load installed versions via IPC |
| `fetchStatic()` | Load available online versions |
| `start()` / `stop()` | Control service state |

Sources: src/render/core/Module/Module.ts:15-374

#### ModuleInstalledItem (Version Instance)

| Property | Type | Description |
|----------|------|-------------|
| `bin` | string | Binary file path |
| `version` | string | Version string |
| `path` | string | Installation directory |
| `run` | boolean | Current running state |
| `pid` | string | Process ID when running |
| `enable` | boolean | Version is valid |

| Method | Description |
|--------|-------------|
| `start()` | Start this version via IPC `app-fork:minio` |
| `stop()` | Stop this version |
| `restart()` | Restart service |

Sources: src/render/core/Module/ModuleInstalledItem.ts:11-186

---

## Lifecycle Management

### Service Startup Flow

```
User clicks start switch
        │
        ▼
AsideSetup.switchChange()
        │
        ▼
ModuleInstalledItem.start()
   - Sets running = true
   - Calls _onStart(this)
        │
        ▼
Module.startExtParam(version)
   - Returns [DATA_DIR] from MinioSetup.dir
        │
        ▼
IPC.send('app-fork:minio', 'startService', version, DATA_DIR)
        │
        ▼
Minio.startService() (inherited from Base)
   - Validates binary exists
   - Calls _linkVersion() (Homebrew)
   - Calls _stopServer() (stop existing)
   - Calls _startServer()
        │
        ▼
Minio._startServer(version, DATA_DIR)
   1. Creates data directory
   2. Parses minio.conf environment variables
   3. Builds exec command with flags
   4. Spawns process via serviceStartExec()
   5. Persists PID to pid/minio.pid
        │
        ▼
Service running
```

Sources: src/render/core/Module/ModuleInstalledItem.ts:44-93 src/fork/module/Base/index.ts:88-121 src/fork/module/Minio/index.ts:108-241

### Service Stop Flow

```
User clicks stop switch
        │
        ▼
ModuleInstalledItem.stop()
        │
        ▼
IPC.send('app-fork:minio', 'stopService', version)
        │
        ▼
Base._stopServer(version)
   1. Fetches process list
   2. Collects PIDs from:
      - pid/minio.pid file
      - version.pid
      - Process search by name "minio"
   3. Sends -INT signal to all PIDs
   4. Removes pid file
        │
        ▼
Service stopped
```

Sources: src/render/core/Module/ModuleInstalledItem.ts:95-130 src/fork/module/Base/index.ts:123-250

### Data Directory Resolution

```typescript
// Priority order:
1. MinioSetup.dir[version.bin]  // User custom path (persisted)
2. {BaseDir}/minio/data         // Default path
```

Sources: src/render/components/Minio/Index.vue:87-104 src/render/components/Minio/setup.ts:4-26

---

## Configuration System

### Configuration File

| Property | Value |
|----------|-------|
| File Path | `{BaseDir}/minio/minio.conf` |
| Format | Environment variables (KEY=VALUE) |
| Created By | `Minio.initConfig()` |

### Environment Variable Processing

The `_startServer()` method reads `minio.conf` and parses lines starting with `MINIO_`:

```typescript
const getConfEnv = async () => {
  const content = await readFile(iniFile, 'utf-8')
  const arr = content
    .split('\n')
    .filter((s) => s.trim().startsWith('MINIO_'))
    .map((s) => s.trim())
  const dict: Record<string, string> = {}
  arr.forEach((a) => {
    const item = a.split('=')
    const k = item.shift()
    const v = item.join('=')
    if (k) dict[k] = v
  })
  return dict
}
```

Special variables extracted for command-line flags:
- `MINIO_ADDRESS` → `--address`
- `MINIO_CONSOLE_ADDRESS` → `--console-address`
- `MINIO_CERTS_DIR` → `--certs-dir`

Sources: src/fork/module/Minio/index.ts:128-147

### UI Configuration Editor

Config.vue provides a visual editor for environment variables:

| Feature | Implementation |
|---------|---------------|
| Visual Form | Common.vue component with `CommonSetItem[]` |
| Raw Text Edit | Conf.vue Monaco editor |
| Auto-sync | Bidirectional sync between form and text |
| Validation | Real-time regex matching for MINIO_* patterns |

Sources: src/render/components/Minio/Config.vue:1-429

---

## API/IPC Interface

### Command Mapping

| Command | Handler | Parameters | Description |
|---------|---------|-----------|-------------|
| `startService` | `Base.startService()` | version, DATA_DIR | Start MinIO service |
| `stopService` | `Base.stopService()` | version | Stop MinIO service |
| `initConfig` | `Minio.initConfig()` | - | Create default config |
| `allInstalledVersions` | `Version.allInstalledVersions()` | typeFlag, setup | List installed versions |
| `installSoft` | `Base.installSoft()` | row | Download and install |
| `brewinfo` | `Minio.brewinfo()` | - | Get Homebrew info |

Sources: src/fork/BaseManager.ts:328-334

### IPC Communication Pattern

```typescript
// Frontend → Fork
IPC.send('app-fork:minio', 'startService', version, DATA_DIR)
  .then((key: string, res: any) => {
    // res.code: 0=success, 1=error, 200=progress
    // res.data: { 'APP-Service-Start-PID': pid }
  })

// Fork → Frontend (progress)
on({
  'APP-On-Log': { type, message },
  'APP-Service-Start-Success': true
})
```

Sources: src/render/core/Module/ModuleInstalledItem.ts:64-91 src/fork/Fn.ts

---

## Version Management

### Static Version (Official Binary)

MinIO uses official pre-built binaries rather than package managers:

| Platform | URL Pattern |
|----------|-------------|
| macOS (arm64) | `https://dl.min.io/server/minio/release/darwin-arm64/minio` |
| macOS (amd64) | `https://dl.min.io/server/minio/release/darwin-amd64/minio` |
| Linux (arm64) | `https://dl.min.io/server/minio/release/linux-arm64/minio` |
| Linux (amd64) | `https://dl.min.io/server/minio/release/linux-amd64/minio` |
| Windows | `https://dl.min.io/server/minio/release/windows-amd64/minio.exe` |

Sources: src/fork/module/Minio/index.ts:52-106

### Version Detection

```typescript
// Command: minio --version
// Regex: /(version )(.*?)( )/g
// Example output: "minio version RELEASE.2024-01-01T00-00-00Z"
```

Sources: src/fork/module/Minio/index.ts:243-279

---

## Platform Differences

| Feature | macOS | Linux | Windows |
|---------|-------|-------|---------|
| Binary name | `minio` | `minio` | `minio.exe` |
| Install method | Direct download | Direct download | Direct download |
| Environment export | `export KEY="value"` | `export KEY="value"` | `$env:KEY="value"` |
| Path in args | `"{dataDir}"` | `"{dataDir}"` | `\`"{dataDir}\`"` |
| xattr fix | Yes (after install) | No | N/A |

Sources: src/fork/module/Minio/index.ts:52-300

---

## UI Components

### Main Panel (Index.vue)

| Tab | Component | Purpose |
|-----|-----------|---------|
| 0 | Service | Service control, data dir selector, open URL |
| 1 | Manager | Version installation and management |
| 2 | Config | Environment variable configuration |
| 3 | Logs | Service log viewer |

Sources: src/render/components/Minio/Index.vue:1-129

### Sidebar (aside.vue)

- Icon: MinIO logo SVG
- Toggle: el-switch for quick start/stop
- Navigation: Click to open MinIO panel
- State indicator: `run` class when service active

Sources: src/render/components/Minio/aside.vue:1-65

---

## Integration Points

### Store Integration

```typescript
// BrewStore - Module state
brewStore.module('minio'): Module
brewStore.currentVersion('minio'): SoftInstalled

// AppStore - Server current selection
appStore.serverCurrent('minio'): { current: SoftInstalled }
```

Sources: src/render/components/Minio/Index.vue:77-85

### URL Opening

When service is running, clicking the URL button opens:
```
http://127.0.0.1:{MINIO_PORT}/
```
Port parsed from `MINIO_ADDRESS` in minio.conf (default: 9000)

Sources: src/render/components/Minio/Index.vue:114-128

---

## Security Considerations

1. **Default Credentials**: MinIO defaults to `minioadmin/minioadmin` - should be changed in production
2. **Data Directory Permissions**: Created with default filesystem permissions
3. **TLS/SSL**: Supported via `MINIO_CERTS_DIR` environment variable
4. **No Root Access Control**: Module does not require elevated privileges

Sources: src/render/components/Minio/Config.vue:40-91

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Port already in use | Another MinIO instance running | Stop existing instance or change MINIO_ADDRESS |
| Permission denied | Binary not executable | Run `chmod +x` on minio binary (Unix) |
| Cannot access console | MINIO_BROWSER=off | Enable in configuration |
| Data not persisted | Wrong data directory | Verify DATA_DIR path in UI |

---

*Document generated following DeepWiki style guidelines*
