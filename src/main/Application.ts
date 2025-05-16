import { EventEmitter } from 'events'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import is from 'electron-is'
import logger from './core/Logger'
import ConfigManager from './core/ConfigManager'
import WindowManager from './ui/WindowManager'
import MenuManager from './ui/MenuManager'
import UpdateManager from './core/UpdateManager'
import { join, resolve } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import TrayManager from './ui/TrayManager'
import { getLanguage } from './utils'
import { AppI18n, I18nT, AppAllLang } from '@lang/index'
import DnsServerManager from './core/DNS'
import type { PtyItem } from './type'
import SiteSuckerManager from './ui/SiteSucker'
import { ForkManager } from './core/ForkManager'
import { execPromiseRoot, spawnAsync } from './core/Exec'
import { arch } from 'os'
import { PItem, ProcessListByPid } from '@shared/Process'
import NodePTY from './core/NodePTY'
import HttpServer from './core/HttpServer'
import AppHelper from './core/AppHelper'
import Helper from '../fork/Helper'
import ScreenManager from './core/ScreenManager'
import AppLog from './core/AppLog'

const { createFolder, readFileAsync, writeFileAsync } = require('../shared/file')
const { isAppleSilicon } = require('../shared/utils')
const compressing = require('compressing')

export default class Application extends EventEmitter {
  isReady: boolean
  configManager: ConfigManager
  menuManager: MenuManager
  trayManager: TrayManager
  windowManager: WindowManager
  mainWindow?: BrowserWindow
  trayWindow?: BrowserWindow
  updateManager?: UpdateManager
  forkManager?: ForkManager
  hostServicePID: Set<string> = new Set()
  helpCheckSuccessNoticed: boolean = false
  pty: Partial<Record<string, PtyItem>> = {}
  customerLang: Record<string, any> = {}

  constructor() {
    super()
    global.Server = {
      Local: `${app.getLocale()}.UTF-8`
    }
    this.isReady = false
    this.configManager = new ConfigManager()
    this.initLang()
    this.menuManager = new MenuManager()
    this.menuManager.setup()
    this.windowManager = new WindowManager({
      configManager: this.configManager
    })
    this.initWindowManager()
    ScreenManager.initWatch()
    this.trayManager = new TrayManager()
    this.initTrayManager()
    this.initUpdaterManager()
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
    DnsServerManager.onLog((msg: any) => {
      this.windowManager.sendCommandTo(this.mainWindow!, 'App_DNS_Log', 'App_DNS_Log', msg)
    })
    if (!is.dev()) {
      this.handleCommand('app-fork:app', 'App-Start', 'start', app.getVersion())
    }
    NodePTY.onSendCommand((command: string, ...args: any) => {
      this.windowManager.sendCommandTo(this.mainWindow!, command, ...args)
    })
    console.log('Application inited !!!')
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
        this?.trayWindow?.setPosition(Math.round(x), 0)
        this?.trayWindow?.setOpacity(1.0)
        this?.trayWindow?.show()
        this.windowManager.sendCommandTo(
          this.trayWindow!,
          'APP:Poper-Left',
          'APP:Poper-Left',
          poperX
        )
        this?.trayWindow?.moveTop()
      } else {
        this?.trayWindow?.hide()
      }
    })
  }

  checkBrewOrPort() {
    const handleBrewCheck = (error?: Error) => {
      const brewBin = isAppleSilicon() ? '/opt/homebrew/bin/brew' : '/usr/local/Homebrew/bin/brew'
      if (existsSync(brewBin)) {
        global.Server.BrewBin = brewBin
      }
      if (error) {
        global.Server.BrewError = error.toString()
      }
      this.windowManager.sendCommandTo(
        this.mainWindow!,
        'APP-Update-Global-Server',
        'APP-Update-Global-Server',
        JSON.parse(JSON.stringify(global.Server))
      )
    }
    spawnAsync('which', ['brew'])
      .then((res) => {
        console.log('which brew: ', res)
        spawnAsync('brew', ['--repo'])
          .then((res) => {
            console.log('brew --repo: ', res)
            const dir = res.stdout
            global.Server.BrewHome = dir
            handleBrewCheck()
            spawnAsync('git', [
              'config',
              '--global',
              '--add',
              'safe.directory',
              join(dir, 'Library/Taps/homebrew/homebrew-core')
            ])
              .then(() => {
                return spawnAsync('git', [
                  'config',
                  '--global',
                  '--add',
                  'safe.directory',
                  join(dir, 'Library/Taps/homebrew/homebrew-cask')
                ])
              })
              .then()
              .catch()
          })
          .catch((e: Error) => {
            handleBrewCheck(e)
            AppLog.debug(`[checkBrewOrPort][brew --repo][error]: ${e.toString()}`)
            console.log('brew --repo err: ', e)
          })
        spawnAsync('brew', ['--cellar'])
          .then((res) => {
            const dir = res.stdout
            console.log('brew --cellar: ', res)
            global.Server.BrewCellar = dir
            handleBrewCheck()
          })
          .catch((e: Error) => {
            handleBrewCheck(e)
            AppLog.debug(`[checkBrewOrPort][brew --cellar][error]: ${e.toString()}`)
            console.log('brew --cellar err: ', e)
          })
      })
      .catch((e: Error) => {
        handleBrewCheck(e)
        AppLog.debug(`[checkBrewOrPort][which brew][error]: ${e.toString()}`)
        console.log('which brew e: ', e)
      })

    spawnAsync('which', ['port'])
      .then((res) => {
        global.Server.MacPorts = res.stdout
        this.windowManager.sendCommandTo(
          this.mainWindow!,
          'APP-Update-Global-Server',
          'APP-Update-Global-Server',
          JSON.parse(JSON.stringify(global.Server))
        )
      })
      .catch((e: Error) => {
        console.log('which port e: ', e)
      })
  }

  initServerDir() {
    console.log('userData: ', app.getPath('userData'))
    const runpath = app.getPath('userData').replace('Application Support/', '')
    this.setProxy()
    global.Server.UserHome = app.getPath('home')
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
    global.Server.Arch = arch() === 'arm64' ? 'arm64' : 'x86_64'
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
    this.checkBrewOrPort()
    AppLog.init(this.mainWindow)
    win.once('ready-to-show', () => {
      this.isReady = true
      this.emit('ready')
      this.windowManager.sendCommandTo(
        win,
        'APP-Ready-To-Show',
        'APP-Ready-To-Show',
        JSON.parse(JSON.stringify(global.Server))
      )
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
      DnsServerManager.close()
      SiteSuckerManager.destory()
      this.forkManager?.destory()
      await this.stopServer()
    } catch (e) {
      console.log('stop e: ', e)
    }
  }

  async stopServerByPid() {
    const TERM: Array<string> = []
    const INT: Array<string> = []
    const all: any = await Helper.send('tools', 'processList')
    const find = all.filter((p: any) => {
      return (
        (p.COMMAND.includes(global.Server.BaseDir!) ||
          p.COMMAND.includes(global.Server.AppDir!) ||
          p.COMMAND.includes('redis-server')) &&
        !p.COMMAND.includes(' grep ') &&
        !p.COMMAND.includes(' /bin/sh -c') &&
        !p.COMMAND.includes('/Contents/MacOS/') &&
        !p.COMMAND.startsWith('/bin/bash ') &&
        !p.COMMAND.includes('brew.rb ') &&
        !p.COMMAND.includes(' install ') &&
        !p.COMMAND.includes(' uninstall ') &&
        !p.COMMAND.includes(' link ') &&
        !p.COMMAND.includes(' unlink ')
      )
    })
    if (find.length === 0) {
      return
    }
    for (const item of find) {
      if (
        item.COMMAND.includes('mysqld') ||
        item.COMMAND.includes('mariadbd') ||
        item.COMMAND.includes('mongod') ||
        item.COMMAND.includes('rabbit') ||
        item.COMMAND.includes('org.apache.catalina') ||
        item.COMMAND.includes('elasticsearch')
      ) {
        TERM.push(item.PID)
      } else {
        INT.push(item.PID)
      }
    }
    if (TERM.length > 0) {
      const sig = '-TERM'
      try {
        await Helper.send('tools', 'kill', sig, TERM)
      } catch (e) {}
    }
    if (INT.length > 0) {
      const sig = '-INT'
      try {
        await Helper.send('tools', 'kill', sig, INT)
      } catch (e) {}
    }
  }

  async stopHostService() {
    if (this.hostServicePID.size === 0) {
      return
    }
    const arr = Array.from(this.hostServicePID).map((pid) => {
      return new Promise(async (resolve) => {
        const TERM: Array<string> = []
        const INT: Array<string> = []
        let pids: PItem[] = []
        try {
          const plist: any = await Helper.send('tools', 'processList')
          pids = ProcessListByPid(pid, plist)
        } catch (e) {}
        if (pids.length > 0) {
          pids.forEach((item) => {
            if (
              item.COMMAND.includes('mysqld') ||
              item.COMMAND.includes('mariadbd') ||
              item.COMMAND.includes('mongod') ||
              item.COMMAND.includes('rabbit') ||
              item.COMMAND.includes('org.apache.catalina') ||
              item.COMMAND.includes('elasticsearch')
            ) {
              TERM.push(item.PID)
            } else {
              INT.push(item.PID)
            }
          })
          if (TERM.length > 0) {
            const sig = '-TERM'
            try {
              await Helper.send('tools', 'kill', sig, TERM)
            } catch (e) {}
          }
          if (INT.length > 0) {
            const sig = '-INT'
            try {
              await Helper.send('tools', 'kill', sig, INT)
            } catch (e) {}
          }
        }
        resolve(true)
      })
    })
    try {
      await Promise.all(arr)
    } catch (e) {}
  }

  async stopServer() {
    NodePTY.exitAllPty()
    await this.stopServerByPid()
    await this.stopHostService()
    try {
      let hosts = readFileSync('/private/etc/hosts', 'utf-8')
      const x = hosts.match(/(#X-HOSTS-BEGIN#)([\s\S]*?)(#X-HOSTS-END#)/g)
      if (x && x.length > 0) {
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
    this.stop().then(() => {
      app.relaunch()
      app.exit()
    })
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
      this.stop().then(() => {
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
      this.menuManager.updateMenuStates(visibleStates, enabledStates, checkedStates)
    })

    this.on('application:window-size-change', (size) => {
      console.log('application:window-size-change: ', size)
      this.windowManager
        ?.getFocusedWindow()
        ?.setSize(Math.round(size.width), Math.round(size.height), true)
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
    this.emit(command, ...args)
    let window
    const callBack = (info: any) => {
      const win = this.mainWindow!
      this.windowManager.sendCommandTo(win, command, key, info)
      console.log('callBack info: ', info)
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
      const exclude = ['app', 'version']
      const module = command.replace('app-fork:', '')
      const openApps: Record<string, string> = {
        VSCode: 'vscode://file/',
        PhpStorm: 'phpstorm://open?file=',
        WebStorm: 'webstorm://open?file=',
        IntelliJ: 'idea://open?file=',
        HBuilderX: 'hbuilderx://open?file=',
        Sublime: 'subl://open?url=file://',
        PyCharm: 'pycharm://open?file=',
        RubyMine: 'rubymine://open?file=',
        CLion: 'clion://open?file=',
        GoLand: 'goland://open?file=',
        RustRover: 'rustrover://open?file=',
        Rider: 'rider://open?file=',
        AppCode: 'appcode://open?file=',
        DataGrip: 'datagrip://open?file=',
        AndroidStudio: 'androidstudio://open?file='
      }
      if (module === 'tools' && args?.[0] === 'openPathByApp' && !!openApps?.[args?.[2]]) {
        const url = `${openApps[args[2]]}${encodeURIComponent(args[1])}`
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
      const doFork = () => {
        this.setProxy()
        global.Server.Lang = this.configManager?.getConfig('setup.lang') ?? 'en'
        global.Server.ForceStart = this.configManager?.getConfig('setup.forceStart')
        global.Server.Licenses = this.configManager?.getConfig('setup.license')
        if (!Object.keys(AppAllLang).includes(global.Server.Lang!)) {
          global.Server.LangCustomer = this.customerLang[global.Server.Lang!]
        }
        this.forkManager
          ?.send(module, ...args)
          .on(callBack)
          .then(callBack)
      }
      const doNotice = () => {
        if (this.helpCheckSuccessNoticed) {
          return
        }
        this.helpCheckSuccessNoticed = true
        this.windowManager.sendCommandTo(
          this.mainWindow!,
          'APP-Helper-Check-Success',
          'APP-Helper-Check-Success',
          true
        )
      }
      if (exclude.includes(module)) {
        doFork()
      } else {
        if (AppHelper.state === 'normal') {
          const helperVersion = this.configManager?.getConfig('helper.version') ?? 0
          if (is.production() && helperVersion !== AppHelper.version) {
            AppHelper.initHelper()
              .then(() => {
                doNotice()
                this.configManager.setConfig('helper.version', AppHelper.version)
                doFork()
              })
              .catch(() => {
                this.windowManager.sendCommandTo(this.mainWindow!, command, key, {
                  code: 1,
                  msg: I18nT('menu.needInstallHelper')
                })
              })
            return
          }

          AppHelper.check()
            .then(() => {
              doNotice()
              doFork()
            })
            .catch(() => {
              AppHelper.initHelper()
                .then(() => {
                  doNotice()
                  doFork()
                })
                .catch(() => {
                  this.windowManager.sendCommandTo(this.mainWindow!, command, key, {
                    code: 1,
                    msg: I18nT('menu.needInstallHelper')
                  })
                })
            })
        } else if (AppHelper.state === 'installed') {
          this.windowManager.sendCommandTo(this.mainWindow!, command, key, {
            code: 1,
            msg: I18nT('menu.waitHelper')
          })
        } else {
          this.windowManager.sendCommandTo(this.mainWindow!, command, key, {
            code: 1,
            msg: I18nT('menu.needInstallHelper')
          })
        }
      }
      return
    }
    switch (command) {
      case 'app:password-check':
        const pass = args?.[0] ?? ''
        execPromiseRoot([`-k`, 'echo', 'PhpWebStudy'], undefined, pass)
          .then(() => {
            this.configManager.setConfig('password', pass)
            global.Server.Password = pass
            this.windowManager.sendCommandTo(this.mainWindow!, command, key, {
              code: 0,
              data: pass
            })
          })
          .catch((err: Error) => {
            console.log('err: ', err)
            this.windowManager.sendCommandTo(this.mainWindow!, command, key, {
              code: 1,
              msg: err
            })
          })
        return
      case 'APP:Auto-Hide':
        this?.mainWindow?.hide()
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
        this.trayManager.iconChange(args?.[0] ?? false)
        break
      case 'application:save-preference':
        this.windowManager.sendCommandTo(this.mainWindow!, command, key)
        break
      case 'APP:Tray-Store-Sync':
        this.windowManager.sendCommandTo(this.trayWindow!, command, command, args?.[0])
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
      case 'app-check-brewport':
        this.checkBrewOrPort()
        this.windowManager.sendCommandTo(this.mainWindow!, command, key, true)
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
      case 'DNS:start':
        if (DnsServerManager.running) {
          this.windowManager.sendCommandTo(this.mainWindow!, command, key, true)
          return
        }
        DnsServerManager.start()
          .then(() => {
            this.windowManager.sendCommandTo(this.mainWindow!, command, key, true)
          })
          .catch((e) => {
            this.windowManager.sendCommandTo(this.mainWindow!, command, key, e.toString())
          })
        break
      case 'DNS:stop':
        DnsServerManager.close()
        this.windowManager.sendCommandTo(this.mainWindow!, command, key, true)
        break
      case 'app-sitesucker-run':
        const url = args[0]
        SiteSuckerManager.show(url)
        break
      case 'app-sitesucker-setup':
        const setup = this.configManager.getConfig('tools.siteSucker')
        this.windowManager.sendCommandTo(this.mainWindow!, command, key, setup)
        return
      case 'app-sitesucker-setup-save':
        this.configManager.setConfig('tools.siteSucker', args[0])
        this.windowManager.sendCommandTo(this.mainWindow!, command, key, true)
        SiteSuckerManager.updateConfig(args[0])
        return
      case 'app-customer-lang-update':
        const langKey = args[0]
        const langValue = args[1]
        this.customerLang[langKey] = langValue
        AppI18n().global.setLocaleMessage(langKey, langValue)
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
