import Store from 'electron-store'

export default class ConfigManager {
  constructor() {
    this.config = {}
    this.init()
  }

  init() {
    this.initConfig()
  }

  initConfig() {
    this.config = new Store({
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
          }
        },
        httpServe: []
      }
    })

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
    if (!this.config.has('showTour')) {
      this.config.set('showTour', true)
      this.config.set('setup.common.showItem.Hosts', true)
      this.config.set('setup.common.showItem.Php', true)
    }
  }

  getConfig(key, defaultValue) {
    if (typeof key === 'undefined' && typeof defaultValue === 'undefined') {
      return this.config.store
    }
    return this.config.get(key, defaultValue)
  }

  setConfig(...args) {
    this.config.set(...args)
  }

  reset() {
    this.config.clear()
  }
}
