import { defineStore } from 'pinia'

export interface SoftInstalled {
  version: string | null
  bin: string
  path: string
  num: number | null
  error?: string
  enable: boolean
  run: boolean
  running: boolean
  phpBin?: string
  phpConfig?: string
  phpize?: string
  flag?: string
}

export interface AppSoftInstalledItem {
  getListing: boolean
  installedInited: boolean
  installed: Array<SoftInstalled>
  list: {
    brew: { [key: string]: any }
    port: { [key: string]: any }
  }
}

interface State {
  postgresql: AppSoftInstalledItem
  nginx: AppSoftInstalledItem
  apache: AppSoftInstalledItem
  memcached: AppSoftInstalledItem
  mysql: AppSoftInstalledItem
  mariadb: AppSoftInstalledItem
  redis: AppSoftInstalledItem
  php: AppSoftInstalledItem
  mongodb: AppSoftInstalledItem
  'pure-ftpd': AppSoftInstalledItem
  cardHeadTitle: string
  brewRunning: boolean
  showInstallLog: boolean
  brewSrc: string
  log: Array<string>
  LibUse: { [k: string]: string }
}

const state: State = {
  cardHeadTitle: '',
  brewRunning: false,
  showInstallLog: false,
  brewSrc: '',
  log: [],
  LibUse: {},
  'pure-ftpd': {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {}
  },
  postgresql: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {}
  },
  nginx: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {}
  },
  apache: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {}
  },
  php: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {}
  },
  memcached: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {}
  },
  mysql: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {}
  },
  mariadb: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {}
  },
  redis: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {}
  },
  mongodb: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {}
  }
}

export const BrewStore = defineStore('brew', {
  state: (): State => state,
  getters: {},
  actions: {}
})
