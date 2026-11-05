import { uuid } from './Index'

type IPCCallback = (...args: any) => void

class IPC {
  listens: { [key: string]: IPCCallback }

  constructor() {
    this.listens = {}
    window.FlyEnvNodeAPI.ipcReceiveFromMain(
      (e: any, command: string, key: string, ...args: any) => {
        // Sensitivity belongs to the request identity, including late/duplicate
        // replies after the listener has gone away. No retained key cache needed.
        const sensitive = typeof key === 'string' && key.startsWith('IPC-Key-Sensitive-')
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
      }
    )
  }

  /**
   * 注意: 返回的不是Promise 而是包含then的对象
   * @param command
   * @param args
   */
  private sendInternal(command: string, args: any[], log: boolean) {
    const key = (log ? 'IPC-Key-' : 'IPC-Key-Sensitive-') + uuid()
    if (log) {
      console.log('ipcSendToMain: ', command, key, args)
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
  }
}
export default new IPC()
