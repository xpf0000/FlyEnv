import { defineStore } from 'pinia'
import { reactive } from 'vue'
import IPC from '@/util/IPC'
import { I18nT } from '@shared/lang'
import EditorBaseConfig, { EditorConfig } from '@/store/module/EditorConfig'
import { MessageError } from '@/util/Element'
const { shell } = require('@electron/remote')
const { getGlobal } = require('@electron/remote')
const application = getGlobal('application')

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
  mark?: string
}

export interface AppServerCurrent {
  version?: string
  bin?: string
  path?: string
  fetching?: boolean
  running?: boolean
  flag?: string
  num?: number
  enable?: boolean
  run?: boolean
}

export enum AppSofts {
  nginx = 'nginx',
  php = 'php',
  mysql = 'mysql',
  mariadb = 'mariadb',
  apache = 'apache',
  memcached = 'memcached',
  redis = 'redis',
  mongodb = 'mongodb',
  postgresql = 'postgresql'
}

interface State {
  hosts: Array<AppHost>
  config: {
    server: {
      [key in AppSofts | 'pure-ftpd']: {
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
          mariadb: boolean
          Php: boolean
          Memcached: boolean
          Redis: boolean
          MongoDB: boolean
          NodeJS: boolean
          Tools: boolean
          DNS: boolean
          FTP: boolean
          HttpServe?: boolean
          PostgreSql?: boolean
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
      theme?: string
      postgresql: {
        dirs: Array<string>
      }
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
      forceStart: boolean
      showAIRobot: boolean
      editorConfig: EditorConfig
      phpGroupStart: { [k: string]: boolean }
    }
  }
  httpServe: Array<string>
  versionInited: boolean
  httpServeService: {
    [k: string]: {
      run: boolean
      port: number
      host: Array<string>
    }
  }
}

const state: State = {
  hosts: [],
  config: {
    server: {
      'pure-ftpd': {
        current: {}
      },
      postgresql: {
        current: {}
      },
      nginx: {
        current: {}
      },
      php: {
        current: {}
      },
      mysql: {
        current: {}
      },
      mariadb: {
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
      },
      mongodb: {
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
          mariadb: true,
          Php: true,
          Memcached: true,
          Redis: true,
          MongoDB: true,
          NodeJS: true,
          Tools: true,
          DNS: true,
          FTP: true
        }
      },
      nginx: {
        dirs: []
      },
      postgresql: {
        dirs: []
      },
      apache: {
        dirs: []
      },
      mysql: {
        dirs: []
      },
      mariadb: {
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
      mongodb: {
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
      lang: '',
      autoCheck: true,
      forceStart: false,
      showAIRobot: true,
      editorConfig: EditorBaseConfig,
      phpGroupStart: {}
    }
  },
  httpServe: [],
  versionInited: false,
  httpServeService: {}
}

export const AppStore = defineStore('app', {
  state: (): State => state,
  getters: {
    editorConfig(): EditorConfig {
      return this.config.setup.editorConfig
    },
    phpGroupStart(): { [k: string]: boolean } {
      return this.config.setup.phpGroupStart
    }
  },
  actions: {
    UPDATE_SERVER_CURRENT({ flag, data }: { flag: AllAppSofts; data: AppServerCurrent }) {
      const server = JSON.parse(JSON.stringify(this.config.server))
      if (!server[flag]) {
        server[flag] = {}
      }
      server[flag].current = reactive(data)
      this.config.server = reactive(server)
    },
    UPDATE_HOSTS(hosts: Array<AppHost>) {
      this.hosts.splice(0)
      hosts.forEach((host) => {
        this.hosts.push(reactive(host))
      })
      console.log('UPDATE_HOSTS: ', this.hosts)
    },
    INIT_CONFIG(obj: any) {
      this.config = reactive(obj)
      const editorConfig = this.config.setup.editorConfig
      EditorBaseConfig.init(editorConfig)
      this.config.setup.editorConfig = EditorBaseConfig
      if (!this.config.setup.phpGroupStart) {
        this.config.setup.phpGroupStart = reactive({})
      }
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
          if (res?.code === 0) {
            if (res?.data?.hostBackFile) {
              MessageError(I18nT('base.hostParseErr'))
              shell.showItemInFolder(res?.data?.hostBackFile)
            } else if (res?.data?.host) {
              this.UPDATE_HOSTS(res?.data?.host)
            }
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
