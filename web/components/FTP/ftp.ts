import { defineStore } from 'pinia'

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
      this.ip = '127.0.0.1'
    },
    getPort() {
      this.port = 21
    },
    getAllFtp() {
      return new Promise((resolve) => {
        resolve(true)
      })
    }
  }
})
