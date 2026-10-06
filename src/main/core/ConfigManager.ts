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
import {
  completeModuleOnboardingConfig,
  protectModuleOnboardingConfigPatch
} from './ModuleOnboardingConfig'

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
    // 可缺省的显式选择标记；旧默认 helper 不等于用户已经同意使用常驻程序。
    windowsElevationChoiceVersion?: number
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
    if (process.platform !== 'win32') this.config.set('password', '')

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
    if (process.platform !== 'win32' && key === 'password') return ''
    if (typeof key === 'undefined' && typeof defaultValue === 'undefined') {
      return this.config?.store
    }
    return this.config?.get(key, defaultValue)
  }

  setConfig(key: string | Partial<ConfigOptions>, ...args: any[]) {
    if (process.platform !== 'win32') {
      if (typeof key === 'string' && key === 'password') args = ['']
      else if (typeof key !== 'string' && 'password' in key) key = { ...key, password: '' }
    }
    if (typeof key === 'string') {
      // 字符串键与对象补丁遵循同一授权边界，只有专用原子提交入口能改权限偏好。
      if (key === 'setup') {
        this.setConfig({ setup: args[0] })
        return
      }
      if (
        ['setup.windowsElevationMethod', 'setup.windowsElevationChoiceVersion'].some(
          (field) => key === field || key.startsWith(field + '.')
        )
      )
        return
      this.config?.set(key as any, ...args)
    } else if (this.config) {
      const patch = protectModuleOnboardingConfigPatch(this.config.store, key)
      // 普通设置页可能持有旧快照；不能通过保存其他设置覆盖权限协调器刚提交的选择。
      if (patch.setup) {
        patch.setup.windowsElevationMethod = this.config.get('setup.windowsElevationMethod')
        patch.setup.windowsElevationChoiceVersion = this.config.get(
          'setup.windowsElevationChoiceVersion'
        )
      }
      this.config.set(patch)
    }
  }

  /** 专用提交入口一次保存方式与确认版本；写盘失败时等待的权限请求保持未授权。 */
  setWindowsElevationChoice(method: WindowsElevationMethod, version: number) {
    if (!this.config) throw new Error('Configuration is unavailable')
    this.config.set({
      setup: {
        ...this.config.get('setup'),
        windowsElevationMethod: method,
        windowsElevationChoiceVersion: version
      }
    })
  }

  completeModuleOnboarding(showItem?: ModuleOnboardingVisibility): void {
    const setup = this.getConfig('setup') as ConfigOptions['setup']
    completeModuleOnboardingConfig((patch) => this.config!.set(patch), setup, showItem)
  }

  reset() {
    this.config?.clear()
  }
}
