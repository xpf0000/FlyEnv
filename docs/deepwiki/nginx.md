# Nginx Deep Dive

> **模块类型**: Web服务器  
> **模块标识**: `nginx`  
> **分析日期**: 2026-04-12  
> **分析基线版本**: 4.13.2

---

## Overview

Nginx 模块是 FlyEnv 的核心 Web 服务器组件，提供高性能 HTTP/HTTPS 服务托管功能。该模块负责管理 Nginx 服务的全生命周期，包括版本管理、服务启停、配置文件生成和虚拟主机管理。

相关文档链接:
- [Apache](./apache.md) - 同类 Web 服务器实现对比
- [PHP](./php.md) - Nginx 通过 FastCGI 与之协作
- [Host](../host.md) - 虚拟主机配置管理

---

## Architecture

### Component Hierarchy Diagram

```
Renderer Process (Frontend)
├── aside.vue                    # Sidebar switch control
│   └── AsideSetup('nginx')      # State management composable
├── Index.vue                    # Main panel with tabs
│   ├── Service (tab=0)          # Service control panel
│   ├── Manager (tab=1)          # Version management
│   ├── Config (tab=2)           # Configuration editor
│   └── Logs (tab=3/4)           # Error/Access logs
└── Module.ts                    # Module registration

Main Process
└── ForkManager
    └── Fork Process
        └── BaseManager
            └── Nginx (src/fork/module/Nginx/index.ts)
                ├── _startServer()    # Service startup
                ├── _stopService()    # Service shutdown (inherited)
                ├── _fixConf()        # Config auto-fix
                └── #handlePhpEnableConf()  # PHP-FPM integration
```

### Data Flow Sequence

```
1. User clicks Start/Stop Switch (aside.vue)
   │
   ▼
2. AsideSetup.switchChange()
   │ IPC: app-fork:nginx
   ▼
3. Fork Process - Base.startService()
   │
   ├──► _linkVersion()     # Homebrew version linking (macOS/Linux)
   ├──► _stopServer()      # Stop existing instance
   └──► _startServer()     # Module-specific startup
        │
        ├──► #initConfig()      # Windows: Initial config setup
        ├──► #handlePhpEnableConf()  # Generate PHP-FPM configs
        ├──► _fixConf()          # Fix user/temp paths
        └──► serviceStartExec()  # Execute binary
             │
             ▼
4. PID File Monitoring
   │
   ▼
5. Service Status Update
   │ IPC: APP-Service-Start-PID / APP-Service-Stop-Success
   ▼
6. UI State Update (aside.vue)
```

Sources: src/render/components/Nginx/aside.vue:24-47 src/fork/module/Base/index.ts:88-121 src/fork/module/Nginx/index.ts:143-214

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
  typeFlag: 'nginx'            // Unique identifier
  label: 'Nginx'               // Display name
  icon: SVGImport              // Module icon
  index: Component             // Main view component
  aside: Component             // Sidebar component
  asideIndex: 2                // Sort order in sidebar
  isService: true              // Can start/stop
  isTray: true                 // Show in tray menu
}
```

Sources: src/render/components/Nginx/Module.ts:1-15 src/render/core/type.ts:37-86

### Nginx Module State (BrewStore)

```typescript
interface NginxModuleState {
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

### 1. Backend: Nginx Class (Fork Process)

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `init()` | - | void | Initialize PID path: `{NginxDir}/common/logs/nginx.pid` |
| `_startServer()` | `version: SoftInstalled` | `ForkPromise<void>` | Platform-specific startup logic |
| `_stopService()` | `version: SoftInstalled` | `ForkPromise<void>` | Inherited from Base class |
| `#initConfig()` | - | `ForkPromise<boolean>` | Windows: Extract default config from zip |
| `#handlePhpEnableConf()` | - | `Promise<void>` | Generate `enable-php-{version}.conf` files |
| `_fixConf()` | - | `ForkPromise<boolean>` | Auto-fix nginx.conf user/temp paths |
| `fetchAllOnlineVersion()` | - | `ForkPromise<OnlineVersionItem[]>` | Fetch available versions from API |
| `allInstalledVersions()` | `setup: any` | `ForkPromise<SoftInstalled[]>` | Scan local installations |
| `_installSoftHandle()` | `row: any` | `Promise<void>` | Post-install directory restructure |
| `brewinfo()` | - | `ForkPromise<any>` | Get Homebrew package info |
| `portinfo()` | - | `ForkPromise<any>` | Get MacPorts package info |

Sources: src/fork/module/Nginx/index.ts:29-327

### 2. Frontend: Module Registration (Module.ts)

```typescript
const module: AppModuleItem = {
  moduleType: 'webServer',
  typeFlag: 'nginx',
  label: 'Nginx',
  icon: import('@/svg/nginx.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 2,
  isService: true,
  isTray: true
}
```

Sources: src/render/components/Nginx/Module.ts:1-15

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

Sources: src/render/components/Nginx/aside.vue:24-47

### 4. Frontend: Index Component (Index.vue)

Tab-based main panel with 5 sections:

| Tab Index | Component | Description |
|-----------|-----------|-------------|
| 0 | `Service` | Service control and status |
| 1 | `Manager` | Version installation/management |
| 2 | `Config` | Configuration file editor |
| 3 | `Logs` | Error log viewer |
| 4 | `Logs` | Access log viewer |

Sources: src/render/components/Nginx/Index.vue:1-41

---

## Lifecycle Management

### Service Startup Flow

```
startService(version) [Base class]
    │
    ├──► Check binary exists (non-Windows)
    ├──► Check version is set
    ├──► _linkVersion(version)     # Homebrew link/unlink
    │
    ├──► _stopServer(version)      # Kill existing processes
    │    │
    │    ├──► Read PID from file: pid/nginx.pid
    │    ├──► Search process by name: "nginx"
    │    └──► Send -INT signal to processes
    │
    └──► _startServer(version)     # [Nginx class override]
         │
         ├──► [Windows] #initConfig()
         │    └──► Extract nginx.zip to NginxDir
         │    └──► Replace #PREFIX#, #VHostPath# placeholders
         │
         ├──► #handlePhpEnableConf()
         │    └──► Fetch PHP hosts from host.json
         │    └──► Generate enable-php-{version}.conf for each PHP version
         │
         ├──► [Unix] _fixConf()
         │    └──► Set user directive to current user
         │    └──► Add missing temp_path directives
         │
         └──► Execute binary
              ├──► [Windows] serviceStartExecCMD()
              └──► [Unix] serviceStartExec(root: isLinux)
                   └──► Spawn flyenv-async-exec.sh
                   └──► Wait for PID file (max 20 retries)
```

Sources: src/fork/module/Base/index.ts:88-121 src/fork/module/Nginx/index.ts:103-214

### Service Stop Flow

```
_stopServer(version) [Base class]
    │
    ├──► Read PID file: {BaseDir}/pid/nginx.pid
    ├──► Search processes by name "nginx"
    │    └──► Filter by FlyEnv data directories
    ├──► Collect all PIDs
    │
    ├──► [Windows] ProcessKill('-INT', pids)
    └──► [Unix] ProcessKill('-INT', pids)
         └──► Default signal is -INT (graceful shutdown)
    │
    ├──► Delete PID file
    └──► Emit APP-Service-Stop-Success
```

Sources: src/fork/module/Base/index.ts:123-250

### Process Signal Mapping

| Service Type | Signal | Notes |
|--------------|--------|-------|
| nginx | -INT | Graceful shutdown (default) |
| mysql/mariadb | -TERM | Fast shutdown |
| mongodb | -TERM | Graceful shutdown |
| tomcat | -TERM | Standard JVM termination |
| rabbitmq | -TERM | Standard Erlang termination |
| elasticsearch | -TERM | Graceful node shutdown |

Sources: src/fork/module/Base/index.ts:218-236

---

## API/IPC Interface

### IPC Commands

Nginx 模块通过 `app-fork:nginx` 通道与 Fork 进程通信。

| Command | Parameters | Returns | Description |
|---------|-----------|---------|-------------|
| `startService` | `version: SoftInstalled` | `{ 'APP-Service-Start-PID': string }` | Start Nginx service |
| `stopService` | `version: SoftInstalled` | `{ 'APP-Service-Stop-PID': string[] }` | Stop Nginx service |
| `fetchAllOnlineVersion` | - | `OnlineVersionItem[]` | Get downloadable versions |
| `allInstalledVersions` | `setup: any` | `SoftInstalled[]` | Get local versions |
| `installSoft` | `row: OnlineVersionItem` | `boolean` | Download and install |
| `brewinfo` | - | `any` | Homebrew package info |
| `portinfo` | - | `any` | MacPorts package info |

Sources: src/fork/module/Base/index.ts:34-43

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

| Platform | Config Path | PID Path | Log Path |
|----------|-------------|----------|----------|
| Windows | `{NginxDir}/conf/nginx.conf` | `{NginxDir}/logs/nginx.pid` | `{NginxDir}/logs/` |
| macOS/Linux | `{NginxDir}/common/conf/nginx.conf` | `{NginxDir}/common/logs/nginx.pid` | `{NginxDir}/common/logs/` |

Sources: src/render/components/Nginx/Config.vue:28-40 src/render/components/Nginx/Logs.vue:23-28

### Configuration Template Variables

Nginx 配置模板支持以下占位符替换：

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `#PREFIX#` | Nginx installation directory | `C:/FlyEnv/Nginx` |
| `#VHostPath#` | Virtual host config directory | `{BaseDir}/vhost/nginx` |

Sources: src/fork/module/Nginx/index.ts:114-120

### Virtual Host Templates

#### Standard HTTP (nginx.vhost)

```nginx
server {
    listen #Port_Nginx#;
    server_name #Server_Alias#;
    index index.php index.html;
    root "#Server_Root#";
    
    #PHP-INFO-START
    include enable-php.conf;
    #PHP-INFO-END
    
    #REWRITE-START
    include "#Rewrite_Path#/#Server_Name#.conf";
    #REWRITE-END
    
    location ~ \.well-known {
        allow all;
    }
    
    access_log #Log_Path#/#Server_Name#.log;
    error_log #Log_Path#/#Server_Name#.error.log;
}
```

#### SSL HTTPS (nginxSSL.vhost)

```nginx
server {
    listen #Port_Nginx#;
    listen #Port_Nginx_SSL# ssl;
    server_name #Server_Alias#;
    
    ssl_certificate "#Server_Cert#";
    ssl_certificate_key "#Server_CertKey#";
    ssl_protocols TLSv1 TLSv1.1 TLSv1.2;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:HIGH:!aNULL:!MD5:!RC4:!DHE;
    ssl_prefer_server_ciphers on;
    
    # ... same as HTTP template
}
```

Sources: static/tmpl/macOS/nginx.vhost static/tmpl/macOS/nginxSSL.vhost

### Common Settings UI

Config.vue provides visual editors for common directives:

| Directive | Default | Type | Description |
|-----------|---------|------|-------------|
| `keepalive_timeout` | 60 | number | Connection keepalive timeout |
| `gzip` | off | enum(on/off) | Enable gzip compression |
| `gzip_min_length` | 1k | string | Min size to compress |
| `gzip_comp_level` | 2 | number | Compression level (1-9) |
| `client_max_body_size` | 50m | string | Max upload size |
| `server_names_hash_bucket_size` | 128 | number | Server name hash size |
| `server_names_hash_max_size` | 512 | number | Max server names |
| `client_header_buffer_size` | 32k | string | Header buffer size |
| `client_body_buffer_size` | 32k | string | Body buffer size |

Sources: src/render/components/Nginx/Config.vue:42-125

---

## Platform Differences

| Feature | macOS | Windows | Linux | Notes |
|---------|-------|---------|-------|-------|
| **Installation** | Homebrew/MacPorts | Static zip | Static tar.xz | Linux uses tar.xz with nested directories |
| **Binary Path** | `sbin/nginx` | `nginx.exe` | `sbin/nginx` | Windows uses .exe extension |
| **Config Path** | `common/conf/` | `conf/` | `common/conf/` | Windows uses flat structure |
| **PID Path** | `common/logs/` | `logs/` | `common/logs/` | Follows config path pattern |
| **Privilege** | Standard user | Admin (helper) | Root via sudo | Linux requires root for ports <1024 |
| **User Directive** | Auto-set to current user | N/A | Auto-set to current user | Prevents permission issues |
| **Temp Paths** | Auto-added | Included in zip | Auto-added | Required for proper operation |
| **Service Start** | bash script | CMD execution | bash script | Windows uses serviceStartExecCMD |

Sources: src/fork/module/Nginx/index.ts:143-214 src/fork/util/ServiceStart.ts:51-179

---

## PHP-FPM Integration

### enable-php.conf Generation

When starting Nginx, the module automatically generates PHP-FPM configuration files:

```typescript
// Pseudocode of #handlePhpEnableConf
async function handlePhpEnableConf() {
  const hosts = await fetchHostList()          // From host.json
  const phpVersions = new Set(
    hosts
      .filter(h => h.type === 'php')
      .map(h => h.phpVersion)
  )
  
  for (const version of phpVersions) {
    const confFile = join(NginxDir, `common/conf/enable-php-${version}.conf`)
    if (!existsSync(confFile)) {
      const template = await readFile('tmpl/enable-php.conf')
      const content = template.replace('##VERSION##', version)
      await writeFile(confFile, content)
    }
  }
}
```

The generated `enable-php-{version}.conf` contains:

```nginx
location ~ [^/]\.php(/|$) {
    fastcgi_pass 127.0.0.1:90{version};
    fastcgi_index index.php;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    include fastcgi_params;
}
```

Sources: src/fork/module/Nginx/index.ts:39-65

---

## Version Management

### Version Detection

Nginx 版本通过以下方式获取：

1. **Local Scanning**: Search predefined directories for `nginx` binary
2. **Version Extraction**: Execute `nginx -v` and parse output
3. **Regex Pattern**: `/\/([\d.]+)/` extracts version from path

```typescript
const command = `"${item.bin}" -v`
const reg = /(\/)(\d+(\.\d+){1,4})(.*?)/g
```

Sources: src/fork/module/Nginx/index.ts:250-289

### Online Version Fetching

Versions fetched from FlyEnv API (`https://api.one-env.com/api/version/fetch`):

| Platform | Archive Format | Binary Path Pattern |
|----------|---------------|---------------------|
| Windows | `.zip` | `{AppDir}/nginx-{ver}/nginx-{ver}/nginx.exe` |
| macOS | `.tar.xz` | `{AppDir}/nginx-{ver}/sbin/nginx` |
| Linux | `.tar.xz` | `{AppDir}/nginx-{ver}/sbin/nginx` |

Sources: src/fork/module/Nginx/index.ts:216-248

---

## Sources Reference

| File | Lines | Description |
|------|-------|-------------|
| src/fork/module/Nginx/index.ts | 1-327 | Main Nginx class implementation |
| src/fork/module/Base/index.ts | 1-447 | Base class with shared lifecycle |
| src/render/components/Nginx/Module.ts | 1-15 | Module registration |
| src/render/components/Nginx/Index.vue | 1-41 | Main panel component |
| src/render/components/Nginx/aside.vue | 1-47 | Sidebar switch control |
| src/render/components/Nginx/Config.vue | 1-197 | Configuration editor |
| src/render/components/Nginx/Logs.vue | 1-29 | Log viewer |
| src/render/core/Module/Module.ts | 1-374 | Frontend Module class |
| src/render/core/ASide.ts | 1-122 | AsideSetup composable |
| src/fork/util/ServiceStart.ts | 1-444 | Service execution utilities |
| static/tmpl/macOS/nginx.vhost | 1-42 | HTTP vhost template |
| static/tmpl/macOS/nginxSSL.vhost | 1-51 | HTTPS vhost template |
