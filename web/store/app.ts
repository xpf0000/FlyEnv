import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { Hosts } from '../config/host'
import { User } from '../config/user'
import type { AllAppModule } from '@web/core/type'

export interface AppHost {
  id: number
  isTop?: boolean
  isSorting?: boolean
  projectName?: string
  type?: string
  name: string
  alias: string
  useSSL: boolean
  autoSSL: boolean
  projectPort?: number
  subType?: string
  ssl: {
    cert: string
    key: string
  }
  port: {
    nginx: number
    apache: number
    tomcat: number
    nginx_ssl: number
    apache_ssl: number
    caddy: number
    caddy_ssl: number
    tomcat_ssl: number
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
}

interface EditorConfig {
  theme: 'vs-dark' | 'vs-light' | 'hc-dark' | 'hc-light' | 'auto'
  fontSize: number
  lineHeight: number
}

type AppShowItem = Partial<Record<AllAppModule, boolean>>

type ServerBase = Partial<
  Record<
    AllAppModule,
    {
      current: AppServerCurrent
    }
  >
>

type SetupBase = Partial<
  Record<
    AllAppModule,
    {
      dirs?: Array<string>
      write?: boolean
    }
  >
>

type StateBase = SetupBase & {
  common: {
    showItem: AppShowItem
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
  autoCheck: boolean
  forceStart: boolean
  showAIRobot: boolean
  showTool?: boolean
  phpBrewInited: boolean
  mongodbBrewInited: boolean
  currentNodeTool: 'fnm' | 'nvm' | ''
  editorConfig: EditorConfig
  phpGroupStart: { [k: string]: boolean }
}

interface State {
  hosts: Array<AppHost>
  config: {
    server: ServerBase
    password: string
    setup: StateBase
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
  currentPage: string
}

const state: State = {
  hosts: Hosts as any,
  config: {
    password: '',
    server: User.server,
    setup: User.setup as any
  },
  httpServe: User.httpServe,
  versionInited: true,
  httpServeService: {},
  currentPage: '/hosts'
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
    UPDATE_SERVER_CURRENT({ flag, data }: { flag: AllAppModule; data: AppServerCurrent }) {
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
    SET_CUSTOM_DIR({ typeFlag, dir, index }: { typeFlag: string; dir: string; index?: number }) {
      const setup: any = this.config.setup
      if (!setup?.[typeFlag]) {
        setup[typeFlag] = reactive({
          dirs: []
        })
      }
      const common = setup[typeFlag]!
      const dirs = JSON.parse(JSON.stringify(common.dirs))
      if (index !== undefined) {
        dirs[index] = dir
      } else {
        dirs.push(dir)
      }
      common.dirs = reactive(dirs)
    },
    DEL_CUSTOM_DIR({ typeFlag, index }: { typeFlag: string; index: number }) {
      const setup: any = this.config.setup
      const common = setup[typeFlag]
      if (!common) {
        return
      }
      const dirs = JSON.parse(JSON.stringify(common.dirs))
      dirs.splice(index, 1)
      common.dirs = reactive(dirs)
    }
  }
})
