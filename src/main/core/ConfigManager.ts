import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import Store from 'electron-store'
import { type Options } from 'electron-store'
import {
  initialModuleOnboardingVersion,
  type ModuleOnboardingVisibility
} from '@shared/ModuleOnboarding'
import {
  DEFAULT_WINDOWS_ELEVATION_METHOD,
  type WindowsElevationMethod
} from '@shared/WindowsHelperState'
import { completeModuleOnboardingConfig } from './ModuleOnboardingConfig'

interface ConfigOptions {
  'last-check-update-time': number
  'update-channel': string
  'window-state': { [key: string]: any }
  server: {
    nginx: {
      current: { [key: string]: any }
    }
    php: {
      current: { [key: string]: any }
    }
    mysql: {
      current: { [key: string]: any }
    }
    mariadb: {
      current: { [key: string]: any }
    }
    apache: {
      current: { [key: string]: any }
    }
    memcached: {
      current: { [key: string]: any }
    }
    redis: {
      current: { [key: string]: any }
    }
    mongodb: {
      current: { [key: string]: any }
    }
  }
  password: string
  showTour: boolean
  moduleOnboardingVersion: number
  setup: {
    common: {
      showItem: ModuleOnboardingVisibility
    }
    nginx: {
      dirs: Array<string>
    }
    apache: {
      dirs: Array<string>
    }
    mysql: {
      dirs: Array<string>
    }
    mariadb: {
      dirs: Array<string>
    }
    php: {
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
    hosts: {
      write: boolean
    }
    proxy: {
      on: boolean
      fastProxy: string
      proxy: string
    }
    autoCheck: boolean
    windowsElevationMethod: WindowsElevationMethod
    editorConfig: {
      theme: 'vs-dark' | 'vs-light' | 'hc-dark' | 'hc-light'
      fontSize: number
      lineHeight: number
    }
  }
  tools: { [k: string]: any }
  httpServe: Array<string>
}

export default class ConfigManager {
  config?: Store<ConfigOptions>

  constructor() {
    this.initConfig()
  }

  initConfig() {
    const userConfigPath = join(app.getPath('userData'), 'user.json')
    const persistedUserConfigExists = existsSync(userConfigPath)
    const options: Options<ConfigOptions> = {
      name: 'user',
      defaults: {
        'last-check-update-time': 0,
        'update-channel': 'latest',
        'window-state': {},
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
        moduleOnboardingVersion: initialModuleOnboardingVersion(persistedUserConfigExists),
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
              HttpServe: true,
              Tools: true,
              DNS: true,
              FTP: true
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
          autoCheck: true,
          windowsElevationMethod: DEFAULT_WINDOWS_ELEVATION_METHOD,
          editorConfig: {
            theme: 'vs-dark',
            fontSize: 16,
            lineHeight: 2.0
          }
        },
        tools: {},
        httpServe: []
      }
    }
    this.config = new Store<ConfigOptions>(options)

    if (!this.config.has('setup') || !this.config.has('setup.redis')) {
      const password = this.config.get('password', '')
      this.config.clear()
      this.config.set('password', password)
    }
    if (!this.config.has('setup.hosts')) {
      this.config.set('setup.hosts', {
        write: true
      })
    }
    if (!this.config.has('setup.proxy')) {
      this.config.set('setup.proxy', {
        on: false,
        fastProxy: '',
        proxy: ''
      })
    }
    if (!this.config.has('appFix')) {
      this.config.set('appFix', {})
    }
    if (!this.config.has('appFix.nginxEnablePhp')) {
      this.config.set('appFix.nginxEnablePhp', false)
    }
    if (!this.config.has('setup.autoCheck')) {
      this.config.set('setup.autoCheck', true)
    }
    if (!this.config.has('setup.windowsElevationMethod')) {
      this.config.set('setup.windowsElevationMethod', DEFAULT_WINDOWS_ELEVATION_METHOD)
    }
    if (!this.config.has('tools')) {
      this.config.set('tools', {})
    }
  }

  getConfig(key?: any, defaultValue?: any) {
    if (typeof key === 'undefined' && typeof defaultValue === 'undefined') {
      return this.config?.store
    }
    return this.config?.get(key, defaultValue)
  }

  setConfig(key: string | Partial<ConfigOptions>, ...args: any[]) {
    if (typeof key === 'string') {
      this.config?.set(key as any, ...args)
    } else {
      this.config?.set(key)
    }
  }

  completeModuleOnboarding(showItem?: ModuleOnboardingVisibility): void {
    const setup = this.getConfig('setup') as ConfigOptions['setup']
    completeModuleOnboardingConfig((patch) => this.config!.set(patch), setup, showItem)
  }

  reset() {
    this.config?.clear()
  }
}
