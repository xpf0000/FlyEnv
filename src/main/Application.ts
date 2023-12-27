import { EventEmitter } from 'events'
import { app, BrowserWindow, ipcMain } from 'electron'
import is from 'electron-is'
import logger from './core/Logger'
import ConfigManager from './core/ConfigManager'
import WindowManager from './ui/WindowManager'
import MenuManager from './ui/MenuManager'
import UpdateManager from './core/UpdateManager'
import { join, resolve } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { execSync, fork } from 'child_process'
import TrayManager from './ui/TrayManager'
import { getLanguage } from './utils'
import { AppI18n } from './lang'
import DnsServerManager from './core/DnsServerManager'
import type { PtyLast, StaticHttpServe } from './type'
import type { IPty } from 'node-pty'
import type { ServerResponse } from 'http'
import { fixEnv } from '@shared/utils'
import SiteSuckerManager from './ui/SiteSuckerManager'
import { ForkManager } from './core/ForkManager'

const { createFolder, readFileAsync, writeFileAsync } = require('../shared/file')
const { execAsync, isAppleSilicon } = require('../shared/utils')
const compressing = require('compressing')
const execPromise = require('child-process-promise').exec
const ServeHandler = require('serve-handler')
const Http = require('http')
const Pty = require('node-pty')
const IP = require('ip')

export default class Application extends EventEmitter {
  isReady: boolean
  httpServes: { [k: string]: StaticHttpServe }
  configManager: ConfigManager
  menuManager: MenuManager
  trayManager: TrayManager
  windowManager: WindowManager
  mainWindow?: BrowserWindow
  trayWindow?: BrowserWindow
  pty?: IPty | null
  ptyLastData = ''
  ptyLast?: PtyLast | null
  updateManager?: UpdateManager
  dnsSuccessed = false
  forkManager?: ForkManager

  constructor() {
    super()
    global.Server = {}
    this.isReady = false
    this.httpServes = {}
    this.configManager = new ConfigManager()
    this.initLang()
    this.menuManager = new MenuManager()
    this.menuManager.setup()
    this.windowManager = new WindowManager({
      configManager: this.configManager
    })
    this.initWindowManager()
    this.trayManager = new TrayManager()
    this.initTrayManager()
    this.initUpdaterManager()
    this.initServerDir()
    this.checkBrewOrPort()
    this.handleCommands()
    this.handleIpcMessages()
    this.initForkManager()
    SiteSuckerManager.setCallBack((link: any) => {
      if (link === 'window-close') {
        this.windowManager.sendCommandTo(
          this.mainWindow!,
          'App-SiteSucker-Link-Stop',
          'App-SiteSucker-Link-Stop',
          true
        )
        return
      }
      this.windowManager.sendCommandTo(
        this.mainWindow!,
        'App-SiteSucker-Link',
        'App-SiteSucker-Link',
        link
      )
    })
    DnsServerManager.onLog((msg: any) => {
      this.windowManager.sendCommandTo(this.mainWindow!, 'App_DNS_Log', 'App_DNS_Log', msg)
    })
  }

  initLang() {
    const lang = getLanguage(this.configManager.getConfig('setup.lang'))
    if (lang) {
      this.configManager.setConfig('setup.lang', lang)
      AppI18n(lang)
      global.Server.Lang = lang
    }
  }

  initForkManager() {
    this.forkManager = new ForkManager(resolve(__dirname, './fork.js'))
    this.forkManager.on(({ key, info }: { key: string; info: any }) => {
      this.windowManager.sendCommandTo(this.mainWindow!, key, key, info)
    })
  }

  initTrayManager() {
    this.trayManager.on('click', (x, poperX) => {
      if (!this?.trayWindow?.isVisible() || this?.trayWindow?.isFullScreen()) {
        this?.trayWindow?.setPosition(x, 0)
        this?.trayWindow?.setOpacity(1.0)
        this?.trayWindow?.show()
        this.windowManager.sendCommandTo(
          this.trayWindow!,
          'APP:Poper-Left',
          'APP:Poper-Left',
          poperX
        )
      } else {
        this?.trayWindow?.hide()
      }
    })
  }

  initNodePty() {
    this.pty = Pty.spawn(process.env['SHELL'], [], {
      name: 'xterm-color',
      cols: 80,
      rows: 34,
      cwd: process.cwd(),
      env: fixEnv(),
      encoding: 'utf8'
    })
    this.pty!.onData((data) => {
      console.log('pty.onData: ', data)
      this.windowManager.sendCommandTo(this.mainWindow!, 'NodePty:data', 'NodePty:data', data)
      if (data.includes('\r')) {
        this.ptyLastData = data
      } else {
        this.ptyLastData += data
      }
    })
    this.pty!.onExit((e) => {
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
      this.windowManager.sendCommandTo(this.mainWindow!, command, key, true)
      this.ptyLast = null
    }
    this.pty = null
  }

  checkBrewOrPort() {
    execAsync('which', ['brew'])
      .then((res: string) => {
        console.log('which brew: ', res)
        execAsync('brew', ['--repo']).then((p: string) => {
          console.log('brew --repo: ', p)
          global.Server.BrewHome = p
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
        execAsync('brew', ['--cellar']).then((c: string) => {
          console.log('brew --cellar: ', c)
          global.Server.BrewCellar = c
        })
      })
      .catch((e: Error) => {
        console.log('which brew e: ', e)
      })

    execAsync('which', ['port'])
      .then((c: string) => {
        global.Server.MacPorts = c
      })
      .catch(() => {})
  }

  initServerDir() {
    console.log('userData: ', app.getPath('userData'))
    const runpath = app.getPath('userData').replace('Application Support/', '')
    this.setProxy()
    global.Server.isAppleSilicon = isAppleSilicon()
    global.Server.BaseDir = join(runpath, 'server')
    createFolder(global.Server.BaseDir)
    global.Server.NginxDir = join(runpath, 'server/nginx')
    global.Server.PhpDir = join(runpath, 'server/php')
    global.Server.MysqlDir = join(runpath, 'server/mysql')
    global.Server.MariaDBDir = join(runpath, 'server/mariadb')
    global.Server.ApacheDir = join(runpath, 'server/apache')
    global.Server.MemcachedDir = join(runpath, 'server/memcached')
    global.Server.RedisDir = join(runpath, 'server/redis')
    global.Server.MongoDBDir = join(runpath, 'server/mongodb')
    global.Server.FTPDir = join(runpath, 'server/ftp')
    global.Server.PostgreSqlDir = join(runpath, 'server/postgresql')
    createFolder(global.Server.NginxDir)
    createFolder(global.Server.PhpDir)
    createFolder(global.Server.MysqlDir)
    createFolder(global.Server.MariaDBDir)
    createFolder(global.Server.ApacheDir)
    createFolder(global.Server.MemcachedDir)
    createFolder(global.Server.RedisDir)
    createFolder(global.Server.MongoDBDir)
    global.Server.Cache = join(runpath, 'server/cache')
    createFolder(global.Server.Cache)
    global.Server.Static = __static
    global.Server.Password = this.configManager.getConfig('password')
    console.log('global.Server.Password: ', global.Server.Password)

    const httpdcong = join(global.Server.ApacheDir, 'common/conf/')
    createFolder(httpdcong)

    const ngconf = join(global.Server.NginxDir, 'common/conf/nginx.conf')
    if (!existsSync(ngconf)) {
      compressing.zip
        .uncompress(join(__static, 'zip/nginx-common.zip'), global.Server.NginxDir)
        .then(() => {
          readFileAsync(ngconf).then((content: string) => {
            content = content
              .replace(/#PREFIX#/g, global.Server.NginxDir!)
              .replace('#VHostPath#', join(global.Server.BaseDir!, 'vhost/nginx'))
            writeFileAsync(ngconf, content).then()
            writeFileAsync(
              join(global.Server.NginxDir!, 'common/conf/nginx.conf.default'),
              content
            ).then()
          })
        })
        .catch()
    }
  }

  initWindowManager() {
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

  storeWindowState(data: any = {}) {
    const state = this.configManager.getConfig('window-state', {})
    const { page, bounds } = data
    const newState = {
      ...state,
      [page]: bounds
    }
    this.configManager.setConfig('window-state', newState)
  }

  start(page: string) {
    this.showPage(page)
    this.mainWindow?.setIgnoreMouseEvents(false)
  }

  showPage(page: string) {
    const win = this.windowManager.openWindow(page)
    this.mainWindow = win
    win.once('ready-to-show', () => {
      this.isReady = true
      this.emit('ready')
      this.windowManager.sendCommandTo(win, 'APP-Ready-To-Show', true)
    })
    this.trayWindow = this.windowManager.openTrayWindow()
  }

  show(page = 'index') {
    this.windowManager.showWindow(page)
  }

  hide(page: string) {
    if (page) {
      this.windowManager.hideWindow(page)
    } else {
      this.windowManager.hideAllWindow()
    }
  }

  toggle(page = 'index') {
    this.windowManager.toggleWindow(page)
  }

  closePage(page: string) {
    this.windowManager.destroyWindow(page)
  }

  stop() {
    logger.info('[PhpWebStudy] application stop !!!')
    DnsServerManager.close().then()
    SiteSuckerManager.destory()
    this.forkManager?.destory()
    this.stopServer()
  }

  stopServerByPid(pidfile: string, type: string) {
    if (!existsSync(pidfile) && type !== 'php') {
      return
    }
    const dis: { [k: string]: string } = {
      php: 'php-fpm',
      nginx: 'nginx',
      apache: 'httpd',
      mysql: 'mysqld',
      memcached: 'memcached',
      redis: 'redis-server',
      mongodb: 'mongod',
      mariadb: 'mariadbd',
      ftp: join(global.Server.FTPDir!, 'pure-ftpd.conf')
    }
    try {
      const serverName = dis[type]
      const command = `ps aux | grep '${serverName}' | awk '{print $2,$11,$12}'`
      const res = execSync(command)?.toString()?.trim() ?? ''
      const pids = res.split('\n')
      const arr: Array<string> = []
      for (const p of pids) {
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
        const str = arr.join(' ')
        let sig = ''
        switch (type) {
          case 'mysql':
          case 'mariadb':
          case 'mongodb':
            sig = '-TERM'
            break
          default:
            sig = '-INT'
            break
        }
        execSync(`echo '${global.Server.Password}' | sudo -S kill ${sig} ${str}`)
      }
    } catch (e) {
      console.log(e)
    }
  }

  stopServer() {
    this.ptyLast = null
    this.exitNodePty()

    const stopPostpreSql = () => {
      const command = `ps aux | grep 'postgresql' | awk '{print $2,$11,$12,$13}'`
      const res = execSync(command)
      const pids = res?.toString()?.trim()?.split('\n') ?? []
      const arr = []
      for (const p of pids) {
        if (p.includes(global.Server.PostgreSqlDir!)) {
          arr.push(p.split(' ')[0])
        }
      }
      if (arr.length > 0) {
        const pids = arr.join(' ')
        const sig = '-INT'
        try {
          execSync(`echo '${global.Server.Password}' | sudo -S kill ${sig} ${pids}`)
        } catch (e) {}
      }
    }

    // 停止nginx服务
    let pidfile = join(global.Server.NginxDir!, 'common/logs/nginx.pid')
    this.stopServerByPid(pidfile, 'nginx')
    pidfile = join(global.Server.PhpDir!, 'common/var/run/php-fpm.pid')
    this.stopServerByPid(pidfile, 'php')
    pidfile = join(global.Server.MysqlDir!, 'mysql.pid')
    this.stopServerByPid(pidfile, 'mysql')
    pidfile = join(global.Server.MariaDBDir!, 'mariadb.pid')
    this.stopServerByPid(pidfile, 'mariadb')
    pidfile = join(global.Server.ApacheDir!, 'common/logs/httpd.pid')
    this.stopServerByPid(pidfile, 'apache')
    pidfile = join(global.Server.MemcachedDir!, 'logs/memcached.pid')
    this.stopServerByPid(pidfile, 'memcached')
    pidfile = join(global.Server.RedisDir!, 'redis.pid')
    this.stopServerByPid(pidfile, 'redis')
    pidfile = join(global.Server.MongoDBDir!, 'mongodb.pid')
    this.stopServerByPid(pidfile, 'mongodb')
    pidfile = join(global.Server.FTPDir!, 'pure-ftpd.pid')
    this.stopServerByPid(pidfile, 'ftp')
    stopPostpreSql()
    try {
      let hosts = readFileSync('/private/etc/hosts', 'utf-8')
      const x = hosts.match(/(#X-HOSTS-BEGIN#)([\s\S]*?)(#X-HOSTS-END#)/g)
      if (x) {
        hosts = hosts.replace(x[0], '')
        writeFileSync('/private/etc/hosts', hosts)
      }
    } catch (e) {}
  }

  sendCommand(command: string, ...args: any) {
    if (!this.emit(command, ...args)) {
      const window = this.windowManager.getFocusedWindow()
      if (window) {
        this.windowManager.sendCommandTo(window, command, ...args)
      }
    }
  }

  sendCommandToAll(command: string, ...args: any) {
    if (!this.emit(command, ...args)) {
      this.windowManager.getWindowList().forEach((window) => {
        this.windowManager.sendCommandTo(window, command, ...args)
      })
    }
  }

  sendMessageToAll(channel: string, ...args: any) {
    this.windowManager.getWindowList().forEach((window) => {
      this.windowManager.sendMessageTo(window, channel, ...args)
    })
  }

  initUpdaterManager() {
    try {
      const autoCheck = this.configManager.getConfig('setup.autoCheck') ?? true
      this.updateManager = new UpdateManager(autoCheck)
      this.handleUpdaterEvents()
    } catch (err) {
      console.log('initUpdaterManager err: ', err)
    }
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
      this.menuManager.rebuild()
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

    this.on('application:change-menu-states', (visibleStates, enabledStates, checkedStates) => {
      this.menuManager.updateMenuStates(visibleStates, enabledStates, checkedStates)
    })

    this.on('application:window-size-change', (size) => {
      console.log('application:window-size-change: ', size)
      this.windowManager?.getFocusedWindow()?.setSize(size.width, size.height, true)
    })

    this.on('application:window-open-new', (page) => {
      console.log('application:window-open-new: ', page)
    })

    this.on('application:check-for-updates', () => {
      this.updateManager?.check()
    })
  }

  setProxy() {
    const proxy = this.configManager.getConfig('setup.proxy')
    if (proxy.on && proxy.proxy) {
      const proxyDict: { [k: string]: string } = {}
      proxy.proxy
        .split(' ')
        .filter((s: string) => s.indexOf('=') > 0)
        .forEach((s: string) => {
          const dict = s.split('=')
          proxyDict[dict[0]] = dict[1]
        })
      global.Server.Proxy = proxyDict
    } else {
      delete global.Server.Proxy
    }
  }

  handleCommand(command: string, key: string, ...args: any) {
    console.log('handleIpcMessages: ', command, key, ...args)
    this.emit(command, ...args)
    let window
    const callBack = (info: any) => {
      const win = this.mainWindow!
      console.log('forkManager callBack: ', command, key, info)
      this.windowManager.sendCommandTo(win, command, key, info)
    }
    switch (command) {
      case 'app-fork:apache':
      case 'app-fork:nginx':
      case 'app-fork:php':
      case 'app-fork:host':
      case 'app-fork:mysql':
      case 'app-fork:redis':
      case 'app-fork:memcached':
      case 'app-fork:mongodb':
      case 'app-fork:mariadb':
      case 'app-fork:postgresql':
      case 'app-fork:pure-ftpd':
      case 'app-fork:node':
      case 'app-fork:brew':
        const module = command.replace('app-fork:', '')
        this.forkManager
          ?.send(module, ...args)
          .on(callBack)
          .then(callBack)
        break
      case 'app-fork:tools':
      case 'app-fork:version':
      case 'app-fork:project':
        const forkFile = command.replace('app-fork:', '')
        const child = fork(join(__static, `fork/${forkFile}.js`))
        this.setProxy()
        global.Server.Lang = this.configManager.getConfig('setup.lang')
        child.send({ Server: global.Server })
        child.send([command, key, ...args])
        child.on('message', ({ command, key, info }: any) => {
          if (command === 'application:global-server-updata') {
            console.log('child on message: ', info)
            global.Server = JSON.parse(JSON.stringify(info))
            this.windowManager.sendCommandTo(this.mainWindow!, command, key, global.Server)
            return
          }
          this.windowManager.sendCommandTo(this.mainWindow!, command, key, info)
          // 0 成功 1 失败 200 过程
          if (typeof info === 'object' && (info?.code === 0 || info?.code === 1)) {
            child.disconnect()
            child.kill()
          }
        })
        break
      case 'app:password-check':
        const pass = args[0]
        console.log('pass: ', pass)
        execPromise(`echo '${pass}' | sudo -S -k -l`)
          .then(() => {
            this.configManager.setConfig('password', pass)
            global.Server.Password = pass
            this.windowManager.sendCommandTo(this.mainWindow!, command, key, pass)
          })
          .catch((err: Error) => {
            console.log('err: ', err)
            this.windowManager.sendCommandTo(this.mainWindow!, command, key, false)
          })
        return
      case 'app:brew-install':
        this.windowManager?.getFocusedWindow()?.minimize()
        break
      case 'Application:APP-Minimize':
        this.windowManager?.getFocusedWindow()?.minimize()
        break
      case 'Application:APP-Maximize':
        window = this.windowManager.getFocusedWindow()!
        if (window.isMaximized()) {
          window.unmaximize()
        } else {
          window.maximize()
        }
        break
      case 'Application:tray-status-change':
        this.trayManager.iconChange(args[0])
        break
      case 'application:save-preference':
        this.windowManager.sendCommandTo(this.mainWindow!, command, key)
        break
      case 'APP:Tray-Store-Sync':
        this.windowManager.sendCommandTo(this.trayWindow!, command, command, args[0])
        break
      case 'APP:Tray-Command':
        this.windowManager.sendCommandTo(this.mainWindow!, command, command, ...args)
        break
      case 'Application:APP-Close':
        this.windowManager?.getFocusedWindow()?.close()
        break
      case 'application:open-dev-window':
        this.mainWindow?.webContents?.openDevTools()
        break
      case 'application:about':
        this.windowManager.sendCommandTo(this.mainWindow!, command, key)
        break
      case 'app-http-serve-run':
        const path = args[0]
        const httpServe = this.httpServes[path]
        if (httpServe) {
          httpServe.server.close()
          delete this.httpServes[path]
        }
        const server = Http.createServer((request: Request, response: ServerResponse) => {
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
          const host = [`http://localhost:${port}/`]
          const ip = IP.address()
          if (ip && typeof ip === 'string' && ip.includes('.')) {
            host.push(`http://${ip}:${port}/`)
          }
          this.httpServes[path] = {
            server,
            port,
            host
          }
          this.windowManager.sendCommandTo(this.mainWindow!, command, key, {
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
        this.windowManager.sendCommandTo(this.mainWindow!, command, key, {
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
        this?.pty?.write(args[0])
        break
      case 'NodePty:clear':
        if (!this.pty) {
          this.initNodePty()
        }
        this?.pty?.write('clear\r')
        break
      case 'NodePty:resize':
        if (!this.pty) {
          this.initNodePty()
        }
        const { cols, rows } = args[0]
        this?.pty?.resize(cols, rows)
        break
      case 'NodePty:stop':
        this.exitNodePty()
        break
      case 'DNS:start':
        DnsServerManager.start(this.dnsSuccessed)
          .then(() => {
            this.windowManager.sendCommandTo(this.mainWindow!, command, key, true)
            this.dnsSuccessed = true
          })
          .catch((e) => {
            this.windowManager.sendCommandTo(this.mainWindow!, command, key, e.toString())
            this.dnsSuccessed = false
          })
        break
      case 'DNS:stop':
        DnsServerManager.close().then(() => {
          this.windowManager.sendCommandTo(this.mainWindow!, command, key, true)
        })
        break
      case 'app-sitesucker-run':
        const url = args[0]
        SiteSuckerManager.show(url).then()
        break
      case 'app-sitesucker-setup':
        const setup = this.configManager.getConfig('tools.siteSucker')
        this.windowManager.sendCommandTo(this.mainWindow!, command, key, setup)
        return
      case 'app-sitesucker-setup-save':
        this.configManager.setConfig('tools.siteSucker', args[0])
        this.windowManager.sendCommandTo(this.mainWindow!, command, key, true)
        return
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
    this.updateManager?.on('checking', () => {
      this.menuManager.updateMenuItemEnabledState('app.check-for-updates', false)
    })

    this.updateManager?.on('download-progress', (event) => {
      const win = this.windowManager.getWindow('index')
      win.setProgressBar(event.percent / 100)
    })

    this.updateManager?.on('update-not-available', () => {
      this.menuManager.updateMenuItemEnabledState('app.check-for-updates', true)
    })

    this.updateManager?.on('update-downloaded', () => {
      this.menuManager.updateMenuItemEnabledState('app.check-for-updates', true)
      const win = this.windowManager.getWindow('index')
      win.setProgressBar(0)
    })

    this.updateManager?.on('will-updated', () => {
      this.windowManager.setWillQuit(true)
    })

    this.updateManager?.on('update-error', () => {
      this.menuManager.updateMenuItemEnabledState('app.check-for-updates', true)
    })
  }
}
