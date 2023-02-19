import Store from 'electron-store'
import { AppI18n } from '../lang'
import type ElectronStore from 'electron-store'

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
    apache: {
      current: { [key: string]: any }
    }
    memcached: {
      current: { [key: string]: any }
    }
    redis: {
      current: { [key: string]: any }
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
        HttpServe: boolean
        Tools: boolean
      }
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
    php: {
      dirs: Array<string>
    }
    memcached: {
      dirs: Array<string>
    }
    redis: {
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
  }
  httpServe: Array<string>
}

export default class ConfigManager {
  config?: ElectronStore<ConfigOptions>

  constructor() {
    this.initConfig()
  }

  initConfig() {
    const options: ElectronStore.Options<ConfigOptions> = {
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
              HttpServe: true,
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
          }
        },
        httpServe: []
      }
    }
    this.config = new Store<ConfigOptions>(options)

    if (!this.config.has('setup') || !this.config.has('setup.redis')) {
      const password = this.config.get('password', '')
      this.config.clear()
      this.config.set('password', password)
    }
    if (!this.config.has('setup.common.showItem.HttpServe')) {
      this.config.set('setup.common.showItem.HttpServe', true)
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
    if (!this.config.has('showTour')) {
      this.config.set('showTour', true)
      this.config.set('setup.common.showItem.Hosts', true)
      this.config.set('setup.common.showItem.Php', true)
    }
    if (!this.config.has('appFix')) {
      this.config.set('appFix', {})
    }
    if (!this.config.has('appFix.nginxEnablePhp')) {
      this.config.set('appFix.nginxEnablePhp', false)
    }
  }

  getConfig(key?: any, defaultValue?: any) {
    if (typeof key === 'undefined' && typeof defaultValue === 'undefined') {
      return this.config?.store
    }
    return this.config?.get(key, defaultValue)
  }

  setConfig(key: string, ...args: any) {
    // @ts-ignore
    this.config?.set(key, ...args)
    const lang: string = this.config?.get('setup.lang') ?? ''
    AppI18n(lang)
  }

  reset() {
    this.config?.clear()
  }
}
