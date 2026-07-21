# Java Deep Dive

> **模块类型**: Programming Language  
> **模块标识**: `java`  
> **分析日期**: 2026-04-12  
> **分析基线版本**: 4.13.2

---

## Overview

Java 模块为 FlyEnv 提供 Java Development Kit (JDK) 的多版本管理能力，支持通过多种包管理器（Homebrew、MacPorts、SDKMAN）以及静态二进制分发版安装和管理不同版本的 Java 运行时环境。与典型的服务类模块不同，Java 模块主要关注版本切换和环境配置，而非守护进程的生命周期管理。

相关文档链接:
- [Maven](./maven.md) - Java 项目构建工具，与 Java 模块紧密集成
- [Tomcat](./tomcat.md) - Java Web 服务器，依赖 Java 运行时
- [Node.js](./nodejs.md) - 同类编程语言模块，结构相似

---

## Architecture

### Component Hierarchy

```
Java Module
├── Fork Process (Backend)
│   └── Java (src/fork/module/Java/index.ts)
│       ├── fetchAllOnlineVersion() - Fetch static builds
│       ├── allInstalledVersions() - Scan local JDKs
│       ├── _installSoftHandle() - Install/unpack JDK
│       ├── brewinfo() - Query Homebrew
│       └── portinfo() - Query MacPorts
└── Renderer Process (Frontend)
    ├── Module.ts - Module registration
    ├── Index.vue - Main view with tabs
    │   ├── ProjectIndex - Java project management
    │   ├── Service - Version selector
    │   ├── Manager - Version installer
    │   └── Maven - Maven integration
    └── aside.vue - Sidebar navigation
```

### Module Registration

Java 模块通过 `Module.ts` 注册到 FlyEnv 应用框架，配置为语言类型模块：

| Property | Value | Description |
|----------|-------|-------------|
| `moduleType` | `language` | Module category |
| `typeFlag` | `java` | Unique identifier |
| `isService` | `true` | Can be started/stopped |
| `isOnlyRunOne` | `false` | Allows multiple versions |
| `asideIndex` | `18` | Sidebar sort order |

Sources: src/render/components/Java/Module.ts1-16

### Data Flow Sequence

```
1. User opens Java tab
   │
   ▼
2. Index.vue loads with 4 tabs
   │
   ▼
3. Tab 0: ProjectIndex (Java projects)
   │ IPC: app-fork:version
   ▼
4. Tab 1: Service (Installed versions)
   │ IPC: app-fork:version
   ▼
5. Tab 2: Manager (Install new versions)
   │ IPC: app-fork:java
   ▼
6. Tab 3: Maven (Build tool)
   │
   ▼
7. Fork Process responds with version lists
```

---

## Data Model

### TypeScript Types

#### SoftInstalled (Shared)

Base interface for installed software versions:

```typescript
interface SoftInstalled {
  version: string | null    // Semantic version
  bin: string               // Path to executable
  path: string              // Installation directory
  num: number | null        // Numeric version for sorting
  error?: string            // Version detection error
  enable: boolean           // Version is usable
  run: boolean              // Currently running
  running: boolean          // Operation in progress
  pid?: string              // Process ID
  typeFlag: AllAppModule    // Module identifier
}
```

Sources: src/render/store/brew.ts9-25

#### OnlineVersionItem (Static Builds)

```typescript
interface OnlineVersionItem {
  appDir: string            // Target installation directory
  zip: string               // Downloaded archive path
  bin: string               // Path to java binary after install
  downloaded: boolean       // Archive exists locally
  installed: boolean        // Binary exists
  url: string               // Download URL
  version: string           // Version string
  mVersion: string          // Major version
  downing?: boolean         // Download in progress
}
```

Sources: src/render/store/brew.ts26-37

#### AppModuleItem (Module Config)

```typescript
type AppModuleItem = {
  moduleType?: AllAppModuleType
  typeFlag: AllAppModule
  label?: string | LabelFn
  icon?: any
  aside: any                // Sidebar component
  asideIndex: number
  index: any                // Main view component
  isService?: boolean
  isTray?: boolean
  isOnlyRunOne?: boolean
}
```

Sources: src/render/core/type.ts97-133

---

## Core Components

### Fork Process: Java Class

The `Java` class extends `Base` and implements JDK-specific version management:

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `fetchAllOnlineVersion()` | - | `ForkPromise<OnlineVersionItem[]>` | Fetch available static JDK builds |
| `allInstalledVersions()` | `setup: any` | `ForkPromise<SoftInstalled[]>` | Scan local JDK installations |
| `_installSoftHandle()` | `row: any` | `Promise<void>` | Install/unpack JDK archive |
| `brewinfo()` | - | `ForkPromise<any>` | Query Homebrew for JDK formulas |
| `portinfo()` | - | `ForkPromise<any>` | Query MacPorts for JDK ports |

Sources: src/fork/module/Java/index.ts23-157

### Version Detection Strategy

Java 模块采用多源扫描策略检测本地 JDK 安装：

**macOS/Linux:**
1. User-configured directories (`setup.java.dirs`)
2. System JDK directory: `/Library/Java/JavaVirtualMachines`
3. SDKMAN directory: `~/.sdkman/candidates/java`

**Windows:**
1. User-configured directories only (`setup.java.dirs`)

```typescript
// macOS version detection
const sdkmanDir = join(global.Server.UserHome!, '.sdkman/candidates/java')
all = [
  versionLocalFetch(
    [...(setup?.java?.dirs ?? []), '/Library/Java/JavaVirtualMachines', sdkmanDir],
    'java',
    'jdk',
    ['Contents/Home/bin/java']
  )
]
```

Sources: src/fork/module/Java/index.ts63-79

### Version Parsing

Java 版本通过执行 `java -version` 命令并解析输出获取：

```typescript
const command = `"${item.bin}" -version`
const reg = /(")(\d+([\.|\d]+){1,4})(["_])/g
```

The regex extracts version strings like `"17.0.8"` from stderr output.

Sources: src/fork/module/Java/index.ts84-88

---

## Lifecycle Management

### Java Module Lifecycle

Unlike service modules (Nginx, MySQL), Java module operates differently:

```
┌─────────────────────────────────────────────────────────┐
│  Java Version Management (No Daemon Process)              │
├─────────────────────────────────────────────────────────┤
│  1. DETECT  → Scan filesystem for JDK installations       │
│  2. SELECT  → User chooses active JDK version             │
│  3. CONFIG  → Update environment variables/PATH           │
│  4. USE     → Java applications use selected JDK          │
└─────────────────────────────────────────────────────────┘
```

### Version Selection Flow

```
User selects version in Service tab
         │
         ▼
AppStore.UPDATE_SERVER_CURRENT()
         │
         ▼
Update shell environment (PATH)
         │
         ▼
Java projects use selected JDK
```

Sources: src/render/core/Module/Module.ts284-333

### Installation Flow

```
User selects version in Manager tab
         │
         ▼
fetchAllOnlineVersion() - Get available versions
         │
         ▼
installSoft() - Download & install
         │
         ▼
_installSoftHandle() - Platform-specific unpacking
   ├─ Windows: zipUnpack + moveChildDirToParent
   └─ macOS/Linux: unpack tar.gz + moveChildDirToParent
         │
         ▼
Verify installation (check bin exists)
```

Sources: src/fork/module/Java/index.ts112-123

---

## API/IPC Interface

### IPC Commands

Java 模块通过 `app-fork:java` channel 处理以下命令：

| Command | Handler | Description |
|---------|---------|-------------|
| `fetchAllOnlineVersion` | `fetchAllOnlineVersion()` | Fetch static JDK builds from API |
| `allInstalledVersions` | `allInstalledVersions(setup)` | Scan local JDK installations |
| `installSoft` | `installSoft(row)` | Download and install JDK |
| `brewinfo` | `brewinfo()` | Query Homebrew formulas |
| `portinfo` | `portinfo()` | Query MacPorts |

Sources: src/fork/module/Base/index.ts34-43

### Static Version API

Static JDK builds are fetched from FlyEnv's version API:

```typescript
const res = await axios({
  url: 'https://api.one-env.com/api/version/fetch',
  method: 'post',
  data: {
    app: 'java',
    os: 'mac' | 'win' | 'linux',
    arch: 'x86' | 'arm'
  }
})
```

Sources: src/fork/module/Base/index.ts301-339

### Homebrew Integration

Java 模块支持通过 Homebrew 安装 OpenJDK：

```typescript
const command = 'brew search -q --formula "/^(jdk|openjdk)((@[\\d\\.]+)?)$/"'
```

This regex matches formulas like `openjdk`, `openjdk@17`, `openjdk@21`.

Sources: src/fork/module/Java/index.ts125-138

### MacPorts Integration

```typescript
const Info = await portSearch(
  `"^((open)?)jdk([\\d\\.]*)$"`,
  (f) => f.includes('Oracle Java SE Development Kit ') || f.includes('OpenJDK '),
  (name) => existsSync(join('/Library/Java/JavaVirtualMachines', name, 'Contents/Home/bin/java'))
)
```

Sources: src/fork/module/Java/index.ts140-155

---

## UI Components

### Index.vue Tab Structure

The Java module main view provides 4 functional tabs:

| Tab Index | Component | Description | I18n Key |
|-----------|-----------|-------------|----------|
| 0 | `ProjectIndex` | Java project management | `host.projectJava` |
| 1 | `Service` | Installed JDK versions | `base.service` |
| 2 | `Manager` | Install new JDK versions | `base.versionManager` |
| 3 | `Maven` | Maven build tool | - |

Sources: src/render/components/Java/Index.vue1-61

### Service Tab

The Service tab (`ServiceManager/base.vue`) displays installed JDK versions with:

- Version number and path
- Environment variable status (in PATH or not)
- Aliases configuration
- Actions (set as current, open directory)

Sources: src/render/components/ServiceManager/base.vue1-182

### Manager Tab

The Manager tab (`VersionManager/index.vue`) provides multi-source installation:

**macOS:**
- Static - Pre-built binaries from FlyEnv
- Homebrew - `brew install openjdk@version`
- MacPorts - `port install openjdkversion`
- SDKMAN - `sdk install java version`

**Windows/Linux:**
- Static - Pre-built binaries
- Homebrew (Linux only)
- SDKMAN

Sources: src/render/components/VersionManager/index.vue1-135

### Project Tab

Java projects are managed through `LanguageProjects/index.vue`, which provides:

- Project directory listing
- Port configuration for each project
- JDK version binding per project
- IDE integration (IntelliJ IDEA, VSCode, etc.)

Sources: src/render/components/LanguageProjects/index.vue1-517

---

## Platform Differences

| Feature | macOS | Windows | Linux | Notes |
|---------|-------|---------|-------|-------|
| Installation sources | Static, Homebrew, MacPorts, SDKMAN | Static only | Static, Homebrew, SDKMAN | Windows lacks package managers |
| Default JDK path | `/Library/Java/JavaVirtualMachines` | User-defined | User-defined | macOS has system standard location |
| SDKMAN support | Yes | No | Yes | SDKMAN is Unix-only |
| Binary extension | - | `.exe` | - | Windows uses `java.exe` |
| Archive format | `.tar.gz` | `.zip` | `.tar.gz` | Platform standard |
| Directory structure | `Contents/Home/bin/java` | `bin/java.exe` | `bin/java` | macOS app bundle structure |

Sources: src/fork/module/Java/index.ts36-55

### Path Construction

**macOS:**
```typescript
dir = join(
  global.Server.AppDir!,
  `static-${type}-${a.version}`,
  'Contents/Home/bin/java'
)
```

**Windows:**
```typescript
dir = join(global.Server.AppDir!, `${type}-${a.version}`, 'bin/java.exe')
```

Sources: src/fork/module/Java/index.ts37-48

---

## Configuration

### User Settings

Java module configuration stored in app settings:

```typescript
setup: {
  java: {
    dirs: string[]  // Custom JDK search directories
  }
}
```

### Environment Integration

When a JDK version is selected:

1. `JAVA_HOME` environment variable is set
2. JDK `bin` directory is prepended to `PATH`
3. Shell configuration files may be updated (platform-dependent)

Sources: src/render/components/ServiceManager/EXT/store.ts

---

## Integration Points

### Maven Integration

Java module includes Maven tab for build management:

```vue
<Maven
  type-flag="maven"
  title="Maven"
  url="https://maven.apache.org/"
  :show-brew-lib="true"
  :has-static="true"
  :show-port-lib="true"
  :show-sdkman-lib="true"
/>
```

Sources: src/render/components/Java/Index.vue31-40

### IDE Integration

Java projects can be opened in IntelliJ IDEA:

```vue
<li @click.stop="Project.openPath(row.path, 'IntelliJ')">
  <yb-icon :svg="import('@/svg/idea.svg?raw')" width="13" height="13" />
  <span class="ml-3">{{ I18nT('nodejs.openIN') }} IntelliJ IDEA</span>
</li>
```

Sources: src/render/components/Java/Index.vue10-14

---

## Sources Summary

| File | Lines | Description |
|------|-------|-------------|
| src/fork/module/Java/index.ts | 1-157 | Backend Java version management |
| src/render/components/Java/Module.ts | 1-16 | Module registration |
| src/render/components/Java/Index.vue | 1-61 | Main view with tabs |
| src/render/components/Java/aside.vue | 1-22 | Sidebar navigation |
| src/fork/module/Base/index.ts | 1-447 | Base class with IPC handling |
| src/render/core/Module/Module.ts | 1-374 | Frontend module lifecycle |
| src/render/core/type.ts | 1-174 | TypeScript type definitions |
| src/render/store/brew.ts | 1-109 | State management |
| src/render/components/ServiceManager/base.vue | 1-182 | Version selection UI |
| src/render/components/VersionManager/index.vue | 1-135 | Version installation UI |
| src/render/components/LanguageProjects/index.vue | 1-517 | Java project management |
