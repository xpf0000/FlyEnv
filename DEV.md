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

### Fork Async Process

All commands are executed here. Because it is an asynchronous process, it will not cause the main thread to block, causing the application to freeze.

Dir: /src/fork

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

### Render Process(App Interface)

dir: /src/render

All modules split into /src/render/components

If you want add a new module. flow this:

1. Copy a exists module dir like nginx. change dir name to the module name
2. find string 'nginx' from Index.vue file, and change it to module name
3.




