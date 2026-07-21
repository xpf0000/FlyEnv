# Node.js Deep Dive

> **模块类型**: 编程语言 (language)  
> **模块标识**: `node`  
> **分析日期**: 2026-04-12  
> **分析基线版本**: 4.13.2

---

## Overview

Node.js 模块是 FlyEnv 中用于管理 Node.js 运行环境的核心组件。它支持多种版本管理工具（内置默认方式、fnm、nvm），提供版本安装/卸载、项目依赖管理、npm 镜像配置等功能。

相关文档链接:
- [Base Class](./base.md) - 所有服务模块的基类
- [ServiceManager](./servicemanager.md) - 服务管理通用组件
- [LanguageProjects](./languageprojects.md) - 语言项目通用组件

---

## Architecture

### Component Hierarchy Diagram

```
Renderer Process
├── Nodejs/Index.vue (Main View)
│   ├── ProjectIndex (项目列表 Tab)
│   ├── Service (服务管理 Tab)
│   ├── Versions/List.vue (版本管理 Tab)
│   │   ├── default/index.vue (FlyEnv 内置)
│   │   ├── fnm/index.vue (fnm 版本管理)
│   │   └── nvm/index.vue (nvm 版本管理)
│   ├── Config.vue (.npmrc 配置 Tab)
│   └── CreateProject.vue (新建项目 Tab)
├── Nodejs/aside.vue (Sidebar Navigation)
└── Nodejs/node.ts (Pinia Store)

Fork Process
├── fork/module/Node/index.ts (macOS/Linux)
└── fork/module/Node.win/index.ts (Windows)
```

### Data Flow Sequence

```
1. User Action (Version Install)
   │
   ▼
2. UI Component (default/index.vue)
   │ IPC: app-fork:node
   ▼
3. Fork Process (Node/index.ts)
   │ - allVersion(): Fetch from nodejs.org
   │ - installOrUninstall(): Download & extract
   ▼
4. Version Storage (~/Library/Application Support/FlyEnv/nodejs/)
   │
   ▼
5. Environment Linking (~/Library/Application Support/FlyEnv/env/node)
```

### Version Management Tools Support

| Tool | Platform | Install Source | Version Storage |
|------|----------|----------------|-----------------|
| default (FlyEnv) | All | nodejs.org | `~/FlyEnv-Data/nodejs/` |
| fnm | All | fnm CLI | `$FNM_DIR/node-versions/` |
| nvm | Unix | nvm CLI | `$NVM_DIR/versions/node/` |

Sources: src/render/components/Nodejs/List.vue:6-10 src/fork/module/Node/index.ts:89-165

---

## Data Model

### TypeScript Interfaces

```typescript
// Store State
interface State {
  tool: 'fnm' | 'nvm' | 'all' | ''     // Current version manager
  fetching: boolean                      // Loading state
  fnm: NodeJSItem                        // fnm versions
  nvm: NodeJSItem                        // nvm versions
  showInstall: boolean                   // Install dialog
  switching: boolean                     // Version switching
  toolInstalling: boolean                // Tool installing
  toolInstallEnd: boolean                // Tool install complete
  logs: string[]                         // Install logs
  all: string[]                          // All available versions
  checking: boolean                      // Tool checking
}

// Version Item
interface NodeJSItem {
  all: Array<string>      // Available versions from remote
  local: Array<string>    // Installed versions
  current: string         // Currently active version
}

// Default Setup Reactive State
interface NodeDefaultSetup {
  installing: Record<string, number>    // Version -> progress
  versionInstalling: Record<string, boolean>
  fetching: boolean
  switching: boolean
  local: Array<string>
  current: string
  search: string
}
```

Sources: src/render/components/Nodejs/node.ts:1-45 src/render/components/Nodejs/default/setup.ts:10-28

### Module Configuration

```typescript
const module: AppModuleItem = {
  moduleType: 'language',
  typeFlag: 'node',
  label: 'NodeJS',
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 17,
  icon: import('@/svg/nodejs.svg?raw'),
  isService: true,        // Can be started/stopped as service
  isTray: true,           // Show in tray menu
  isOnlyRunOne: false     // Can run multiple versions
}
```

Sources: src/render/components/Nodejs/Module.ts:1-16

---

## Core Components

### Frontend Components

| Component | File | Responsibility |
|-----------|------|----------------|
| Index.vue | `Nodejs/Index.vue` | Main view with 5 tabs (Projects, Service, Versions, Config, Create) |
| aside.vue | `Nodejs/aside.vue` | Sidebar navigation item |
| List.vue | `Nodejs/List.vue` | Version manager selector (default/fnm/nvm) |
| Config.vue | `Nodejs/Config.vue` | .npmrc configuration editor with registry presets |
| node.ts | `Nodejs/node.ts` | Pinia store for state management |

### Fork Process Managers

| Platform | File | Key Methods |
|----------|------|-------------|
| macOS/Linux | `fork/module/Node/index.ts` | `allVersion()`, `localVersion()`, `installOrUninstall()`, `checkInstalled()` |
| Windows | `fork/module/Node.win/index.ts` | `allVersion()`, `localVersion()`, `installOrUninstall()`, `_buildEnv()` |

Sources: src/fork/module/Node/index.ts:1-30 src/fork/module/Node.win/index.ts:1-30

---

## Lifecycle Management

### Version Installation Flow (default mode)

```
installOrUninstall('default', 'install', version)
│
├─> 1. Construct download URL
│   URL: https://nodejs.org/dist/v{version}/node-v{version}-{os}-{arch}.tar.xz
│   os: darwin/linux, arch: arm64/x64
│
├─> 2. Download with progress tracking
│   - Stream download to Cache
│   - Progress callback via ForkPromise.on()
│
├─> 3. Extract archive
│   - unpackZip() for tar.xz
│   - moveChildDirToParent() flatten directory
│
├─> 4. Update local version list
│   - Re-scan installed versions
│   - Return updated versions[] and current
│
└─> 5. Environment setup (if first install)
    - Create symlink in env/node
```

### Version Switching Flow

```
versionChange(item)
│
├─> 1. Build version path
│   path: ~/FlyEnv-Data/nodejs/v{item.version}/
│
├─> 2. Update environment via ServiceActionStore
│   IPC: app-fork:tools, 'updatePath'
│
├─> 3. Refresh BrewStore module
│   - Mark installedFetched = false
│   - Re-fetch installed versions
│
└─> 4. Update UI state
    - current version updated
    - switching flag cleared
```

Sources: src/fork/module/Node/index.ts:178-313 src/render/components/Nodejs/default/setup.ts:59-77

---

## API/IPC Interface

### IPC Commands (Node Module)

| Command | Parameters | Returns | Description |
|---------|-----------|---------|-------------|
| `allVersion` | - | `{ all: string[] }` | Fetch all available versions from nodejs.org |
| `checkInstalled` | `tool: 'fnm' \| 'nvm'` | `{ installed: boolean, version: string }` | Check if fnm/nvm is installed |
| `localVersion` | `tool: 'fnm' \| 'nvm' \| 'default'` | `{ versions: string[], current: string, tool: string }` | Get installed versions |
| `installOrUninstall` | `tool, action, version` | `{ versions: string[], current: string, setEnv?: boolean }` | Install or uninstall a version |
| `allInstalled` | - | `Array<{ version, bin }>` | Get all installed versions from fnm/nvm |
| `allInstalledVersions` | `setup` | `SoftInstalled[]` | Get all Node versions with metadata |
| `packageJsonUpdate` | `file, cwd?` | `Record<string, string>` | Check package.json for updates via ncu |

Sources: src/fork/module/Node/index.ts:34-477

### IPC Communication Pattern

```typescript
// Frontend call
IPC.send('app-fork:node', 'installOrUninstall', 'default', 'install', '20.11.0')
  .then((key: string, res: any) => {
    IPC.off(key)
    if (res?.code === 0) {
      // Success - update local versions
    } else if (res?.code === 1) {
      // Error
    } else if (typeof res?.msg?.progress === 'number') {
      // Progress update
    }
  })
```

Sources: src/render/components/Nodejs/default/setup.ts:79-114

---

## Configuration

### .npmrc Configuration

Config.vue provides a visual editor for `.npmrc` with preset registry options:

| Config Key | Description | Preset Options |
|------------|-------------|----------------|
| `registry` | npm registry URL | npm, yarn, tencent, cnpm, taobao, npmMirror, huawei |
| `disturl` | Node binary download URL | Derived from registry |
| `sass_binary_site` | node-sass binary mirror | Derived from registry |
| `phantomjs_cdnurl` | PhantomJS CDN URL | Derived from registry |
| `chromedriver_cdnurl` | ChromeDriver CDN URL | Derived from registry |
| `electron_mirror` | Electron mirror URL | Derived from registry |
| `electron_builder_binaries_mirror` | Electron Builder binaries | Derived from registry |

Sources: src/render/components/Nodejs/Config.vue:33-187

---

## Platform Differences

### Version Manager Detection

| Feature | macOS/Linux | Windows | Notes |
|---------|-------------|---------|-------|
| fnm check | `fnm --version` | PowerShell env check + exe discovery | Windows uses FNM_HOME/FNM_DIR env |
| nvm check | Source nvm.sh then `nvm --version` | set NVM_HOME + exe discovery | Unix nvm requires shell source |
| Version list | Parse `fnm ls` / `nvm ls` output | Parse `fnm.exe ls` / `nvm.exe ls` | Different output formats |

### Download & Installation

| Feature | macOS/Linux | Windows |
|---------|-------------|---------|
| Archive format | `.tar.xz` | `.7z` |
| Unpack method | `unpackZip()` tar.xz | `zipUnpack()` 7z |
| Binary name | `bin/node` | `node.exe` |
| Env directory | `env/node` symlink | `env/node` junction |

### Environment Building (Windows)

Windows version requires special environment setup for fnm/nvm:

```typescript
_buildEnv(tool, dir) {
  const env = { ...process.env }
  if (tool === 'fnm') {
    env.FNM_HOME = dir
    env.FNM_SYMLINK = join(dir, 'nodejs-link')
    env.PATH = [...allPath, dir].join(';')
  } else {
    env.NVM_HOME = dir
    env.NVM_SYMLINK = join(dir, 'nodejs-link')
    env.PATH = [...allPath, dir].join(';')
  }
  return env
}
```

Sources: src/fork/module/Node.win/index.ts:176-204

---

## UI Components

### Index.vue Tab Structure

| Tab Index | Label | Component | Description |
|-----------|-------|-----------|-------------|
| 0 | `host.projectNode` | ProjectIndex | Node.js project management |
| 1 | `base.service` | Service | Service start/stop control |
| 2 | `base.versionManager` | Versions | Version installation/management |
| 3 | `.npmrc` | Config | npm configuration editor |
| 4 | `host.newProject` | Create | New project scaffolding |

Sources: src/render/components/Nodejs/Index.vue:28-35

---

## Sources Reference

Key source files and their responsibilities:

| File | Lines | Description |
|------|-------|-------------|
| `src/fork/module/Node/index.ts` | 479 | macOS/Linux Node.js manager |
| `src/fork/module/Node.win/index.ts` | 682 | Windows Node.js manager |
| `src/render/components/Nodejs/Module.ts` | 16 | Module registration |
| `src/render/components/Nodejs/Index.vue` | 36 | Main view component |
| `src/render/components/Nodejs/aside.vue` | 22 | Sidebar navigation |
| `src/render/components/Nodejs/List.vue` | 55 | Version manager selector |
| `src/render/components/Nodejs/Config.vue` | 268 | .npmrc configuration |
| `src/render/components/Nodejs/node.ts` | 128 | Pinia store |
| `src/render/components/Nodejs/default/setup.ts` | 166 | Default version manager logic |
| `src/fork/module/Base/index.ts` | 447 | Base class with common methods |
