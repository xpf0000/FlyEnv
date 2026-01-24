import { app, dialog } from 'electron'
import is from 'electron-is'
import logger from './Logger'
import { appDebugLog } from '@shared/utils'

const defaults = {
  showDialog: !is.dev()
}
export default class ExceptionHandler {
  options: any
  constructor(options?: any) {
    this.options = {
      ...defaults,
      ...options
    }

    this.setup()
  }

  setup() {
    process.on('uncaughtException', (err) => {
      const { message, stack } = err
      logger.error(`[FlyEnv] Uncaught exception: ${message}`)
      logger.error(stack)
      appDebugLog('[FlyEnv-UncaughtException]', `${message}\n${stack}`).catch()
      if (app.isReady()) {
        dialog.showErrorBox('Error: ', message)
      }
    })
  }
}
