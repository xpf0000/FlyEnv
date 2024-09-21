import { defineStore } from 'pinia'
import type { AllAppSofts } from '@/store/app'

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
  downing?: boolean
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

type StateBase = Record<AllAppSofts, AppSoftInstalledItem | undefined>

interface State extends StateBase {
  cardHeadTitle: string
  brewRunning: boolean
  showInstallLog: boolean
  brewSrc: string
  log: Array<string>
  LibUse: { [k: string]: 'brew' | 'port' | 'static' }
}

const state: State = {
  cardHeadTitle: '',
  brewRunning: false,
  showInstallLog: false,
  brewSrc: '',
  log: [],
  LibUse: {},
  node: undefined,
  'pure-ftpd': {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {
      brew: {},
      port: {}
    }
  },
  tomcat: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {
      brew: {},
      port: {},
      static: {}
    }
  },
  java: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {
      brew: {},
      port: {},
      static: {}
    }
  },
  composer: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {
      brew: {},
      port: {},
      static: {}
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
