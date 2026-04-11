import { EventEmitter } from 'events'
import { app, BrowserWindow, globalShortcut, session } from 'electron'
import is from 'electron-is'
import WindowManager from './ui/WindowManager'
import MenuManager from './ui/MenuManager'
import TrayManager from './ui/TrayManager'
import { getLanguage, getLocale, logger } from './utils'
import { AppI18n, I18nT } from '@lang/index'
import SiteSuckerManager from './ui/SiteSucker'
import { ForkManager } from './core/ForkManager'
import NodePTY from './core/NodePTY'
import AppHelper from './core/AppHelper'
import ScreenManager from './core/ScreenManager'
import AppLog from './core/AppLog'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import AppNodeFnManager from './core/AppNodeFn'
import ServiceProcessManager from './core/ServiceProcess'
import { AppHelperRoleFix } from '@shared/AppHelperCheck'
import Helper from '../fork/Helper'
import OAuth from './core/OAuth'
import ConfigManager from './core/ConfigManager'
import ServerManager from './core/ServerManager'
import IPCHandler from './core/IPCHandler'
import { CheckBrewOrPort } from './utils/CheckBrew'
import { MakeServerDir } from './utils/ServerPath'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default class Application extends EventEmitter {
  isReady: boolean = false
  configManager: ConfigManager
  menuManager: MenuManager
  trayManager: TrayManager
  windowManager: WindowManager
  mainWindow?: BrowserWindow
  trayWindow?: BrowserWindow
  forkManager?: ForkManager

  // 新提取的管理器
  private serverManager: ServerManager
  private ipcHandler: IPCHandler

  constructor() {
    super()
    this.setupInitialConfig()
    this.configManager = new ConfigManager()
    this.serverManager = new ServerManager(this.configManager)

    AppNodeFnManager.nativeTheme_watch()
    AppNodeFnManager.configManager = this.configManager

    this.initLang()
    this.menuManager = new MenuManager()
    this.menuManager.setup()
    this.serverManager.initServerDir()

    this.windowManager = new WindowManager({
      configManager: this.configManager
    })
    this.initWindowManager()

    ScreenManager.initWatch()
    this.trayManager = new TrayManager()
    this.windowManager.trayManager = this.trayManager

    // 初始化 IPC 处理器
    this.ipcHandler = new IPCHandler({
      configManager: this.configManager,
      windowManager: this.windowManager,
      trayManager: this.trayManager,
      serverManager: this.serverManager,
      appNodeFnManager: AppNodeFnManager,
      siteSuckerManager: SiteSuckerManager
    })

    this.setupEventHandlers()
    this.ipcHandler.init()
    this.initFontAccessPermission()
    this.initAppHelper()
    this.initForkManager()
    this.setupSiteSuckerCallback()
    this.setupNodePTYCallback()

    if (!is.dev()) {
      this.ipcHandler.handleCommand('app-fork:app', 'App-Start', 'start', app.getVersion())
    }

    console.log('Application inited !!!')
  }

  /**
   * 设置初始全局配置
   */
  private setupInitialConfig() {
    global.Server = {
      Local: getLocale(),
      APPVersion: app.getVersion()
    } as any
    this.isReady = false
  }

  /**
   * 初始化窗口管理器事件
   */
  private initWindowManager() {
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

  /**
   * 存储窗口状态
   */
  private storeWindowState(data: any = {}) {
    const state = this.configManager.getConfig('window-state', {})
    const { page, bounds } = data
    const newState = {
      ...state,
      [page]: bounds
    }
    this.configManager.setConfig('window-state', newState)
  }

  /**
   * 初始化语言
   */
  private initLang() {
    const lang = getLanguage(this.configManager.getConfig('setup.lang'))
    if (lang) {
      this.configManager.setConfig('setup.lang', lang)
      AppI18n(lang)
      global.Server.Lang = lang
    }
  }

  /**
   * 初始化 FlyEnv Helper
   */
  private initAppHelper() {
    AppHelperRoleFix().catch()
    Helper.appHelper = AppHelper

    AppHelper.onStatusMessage((flag) => {
      if (!this?.mainWindow) {
        return
      }
      this.handleHelperStatusMessage(flag)
    })

    AppHelper.onSuduExecSuccess(() => {
      MakeServerDir()
    })
  }

  /**
   * 处理 Helper 状态消息
   */
  private handleHelperStatusMessage(flag: string) {
    const key = 'APP-FlyEnv-Helper-Notice'
    const messages: Record<string, { code: number; msg: string; status?: string }> = {
      needInstall: { code: 1, msg: I18nT('menu.needInstallHelper') },
      installed: { code: 2, msg: I18nT('menu.waitHelper') },
      installing: { code: 2, msg: I18nT('menu.helperInstalling') },
      installFaild: { code: 1, msg: I18nT('menu.helperInstallFailTips'), status: 'installFaild' },
      checkSuccess: { code: 0, msg: I18nT('menu.helperInstallSuccessTips') }
    }

    const message = messages[flag]
    if (message) {
      this.windowManager.sendCommandTo(this.mainWindow!, key, key, message)
    }
  }

  /**
   * 初始化 Fork 管理器
   */
  private initForkManager() {
    this.forkManager = new ForkManager(join(__dirname, './fork.mjs'))
    this.forkManager.on(({ key, info }: { key: string; info: any }) => {
      if (key === 'App-Need-Init-FlyEnv-Helper') {
        AppHelper.needInstall()
        return
      }
      this.windowManager.sendCommandTo(this.mainWindow!, key, key, info)
    })
    ServiceProcessManager.forkManager = this.forkManager

    // 更新 IPC 处理器的 forkManager 引用
    this.ipcHandler.updateDependencies({ forkManager: this.forkManager })
  }

  /**
   * 设置 SiteSucker 回调
   */
  private setupSiteSuckerCallback() {
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
  }

  /**
   * 设置 NodePTY 回调
   */
  private setupNodePTYCallback() {
    NodePTY.onSendCommand((command: string, ...args: any) => {
      this.windowManager.sendCommandTo(this.mainWindow!, command, ...args)
    })
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers() {
    // 应用命令事件
    this.ipcHandler.on('application:save-preference', (config) => {
      console.log('application:save-preference.config====>', config)
      this.configManager.setConfig(config)
      this.menuManager.rebuild()
      this.trayManager.setStyle(config?.setup?.trayMenuBarStyle ?? 'modern')
      this.serverManager.setProxy()
    })

    this.ipcHandler.on('application:relaunch', () => {
      this.relaunch()
    })

    this.ipcHandler.on('application:exit', () => {
      console.log('application:exit !!!!!')
      this?.mainWindow?.hide()
      this?.trayWindow?.hide()
      this.stop().then(() => {
        app.exit()
        process.exit(0)
      })
    })

    this.ipcHandler.on('application:show', (page) => {
      this.show(page)
    })

    this.ipcHandler.on('application:hide', (page) => {
      this.hide(page)
    })

    this.ipcHandler.on('application:reset', () => {
      this.configManager.reset()
      this.relaunch()
    })

    this.ipcHandler.on(
      'application:change-menu-states',
      (visibleStates, enabledStates, checkedStates) => {
        this.menuManager.updateMenuStates(visibleStates, enabledStates, checkedStates)
      }
    )

    this.ipcHandler.on('application:window-size-change', (size) => {
      console.log('application:window-size-change: ', size)
      this.windowManager
        ?.getFocusedWindow()
        ?.setSize(Math.round(size.width), Math.round(size.height), true)
    })

    this.ipcHandler.on('application:window-open-new', (page) => {
      console.log('application:window-open-new: ', page)
    })
  }

  /**
   * 初始化字体访问权限
   */
  private initFontAccessPermission() {
    session.defaultSession.setPermissionCheckHandler((webContents, permission: any) => {
      if (permission === 'local-fonts') {
        return true
      }
      return true
    })
    session.defaultSession.setPermissionRequestHandler((webContents, permission: any, callback) => {
      if (permission === 'local-fonts') {
        callback(true)
        return
      }
      callback(true)
    })
  }

  // ===== 窗口管理 =====

  start(page: string) {
    this.showPage(page)
    this.mainWindow?.setIgnoreMouseEvents(false)
  }

  showPage(page: string) {
    if (this.mainWindow) {
      this.mainWindow.show()
      return
    }

    const win = this.windowManager.openWindow(page)
    this.mainWindow = win
    AppNodeFnManager.mainWindow = win

    console.log('showPage checkBrewOrPort !!!')
    CheckBrewOrPort(() => {
      this.sendGlobalServerUpdate()
    })

    AppLog.init(this.mainWindow)
    this.sendGlobalServerUpdate()

    win.once('ready-to-show', () => {
      this.isReady = true
      this.emit('ready')
      this.windowManager.sendCommandTo(
        win,
        'APP-Ready-To-Show',
        'APP-Ready-To-Show',
        this.serverManager.getGlobalServer()
      )

      global.Server.UserUUID = this.configManager?.getConfig('setup.user_uuid')
      OAuth.fetchUser()
        .then((res) => {
          this.windowManager.sendCommandTo(
            win,
            'APP-User-UUID-Need-Update',
            'APP-User-UUID-Need-Update',
            JSON.parse(JSON.stringify(res))
          )
        })
        .catch()
    })

    ScreenManager.initWindow(win)
    ScreenManager.repositionAllWindows()
    this.initTrayManager()

    // 更新 IPC 处理器的窗口引用
    this.ipcHandler.updateDependencies({
      mainWindow: this.mainWindow,
      trayWindow: this.trayWindow
    })
  }

  /**
   * 发送全局服务器配置更新
   */
  private sendGlobalServerUpdate() {
    this.windowManager.sendCommandTo(
      this.mainWindow!,
      'APP-Update-Global-Server',
      'APP-Update-Global-Server',
      this.serverManager.getGlobalServer()
    )
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

  // ===== 托盘管理 =====

  private initTrayManager() {
    this.trayManager.on('style-changed', (style: 'modern' | 'classic') => {
      console.log('style-changed !!!', style)
      if (style === 'modern') {
        this.setupModernTray()
      } else {
        this.destroyModernTray()
      }
    })

    this.trayManager.on('click', (x, y, poperX, show) => {
      this.handleTrayClick(x, y, poperX, show)
    })

    this.trayManager.on('double-click', () => {
      this.show('index')
    })

    this.trayManager.on(
      'action',
      (action: 'groupDo' | 'switchChange' | 'show' | 'exit', typeFlag?: string) => {
        this.handleTrayAction(action, typeFlag)
      }
    )

    const style = this.configManager.getConfig('setup.trayMenuBarStyle') ?? 'modern'
    this.trayManager.setStyle(style)
  }

  private setupModernTray() {
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

      // 更新 IPC 处理器的 trayWindow 引用
      this.ipcHandler.updateDependencies({ trayWindow: this.trayWindow })
    }
  }

  private destroyModernTray() {
    this.windowManager.destroyWindow('tray')
    this.trayWindow = undefined
    AppNodeFnManager.trayWindow = undefined
    this.ipcHandler.updateDependencies({ trayWindow: undefined })
  }

  private handleTrayClick(x: number, y: number, poperX: number, show: boolean) {
    if (this?.trayWindow && show) {
      this?.trayWindow?.setPosition(Math.round(x), Math.round(y))
      this?.trayWindow?.setAlwaysOnTop(true, 'screen-saver')
      this?.trayWindow?.show()
      console.log('tray show !!!')
      this.windowManager.sendCommandTo(this.trayWindow!, 'APP:Poper-Left', 'APP:Poper-Left', poperX)
      this?.trayWindow?.moveTop()
    } else {
      this?.trayWindow?.hide()
    }
  }

  private handleTrayAction(
    action: 'groupDo' | 'switchChange' | 'show' | 'exit',
    typeFlag?: string
  ) {
    console.log('TrayManager action: ', action, typeFlag)
    switch (action) {
      case 'exit':
        this.emit('application:exit')
        break
      case 'show':
        this.emit('application:show', 'index')
        break
      case 'groupDo':
        this.windowManager.sendCommandTo(
          this.mainWindow!,
          'APP:Tray-Command',
          'APP:Tray-Command',
          'groupDo'
        )
        break
      case 'switchChange':
        this.windowManager.sendCommandTo(
          this.mainWindow!,
          'APP:Tray-Command',
          'APP:Tray-Command',
          'switchChange',
          typeFlag
        )
        break
    }
  }

  // ===== 应用生命周期 =====

  async stop() {
    logger.info('[FlyEnv] application stop !!!')
    try {
      globalShortcut.unregisterAll()
      ScreenManager.destroy()
      SiteSuckerManager.destroy()
      this.forkManager?.destroy()
      this.trayManager?.destroy()
      OAuth.cancel()
      NodePTY.exitAllPty()
      await this.serverManager.stopServer()
    } catch (e) {
      console.log('stop e: ', e)
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

  // ===== 命令发送 =====

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
}
