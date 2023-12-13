import { defineStore } from 'pinia'

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
  ip: '0.0.0.0',
  fetching: false,
  log: [
    {
      host: 'www.google.com',
      ip: '0.0.0.0',
      ttl: 50
    },
    {
      host: 'www.github.com',
      ip: '0.0.0.0',
      ttl: 60
    },
    {
      host: 'www.macphpstudy.com',
      ip: '0.0.0.0',
      ttl: 55
    }
  ]
}

export const DnsStore = defineStore('dns', {
  state: (): State => state,
  getters: {},
  actions: {
    getIP() {},
    init() {}
  }
})
