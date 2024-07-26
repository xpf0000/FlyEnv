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

export interface OnlineVersionItem {
  appDir: string
  zip: string
  bin: string
  downloaded: boolean
  installed: boolean
  url: string
  version: string
  mVersion: string
}

export interface AppSoftInstalledItem {
  getListing: boolean
  installedInited: boolean
  installed: Array<SoftInstalled>
  list: {
    brew: { [key: string]: any }
    port: { [key: string]: any }
    static?: { [key: string]: OnlineVersionItem }
  }
}

interface State {
  postgresql: AppSoftInstalledItem
  caddy: AppSoftInstalledItem
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
  LibUse: { [k: string]: 'brew' | 'port' }
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
    list: {
      brew: {},
      port: {}
    }
  },
  postgresql: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {
      brew: {},
      port: {}
    }
  },
  caddy: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {
      brew: {},
      port: {},
      static: {}
    }
  },
  nginx: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {
      brew: {},
      port: {}
    }
  },
  apache: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {
      brew: {},
      port: {}
    }
  },
  php: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {
      brew: {},
      port: {},
      static: {}
    }
  },
  memcached: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {
      brew: {},
      port: {}
    }
  },
  mysql: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {
      brew: {},
      port: {}
    }
  },
  mariadb: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {
      brew: {},
      port: {}
    }
  },
  redis: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {
      brew: {},
      port: {}
    }
  },
  mongodb: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {
      brew: {},
      port: {}
    }
  }
}

export const BrewStore = defineStore('brew', {
  state: (): State => state,
  getters: {},
  actions: {}
})
