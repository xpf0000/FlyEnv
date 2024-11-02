import { defineStore } from 'pinia'
import IPC from '@/util/IPC'
const IP = require('ip')

export interface FtpItem {
  user: string
  pass: string
  dir: string
  disabled: boolean
  mark: string
}

interface State {
  running: boolean
  ip: string
  fetching: boolean
  allFtp: Array<FtpItem>
  port: number
}

const state: State = {
  running: false,
  ip: '',
  fetching: false,
  allFtp: [],
  port: 0
}

export const FtpStore = defineStore('ftp', {
  state: (): State => state,
  getters: {},
  actions: {
    getIP() {
      this.ip = IP.address()
    },
    getPort() {
      IPC.send('app-fork:pure-ftpd', 'getPort').then((key: string, res?: any) => {
        IPC.off(key)
        this.port = res?.data
      })
    },
    getAllFtp() {
      return new Promise((resolve) => {
        IPC.send('app-fork:pure-ftpd', 'getAllFtp').then((key: string, res?: any) => {
          IPC.off(key)
          this.allFtp.splice(0)
          const arr = res?.data ?? []
          this.allFtp.push(...arr)
          resolve(true)
        })
      })
    },
    start(): Promise<string | boolean> {
      return new Promise((resolve) => {
        if (this.running) {
          resolve(true)
          return
        }
        this.fetching = true
        IPC.send('app-fork:pure-ftpd', 'startService', { version: '1.0' }).then(
          (key: string, res?: any) => {
            IPC.off(key)
            this.fetching = false
            this.running = res?.data === true
            if (res?.code === 0) {
              resolve(true)
            } else {
              resolve(res?.msg ?? new Error('Ftp start fail!'))
            }
          }
        )
      })
    },
    stop(): Promise<string | boolean> {
      return new Promise((resolve) => {
        if (!this.running) {
          resolve(true)
          return
        }
        this.fetching = true
        IPC.send('app-fork:pure-ftpd', 'stopService', { version: '1.0' }).then(
          (key: string, res?: any) => {
            IPC.off(key)
            this.fetching = false
            this.running = false
            if (res?.code === 0) {
              resolve(true)
            } else {
              resolve(res?.msg ?? new Error('Ftp start fail!'))
            }
          }
        )
      })
    },
    reStart(): Promise<string | boolean> {
      return new Promise(async (resolve) => {
        await this.stop()
        await this.start()
        resolve(true)
      })
    }
  }
})
