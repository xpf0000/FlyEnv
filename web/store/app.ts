import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { Hosts } from '../config/host'
import { User } from '../config/user'

export type AllAppSofts = keyof typeof AppSofts | 'pure-ftpd'
export interface AppHost {
  id: number
  name: string
  alias: string
  useSSL: boolean
  ssl: {
    cert: string
    key: string
  }
  port: {
    nginx: number
    apache: number
    nginx_ssl: number
    apache_ssl: number
  }
  nginx: {
    rewrite: string
  }
  url: string
  root: string
  phpVersion?: number
}

export interface AppServerCurrent {
  version?: string
  bin?: string
  path?: string
}

interface EditorConfig {
  theme: 'vs-dark' | 'vs-light' | 'hc-dark' | 'hc-light'
  fontSize: number
  lineHeight: number
}

export enum AppSofts {
  nginx = 'nginx',
  php = 'php',
  mysql = 'mysql',
  mariadb = 'mariadb',
  apache = 'apache',
  memcached = 'memcached',
  redis = 'redis',
  mongodb = 'mongodb'
}

interface State {
  hosts: Array<AppHost>
  config: {
    server: {
      [key in AppSofts | 'pure-ftpd']: {
        current: AppServerCurrent
      }
    }
    setup: {
      common: {
        showItem: {
          Hosts: boolean
          Nginx: boolean
          Apache: boolean
          Mysql: boolean
          mariadb: boolean
          Php: boolean
          Memcached: boolean
          Redis: boolean
          MongoDB: boolean
          NodeJS: boolean
          Tools: boolean
          DNS: boolean
          FTP: boolean
        }
      }
      hosts: {
        write: boolean
      }
      proxy: {
        on: boolean
        fastProxy: string
        proxy: string
      }
      lang: string
      nginx: {
        dirs: Array<string>
      }
      php: {
        dirs: Array<string>
      }
      mysql: {
        dirs: Array<string>
      }
      mariadb: {
        dirs: Array<string>
      }
      apache: {
        dirs: Array<string>
      }
      memcached: {
        dirs: Array<string>
      }
      redis: {
        dirs: Array<string>
      }
      mongodb: {
        dirs: Array<string>
      }
      autoCheck: boolean
      editorConfig: EditorConfig
    }
  }
  httpServe: Array<string>
  versionInited: boolean
}

const state: State = {
  hosts: Hosts,
  config: {
    server: User.server,
    setup: User.setup as any
  },
  httpServe: User.httpServe,
  versionInited: true
}

export const AppStore = defineStore('app', {
  state: (): State => state,
  getters: {
    editorConfig(): EditorConfig {
      return this.config.setup.editorConfig
    }
  },
  actions: {
    UPDATE_SERVER_CURRENT({ flag, data }: { flag: AllAppSofts; data: AppServerCurrent }) {
      const server = JSON.parse(JSON.stringify(this.config.server))
      server[flag].current = reactive(data)
      this.config.server = reactive(server)
    },
    UPDATE_HOSTS(hosts: Array<AppHost>) {
      this.hosts.splice(0)
      hosts.forEach((host) => {
        this.hosts.push(reactive(host))
      })
    },
    INIT_CONFIG(obj: any) {
      this.config = reactive(obj)
    },
    INIT_HTTP_SERVE(obj: any) {
      this.httpServe = reactive(obj)
    },
    SET_CUSTOM_DIR({
      typeFlag,
      dir,
      index
    }: {
      typeFlag: keyof typeof AppSofts
      dir: string
      index: number
    }) {
      const common = this.config.setup[typeFlag]
      const dirs = JSON.parse(JSON.stringify(common.dirs))
      if (index !== undefined) {
        dirs[index] = dir
      } else {
        dirs.push(dir)
      }
      common.dirs = reactive(dirs)
    },
    DEL_CUSTOM_DIR({ typeFlag, index }: { typeFlag: keyof typeof AppSofts; index: number }) {
      const common = this.config.setup[typeFlag]
      const dirs = JSON.parse(JSON.stringify(common.dirs))
      dirs.splice(index, 1)
      common.dirs = reactive(dirs)
    }
  }
})
