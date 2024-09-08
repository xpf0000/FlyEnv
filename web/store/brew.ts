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
import type { OnlineVersionItem } from '@/store/brew'
import { Tomcat } from '@web/config/tomcat'
import { Java } from '@web/config/java'

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
    homebrew: { [key: string]: any }
    macports: { [key: string]: any }
    static?: { [key: string]: OnlineVersionItem }
  }
}

interface State {
  tomcat: AppSoftInstalledItem
  java: AppSoftInstalledItem
  postgresql: AppSoftInstalledItem
  nginx: AppSoftInstalledItem
  caddy: AppSoftInstalledItem
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
  LibUse: { [k: string]: 'brew' | 'port' | 'static' }
}

const state: State = {
  cardHeadTitle: '',
  brewRunning: false,
  showInstallLog: false,
  brewSrc: '',
  log: [],
  LibUse: {},
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
  actions: {}
})
