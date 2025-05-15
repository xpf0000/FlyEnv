import type { BrowserWindow } from 'electron'
import { format } from 'date-fns'

class AppLog {
  window!: BrowserWindow

  init(win: BrowserWindow) {
    this.window = win
  }

  private log(flag: 'debug' | 'info' | 'error', msg: string) {
    if (!this.window || this.window.isDestroyed()) {
      return
    }
    const time = format(new Date(), 'yyyy/MM/dd HH:mm:ss')
    const message = `[${time}] [${flag}] : ${msg}`
    this.window.webContents.send('APP-On-Log', 'APP-On-Log', message)
  }

  debug(msg: string) {
    this.log('debug', msg)
  }

  info(msg: string) {
    this.log('debug', msg)
  }

  error(msg: string) {
    this.log('error', msg)
  }
}

export default new AppLog()
