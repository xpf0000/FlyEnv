import { ipcRenderer } from '../global.js'
import { uuid } from './Index.js'
class IPC {
  constructor() {
    this.listens = {}
    ipcRenderer.on('command', (e, command, key, ...args) => {
      console.log('command: ', command, key, args)
      if (this.listens[key]) {
        this.listens[key](key, ...args)
      } else if (this.listens[command]) {
        this.listens[command](command, ...args)
      }
    })
  }
  send(command, ...args) {
    const key = 'IPC-Key-' + uuid()
    ipcRenderer.send('command', command, key, ...args)
    return {
      then: (callback) => {
        this.listens[key] = callback
      }
    }
  }
  on(command) {
    return {
      then: (callback) => {
        this.listens[command] = callback
      }
    }
  }
  off(command) {
    delete this.listens[command]
  }
}
export default new IPC()
