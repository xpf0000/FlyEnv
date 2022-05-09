import { EventEmitter } from 'events'
import { app, ipcMain } from 'electron'
import is from 'electron-is'
import logger from './core/Logger'
import ConfigManager from './core/ConfigManager'
import WindowManager from './ui/WindowManager'
import MenuManager from './ui/MenuManager'
import TouchBarManager from './ui/TouchBarManager'
import ThemeManager from './ui/ThemeManager'
import UpdateManager from './core/UpdateManager'
import { join } from 'path'
import { existsSync, copyFile } from 'fs'
import { fork } from 'child_process'
const { createFolder, chmod, readFileAsync, writeFileAsync } = require('../shared/file.js')
const { execAsync } = require('../shared/utils.js')
const compressing = require('compressing')
const execPromise = require('child-process-promise').exec

export default class Application extends EventEmitter {
  constructor() {
    super()
    this.isReady = false
    this.init()
  }

  init() {
    this.configManager = new ConfigManager()
    this.menuManager = new MenuManager()
    this.menuManager.setup()
    this.initTouchBarManager()
    this.initWindowManager()
    this.initThemeManager()
    this.initUpdaterManager()
    this.handleCommands()
    this.handleIpcMessages()
    this.initServerDir()
  }

  initServerDir() {
    console.log('userData: ', app.getPath('userData'))
    let runpath = app.getPath('userData').replace('Application Support/', '')
    global.Server = {}
    global.Server.BaseDir = join(runpath, 'server')
    createFolder(global.Server.BaseDir)
    global.Server.NginxDir = join(runpath, 'server/nginx')
    global.Server.PhpDir = join(runpath, 'server/php')
    global.Server.MysqlDir = join(runpath, 'server/mysql')
    global.Server.ApacheDir = join(runpath, 'server/apache')
    global.Server.MemcachedDir = join(runpath, 'server/memcached')
    global.Server.RedisDir = join(runpath, 'server/redis')
    createFolder(global.Server.NginxDir)
    createFolder(global.Server.PhpDir)
    createFolder(global.Server.MysqlDir)
    createFolder(global.Server.ApacheDir)
    createFolder(global.Server.MemcachedDir)
    createFolder(global.Server.RedisDir)
    global.Server.Cache = join(runpath, 'server/cache')
    createFolder(global.Server.Cache)
    chmod(global.Server.Cache, '0777')
    global.Server.Static = __static
    global.Server.BrewNginx = join(__static, 'brew/nginx')
    global.Server.BrewPhp = join(__static, 'brew/php')
    global.Server.BrewMysql = join(__static, 'brew/mysql')
    global.Server.BrewApache = join(__static, 'brew/apache')
    global.Server.BrewMemcached = join(__static, 'brew/memcached')
    global.Server.BrewRedis = join(__static, 'brew/redis')
    global.Server.Password = this.configManager.getConfig('password')
    console.log('global.Server.Password: ', global.Server.Password)
    execAsync('which', ['brew'])
      .then((res) => {
        console.log('which brew: ', res)
        execAsync('brew', ['--config']).then((p) => {
          console.log('brew --config: ', p)
        })
        execAsync('brew', ['--repo']).then((p) => {
          console.log('brew --repo: ', p)
          global.Server.BrewHome = p
          global.Server.BrewFormula = join(p, 'Library/Taps/homebrew/homebrew-core/Formula')
        })
        execAsync('brew', ['--cellar']).then((c) => {
          console.log('brew --cellar: ', c)
          global.Server.BrewCellar = c
        })
      })
      .catch((e) => {
        console.log('which e: ', e)
      })

    let httpdcong = join(global.Server.ApacheDir, 'common/conf/')
    createFolder(httpdcong)
    httpdcong = join(httpdcong, 'httpd.conf')
    if (!existsSync(httpdcong)) {
      readFileAsync(join(__static, 'tmpl/httpd.conf')).then((str) => {
        const logs = join(global.Server.ApacheDir, 'common/logs')
        const vhost = join(global.Server.BaseDir, 'vhost/apache')
        str = str.replace(/#LOGPATH#/g, logs).replace(/#VHOSTPATH#/g, vhost)
        writeFileAsync(httpdcong, str).then()
        writeFileAsync(join(global.Server.ApacheDir, 'common/conf/httpd.conf.default'), str).then()
      })
    }

    let mysqlcong = join(global.Server.MysqlDir, 'my.cnf')
    if (!existsSync(mysqlcong)) {
      const staticMycnf = join(__static, 'tmpl/my.cnf')
      copyFile(staticMycnf, mysqlcong, () => {})
      copyFile(staticMycnf, join(global.Server.MysqlDir, 'my.cnf.default'), () => {})
    }

    let ngconf = join(global.Server.NginxDir, 'common/conf/nginx.conf')
    if (!existsSync(ngconf)) {
      compressing.zip
        .uncompress(join(__static, 'zip/nginx-common.zip'), global.Server.NginxDir)
        .then(() => {
          readFileAsync(ngconf).then((content) => {
            content = content
              .replace(/#PREFIX#/g, global.Server.NginxDir)
              .replace('#VHostPath#', join(global.Server.BaseDir, 'vhost/nginx'))
            writeFileAsync(ngconf, content)
            writeFileAsync(join(global.Server.NginxDir, 'common/conf/nginx.conf.default'), content)
          })
        })
        .catch()
    }
    let phpconf = join(global.Server.PhpDir, 'common/conf/php.ini')
    if (!existsSync(phpconf)) {
      compressing.zip
        .uncompress(join(__static, 'zip/php-common.zip'), global.Server.PhpDir)
        .then(() => {})
        .catch(() => {})
    }
    let redisconf = join(global.Server.RedisDir, 'common/redis.conf')
    const handleRedisConf = () => {
      const dbDir = join(global.Server.RedisDir, 'common/db')
      if (!existsSync(dbDir)) {
        createFolder(dbDir)
      }
      readFileAsync(redisconf).then((content) => {
        if (content.includes('#PID_PATH#')) {
          content = content
            .replace(/#PID_PATH#/g, join(global.Server.RedisDir, 'common/run/redis.pid'))
            .replace(/#LOG_PATH#/g, join(global.Server.RedisDir, 'common/logs/redis.log'))
            .replace(/#DB_PATH#/g, join(global.Server.RedisDir, 'common/db'))
          writeFileAsync(redisconf, content)
          writeFileAsync(join(global.Server.RedisDir, 'common/redis.conf.default'), content)
        }
      })
    }
    if (!existsSync(redisconf)) {
      compressing.zip
        .uncompress(join(__static, 'zip/redis-common.zip'), global.Server.RedisDir)
        .then(() => {
          handleRedisConf()
        })
        .catch(() => {})
    } else {
      handleRedisConf()
    }
  }

  initWindowManager() {
    this.windowManager = new WindowManager({
      configManager: this.configManager
    })

    this.windowManager.on('window-resized', (data) => {
      this.storeWindowState(data)
    })
    this.windowManager.on('window-moved', (data) => {
      this.storeWindowState(data)
    })
    this.windowManager.on('window-closed', (data) => {
      this.storeWindowState(data)
      if (is.windows()) {
        this.emit('application:exit')
      }
    })
  }

  storeWindowState(data = {}) {
    const state = this.configManager.getConfig('window-state', {})
    const { page, bounds } = data
    const newState = {
      ...state,
      [page]: bounds
    }
    this.configManager.setConfig('window-state', newState)
  }

  start(page, options = {}) {
    this.showPage(page, options)
    this.mainWindow.setIgnoreMouseEvents(false)
  }

  showPage(page, options = {}) {
    const { openedAtLogin } = options
    const win = this.windowManager.openWindow(page, {
      hidden: openedAtLogin
    })
    this.mainWindow = win
    win.once('ready-to-show', () => {
      this.isReady = true
      this.emit('ready')
    })
    if (is.macOS()) {
      this.touchBarManager.setup(page, win)
    }
  }

  show(page = 'index') {
    this.windowManager.showWindow(page)
  }

  hide(page) {
    if (page) {
      this.windowManager.hideWindow(page)
    } else {
      this.windowManager.hideAllWindow()
    }
  }

  toggle(page = 'index') {
    this.windowManager.toggleWindow(page)
  }

  closePage(page) {
    this.windowManager.destroyWindow(page)
  }

  stop() {
    logger.info('[WebMaker] application stop !!!')
    this.stopServer()
  }

  stopServer() {}

  sendCommand(command, ...args) {
    if (!this.emit(command, ...args)) {
      const window = this.windowManager.getFocusedWindow()
      if (window) {
        this.windowManager.sendCommandTo(window, command, ...args)
      }
    }
  }

  sendCommandToAll(command, ...args) {
    if (!this.emit(command, ...args)) {
      this.windowManager.getWindowList().forEach((window) => {
        this.windowManager.sendCommandTo(window, command, ...args)
      })
    }
  }

  sendMessageToAll(channel, ...args) {
    this.windowManager.getWindowList().forEach((window) => {
      this.windowManager.sendMessageTo(window, channel, ...args)
    })
  }

  initThemeManager() {
    this.themeManager = new ThemeManager()
    this.themeManager.on('system-theme-changed', (theme) => {
      this.sendCommandToAll('application:system-theme', 'application:system-theme', theme)
    })
  }

  initUpdaterManager() {
    if (is.mas()) {
      return
    }
    try {
      this.updateManager = new UpdateManager({})
      this.handleUpdaterEvents()
    } catch (err) {
      console.log('initUpdaterManager err: ', err)
    }
  }

  initTouchBarManager() {
    if (!is.macOS()) {
      return
    }
    this.touchBarManager = new TouchBarManager()
  }

  relaunch() {
    this.stop()
    app.relaunch()
    app.exit()
  }

  handleCommands() {
    this.on('application:save-preference', (config) => {
      console.log('application:save-preference.config====>', config)
      this.configManager.setConfig(config)
    })

    this.on('application:relaunch', () => {
      this.relaunch()
    })

    this.on('application:exit', () => {
      console.log('application:exit !!!!!!')
      this.stop()
      app.exit()
      process.exit(0)
    })

    this.on('application:show', (page) => {
      this.show(page)
    })

    this.on('application:hide', (page) => {
      this.hide(page)
    })

    this.on('application:reset', () => {
      this.configManager.reset()
      this.relaunch()
    })

    this.on('application:change-theme', (theme) => {
      this.themeManager.updateAppAppearance(theme)
      this.sendCommandToAll('application:theme', 'application:theme', theme)
    })

    this.on('application:change-menu-states', (visibleStates, enabledStates, checkedStates) => {
      this.menuManager.updateMenuStates(visibleStates, enabledStates, checkedStates)
    })

    this.on('application:window-size-change', (size) => {
      console.log('application:window-size-change: ', size)
      this.windowManager.getFocusedWindow().setSize(size.width, size.height, true)
    })

    this.on('application:window-open-new', (page) => {
      console.log('application:window-open-new: ', page)
    })

    this.on('application:check-for-updates', () => {
      this.updateManager.check()
    })
  }

  handleCommand(command, key, ...args) {
    console.log('handleIpcMessages: ', command, key, ...args)
    this.emit(command, ...args)
    let window
    switch (command) {
      case 'app-fork:brew':
      case 'app-fork:nginx':
      case 'app-fork:apache':
      case 'app-fork:php':
      case 'app-fork:mysql':
      case 'app-fork:memcached':
      case 'app-fork:redis':
      case 'app-fork:host':
        let forkFile = command.replace('app-fork:', '')
        let child = fork(join(__static, `fork/${forkFile}.js`))
        child.send({ Server: global.Server })
        child.send([command, key, ...args])
        child.on('message', ({ command, key, info }) => {
          if (command === 'application:global-server-updata') {
            console.log('child on message: ', info)
            global.Server = JSON.parse(JSON.stringify(info))
            this.sendCommandToAll(command, key, global.Server)
            return
          }
          this.sendCommandToAll(command, key, info)
          // 0 成功 1 失败 200 过程
          if (typeof info === 'object' && (info?.code === 0 || info?.code === 1)) {
            child.disconnect()
            child.kill()
          }
        })
        break
      case 'app:password-check':
        let pass = args[0]
        console.log('pass: ', pass)
        execPromise(`echo '${pass}' | sudo -S chmod 777 /private/etc/hosts`)
          .then((res) => {
            console.log(res)
            this.configManager.setConfig('password', pass)
            global.Server.Password = pass
            this.sendCommandToAll(command, key, pass)
          })
          .catch((err) => {
            console.log('err: ', err)
            this.sendCommandToAll(command, key, false)
          })
        return
      case 'app:brew-install':
        this.windowManager.getFocusedWindow().minimize()
        break
      case 'Application:APP-Minimize':
        this.windowManager.getFocusedWindow().minimize()
        break
      case 'Application:APP-Maximize':
        window = this.windowManager.getFocusedWindow()
        if (window.isMaximized()) {
          window.unmaximize()
        } else {
          window.maximize()
        }
        break
      case 'Application:APP-Close':
        this.windowManager.getFocusedWindow().close()
        break
      case 'application:open-dev-window':
        this.mainWindow.webContents.openDevTools()
        break
      case 'application:about':
        this.sendCommandToAll(command, key)
        break
    }
  }

  handleIpcMessages() {
    ipcMain.on('command', (event, command, key, ...args) => {
      this.handleCommand(command, key, ...args)
    })
    ipcMain.on('event', (event, eventName, ...args) => {
      console.log('receive event', eventName, ...args)
      this.emit(eventName, ...args)
    })
  }

  handleUpdaterEvents() {
    this.updateManager.on('checking', () => {
      this.menuManager.updateMenuItemEnabledState('app.check-for-updates', false)
    })

    this.updateManager.on('download-progress', (event) => {
      const win = this.windowManager.getWindow('index')
      win.setProgressBar(event.percent / 100)
    })

    this.updateManager.on('update-not-available', () => {
      this.menuManager.updateMenuItemEnabledState('app.check-for-updates', true)
    })

    this.updateManager.on('update-downloaded', () => {
      this.menuManager.updateMenuItemEnabledState('app.check-for-updates', true)
      const win = this.windowManager.getWindow('index')
      win.setProgressBar(0)
    })

    this.updateManager.on('will-updated', () => {
      this.windowManager.setWillQuit(true)
    })

    this.updateManager.on('update-error', () => {
      this.menuManager.updateMenuItemEnabledState('app.check-for-updates', true)
    })
  }
}
