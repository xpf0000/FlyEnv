# Apache Deep Dive

> **模块类型**: Web服务器  
> **模块标识**: `apache`  
> **分析日期**: 2026-04-12  
> **分析基线版本**: 4.13.2

---

## Overview

Apache 模块为 FlyEnv 提供 Apache HTTP Server 的完整生命周期管理，包括版本管理、服务启停、配置文件生成和虚拟主机支持。该模块实现了与 Nginx 类似的 Web 服务器功能，但使用 Apache 特有的配置语法和模块加载机制。

相关文档链接:
- [Nginx 模块](./nginx.md) - 同类 Web 服务器实现对比
- [PHP 模块](./php.md) - 通过 mod_proxy_fcgi 与 Apache 集成
- [Host 模块](./host.md) - 虚拟主机配置管理

---

## Architecture

### Component Hierarchy Diagram

```
Renderer Process (Vue 3)
├── Apache/Index.vue          # 主视图组件
├── Apache/aside.vue          # 侧边栏服务控制
├── Apache/Config.vue         # 配置编辑器
├── Apache/Logs.vue           # 日志查看器
├── core/Module/Module.ts     # 模块核心类
└── core/ASide.ts             # 侧边栏逻辑封装

Main Process (Electron)
└── ForkManager
    └── UtilityProcess
        └── BaseManager
            └── Apache (src/fork/module/Apache/)
                ├── #resetConf()        # 配置初始化
                ├── #handleListenPort() # 端口管理
                ├── _startServer()      # 服务启动
                └── Base._stopServer()  # 服务停止(继承)
```

### Data Flow Sequence

```
1. User clicks Start Switch (aside.vue)
   │
   ▼
2. AsideSetup.switchChange() called
   │ IPC: app-fork:apache startService
   ▼
3. BaseManager.exec() dispatches to Apache module
   │
   ▼
4. Apache.startService() (inherited from Base)
   ├── _linkVersion() - Homebrew version linking
   ├── _stopServer()  - Stop existing instance
   └── _startServer() - Start new instance
       ├── #resetConf()        - Generate config file
       ├── #handleListenPort() - Update Listen directives
       └── serviceStartExec()  - Execute httpd binary
   │
   ▼
5. PID written to pid/apache.pid
   │ IPC response: APP-Service-Start-PID
   ▼
6. UI updates serviceRunning state
```

Sources: src/render/components/Apache/aside.vue24-46 src/fork/module/Apache/index.ts315-391 src/fork/module/Base/index.ts88-121

---

## Data Model

### Core Type Definitions

| Type | Location | Description |
|------|----------|-------------|
| `AppModuleEnum.apache` | src/render/core/type.ts43 | 模块标识符枚举 |
| `AppModuleTypeEnum.webServer` | src/render/core/type.ts3 | 模块类型分类 |
| `AppModuleItem` | src/render/core/type.ts97-133 | 模块配置接口 |
| `SoftInstalled` | @shared/app | 已安装软件类型 |
| `OnlineVersionItem` | @shared/app | 在线版本类型 |

### Apache Module Configuration

```typescript
// src/render/components/Apache/Module.ts
interface AppModuleItem {
  moduleType: 'webServer'
  typeFlag: 'apache'
  label: 'Apache'
  icon: SVGResource
  index: Component // Index.vue
  aside: Component // aside.vue
  asideIndex: 1     // 排序位置
  isService: true   // 可启动/停止
  isTray: true      // 托盘显示
}
```

Sources: src/render/components/Apache/Module.ts1-15 src/render/core/type.ts37-86

### Apache Class Properties

| Property | Type | Description |
|----------|------|-------------|
| `type` | string | 模块标识，固定为 `'apache'` |
| `pidPath` | string | PID 文件路径，`{ApacheDir}/httpd.pid` |

Sources: src/fork/module/Apache/index.ts29-37

---

## Core Components

### 1. Fork Process - Apache Module

**File**: `src/fork/module/Apache/index.ts`

Apache 类继承自 Base 类，实现 Apache 特有的服务管理逻辑。

#### Private Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `#resetConf()` | version: SoftInstalled | ForkPromise<boolean> | 初始化/更新 Apache 配置文件 |
| `#handleListenPort()` | version: SoftInstalled | Promise<void> | 扫描并更新所有需要监听的端口 |

#### Public Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `init()` | - | void | 初始化 PID 文件路径 |
| `_startServer()` | version: SoftInstalled | ForkPromise<void> | 启动 Apache 服务 |
| `fetchAllOnlineVersion()` | - | ForkPromise<OnlineVersionItem[]> | 获取可下载版本列表 |
| `allInstalledVersions()` | setup: any | ForkPromise<SoftInstalled[]> | 扫描本地已安装版本 |
| `brewinfo()` | - | ForkPromise<any> | 获取 Homebrew 版本信息 |
| `portinfo()` | - | ForkPromise<any> | 获取 MacPorts 版本信息 |

Sources: src/fork/module/Apache/index.ts29-486

### 2. Configuration Generator (#resetConf)

配置生成流程：

1. **检查现有配置**: 如果配置文件已存在，仅更新 SRVROOT 路径
2. **获取默认配置**: 执行 `httpd -V` 获取默认配置文件路径
3. **解析关键路径**: 提取 CustomLog、ErrorLog、SRVROOT 路径
4. **启用必要模块**: 启用 headers、deflate、proxy、proxy_fcgi、ssl、rewrite 等模块
5. **更新日志路径**: 指向 FlyEnv 统一日志目录
6. **更新 SRVROOT**: 指向实际安装路径
7. **添加 Include**: 包含虚拟主机配置目录

Sources: src/fork/module/Apache/index.ts39-218

### 3. Port Management (#handleListenPort)

动态端口管理流程：

1. 获取所有 Host 列表，提取 Apache 端口配置
2. 扫描 vhost/apache/ 目录下所有虚拟主机配置
3. 收集所有 `<VirtualHost *:PORT>` 中使用的端口
4. 生成 `Listen PORT` 指令，插入主配置
5. 非 Windows 平台自动检测并设置 User/Group

Sources: src/fork/module/Apache/index.ts220-313

### 4. Renderer Process - Module Class

**File**: `src/render/core/Module/Module.ts`

| Property | Type | Description |
|----------|------|-------------|
| `typeFlag` | AllAppModule | 模块标识 `'apache'` |
| `isService` | boolean | `true` - 可启动/停止 |
| `isOnlyRunOne` | boolean | `true` - 同时只能运行一个版本 |
| `installed` | ModuleInstalledItem[] | 已安装版本列表 |
| `brew` | ModuleHomebrewItem[] | Homebrew 可用版本 |
| `port` | ModuleMacportsItem[] | MacPorts 可用版本 |

| Method | Description |
|--------|-------------|
| `start()` | 启动当前选中的版本 |
| `stop()` | 停止所有运行中的版本 |
| `fetchInstalled()` | 获取已安装版本列表 |

Sources: src/render/core/Module/Module.ts15-374

### 5. Renderer Process - ModuleInstalledItem

**File**: `src/render/core/Module/ModuleInstalledItem.ts`

| Method | Description |
|--------|-------------|
| `start()` | 调用 IPC `app-fork:apache startService` |
| `stop()` | 调用 IPC `app-fork:apache stopService` |
| `restart()` | 先 stop 后 start |

Sources: src/render/core/Module/ModuleInstalledItem.ts44-137

---

## Lifecycle Management

### Service Start Sequence

```
startService() [Base class]
    │
    ├──► Version validation
    │    - Check binary exists
    │    - Check version is set
    │
    ├──► _linkVersion() [Homebrew only]
    │    - brew unlink old_version
    │    - brew link --overwrite --force new_version
    │
    ├──► _stopServer() [if running]
    │    - Kill existing httpd processes
    │    - Remove pid file
    │
    └──► _startServer() [Apache specific]
         │
         ├──► #resetConf()
         │    - Generate config from template
         │    - Update paths and modules
         │
         ├──► #handleListenPort()
         │    - Scan vhost configs
         │    - Update Listen directives
         │
         └──► Execute httpd
              - Windows: serviceStartExecCMD()
              - Unix: serviceStartExec() with sudo
              
         └──► Write PID to pid/apache.pid
```

Sources: src/fork/module/Base/index.ts88-121 src/fork/module/Apache/index.ts315-391

### Service Stop Sequence

```
_stopServer() [Base class]
    │
    ├──► Process list fetch
    │    - Windows: ProcessPidList()
    │    - Unix: ProcessListFetch()
    │
    ├──► Collect PIDs
    │    - From pid/apache.pid
    │    - From version.pid
    │    - From process search (httpd)
    │
    ├──► Filter FlyEnv-managed processes
    │    - Check COMMAND includes BaseDir/AppDir
    │    - Exclude brew/install/uninstall/link/unlink
    │
    └──► ProcessKill()
         - Windows: -INT signal
         - Unix: -INT signal (default)
         
    └──► Remove pid/apache.pid
```

Sources: src/fork/module/Base/index.ts123-250

### Process Identification

Apache 进程识别模式：

```typescript
const dis: { [k: string]: string } = {
  apache: 'httpd',  // 进程名匹配
  // ... other services
}
```

过滤条件（非 Windows）：
- 命令行包含 `BaseDir` 或 `AppDir`
- 排除 `grep`、`/bin/sh -c`、`brew.rb` 等
- 排除 `install`、`uninstall`、`link`、`unlink` 操作

Sources: src/fork/module/Base/index.ts161-206

---

## Configuration

### Config File Locations

| Platform | Config Path | Pattern |
|----------|-------------|---------|
| Windows | `{ApacheDir}/{version}.conf` | `2.4.54.conf` |
| Windows (default) | `{ApacheDir}/{version}.default.conf` | Backup file |
| macOS/Linux | `{ApacheDir}/common/conf/{md5(bin)}.conf` | Hash of binary path |
| macOS/Linux (default) | `{ApacheDir}/common/conf/{md5(bin)}.default.conf` | Backup file |

Sources: src/fork/module/Apache/index.ts43-52 src/render/components/Apache/Config.vue35-54

### Log File Locations

| Platform | Error Log | Access Log |
|----------|-----------|------------|
| Windows | `{ApacheDir}/{version}.error.log` | `{ApacheDir}/{version}.access.log` |
| macOS/Linux | `{ApacheDir}/common/logs/error_log` | `{ApacheDir}/common/logs/access_log` |

Sources: src/fork/module/Apache/index.ts159-178 src/render/components/Apache/Logs.vue29-37

### Auto-Enabled Modules

以下模块在配置生成时自动启用（取消注释）：

| Module | Directive | Purpose |
|--------|-----------|---------|
| mod_headers | `LoadModule headers_module` | HTTP 头处理 |
| mod_deflate | `LoadModule deflate_module` | 压缩输出 |
| mod_proxy | `LoadModule proxy_module` | 代理支持 |
| mod_proxy_fcgi | `LoadModule proxy_fcgi_module` | FastCGI 代理 |
| mod_ssl | `LoadModule ssl_module` | HTTPS 支持 |
| mod_access_compat | `LoadModule access_compat_module` | 兼容性 |
| mod_rewrite | `LoadModule rewrite_module` | URL 重写 |

Sources: src/fork/module/Apache/index.ts144-152

### Common Settings (UI)

**File**: `src/render/components/Apache/Config.vue`

| Setting | Default | Type | Description |
|---------|---------|------|-------------|
| Timeout | 60 | number | 请求超时时间 |
| KeepAlive | Off | enum | 持久连接 |
| KeepAliveTimeout | 15 | number | 持久连接超时 |
| MaxKeepAliveRequests | 1000 | number | 单连接最大请求数 |
| LimitRequestBody | 0 | number | 请求体大小限制 |

Sources: src/render/components/Apache/Config.vue56-107

### Virtual Host Templates

**Standard VHost** (`static/tmpl/{platform}/apache.vhost`):
- Port: `#Port_Apache#`
- DocumentRoot: `#Server_Root#`
- ServerName: `#Server_Name#`
- PHP Handler: `proxy:fcgi://127.0.0.1:9000`

**SSL VHost** (`static/tmpl/{platform}/apacheSSL.vhost`):
- Includes standard vhost configuration
- Additional SSL VirtualHost on `#Port_Apache_SSL#`
- SSLEngine On
- SSLCertificateFile: `#Server_Cert#`
- SSLCertificateKeyFile: `#Server_CertKey#`

Sources: static/tmpl/macOS/apache.vhost1-27 static/tmpl/macOS/apacheSSL.vhost1-63

---

## API/IPC Interface

### IPC Commands

| Command | Module | Parameters | Returns | Description |
|---------|--------|-----------|---------|-------------|
| `startService` | apache | SoftInstalled, ...args | `{APP-Service-Start-PID}` | 启动服务 |
| `stopService` | apache | SoftInstalled, ...args | `{APP-Service-Stop-PID: []}` | 停止服务 |
| `fetchAllOnlineVersion` | apache | - | OnlineVersionItem[] | 获取在线版本 |
| `allInstalledVersions` | version | ['apache'], setup | SoftInstalled[] | 获取已安装版本 |
| `brewinfo` | apache | - | BrewInfo | Homebrew 信息 |
| `portinfo` | apache | - | PortInfo | MacPorts 信息 |

Sources: src/fork/BaseManager.ts115-120 src/render/core/Module/ModuleInstalledItem.ts64-128

### IPC Progress Events

| Event | Source | Data | Description |
|-------|--------|------|-------------|
| `APP-On-Log` | Fork | `{type, info}` | 日志消息 |
| `APP-Service-Start-Success` | Fork | `true` | 服务启动成功 |
| `APP-Service-Start-PID` | Fork | `string` | 启动的进程 PID |
| `APP-Service-Stop-Success` | Fork | `true` | 服务停止成功 |

Sources: src/fork/module/Apache/index.ts78-80 src/fork/module/Base/index.ts145-147

---

## UI Components

### Component Structure

```
Apache/Index.vue (Main View)
├── Service (tab 0)          # 服务控制面板
├── Manager (tab 1)          # 版本管理器
├── Config (tab 2)           # 配置文件编辑器
├── Logs-error (tab 3)       # 错误日志
└── Logs-access (tab 4)      # 访问日志
```

Sources: src/render/components/Apache/Index.vue1-40

### Aside Component

**File**: `src/render/components/Apache/aside.vue`

| Element | Binding | Description |
|---------|---------|-------------|
| Icon | `serviceRunning` | 运行状态样式类 |
| Title | static | "Apache" |
| Switch | `serviceRunning` | 服务开关控制 |

**AsideSetup 返回**: `showItem`, `serviceDisabled`, `serviceFetching`, `serviceRunning`, `currentPage`, `groupDo`, `switchChange`, `nav`, `stopNav`

Sources: src/render/components/Apache/aside.vue1-47

### Service State Logic

```typescript
// serviceDisabled 计算逻辑
const serviceDisabled = computed(() => {
  const a = !currentVersion?.value?.version  // 无当前版本
  const b = installed.length === 0            // 无安装版本
  const c = installed.some((v) => v.running) // 有版本在启动中
  const d = !appStore.versionInitiated        // 版本未初始化
  return a || b || c || d
})

// serviceRunning 计算逻辑
const serviceRunning = computed(() => {
  return currentVersion?.value?.run === true
})
```

Sources: src/render/core/ASide.ts56-71

---

## Platform Differences

| Feature | macOS | Windows | Linux | Notes |
|---------|-------|---------|-------|-------|
| Config Path | `common/conf/{hash}.conf` | `{version}.conf` | `common/conf/{hash}.conf` | Windows 使用版本号命名 |
| Log Path | `common/logs/` | `{version}.{type}.log` | `common/logs/` | Windows 与配置文件同目录 |
| Process Name | `httpd` | `httpd.exe` | `httpd` | 进程搜索关键字 |
| Privilege | sudo | Admin (UAC) | sudo | 需要 root 权限启动 |
| Install Source | Homebrew/MacPorts | Apache Lounge | apt/yum | 不同下载源 |
| Mutex | posixsem | - | posixsem | Unix 平台需要 Mutex 配置 |
| User/Group | Auto-detect | - | Auto-detect | 非 Windows 自动设置 |

Sources: src/fork/module/Apache/index.ts43-52 src/fork/module/Apache/index.ts156-197

### Platform-Specific Code

**Windows Specific**:
```typescript
if (isWindows()) {
  conf = join(global.Server.ApacheDir!, `${version.version}.conf`)
  // serviceStartExecCMD - 不需要 root
}
```

**Unix Specific**:
```typescript
// 自动检测 User/Group
const lsal = await execPromise(`ls -al`, { cwd: global.Server.BaseDir })
// ... parse user/group
confContent += `User ${user}\nGroup ${group}\n`

// Mutex 配置
if (!isWindows()) {
  content = 'Mutex posixsem default\n' + content
}
```

Sources: src/fork/module/Apache/index.ts156-197 src/fork/module/Apache/index.ts291-308

---

## Integration Points

### PHP-FPM Integration

Apache 通过 `mod_proxy_fcgi` 与 PHP-FPM 通信：

```apache
<FilesMatch \.php$>
    SetHandler "proxy:fcgi://127.0.0.1:9000"
</FilesMatch>
```

Sources: static/tmpl/macOS/apache.vhost15-17

### Virtual Host Management

虚拟主机配置文件位置：`{BaseDir}/vhost/apache/*.conf`

通过 `IncludeOptional` 指令包含：
```apache
IncludeOptional "{vhostPath}/*.conf"
```

Sources: src/fork/module/Apache/index.ts201-206

---

## Sources Summary

| Component | File | Lines |
|-----------|------|-------|
| Fork Module | src/fork/module/Apache/index.ts | 29-486 |
| Base Class | src/fork/module/Base/index.ts | 26-447 |
| Module Config | src/render/components/Apache/Module.ts | 1-15 |
| Main View | src/render/components/Apache/Index.vue | 1-40 |
| Aside | src/render/components/Apache/aside.vue | 1-47 |
| Config Editor | src/render/components/Apache/Config.vue | 1-182 |
| Logs | src/render/components/Apache/Logs.vue | 1-38 |
| Module Class | src/render/core/Module/Module.ts | 15-374 |
| Installed Item | src/render/core/Module/ModuleInstalledItem.ts | 11-186 |
| ASide Setup | src/render/core/ASide.ts | 21-122 |
| Type Definitions | src/render/core/type.ts | 37-86 |
| Base Manager | src/fork/BaseManager.ts | 115-120 |
| VHost Template | static/tmpl/macOS/apache.vhost | 1-27 |
| SSL VHost Template | static/tmpl/macOS/apacheSSL.vhost | 1-63 |
| HTTPD Config | static/tmpl/macOS/httpd.conf | 1-220 |
