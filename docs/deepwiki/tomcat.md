# Tomcat Deep Dive

> **模块类型**: Web服务器  
> **模块标识**: `tomcat`  
> **分析日期**: 2026-04-12  
> **分析基线版本**: 4.13.2

---

## Overview

Tomcat 模块为 FlyEnv 提供 Apache Tomcat Servlet 容器管理功能，支持 Java Web 应用的部署与运行。模块完整实现了 Tomcat 服务的生命周期管理、版本管理、虚拟主机配置以及 SSL/TLS 支持。

## Managed Tomcat Sites

Tomcat 项目在 **Hosts → Tomcat Projects** 中配置。一个站点可以定义零个或多个应用映射；`root` 是 Tomcat Host 的 `appBase`，每个映射独立指定 Context 路径和 `docBase`。选择 appBase 后，FlyEnv 会扫描其直接子目录和 WAR 文件并补充映射：`portal` 对应 `/portal`，`ROOT` 对应 `/`，WAR 使用去掉 `.war` 后的同一规则。

这类 appBase 内、名称与 Context 路径完全一致的直接子应用由 Tomcat 自动部署，FlyEnv 不生成 Context descriptor，避免重复部署。外部目录/WAR 或自定义 Context 路径仍由 FlyEnv 写入标准 descriptor。appBase 本身、嵌套子目录，以及名称与 Context 路径不一致的 appBase 内映射会被拒绝。

FlyEnv 将 Context 写为 Tomcat 标准 descriptor，而不是把 Context 写进 `server.xml`：

```text
<CATALINA_BASE>/conf/Catalina/<host>/
├── ROOT.xml          # /
├── openmrs.xml       # /openmrs
├── api#v1.xml        # /api/v1
└── rewrite.config    # host-level RewriteValve configuration
```

每个 Tomcat 站点只使用其主域名对应的 descriptor 目录。Host 保持 `unpackWARs="true"`、`deployOnStartup="true"` 和 `autoDeploy="true"`，因此 Tomcat 会自动部署 appBase 的自然应用并加载上述标准部署描述符。FlyEnv 只更新包含 FlyEnv 标识的 descriptor、`rewrite.config`、Valve、Connector 与 SNI 条目；手写文件或 XML 不会被覆盖。启用 rewrite 时，FlyEnv 在 Host 上添加标记的 `RewriteValve` 并写入 `rewrite.config`；若该位置已有未标记的 rewrite 文件，保存会明确报冲突。

SSL Connector 会显式设置 `SSLEnabled="true"`、`scheme="https"`、`secure="true"` 和 `defaultSSLHostConfigName="_default_"`。同一 HTTPS 端口的每个站点主域名都有自己的标记 SNI 配置，默认配置按主域名字典序稳定选择。保存时会刷新已有 SNI 的证书路径，解决旧证书继续生效的问题。

保存站点会先协调当前版本的 CATALINA_BASE，再同步 hosts 文件。Tomcat 原本运行时，FlyEnv 使用标准 `ModuleInstalledItem.restart()` 重启一次；原本停止时只保存配置，不会启动服务。

相关文档链接:

- [Java 模块](java.md) - Tomcat 依赖 Java 运行时
- [Host 管理](../README.md) - 虚拟主机配置

---

## Architecture

### Component Hierarchy Diagram

```
Main Process (Application.ts)
├── ForkManager
│   └── ForkProcess
│       └── BaseManager
│           └── Tomcat (src/fork/module/Tomcat/index.ts)
└── WindowManager
    └── BrowserWindow (Main Window)
        ├── Tomcat/Index.vue (Main Panel)
        │   ├── ServiceManager (Service Control)
        │   ├── VersionManager (Version Installation)
        │   ├── Config.vue (server.xml)
        │   ├── Config.vue (web.xml)
        │   └── Logs.vue (Log Viewer)
        └── Tomcat/aside.vue (Aside Switch)
            └── Tomcat/setup.ts (State Management)
```

### Data Flow Sequence

```
1. User Toggle Switch (aside.vue)
   │
   ▼
2. AsideSetup Hook
   │ IPC: app-fork:tomcat:startService
   ▼
3. Main Process (ForkManager)
   │
   ▼
4. Fork Process (BaseManager.exec)
   │
   ▼
5. Tomcat._startServer(version, CATALINA_BASE)
   │
   ▼
6. Service Startup
   ├── _initDefaultDir() - Initialize CATALINA_BASE
   ├── reconcileTomcatBase() - Reconcile managed config
   └── serviceStartExec() - Execute catalina.sh
```

---

## Data Model

### Module Registration (AppModuleItem)

| Field        | Value       | Description               |
| ------------ | ----------- | ------------------------- |
| `moduleType` | `webServer` | Module category           |
| `typeFlag`   | `tomcat`    | Unique identifier         |
| `label`      | `Tomcat`    | Display name              |
| `isService`  | `true`      | Has start/stop capability |
| `isTray`     | `true`      | Show in tray window       |
| `asideIndex` | `4`         | Position in aside menu    |

Sources: src/render/components/Tomcat/Module.ts:4-14

### TomcatSetup State

```typescript
interface TomcatSetup {
  CATALINA_BASE: Record<string, string> // Map<binPath, baseDir>
  init(): void // Load from localForage
  save(): void // Persist to localForage
}
```

Sources: src/render/components/Tomcat/setup.ts:4-8

### SoftInstalled (Partial)

| Field     | Type     | Description                      |
| --------- | -------- | -------------------------------- |
| `bin`     | `string` | Path to catalina.sh/catalina.bat |
| `version` | `string` | Tomcat version string            |
| `path`    | `string` | Installation directory           |

---

## Core Components

### 1. Fork Module: Tomcat Class

Extends `Base` class, implements Tomcat-specific service management.

| Method | Parameters | Returns | Description |
| --- | --- | --- | --- |
| `init()` | - | `void` | Set PID file path |
| `_startServer()` | `version`, `CATALINA_BASE?` | `ForkPromise` | Start Tomcat service |
| `_initDefaultDir()` | `version`, `baseDir?` | `ForkPromise<string>` | Initialize CATALINA_BASE |
| `_fixStartBat()` | `version` | `Promise<void>` | Windows: Fix setclasspath.bat |
| `allInstalledVersions()` | `setup` | `ForkPromise<SoftInstalled[]>` | Fetch local versions |
| `brewinfo()` | - | `ForkPromise` | Get Homebrew formula info |
| `_installSoftHandle()` | `row` | `Promise<void>` | Custom install logic |

Sources: src/fork/module/Tomcat/index.ts:34-346

### 2. Frontend: Index.vue

Main panel component with tab-based navigation.

| Tab Index | Component           | Description                     |
| --------- | ------------------- | ------------------------------- |
| 0         | ServiceManager      | Service control panel           |
| 1         | VersionManager      | Version installation/management |
| 2         | Config (server.xml) | Main server configuration       |
| 3         | Config (web.xml)    | Web application defaults        |
| 4         | Logs                | Access and error logs           |

Features:

- **CATALINA_BASE Selector**: Customizable base directory per version
- **Dynamic Path Resolution**: Auto-generates path from version number

Sources: src/render/components/Tomcat/Index.vue:1-101

### 3. Frontend: aside.vue

Aside menu item with service toggle switch.

| Feature            | Implementation                            |
| ------------------ | ----------------------------------------- |
| Service Toggle     | `AsideSetup('tomcat')` hook               |
| Start Extension    | `startExtParam()` - Returns CATALINA_BASE |
| State Registration | `AppServiceModule.tomcat`                 |

Sources: src/render/components/Tomcat/aside.vue:1-71

### 4. Configuration Generator: ServerXML.ts

Generates dynamic `server.xml` based on Host configuration.

| Function | Parameters | Description |
| --- | --- | --- |
| `makeTomcatServerXML()` | `cnfDir`, `serverContent`, `hostAll` | Generate server.xml with vhosts |
| `reconcileTomcatBase()` | `catalinaBase`, optional hosts | Reconcile server.xml and managed site files |

Sources: src/fork/module/Tomcat/ServerXML.ts

---

## Lifecycle Management

### Service Start Sequence

```
startService(version, CATALINA_BASE)
    │
    ├── 1. Version Validation
    │   └── Check binary exists, version is set
    │
    ├── 2. Version Linking
    │   └── _linkVersion() for Homebrew installs
    │
    ├── 3. Stop Existing
    │   └── _stopServer() - Kill any running instance
    │
    ├── 4. Initialize CATALINA_BASE (Windows)
    │   └── _fixStartBat() - Replace java.exe with javaw.exe
    │
    ├── 5. Initialize Base Directory
    │   └── _initDefaultDir()
    │       ├── Copy conf/ files from installation
    │       └── catalina.policy, server.xml, web.xml, etc.
    │
    ├── 6. Reconcile server.xml and site files
    │   └── reconcileTomcatBase()
    │       ├── Fetch all tomcat-type hosts
    │       ├── Parse existing server.xml
    │       ├── Add Connector ports for each host
    │       ├── Add SSL Connectors (if useSSL)
    │       └── Add Host entries with AccessLogValve
    │
    ├── 7. Create logs directory
    │
    └── 8. Start Service
        ├── Unix/macOS: serviceStartExec()
        │   └── Execute catalina.sh with CATALINA_BASE/PID env
        └── Windows: serviceStartExecCMD()
            ├── Execute catalina.bat
            └── Process search for PID (no PID file)
```

### Service Stop Sequence

```
_stopServer(version)
    │
    ├── 1. Collect PIDs
    │   ├── Read pid/tomcat.pid
    │   ├── Search processes by name:
    │   │   └── "org.apache.catalina.startup.Bootstrap"
    │   └── Filter by BaseDir/AppDir in COMMAND
    │
    ├── 2. Send Termination Signal
    │   ├── Unix/macOS: kill -TERM (SIGTERM)
    │   └── Windows: ProcessKill -INT
    │
    └── 3. Cleanup
        └── Remove pid/tomcat.pid
```

Sources: src/fork/module/Tomcat/index.ts:134-251, src/fork/module/Base/index.ts:84-249

---

## Configuration System

### CATALINA_BASE Structure

```
CATALINA_BASE/
├── conf/
│   ├── catalina.policy
│   ├── catalina.properties
│   ├── context.xml
│   ├── jaspic-providers.xml
│   ├── logging.properties
│   ├── server.xml          # Generated dynamically
│   ├── tomcat-users.xml
│   └── web.xml
├── logs/
│   ├── catalina.out        # Unix/macOS
│   └── catalina.YYYY-MM-DD.log  # Windows
└── work/
    └── (compiled JSPs)
```

### server.xml Generation

The `makeTomcatServerXML()` function dynamically modifies server.xml based on FlyEnv Host configuration:

| Host Property     | XML Element     | Attribute          |
| ----------------- | --------------- | ------------------ |
| `port.tomcat`     | Connector       | `port`             |
| `port.tomcat_ssl` | Connector (SSL) | `port`             |
| `root`            | Host            | `appBase`          |
| `name`            | Host            | `name`             |
| `useSSL`          | SSLHostConfig   | Certificate config |

**Connector Configuration:**

```xml
<Connector appFlag="FlyEnv" port="8080" protocol="HTTP/1.1" connectionTimeout="60000"/>
```

**SSL Connector:**

```xml
<Connector appFlag="FlyEnv" port="8443" protocol="org.apache.coyote.http11.Http11NioProtocol"
           maxThreads="150" SSLEnabled="true" scheme="https">
    <SSLHostConfig sslProtocol="TLS" certificateVerification="false">
        <Certificate certificateFile="/path/to/cert.pem"
                     certificateKeyFile="/path/to/key.pem"
                     type="RSA"/>
    </SSLHostConfig>
</Connector>
```

**Virtual Host:**

```xml
<Host name="example.com" appBase="/path/to/webapp" appFlag="FlyEnv"
      unpackWARs="true" autoDeploy="true">
    <Context path="" docBase=""></Context>
    <Valve className="org.apache.catalina.valves.AccessLogValve"
           directory="/path/to/logs"
           prefix="example.com-tomcat_access_log" suffix=".log"
           pattern="%h %l %u %t &quot;%r&quot; %s %b"/>
</Host>
```

Sources: src/fork/module/Service/ServiceItemJavaTomcat.ts:24-263

---

## API/IPC Interface

### Supported Commands

| Command | Parameters | Returns | Description |
| --- | --- | --- | --- |
| `startService` | `SoftInstalled`, `CATALINA_BASE?` | `{APP-Service-Start-PID: pid}` | Start Tomcat |
| `stopService` | `SoftInstalled` | `{APP-Service-Stop-PID: pids[]}` | Stop Tomcat |
| `allInstalledVersions` | `setup` | `SoftInstalled[]` | List local versions |
| `fetchAllOnlineVersion` | - | `OnlineVersionItem[]` | List downloadable versions |
| `installSoft` | `row` | `boolean` | Download and install |
| `brewinfo` | - | `BrewInfo[]` | Homebrew formula info |

### IPC Events

| Event | Direction | Payload | Description |
| --- | --- | --- | --- |
| `app-fork:tomcat` | Renderer → Main → Fork | `{fn: string, args: any[]}` | Command dispatch |
| `APP-On-Log` | Fork → Renderer | `{type, msg}` | Log messages |
| `APP-Service-Start-PID` | Fork → Renderer | `pid` | Service started |
| `APP-Service-Stop-Success` | Fork → Renderer | `true` | Service stopped |

---

## Platform Differences

| Feature | macOS | Windows | Linux | Notes |
| --- | --- | --- | --- | --- |
| Binary Name | `catalina.sh` | `catalina.bat` | `catalina.sh` | Platform-specific scripts |
| Start Script | `startup.sh` | `startup.bat` | `startup.sh` | Used for version detection |
| Version Script | `version.sh` | `version.bat` | `version.sh` | Version string extraction |
| PID Management | PID file | Process search | PID file | Windows uses `ProcessListSearch` |
| Start Fix | N/A | `_fixStartBat()` | N/A | Replace java.exe → javaw.exe |
| Install Archive | `.tar.gz` | `.zip` | `.tar.gz` | Download format |
| Root Required | No | No | Yes | `root: true` in serviceStartExec |
| Log File | `catalina.out` | `catalina.YYYY-MM-DD.log` | `catalina.out` | Date-stamped on Windows |

### Windows-Specific: `_fixStartBat()`

Replaces `java.exe` with `javaw.exe` in `setclasspath.bat` to prevent console window popup:

```typescript
content = content.replace(
  `set "_RUNJAVA=%JRE_HOME%\\bin\\java.exe"`,
  `set "_RUNJAVA=%JRE_HOME%\\bin\\javaw.exe"`
)
```

Sources: src/fork/module/Tomcat/index.ts:75-85

### Windows-Specific: PID Detection

Uses `ProcessListSearch` to find Tomcat by command line pattern:

```typescript
const pids = await ProcessListSearch(`-Dcatalina.base="${baseDir}"`, false)
```

Sources: src/fork/module/Tomcat/index.ts:177-199

---

## Version Management

### Local Version Detection

1. **Search Paths**: `setup.tomcat.dirs` array
2. **Binary Pattern**:
   - Unix: `catalina.sh` with keyword `tomcat`
   - Windows: `catalina.bat`
3. **Version Extraction**:
   - Execute `version.sh`/`version.bat`
   - Regex: `/Server version: Apache Tomcat\/(.*?)\n/g`

### Online Versions

- Fetched from `https://api.one-env.com/api/version/fetch`
- Supports macOS (x86/arm), Windows (x86), Linux (x86/arm)

### Directory Structure

| Platform | Install Path                     | Example                                         |
| -------- | -------------------------------- | ----------------------------------------------- |
| Windows  | `AppDir/tomcat-{version}`        | `C:\FlyEnv\app\tomcat-9.0.82`                   |
| Unix     | `AppDir/static-tomcat-{version}` | `/Applications/FlyEnv/app/static-tomcat-9.0.82` |

Sources: src/fork/module/Tomcat/index.ts:44-73, 253-309

---

## Troubleshooting

### Common Issues

| Issue                | Cause                  | Solution                           |
| -------------------- | ---------------------- | ---------------------------------- |
| Start fails silently | Java not installed     | Check JAVA_HOME environment        |
| Port conflict        | Another Tomcat running | Check `port.tomcat` in Host config |
| SSL not working      | Certificate paths      | Verify cert/key file existence     |
| 404 errors           | Wrong appBase path     | Check Host `root` directory        |

### Debugging

Enable verbose logging by checking:

1. Fork process logs in Console
2. `logs/catalina.out` (Unix) or `logs/catalina.*.log` (Windows)
3. Host-specific logs in `vhost/logs/`

---

_Sources: src/fork/module/Tomcat/index.ts src/render/components/Tomcat/Module.ts src/render/components/Tomcat/Index.vue src/render/components/Tomcat/aside.vue src/render/components/Tomcat/setup.ts src/render/components/Tomcat/Config.vue src/render/components/Tomcat/Logs.vue src/fork/module/Service/ServiceItemJavaTomcat.ts src/fork/module/Base/index.ts_
