# Ollama Deep Dive

> **模块类型**: AI服务  
> **模块标识**: `ollama`  
> **分析日期**: 2026-04-12  
> **分析基线版本**: 4.13.2

---

## Overview

Ollama 模块为 FlyEnv 提供本地大型语言模型(LLM)的运行和管理能力。用户可以通过该模块下载、管理和运行各种开源 AI 模型(如 Llama、Mistral 等)，并通过 REST API 进行交互。

相关文档链接:
- [Base Module](base.md) - 所有服务模块的基类
- [Fork Process Architecture](fork-architecture.md) - 异步进程架构

Sources: src/render/components/Ollama/Module.ts:1-15

---

## Architecture

### Component Hierarchy Diagram

```
Renderer Process (UI Layer)
├── Module.ts (Module Registration)
├── Index.vue (Main View with Tabs)
│   ├── Service (Service Control Tab)
│   ├── VersionManager (Version Management Tab)
│   ├── Models (Model Management)
│   │   ├── Local Models View
│   │   └── All Models Library
│   ├── Config.vue (Configuration Editor)
│   └── Logs.vue (Log Viewer)
└── aside.vue (Sidebar Navigation)

Main Process
└── ForkManager
    └── Fork Process (BaseManager)
        └── Ollama Module (src/fork/module/Ollama/index.ts)
            ├── _startServer() - Start Ollama daemon
            ├── _stopServer() - Stop Ollama process
            ├── chat() - AI chat streaming
            ├── allModel() - List local models
            └── fetchAllModels() - Fetch online model library
```

### Data Flow Sequence

```
1. User Action (Start Service)
   │
   ▼
2. aside.vue / Index.vue (Renderer)
   │ IPC: app-fork:ollama
   ▼
3. Fork Process (Ollama Module)
   │
   ├─► _startServer()
   │   ├─► initConfig() - Create config file
   │   ├─► getConfEnv() - Parse environment variables
   │   └─► serviceStartExec() - Launch ollama serve
   │
   └─► _stopServer() (inherited from Base)
       └─► ProcessKill() - Terminate ollama process
```

Sources: src/render/components/Ollama/Index.vue:1-43 src/fork/module/Ollama/index.ts:66-157

---

## Data Model

### TypeScript Interfaces

**SoftInstalled** (Extended for Ollama)

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| version | string \| null | Ollama version | Yes |
| bin | string | Path to ollama binary | Yes |
| path | string | Installation directory | Yes |
| num | number \| null | Numeric version for comparison | Yes |
| enable | boolean | Version is valid | Yes |
| run | boolean | Service is running | Yes |
| running | boolean | Service is starting/stopping | Yes |
| typeFlag | AllAppModule | Module identifier ('ollama') | Yes |

**OllamaModelItem** (Model metadata)

| Field | Type | Description |
|-------|------|-------------|
| name | string | Model name (e.g., 'llama3.1', 'mistral') |
| size | string | Model size string |
| url | string | Download URL |
| isRoot | boolean | Category root node flag |
| hasChildren | boolean | Has variant models |
| children | OllamaModelItem[] | Child models list |

Sources: src/render/store/brew.ts:9-24 src/render/components/Ollama/models/all/setup.ts:12-19

### Module Configuration Type

```typescript
type AppModuleItem = {
  moduleType: 'ai'
  typeFlag: 'ollama'
  label: 'Ollama'
  icon: SVGImport
  index: Component
  aside: Component
  asideIndex: 13
  isService: true
  isTray: true
}
```

Sources: src/render/components/Ollama/Module.ts:4-14 src/render/core/type.ts:97-133

---

## Core Components

### Fork Module: Ollama (src/fork/module/Ollama/index.ts)

The Ollama class extends `Base` and implements service-specific logic for managing the Ollama daemon and AI interactions.

| Property | Type | Description |
|----------|------|-------------|
| type | string | 'ollama' |
| chats | Record<string, AbortController> | Active chat sessions |

**Key Methods:**

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `init()` | - | void | Initialize pidPath |
| `_startServer()` | version: SoftInstalled | ForkPromise | Start Ollama serve process |
| `initConfig()` | - | ForkPromise<string> | Create default config file |
| `allModel()` | version: SoftInstalled | ForkPromise | List installed models |
| `fetchAllModels()` | - | ForkPromise | Fetch model library from API |
| `chat()` | param: any, t: number, key: string | ForkPromise | Stream AI chat response |
| `stopOutput()` | chatKey: string | ForkPromise | Abort chat stream |

Sources: src/fork/module/Ollama/index.ts:32-429

### Frontend State Management

**OllamaModelsSetup** (Reactive state for model views)

```typescript
{
  tab: 'local' | 'all'  // Current active tab
}
```

**OllamaLocalModelsSetup** (Local models state)

```typescript
{
  fetching: boolean
  list: OllamaModelItem[]
  reFetch: () => Promise<boolean>
}
```

**OllamaAllModelsSetup** (Online library state)

```typescript
{
  installEnd: boolean
  installing: boolean
  fetching: boolean
  search: string
  xterm: XTerm | undefined
  list: Record<string, OllamaModelItem[]>
  reFetch: () => void
}
```

Sources: src/render/components/Ollama/models/setup.ts:1-81

---

## Lifecycle Management

### Service Startup Flow

```
startService() [Base class]
    │
    ├─► _linkVersion() - Homebrew version linking
    │
    ├─► _stopServer() - Stop existing instance
    │
    └─► _startServer() [Ollama-specific]
        │
        ├─► initConfig() - Ensure config exists
        │   ├─► Create ollama/ directory
        │   ├─► Create ollama.conf
        │   └─► Create ollama.conf.default
        │
        ├─► getConfEnv() - Parse OLLAMA_* env vars
        │   └─► Read ollama.conf, extract KEY=VALUE pairs
        │
        └─► Platform-specific execution
            ├─► Windows: serviceStartExecWin()
            │   └─► PowerShell with env vars
            └─► Unix: serviceStartExec()
                └─► Shell script with exports
```

### Service Stop Flow

Inherited from `Base._stopServer()`:

1. Read PID from `pid/ollama.pid`
2. Search processes matching 'ollama' command
3. Filter by FlyEnv data directories
4. Send `-INT` signal (SIGINT) to terminate
5. Clean up PID file

Sources: src/fork/module/Base/index.ts:84-121 src/fork/module/Base/index.ts:123-250

---

## Configuration System

### Config File Location

| Platform | Path |
|----------|------|
| All | `{BaseDir}/ollama/ollama.conf` |

### Environment Variables

Ollama uses environment variables for configuration, stored in `ollama.conf` as `KEY=VALUE` pairs:

| Variable | Default | Description |
|----------|---------|-------------|
| OLLAMA_DEBUG | - | Enable debug logging |
| OLLAMA_HOST | 0.0.0.0:11434 | Server bind address |
| OLLAMA_KEEP_ALIVE | 5m | Model keep-alive duration |
| OLLAMA_MAX_LOADED_MODELS | - | Max concurrent models |
| OLLAMA_MAX_QUEUE | - | Max request queue size |
| OLLAMA_MODELS | - | Custom models directory |
| OLLAMA_NUM_PARALLEL | - | Parallel request limit |
| OLLAMA_ORIGINS | - | CORS allowed origins |
| OLLAMA_FLASH_ATTENTION | - | Enable flash attention |
| OLLAMA_KV_CACHE_TYPE | f16 | KV cache data type |
| OLLAMA_GPU_OVERHEAD | - | GPU memory overhead |
| OLLAMA_LOAD_TIMEOUT | 5m | Model load timeout |

Sources: src/render/components/Ollama/Config.vue:38-160

---

## API/IPC Interface

### IPC Commands (Renderer to Fork)

| Command | Parameters | Action | Returns |
|---------|-----------|--------|---------|
| `startService` | version: SoftInstalled | Start Ollama service | `{APP-Service-Start-PID: string}` |
| `stopService` | version: SoftInstalled | Stop Ollama service | `{APP-Service-Stop-PID: string[]}` |
| `initConfig` | - | Initialize config files | Config file path |
| `allModel` | version: SoftInstalled | List local models | `OllamaModelItem[]` |
| `fetchAllModels` | - | Fetch model library | `Record<string, OllamaModelItem[]>` |
| `chat` | param: axiosConfig, t: number, key: string | Stream chat response | Stream data |
| `stopOutput` | chatKey: string | Abort chat stream | boolean |
| `installSoft` | row: OnlineVersionItem | Download & install version | boolean |
| `fetchAllOnlineVersion` | - | Get available versions | `OnlineVersionItem[]` |
| `allInstalledVersions` | setup: any | Scan installed versions | `SoftInstalled[]` |

Sources: src/fork/module/Ollama/index.ts:66-427 src/fork/module/Base/index.ts:34-43

### IPC Progress Events

| Event | Data | Description |
|-------|------|-------------|
| `APP-On-Log` | `{type, message}` | Service operation log |
| `APP-Service-Start-PID` | `string` | Process ID of started service |
| `APP-Service-Stop-Success` | `boolean` | Stop command executed |
| `APP-Service-Stop-PID` | `string[]` | List of terminated PIDs |

Sources: src/shared/ForkPromise.ts:1-60

---

## Platform Differences

| Feature | macOS | Windows | Linux | Notes |
|---------|-------|---------|-------|-------|
| Binary name | `ollama` | `ollama.exe` | `ollama` | Windows uses .exe suffix |
| Env var syntax | `export KEY=value` | `$env:KEY="value"` | `export KEY=value` | PowerShell vs Shell |
| Process search | ps command | Windows API | ps command | Uses ProcessPidList on Win |
| Signal handling | SIGINT (-INT) | Terminate | SIGINT (-INT) | All use -INT for ollama |
| Install method | Homebrew/Static | Static (zip) | Static (tgz) | Auto-extract logic differs |

Sources: src/fork/module/Ollama/index.ts:103-156 src/fork/module/Base/index.ts:133-206

---

## AI Chat Implementation

### Chat Streaming Flow

```
1. User sends message
   │
   ▼
2. chat() method called
   ├─► License check (RSA decryption)
   ├─► Trial expiration check
   │
   ▼
3. Create AbortController
   │
   ▼
4. axios streaming request
   │
   ▼
5. Data handler processes chunks
   ├─► Decode with TextDecoder
   ├─► Parse JSON
   ├─► Emit via on() callback
   └─► Check json.done for completion
```

### License Verification

Uses RSA public key decryption to verify machine ID against license:

```typescript
const uuid = await machineId()
const uid = publicDecrypt(getRSAKey(), Buffer.from(global.Server.Licenses!, 'base64')).toString('utf-8')
const isLock = uid !== uuid
```

Trial mode allows 3 days of usage without license.

Sources: src/fork/module/Ollama/index.ts:314-416

---

## Model Management

### Local Models

Uses `ollama list` command to enumerate installed models:

```bash
# macOS/Linux
cd "{bin_dir}" && ./ollama list

# Windows
cd "{bin_dir}"; ./ollama.exe list
```

Parses output table to extract name and size.

### Model Library

Fetches curated model list from FlyEnv API:

```
POST https://api.one-env.com/api/version/fetch
Body: { app: 'ollama_models', os: 'mac', arch: 'x86'|'arm' }
```

Response grouped by model family (llama, mistral, etc.)

### Model Pull/Remove

Uses XTerm terminal for interactive model operations:

```bash
ollama pull {model_name}
ollama rm {model_name}
```

Sources: src/fork/module/Ollama/index.ts:159-185 src/render/components/Ollama/models/all/setup.ts:120-174

---

## UI Components

### Tab Structure (Index.vue)

| Index | Tab | Component | Description |
|-------|-----|-----------|-------------|
| 0 | Service | ServiceManager | Start/stop controls |
| 1 | Versions | VersionManager | Install/manage versions |
| 2 | Models | ModelsVM | Local & library models |
| 3 | Config | Config | Configuration editor |
| 4 | Logs | Logs | Error log viewer |

### Sidebar (aside.vue)

- Icon: Ollama SVG logo
- Status indicator: Running/stopped
- Toggle switch for quick start/stop
- Navigation to module page

Sources: src/render/components/Ollama/Index.vue:34-42 src/render/components/Ollama/aside.vue:1-52

---

## Troubleshooting

### Common Issues

| Symptom | Cause | Solution |
|---------|-------|----------|
| Service won't start | Port 11434 in use | Change OLLAMA_HOST port |
| Model download fails | Network/proxy | Configure proxy in Settings |
| Chat returns error | License expired | Purchase or renew license |
| Models not showing | Ollama not running | Start service first |

### Log Files

| File | Path | Content |
|------|------|---------|
| Error Log | `{BaseDir}/ollama/ollama-{version}-start-error.log` | Startup errors |
| Config | `{BaseDir}/ollama/ollama.conf` | Environment variables |

Sources: src/render/components/Ollama/Logs.vue:1-27

---

## Sources Summary

Key implementation files referenced in this document:

- `src/fork/module/Ollama/index.ts` - Backend service logic
- `src/fork/module/Base/index.ts` - Base class inheritance
- `src/render/components/Ollama/Module.ts` - Module registration
- `src/render/components/Ollama/Index.vue` - Main view component
- `src/render/components/Ollama/aside.vue` - Sidebar component
- `src/render/components/Ollama/Config.vue` - Configuration UI
- `src/render/components/Ollama/models/setup.ts` - Model state management
- `src/render/components/Ollama/models/all/setup.ts` - Library models logic
- `src/render/components/Ollama/models/local/setup.ts` - Local models logic
- `src/render/store/brew.ts` - Version store
- `src/render/core/type.ts` - TypeScript definitions
- `src/render/core/ASide.ts` - Sidebar composable
- `src/shared/ForkPromise.ts` - Async promise utilities

---

*Document generated following DeepWiki style guidelines*
