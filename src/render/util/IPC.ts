import { uuid } from './Index'

type IPCCallBack = (...args: any) => void

class IPC {
  listens: { [key: string]: IPCCallBack }

  constructor() {
    this.listens = {}
    window.FlyEnvNodeAPI.ipcReceiveFromMain(
      (e: any, command: string, key: string, ...args: any) => {
        // console.log('ipcReceiveFromMain: ', command, key, args)
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
    // console.log('command send: ', command, key, args)
    window.FlyEnvNodeAPI.ipcSendToMain(command, key, ...args)
    return {
      then: (callback: IPCCallBack) => {
        this.listens[key] = callback
      }
    }
  }
  on(command: string) {
    return {
      then: (callback: IPCCallBack) => {
        this.listens[command] = callback
      }
    }
  }
  off(command: string) {
    delete this.listens[command]
  }
}
export default new IPC()
