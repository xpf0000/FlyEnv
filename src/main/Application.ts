import { EventEmitter } from 'events'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import logger from './core/Logger'
import ConfigManager from './core/ConfigManager'
import WindowManager from './ui/WindowManager'
import { join, resolve } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import TrayManager from './ui/TrayManager'
import { getLanguage, mkdirp } from './utils'
import { AppAllLang, AppI18n } from '@lang/index'
import type { PtyItem } from './type'
import SiteSuckerManager from './ui/SiteSucker'
import { ForkManager } from './core/ForkManager'
import { execPromise } from '../fork/Fn'
import is from 'electron-is'
import UpdateManager from './core/UpdateManager'
import { PItem, ProcessPidList, ProcessPidListByPids } from '../fork/Process'
import NodePTY from './core/NodePTY'
import ScreenManager from './core/ScreenManager'
import HttpServer from './core/HttpServer'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import AppNodeFnManager, { type AppNodeFn } from './core/AppNodeFn'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default class Application extends EventEmitter {
  isReady: boolean
  configManager: ConfigManager
  trayManager: TrayManager
  windowManager: WindowManager
  mainWindow?: BrowserWindow
  trayWindow?: BrowserWindow
  forkManager?: ForkManager
  updateManager?: UpdateManager
  hostServicePID: Set<number | string> = new Set()
  customerLang: Record<string, any> = {}
  pty: Partial<Record<string, PtyItem>> = {}

  constructor() {
    super()
    global.Server = {
      Local: `${app.getLocale()}.UTF-8`
    }
    this.isReady = false
    this.configManager = new ConfigManager()
    AppNodeFnManager.configManager = this.configManager
    this.initLang()
    this.initServerDir()
    this.windowManager = new WindowManager({
      configManager: this.configManager
    })
    this.initWindowManager()
    ScreenManager.initWatch()
    this.trayManager = new TrayManager()
    this.initTrayManager()
    this.initUpdaterManager()
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
    NodePTY.onSendCommand((command: string, ...args: any) => {
      this.windowManager.sendCommandTo(this.mainWindow!, command, ...args)
    })
    this.handleCommand('app-fork:app', 'App-Start', 'start', app.getVersion(), is.dev())
  }

  initLang() {
    const lang = getLanguage(this.configManager.getConfig('setup.lang'))
    if (lang) {
      this.configManager.setConfig('setup.lang', lang)
      AppI18n(lang)
      window.Server.Lang = lang
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
      this?.trayWindow?.setPosition(Math.round(x), Math.round(y))
      this?.trayWindow?.setOpacity(1.0)
      this?.trayWindow?.show()
      this?.trayWindow?.moveTop()
      this.windowManager.sendCommandTo(this.trayWindow!, 'APP:Poper-Left', 'APP:Poper-Left', poperX)
    })
    this.trayManager.on('double-click', () => {
      this.show('index')
    })
  }

  initServerDir() {
    let runpath = resolve(app.getPath('exe'), '../../PhpWebStudy-Data').split('\\').join('/')
    if (is.dev()) {
      runpath = resolve(__static, '../../../data')
    }
    console.log('userData: ', runpath)
    this.setProxy()
    window.Server.UserHome = app.getPath('home')
    console.log('window.Server.UserHome: ', window.Server.UserHome)
    window.Server.BaseDir = join(runpath, 'server')
    window.Server.AppDir = join(runpath, 'app')
    mkdirp(window.Server.BaseDir).then().catch()
    mkdirp(window.Server.AppDir).then().catch()
    window.Server.NginxDir = join(runpath, 'server/nginx')
    window.Server.PhpDir = join(runpath, 'server/php')
    window.Server.MysqlDir = join(runpath, 'server/mysql')
    window.Server.MariaDBDir = join(runpath, 'server/mariadb')
    window.Server.ApacheDir = join(runpath, 'server/apache')
    window.Server.MemcachedDir = join(runpath, 'server/memcached')
    window.Server.RedisDir = join(runpath, 'server/redis')
    window.Server.MongoDBDir = join(runpath, 'server/mongodb')
    window.Server.FTPDir = join(runpath, 'server/ftp')
    window.Server.PostgreSqlDir = join(runpath, 'server/postgresql')
    mkdirp(window.Server.NginxDir).then().catch()
    mkdirp(window.Server.PhpDir).then().catch()
    mkdirp(window.Server.MysqlDir).then().catch()
    mkdirp(window.Server.MariaDBDir).then().catch()
    mkdirp(window.Server.ApacheDir).then().catch()
    mkdirp(window.Server.MemcachedDir).then().catch()
    mkdirp(window.Server.RedisDir).then().catch()
    mkdirp(window.Server.MongoDBDir).then().catch()
    window.Server.Cache = join(runpath, 'server/cache')
    mkdirp(window.Server.Cache).then().catch()
    window.Server.Static = __static
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
    ScreenManager.initWindow(win)
    ScreenManager.repositionAllWindows()
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
    try {
      ScreenManager.destroy()
      SiteSuckerManager.destory()
      this.forkManager?.destroy()
      this.trayManager?.destroy()
      await this.stopServer()
    } catch (e) {
      console.log('stop e: ', e)
    }
  }

  async stopServerByPid() {
    const arr: Array<number> = []
    const fpm: Array<number> = []

    let all: PItem[] = []
    try {
      all = await ProcessPidList()
    } catch {}
    for (const item of all) {
      if (!item.CommandLine || typeof item.CommandLine !== 'string') {
        continue
      }
      if (
        item.CommandLine.includes('PhpWebStudy-Data') ||
        item.CommandLine.includes('pws-app-') ||
        item.CommandLine.includes('php.phpwebstudy')
      ) {
        if (item.CommandLine.includes('php-cgi-spawner.exe')) {
          fpm.push(item.ProcessId)
        } else {
          arr.push(item.ProcessId)
        }
      }
    }
    arr.unshift(...fpm)
    console.log('_stopServer arr: ', arr)
    if (arr.length > 0) {
      arr.forEach((pid) => {
        this.hostServicePID.delete(pid)
      })
      const str = arr.map((s) => `/pid ${s}`).join(' ')
      try {
        await execPromise(`taskkill /f /t ${str}`)
      } catch (e) {
        console.log('taskkill e: ', e)
      }
    }
  }

  async stopHostService() {
    if (this.hostServicePID.size === 0) {
      return
    }
    const all: number[] = await ProcessPidListByPids(Array.from(this.hostServicePID))
    if (all.length > 0) {
      const str = all.map((s) => `/pid ${s}`).join(' ')
      try {
        await execPromise(`taskkill /f /t ${str}`)
      } catch (e) {
        console.log('taskkill e: ', e)
      }
    }
  }

  async stopServer() {
    NodePTY.exitAllPty()
    try {
      await this.stopServerByPid()
    } catch (e) {
      console.log('stopServerByPid e: ', e)
    }
    try {
      await this.stopHostService()
    } catch (e) {
      console.log('stopHostService e: ', e)
    }
    console.log('stopServer !!!')
    const hostsFile = join('c:/windows/system32/drivers/etc', 'hosts')
    try {
      let hosts = readFileSync(hostsFile, 'utf-8')
      const x = hosts.match(/(#X-HOSTS-BEGIN#)([\s\S]*?)(#X-HOSTS-END#)/g)
      if (x && x.length > 0) {
        hosts = hosts.replace(x[0], '')
        writeFileSync(hostsFile, hosts)
      }
    } catch (e) {
      console.log('hostsFile clean e: ', e)
    }
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
    this.stop()
      .then(() => {
        app.relaunch()
        app.exit()
      })
      .catch((e) => {
        console.log('relaunch e: ', e)
        app.relaunch()
        app.exit()
      })
  }

  initUpdaterManager() {
    try {
      this.updateManager = new UpdateManager(true)
      this.handleUpdaterEvents()
    } catch (err) {
      console.log('initUpdaterManager err: ', err)
    }
  }

  handleUpdaterEvents() {
    this.updateManager?.on('download-progress', (event) => {
      const win = this.windowManager.getWindow('index')
      win.setProgressBar(event.percent / 100)
    })
    this.updateManager?.on('update-downloaded', () => {
      const win = this.windowManager.getWindow('index')
      win.setProgressBar(0)
    })
    this.updateManager?.on('will-updated', () => {
      this.windowManager.setWillQuit(true)
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
      this.stop()
        .then(() => {
          console.log('application real exit !!!!!!')
          app.exit()
          process.exit(0)
        })
        .catch((e) => {
          console.log('application:exit e: ', e)
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

    this.on('application:change-menu-states', () => {})

    this.on('application:window-size-change', (size) => {
      console.log('application:window-size-change: ', size)
      this.windowManager
        ?.getFocusedWindow()
        ?.setSize(Math.round(size.width), Math.round(size.height), true)
    })

    this.on('application:window-open-new', (page) => {
      console.log('application:window-open-new: ', page)
    })

    this.on('application:check-for-updates', () => {})
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
      window.Server.Proxy = proxyDict
    } else {
      delete window.Server.Proxy
    }
  }

  handleCommand(command: string, key: string, ...args: any) {
    this.emit(command, ...args)
    let window
    const callBack = (info: any) => {
      console.log('callBack info: ', info)
      const win = this.mainWindow!
      this.windowManager.sendCommandTo(win, command, key, info)
      if (info?.data?.['APP-Service-Start-PID']) {
        this.hostServicePID.add(info.data['APP-Service-Start-PID'])
      } else if (info?.data?.['APP-Service-Stop-PID']) {
        const arr: string[] = info.data['APP-Service-Stop-PID'] as any
        arr.forEach((s) => this.hostServicePID.delete(s))
      } else if (info?.data?.['APP-Licenses-Code']) {
        const code: string = info.data['APP-Licenses-Code'] as any
        this.configManager?.setConfig('setup.license', code)
        this.windowManager.sendCommandTo(
          this.mainWindow!,
          'APP-License-Need-Update',
          'APP-License-Need-Update',
          true
        )
      } else if (info?.msg?.['APP-Licenses-Code']) {
        console.log('APP-Licenses-Code !!!')
        const code: string = info.msg['APP-Licenses-Code'] as any
        this.configManager?.setConfig('setup.license', code)
      } else if (info?.msg?.['APP-On-Log']) {
        this.windowManager.sendCommandTo(
          this.mainWindow!,
          'APP-On-Log',
          'APP-On-Log',
          info.msg['APP-On-Log']
        )
      }
    }
    if (command.startsWith('app-fork:')) {
      console.log('app main time: ', new Date().getTime())
      const module = command.replace('app-fork:', '')
      const openApps: Record<string, string> = {
        VSCode: 'vscode://file/'
      }

      if (module === 'tools' && args?.[0] === 'openPathByApp' && !!openApps?.[args?.[2]]) {
        const appKey = args[2]
        const url = `${openApps[appKey]}${encodeURIComponent(args[1].replace(/\\/g, '/'))}`
        console.log('openPathByApp ', args?.[2], url)
        shell
          .openExternal(url)
          .then(() => {
            this.windowManager.sendCommandTo(this.mainWindow!, command, key, {
              code: 0,
              data: true
            })
          })
          .catch((e: any) => {
            this.windowManager.sendCommandTo(this.mainWindow!, command, key, {
              code: 1,
              msg: e.toString()
            })
          })
        return
      }

      this.setProxy()
      window.Server.Lang = this.configManager?.getConfig('setup.lang') ?? 'en'
      window.Server.ForceStart = this.configManager?.getConfig('setup.forceStart')
      window.Server.Licenses = this.configManager?.getConfig('setup.license')
      if (!Object.keys(AppAllLang).includes(window.Server.Lang!)) {
        window.Server.LangCustomer = this.customerLang[window.Server.Lang!]
      }
      this.forkManager
        ?.send(module, ...args)
        .on(callBack)
        .then(callBack)
      return
    }
    switch (command) {
      case 'App-Node-FN':
        {
          const namespace: string = args.shift()
          const method: string = args.shift()
          const fn: keyof AppNodeFn = `${namespace}_${method}` as any
          console.log('App-Node-FN: ', fn)
          try {
            if (typeof AppNodeFnManager[fn] === 'function') {
              const nodeFn = AppNodeFnManager[fn] as any
              nodeFn.call(AppNodeFnManager, command, key, ...args)
            }
          } catch {}
        }
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
        console.log('Application:tray-status-change: ', args)
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
          const state = args[0]?.groupIsRunning ?? false
          this.trayManager.iconChange(state)
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
        HttpServer.start(args[0]).then((res) => {
          this.windowManager.sendCommandTo(this.mainWindow!, command, key, res)
        })
        break
      case 'app-http-serve-stop':
        HttpServer.stop(args[0]).then((res) => {
          this.windowManager.sendCommandTo(this.mainWindow!, command, key, {
            path: res
          })
        })
        break
      case 'NodePty:init':
        NodePTY.initNodePty().then((res) => {
          this.windowManager.sendCommandTo(this.mainWindow!, command, key, { code: 0, data: res })
        })
        break
      case 'NodePty:exec':
        NodePTY.exec(args[0], args[1], command, key)
        break
      case 'NodePty:write':
        NodePTY.write(args[0], args[1])
        break
      case 'NodePty:clear':
        NodePTY.clean(args[0])
        this.windowManager.sendCommandTo(this.mainWindow!, command, key, { code: 0 })
        break
      case 'NodePty:resize':
        NodePTY.resize(args[0], args[1])
        this.windowManager.sendCommandTo(this.mainWindow!, command, key, { code: 0 })
        break
      case 'NodePty:stop':
        NodePTY.stop(args[0])
        this.windowManager.sendCommandTo(this.mainWindow!, command, key, { code: 0 })
        break
      case 'app-sitesucker-run':
        if (args && Array.isArray(args) && args.length > 0) {
          const url = args[0]
          SiteSuckerManager.show(url)
        }
        break
      case 'APP:Auto-Hide':
        this?.mainWindow?.hide()
        break
      case 'app-sitesucker-setup':
        {
          const setup = this.configManager.getConfig('tools.siteSucker')
          this.windowManager.sendCommandTo(this.mainWindow!, command, key, setup)
        }
        return
      case 'app-sitesucker-setup-save':
        if (args && Array.isArray(args) && args.length > 0) {
          this.configManager.setConfig('tools.siteSucker', args[0])
          this.windowManager.sendCommandTo(this.mainWindow!, command, key, true)
          SiteSuckerManager.updateConfig(args[0])
        }
        return
      case 'app-customer-lang-update':
        {
          const langKey = args[0]
          const langValue = args[1]
          this.customerLang[langKey] = langValue
          AppI18n().global.setLocaleMessage(langKey, langValue)
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
