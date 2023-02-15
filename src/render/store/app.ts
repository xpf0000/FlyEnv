import { defineStore } from 'pinia'
import { reactive } from 'vue'
import IPC from '@/util/IPC'
const { getGlobal } = require('@electron/remote')
const application = getGlobal('application')
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

export enum AppSofts {
  nginx = 'nginx',
  php = 'php',
  mysql = 'mysql',
  apache = 'apache',
  memcached = 'memcached',
  redis = 'redis'
}

interface State {
  hosts: Array<AppHost>
  config: {
    server: {
      [key in AppSofts]: {
        current: AppServerCurrent
      }
    }
    password: string
    showTour: boolean
    setup: {
      common: {
        showItem: {
          Hosts: boolean
          Nginx: boolean
          Apache: boolean
          Mysql: boolean
          Php: boolean
          Memcached: boolean
          Redis: boolean
          NodeJS: boolean
          Tools: boolean
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
      apache: {
        dirs: Array<string>
      }
      memcached: {
        dirs: Array<string>
      }
      redis: {
        dirs: Array<string>
      }
    }
  }
  httpServe: Array<string>
}

const state: State = {
  hosts: [],
  config: {
    server: {
      nginx: {
        current: {}
      },
      php: {
        current: {}
      },
      mysql: {
        current: {}
      },
      apache: {
        current: {}
      },
      memcached: {
        current: {}
      },
      redis: {
        current: {}
      }
    },
    password: '',
    showTour: true,
    setup: {
      common: {
        showItem: {
          Hosts: true,
          Nginx: true,
          Apache: true,
          Mysql: true,
          Php: true,
          Memcached: true,
          Redis: true,
          NodeJS: true,
          Tools: true
        }
      },
      nginx: {
        dirs: []
      },
      apache: {
        dirs: []
      },
      mysql: {
        dirs: []
      },
      php: {
        dirs: []
      },
      memcached: {
        dirs: []
      },
      redis: {
        dirs: []
      },
      hosts: {
        write: true
      },
      proxy: {
        on: false,
        fastProxy: '',
        proxy: ''
      },
      lang: ''
    }
  },
  httpServe: []
}

export const AppStore = defineStore('app', {
  state: (): State => state,
  getters: {},
  actions: {
    UPDATE_SERVER_CURRENT({ flag, data }: { flag: keyof typeof AppSofts; data: AppServerCurrent }) {
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
    },
    initHost() {
      return new Promise((resolve) => {
        IPC.send('app-fork:host', 'hostList').then((key: string, res: any) => {
          IPC.off(key)
          if (res?.hosts) {
            this.UPDATE_HOSTS(res.hosts)
          }
          resolve(true)
        })
      })
    },
    initConfig() {
      return new Promise((resolve) => {
        const config = application.configManager.getConfig()
        if (!config.password) {
          config.password = ''
        }
        if (!config.server.memcached) {
          config.server.memcached = {
            current: {}
          }
        }
        if (!config.server.redis) {
          config.server.redis = {
            current: {}
          }
        }
        this.INIT_CONFIG({
          server: config.server,
          password: config.password,
          setup: config.setup,
          showTour: config?.showTour ?? true
        })
        this.INIT_HTTP_SERVE(config.httpServe ?? [])
        resolve(true)
      })
    },
    saveConfig() {
      const args = JSON.parse(
        JSON.stringify({
          server: this.config.server,
          password: this.config.password,
          setup: this.config.setup,
          httpServe: this.httpServe,
          showTour: this.config.showTour
        })
      )
      IPC.send('application:save-preference', args).then((key: string) => {
        IPC.off(key)
      })
    }
  }
})
