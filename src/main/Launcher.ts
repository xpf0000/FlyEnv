import { EventEmitter } from 'events'
import { app, Menu } from 'electron'
import ExceptionHandler from './core/ExceptionHandler'
import logger from './core/Logger'
import Application from './Application'
import type { CallbackFn } from '@shared/app.d'
import { appDebugLog, isLinux, isMacOS, isWindows } from '@shared/utils'
import { AppStartFlagChech } from './app'

export default class Launcher extends EventEmitter {
  exceptionHandler?: ExceptionHandler

  constructor() {
    super()
    this.makeSingleInstance(() => {
      this.init()
    })
  }

  makeSingleInstance(callback: CallbackFn) {
    const gotSingleLock = app.requestSingleInstanceLock()
    if (!gotSingleLock) {
      app.quit()
    } else {
      app.on('second-instance', (event, argv, workingDirectory) => {
        logger.warn('second-instance====>', argv, workingDirectory)
        global.application.showPage('index')
        if (isMacOS()) {
          app.dock?.show()?.catch()
        }
      })
      callback()
    }
  }

  init() {
    this.exceptionHandler = new ExceptionHandler()
    if (AppStartFlagChech()) {
      app.commandLine.appendSwitch('disable-gpu-sandbox')
      app.commandLine.appendSwitch('--no-sandbox')
    }
    if (isWindows()) {
      // 启用高 DPI 支持
      app.commandLine.appendSwitch('high-dpi-support', '1')
    }
    this.handleAppEvents()
  }

  handleAppEvents() {
    this.handleDiagnosticEvents()
    this.handelAppReady()
    this.handleAppWillQuit()
  }

  handleDiagnosticEvents() {
    app.on('child-process-gone', async (_event, details) => {
      const gpuInfo = app.isReady()
        ? await app.getGPUInfo('basic').catch((error) => ({ error: `${error}` }))
        : undefined
      const payload = {
        details,
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
        platform: process.platform,
        platformVersion: process.getSystemVersion?.(),
        appVersion: app.isReady() ? app.getVersion() : global.Server?.APPVersion,
        activeForkActions: global.Server?.DebugForkActions ?? [],
        gpuFeatureStatus: app.isReady() ? app.getGPUFeatureStatus() : undefined,
        gpuInfo
      }
      const message = JSON.stringify(payload)
      logger.error(`[FlyEnv][ChildProcessGone] ${message}`)
      appDebugLog('[FlyEnv-ChildProcessGone]', message).catch()
    })
  }

  handelAppReady() {
    app.on('ready', async () => {
      console.log('app on ready !!!!!!')
      global.application = new Application()
      global.application.start('index')
      global.application.on('ready', () => {})
      if (isWindows() || isLinux()) {
        Menu.setApplicationMenu(null)
      }
    })

    app.on('activate', () => {
      console.log('app on activate !!!!!!')
      if (global.application) {
        logger.info('[FlyEnv] activate')
        global.application.showPage('index')
        if (isMacOS()) {
          app.dock?.show()?.catch()
        }
      }
    })
  }

  handleAppWillQuit() {
    app.on('will-quit', () => {
      logger.info('[FlyEnv] will-quit')
      if (global.application) {
        global.application.stop()
      } else {
        logger.info('[FlyEnv] global.application is null !!!')
      }
    })
  }
}
