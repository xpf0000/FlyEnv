import { EventEmitter } from 'events'
import { app, Menu } from 'electron'
import ExceptionHandler from './core/ExceptionHandler'
import logger from './core/Logger'
import Application from './Application'
import type { CallbackFn } from '@shared/app.d'
import { isMacOS, isWindows } from '@shared/utils'

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
    this.handleAppEvents()
  }

  handleAppEvents() {
    this.handelAppReady()
    this.handleAppWillQuit()
  }

  handelAppReady() {
    app.on('ready', () => {
      console.log('app on ready !!!!!!')
      global.application = new Application()
      global.application.start('index')
      global.application.on('ready', () => {})
      if (isWindows()) {
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
