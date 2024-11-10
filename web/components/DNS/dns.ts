import { defineStore } from 'pinia'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@shared/lang'
import { waitTime } from '@web/fn'

export interface DNSLogItem {
  host: string
  ip: string
  ttl: number
}

interface State {
  running: boolean
  ip: string
  fetching: boolean
  log: Array<DNSLogItem>
}

const state: State = {
  running: false,
  ip: '',
  fetching: false,
  log: []
}

export const DnsStore = defineStore('dns', {
  state: (): State => state,
  getters: {},
  actions: {
    getIP() {
      this.ip = '127.0.0.1'
    },
    init() {},
    deinit() {},
    dnsStop(): Promise<boolean> {
      return new Promise(async (resolve) => {
        if (!this.running) {
          resolve(true)
          return
        }
        this.fetching = true
        await waitTime()
        this.fetching = false
        this.running = false
        MessageSuccess(I18nT('base.success'))
        resolve(true)
      })
    },
    dnsStart(): Promise<boolean> {
      return new Promise(async (resolve) => {
        if (this.running) {
          resolve(true)
          return
        }
        this.fetching = true
        await waitTime()
        this.fetching = false
        this.running = true
        MessageSuccess(I18nT('base.success'))
        resolve(true)
      })
    },
    dnsRestart() {
      this.dnsStop()
        .then(() => this.dnsStart())
        .catch()
    }
  }
})
