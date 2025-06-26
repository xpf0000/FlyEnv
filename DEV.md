# Development Guide

Thank you to everyone who wishes to contribute to this project!
This guide outlines the project's file structure, architecture, and interface style to help contributors get started quickly.

## Branches
The project has three branches, each corresponding to a different platform:
- **master**: macOS
- **Win**: Windows
- **Linux**: Linux

Please select the appropriate branch based on your development environment.

---

## Interface Style

The current front-end interface is built using [Element Plus](https://element-plus.org/). While it may not be the most visually stunning, it provides a comprehensive set of components with a consistent style.
We welcome contributions to improve the interface design!

### Current Styling Approach
- Previously, many custom classes were used.
- **Now using [Tailwind CSS](https://tailwindcss.com/)** for styling.

### Design Principles
1. **Simplicity and Directness**
   As a developer tool, all functionalities should be straightforward. Minimize the number of clicks required to perform actions.

2. **Consistency**
   While aesthetics can be subjective, maintaining a consistent interface is essential for a good user experience.

---

## Project Architecture and File Structure

The application's workflow is illustrated below:

![flow.png](./flow.png)

### Main Process
The main process acts as a command relay station.
- Commands (e.g., start/stop) initiated from the rendering process (App interface) are forwarded to the forked asynchronous process for execution.
- Results are passed back to the main process, which then relays them to the rendering process.

**Directory**: `/src/main`
**Key Technologies**:
- [Electron](https://electronjs.org/)
- [Node.js](https://nodejs.org/)

---

### Forked Asynchronous Process
All commands are executed here. Being asynchronous, it prevents the main thread from blocking, ensuring the application remains responsive.

**Directory**: `/src/fork`
**Key Technologies**:
- [Node.js](https://nodejs.org/)

#### Module Structure
Services are split into separate module files located in `/src/fork/module`.
A typical module file includes the following:

```typescript
interface SoftInstalled {
  version: string; // Service version
  bin: string;     // Executable file for the service
  path: string;    // Installation path of the service
}

class Module extends Base {
  constructor() {
    super();
    this.type = 'apache';
  }

  /**
   * Start the service
   * @param version - The service version to start
   */
  async _startServer(version: SoftInstalled) {
    // Start services using Node.js's child_process.exec/spawn
  }

  /**
   * Stop the service
   * @param version - The service version to stop
   */
  async _stopService(version: SoftInstalled) {
    // Stop the service by identifying the process and sending a termination signal
  }

  /**
   * Fetch all available online packages
   */
  async fetchAllOnlineVersion() {
    // Parse the official download page or GitHub release API
  }

  /**
   * Download and install an online package
   */
  async installSoft() {}
}
```

---

### Rendering Process (App Interface)
**Directory**: `/src/render`
**Key Technologies**:
- [Vue 3](https://vuejs.org/)
- [Element Plus](https://element-plus.org/)
- [Pinia](https://pinia.vuejs.org/)
- [Monaco Editor](https://github.com/microsoft/monaco-editor)
- [Node.js](https://nodejs.org/)

#### Module Structure
Modules are organized under `/src/render/components` and are loaded automatically.

##### Defining a Module
1. Add a module flag in `src/render/core/type.ts`:

```typescript
export enum AppModuleEnum {
  caddy = 'caddy',
  nginx = 'nginx',
  php = 'php',
  mysql = 'mysql',
  // ... other modules
}
```

2. Create a module folder in `/src/render/components` and add a `Module.ts` file with the following content:

```typescript
import { defineAsyncComponent } from 'vue';
import type { AppModuleItem } from '@/core/type';

const module: AppModuleItem = {
  typeFlag: 'redis',
  label: 'Redis',
  icon: import('@/svg/redis.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 11,
  isService: true,
  isTray: true,
};
export default module;
```

##### AppModuleItem Description
```typescript
export type AppModuleItem = {
  typeFlag: AllAppModule; // Module flag defined in AppModuleEnum
  label?: string | LabelFn; // Module label displayed in Setup -> Menu Show/Hide & Tray Window
  icon?: any; // Module icon displayed in Tray Window
  aside: any; // Left aside module component
  asideIndex: number; // Sort order in the left aside
  index: any; // Module home page component
  isService?: boolean; // Whether the module is a service (can be started/stopped)
  isTray?: boolean; // Whether the module is shown in the tray window
};
```

---

## Internationalization (i18n)
**Directory**: `/src/lang`

FlyEnv supports dynamic loading of language packs.
Contributors can modify and test language packs locally. Once validated, they can be integrated into the project.

---
