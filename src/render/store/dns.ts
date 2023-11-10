import { defineStore } from 'pinia'
import IPC from '@/util/IPC'
import { reactive } from 'vue'
const IP = require('ip')

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
      this.ip = IP.address()
    },
    init() {
      IPC.on('App_DNS_Log').then((key: string, res: DNSLogItem) => {
        this.log.unshift(reactive(res))
        this.log.splice(1000)
      })
    }
  }
})
