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
import { copyFile, copyFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { fork, execSync } from 'child_process'
const { createFolder, chmod, readFileAsync, writeFileAsync } = require('../shared/file.js')
const { execAsync, isAppleSilicon } = require('../shared/utils.js')
const compressing = require('compressing')
const execPromise = require('child-process-promise').exec
const ServeHandler = require('serve-handler')
const Http = require('http')
const Pty = require('node-pty')

export default class Application extends EventEmitter {
  constructor() {
    super()
    this.isReady = false
    this.httpServes = {}
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
    this.initServerDir()
    this.handleCommands()
    this.handleIpcMessages()
  }

  _fixEnv() {
    const env = process.env
    if (!env['PATH']) {
      env['PATH'] =
        '/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/bin:/usr/local/bin:/bin:/usr/sbin:/sbin'
    } else {
      env[
        'PATH'
      ] = `/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/bin:/usr/local/bin:${env['PATH']}`
    }
    return env
  }

  initNodePty() {
    this.pty = Pty.spawn(process.env['SHELL'], [], {
      name: 'xterm-color',
      cols: 80,
      rows: 34,
      cwd: process.cwd(),
      env: this._fixEnv(),
      encoding: 'utf8'
    })
    this.pty.onData((data) => {
      console.log('pty.onData: ', data)
      this.sendCommandToAll('NodePty:data', 'NodePty:data', data)
      if (data.includes('\r')) {
        this.ptyLastData = data
      } else {
        this.ptyLastData += data
      }
    })
    this.pty.onExit((e) => {
      console.log('this.pty.onExit !!!!!!', e)
      this.exitNodePty()
    })
  }

  exitNodePty() {
    try {
      if (this?.pty?.pid) {
        process.kill(this.pty.pid)
      }
      this?.pty?.kill()
    } catch (e) {}
    if (this.ptyLast) {
      const { command, key } = this.ptyLast
      this.sendCommandToAll(command, key, true)
      this.ptyLast = null
    }
    this.pty = null
  }

  initServerDir() {
    console.log('userData: ', app.getPath('userData'))
    let runpath = app.getPath('userData').replace('Application Support/', '')
    global.Server = {}
    this.setProxy()
    global.Server.isAppleSilicon = isAppleSilicon()
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
        execAsync('brew', ['--repo']).then((p) => {
          console.log('brew --repo: ', p)
          global.Server.BrewHome = p
          global.Server.BrewFormula = join(p, 'Library/Taps/homebrew/homebrew-core/Formula')
          execAsync('git', [
            'config',
            '--global',
            '--add',
            'safe.directory',
            join(p, 'Library/Taps/homebrew/homebrew-core')
          ]).then()
          execAsync('git', [
            'config',
            '--global',
            '--add',
            'safe.directory',
            join(p, 'Library/Taps/homebrew/homebrew-cask')
          ]).then()
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
    let enablePhpConf = join(global.Server.NginxDir, 'common/conf/enable-php-80.conf')
    if (!existsSync(enablePhpConf)) {
      const arrs = [56, 70, 71, 72, 73, 74, 80, 81, 82]
      arrs.forEach((v) => {
        const tmplConf = join(__static, `tmpl/enable-php-${v}.conf`)
        enablePhpConf = join(global.Server.NginxDir, `common/conf/enable-php-${v}.conf`)
        copyFile(tmplConf, enablePhpConf)
      })
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
      console.log('ready-to-show !!!')
      this.isReady = true
      this.emit('ready')
      this.sendCommandToAll('APP-Ready-To-Show', 'APP-Ready-To-Show', true)
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

  stopServerByPid(pidfile, type) {
    if (!existsSync(pidfile) && type !== 'php') {
      return
    }
    const dis = {
      php: 'php-fpm',
      nginx: 'nginx',
      apache: 'httpd',
      mysql: 'mysqld',
      memcached: 'memcached',
      redis: 'redis-server'
    }
    try {
      if (existsSync(pidfile)) {
        unlinkSync(pidfile)
      }
      let serverName = dis[type]
      let command = `ps aux | grep '${serverName}' | awk '{print $2,$11,$12}'`
      const res = execSync(command).toString().trim()
      let pids = res.split('\n')
      let arr = []
      for (let p of pids) {
        if (
          p.indexOf(' grep ') >= 0 ||
          p.indexOf(' /bin/sh -c') >= 0 ||
          p.indexOf('/Contents/MacOS/') >= 0
        ) {
          continue
        }
        arr.push(p.split(' ')[0])
      }
      if (arr.length > 0) {
        arr = arr.join(' ')
        let sig = this.type === 'mysql' ? '-9' : '-INT'
        execSync(`echo '${global.Server.Password}' | sudo -S kill ${sig} ${arr}`)
      }
    } catch (e) {
      console.log(e)
    }
  }

  stopServer() {
    this.ptyLast = null
    this.exitNodePty()
    // 停止nginx服务
    let pidfile = join(global.Server.NginxDir, 'common/logs/nginx.pid')
    this.stopServerByPid(pidfile, 'nginx')
    pidfile = join(global.Server.PhpDir, 'common/var/run/php-fpm.pid')
    this.stopServerByPid(pidfile, 'php')
    pidfile = join(global.Server.MysqlDir, 'mysql.pid')
    this.stopServerByPid(pidfile, 'mysql')
    pidfile = join(global.Server.ApacheDir, 'common/logs/httpd.pid')
    this.stopServerByPid(pidfile, 'apache')
    pidfile = join(global.Server.MemcachedDir, 'logs/memcached.pid')
    this.stopServerByPid(pidfile, 'memcached')
    pidfile = join(global.Server.RedisDir, 'common/run/redis.pid')
    this.stopServerByPid(pidfile, 'redis')
    try {
      let hosts = readFileSync('/private/etc/hosts', 'utf-8')
      let x = hosts.match(/(#X-HOSTS-BEGIN#)([\s\S]*?)(#X-HOSTS-END#)/g)
      if (x) {
        hosts = hosts.replace(x[0], '')
        writeFileSync('/private/etc/hosts', hosts)
      }
    } catch (e) {}
  }

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

  setProxy() {
    const proxy = this.configManager.getConfig('setup.proxy')
    if (proxy.on) {
      const proxyDict = {}
      proxy.proxy
        .split(' ')
        .filter((s) => s.indexOf('=') > 0)
        .forEach((s) => {
          const dict = s.split('=')
          proxyDict[dict[0]] = dict[1]
        })
      global.Server.Proxy = proxyDict
    }
  }

  handleCommand(command, key, ...args) {
    console.log('handleIpcMessages: ', command, key, ...args)
    this.emit(command, ...args)
    let window
    switch (command) {
      case 'app-fork:node':
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
        this.setProxy()
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
        execPromise(`echo '${pass}' | sudo -S -k -l`)
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
      case 'app-http-serve-run':
        const path = args[0]
        const httpServe = this.httpServes[path]
        if (httpServe) {
          httpServe.server.close()
          delete this.httpServes[path]
        }
        const server = Http.createServer((request, response) => {
          response.setHeader('Access-Control-Allow-Origin', '*')
          response.setHeader('Access-Control-Allow-Headers', '*')
          response.setHeader('Access-Control-Allow-Methods', '*')
          return ServeHandler(request, response, {
            public: path
          })
        })
        server.listen(0, () => {
          console.log('server.address(): ', server.address())
          const port = server.address().port
          const host = `http://localhost:${port}/`
          this.httpServes[path] = {
            server,
            port,
            host
          }
          this.sendCommandToAll(command, key, {
            path,
            port,
            host
          })
        })
        break
      case 'app-http-serve-stop':
        const path1 = args[0]
        const httpServe1 = this.httpServes[path1]
        console.log('httpServe1: ', httpServe1)
        if (httpServe1) {
          httpServe1.server.close()
          delete this.httpServes[path1]
        }
        this.sendCommandToAll(command, key, {
          path: path1
        })
        break
      case 'NodePty:write':
        if (!this.pty) {
          this.initNodePty()
        }
        if (!this.ptyLast) {
          this.ptyLast = {
            command,
            key
          }
        }
        this.pty.write(args[0])
        break
      case 'NodePty:clear':
        if (!this.pty) {
          this.initNodePty()
        }
        this.pty.write('clear\r')
        break
      case 'NodePty:resize':
        if (!this.pty) {
          this.initNodePty()
        }
        const { cols, rows } = args[0]
        this.pty.resize(cols, rows)
        break
      case 'NodePty:stop':
        this.exitNodePty()
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
