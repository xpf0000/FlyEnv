# Development Guide

First of all, thank you to everyone who wanted to contribute.

This guide describes the project's file structure, project architecture, and interface style. I hope it will be helpful for contributors to get started.

## Interface Style

The current front-end interface framework uses [element-plus](https://element-plus.org/). It may not be very gorgeous. But at least it provides a complete set of components with a consistent style. I also hope someone can design a more beautiful interface.

Currently, many custom classes are used. Will gradually switch to [taiwindcss](https://tailwindcss.com/) in the future.

The design points of the overall style are as follows:

1. Simple And Direct

As a developer tool, I want all functions to be simple and straightforward. If you can click once, don’t click twice.

2. Consistent Style

Aesthetics may be a very subjective thing. But a consistent interface is definitely the right thing to do

## Project Architecture And File Structure

The running logic of the application is shown in the figure below:

![flow.png](./flow.png)

### Main Process

Application main process. The biggest use is as a command transfer station.

Commands (start/stop...) initiated from the rendering process (App interface) will be forwarded to the forked asynchronous process for execution. The execution results will be passed back to the main process. The main process will then pass them back to the rendering process.

Dir: /src/main

Main technology stack:

[Electron](https://electronjs.org/)

[NodeJS](https://nodejs.org/)

#### I18n

dir: src/main/lang

```typescript
I18nT('update.checkForUpdates')
```

### Fork Async Process

All commands are executed here. Because it is an asynchronous process, it will not cause the main thread to block, causing the application to freeze.

Dir: /src/fork

Main technology stack:

[NodeJS](https://nodejs.org/)

All services are split into separate module files in /src/fork/module.

A module file usually contains the following content

```typescript
/**
 * version: service version
 * bin: service executed file
 * path: service installation path
 */
interface SoftInstalled {
  version: string
  bin: string
  path: string
}

class Module extends Base {
  constructor() {
    super()
    this.type = 'apache'
  }

  /**
   * service start
   * @param version
   */
  async _startServer(version: SoftInstalled) {
      //Start various services. Executed by calling exec/spawn of the child_process module of NodeJS
  }

  /**
   * service stop
   * @param version
   */
  async _stopService(version: SoftInstalled) {
      //Get the running service process using the text contained in the process command. Then use the process signal to shut down the process
      //Or some special way to shut down the process
  }

  /**
   * Get online packages. Note that many services on macOS and Linux do not have packages available for download.
   */
  async fetchAllOnLineVersion() {
    //Usually parsing the official download page or github release api
  }

  /**
   *Download online package
   */
  async installSoft() {}
}
```

#### I18n

dir: src/fork/lang

```typescript
I18nT('fork.needPassWord')
```

### Render Process(App Interface)

dir: /src/render

Main technology stack:

[Vue3](https://vuejs.org/)

[Element-Plus](https://element-plus.org/)

[Pinia](https://pinia.vuejs.org/)

[Monaco-Editor](https://github.com/microsoft/monaco-editor)

[NodeJS](https://nodejs.org/)


All modules split into /src/render/components. The module will automatically load

Define a module as follows:

1. Add module flag in src/render/core/type.ts

```typescript
export enum AppModuleEnum {
  caddy = 'caddy',
  nginx = 'nginx',
  php = 'php',
  mysql = 'mysql',
  mariadb = 'mariadb',
  apache = 'apache',
  memcached = 'memcached',
  redis = 'redis',
  mongodb = 'mongodb',
  postgresql = 'postgresql',
  tomcat = 'tomcat',
  'pure-ftpd' = 'pure-ftpd',
  java = 'java',
  composer = 'composer',
  node = 'node',
  dns = 'dns',
  hosts = 'hosts',
  httpserver = 'httpserver',
  tools = 'tools'
}
```

2. Add module folder in /src/render/components. Then add Module.ts in module folder. Content is like this:

```typescript
import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  typeFlag: 'redis',
  label: 'Redis',
  icon: import('@/svg/redis.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 11,
  isService: true,
  isTray: true
}
export default module
```

The AppModulaItem description is as follows:

```typescript
/**
 * App Module Config
 */
export type AppModuleItem = {
  /**
   * Module flag has defined in AppModuleEnum
   */
  typeFlag: AllAppModule
  /**
   * Module label. display in Setup -> Menu Show/Hide & Tray Window
   */
  label?: string | LabelFn
  /**
   * Module icon. display in Tray Window
   */
  icon?: any
  /**
   * App left aside module component
   */
  aside: any
  /**
   * Module sort in app left aside
   */
  asideIndex: number
  /**
   * Module home page
   */
  index: any
  /**
   * If module is a service. can start/stop.
   */
  isService?: boolean
  /**
   * If module show in tray window
   */
  isTray?: boolean
}
```

#### I18n

dir: src/shared/lang

You can also define the I18n of a module in the module folder. eg: /src/render/components/Setup/lang. I18n language configuration will automatically merge

```typescript
I18nT('fork.needPassWord')
```





