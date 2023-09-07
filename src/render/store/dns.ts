import { defineStore } from 'pinia'
const IP = require('ip')

interface State {
  running: boolean
  ip: string
  fetching: boolean
}

const state: State = {
  running: false,
  ip: '',
  fetching: false
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
