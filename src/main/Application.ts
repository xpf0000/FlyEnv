import { EventEmitter } from 'events'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import is from 'electron-is'
import logger from './core/Logger'
import ConfigManager from './core/ConfigManager'
import WindowManager from './ui/WindowManager'
import MenuManager from './ui/MenuManager'
import UpdateManager from './core/UpdateManager'
import { existsSync, writeFileSync } from 'fs'
import TrayManager from './ui/TrayManager'
import { getLanguage, isArmArch, mkdirp, readFile, readFileFixed, writeFile } from './utils'
import { AppI18n, I18nT, AppAllLang } from '@lang/index'
import type { PtyItem } from './type'
import SiteSuckerManager from './ui/SiteSucker'
import { ForkManager } from './core/ForkManager'
import { execPromiseSudo, spawnPromiseWithEnv } from '@shared/child-process'
import { arch, userInfo } from 'node:os'
import NodePTY from './core/NodePTY'
import HttpServer from './core/HttpServer'
import AppHelper from './core/AppHelper'
import ScreenManager from './core/ScreenManager'
import AppLog from './core/AppLog'
import compressing from 'compressing'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import AppNodeFnManager, { type AppNodeFn } from './core/AppNodeFn'
import { isLinux, isMacOS, isWindows } from '@shared/utils'
import { HostsFileLinux, HostsFileMacOS, HostsFileWindows } from '@shared/PlatFormConst'
import ServiceProcessManager from './core/ServiceProcess'
import { AppHelperCheck, AppHelperRoleFix } from '@shared/AppHelperCheck'
import Helper from '../fork/Helper'

const __dirname = dirname(fileURLToPath(import.meta.url))

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
  helpCheckSuccessNoticed: boolean = false
  pty: Partial<Record<string, PtyItem>> = {}
  customerLang: Record<string, any> = {}

  constructor() {
    super()
    AppNodeFnManager.customerLang = this.customerLang
    AppNodeFnManager.nativeTheme_watch()
    global.Server = {
      Local: `${app.getLocale().split('-').join('_')}.UTF-8`
    } as any
    this.isReady = false
    this.configManager = new ConfigManager()
    AppNodeFnManager.configManager = this.configManager
    this.initLang()
    this.menuManager = new MenuManager()
    this.menuManager.setup()
    this.initServerDir()
    this.windowManager = new WindowManager({
      configManager: this.configManager
    })
    this.initWindowManager()
    ScreenManager.initWatch()
    this.trayManager = new TrayManager()
    this.initUpdaterManager()
    this.handleCommands()
    this.handleIpcMessages()
    this.initAppHelper()
    this.initForkManager()
    SiteSuckerManager.setCallback((link: any) => {
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
    if (!is.dev()) {
      this.handleCommand('app-fork:app', 'App-Start', 'start', app.getVersion())
    }
    NodePTY.onSendCommand((command: string, ...args: any) => {
      this.windowManager.sendCommandTo(this.mainWindow!, command, ...args)
    })
    console.log('Application inited !!!')
  }

  initAppHelper() {
    AppHelperRoleFix().catch()
    Helper.appHelper = AppHelper
    AppHelper.onStatusMessage((flag) => {
      if (!this?.mainWindow) {
        return
      }
      const key = 'APP-FlyEnv-Helper-Notice'
      switch (flag) {
        case 'needInstall':
          this.windowManager.sendCommandTo(this.mainWindow!, key, key, {
            code: 1,
            msg: I18nT('menu.needInstallHelper')
          })
          break
        case 'installed':
          this.windowManager.sendCommandTo(this.mainWindow!, key, key, {
            code: 2,
            msg: I18nT('menu.waitHelper')
          })
          break
        case 'installing':
          this.windowManager.sendCommandTo(this.mainWindow!, key, key, {
            code: 2,
            msg: I18nT('menu.helperInstalling')
          })
          break
        case 'installFaild':
          this.windowManager.sendCommandTo(this.mainWindow!, key, key, {
            code: 1,
            status: 'installFaild',
            msg: I18nT('menu.helperInstallFailTips')
          })
          break
        case 'checkSuccess':
          this.windowManager.sendCommandTo(this.mainWindow!, key, key, {
            code: 0,
            msg: I18nT('menu.helperInstallSuccessTips')
          })
          break
      }
    })
    AppHelper.onSuduExecSuccess(() => {
      this.makeServerDir()
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
    this.forkManager = new ForkManager(resolve(__dirname, './fork.mjs'))
    this.forkManager.on(({ key, info }: { key: string; info: any }) => {
      if (key === 'App-Need-Init-FlyEnv-Helper') {
        AppHelper.initHelper().catch()
        return
      }
      this.windowManager.sendCommandTo(this.mainWindow!, key, key, info)
    })
    ServiceProcessManager.forkManager = this.forkManager
  }

  initTrayManager() {
    this.trayManager.on('style-changed', (style: 'modern' | 'classic') => {
      console.log('style-changed !!!', style)
      if (style === 'modern') {
        if (!this?.trayWindow) {
          this.trayWindow = this.windowManager.openTrayWindow()
          AppNodeFnManager.trayWindow = this.trayWindow
          this.trayWindow.webContents.once('dom-ready', () => {
            console.log('DOM 已准备好')
            const command = 'APP:Tray-Store-Sync'
            this.windowManager.sendCommandTo(
              this.trayWindow!,
              command,
              command,
              this.trayManager.status
            )
            this.trayManager.addModernStyleListener()
          })
        }
      } else {
        this.windowManager.destroyWindow('tray')
        this.trayWindow = undefined
        AppNodeFnManager.trayWindow = undefined
      }
    })
    this.trayManager.on('click', (x, y, poperX) => {
      if (!this?.trayWindow?.isVisible() || this?.trayWindow?.isFullScreen()) {
        this?.trayWindow?.setPosition(Math.round(x), Math.round(y))
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

    this.trayManager.on('double-click', () => {
      this.show('index')
    })

    this.trayManager.on(
      'action',
      (action: 'groupDo' | 'switchChange' | 'show' | 'exit', typeFlag?: string) => {
        console.log('TrayManager action: ', action, typeFlag)
        if (action === 'exit') {
          this.emit('application:exit')
        } else if (action === 'show') {
          this.emit('application:show', 'index')
        } else if (action === 'groupDo') {
          this.windowManager.sendCommandTo(
            this.mainWindow!,
            'APP:Tray-Command',
            'APP:Tray-Command',
            'groupDo'
          )
        } else if (action === 'switchChange') {
          this.windowManager.sendCommandTo(
            this.mainWindow!,
            'APP:Tray-Command',
            'APP:Tray-Command',
            'switchChange',
            typeFlag
          )
        }
      }
    )

    const style = this.configManager.getConfig('setup.trayMenuBarStyle') ?? 'modern'
    this.trayManager.setStyle(style)
  }

  checkBrewOrPort() {
    if (isMacOS()) {
      const handleBrewCheck = (error?: Error) => {
        const brewBin = isArmArch() ? '/opt/homebrew/bin/brew' : '/usr/local/Homebrew/bin/brew'
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
      spawnPromiseWithEnv('which', ['brew'])
        .then((res) => {
          console.log('which brew: ', res)
          spawnPromiseWithEnv('brew', ['--repo'])
            .then((res) => {
              console.log('brew --repo: ', res)
              const dir = res.stdout
              global.Server.BrewHome = dir
              handleBrewCheck()
              spawnPromiseWithEnv('git', [
                'config',
                '--global',
                '--add',
                'safe.directory',
                join(dir, 'Library/Taps/homebrew/homebrew-core')
              ])
                .then(() => {
                  return spawnPromiseWithEnv('git', [
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
          spawnPromiseWithEnv('brew', ['--cellar'])
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

      spawnPromiseWithEnv('which', ['port'])
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
    } else if (isLinux()) {
      /**
       * Linux homebrew check
       */
      const uinfo = userInfo()
      const handleBrewCheck = (error?: Error) => {
        const brewBin = [
          join(uinfo.homedir, '.linuxbrew/bin/brew'),
          '/home/linuxbrew/.linuxbrew/bin/brew'
        ]
        brewBin.forEach((s) => {
          if (existsSync(s)) {
            global.Server.BrewBin = s
          }
        })
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
      spawnPromiseWithEnv('which', ['brew'])
        .then((res) => {
          console.log('which brew: ', res)
          spawnPromiseWithEnv('brew', ['--repo'])
            .then((res) => {
              console.log('brew --repo: ', res)
              const dir = res.stdout
              global.Server.BrewHome = dir
              handleBrewCheck()
              spawnPromiseWithEnv('git', [
                'config',
                '--global',
                '--add',
                'safe.directory',
                join(dir, 'Library/Taps/homebrew/homebrew-core')
              ])
                .then(() => {
                  return spawnPromiseWithEnv('git', [
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
          spawnPromiseWithEnv('brew', ['--cellar'])
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
    }
  }

  makeServerDir() {
    mkdirp(global.Server.BaseDir!).then().catch()
    mkdirp(global.Server.AppDir!).then().catch()
    mkdirp(global.Server.NginxDir!).then().catch()
    mkdirp(global.Server.PhpDir!).then().catch()
    mkdirp(global.Server.MysqlDir!).then().catch()
    mkdirp(global.Server.MariaDBDir!).then().catch()
    mkdirp(global.Server.ApacheDir!).then().catch()
    mkdirp(global.Server.MemcachedDir!).then().catch()
    mkdirp(global.Server.RedisDir!).then().catch()
    mkdirp(global.Server.MongoDBDir!).then().catch()
    mkdirp(global.Server.Cache!).then().catch()
    if (!isWindows()) {
      const httpdcong = join(global.Server.ApacheDir!, 'common/conf/')
      mkdirp(httpdcong).then().catch()

      const ngconf = join(global.Server.NginxDir!, 'common/conf/nginx.conf')
      if (!existsSync(ngconf)) {
        compressing.zip
          .uncompress(join(__static, 'zip/nginx-common.zip'), global.Server.NginxDir!)
          .then(() => {
            readFile(ngconf, 'utf-8').then((content: string) => {
              content = content
                .replace(/#PREFIX#/g, global.Server.NginxDir!)
                .replace('#VHostPath#', join(global.Server.BaseDir!, 'vhost/nginx'))
              writeFile(ngconf, content).then()
              writeFile(
                join(global.Server.NginxDir!, 'common/conf/nginx.conf.default'),
                content
              ).then()
            })
          })
          .catch()
      }
    }
  }

  initServerDir() {
    console.log('userData: ', app.getPath('userData'))
    let runpath = ''
    if (isMacOS()) {
      runpath = app.getPath('userData').replace('Application Support/', '')
    } else if (isWindows()) {
      runpath = resolve(app.getPath('exe'), '../../PhpWebStudy-Data').split('\\').join('/')
      if (is.dev()) {
        runpath = resolve(__static, '../../../data')
      }
    } else {
      runpath = resolve(app.getPath('userData'), '../FlyEnv')
    }
    this.setProxy()
    global.Server.UserHome = app.getPath('home')
    global.Server.isArmArch = isArmArch()
    global.Server.BaseDir = join(runpath, 'server')
    global.Server.AppDir = join(runpath, 'app')
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
    global.Server.Cache = join(runpath, 'server/cache')
    global.Server.Static = __static
    global.Server.Arch = arch() === 'x64' ? 'x86_64' : 'arm64'
    global.Server.Password = this.configManager.getConfig('password')
    global.Server.isMacOS = isMacOS()
    global.Server.isLinux = isLinux()
    global.Server.isWindows = isWindows()
    this.makeServerDir()
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
    if (this.mainWindow) {
      return
    }
    this.mainWindow = win
    AppNodeFnManager.mainWindow = win
    console.log('showPage checkBrewOrPort !!!')
    this.checkBrewOrPort()
    AppLog.init(this.mainWindow)
    this.windowManager.sendCommandTo(
      win,
      'APP-Update-Global-Server',
      'APP-Update-Global-Server',
      JSON.parse(JSON.stringify(global.Server))
    )
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
    this.initTrayManager()
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
      SiteSuckerManager.destroy()
      this.forkManager?.destroy()
      this.trayManager?.destroy()
      await this.stopServer()
    } catch (e) {
      console.log('stop e: ', e)
    }
  }

  async stopServer() {
    NodePTY.exitAllPty()
    try {
      await ServiceProcessManager.stop()
    } catch (e) {
      console.log('stopServerByPid e: ', e)
    }
    let file = ''
    if (isMacOS()) {
      file = HostsFileMacOS
    } else if (isWindows()) {
      file = HostsFileWindows
    } else if (isLinux()) {
      file = HostsFileLinux
    }
    try {
      let hosts = await readFileFixed(file)
      const x = hosts.match(/(#X-HOSTS-BEGIN#)([\s\S]*?)(#X-HOSTS-END#)/g)
      if (x && x.length > 0) {
        hosts = hosts.replace(x[0], '')
        writeFileSync(file, hosts)
      }
    } catch {}
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

  handleCommands() {
    this.on('application:save-preference', (config) => {
      console.log('application:save-preference.config====>', config)
      this.configManager.setConfig(config)
      this.menuManager.rebuild()
      this.trayManager.setStyle(config?.setup?.trayMenuBarStyle ?? 'modern')
      this.setProxy()
    })

    this.on('application:relaunch', () => {
      this.relaunch()
    })

    this.on('application:exit', () => {
      console.log('application:exit !!!!!!')
      this?.mainWindow?.hide()
      this?.trayWindow?.hide()
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
    if (this.mainWindow) {
      this.windowManager.sendCommandTo(
        this.mainWindow,
        'APP-Update-Global-Server',
        'APP-Update-Global-Server',
        JSON.parse(JSON.stringify(global.Server))
      )
    }
  }

  handleCommand(command: string, key: string, ...args: any) {
    this.emit(command, ...args)
    let window
    let module: string = ''
    const callback = (info: any) => {
      const win = this.mainWindow!
      this.windowManager.sendCommandTo(win, command, key, info)
      console.log('callback info: ', info)
      if (info?.data?.['APP-Service-Start-PID']) {
        const item = args[1]
        ServiceProcessManager.addPid(module, info.data['APP-Service-Start-PID'], item)
      } else if (info?.data?.['APP-Service-Stop-PID']) {
        const arr: string[] = info.data['APP-Service-Stop-PID'] as any
        ServiceProcessManager.delPid(module, arr)
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
      module = command.replace('app-fork:', '')
      let openApps: Record<string, string> = {}
      if (isMacOS() || isLinux()) {
        openApps = {
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
      } else if (isWindows()) {
        openApps = {
          VSCode: 'vscode://file/'
        }
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
          .on(callback)
          .then(callback)
      }

      doFork()
      return
    }

    switch (command) {
      case 'APP:FlyEnv-Helper-Command':
        AppHelper.command().then((res) => {
          this.windowManager.sendCommandTo(this.mainWindow!, command, key, res)
        })
        break
      case 'APP:FlyEnv-Helper-Check':
        AppHelperCheck()
          .then(() => {
            this.windowManager.sendCommandTo(this.mainWindow!, command, key, {
              code: 0,
              data: true
            })
          })
          .catch(() => {
            this.windowManager.sendCommandTo(this.mainWindow!, command, key, {
              code: 1,
              data: false
            })
          })
        break
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
      case 'app:password-check':
        {
          const pass = args?.[0] ?? ''
          execPromiseSudo([`-k`, 'echo', 'PhpWebStudy'], undefined, pass)
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
        }
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
        this.trayManager.menuChange(args?.[0])
        if (this.trayWindow) {
          this.windowManager.sendCommandTo(this.trayWindow!, command, command, args?.[0])
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
        this.windowManager.sendCommandTo(this.mainWindow!, command, key, true)
        break
      case 'application:about':
        this.windowManager.sendCommandTo(this.mainWindow!, command, key)
        break
      case 'app-check-brewport':
        console.log('app-check-brewport checkBrewOrPort !!!')
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
        NodePTY.exec(args[0], args[1], args[2], command, key)
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
        {
          const url = args[0]
          SiteSuckerManager.show(url)
        }
        break
      case 'app-sitesucker-setup':
        {
          const setup = this.configManager.getConfig('tools.siteSucker')
          this.windowManager.sendCommandTo(this.mainWindow!, command, key, setup)
        }
        return
      case 'app-sitesucker-setup-save':
        this.configManager.setConfig('tools.siteSucker', args[0])
        this.windowManager.sendCommandTo(this.mainWindow!, command, key, true)
        SiteSuckerManager.updateConfig(args[0])
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
