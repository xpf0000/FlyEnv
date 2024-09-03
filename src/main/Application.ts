import { EventEmitter } from 'events'
import { app, BrowserWindow, ipcMain } from 'electron'
import logger from './core/Logger'
import ConfigManager from './core/ConfigManager'
import WindowManager from './ui/WindowManager'
import { join, resolve } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import TrayManager from './ui/TrayManager'
import { getLanguage } from './utils'
import { AppI18n } from './lang'
import type { StaticHttpServe } from './type'
import type { ServerResponse } from 'http'
import SiteSuckerManager from './ui/SiteSucker'
import { ForkManager } from './core/ForkManager'
import { execPromiseRoot } from '../fork/Fn'

const { createFolder } = require('../shared/file')
const { isAppleSilicon } = require('../shared/utils')
const ServeHandler = require('serve-handler')
const Http = require('http')
const IP = require('ip')

export default class Application extends EventEmitter {
  isReady: boolean
  httpServes: { [k: string]: StaticHttpServe }
  configManager: ConfigManager
  trayManager: TrayManager
  windowManager: WindowManager
  mainWindow?: BrowserWindow
  trayWindow?: BrowserWindow
  forkManager?: ForkManager

  constructor() {
    super()
    global.Server = {
      Local: `${app.getLocale()}.UTF-8`
    }
    this.isReady = false
    this.httpServes = {}
    this.configManager = new ConfigManager()
    this.initLang()
    this.windowManager = new WindowManager({
      configManager: this.configManager
    })
    this.initWindowManager()
    this.trayManager = new TrayManager()
    this.initTrayManager()
    this.initServerDir()
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
    this.trayManager.on('click', (x, y, poperX) => {
      if (!this?.trayWindow?.isVisible() || this?.trayWindow?.isFullScreen()) {
        this?.trayWindow?.setPosition(Math.round(x), Math.round(y))
        this?.trayWindow?.setOpacity(1.0)
        this?.trayWindow?.show()
        this?.trayWindow?.moveTop()
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

  initNodePty() { }

  exitNodePty() { }

  initServerDir() {
    const runpath = resolve(app.getPath('exe'), '../../PhpWebStudy-Data').split('\\').join('/')
    console.log('userData: ', runpath)
    this.setProxy()
    global.Server.isAppleSilicon = isAppleSilicon()
    global.Server.BaseDir = join(runpath, 'server')
    global.Server.AppDir = join(runpath, 'app')
    createFolder(global.Server.BaseDir)
    createFolder(global.Server.AppDir)
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

  async stop() {
    logger.info('[PhpWebStudy] application stop !!!')
    SiteSuckerManager.destory()
    this.forkManager?.destory()
    this.trayManager?.destroy()
    await this.stopServer()
  }

  async stopServerByPid() {
    let command = `wmic process get commandline,ProcessId | findstr "PhpWebStudy-Data"`
    console.log('_stopServer command: ', command)
    let res: any = null
    try {
      res = await execPromiseRoot(command)
    } catch (e) { }
    const pids = res?.stdout?.trim()?.split('\n') ?? []
    console.log('pids: ', pids)
    const arr: Array<string> = []
    const fpm: Array<string> = []
    for (const p of pids) {
      if (
        p.includes('findstr')
      ) {
        continue
      }

      if (p.includes('PhpWebStudy-Data')) {
        const pid = p.split(' ').filter((s: string) => {
          return !!s.trim()
        }).pop()
        if (p.includes('php-cgi-spawner.exe')) {
          fpm.push(pid.trim())
        } else {
          arr.push(pid.trim())
        }
      }
    }
    arr.unshift(...fpm)
    console.log('_stopServer arr: ', arr)
    if (arr.length > 0) {
      for (const pid of arr) {
        try {
          await execPromiseRoot(`wmic process where processid="${pid}" delete`)
        } catch (e) { }
      }
    }
  }

  async stopServer() {
    await this.stopServerByPid()
    console.log('stopServer !!!')
    const hostsFile = join('c:/windows/system32/drivers/etc', 'hosts')
    try {
      let hosts = readFileSync(hostsFile, 'utf-8')
      const x = hosts.match(/(#X-HOSTS-BEGIN#)([\s\S]*?)(#X-HOSTS-END#)/g)
      if (x && x.length > 0) {
        hosts = hosts.replace(x[0], '')
        writeFileSync(hostsFile, hosts)
      }
    } catch (e) { }
    console.log('stopServer End !!!')
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

  relaunch() {
    this.stop().then(() => {
      app.relaunch()
      app.exit()
    })
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
      this.windowManager.hideAllWindow()
      this.stop().then(() => {
        console.log('application real exit !!!!!!')
        app.exit()
        process.exit(0)
      })
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
    })

    this.on('application:window-size-change', (size) => {
      console.log('application:window-size-change: ', size)
      this.windowManager?.getFocusedWindow()?.setSize(Math.round(size.width), Math.round(size.height), true)
    })

    this.on('application:window-open-new', (page) => {
      console.log('application:window-open-new: ', page)
    })

    this.on('application:check-for-updates', () => {
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
    this.emit(command, ...args)
    let window
    const callBack = (info: any) => {
      const win = this.mainWindow!
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
      case 'app-fork:version':
      case 'app-fork:project':
      case 'app-fork:tools':
      case 'app-fork:macports':
      case 'app-fork:caddy':
      case 'app-fork:dns':
      case 'app-fork:composer':
        const module = command.replace('app-fork:', '')
        this.setProxy()
        global.Server.Lang = this.configManager?.getConfig('setup.lang') ?? 'en'
        global.Server.ForceStart = this.configManager?.getConfig('setup.forceStart')
        this.forkManager
          ?.send(module, ...args)
          .on(callBack)
          .then(callBack)
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
        if (args && Array.isArray(args) && args.length > 0) {
          this.trayManager.iconChange(args[0])
        }
        break
      case 'application:save-preference':
        this.windowManager.sendCommandTo(this.mainWindow!, command, key)
        break
      case 'APP:Tray-Store-Sync':
        if (args && Array.isArray(args) && args.length > 0) {
          this.windowManager.sendCommandTo(this.trayWindow!, command, command, args[0])
        }
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
        if (args && Array.isArray(args) && args.length > 0) {
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
        }
        break
      case 'app-http-serve-stop':
        if (args && Array.isArray(args) && args.length > 0) {
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
        }
        break
      case 'NodePty:write':
        break
      case 'NodePty:clear':
        break
      case 'NodePty:stop':
        this.exitNodePty()
        break
      case 'app-sitesucker-run':
        if (args && Array.isArray(args) && args.length > 0) {
          const url = args[0]
          SiteSuckerManager.show(url)
        }
        break
      case 'app-sitesucker-setup':
        const setup = this.configManager.getConfig('tools.siteSucker')
        this.windowManager.sendCommandTo(this.mainWindow!, command, key, setup)
        return
      case 'app-sitesucker-setup-save':
        if (args && Array.isArray(args) && args.length > 0) {
          this.configManager.setConfig('tools.siteSucker', args[0])
          this.windowManager.sendCommandTo(this.mainWindow!, command, key, true)
          SiteSuckerManager.updateConfig(args[0])
        }
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
}
