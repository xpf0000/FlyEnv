import { defineStore } from 'pinia'
import { waitTime } from '../fn'

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
  ip: '0.0.0.0',
  fetching: false,
  allFtp: [
    {
      id: '',
      user: 'user',
      pass: 'pass',
      dir: '/Users/XXX/Desktop/FTP/xxx',
      disabled: false,
      mark: ''
    }
  ],
  port: 21
}

export const FtpStore = defineStore('ftp', {
  state: (): State => state,
  getters: {},
  actions: {
    start() {
      return new Promise((resolve) => {
        if (!this.running) {
          resolve(true)
          return
        }
        this.fetching = true
        waitTime().then(() => {
          this.fetching = false
          this.running = true
          resolve(true)
        })
      })
    },
    stop() {
      return new Promise((resolve) => {
        if (!this.running) {
          resolve(true)
          return
        }
        this.fetching = true
        waitTime().then(() => {
          this.fetching = false
          this.running = false
          resolve(true)
        })
      })
    }
  }
})
