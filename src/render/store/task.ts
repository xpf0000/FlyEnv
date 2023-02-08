import { defineStore } from 'pinia'

interface State {
  nginx: {
    log: Array<string>
  }
  apache: {
    log: Array<string>
  }
  memcached: {
    log: Array<string>
  }
  mysql: {
    log: Array<string>
  }
  redis: {
    log: Array<string>
  }
  php: {
    log: Array<string>
    extendRunning: boolean
    currentExtend: string
    extendAction: string
    extendRefreshing: boolean
  }
  node: {
    isRunning: boolean
    getVersioning: boolean
    btnTxt: string
    versions: Array<string>
    NVM_DIR: string
  }
}

const state: State = {
  apache: { log: [] },
  memcached: { log: [] },
  mysql: { log: [] },
  nginx: { log: [] },
  node: { NVM_DIR: '', btnTxt: '', getVersioning: false, isRunning: false, versions: [] },
  php: {
    currentExtend: '',
    extendAction: '',
    extendRefreshing: false,
    extendRunning: false,
    log: []
  },
  redis: { log: [] }
}

export const TaskStore = defineStore('task', {
  state: (): State => state,
  getters: {},
  actions: {}
})
