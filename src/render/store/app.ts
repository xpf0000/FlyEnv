import { defineStore } from 'pinia'
import { reactive } from 'vue'
import IPC from '@/util/IPC'
import { I18nT } from '@lang/index'
import EditorBaseConfig, { EditorConfig } from '@/store/module/EditorConfig'
import { MessageError } from '@/util/Element'
import type { AllAppModule } from '@/core/type'
import { HostStore } from '@/components/Host/store'
import type { AppServiceAliasItem } from '@shared/app'
import { shell, app } from '@/util/NodeFn'

export interface AppHost {
  id: number
  isAppPHPMyAdmin?: boolean
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
  phpVersionFull?: string
  mark?: string
  bookmark?: string
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

type AppShowItem = Partial<Record<AllAppModule | string, boolean>>

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
  alias?: Record<string, AppServiceAliasItem[]>
  common: {
    showItem: AppShowItem
  }
  hosts: {
    write: boolean
    ipv6?: boolean
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
  consulBrewInitiated?: boolean
  typesenseBrewInitiated?: boolean
  phpBrewInitiated: boolean
  mongodbBrewInitiated: boolean
  currentNodeTool: 'fnm' | 'nvm' | 'default'
  editorConfig: EditorConfig
  phpGroupStart: { [k: string]: boolean }
  autoStartService?: boolean
  autoHide?: boolean
  autoLaunch?: boolean
  license?: string
  trayMenuBarStyle?: 'classic' | 'modern'
}

interface State {
  asideExpanded: boolean
  envIndex: number
  hosts: Array<AppHost>
  config: {
    server: ServerBase
    password: string
    setup: StateBase
  }
  httpServe: Array<string>
  versionInitiated: boolean
  httpServeService: {
    [k: string]: {
      run: boolean
      port: number
      host: Array<string>
    }
  }
  currentPage: string
  floatBtnShow: boolean
}

const state: State = {
  asideExpanded: true,
  envIndex: 1,
  hosts: [],
  config: {
    server: {},
    password: '',
    setup: {
      common: {
        showItem: {} as any
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
      phpBrewInitiated: false,
      mongodbBrewInitiated: false,
      editorConfig: EditorBaseConfig,
      phpGroupStart: {},
      currentNodeTool: 'default'
    }
  },
  httpServe: [],
  versionInitiated: false,
  httpServeService: {},
  currentPage: '/hosts',
  floatBtnShow: true
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
    serverCurrent(flag: AllAppModule): {
      current: AppServerCurrent
    } {
      if (!this.config.server?.[flag]) {
        this.config.server[flag] = reactive({
          current: {}
        })
      }
      return this.config.server[flag]
    },
    UPDATE_SERVER_CURRENT({ flag, data }: { flag: AllAppModule; data: AppServerCurrent }) {
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
        if (!host?.type) {
          host.type = 'php'
        }
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
            HostStore.updateCurrentList()
          }
          resolve(true)
        })
      })
    },
    initConfig() {
      return new Promise(async (resolve) => {
        const config = await app.getConfig()
        console.log('initConfig config: ', config)
        if (!config.password) {
          config.password = ''
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
      return new Promise((resolve) => {
        const args = JSON.parse(
          JSON.stringify({
            server: this.config.server,
            password: this.config.password,
            setup: this.config.setup,
            httpServe: this.httpServe
          })
        )
        IPC.send('application:save-preference', args).then((key: string) => {
          IPC.off(key)
          resolve(true)
        })
      })
    },
    chechAutoHide() {
      const auto = this.config.setup?.autoHide
      if (auto === true) {
        IPC.send('APP:Auto-Hide').then((key: string) => {
          IPC.off(key)
        })
      }
    }
  }
})
