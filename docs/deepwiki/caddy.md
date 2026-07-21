# Caddy Deep Dive

> **模块类型**: Web服务器  
> **模块标识**: `caddy`  
> **分析日期**: 2026-04-12  
> **分析基线版本**: 4.13.2

---

## Overview

Caddy 模块是 FlyEnv 的现代 Web 服务器组件，提供自动 HTTPS、HTTP/2 和简洁配置的服务托管功能。与 Nginx/Apache 不同，Caddy 使用 Caddyfile 作为配置格式，并内置自动 SSL 证书管理功能。

相关文档链接:
- [Nginx](./nginx.md) - 同类 Web 服务器实现对比
- [Apache](./apache.md) - 同类 Web 服务器实现对比
- [Host](../host.md) - 虚拟主机配置管理

---

## Architecture

### Component Hierarchy Diagram

```
Renderer Process (Frontend)
├── aside.vue                    # Sidebar switch control
│   └── AsideSetup('caddy')      # State management composable
├── Index.vue                    # Main panel with tabs
│   ├── Service (tab=0)          # Service control panel
│   ├── Manager (tab=1)          # Version management
│   ├── Config (tab=2)           # Caddyfile editor
│   └── Logs (tab=3)             # Log viewer
└── Module.ts                    # Module registration

Main Process
└── ForkManager
    └── Fork Process
        └── BaseManager
            └── Caddy (src/fork/module/Caddy/index.ts)
                ├── _startServer()    # Service startup
                ├── _stopService()    # Service shutdown (inherited)
                ├── initConfig()      # Caddyfile initialization
                └── #fixVHost()       # Virtual host generation
```

### Data Flow Sequence

```
1. User clicks Start/Stop Switch (aside.vue)
   │
   ▼
2. AsideSetup.switchChange()
   │ IPC: app-fork:caddy
   ▼
3. Fork Process - Base.startService()
   │
   ├──► _stopServer()      # Stop existing instance
   └──► _startServer()     # Caddy-specific startup
        │
        ├──► #fixVHost()         # Generate virtual host configs
        ├──► initConfig()        # Initialize Caddyfile if not exists
        └──► serviceStartExec()  # Execute caddy binary
             │
             ├──► [Windows] serviceStartExecCMD()
             └──► [Unix] serviceStartExec(root: isLinux)
                  └──► Spawn flyenv-async-exec.sh
                  └──► Wait for PID file
   │
   ▼
4. PID File Monitoring
   │
   ▼
5. Service Status Update
   │ IPC: APP-Service-Start-PID
   ▼
6. UI State Update (aside.vue)
```

Sources: src/render/components/Caddy/aside.vue:24-47 src/fork/module/Base/index.ts:88-121 src/fork/module/Caddy/index.ts:138-194

---

## Data Model

### Core Types

| Type | Location | Description |
|------|----------|-------------|
| `AppModuleItem` | src/render/core/type.ts:97-133 | Module registration structure |
| `SoftInstalled` | @shared/app | Installed version metadata |
| `OnlineVersionItem` | @shared/app | Online version for download |
| `ModuleInstalledItem` | src/render/core/Module/ModuleInstalledItem.ts | Frontend version wrapper |

### Module Configuration Interface

```typescript
interface AppModuleItem {
  moduleType: 'webServer'      // Module category
  typeFlag: 'caddy'            // Unique identifier
  label: 'Caddy'               // Display name
  icon: SVGImport              // Module icon
  index: Component             // Main view component
  aside: Component             // Sidebar component
  asideIndex: 3                // Sort order in sidebar (after nginx, apache)
  isService: true              // Can start/stop
  isTray: true                 // Show in tray menu
}
```

Sources: src/render/components/Caddy/Module.ts:1-15 src/render/core/type.ts:37-86

### Caddy Module State (BrewStore)

```typescript
interface CaddyModuleState {
  installed: ModuleInstalledItem[]    // Local installed versions
  brew: ModuleHomebrewItem[]          // Homebrew available versions
  port: ModuleMacportsItem[]          // MacPorts available versions
  static: ModuleStaticItem[]          // Static build versions
  staticDowing: ModuleStaticItem[]    // Currently downloading
  brewFetching: boolean
  portFetching: boolean
  staticFetching: boolean
}
```

Sources: src/render/core/Module/Module.ts:15-41

---

## Core Components

### 1. Backend: Caddy Class (Fork Process)

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `init()` | - | void | Initialize PID path: `{BaseDir}/caddy/caddy.pid` |
| `_startServer()` | `version: SoftInstalled` | `ForkPromise<void>` | Platform-specific startup logic |
| `_stopService()` | `version: SoftInstalled` | `ForkPromise<void>` | Inherited from Base class |
| `initConfig()` | - | `ForkPromise<string>` | Initialize Caddyfile from template |
| `#fixVHost()` | - | `Promise<void>` | Generate virtual host configs for all sites |
| `fetchAllOnlineVersion()` | - | `ForkPromise<OnlineVersionItem[]>` | Fetch available versions from API |
| `allInstalledVersions()` | `setup: any` | `ForkPromise<SoftInstalled[]>` | Scan local installations |
| `brewinfo()` | - | `ForkPromise<any>` | Get Homebrew package info |
| `portinfo()` | - | `ForkPromise<any>` | Get MacPorts package info |

Sources: src/fork/module/Caddy/index.ts:28-305

### 2. Frontend: Module Registration (Module.ts)

```typescript
const module: AppModuleItem = {
  moduleType: 'webServer',
  typeFlag: 'caddy',
  label: 'Caddy',
  icon: import('@/svg/caddy.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 3,
  isService: true,
  isTray: true
}
```

Sources: src/render/components/Caddy/Module.ts:1-15

### 3. Frontend: Aside Component (aside.vue)

| Property | Type | Description |
|----------|------|-------------|
| `showItem` | `ComputedRef<boolean>` | Module visibility in sidebar |
| `serviceDisabled` | `ComputedRef<boolean>` | Switch disabled state |
| `serviceRunning` | `ComputedRef<boolean>` | Current running status |
| `serviceFetching` | `ComputedRef<boolean>` | Operation in progress |
| `currentPage` | `ComputedRef<string>` | Active route path |
| `switchChange()` | `() => void` | Toggle service on/off |
| `groupDo()` | `(isRunning: boolean) => Promise[]` | Batch operation handler |

Sources: src/render/components/Caddy/aside.vue:24-47

### 4. Frontend: Index Component (Index.vue)

Tab-based main panel with 4 sections:

| Tab Index | Component | Description |
|-----------|-----------|-------------|
| 0 | `Service` | Service control and status |
| 1 | `Manager` | Version installation/management |
| 2 | `Config` | Caddyfile editor |
| 3 | `Logs` | Caddy log viewer |

Sources: src/render/components/Caddy/Index.vue:1-39

---

## Lifecycle Management

### Service Startup Flow

```
startService(version) [Base class]
    │
    ├──► Check binary exists (non-Windows)
    ├──► Check version is set
    ├──► _linkVersion(version)     # Homebrew link/unlink (no-op for Caddy)
    │
    ├──► _stopServer(version)      # Kill existing processes
    │    │
    │    ├──► Read PID from file: pid/caddy.pid
    │    ├──► Search process by name: "caddy"
    │    └──► Send -INT signal to processes
    │
    └──► _startServer(version)     # [Caddy class override]
         │
         ├──► #fixVHost()
         │    └──► Fetch all PHP hosts from host.json
         │    └──► Generate {host.name}.conf for each site in vhost/caddy/
         │    └──► Support both HTTP and HTTPS (SSL) configs
         │
         ├──► initConfig()
         │    └──► Check if Caddyfile exists
         │    └──► If not, create from tmpl/Caddyfile
         │    └──► Replace ##SSL_ROOT##, ##LOG_FILE##, ##VHOST-DIR## placeholders
         │
         └──► Execute binary
              ├──► [Windows] serviceStartExecCMD()
              │    └──► caddy.exe start --config "Caddyfile" --pidfile "caddy.pid" --watch
              └──► [Unix] serviceStartExec(root: isLinux)
                   └──► caddy start --config "Caddyfile" --pidfile "caddy.pid" --watch
```

Sources: src/fork/module/Base/index.ts:88-121 src/fork/module/Caddy/index.ts:138-194

### Service Stop Flow

```
_stopServer(version) [Base class]
    │
    ├──► Read PID file: {BaseDir}/pid/caddy.pid
    ├──► Search processes by name "caddy"
    │    └──► Filter by FlyEnv data directories
    ├──► Collect all PIDs
    │
    ├──► [Windows] ProcessKill('-INT', pids)
    └──► [Unix] ProcessKill('-INT', pids)
         └──► Caddy uses -INT (graceful shutdown)
    │
    ├──► Delete PID file
    └──► Emit APP-Service-Stop-Success
```

Sources: src/fork/module/Base/index.ts:123-250

### Virtual Host Generation (#fixVHost)

```
#fixVHost()
    │
    ├──► Fetch all hosts from host.json
    ├──► Filter hosts: only PHP type or no type specified
    ├──► Create vhost/caddy/ directory if not exists
    │
    ├──► For each host:
    │    │
    │    ├──► Skip if conf file already exists
    │    ├──► Generate HTTP config from tmpl/CaddyfileVhost
    │    ├──► If useSSL:
    │    │    └──► Generate HTTPS config from tmpl/CaddyfileVhostSSL
    │    │    └──► Use "internal" TLS or custom cert/key
    │    └──► Write to vhost/caddy/{host.name}.conf
    │
    └──► Caddyfile includes vhost/caddy/*.conf via import directive
```

Sources: src/fork/module/Caddy/index.ts:68-136

---

## API/IPC Interface

### IPC Commands

Caddy 模块通过 `app-fork:caddy` 通道与 Fork 进程通信。

| Command | Parameters | Returns | Description |
|---------|-----------|---------|-------------|
| `startService` | `version: SoftInstalled` | `{ 'APP-Service-Start-PID': string }` | Start Caddy service |
| `stopService` | `version: SoftInstalled` | `{ 'APP-Service-Stop-PID': string[] }` | Stop Caddy service |
| `fetchAllOnlineVersion` | - | `OnlineVersionItem[]` | Get downloadable versions |
| `allInstalledVersions` | `setup: any` | `SoftInstalled[]` | Get local versions |
| `installSoft` | `row: OnlineVersionItem` | `boolean` | Download and install |
| `brewinfo` | - | `any` | Homebrew package info |
| `portinfo` | - | `any` | MacPorts package info |
| `initConfig` | - | `string` | Initialize Caddyfile |

Sources: src/fork/module/Base/index.ts:34-43 src/fork/module/Caddy/index.ts:38-66

### IPC Progress Events

| Event Key | Payload | Description |
|-----------|---------|-------------|
| `APP-On-Log` | `string` | Log message for UI display |
| `APP-Service-Start-Success` | `true` | Service started successfully |
| `APP-Service-Stop-Success` | `true` | Service stopped successfully |
| `downState` | `'success' \| 'exception'` | Download/install status |
| `progress` | `number` | Download progress (0-100) |

Sources: src/fork/Fn.ts:160-167

---

## Configuration

### Directory Structure

| Platform | Config Path | PID Path | Log Path | Vhost Path |
|----------|-------------|----------|----------|------------|
| All | `{BaseDir}/caddy/Caddyfile` | `{BaseDir}/caddy/caddy.pid` | `{BaseDir}/caddy/caddy.log` | `{BaseDir}/vhost/caddy/` |

Sources: src/render/components/Caddy/Config.vue:21-26 src/render/components/Caddy/Logs.vue:18-19

### Caddyfile Template Variables

Caddy 配置模板支持以下占位符替换：

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `##SSL_ROOT##` | SSL certificates directory | `/Users/xxx/FlyEnv/caddy/ssl` |
| `##LOG_FILE##` | Main log file path | `/Users/xxx/FlyEnv/caddy/caddy.log` |
| `##VHOST-DIR##` | Virtual host configs directory | `/Users/xxx/FlyEnv/vhost/caddy` |

Sources: src/fork/module/Caddy/index.ts:53-56

### Virtual Host Templates

#### Standard HTTP (CaddyfileVhost)

```caddy
##HOST-ALL## {
    root * ##ROOT##
    encode gzip
    file_server
    php_fastcgi 127.0.0.1:90##PHP-VERSION##
    log {
        output file ##LOG-PATH##
    }
}
```

#### SSL HTTPS (CaddyfileVhostSSL)

```caddy
##HOST-ALL## {
    tls ##SSL##
    root * ##ROOT##
    encode gzip
    file_server
    php_fastcgi 127.0.0.1:90##PHP-VERSION##
    log {
        output file ##LOG-PATH##
    }
}
```

Sources: src/fork/module/Host/Host.ts:47-64

### Virtual Host Placeholders

| Placeholder | Description | Source |
|-------------|-------------|--------|
| `##HOST-ALL##` | Comma-separated list of host aliases with protocol | hostAlias() |
| `##ROOT##` | Document root path | host.root |
| `##PHP-VERSION##` | PHP version number (e.g., 82 for PHP 8.2) | host.phpVersion |
| `##LOG-PATH##` | Access log file path | `{BaseDir}/vhost/logs/{host.name}.caddy.log` |
| `##SSL##` | TLS configuration: "internal" or "cert key" paths | host.ssl |

Sources: src/fork/module/Caddy/index.ts:92-134

---

## Platform Differences

| Feature | macOS | Windows | Linux | Notes |
|---------|-------|---------|-------|-------|
| **Installation** | Static tar.gz | Static zip | Static tar.gz | No Homebrew/MacPorts support |
| **Binary Path** | `caddy` | `caddy.exe` | `caddy` | Windows uses .exe extension |
| **Config Path** | `{BaseDir}/caddy/` | `{BaseDir}/caddy/` | `{BaseDir}/caddy/` | Same across platforms |
| **Archive Format** | `.tar.gz` | `.zip` | `.tar.gz` | Linux/macOS use tar.gz |
| **Privilege** | Standard user | Admin (helper) | Root via sudo | Linux requires root for ports <1024 |
| **Service Start** | bash script | CMD execution | bash script | Windows uses serviceStartExecCMD |
| **PID Management** | `--pidfile` flag | `--pidfile` flag | `--pidfile` flag | Caddy native PID file support |
| **Config Reload** | `--watch` flag | `--watch` flag | `--watch` flag | Auto-reload on Caddyfile changes |

Sources: src/fork/module/Caddy/index.ts:154-192 src/fork/util/ServiceStart.ts:51-179

### Version Path Patterns

| Platform | Binary Path Pattern | App Directory |
|----------|---------------------|---------------|
| Windows | `{AppDir}/caddy-{ver}/caddy.exe` | `caddy-{ver}` |
| macOS/Linux | `{AppDir}/static-caddy-{ver}/caddy` | `static-caddy-{ver}` |

Sources: src/fork/module/Caddy/index.ts:201-215

---

## PHP-FPM Integration

### PHP FastCGI Configuration

Caddy 通过 `php_fastcgi` 指令与 PHP-FPM 集成：

```caddy
php_fastcgi 127.0.0.1:90##PHP-VERSION##
```

The port number is constructed as `90 + PHP version`, for example:
- PHP 7.4 → port 9074
- PHP 8.0 → port 9080
- PHP 8.2 → port 9082

Sources: src/fork/module/Caddy/index.ts:117

### Host to PHP Version Mapping

```typescript
// Pseudocode of #fixVHost PHP handling
for (const host of phpHosts) {
  const phpv = host.phpVersion           // e.g., "82" for PHP 8.2
  const fastcgiPort = `127.0.0.1:90${phpv}`
  
  // Generate vhost config with php_fastcgi directive
  const content = tmplContent
    .replace('##PHP-VERSION##', phpv)
    // ... other replacements
}
```

Sources: src/fork/module/Caddy/index.ts:68-136

---

## Version Management

### Version Detection

Caddy 版本通过以下方式获取：

1. **Local Scanning**: Search predefined directories for `caddy` binary
2. **Version Extraction**: Execute `caddy version` and parse output
3. **Regex Pattern**: `/(v)(\d+(\.\d+){1,4})(.*?)/g` extracts version

```typescript
const command = `"${item.bin}" version`
const reg = /(v)(\d+(\.\d+){1,4})(.*?)/g
```

Sources: src/fork/module/Caddy/index.ts:239-241

### Online Version Fetching

Versions fetched from FlyEnv API (`https://api.one-env.com/api/version/fetch`):

| Platform | Archive Format | Binary Path Pattern |
|----------|---------------|---------------------|
| Windows | `.zip` | `{AppDir}/caddy-{ver}/caddy.exe` |
| macOS | `.tar.gz` | `{AppDir}/static-caddy-{ver}/caddy` |
| Linux | `.tar.gz` | `{AppDir}/static-caddy-{ver}/caddy` |

Note: Caddy uses `.tar.gz` format (not `.tar.xz` like Nginx).

Sources: src/fork/module/Caddy/index.ts:196-222

---

## Caddy vs Nginx/Apache Comparison

| Feature | Caddy | Nginx | Apache |
|---------|-------|-------|--------|
| **Config Format** | Caddyfile | nginx.conf | httpd.conf |
| **Auto HTTPS** | Built-in | Manual setup | Manual setup |
| **PHP Integration** | php_fastcgi | fastcgi_pass | mod_php/proxy_fcgi |
| **Virtual Hosts** | Automatic (import) | Manual include | Manual include |
| **Config Reload** | `--watch` flag | Signal HUP | Signal HUP |
| **Process Model** | Single binary | Master + workers | Multi-process |

Sources: src/fork/module/Caddy/index.ts:154-156

---

## Sources Reference

| File | Lines | Description |
|------|-------|-------------|
| src/fork/module/Caddy/index.ts | 1-305 | Main Caddy class implementation |
| src/fork/module/Base/index.ts | 1-447 | Base class with shared lifecycle |
| src/fork/module/Host/Host.ts | 1-117 | Virtual host template management |
| src/render/components/Caddy/Module.ts | 1-15 | Module registration |
| src/render/components/Caddy/Index.vue | 1-39 | Main panel component |
| src/render/components/Caddy/aside.vue | 1-47 | Sidebar switch control |
| src/render/components/Caddy/Config.vue | 1-36 | Caddyfile editor |
| src/render/components/Caddy/Logs.vue | 1-20 | Log viewer |
| src/render/core/Module/Module.ts | 1-374 | Frontend Module class |
| src/render/core/ASide.ts | 1-122 | AsideSetup composable |
| src/render/core/type.ts | 1-174 | TypeScript type definitions |
| src/fork/util/ServiceStart.ts | 1-444 | Service execution utilities |
