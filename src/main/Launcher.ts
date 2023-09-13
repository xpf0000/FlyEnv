import { EventEmitter } from 'events'
import { app } from 'electron'
import ExceptionHandler from './core/ExceptionHandler'
import logger from './core/Logger'
import Application from './Application'
import { splitArgv } from './utils'

export default class Launcher extends EventEmitter {
  exceptionHandler?: ExceptionHandler

  constructor() {
    super()
    this.makeSingleInstance(() => {
      this.init()
    })
  }

  makeSingleInstance(callback: Function) {
    const gotSingleLock = app.requestSingleInstanceLock()
    if (!gotSingleLock) {
      app.quit()
    } else {
      app.on('second-instance', (event, argv, workingDirectory) => {
        logger.warn('second-instance====>', argv, workingDirectory)
        global.application.showPage('index')
        app.dock.show().then()
      })
      callback()
    }
  }

  init() {
    this.exceptionHandler = new ExceptionHandler()
    if (process.argv.length > 1) {
      this.handleAppLaunchArgv(process.argv)
    }
    this.handleAppEvents()
  }

  handleAppEvents() {
    this.handelAppReady()
    this.handleAppWillQuit()
  }

  /**
   * handleAppLaunchArgv
   * For Windows, Linux
   * @param {array} argv
   */
  handleAppLaunchArgv(argv?: any) {
    logger.info('handleAppLaunchArgv===>', argv)
    // args: array, extra: map
    const { args, extra } = splitArgv(argv)
    logger.info('splitArgv.args===>', args)
    logger.info('splitArgv.extra===>', extra)
  }

  handelAppReady() {
    app.on('ready', () => {
      console.log('app on ready !!!!!!')
      global.application = new Application()
      global.application.start('index')
      global.application.on('ready', () => {})
    })

    app.on('activate', () => {
      console.log('app on activate !!!!!!')
      if (global.application) {
        logger.info('[PhpWebStudy] activate')
        global.application.showPage('index')
        app.dock.show().then()
      }
    })
  }

  handleAppWillQuit() {
    app.on('will-quit', () => {
      logger.info('[PhpWebStudy] will-quit')
      if (global.application) {
        global.application.stop()
      } else {
        logger.info('[PhpWebStudy] global.application is null !!!')
      }
    })
  }
}
