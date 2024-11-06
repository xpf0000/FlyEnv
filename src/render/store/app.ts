import { defineStore } from 'pinia'
import { reactive } from 'vue'
import IPC from '@/util/IPC'
import { I18nT } from '@shared/lang'
import EditorBaseConfig, { EditorConfig } from '@/store/module/EditorConfig'
import { MessageError } from '@/util/Element'
import { AllAppModule } from '@/core/type'

const { shell } = require('@electron/remote')
const { getGlobal } = require('@electron/remote')
const application = getGlobal('application')

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
  ssl: {
    cert: string
    key: string
  }
  port: {
    nginx: number
    apache: number
    nginx_ssl: number
    apache_ssl: number
    caddy: number
    caddy_ssl: number
    tomcat: number
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
  fetching?: boolean
  running?: boolean
  flag?: string
  num?: number
  enable?: boolean
  run?: boolean
  isLocal7Z?: boolean
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
  currentNodeTool: 'fnm' | 'nvm' | ''
  editorConfig: EditorConfig
  phpGroupStart: { [k: string]: boolean }
  serviceShowHide: Record<string, boolean>
  excludeLocalVersion: string[]
}

interface State {
  hosts: Array<AppHost>
  config: {
    server: ServerBase
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
  hosts: [],
  config: {
    server: {},
    setup: {
      serviceShowHide: {},
      excludeLocalVersion: [],
      common: {
        showItem: {}
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
      phpGroupStart: {},
      currentNodeTool: ''
    }
  },
  httpServe: [],
  versionInited: false,
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
          }
          resolve(true)
        })
      })
    },
    initConfig() {
      return new Promise((resolve) => {
        const config = application.configManager.getConfig()
        const showItem = config.setup.common.showItem
        console.log('initConfig showItem: ', JSON.parse(JSON.stringify(showItem)))
        const fixed: { [key: string]: boolean } = {}
        const dict: any = {
          ftp: 'pure-ftpd'
        }
        for (const k in showItem) {
          if (showItem[k] === false) {
            let nk = k.toLowerCase()
            if (nk !== k) {
              if (dict[nk]) {
                nk = dict[nk]
              }
            }
            fixed[nk] = false
          }
        }
        config.setup.common.showItem = fixed
        this.INIT_CONFIG({
          server: config.server,
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
    serviceShow(bin: string) {
      const setup = JSON.parse(JSON.stringify(this.config.setup))
      const arr = setup.excludeLocalVersion
      if (!arr) {
        return
      }
      const index = arr.indexOf(bin)
      if (index >= 0) {
        arr.splice(index, 1)
      }
      this.config.setup = reactive(setup)
      this.saveConfig().then()
    },
    serviceHide(bin: string) {
      const setup = JSON.parse(JSON.stringify(this.config.setup))
      if (!setup?.excludeLocalVersion) {
        setup.excludeLocalVersion = reactive([])
      }
      setup.excludeLocalVersion.push(bin)
      this.config.setup = reactive(setup)
      this.saveConfig().then()
    },
    serviceShowHide(flag: AllAppModule, v: boolean) {
      const setup = JSON.parse(JSON.stringify(this.config.setup))
      if (!setup?.serviceShowHide) {
        setup.serviceShowHide = {}
      }
      setup.serviceShowHide[flag] = v
      this.config.setup = reactive(setup)
      this.saveConfig().then()
    }
  }
})
