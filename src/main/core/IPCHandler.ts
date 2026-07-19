import { ipcMain, shell, app } from 'electron'
import { EventEmitter } from 'events'
import { isMacOS, isWindows, isLinux } from '@shared/utils'
import { execPromiseSudo } from '@shared/child-process'
import AppHelper from './AppHelper'
import { AppHelperCheck } from '@shared/AppHelperCheck'
import { buildHelperCheckResponse } from '@shared/WindowsHelperState'
import ConfigManager from './ConfigManager'
import type MCPConfigManager from './MCPConfigManager'
import type { MCPRuntime } from './MCPRuntime'
import type MCPBridgeManager from './MCPBridgeManager'
import type WindowManager from '../ui/WindowManager'
import type TrayManager from '../ui/TrayManager'
import type { ForkManager } from './ForkManager'
import type { AppNodeFn } from './AppNodeFn'
import type ServerManager from './ServerManager'
import type { BrowserWindow } from 'electron'
import type AppNodeFnManager from './AppNodeFn'
import ServiceProcessManager from './ServiceProcess'
import ServiceVersionManager from './ServiceVersionManager'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync, readFileSync } from 'node:fs'
import { CheckBrewOrPort } from '../utils/CheckBrew'
import type { LanguageCoordinator } from './LanguageCoordinator'
import {
  capturerRuntime,
  httpServerRuntime,
  mcpAuditRuntime,
  nodePtyRuntime,
  oauthRuntime,
  siteSuckerRuntime,
  syncCapturerConfig
} from './lazy/OptionalRuntimes'

export interface IPCHandlerDependencies {
  configManager: ConfigManager
  mcpConfigManager?: MCPConfigManager
  mcpRuntime?: MCPRuntime
  mcpBridgeManager?: MCPBridgeManager
  windowManager: WindowManager
  trayManager: TrayManager
  forkManager?: ForkManager
  serverManager: ServerManager
  languageCoordinator: LanguageCoordinator
  mainWindow?: BrowserWindow
  trayWindow?: BrowserWindow
  appNodeFnManager: typeof AppNodeFnManager
}

export default class IPCHandler extends EventEmitter {
  private deps: IPCHandlerDependencies
  private capturerConfig?: any

  constructor(dependencies: IPCHandlerDependencies) {
    super()
    this.deps = dependencies
  }

  private loadCapturer() {
    return capturerRuntime.load().then((capturer) => {
      if (this.capturerConfig) capturer.configUpdate(this.capturerConfig)
      return capturer
    })
  }

  private loadNodePty() {
    return nodePtyRuntime.load().then((nodePty) => {
      nodePty.onSendCommand((command: string, ...args: any[]) => {
        if (this.deps.mainWindow) {
          this.deps.windowManager.sendCommandTo(this.deps.mainWindow, command, ...args)
        }
      })
      return nodePty
    })
  }

  private loadSiteSucker() {
    return siteSuckerRuntime.load().then((siteSucker) => {
      siteSucker.setCallback((link: any) => this.handleSiteSuckerLink(link))
      return siteSucker
    })
  }

  private handleSiteSuckerLink(link: any) {
    if (!this.deps.mainWindow) return
    if (link === 'window-close') {
      this.deps.windowManager.sendCommandTo(
        this.deps.mainWindow,
        'App-SiteSucker-Link-Stop',
        'App-SiteSucker-Link-Stop',
        true
      )
      return
    }
    this.deps.windowManager.sendCommandTo(
      this.deps.mainWindow,
      'App-SiteSucker-Link',
      'App-SiteSucker-Link',
      link
    )
  }

  private sendRuntimeError(command: string, key: string, error: unknown) {
    const message = error instanceof Error ? error.message : `${error}`
    this.sendToMainWindow(command, key, { code: 1, msg: message })
  }

  /**
   * 初始化 IPC 消息监听
   */
  init() {
    ipcMain.on('command', (event, command, key, ...args) => {
      this.handleCommand(command, key, ...args)
    })

    ipcMain.on('event', (event, eventName, ...args) => {
      console.log('receive event', eventName, ...args)
      this.emit(eventName, ...args)
    })
  }

  /**
   * 处理命令
   */
  handleCommand(command: string, key: string, ...args: any[]) {
    this.emit(command, ...args)

    // 处理 app-fork 命令
    if (command.startsWith('app-fork:')) {
      this.handleForkCommand(command, key, ...args)
      return
    }

    // 处理普通命令
    this.handleRegularCommand(command, key, ...args)
  }

  /**
   * 处理 Fork 命令
   */
  private handleForkCommand(command: string, key: string, ...args: any[]) {
    const module = command.replace('app-fork:', '')
    this.dispatchForkCommand(command, key, module, args)
  }

  private dispatchForkCommand(command: string, key: string, module: string, args: any[]) {
    const action = args?.[0]
    const debugAction = {
      command,
      module,
      action: typeof action === 'string' ? action : undefined,
      key,
      startedAt: Date.now()
    }
    global.Server.DebugForkActions = [...(global.Server.DebugForkActions ?? []), debugAction].slice(
      -10
    )

    // 处理特殊命令：通过应用打开路径
    if (module === 'tools' && args?.[0] === 'openPathByApp') {
      const openApps = this.getOpenApps()
      const appName = args?.[2]

      if (openApps[appName]) {
        this.clearDebugForkAction(debugAction)
        this.handleOpenPathByApp(command, key, args)
        return
      }
    }

    // 设置代理和全局配置
    this.deps.serverManager.setProxy()
    this.deps.serverManager.updateGlobalConfig()

    const forkManager = this.deps.forkManager
    if (!forkManager) {
      this.clearDebugForkAction(debugAction)
      this.sendToMainWindow(command, key, { code: 1, msg: 'Fork manager not initialized' })
      return
    }

    // 发送给 fork 进程
    forkManager
      .send(module, ...args)
      .on((info: any) => this.handleForkCallback(command, key, module, info, args))
      .then((info: any) => {
        this.handleForkCallback(command, key, module, info, args)
        this.clearDebugForkAction(debugAction)
      })
  }

  private clearDebugForkAction(debugAction: { key: string; startedAt: number }) {
    global.Server.DebugForkActions = (global.Server.DebugForkActions ?? []).filter(
      (item) => item.key !== debugAction.key || item.startedAt !== debugAction.startedAt
    )
  }

  /**
   * 处理 Fork 回调
   */
  private handleForkCallback(command: string, key: string, module: string, info: any, args: any[]) {
    const win = this.deps.mainWindow!

    // 把前端获取已安装版本的结果同步到 MCP 缓存
    if (
      module === 'version' &&
      args?.[0] === 'allInstalledVersions' &&
      info?.code === 0 &&
      info?.data
    ) {
      ServiceVersionManager.updateCache(info.data)
    }

    // 处理服务启动 PID
    if (info?.data?.['APP-Service-Start-PID']) {
      const item = args[1]
      ServiceProcessManager.addPid(module, info.data['APP-Service-Start-PID'], item)
    }

    // 处理服务停止 PID
    if (info?.data?.['APP-Service-Stop-PID']) {
      const arr: string[] = info.data['APP-Service-Stop-PID']
      ServiceProcessManager.delPid(module, arr)
    }

    this.deps.windowManager.sendCommandTo(win, command, key, info)

    // 处理许可证码
    if (info?.data?.['APP-Licenses-Code']) {
      const code: string = info.data['APP-Licenses-Code']
      this.deps.configManager?.setConfig('setup.license', code)
      this.deps.windowManager.sendCommandTo(
        this.deps.mainWindow!,
        'APP-License-Need-Update',
        'APP-License-Need-Update',
        true
      )
    }

    // 处理日志
    if (info?.msg?.['APP-On-Log']) {
      this.deps.windowManager.sendCommandTo(
        this.deps.mainWindow!,
        'APP-On-Log',
        'APP-On-Log',
        info.msg['APP-On-Log']
      )
    }
  }

  /**
   * 处理通过应用打开路径
   */
  private handleOpenPathByApp(command: string, key: string, args: any[]) {
    const openApps = this.getOpenApps()
    const appName = args?.[2]
    const filePath = args?.[1]

    const url = `${openApps[appName]}${encodeURIComponent(filePath)}`
    console.log('openPathByApp ', appName, url)

    shell
      .openExternal(url)
      .then(() => {
        this.sendToMainWindow(command, key, { code: 0, data: true })
      })
      .catch((e: any) => {
        this.sendToMainWindow(command, key, { code: 1, msg: e.toString() })
      })
  }

  /**
   * 获取可打开的应用列表
   */
  private getOpenApps(): Record<string, string> {
    if (isMacOS() || isLinux()) {
      return {
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
      return {
        VSCode: 'vscode://file/'
      }
    }
    return {}
  }

  /**
   * 处理普通命令
   */
  private handleRegularCommand(command: string, key: string, ...args: any[]) {
    switch (command) {
      case 'application:language-bootstrap':
        this.handleLanguageBootstrap(command, key)
        break
      case 'application:language-prepare':
        this.handleLanguagePrepare(command, key, args[0])
        break
      case 'application:language-commit':
        this.handleLanguageCommit(command, key, args[0])
        break
      case 'application:language-list-custom':
        this.handleLanguageListCustom(command, key)
        break
      case 'application:language-init-custom':
        this.handleLanguageInitCustom(command, key, args[0] === 'zh' ? 'zh' : 'en')
        break
      case 'application:language-invalidate':
        this.deps.languageCoordinator.invalidate(args[0])
        this.sendToMainWindow(command, key, { code: 0, data: true })
        break

      // FlyEnv Helper 相关
      case 'APP-FlyEnv-Helper-Install':
        this.handleHelperInstall(command, key)
        break
      case 'APP:FlyEnv-Helper-Command':
        this.handleHelperCommand(command, key)
        break
      case 'APP:FlyEnv-Helper-Check':
        this.handleHelperCheck(command, key)
        break

      // Node 函数调用
      case 'App-Node-FN':
        this.handleNodeFn(command, key, ...args)
        break

      // 密码检查
      case 'app:password-check':
        this.handlePasswordCheck(command, key, args)
        break

      // 窗口控制
      case 'APP:Auto-Hide':
        this.handleAutoHide()
        break
      case 'Application:APP-Minimize':
        this.handleMinimize()
        break
      case 'Application:APP-Maximize':
        this.handleMaximize()
        break
      case 'Application:APP-Close':
        this.handleClose()
        break

      // Tray 相关
      case 'Application:tray-status-change':
        this.handleTrayStatusChange(args)
        break
      case 'application:save-preference':
        this.handleSavePreference(command, key)
        break
      case 'APP:Tray-Store-Sync':
        this.handleTrayStoreSync(command, args)
        break
      case 'APP:Tray-Command':
        this.handleTrayCommand(command, args)
        break

      // 开发工具
      case 'application:open-dev-window':
        this.handleOpenDevWindow(command, key)
        break
      case 'application:about':
        this.handleAbout(command, key)
        break

      // Brew 检查
      case 'app-check-brewport':
        this.handleCheckBrewPort(command, key)
        break

      // HTTP 服务
      case 'app-http-serve-run':
        this.handleHttpServeRun(command, key, args)
        break
      case 'app-http-serve-stop':
        this.handleHttpServeStop(command, key, args)
        break

      // 屏幕捕获
      case 'Capturer:doCapturer':
        this.handleCapturer(command, key, args)
        break
      case 'Capturer:doStopCapturer':
        this.handleStopCapturer(command, key)
        break
      case 'Capturer:getWindowCapturer':
        this.handleGetWindowCapturer(command, key, args)
        break
      case 'Capturer:stopCheckWindowInPoint':
        this.handleStopCheckWindowInPoint(command, key)
        break
      case 'Capturer:saveImage':
        this.handleSaveImage(command, key, args)
        break
      case 'Capturer:Config-Update':
        this.handleCapturerConfigUpdate(command, key, args)
        break

      // NodePty
      case 'NodePty:init':
        this.handleNodePtyInit(command, key)
        break
      case 'NodePty:exec':
        this.handleNodePtyExec(command, key, args)
        break
      case 'NodePty:write':
        this.handleNodePtyWrite(args)
        break
      case 'NodePty:clear':
        this.handleNodePtyClear(command, key, args)
        break
      case 'NodePty:resize':
        this.handleNodePtyResize(command, key, args)
        break
      case 'NodePty:stop':
        this.handleNodePtyStop(command, key, args)
        break

      // SiteSucker
      case 'app-sitesucker-run':
        this.handleSiteSuckerRun(command, key, args)
        break
      case 'app-sitesucker-setup':
        this.handleSiteSuckerSetup(command, key)
        break
      case 'app-sitesucker-setup-save':
        this.handleSiteSuckerSetupSave(command, key, args)
        break

      // OAuth
      case 'GitHub-OAuth-Start':
        this.handleOAuthStart(command, key)
        break
      case 'GitHub-OAuth-Cancel':
        this.handleOAuthCancel(command, key)
        break
      case 'GitHub-OAuth-License-Fetch':
        this.handleOAuthLicenseFetch(command, key)
        break
      case 'GitHub-OAuth-License-Del-Bind':
        this.handleOAuthLicenseDelBind(command, key, args)
        break
      case 'GitHub-OAuth-License-Add-Bind':
        this.handleOAuthLicenseAddBind(command, key, args)
        break

      // MCP Server
      case 'mcp:start':
        this.handleMcpStart(command, key)
        break
      case 'mcp:stop':
        this.handleMcpStop(command, key)
        break
      case 'mcp:status':
        this.handleMcpStatus(command, key)
        break
      case 'mcp:getConfig':
        this.handleMcpGetConfig(command, key)
        break
      case 'mcp:setConfig':
        this.handleMcpSetConfig(command, key, args)
        break
      case 'mcp:getBridgePath':
        this.handleMcpGetBridgePath(command, key)
        break
      case 'mcp:getAuditLog':
        this.handleMcpGetAuditLog(command, key)
        break
      case 'mcp:getAuditLogFile':
        this.handleMcpGetAuditLogFile(command, key)
        break

      default:
        console.log('Unknown command:', command)
    }
  }

  private handleLanguageBootstrap(command: string, key: string) {
    this.sendToMainWindow(command, key, {
      code: 0,
      data: this.deps.languageCoordinator.bootstrap()
    })
  }

  private handleLanguagePrepare(command: string, key: string, locale: string) {
    this.deps.languageCoordinator
      .prepare(locale)
      .then((data) => this.sendToMainWindow(command, key, { code: 0, data }))
      .catch((error) => this.sendToMainWindow(command, key, { code: 1, msg: String(error) }))
  }

  private handleLanguageCommit(command: string, key: string, token: string) {
    this.deps.languageCoordinator
      .commit(token)
      .then((data) => this.sendToMainWindow(command, key, { code: 0, data }))
      .catch((error) => this.sendToMainWindow(command, key, { code: 1, msg: String(error) }))
  }

  private handleLanguageListCustom(command: string, key: string) {
    this.deps.languageCoordinator
      .listCustom()
      .then((data) => this.sendToMainWindow(command, key, { code: 0, data }))
      .catch((error) => this.sendToMainWindow(command, key, { code: 1, msg: String(error) }))
  }

  private handleLanguageInitCustom(command: string, key: string, locale: 'en' | 'zh') {
    this.deps.languageCoordinator
      .initializeCustomTemplate(locale)
      .then((data) => this.sendToMainWindow(command, key, { code: 0, data }))
      .catch((error) => this.sendToMainWindow(command, key, { code: 1, msg: String(error) }))
  }

  // ===== FlyEnv Helper 相关 =====

  private handleHelperInstall(command: string, key: string) {
    AppHelper.initHelper()
      .catch()
      .finally(() => {
        this.sendToMainWindow(command, key, true)
      })
  }

  private handleHelperCommand(command: string, key: string) {
    AppHelper.command()
      .then((res) => {
        this.sendToMainWindow(command, key, { code: 0, ...res })
      })
      .catch((error) => {
        this.sendToMainWindow(command, key, buildHelperCheckResponse(error))
      })
  }

  private handleHelperCheck(command: string, key: string) {
    AppHelperCheck()
      .then(() => {
        this.sendToMainWindow(command, key, { code: 0, data: true })
      })
      .catch((error) => {
        this.sendToMainWindow(command, key, buildHelperCheckResponse(error))
      })
  }

  // ===== Node 函数调用 =====

  private handleNodeFn(command: string, key: string, ...args: any[]) {
    const namespace: string = args.shift()
    const method: string = args.shift()
    const fn: keyof AppNodeFn = `${namespace}_${method}` as any
    console.log('App-Node-FN: ', fn)

    try {
      if (typeof this.deps.appNodeFnManager[fn] === 'function') {
        const nodeFn = this.deps.appNodeFnManager[fn] as any
        nodeFn.call(this.deps.appNodeFnManager, command, key, ...args)
      }
    } catch {}
  }

  // ===== 密码检查 =====

  private handlePasswordCheck(command: string, key: string, args: any[]) {
    const pass = args?.[0] ?? ''
    execPromiseSudo(['-k', 'echo', 'FlyEnv'], undefined, pass)
      .then(() => {
        this.deps.configManager.setConfig('password', pass)
        global.Server.Password = pass
        this.sendToMainWindow(command, key, { code: 0, data: pass })
      })
      .catch((err: Error) => {
        console.log('err: ', err)
        this.sendToMainWindow(command, key, { code: 1, msg: err })
      })
  }

  // ===== 窗口控制 =====

  private handleAutoHide() {
    this.deps.mainWindow?.hide()
    app?.dock?.hide()
  }

  private handleMinimize() {
    this.deps.windowManager?.getFocusedWindow()?.minimize()
  }

  private handleMaximize() {
    const window = this.deps.windowManager.getFocusedWindow()!
    if (window.isMaximized()) {
      window.unmaximize()
    } else {
      window.maximize()
    }
  }

  private handleClose() {
    this.deps.windowManager?.getFocusedWindow()?.close()
  }

  // ===== Tray 相关 =====

  private handleTrayStatusChange(args: any[]) {
    this.deps.trayManager.iconChange(args?.[0] ?? false)
  }

  private handleSavePreference(command: string, key: string) {
    this.sendToMainWindow(command, key)
  }

  private handleTrayStoreSync(command: string, args: any[]) {
    this.deps.trayManager.menuChange(args?.[0])
    if (this.deps.trayWindow) {
      this.deps.windowManager.sendCommandTo(this.deps.trayWindow!, command, command, args?.[0])
    }
  }

  private handleTrayCommand(command: string, args: any[]) {
    this.deps.windowManager.sendCommandTo(this.deps.mainWindow!, command, command, ...args)
  }

  // ===== 开发工具 =====

  private handleOpenDevWindow(command: string, key: string) {
    this.deps.mainWindow?.webContents?.openDevTools()
    const debugFile = join(tmpdir(), 'flyenv-debug.log')
    shell.showItemInFolder(debugFile)
    this.sendToMainWindow(command, key, true)
  }

  private handleAbout(command: string, key: string) {
    this.sendToMainWindow(command, key)
  }

  // ===== Brew 检查 =====

  private handleCheckBrewPort(command: string, key: string) {
    console.log('app-check-brewport checkBrewOrPort !!!')
    CheckBrewOrPort(() => {})
    this.sendToMainWindow(command, key, true)
  }

  // ===== HTTP 服务 =====

  private handleHttpServeRun(command: string, key: string, args: any[]) {
    httpServerRuntime
      .load()
      .then((httpServer) => httpServer.start(args[0]))
      .then((res) => this.sendToMainWindow(command, key, res))
      .catch((error) => this.sendRuntimeError(command, key, error))
  }

  private handleHttpServeStop(command: string, key: string, args: any[]) {
    const httpServer = httpServerRuntime.peek()
    if (!httpServer) {
      this.sendToMainWindow(command, key, { path: args[0] })
      return
    }
    httpServer.stop(args[0]).then((res) => {
      this.sendToMainWindow(command, key, { path: res })
    })
  }

  // ===== 屏幕捕获 =====

  private handleCapturer(command: string, key: string, args: any[]) {
    this.loadCapturer()
      .then((capturer) => {
        const isHide: any = args[0]
        if (isHide && this.deps.mainWindow?.isVisible()) {
          this.deps.mainWindow.once('hide', () => {
            setTimeout(() => {
              capturer.initWatchPointWindow().catch()
              this.deps.mainWindow?.setOpacity(1)
            }, 150)
          })
          this.deps.mainWindow.setOpacity(0)
          this.deps.mainWindow.hide()
        } else {
          capturer.initWatchPointWindow().catch()
        }
        this.sendToMainWindow(command, key, true)
      })
      .catch((error) => this.sendRuntimeError(command, key, error))
  }

  private handleStopCapturer(command: string, key: string) {
    const capturer = capturerRuntime.peek()
    capturer?.stopCapturer()
    if (capturer?.window) {
      this.deps.windowManager.sendCommandTo(capturer.window, command, key, true)
    }
  }

  private handleGetWindowCapturer(command: string, key: string, args: any[]) {
    this.loadCapturer()
      .then((capturer) => {
        capturer.getWindowCapturer(args[0])
        if (capturer.window) {
          this.deps.windowManager.sendCommandTo(capturer.window, command, key, true)
        }
      })
      .catch((error) => this.sendRuntimeError(command, key, error))
  }

  private handleStopCheckWindowInPoint(command: string, key: string) {
    const capturer = capturerRuntime.peek()
    capturer?.stopCheckWindowInPoint()
    if (capturer?.window) {
      this.deps.windowManager.sendCommandTo(capturer.window, command, key, true)
    }
  }

  private handleSaveImage(command: string, key: string, args: any[]) {
    const capturer = capturerRuntime.peek()
    capturer?.saveImage(args[0], args[1])
    if (capturer?.window) {
      this.deps.windowManager.sendCommandTo(capturer.window, command, key, true)
    }
  }

  private handleCapturerConfigUpdate(command: string, key: string, args: any[]) {
    this.capturerConfig = args[0]
    syncCapturerConfig(capturerRuntime, this.capturerConfig)
      .then(() => this.sendToMainWindow(command, key, true))
      .catch((error) => this.sendRuntimeError(command, key, error))
  }

  // ===== NodePty =====

  private handleNodePtyInit(command: string, key: string) {
    this.loadNodePty()
      .then((nodePty) => nodePty.initNodePty())
      .then((res) => this.sendToMainWindow(command, key, { code: 0, data: res }))
      .catch((error) => this.sendRuntimeError(command, key, error))
  }

  private handleNodePtyExec(command: string, key: string, args: any[]) {
    this.loadNodePty()
      .then((nodePty) => nodePty.exec(args[0], args[1], args[2], command, key))
      .catch((error) => this.sendRuntimeError(command, key, error))
  }

  private handleNodePtyWrite(args: any[]) {
    nodePtyRuntime.peek()?.write(args[0], args[1])
  }

  private handleNodePtyClear(command: string, key: string, args: any[]) {
    nodePtyRuntime.peek()?.clean(args[0])
    this.sendToMainWindow(command, key, { code: 0 })
  }

  private handleNodePtyResize(command: string, key: string, args: any[]) {
    nodePtyRuntime.peek()?.resize(args[0], args[1])
    this.sendToMainWindow(command, key, { code: 0 })
  }

  private handleNodePtyStop(command: string, key: string, args: any[]) {
    nodePtyRuntime.peek()?.stop(args[0])
    this.sendToMainWindow(command, key, { code: 0 })
  }

  // ===== SiteSucker =====

  private handleSiteSuckerRun(command: string, key: string, args: any[]) {
    this.loadSiteSucker()
      .then((siteSucker) => {
        siteSucker.show(args[0])
        this.sendToMainWindow(command, key, true)
      })
      .catch((error) => this.sendRuntimeError(command, key, error))
  }

  private handleSiteSuckerSetup(command: string, key: string) {
    const setup = this.deps.configManager.getConfig('tools.siteSucker')
    this.sendToMainWindow(command, key, setup)
  }

  private handleSiteSuckerSetupSave(command: string, key: string, args: any[]) {
    this.deps.configManager.setConfig('tools.siteSucker', args[0])
    this.sendToMainWindow(command, key, true)
    siteSuckerRuntime.peek()?.updateConfig(args[0])
  }

  // ===== OAuth =====

  private handleOAuthStart(command: string, key: string) {
    oauthRuntime
      .load()
      .then((oauth) => oauth.startOAuth())
      .then((res) => {
        this.sendToMainWindow(command, key, { code: 0, data: res })
      })
      .catch((err) => {
        this.sendToMainWindow(command, key, { code: 1, msg: `${err}` })
      })
  }

  private handleOAuthCancel(command: string, key: string) {
    oauthRuntime.peek()?.cancel()
    this.sendToMainWindow(command, key, { code: 0, data: true })
  }

  private handleOAuthLicenseFetch(command: string, key: string) {
    this.dispatchForkCommand(command, key, 'app', ['githubLicenseFetch'])
  }

  private handleOAuthLicenseDelBind(command: string, key: string, args: any[]) {
    this.dispatchForkCommand(command, key, 'app', ['githubLicenseDelete', args[0], args[1]])
  }

  private handleOAuthLicenseAddBind(command: string, key: string, args: any[]) {
    this.dispatchForkCommand(command, key, 'app', ['githubLicenseAdd', args[0], args[1]])
  }

  // ===== MCP Server =====

  private handleMcpStart(command: string, key: string) {
    const runtime = this.deps.mcpRuntime
    if (!runtime) {
      this.sendToMainWindow(command, key, { code: 1, msg: 'MCP not initialized' })
      return
    }
    runtime
      .start()
      .then((res) => {
        this.sendToMainWindow(command, key, { code: 0, data: res })
      })
      .catch((e: any) => {
        this.sendToMainWindow(command, key, { code: 1, msg: `${e?.message ?? e}` })
      })
  }

  private handleMcpStop(command: string, key: string) {
    const runtime = this.deps.mcpRuntime
    if (!runtime) {
      this.sendToMainWindow(command, key, { code: 1, msg: 'MCP not initialized' })
      return
    }
    runtime
      .stopLoaded()
      .then((res) => {
        this.sendToMainWindow(command, key, { code: 0, data: res })
      })
      .catch((e: any) => {
        this.sendToMainWindow(command, key, { code: 1, msg: `${e?.message ?? e}` })
      })
  }

  private handleMcpStatus(command: string, key: string) {
    const runtime = this.deps.mcpRuntime
    if (!runtime) {
      this.sendToMainWindow(command, key, { code: 1, msg: 'MCP not initialized' })
      return
    }
    this.sendToMainWindow(command, key, { code: 0, data: runtime.status() })
  }

  private handleMcpGetConfig(command: string, key: string) {
    const mcpConfig = this.deps.mcpConfigManager
    if (!mcpConfig) {
      this.sendToMainWindow(command, key, { code: 1, msg: 'MCP not initialized' })
      return
    }
    this.sendToMainWindow(command, key, { code: 0, data: mcpConfig.getConfig() })
  }

  private handleMcpSetConfig(command: string, key: string, args: any[]) {
    const mcpConfig = this.deps.mcpConfigManager
    if (!mcpConfig) {
      this.sendToMainWindow(command, key, { code: 1, msg: 'MCP not initialized' })
      return
    }
    const patch = args?.[0]
    if (patch && typeof patch === 'object') {
      mcpConfig.setConfig(patch)
    }
    this.sendToMainWindow(command, key, { code: 0, data: mcpConfig.getConfig() })
  }

  private handleMcpGetBridgePath(command: string, key: string) {
    const bridgeManager = this.deps.mcpBridgeManager
    if (!bridgeManager) {
      this.sendToMainWindow(command, key, { code: 1, msg: 'MCP bridge not initialized' })
      return
    }
    this.sendToMainWindow(command, key, {
      code: 0,
      data: bridgeManager.getBridgePath()
    })
  }

  private handleMcpGetAuditLog(command: string, key: string) {
    mcpAuditRuntime
      .load()
      .then((audit) => {
        const file = audit.getLogFile()
        let data = ''
        try {
          if (existsSync(file)) data = readFileSync(file, 'utf-8')
        } catch (e) {
          console.log('handleMcpGetAuditLog error: ', e)
        }
        this.sendToMainWindow(command, key, { code: 0, data })
      })
      .catch((error) => this.sendRuntimeError(command, key, error))
  }

  private handleMcpGetAuditLogFile(command: string, key: string) {
    mcpAuditRuntime
      .load()
      .then((audit) => {
        this.sendToMainWindow(command, key, { code: 0, data: audit.getLogFile() })
      })
      .catch((error) => this.sendRuntimeError(command, key, error))
  }

  // ===== 工具方法 =====

  private sendToMainWindow(command: string, key: string, data?: any) {
    if (!this.deps.mainWindow) return
    this.deps.windowManager.sendCommandTo(this.deps.mainWindow, command, key, data)
  }

  /**
   * 更新依赖中的窗口引用
   */
  updateDependencies(deps: Partial<IPCHandlerDependencies>) {
    this.deps = { ...this.deps, ...deps }
  }
}
