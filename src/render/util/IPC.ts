import { uuid } from './Index'

type IPCCallback = (...args: any) => void

class IPC {
  listens: { [key: string]: IPCCallback }
  sensitiveKeys: Set<string>

  constructor() {
    this.listens = {}
    this.sensitiveKeys = new Set()
    window.FlyEnvNodeAPI.ipcReceiveFromMain(
      (e: any, command: string, key: string, ...args: any) => {
        const sensitive = this.sensitiveKeys.has(key)
        if (sensitive) {
          console.log('ipcReceiveFromMain: ', command, key, '[sensitive]')
        } else {
          console.log('ipcReceiveFromMain: ', command, key, args)
        }
        if (this.listens[key]) {
          this.listens[key](key, ...args)
        } else if (this.listens[command]) {
          this.listens[command](command, ...args)
        }
        if (sensitive && args[0]?.code !== 200) {
          this.sensitiveKeys.delete(key)
        }
      }
    )
  }

  /**
   * 注意: 返回的不是Promise 而是包含then的对象
   * @param command
   * @param args
   */
  private sendInternal(command: string, args: any[], log: boolean) {
    const key = 'IPC-Key-' + uuid()
    if (log) {
      console.log('ipcSendToMain: ', command, key, args)
    } else {
      this.sensitiveKeys.add(key)
    }
    window.FlyEnvNodeAPI.ipcSendToMain(command, key, ...args)
    return {
      key,
      then: (callback: IPCCallback) => {
        this.listens[key] = callback
      }
    }
  }
  send(command: string, ...args: any) {
    return this.sendInternal(command, args, true)
  }
  sendSensitive(command: string, ...args: any) {
    return this.sendInternal(command, args, false)
  }
  on(command: string) {
    return {
      then: (callback: IPCCallback) => {
        this.listens[command] = callback
      }
    }
  }
  off(command: string) {
    delete this.listens[command]
    this.sensitiveKeys.delete(command)
  }
}
export default new IPC()
