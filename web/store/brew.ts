import { reactive } from 'vue'
import { defineStore } from 'pinia'
import { Installed } from '../config/installed'
import { Ftp } from '../config/ftp'
import { Php } from '../config/php'
import { Nginx } from '../config/nginx'
import { Apache } from '../config/apache'
import { Mysql } from '../config/mysql'
import { Mariadb } from '../config/mariadb'
import { Memcached } from '../config/memcached'
import { Redis } from '../config/redis'
import { Mongodb } from '../config/mongodb'
import { Postgresql } from '../config/postgresql'
import { Caddy } from '../config/caddy'
import { Tomcat } from '@web/config/tomcat'
import { Java } from '@web/config/java'
import { Rabbitmq } from '@web/config/rabbitmq'
import { Go } from '@web/config/go'
import { Maven } from '@web/config/maven'
import { Python } from '@web/config/python'
import { Composer } from '@web/config/composer'
import type { AllAppModule } from '@web/core/type'

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

type StateBase = Partial<Record<AllAppModule, AppSoftInstalledItem | undefined>>

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
  composer: {
    getListing: false,
    installedInited: true,
    installed: Installed.composer,
    list: Composer
  },
  python: {
    getListing: false,
    installedInited: true,
    installed: Installed.python,
    list: Python
  },
  maven: {
    getListing: false,
    installedInited: true,
    installed: Installed.maven,
    list: Maven
  },
  golang: {
    getListing: false,
    installedInited: true,
    installed: Installed.go,
    list: Go
  },
  rabbitmq: {
    getListing: false,
    installedInited: true,
    installed: Installed.rabbitmq,
    list: Rabbitmq
  },
  tomcat: {
    getListing: false,
    installedInited: true,
    installed: Installed.tomcat,
    list: Tomcat
  },
  java: {
    getListing: false,
    installedInited: true,
    installed: Installed.java,
    list: Java
  },
  postgresql: {
    getListing: false,
    installedInited: true,
    installed: Installed.postgresql,
    list: Postgresql
  },
  'pure-ftpd': {
    getListing: false,
    installedInited: true,
    installed: Installed['pure-ftpd'],
    list: Ftp
  },
  caddy: {
    getListing: false,
    installedInited: true,
    installed: Installed.caddy,
    list: Caddy
  },
  nginx: {
    getListing: false,
    installedInited: true,
    installed: Installed.nginx,
    list: Nginx
  },
  apache: {
    getListing: false,
    installedInited: true,
    installed: Installed.apache,
    list: Apache
  },
  php: {
    getListing: false,
    installedInited: true,
    installed: Installed.php,
    list: Php
  },
  memcached: {
    getListing: false,
    installedInited: true,
    installed: Installed.memcached,
    list: Memcached
  },
  mysql: {
    getListing: false,
    installedInited: true,
    installed: Installed.mysql,
    list: Mysql
  },
  mariadb: {
    getListing: false,
    installedInited: true,
    installed: Installed.mariadb,
    list: Mariadb
  },
  redis: {
    getListing: false,
    installedInited: true,
    installed: Installed.redis,
    list: Redis
  },
  mongodb: {
    getListing: false,
    installedInited: true,
    installed: Installed.mongodb,
    list: Mongodb
  }
}

export const BrewStore = defineStore('brew', {
  state: (): State => state,
  getters: {},
  actions: {
    module(flag: AllAppModule): AppSoftInstalledItem {
      if (!this?.[flag]) {
        this[flag] = reactive({
          getListing: false,
          installedInited: false,
          installed: [],
          list: {
            brew: {},
            port: {},
            static: {}
          }
        }) as any
      }
      return this[flag]!
    }
  }
})
