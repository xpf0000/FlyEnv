import { uuid } from './Index'

type IPCCallback = (...args: any) => void

class IPC {
  listens: { [key: string]: IPCCallback }

  constructor() {
    this.listens = {}
    window.FlyEnvNodeAPI.ipcReceiveFromMain(
      (e: any, command: string, key: string, ...args: any) => {
        console.log('ipcReceiveFromMain: ', command, key, args)
        if (this.listens[key]) {
          this.listens[key](key, ...args)
        } else if (this.listens[command]) {
          this.listens[command](command, ...args)
        }
      }
    )
  }
  send(command: string, ...args: any) {
    const key = 'IPC-Key-' + uuid()
    console.log('ipcSendToMain: ', command, key, args)
    window.FlyEnvNodeAPI.ipcSendToMain(command, key, ...args)
    return {
      then: (callback: IPCCallback) => {
        this.listens[key] = callback
      }
    }
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
