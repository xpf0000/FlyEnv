import { EventEmitter } from 'events'
import { app, BrowserWindow, globalShortcut, session } from 'electron'
import is from 'electron-is'
import WindowManager from './ui/WindowManager'
import MenuManager from './ui/MenuManager'
import TrayManager from './ui/TrayManager'
import { getLanguage, getLocale, logger } from './utils'
import { applyLanguagePayload, I18nT } from '@lang/runtime'
import { ForkManager } from './core/ForkManager'
import AppHelper from './core/AppHelper'
import ScreenManager from './core/ScreenManager'
import AppLog from './core/AppLog'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import AppNodeFnManager from './core/AppNodeFn'
import ServiceProcessManager from './core/ServiceProcess'
import ServiceVersionManager from './core/ServiceVersionManager'
import { AppHelperRoleFix } from '@shared/AppHelperCheck'
import Helper from '../fork/Helper'
import ConfigManager from './core/ConfigManager'
import MCPConfigManager from './core/MCPConfigManager'
import MCPServer from './core/MCPServer'
import MCPBridgeManager from './core/MCPBridgeManager'
import ServerManager from './core/ServerManager'
import IPCHandler from './core/IPCHandler'
import { startMcpOnLaunchIfNeeded } from './core/MCPLifecycle'
import { CheckBrewOrPort } from './utils/CheckBrew'
import { MakeServerDir } from './utils/ServerPath'
import { reactive, watch } from 'vue'
import { debounce } from '@shared/debounce'
import { LanguageRepository } from './core/LanguageRepository'
import { LanguageCoordinator } from './core/LanguageCoordinator'
import type { LanguageChanged } from '@shared/LanguageProtocol'
import {
  capturerRuntime,
  httpServerRuntime,
  nodePtyRuntime,
  oauthRuntime,
  siteSuckerRuntime
} from './core/lazy/OptionalRuntimes'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default class Application extends EventEmitter {
  isReady: boolean = false
  configManager: ConfigManager
  mcpConfigManager: MCPConfigManager
  mcpServer?: MCPServer
  mcpBridgeManager?: MCPBridgeManager
  menuManager!: MenuManager
  trayManager!: TrayManager
  windowManager!: WindowManager
  mainWindow?: BrowserWindow
  trayWindow?: BrowserWindow
  forkManager?: ForkManager
  languageRepository: LanguageRepository
  languageCoordinator: LanguageCoordinator

  // 新提取的管理器
  private serverManager: ServerManager
  private ipcHandler!: IPCHandler
  private stopPromise?: Promise<void>

  constructor() {
    super()
    this.setupInitialConfig()
    this.configManager = new ConfigManager()
    this.mcpConfigManager = new MCPConfigManager()
    this.mcpBridgeManager = new MCPBridgeManager()
    this.serverManager = new ServerManager(this.configManager)
    this.serverManager.initServerDir()

    this.languageRepository = new LanguageRepository({
      builtInRoot: resolve(global.Server.Static!, 'lang'),
      customRoot: resolve(global.Server.BaseDir!, '../lang')
    })
    this.languageCoordinator = new LanguageCoordinator({
      repository: this.languageRepository,
      runtime: { apply: applyLanguagePayload },
      persist: (locale) => this.configManager.setConfig('setup.lang', locale),
      setServerLocale: (locale) => {
        global.Server.Lang = locale
      },
      refreshNativeUi: () => {
        this.menuManager?.rebuild()
        if (this.trayManager?.status) {
          this.trayManager.menuChange(this.trayManager.status)
        }
      },
      publish: (message) => this.publishLanguage(message),
      onError: (error) => logger.error('[Language]', error)
    })
  }

  async init() {
    const requestedLocale = getLanguage(this.configManager.getConfig('setup.lang'))
    await this.languageRepository.ready()
    await this.languageCoordinator.initialize(requestedLocale)

    AppNodeFnManager.nativeTheme_watch()
    AppNodeFnManager.configManager = this.configManager

    this.menuManager = new MenuManager()
    this.menuManager.setup()

    this.serverManager.setProxy()
    this.windowManager = new WindowManager({
      configManager: this.configManager
    })
    this.initWindowManager()

    ScreenManager.initWatch()
    this.trayManager = new TrayManager()
    this.windowManager.trayManager = this.trayManager

    this.ipcHandler = new IPCHandler({
      configManager: this.configManager,
      mcpConfigManager: this.mcpConfigManager,
      mcpBridgeManager: this.mcpBridgeManager,
      windowManager: this.windowManager,
      trayManager: this.trayManager,
      serverManager: this.serverManager,
      languageCoordinator: this.languageCoordinator,
      appNodeFnManager: AppNodeFnManager
    })

    this.setupEventHandlers()
    this.ipcHandler.init()
    this.initFontAccessPermission()
    this.initAppHelper()
    this.initForkManager()

    if (!is.dev()) {
      this.ipcHandler.handleCommand('app-fork:app', 'App-Start', 'start', app.getVersion())
    }

    console.log('Application inited !!!')
    return this
  }

  private async publishLanguage(message: LanguageChanged) {
    const command = 'APP-Language-Changed'
    if (this.trayWindow) {
      this.windowManager.sendCommandTo(this.trayWindow, command, command, message.payload)
    }
    if (this.forkManager) {
      void this.forkManager.broadcastLanguage(message).then((results) => {
        if (results.some((result) => !result)) {
          logger.warn('[Language] one or more forks missed the locale acknowledgement')
        }
      })
    }
  }

  /**
   * 设置初始全局配置
   */
  private setupInitialConfig() {
    global.Server = reactive({
      Local: getLocale(),
      APPVersion: app.getVersion()
    }) as any
    watch(global.Server, debounce(this.sendGlobalServerUpdate, 350).bind(this))
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
   * 初始化 FlyEnv Helper
   */
  private initAppHelper() {
    AppHelperRoleFix().catch()
    Helper.appHelper = AppHelper

    AppHelper.onStatusMessage((message) => {
      if (!this?.mainWindow) {
        return
      }
      this.handleHelperStatusMessage(message)
    })

    AppHelper.onSuduExecSuccess(() => {
      MakeServerDir()
    })
  }

  /**
   * 处理 Helper 状态消息
   */
  private handleHelperStatusMessage(message: { state: string; reason?: string }) {
    const key = 'APP-FlyEnv-Helper-Notice'
    const messages: Record<string, { code: number; msg: string; status?: string }> = {
      needInstall: { code: 1, msg: I18nT('menu.needInstallHelper') },
      installed: { code: 2, msg: I18nT('menu.waitHelper') },
      installing: { code: 2, msg: I18nT('menu.helperInstalling') },
      installFaild: { code: 1, msg: I18nT('menu.helperInstallFailTips'), status: 'installFaild' },
      checkSuccess: { code: 0, msg: I18nT('menu.helperInstallSuccessTips') }
    }

    const base = messages[message.state]
    if (base) {
      this.windowManager.sendCommandTo(this.mainWindow!, key, key, {
        ...base,
        reason: message.reason
      })
    }
  }

  /**
   * 初始化 Fork 管理器
   */
  private initForkManager() {
    this.forkManager = new ForkManager(join(__dirname, './fork.mjs'))
    this.forkManager.setLanguageSnapshotProvider(() => this.languageCoordinator.snapshot())
    this.forkManager.on(({ key, info }: { key: string; info: any }) => {
      if (key === 'App-Need-Init-FlyEnv-Helper') {
        AppHelper.needInstall()
        return
      }
      this.windowManager.sendCommandTo(this.mainWindow!, key, key, info)
    })
    ServiceProcessManager.forkManager = this.forkManager

    // 服务运行态变更时，广播给 render，使「非本端发起」（MCP / 托盘 / 其它窗口）的启停也能同步到 UI
    ServiceProcessManager.onStatusChange((status) => {
      if (!this.mainWindow) {
        return
      }
      this.windowManager.sendCommandTo(this.mainWindow, 'APP-MCP-Notify', 'APP-MCP-Notify', {
        type: 'service-status-changed',
        ...status
      })
    })

    // MCP Server 需要 forkManager 句柄，在此创建并注入
    this.mcpServer = new MCPServer(this.forkManager, this.mcpConfigManager, this.configManager)
    this.ipcHandler.updateDependencies({ forkManager: this.forkManager, mcpServer: this.mcpServer })
    startMcpOnLaunchIfNeeded(this.mcpConfigManager, this.mcpServer).catch(() => {})

    // MCP 通知统一通过 ServiceVersionManager 中转，再广播给渲染进程
    ServiceVersionManager.onMcpNotify((payload) => {
      if (this.mainWindow) {
        this.windowManager.sendCommandTo(
          this.mainWindow,
          'APP-MCP-Notify',
          'APP-MCP-Notify',
          payload
        )
      }
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
      this.windowManager.setWillQuit(true)
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
    CheckBrewOrPort(() => {})

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
      oauthRuntime
        .load()
        .then((oauth) => oauth.fetchUser())
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
    if (!this.windowManager || !this.mainWindow || !this.serverManager) {
      return
    }
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
        const languageCommand = 'APP-Language-Changed'
        this.windowManager.sendCommandTo(
          this.trayWindow!,
          languageCommand,
          languageCommand,
          this.languageCoordinator.snapshot()
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
        this.ipcHandler.emit('application:exit')
        break
      case 'show':
        this.ipcHandler.emit('application:show', 'index')
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
    if (this.stopPromise) {
      return this.stopPromise
    }

    this.stopPromise = this.doStop()
    return this.stopPromise
  }

  private async doStop() {
    logger.info('[FlyEnv] application stop !!!')
    try {
      globalShortcut.unregisterAll()
    } catch (e) {
      console.log('globalShortcut.unregisterAll e: ', e)
    }
    try {
      ScreenManager.destroy()
    } catch (e) {
      console.log('ScreenManager.destroy e: ', e)
    }
    try {
      siteSuckerRuntime.peek()?.destroy()
    } catch (e) {
      console.log('SiteSuckerManager.destroy e: ', e)
    }
    try {
      oauthRuntime.peek()?.cancel()
    } catch (e) {
      console.log('OAuth.cancel e: ', e)
    }
    try {
      nodePtyRuntime.peek()?.exitAllPty()
    } catch (e) {
      console.log('NodePTY.exitAllPty e: ', e)
    }
    try {
      capturerRuntime.peek()?.stopCapturer()
    } catch (e) {
      console.log('Capturer.stopCapturer e: ', e)
    }
    try {
      await httpServerRuntime.peek()?.stopAll()
    } catch (e) {
      console.log('HttpServer.stopAll e: ', e)
    }
    try {
      await this.mcpServer?.stop()
    } catch (e) {
      console.log('mcpServer.stop e: ', e)
    }
    try {
      await this.serverManager.stopServer()
    } catch (e) {
      console.log('serverManager.stopServer e: ', e)
    }
    try {
      await this.forkManager?.destroy()
    } catch (e) {
      console.log('forkManager.destroy e: ', e)
    }
    try {
      this.trayManager?.destroy()
    } catch (e) {
      console.log('trayManager.destroy e: ', e)
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
}
