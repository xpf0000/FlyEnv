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
        NodeJS: boolean
        MongoDB: boolean
        HttpServe: boolean
        Tools: boolean
        DNS: boolean
        FTP: boolean
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
  }
  tools: { [k: string]: any }
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
          autoCheck: true
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
    if (!this.config.has('setup.common.showItem.HttpServe')) {
      this.config.set('setup.common.showItem.HttpServe', true)
    }
    if (!this.config.has('setup.common.showItem.MongoDB')) {
      this.config.set('setup.common.showItem.MongoDB', true)
    }
    if (!this.config.has('setup.common.showItem.mariadb')) {
      this.config.set('setup.common.showItem.mariadb', true)
    }
    if (!this.config.has('setup.common.showItem.DNS')) {
      this.config.set('setup.common.showItem.DNS', true)
    }
    if (!this.config.has('setup.common.showItem.FTP')) {
      this.config.set('setup.common.showItem.FTP', true)
    }
    if (!this.config.has('server.mongodb')) {
      this.config.set('server.mongodb', {
        current: {}
      })
    }
    if (!this.config.has('setup.mongodb')) {
      this.config.set('setup.mongodb', {
        dirs: []
      })
    }
    if (!this.config.has('server.mariadb')) {
      this.config.set('server.mariadb', {
        current: {}
      })
    }
    if (!this.config.has('server.pure-ftpd')) {
      this.config.set('server.pure-ftpd', {
        current: {}
      })
    }
    if (!this.config.has('setup.mariadb')) {
      this.config.set('setup.mariadb', {
        dirs: []
      })
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
    if (!this.config.has('setup.autoCheck')) {
      this.config.set('setup.autoCheck', true)
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
