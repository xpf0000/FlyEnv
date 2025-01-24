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
import { Mailpit } from '@web/config/mailpit'
import type { AllAppModule } from '@web/core/type'

export interface SoftInstalled {
  typeFlag: AllAppModule
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
  LibUse: { [k: string]: 'brew' | 'port' | 'static' | 'local' }
}

const state: State = {
  cardHeadTitle: '',
  brewRunning: false,
  showInstallLog: false,
  brewSrc: '',
  log: [],
  LibUse: {},
  mailpit: {
    getListing: false,
    installedInited: true,
    installed: Installed.mailpit.map((item) => {
      return {
        ...item,
        typeFlag: 'mailpit'
      }
    }),
    list: Mailpit
  },
  composer: {
    getListing: false,
    installedInited: true,
    installed: Installed.composer.map((item) => {
      return {
        ...item,
        typeFlag: 'composer'
      }
    }),
    list: Composer
  },
  python: {
    getListing: false,
    installedInited: true,
    installed: Installed.python.map((item) => {
      return {
        ...item,
        typeFlag: 'python'
      }
    }),
    list: Python
  },
  maven: {
    getListing: false,
    installedInited: true,
    installed: Installed.maven.map((item) => {
      return {
        ...item,
        typeFlag: 'maven'
      }
    }),
    list: Maven
  },
  golang: {
    getListing: false,
    installedInited: true,
    installed: Installed.go.map((item) => {
      return {
        ...item,
        typeFlag: 'golang'
      }
    }),
    list: Go
  },
  rabbitmq: {
    getListing: false,
    installedInited: true,
    installed: Installed.rabbitmq.map((item) => {
      return {
        ...item,
        typeFlag: 'rabbitmq'
      }
    }),
    list: Rabbitmq
  },
  tomcat: {
    getListing: false,
    installedInited: true,
    installed: Installed.tomcat.map((item) => {
      return {
        ...item,
        typeFlag: 'tomcat'
      }
    }),
    list: Tomcat
  },
  java: {
    getListing: false,
    installedInited: true,
    installed: Installed.java.map((item) => {
      return {
        ...item,
        typeFlag: 'java'
      }
    }),
    list: Java
  },
  postgresql: {
    getListing: false,
    installedInited: true,
    installed: Installed.postgresql.map((item) => {
      return {
        ...item,
        typeFlag: 'postgresql'
      }
    }),
    list: Postgresql
  },
  'pure-ftpd': {
    getListing: false,
    installedInited: true,
    installed: Installed['pure-ftpd'].map((item) => {
      return {
        ...item,
        typeFlag: 'pure-ftpd'
      }
    }),
    list: Ftp
  },
  caddy: {
    getListing: false,
    installedInited: true,
    installed: Installed.caddy.map((item) => {
      return {
        ...item,
        typeFlag: 'caddy'
      }
    }),
    list: Caddy
  },
  nginx: {
    getListing: false,
    installedInited: true,
    installed: Installed.nginx.map((item) => {
      return {
        ...item,
        typeFlag: 'nginx'
      }
    }),
    list: Nginx
  },
  apache: {
    getListing: false,
    installedInited: true,
    installed: Installed.apache.map((item) => {
      return {
        ...item,
        typeFlag: 'apache'
      }
    }),
    list: Apache
  },
  php: {
    getListing: false,
    installedInited: true,
    installed: Installed.php.map((item) => {
      return {
        ...item,
        typeFlag: 'php'
      }
    }),
    list: Php
  },
  memcached: {
    getListing: false,
    installedInited: true,
    installed: Installed.memcached.map((item) => {
      return {
        ...item,
        typeFlag: 'memcached'
      }
    }),
    list: Memcached
  },
  mysql: {
    getListing: false,
    installedInited: true,
    installed: Installed.mysql.map((item) => {
      return {
        ...item,
        typeFlag: 'mysql'
      }
    }),
    list: Mysql
  },
  mariadb: {
    getListing: false,
    installedInited: true,
    installed: Installed.mariadb.map((item) => {
      return {
        ...item,
        typeFlag: 'mariadb'
      }
    }),
    list: Mariadb
  },
  redis: {
    getListing: false,
    installedInited: true,
    installed: Installed.redis.map((item) => {
      return {
        ...item,
        typeFlag: 'redis'
      }
    }),
    list: Redis
  },
  mongodb: {
    getListing: false,
    installedInited: true,
    installed: Installed.mongodb.map((item) => {
      return {
        ...item,
        typeFlag: 'mongodb'
      }
    }),
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
