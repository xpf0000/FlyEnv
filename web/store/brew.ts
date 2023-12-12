import { defineStore } from 'pinia'
import { Installed } from '../config/installed'

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
  list: { [key: string]: any }
}

interface State {
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
    installed: Installed["pure-ftpd"],
    list: {}
  },
  nginx: {
    getListing: false,
    installedInited: false,
    installed: Installed.nginx,
    list: {}
  },
  apache: {
    getListing: false,
    installedInited: false,
    installed: Installed.apache,
    list: {}
  },
  php: {
    getListing: false,
    installedInited: false,
    installed: Installed.php,
    list: {}
  },
  memcached: {
    getListing: false,
    installedInited: false,
    installed: Installed.memcached,
    list: {}
  },
  mysql: {
    getListing: false,
    installedInited: false,
    installed: Installed.mysql,
    list: {}
  },
  mariadb: {
    getListing: false,
    installedInited: false,
    installed: Installed.mariadb,
    list: {}
  },
  redis: {
    getListing: false,
    installedInited: false,
    installed: Installed.redis,
    list: {}
  },
  mongodb: {
    getListing: false,
    installedInited: false,
    installed: Installed.mongodb,
    list: {}
  }
}

export const BrewStore = defineStore('brew', {
  state: (): State => state,
  getters: {},
  actions: {}
})
