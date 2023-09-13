import { app, dialog } from 'electron'
import is from 'electron-is'
import logger from './Logger'

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
    if (is.dev()) {
      return
    }
    const { showDialog } = this.options
    process.on('uncaughtException', (err) => {
      const { message, stack } = err
      logger.error(`[PhpWebStudy] Uncaught exception: ${message}`)
      logger.error(stack)

      if (showDialog && app.isReady()) {
        dialog.showErrorBox('Error: ', message)
      }
    })
  }
}
