# FlyEnv - AI Agent Development Guide

## Project Overview

**FlyEnv** is an All-In-One Full-Stack Environment Management Tool built with Electron and Vue 3. It provides a lightweight, modular development environment manager for Windows, macOS, and Linux, allowing developers to install and manage Apache, PHP, Node.js, Python, databases, and more—running natively without Docker.

- **Version**: 4.13.2
- **Electron Version**: 35.7.5
- **License**: MIT
- **Author**: Pengfei Xu
- **Repository**: https://github.com/xpf0000/FlyEnv

## Technology Stack

### Core Technologies
- **Frontend Framework**: Vue 3 (Composition API)
- **Desktop Framework**: Electron 35.7.5
- **Build Tool**: Vite 6.x + esbuild 0.25.x
- **Language**: TypeScript 5.8.x
- **State Management**: Pinia 3.x
- **UI Component Library**: Element Plus 2.11.x
- **Styling**: Tailwind CSS 3.4.x + SCSS
- **Internationalization**: Vue I18n 11.x

### Additional Libraries
- **Code Editor**: Monaco Editor
- **Terminal**: node-pty + xterm.js
- **HTTP Client**: Axios
- **Process Management**: child_process, node-pty
- **File Operations**: fs-extra
- **Markdown Processing**: markdown-it + Shiki

## Project Architecture

FlyEnv follows Electron's multi-process architecture with three main components:

### 1. Main Process (`/src/main`)
Acts as a command relay station between the renderer and fork processes.

**Key Files**:
- `index.ts` - Entry point, initializes Launcher
- `Launcher.ts` - Application bootstrap, single-instance lock, event handling
- `Application.ts` - Main application controller, window management, IPC handling

**Core Managers**:
- `WindowManager` - Browser window creation and management
- `TrayManager` - System tray functionality
- `MenuManager` - Application menus
- `ConfigManager` - Configuration persistence
- `ForkManager` - Forked process management
- `NodePTY` - Terminal PTY handling

### 2. Forked Asynchronous Process (`/src/fork`)
Executes all heavy commands asynchronously to prevent main thread blocking.

**Key Files**:
- `index.ts` - Fork process entry point
- `BaseManager.ts` - Command dispatcher
- `module/Base/index.ts` - Base class for all service modules

**Module Structure** (`/src/fork/module/`):
Each service has its own module (e.g., `Nginx/`, `Php/`, `Mysql/`). A typical module extends the `Base` class and implements:
- `_startServer(version)` - Start the service
- `_stopService(version)` - Stop the service
- `fetchAllOnlineVersion()` - Fetch available versions
- `installSoft()` - Download and install

### 3. Renderer Process (`/src/render`)
Vue 3-based UI application.

**Key Files**:
- `main.ts` - Renderer entry point
- `App.vue` - Root component
- `core/type.ts` - Module type definitions

**Directory Structure**:
- `components/` - Vue components organized by module
- `store/` - Pinia stores
- `util/` - Utility functions
- `style/` - Global styles (SCSS)

~~### 4. Helper Process (`/src/helper`)
Background helper process for privileged operations.~~

Deprecated. Only the Go version is used.

### 5. Go Helper (`/src/helper-go/`)
Go-based helper binary for platform-specific operations (Windows admin tasks).

### 6. Shared Code (`/src/shared`)
Shared utilities between all processes:
- `ForkPromise.ts` - Promise with progress callbacks
- `Process.ts` - Process management utilities
- `child-process.ts` - Child process helpers
- `utils.ts` - Platform detection utilities

### 7. Internationalization (`/src/lang`)
Supports 25+ languages with JSON-based translation files.

**Supported Languages**:
Arabic, Azerbaijani, Bengali, Czech, Danish, German, Greek, English, Spanish, Finnish, French, Indonesian, Italian, Japanese, Dutch, Norwegian, Polish, Portuguese, Portuguese (Brazil), Romanian, Russian, Swedish, Turkish, Ukrainian, Vietnamese, Chinese.

## Build System

### Build Scripts (package.json)

```bash
# Development
yarn dev                          # Start development server with hot reload
yarn clean:dev                    # Clean dist folder
yarn build-dev-runner             # Build dev runner script

# Production Build
yarn build                        # Build for production (platform-specific)
yarn clean                        # Clean node-pty build
yarn postinstall                  # Install Electron app dependencies
```

### Build Process Flow

1. **Development** (`yarn dev`):
   - Cleans dist folder
   - Builds dev-runner.ts → `electron/dev-runner.mjs`
   - Starts Vite dev server
   - Watches main/ and fork/ directories for changes
   - Restarts Electron on file changes

2. **Production** (`yarn build`):
   - Cleans dist folder and node-pty build
   - Builds main process with esbuild
   - Builds fork process with esbuild
   - Builds renderer with Vite
   - Packages with electron-builder

### esbuild Configuration (`/configs/esbuild.config.ts`)

| Target | Entry | Output | Minify |
|--------|-------|--------|--------|
| dev | src/main/index.dev.ts | dist/electron/main.mjs | false |
| dist | src/main/index.ts | dist/electron/main.mjs | true |
| devFork | src/fork/index.ts | dist/electron/fork.mjs | false |
| distFork | src/fork/index.ts | dist/electron/fork.mjs | true |
| devHelper | src/helper/index.ts | dist/helper/helper.js | true |
| distHelper | src/helper/index.ts | dist/helper/helper.js | true |

### Vite Configuration (`/configs/vite.config.ts`)

**Entry Points**:
- `main` - Main application window
- `tray` - Tray popup window
- `capturer` - Screen capture window

**Path Aliases**:
- `@` → `src/render/`
- `@shared` → `src/shared/`
- `@lang` → `src/lang/`

## Code Style Guidelines

### ESLint Configuration
- Uses flat config format (`eslint.config.mjs`)
- TypeScript ESLint recommended rules
- Vue 3 recommended rules
- Prettier integration for formatting

### Key Rules
- `@typescript-eslint/no-explicit-any`: error (disabled in practice)
- `vue/multi-word-component-names`: off
- `vue/block-lang`: requires TypeScript in Vue SFCs
- `prettier/prettier`: error (formatting issues treated as errors)

### Styling
- **Primary**: Tailwind CSS for utility-first styling
- **Secondary**: SCSS for complex styles
- **Dark Mode**: CSS selector-based (`darkMode: 'selector'`)

### Code Conventions
- Use TypeScript for all new code
- Vue SFCs must use `<script lang="ts">`
- Prefer Composition API over Options API
- Use Pinia for state management
- Follow existing module patterns for new services

## Adding a New Module

### Step 1: Define Module Type
Add to `src/render/core/type.ts` in `AppModuleEnum`:

```typescript
export enum AppModuleEnum {
  myservice = 'myservice',
  // ... existing modules
}
```

### Step 2: Create Fork Module
Create `/src/fork/module/MyService/index.ts`:

```typescript
import { Base } from '../Base';
import type { SoftInstalled } from '@shared/app';

class MyService extends Base {
  constructor() {
    super();
    this.type = 'myservice';
  }

  async _startServer(version: SoftInstalled) {
    // Implementation
  }

  async _stopService(version: SoftInstalled) {
    // Implementation
  }
}

export default new MyService();
```

### Step 3: Create Renderer Components
Create `/src/render/components/MyService/`:
- `Module.ts` - Module definition
- `Index.vue` - Main view
- `aside.vue` - Sidebar component

### Step 4: Add Translations
Create translation files in `/src/lang/*/myservice.json` and add to `index.ts`.

## Testing

### Test Directory (`/test/`)
Contains various test files and utilities:
- `test.ts` - General test file
- `powershell.ts` - PowerShell tests
- `docker-compose.yml` - Docker test configuration

**Note**: The project currently does not have automated unit tests configured. Testing is primarily done manually during development.

## Development Workflow

### Prerequisites
- Node.js 18+
- Yarn package manager
- Platform-specific build tools:
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Visual Studio Build Tools
  - **Linux**: build-essential

### Getting Started

```bash
# Clone and install
git clone git@github.com:xpf0000/FlyEnv.git
cd FlyEnv
yarn install

# Development
yarn dev

# Build for production
yarn build
```

### Platform-Specific Notes

**macOS**:
- May require `sudo xattr -dr "com.apple.quarantine"` for helper binaries
- Uses `flyenv-helper` for privileged operations

**Windows**:
- Uses `flyenv-helper-windows-amd64-v1.exe` Go binary for admin tasks
- PowerShell scripts in `/scripts/`

**Linux**:
- Supports both .deb and .rpm packaging
- Uses native package managers for dependencies

## Security Considerations

1. **Privilege Escalation**: Uses helper processes for root/admin operations
2. **Code Signing**: Configured for macOS notarization and signing
3. **Sandbox**: Disables GPU sandbox for certain operations
4. **Process Isolation**: Forked process for command execution

## Deployment

### GitHub Actions Workflows
- `.github/workflows/macos-version-build.yml`
- `.github/workflows/windows-version-build.yml`
- `.github/workflows/linux-version-build.yml`

### Release Artifacts
- **macOS**: `.dmg` (Intel & Apple Silicon)
- **Windows**: `.exe` installer and portable
- **Linux**: `.deb` and `.rpm` packages

## Useful Commands

```bash
# Fix macOS helper permissions
yarn fix-flyenv-helper

# Kill running Electron processes (Windows)
npx tsx scripts/electron-process-kill.ts

# Update dependencies
yarn upgrade-interactive
```

## Common Issues

1. **node-pty build failures**: Run `yarn clean` and rebuild
2. **Port conflicts**: Default dev port is defined in `configs/vite.port.ts`
3. **Module not found**: Ensure all path aliases are correctly resolved

## Resources

- **Website**: https://www.flyenv.com
- **Documentation**: https://deepwiki.com/xpf0000/FlyEnv
- **Discord**: https://discord.gg/u5SuMGxjPE
- **Releases**: https://github.com/xpf0000/FlyEnv/releases
