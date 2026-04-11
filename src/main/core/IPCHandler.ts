import { ipcMain, shell } from 'electron'
import { EventEmitter } from 'events'
import { isMacOS, isWindows, isLinux } from '@shared/utils'
import { execPromiseSudo } from '@shared/child-process'
import NodePTY from './NodePTY'
import HttpServer from './HttpServer'
import AppHelper from './AppHelper'
import { AppHelperCheck } from '@shared/AppHelperCheck'
import OAuth from './OAuth'
import Capturer from './Capturer'
import ConfigManager from './ConfigManager'
import type WindowManager from '../ui/WindowManager'
import type TrayManager from '../ui/TrayManager'
import type { ForkManager } from './ForkManager'
import type { AppNodeFn } from './AppNodeFn'
import type ServerManager from './ServerManager'
import type { BrowserWindow } from 'electron'
import type AppNodeFnManager from './AppNodeFn'
import type SiteSuckerManager from '../ui/SiteSucker'
import type ServiceProcessManager from './ServiceProcess'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import CustomerLang from './CustomerLang'
import { AppI18n } from '@lang/index'
import { CheckBrewOrPort } from '../utils/CheckBrew'

export interface IPCHandlerDependencies {
  configManager: ConfigManager
  windowManager: WindowManager
  trayManager: TrayManager
  forkManager?: ForkManager
  serverManager: ServerManager
  mainWindow?: BrowserWindow
  trayWindow?: BrowserWindow
  appNodeFnManager: typeof AppNodeFnManager
  siteSuckerManager: typeof SiteSuckerManager
  serviceProcessManager: typeof ServiceProcessManager
}

export default class IPCHandler extends EventEmitter {
  private deps: IPCHandlerDependencies

  constructor(dependencies: IPCHandlerDependencies) {
    super()
    this.deps = dependencies
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

    // 处理特殊命令：通过应用打开路径
    if (module === 'tools' && args?.[0] === 'openPathByApp') {
      this.handleOpenPathByApp(command, key, args)
      return
    }

    // 设置代理和全局配置
    this.deps.serverManager.setProxy()
    this.deps.serverManager.updateGlobalConfig()

    // 发送给 fork 进程
    this.deps.forkManager
      ?.send(module, ...args)
      .on((info: any) => this.handleForkCallback(command, key, module, info, args))
      .then((info: any) => this.handleForkCallback(command, key, module, info, args))
  }

  /**
   * 处理 Fork 回调
   */
  private handleForkCallback(command: string, key: string, module: string, info: any, args: any[]) {
    const win = this.deps.mainWindow!
    this.deps.windowManager.sendCommandTo(win, command, key, info)

    // 处理服务启动 PID
    if (info?.data?.['APP-Service-Start-PID']) {
      const item = args[1]
      this.deps.serviceProcessManager.addPid(module, info.data['APP-Service-Start-PID'], item)
    }

    // 处理服务停止 PID
    if (info?.data?.['APP-Service-Stop-PID']) {
      const arr: string[] = info.data['APP-Service-Stop-PID']
      this.deps.serviceProcessManager.delPid(module, arr)
    }

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

    if (!openApps[appName]) {
      this.handleRegularCommand(command, key, ...args)
      return
    }

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
        this.handleSiteSuckerRun(args)
        break
      case 'app-sitesucker-setup':
        this.handleSiteSuckerSetup(command, key)
        break
      case 'app-sitesucker-setup-save':
        this.handleSiteSuckerSetupSave(command, key, args)
        break

      // 自定义语言
      case 'app-customer-lang-update':
        this.handleCustomerLangUpdate(args)
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

      default:
        console.log('Unknown command:', command)
    }
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
    AppHelper.command().then((res) => {
      this.sendToMainWindow(command, key, res)
    })
  }

  private handleHelperCheck(command: string, key: string) {
    AppHelperCheck()
      .then(() => {
        this.sendToMainWindow(command, key, { code: 0, data: true })
      })
      .catch(() => {
        this.sendToMainWindow(command, key, { code: 1, data: false })
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
    CheckBrewOrPort(() => {
      this.sendToMainWindow(
        'APP-Update-Global-Server',
        'APP-Update-Global-Server',
        this.deps.serverManager.getGlobalServer()
      )
    })
    this.sendToMainWindow(command, key, true)
  }

  // ===== HTTP 服务 =====

  private handleHttpServeRun(command: string, key: string, args: any[]) {
    HttpServer.start(args[0]).then((res) => {
      this.sendToMainWindow(command, key, res)
    })
  }

  private handleHttpServeStop(command: string, key: string, args: any[]) {
    HttpServer.stop(args[0]).then((res) => {
      this.sendToMainWindow(command, key, { path: res })
    })
  }

  // ===== 屏幕捕获 =====

  private handleCapturer(command: string, key: string, args: any[]) {
    const isHide: any = args[0]
    if (isHide && this.deps.mainWindow?.isVisible()) {
      this.deps.mainWindow?.once('hide', () => {
        setTimeout(() => {
          Capturer.initWatchPointWindow().catch()
          this.deps.mainWindow?.setOpacity(1)
        }, 150)
      })
      this.deps.mainWindow?.setOpacity(0)
      this.deps.mainWindow?.hide()
    } else {
      Capturer.initWatchPointWindow().catch()
    }
    this.sendToMainWindow(command, key, true)
  }

  private handleStopCapturer(command: string, key: string) {
    Capturer.stopCapturer()
    if (Capturer.window) {
      this.deps.windowManager.sendCommandTo(Capturer.window, command, key, true)
    }
  }

  private handleGetWindowCapturer(command: string, key: string, args: any[]) {
    Capturer.getWindowCapturer(args[0])
    if (Capturer.window) {
      this.deps.windowManager.sendCommandTo(Capturer.window, command, key, true)
    }
  }

  private handleStopCheckWindowInPoint(command: string, key: string) {
    Capturer.stopCheckWindowInPoint()
    if (Capturer.window) {
      this.deps.windowManager.sendCommandTo(Capturer.window, command, key, true)
    }
  }

  private handleSaveImage(command: string, key: string, args: any[]) {
    Capturer.saveImage(args[0], args[1])
    if (Capturer.window) {
      this.deps.windowManager.sendCommandTo(Capturer.window, command, key, true)
    }
  }

  private handleCapturerConfigUpdate(command: string, key: string, args: any[]) {
    Capturer.configUpdate(args[0])
    this.sendToMainWindow(command, key, true)
  }

  // ===== NodePty =====

  private handleNodePtyInit(command: string, key: string) {
    NodePTY.initNodePty().then((res) => {
      this.sendToMainWindow(command, key, { code: 0, data: res })
    })
  }

  private handleNodePtyExec(command: string, key: string, args: any[]) {
    NodePTY.exec(args[0], args[1], args[2], command, key)
  }

  private handleNodePtyWrite(args: any[]) {
    NodePTY.write(args[0], args[1])
  }

  private handleNodePtyClear(command: string, key: string, args: any[]) {
    NodePTY.clean(args[0])
    this.sendToMainWindow(command, key, { code: 0 })
  }

  private handleNodePtyResize(command: string, key: string, args: any[]) {
    NodePTY.resize(args[0], args[1])
    this.sendToMainWindow(command, key, { code: 0 })
  }

  private handleNodePtyStop(command: string, key: string, args: any[]) {
    NodePTY.stop(args[0])
    this.sendToMainWindow(command, key, { code: 0 })
  }

  // ===== SiteSucker =====

  private handleSiteSuckerRun(args: any[]) {
    const url = args[0]
    this.deps.siteSuckerManager.show(url)
  }

  private handleSiteSuckerSetup(command: string, key: string) {
    const setup = this.deps.configManager.getConfig('tools.siteSucker')
    this.sendToMainWindow(command, key, setup)
  }

  private handleSiteSuckerSetupSave(command: string, key: string, args: any[]) {
    this.deps.configManager.setConfig('tools.siteSucker', args[0])
    this.sendToMainWindow(command, key, true)
    this.deps.siteSuckerManager.updateConfig(args[0])
  }

  // ===== 自定义语言 =====

  private handleCustomerLangUpdate(args: any[]) {
    const langKey = args[0]
    const langValue = args[1]
    CustomerLang.lang[langKey] = langValue
    // 更新语言
    AppI18n().global.setLocaleMessage(langKey, langValue)
  }

  // ===== OAuth =====

  private handleOAuthStart(command: string, key: string) {
    OAuth.startOAuth()
      .then((res) => {
        this.sendToMainWindow(command, key, { code: 0, data: res })
      })
      .catch((err) => {
        this.sendToMainWindow(command, key, { code: 1, msg: `${err}` })
      })
  }

  private handleOAuthCancel(command: string, key: string) {
    OAuth.cancel()
    this.sendToMainWindow(command, key, { code: 0, data: true })
  }

  private handleOAuthLicenseFetch(command: string, key: string) {
    OAuth.fetchUserLicense()
      .then((res) => {
        this.sendToMainWindow(command, key, JSON.parse(JSON.stringify(res)))
      })
      .catch()
  }

  private handleOAuthLicenseDelBind(command: string, key: string, args: any[]) {
    OAuth.delBind(args[0], args[1]).then((res) => {
      this.sendToMainWindow(command, key, JSON.parse(JSON.stringify(res)))
    })
  }

  private handleOAuthLicenseAddBind(command: string, key: string, args: any[]) {
    OAuth.addBind(args[0], args[1]).then((res) => {
      this.sendToMainWindow(command, key, JSON.parse(JSON.stringify(res)))
    })
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
