import { defineStore } from 'pinia'
const IP = require('ip')

interface State {
  running: boolean
  ip: string
}

const state: State = {
  running: false,
  ip: ''
}

export const DnsStore = defineStore('dns', {
  state: (): State => state,
  getters: {},
  actions: {
    getIP() {
      state.ip = IP.address()
    }
  }
})
