import { defineStore } from 'pinia'

interface State {
  composer?: {
    log: Array<string>
  }
  java?: {
    log: Array<string>
  }
  postgresql: {
    log: Array<string>
  }
  tomcat: {
    log: Array<string>
  }
  caddy: {
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
    tool?: 'fnm' | 'nvm' | 'all'
  }
}

const state: State = {
  tomcat: { log: [] },
  postgresql: { log: [] },
  apache: { log: [] },
  memcached: { log: [] },
  mysql: { log: [] },
  mariadb: { log: [] },
  mongodb: { log: [] },
  caddy: { log: [] },
  nginx: { log: [] },
  node: { NVM_DIR: '', btnTxt: '', getVersioning: false, isRunning: false, versions: [] },
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
