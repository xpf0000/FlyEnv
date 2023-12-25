import { defineStore } from 'pinia'

interface State {
  postgresql: {
    log: Array<string>
  }
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
  mariadb: {
    log: Array<string>
  }
  mongodb: {
    log: Array<string>
  }
  redis: {
    log: Array<string>
  }
  'pure-ftpd': {
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
  postgresql: { log: [] },
  apache: { log: [] },
  memcached: { log: [] },
  mysql: { log: [] },
  mariadb: { log: [] },
  mongodb: { log: [] },
  nginx: { log: [] },
  node: { NVM_DIR: 'xxxxxx', btnTxt: '', getVersioning: false, isRunning: false, versions: [] },
  php: {
    currentExtend: '',
    extendAction: '',
    extendRefreshing: false,
    extendRunning: false,
    log: []
  },
  redis: { log: [] },
  'pure-ftpd': { log: [] }
}

export const TaskStore = defineStore('task', {
  state: (): State => state,
  getters: {},
  actions: {}
})
