import { EventEmitter } from 'events'
import { app, ipcMain } from 'electron'
import is from 'electron-is'
import { readFileSync, existsSync, unlinkSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { isEmpty } from 'lodash'
import { fork, execSync } from 'child_process'
import logger from './core/Logger'
import ConfigManager from './core/ConfigManager'
import { setupLocaleManager } from '@/ui/Locale'
import AutoLaunchManager from './core/AutoLaunchManager'
import UpdateManager from './core/UpdateManager'
import WindowManager from './ui/WindowManager'
import MenuManager from './ui/MenuManager'
import TouchBarManager from './ui/TouchBarManager'
import DockManager from './ui/DockManager'
import ThemeManager from './ui/ThemeManager'
import { AUTO_CHECK_UPDATE_INTERVAL } from '@shared/constants'
import { checkIsNeedRun, execAsync } from '@shared/utils'
import FileUtil from '@shared/FileUtil'
const compressing = require('compressing')
const execPromise = require('child-process-promise').exec

export default class Application extends EventEmitter {
  constructor () {
    super()
    this.isReady = false
    this.init()
  }

  init () {
    this.configManager = new ConfigManager()
    this.locale = this.configManager.getLocale()
    this.localeManager = setupLocaleManager(this.locale)
    this.i18n = this.localeManager.getI18n()

    this.menuManager = new MenuManager()
    this.menuManager.setup(this.locale)

    this.initTouchBarManager()
    this.initWindowManager()

    this.dockManager = new DockManager({
      runMode: this.configManager.getUserConfig('run-mode')
    })

    this.autoLaunchManager = new AutoLaunchManager()

    this.initThemeManager()

    this.initUpdaterManager()

    this.handleCommands()

    this.handleIpcMessages()

    let p = dirname(process.execPath)
    console.log('run path: ', p)

    this.initServerDir()
  }

  initServerDir () {
    console.log('userData: ', app.getPath('userData'))
    let runpath = app.getPath('userData').replace('Application Support/', '')
    global.Server = {}
    global.Server.BaseDir = join(runpath, 'server')
    FileUtil.createFolder(global.Server.BaseDir)
    global.Server.NginxDir = join(runpath, 'server/nginx')
    global.Server.PhpDir = join(runpath, 'server/php')
    global.Server.MysqlDir = join(runpath, 'server/mysql')
    global.Server.ApacheDir = join(runpath, 'server/apache')
    global.Server.MemcachedDir = join(runpath, 'server/memcached')
    global.Server.RedisDir = join(runpath, 'server/redis')
    FileUtil.createFolder(global.Server.NginxDir)
    FileUtil.createFolder(global.Server.PhpDir)
    FileUtil.createFolder(global.Server.MysqlDir)
    FileUtil.createFolder(global.Server.ApacheDir)
    FileUtil.createFolder(global.Server.MemcachedDir)
    FileUtil.createFolder(global.Server.RedisDir)
    global.Server.Cache = join(runpath, 'server/cache')
    FileUtil.createFolder(global.Server.Cache)
    FileUtil.chmod(global.Server.Cache, '0777')
    global.Server.Static = __static
    global.Server.BrewNginx = join(__static, 'brew/nginx')
    global.Server.BrewPhp = join(__static, 'brew/php')
    global.Server.BrewMysql = join(__static, 'brew/mysql')
    global.Server.BrewApache = join(__static, 'brew/apache')
    global.Server.BrewMemcached = join(__static, 'brew/memcached')
    global.Server.BrewRedis = join(__static, 'brew/redis')
    global.Server.Password = this.configManager.getUserConfig('password')
    console.log('global.Server.Password: ', global.Server.Password)
    execAsync('which', ['brew']).then(res => {
      console.log('which res: ', res)
      execAsync('brew', ['--repo']).then(p => {
        global.Server.BrewHome = p
        global.Server.BrewFormula = join(p, 'Library/Taps/homebrew/homebrew-core/Formula')
      })
      execAsync('brew', ['--cellar']).then(c => {
        global.Server.BrewCellar = c
      })
    }).catch(e => {
      console.log('which e: ', e)
    })

    let ngconf = join(global.Server.NginxDir, 'common/conf/nginx.conf')
    if (!existsSync(ngconf)) {
      compressing.zip.uncompress(join(__static, 'zip/nginx-common.zip'), global.Server.NginxDir).then(res => {
        FileUtil.readFileAsync(ngconf).then(content => {
          content = content.replace(/#PREFIX#/g, global.Server.NginxDir)
            .replace('#VHostPath#', join(global.Server.BaseDir, 'vhost/nginx'))
          FileUtil.writeFileAsync(ngconf, content)
          FileUtil.writeFileAsync(join(global.Server.NginxDir, 'common/conf/nginx.conf.default'), content)
        })
      }).catch()
    }
    let phpconf = join(global.Server.PhpDir, 'common/conf/php.ini')
    if (!existsSync(phpconf)) {
      compressing.zip.uncompress(join(__static, 'zip/php-common.zip'), global.Server.PhpDir).then(res => {
      }).catch(_ => {
      })
    }
    let redisconf = join(global.Server.RedisDir, 'common/redis.conf')
    if (!existsSync(redisconf)) {
      compressing.zip.uncompress(join(__static, 'zip/redis-common.zip'), global.Server.RedisDir).then(res => {
      }).catch(_ => {
      })
    }
  }
  initWindowManager () {
    this.windowManager = new WindowManager({
      userConfig: this.configManager.getUserConfig()
    })

    this.windowManager.on('window-resized', (data) => {
      this.storeWindowState(data)
    })
    this.windowManager.on('window-moved', (data) => {
      this.storeWindowState(data)
    })
    this.windowManager.on('window-closed', (data) => {
      this.storeWindowState(data)
    })
  }

  storeWindowState (data = {}) {
    const enabled = this.configManager.getUserConfig('keep-window-state')
    if (!enabled) {
      return
    }

    const state = this.configManager.getUserConfig('window-state', {})
    const { page, bounds } = data
    const newState = {
      ...state,
      [page]: bounds
    }
    this.configManager.setUserConfig('window-state', newState)
  }

  start (page, options = {}) {
    this.showPage(page, options)
  }

  showPage (page, options = {}) {
    const { openedAtLogin } = options
    const win = this.windowManager.openWindow(page, {
      hidden: openedAtLogin
    })
    win.once('ready-to-show', () => {
      this.isReady = true
      this.emit('ready')
    })
    if (is.macOS()) {
      this.touchBarManager.setup(page, win)
    }
  }

  show (page = 'index') {
    this.windowManager.showWindow(page)
  }

  hide (page) {
    if (page) {
      this.windowManager.hideWindow(page)
    } else {
      this.windowManager.hideAllWindow()
    }
  }

  toggle (page = 'index') {
    this.windowManager.toggleWindow(page)
  }

  closePage (page) {
    this.windowManager.destroyWindow(page)
  }

  stop () {
    logger.info('[BuildPhp] application stop !!!')
    this.stopServer()
  }

  stopServerByPid (pidfile) {
    if (existsSync(pidfile)) {
      let pid = readFileSync(pidfile, 'utf-8')
      console.log('stopServerByPid pid: ', pid)
      unlinkSync(pidfile)
      try {
        let res = execSync(`echo '${global.Server.Password}' | kill -9 ${pid}`)
        console.log('stopServerByPid res: ', res)
      } catch (e) {
        console.log('stopServerByPid err: ', e)
      }
    } else {
      console.log('stopServerByPid pid file not exist: ', pidfile)
    }
  }

  stopServer () {
    // 停止nginx服务
    let pidfile = join(global.Server.NginxDir, 'common/logs/nginx.pid')
    this.stopServerByPid(pidfile)
    pidfile = join(global.Server.PhpDir, 'common/var/run/php-fpm.pid')
    this.stopServerByPid(pidfile)
    pidfile = join(global.Server.MysqlDir, 'mysql.pid')
    this.stopServerByPid(pidfile)
    pidfile = join(global.Server.ApacheDir, 'common/logs/httpd.pid')
    this.stopServerByPid(pidfile)
    pidfile = join(global.Server.MemcachedDir, 'logs/memcached.pid')
    this.stopServerByPid(pidfile)
    pidfile = join(global.Server.RedisDir, 'common/run/redis.pid')
    this.stopServerByPid(pidfile)
    let hosts = readFileSync('/private/etc/hosts', 'utf-8')
    let x = hosts.match(/(#X-HOSTS-BEGIN#)([\s\S]*?)(#X-HOSTS-END#)/g)
    if (x) {
      hosts = hosts.replace(x[0], '')
      writeFileSync('/private/etc/hosts', hosts)
    }
  }

  sendCommand (command, ...args) {
    console.log('### 0000 sendCommand: ', command, args)
    if (!this.emit(command, ...args)) {
      console.log('### 1111 sendCommand: ', command, args)
      const window = this.windowManager.getFocusedWindow()
      if (window) {
        console.log('### 2222 sendCommand: ', command, args)
        this.windowManager.sendCommandTo(window, command, ...args)
      }
    }
  }

  sendCommandToAll (command, ...args) {
    if (!this.emit(command, ...args)) {
      this.windowManager.getWindowList().forEach(window => {
        this.windowManager.sendCommandTo(window, command, ...args)
      })
    }
  }

  sendMessageToAll (channel, ...args) {
    this.windowManager.getWindowList().forEach(window => {
      this.windowManager.sendMessageTo(window, channel, ...args)
    })
  }

  initThemeManager () {
    this.themeManager = new ThemeManager()
    this.themeManager.on('system-theme-changed', (theme) => {
      this.sendCommandToAll('application:system-theme', theme)
    })
  }

  initTouchBarManager () {
    if (!is.macOS()) {
      return
    }
    this.touchBarManager = new TouchBarManager()
  }

  initUpdaterManager () {
    if (is.mas()) {
      return
    }
    const enable = this.configManager.getUserConfig('auto-check-update')
    const lastTime = this.configManager.getUserConfig('last-check-update-time')
    try {
      this.updateManager = new UpdateManager({
        autoCheck: checkIsNeedRun(enable, lastTime, AUTO_CHECK_UPDATE_INTERVAL)
      })
      this.handleUpdaterEvents()
    } catch (err) {
      console.log('initUpdaterManager err: ', err)
    }
  }

  handleUpdaterEvents () {
    this.updateManager.on('checking', (event) => {
      this.menuManager.updateMenuItemEnabledState('app.check-for-updates', false)
      this.configManager.setUserConfig('last-check-update-time', Date.now())
    })

    this.updateManager.on('download-progress', (event) => {
      const win = this.windowManager.getWindow('index')
      win.setProgressBar(event.percent / 100)
    })

    this.updateManager.on('update-not-available', (event) => {
      this.menuManager.updateMenuItemEnabledState('app.check-for-updates', true)
    })

    this.updateManager.on('update-downloaded', (event) => {
      this.menuManager.updateMenuItemEnabledState('app.check-for-updates', true)
      const win = this.windowManager.getWindow('index')
      win.setProgressBar(0)
    })

    this.updateManager.on('will-updated', (event) => {
      this.windowManager.setWillQuit(true)
    })

    this.updateManager.on('update-error', (event) => {
      this.menuManager.updateMenuItemEnabledState('app.check-for-updates', true)
    })
  }

  relaunch (page = 'index') {
    this.stop()
    app.relaunch()
    app.exit()
  }

  handleCommands () {
    this.on('application:save-preference', (config) => {
      console.log('application:save-preference.config====>', config)
      const { system, user } = config
      if (!isEmpty(system)) {
        console.info('[BuildPhp] main save system config: ', system)
        this.configManager.setSystemConfig(system)
      }
      if (!isEmpty(user)) {
        console.info('[BuildPhp] main save user config: ', user)
        this.configManager.setUserConfig(user)
      }
    })
    this.on('application:relaunch', () => {
      this.relaunch()
    })

    this.on('application:exit', () => {
      this.stop()
      app.exit()
    })

    this.on('application:check-for-updates', () => {
      this.updateManager.check()
    })

    this.on('application:open-at-login', (openAtLogin) => {
      console.log('application:open-at-login===>', openAtLogin)
      if (is.linux()) {
        return
      }

      if (openAtLogin) {
        this.autoLaunchManager.enable()
      } else {
        this.autoLaunchManager.disable()
      }
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
      this.sendCommandToAll('application:theme', theme)
    })

    this.on('application:change-locale', (locale) => {
      logger.info('[BuildPhp] application:change-locale===>', locale)
      this.localeManager.changeLanguageByLocale(locale)
        .then(() => {
          this.menuManager.setup(locale)
        })
    })

    this.on('application:toggle-dock', (visible) => {
      if (visible) {
        this.dockManager.show()
      } else {
        this.dockManager.hide()
        // Hiding the dock icon will trigger the entire app to hide.
        this.show()
      }
    })

    this.on('application:change-menu-states', (visibleStates, enabledStates, checkedStates) => {
      this.menuManager.updateMenuStates(visibleStates, enabledStates, checkedStates)
    })
  }

  handleIpcMessages () {
    let self = this
    ipcMain.on('command', (event, command, ...args) => {
      console.log('command: ', command)
      console.log('args: ', args)
      logger.log('receive command', command, ...args)
      this.emit(command, ...args)
      console.log('command: ', command)
      if (command === 'password') {
        let pass = args[0]
        console.log('pass: ', pass)
        execPromise(`echo '${pass}' | sudo -S chmod 777 /private/etc/hosts`).then(res => {
          console.log(res)
          this.configManager.setUserConfig('password', pass)
          global.Server.Password = pass
          self.sendCommandToAll('application:check-password', pass)
        }).catch(err => {
          console.log('err: ', err)
          self.sendCommandToAll('application:check-password', false)
        })
        return
      }
      let list = ['nginx', 'php', 'mysql', 'apache', 'host', 'memcached', 'redis']
      if (list.includes(command)) {
        let module = command
        let child = fork(join(__static, `fork/${command}`))
        console.log('Server: ', global.Server)
        child.send({ Server: global.Server })
        child.send(args)
        child.on('message', function ({ command, info }) {
          if (command === 'application:global-server-updata') {
            console.log('child on message: ', info)
            global.Server = JSON.parse(JSON.stringify(info))
            return
          }
          self.sendCommandToAll(command, info)
          if (command.indexOf('task-') >= 0 && command.indexOf('-end') >= 0) {
            let action = args[0]
            console.log('action: ', action)
            self.sendCommandToAll('application:task-callback', {
              res: info,
              module: module,
              action: action
            })
            child.disconnect()
            child.kill()
          }
        //
        })
      }
    })
    ipcMain.on('event', (event, eventName, ...args) => {
      logger.log('receive event', eventName, ...args)
      this.emit(eventName, ...args)
    })
  }
}
