import {
  performanceDiagnosticNow,
  performanceDiagnosticElapsed
} from '@shared/PerformanceDiagnostics'
import { EventEmitter } from 'events'
import { app, BrowserWindow, globalShortcut, safeStorage, session } from 'electron'
import is from 'electron-is'
import WindowManager from './ui/WindowManager'
import MenuManager from './ui/MenuManager'
import TrayManager from './ui/TrayManager'
import { getLanguage, getLocale, logger } from './utils'
import { applyLanguagePayload, I18nT } from '@lang/runtime'
import { ForkManager } from './core/ForkManager'
import AppHelper from './core/AppHelper'
import { WindowsPrivilegeCoordinator } from './core/WindowsPrivilegeCoordinator'
import { WindowsPrivilegeBridge } from './core/WindowsPrivilegeBridge'
import {
  applyWindowsPrivilegeSnapshot,
  isWindowsProcessElevated,
  setWindowsPrivilegeProvider,
  withWindowsPrivilegeInteraction,
  type WindowsPrivilegeSnapshot
} from '@shared/WindowsPrivilege'
import { WINDOWS_ELEVATION_CHOICE_VERSION } from '@shared/WindowsHelperState'
import ScreenManager from './core/ScreenManager'
import AppLog from './core/AppLog'
import { join, resolve } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import AppNodeFnManager from './core/AppNodeFn'
import ServiceProcessManager from './core/ServiceProcess'
import ServiceVersionManager from './core/ServiceVersionManager'
import { AppHelperCheck } from '@shared/AppHelperCheck'
import Helper from '../fork/Helper'
import ConfigManager from './core/ConfigManager'
import MCPConfigManager from './core/MCPConfigManager'
import MCPBridgeManager from './core/MCPBridgeManager'
import { MCPRuntime } from './core/MCPRuntime'
import ServerManager from './core/ServerManager'
import IPCHandler from './core/IPCHandler'
import { CheckBrewOrPort } from './utils/CheckBrew'
import { setServerDirectoryPermissionDeniedHandler } from './utils/ServerPath'
import {
  createDeferredHelperInstallRequest,
  type DirectoryPermissionFailureReason
} from './utils/ServerDirectory'
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
import { getElectronResourcePath } from './utils/AppRuntimePath'
import type { TrayAction, TrayPopupSide } from '@shared/Tray'
import PluginManager from './plugins/PluginManager'
import { appDebugLog, isWindows } from '@shared/utils'
import { randomUUID } from 'node:crypto'
import {
  logServiceStopBoundary,
  timeServiceStopBoundary,
  withServiceStopDiagnostics
} from '@shared/ServiceStopDiagnostics'

export default class Application extends EventEmitter {
  isReady: boolean = false
  configManager: ConfigManager
  mcpConfigManager: MCPConfigManager
  mcpRuntime?: MCPRuntime
  mcpBridgeManager?: MCPBridgeManager
  menuManager!: MenuManager
  trayManager!: TrayManager
  windowManager!: WindowManager
  mainWindow?: BrowserWindow
  trayWindow?: BrowserWindow
  forkManager?: ForkManager
  languageRepository: LanguageRepository
  languageCoordinator: LanguageCoordinator
  pluginManager: PluginManager

  // 新提取的管理器
  private serverManager: ServerManager
  private ipcHandler!: IPCHandler
  private stopPromise?: Promise<void>
  private serverDirectoryInitialization!: Promise<boolean>
  private serverDirectoryRetry?: Promise<boolean>
  // 权限选择必须等待主窗口 mount/IPC 完成；冷启动阶段仅保留待处理选择。
  private rendererReady = false
  private windowsPrivilege!: WindowsPrivilegeCoordinator
  private serverDirectoryHelperInstall = createDeferredHelperInstallRequest(
    () => {
      void withWindowsPrivilegeInteraction(true, () => this.retryServerDataDirectory())
    },
    (reason) => this.notifyDataDirectoryFailure(reason)
  )

  constructor() {
    super()
    this.setupInitialConfig()
    this.configManager = new ConfigManager()
    // 在数据目录初始化之前挂接 provider；启动恢复也走同一分流，禁止直接安装 Helper。
    this.windowsPrivilege = new WindowsPrivilegeCoordinator({
      read: () => ({
        method: this.configManager.getConfig('setup.windowsElevationMethod'),
        choiceVersion: this.configManager.getConfig('setup.windowsElevationChoiceVersion')
      }),
      save: (method, version) => this.configManager.setWindowsElevationChoice(method, version),
      elevated: isWindowsProcessElevated,
      onNotificationError: (error) => {
        void appDebugLog('[WindowsPrivilege][notify]', String(error)).catch(() => {})
      },
      publish: (snapshot) => this.publishWindowsPrivilege(snapshot),
      dismiss: (id) => {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) return
        const command = 'APP-Windows-Privilege-Choice-Closed'
        this.windowManager.sendCommandTo(this.mainWindow, command, command, id)
      },
      prompt: (choice) => {
        if (!this.rendererReady || !this.mainWindow || this.mainWindow.isDestroyed()) return false
        this.mainWindow.show()
        const command = 'APP-Windows-Privilege-Choice'
        this.windowManager.sendCommandTo(this.mainWindow, command, command, choice)
        return true
      }
    })
    if (isWindows()) {
      setWindowsPrivilegeProvider({
        resolve: async (request) => {
          const method = await this.windowsPrivilege.resolve(request)
          if (method === 'helper' && request.operation === 'helper/ready')
            await this.ensureWindowsHelper(request.interactive)
          return method
        },
        acquire: () => this.windowsPrivilege.acquire(this),
        release: (lease) => this.windowsPrivilege.release(lease, this)
      })
      // before-quit 会被 Launcher 延迟以等待 stop；此时释放协调器会让 hosts
      // 清理无法申请 UAC。正常路径在 doStop 末尾释放，真正退出时再幂等兜底。
      app.once('will-quit', () => this.windowsPrivilege.dispose())
    }
    this.mcpConfigManager = new MCPConfigManager()
    this.mcpBridgeManager = new MCPBridgeManager()
    this.serverManager = new ServerManager(this.configManager)
    this.pluginManager = new PluginManager({
      stopPluginServices: (moduleId) => this.stopPluginServices(moduleId),
      licenseCheck: process.env.FLYENV_PLUGIN_SMOKE === '1' ? async () => true : undefined,
      // OS account keychain (Keychain / DPAPI / system keyring) encryption for
      // the plugin install secret, so copying the secret file to another
      // machine yields undecryptable ciphertext. Falls back to plain storage
      // where no system encryption is available.
      secretProtect: safeStorage.isEncryptionAvailable()
        ? {
            encrypt: (text) => safeStorage.encryptString(text).toString('base64'),
            decrypt: (data) => safeStorage.decryptString(Buffer.from(data, 'base64'))
          }
        : undefined
    })
    setServerDirectoryPermissionDeniedHandler((reason) => {
      this.serverDirectoryHelperInstall.notifyPermissionDenied(reason)
    })
    this.serverDirectoryInitialization = this.serverManager.initServerDir().then((ready) => {
      global.Server.DataDirectoryReady = ready
      return ready
    })

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
    await this.serverDirectoryInitialization
    if (isWindows()) this.publishWindowsPrivilege(await this.windowsPrivilege.snapshot())
    await this.pluginManager.refresh()
    if (process.env.FLYENV_PLUGIN_SMOKE === '1') {
      await this.preparePluginRuntimeSmoke()
    }
    ;(global.Server as any).Plugins = this.pluginManager.getForkSnapshot()

    AppNodeFnManager.nativeTheme_watch()
    AppNodeFnManager.configManager = this.configManager

    this.menuManager = new MenuManager()
    this.menuManager.setup()

    this.serverManager.setProxy()
    this.serverManager.updateGlobalConfig()
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
      appNodeFnManager: AppNodeFnManager,
      pluginManager: this.pluginManager,
      onPluginsChanged: () => this.syncPlugins(),
      retryDataDirectory: () => this.retryServerDataDirectory(),
      windowsPrivilege: this.windowsPrivilege
    })

    this.setupEventHandlers()
    this.ipcHandler.init()
    this.initFontAccessPermission()
    this.initAppHelper()
    this.initForkManager()
    if (process.env.FLYENV_PLUGIN_SMOKE === '1') {
      void this.runPluginRuntimeSmoke()
    }

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

  private async stopPluginServices(moduleId: string): Promise<{ stopped: true }> {
    return ServiceProcessManager.runLifecycle(moduleId, 'stop', () =>
      this.stopPluginServicesImpl(moduleId)
    )
  }

  private async stopPluginServicesImpl(moduleId: string): Promise<{ stopped: true }> {
    // statusOf 只用于界面展示，会隐藏单独打开的伴随面板；插件卸载/禁用必须清掉原始登记中的
    // 服务和 companion 两类进程，否则模块代码被移除后仍可能遗留一个无法再管理的面板。
    const registered = [...(ServiceProcessManager.servicePID[moduleId] ?? [])].filter(
      ({ pid }) => !!pid
    )
    if (!registered.length) return { stopped: true }
    if (!this.forkManager) throw new Error(`Fork manager is not ready for ${moduleId}`)

    // 模块屏障已等待所有旧生命周期请求；与退出/MCP 共用并行停止及派发代次保护。
    // 全部项结算后才决定是否允许卸载，不能因一项失败提前撤掉其他项的模块代码。
    const results = await ServiceProcessManager.stopRegisteredInstances([moduleId])
    const failures = results
      .filter(({ status }) => status === 'failed')
      .map(({ pid, error }) => `PID=${pid}: ${error}`)

    if (failures.length || ServiceProcessManager.servicePID[moduleId]?.some(({ pid }) => !!pid)) {
      throw new Error(`Service or companion ${moduleId} is still running: ${failures.join('\n')}`)
    }
    return { stopped: true }
  }

  private async preparePluginRuntimeSmoke() {
    if (process.env.FLYENV_PLUGIN_SMOKE_PHASE !== 'install') return
    const resultPath = process.env.FLYENV_PLUGIN_SMOKE_RESULT
    try {
      const item = (await this.pluginManager.listCatalog()).find(
        (candidate) => candidate.id === 'runtime-smoke-plugin'
      )
      if (!item?.artifact.sha256) throw new Error('runtime smoke catalog item is missing checksum')
      await this.pluginManager.install({
        id: item.id,
        version: item.version,
        url: item.artifact.url,
        sha256: item.artifact.sha256,
        source: 'official'
      })
      const dataPath = join(global.Server.BaseDir!, 'plugins-data/runtime-smoke-plugin/state.txt')
      await mkdir(resolve(dataPath, '..'), { recursive: true })
      await writeFile(dataPath, 'preserve-me\n')
      if (resultPath) {
        await writeFile(
          resultPath,
          JSON.stringify({ ok: true, phase: 'installed', checkpoints: ['install'] })
        )
      }
      setTimeout(() => app.quit(), 250)
    } catch (error) {
      if (resultPath) {
        await writeFile(
          resultPath,
          JSON.stringify({ ok: false, phase: 'install', checkpoints: [], error: String(error) })
        )
      }
      setTimeout(() => app.quit(), 250)
    }
  }

  private async runPluginRuntimeSmoke() {
    if (process.env.FLYENV_PLUGIN_SMOKE_PHASE !== 'verify') return
    const resultPath = process.env.FLYENV_PLUGIN_SMOKE_RESULT
    const checkpoints: string[] = ['install', 'relaunch']
    try {
      await new Promise<void>((resolveReady) => {
        if (this.isReady) {
          resolveReady()
          return
        }
        this.once('ready', () => resolveReady())
        setTimeout(resolveReady, 30_000)
      })
      const routeResult = await this.mainWindow?.webContents.executeJavaScript(
        `(async () => { let routes = []; for (let i = 0; i < 40; i += 1) { const router = window.__FLYENV_PLUGIN_ROUTER__; routes = router?.getRoutes?.().map((item) => item.path) ?? []; if (routes.includes('/runtime-smoke-plugin')) break; await new Promise((r) => setTimeout(r, 250)); } const route = routes.includes('/runtime-smoke-plugin'); location.hash = '#/runtime-smoke-plugin'; return { hash: location.hash, ready: route === true, routes } })()`,
        true
      )
      if (!routeResult?.ready || !String(routeResult.hash).includes('runtime-smoke-plugin')) {
        throw new Error(`renderer plugin route was not loaded: ${JSON.stringify(routeResult)}`)
      }
      checkpoints.push('renderer-route')

      ;(global.Server as any).Plugins = this.pluginManager.getForkSnapshot()
      const versions = await this.runPluginRuntimeFork('allInstalledVersions', {
        runtime: true
      })
      if (!Array.isArray(versions) || versions[0]?.version !== '1.0.0') {
        throw new Error(`Fork plugin version scan did not return v1: ${JSON.stringify(versions)}`)
      }
      checkpoints.push('fork-version-scan')
      // 烟雾验证也走正式服务登记链：start 终态拿到 PID 与原样 stop 参数后先登记，随后
      // 才发送 stop。退出若恰好并发开始，会等待整个消费者；stop 失败则登记保留给退出重试。
      await ServiceProcessManager.runLifecycle('runtime-smoke-plugin', 'start', async () => {
        const startItem = { version: '1.0.0', bin: 'runtime-smoke' }
        const startResult = await this.runPluginRuntimeFork('startService', startItem)
        const pid = startResult?.['APP-Service-Start-PID']
        if (pid) {
          ServiceProcessManager.addPid(
            'runtime-smoke-plugin',
            `${pid}`,
            startResult?.['APP-Service-Start-Item'] ?? startItem,
            startResult?.['APP-Service-Stop-Args'] ?? [{ ...startItem, pid: `${pid}` }]
          )
        }
        const snapshot = pid
          ? ServiceProcessManager.stopSnapshotFor('runtime-smoke-plugin', `${pid}`)
          : undefined
        const stopResult = await this.runPluginRuntimeForkArgs(
          'stopService',
          ...(snapshot?.args ?? [startItem])
        )
        if (snapshot)
          ServiceProcessManager.finishStopSnapshot(
            'runtime-smoke-plugin',
            snapshot,
            (stopResult?.['APP-Service-Stop-PID'] ?? []).map(String)
          )
      })
      checkpoints.push('start-stop')

      // VersionManager data flow (renderer): the static version list must load
      // through brewStore.module(typeFlag).fetchStatic() while the plugin is enabled.
      await this.expectPluginSmokeVersionList('enabled')
      checkpoints.push('version-list')

      await this.pluginManager.update('runtime-smoke-plugin')
      await this.syncPlugins()
      if (
        (await this.pluginManager.listInstalled()).find(
          (item) => item.id === 'runtime-smoke-plugin'
        )?.version !== '2.0.0'
      ) {
        throw new Error('plugin update did not activate v2')
      }
      checkpoints.push('update')

      // Hot reload, no restart: fork dispatch must pick up the updated plugin
      // code (Node import() cache busted), and the renderer route must stay.
      const hotVersions = await this.runPluginRuntimeFork('allInstalledVersions', {
        runtime: true
      })
      if (!Array.isArray(hotVersions) || hotVersions[0]?.version !== '2.0.0') {
        throw new Error(`Fork plugin hot update did not return v2: ${JSON.stringify(hotVersions)}`)
      }
      await this.expectPluginSmokeRoute(true)
      checkpoints.push('hot-fork-update')

      await this.pluginManager.setEnabled('runtime-smoke-plugin', false)
      await this.syncPlugins()
      checkpoints.push('disable')
      // Disabled without restart: fork dispatch must stop resolving the module
      // and the renderer route must disappear.
      await this.expectPluginSmokeForkRejected('allInstalledVersions')
      await this.expectPluginSmokeRoute(false)
      checkpoints.push('hot-disable')
      // Regression guard: while the plugin is disabled, any still-alive caller
      // (a not-yet-unmounted computed, a group card, ...) can recreate the
      // BrewStore module record with isPlugin=false. Re-enable must heal that
      // stale record instead of leaving every fetch on the wrong fork channel.
      await this.poisonPluginSmokeBrewModule()
      checkpoints.push('poison-brew-module')

      await this.pluginManager.setEnabled('runtime-smoke-plugin', true)
      await this.syncPlugins()
      checkpoints.push('re-enable')
      const reenabledVersions = await this.runPluginRuntimeFork('allInstalledVersions', {
        runtime: true
      })
      if (!Array.isArray(reenabledVersions) || reenabledVersions[0]?.version !== '2.0.0') {
        throw new Error(
          `Fork plugin re-enable did not restore dispatch: ${JSON.stringify(reenabledVersions)}`
        )
      }
      await this.expectPluginSmokeRoute(true)
      checkpoints.push('hot-reenable')
      // Re-enabled without restart: the renderer module record was dropped on
      // disable, so the VersionManager fetch path must rebuild it and still
      // load the version list.
      await this.expectPluginSmokeVersionList('re-enabled')
      checkpoints.push('hot-reenable-version-list')
      await this.expectPluginSmokeInstalledList('re-enabled')
      checkpoints.push('hot-reenable-installed-list')

      await this.pluginManager.uninstall('runtime-smoke-plugin')
      await this.syncPlugins()
      checkpoints.push('uninstall')
      await this.expectPluginSmokeForkRejected('allInstalledVersions')
      await this.expectPluginSmokeRoute(false)
      checkpoints.push('hot-uninstall')
      await this.pluginManager.refresh()
      if (
        (await this.pluginManager.listInstalled()).some(
          (item) => item.id === 'runtime-smoke-plugin'
        )
      ) {
        throw new Error('plugin remained installed after uninstall')
      }
      checkpoints.push('pending-cleanup')

      const dataPath = join(global.Server.BaseDir!, 'plugins-data/runtime-smoke-plugin/state.txt')
      if ((await readFile(dataPath, 'utf8')) !== 'preserve-me\n') {
        throw new Error('plugin runtime data was not preserved')
      }
      checkpoints.push('runtime-data-preserved')
      if (resultPath) await writeFile(resultPath, JSON.stringify({ ok: true, checkpoints }))
    } catch (error) {
      if (resultPath)
        await writeFile(
          resultPath,
          JSON.stringify({ ok: false, checkpoints, error: String(error) })
        )
    } finally {
      setTimeout(() => app.quit(), 250)
    }
  }

  private runPluginRuntimeFork(fn: string, item: unknown) {
    return this.runPluginRuntimeForkArgs(fn, item)
  }

  private runPluginRuntimeForkArgs(fn: string, ...args: unknown[]) {
    if (!this.forkManager) return Promise.reject(new Error('Fork manager is not initialized'))
    return new Promise<any>((resolveFork, rejectFork) => {
      this.forkManager!.send('runtime-smoke-plugin', fn, ...args)
        .on(() => {})
        .then((result: any) => {
          if (result?.code === 0) {
            resolveFork(result?.data?.code !== undefined ? result.data.data : result.data)
          } else rejectFork(new Error(result?.msg ?? `Fork ${fn} failed`))
        })
        .catch(rejectFork)
    })
  }

  private async expectPluginSmokeForkRejected(fn: string) {
    let resolved = false
    try {
      await this.runPluginRuntimeFork(fn, { runtime: true })
      resolved = true
    } catch {}
    if (resolved) {
      throw new Error(`Fork ${fn} unexpectedly resolved after the plugin was disabled/removed`)
    }
  }

  private async expectPluginSmokeRoute(expectPresent: boolean) {
    const result = await this.mainWindow?.webContents.executeJavaScript(
      `(async () => { for (let i = 0; i < 40; i += 1) { const router = window.__FLYENV_PLUGIN_ROUTER__; const routes = router?.getRoutes?.().map((item) => item.path) ?? []; if (routes.includes('/runtime-smoke-plugin') === ${expectPresent}) return { ok: true }; await new Promise((r) => setTimeout(r, 250)); } const router = window.__FLYENV_PLUGIN_ROUTER__; return { ok: false, routes: router?.getRoutes?.().map((item) => item.path) ?? [] } })()`,
      true
    )
    if (!result?.ok) {
      throw new Error(
        `renderer plugin route hot-sync failed (expectPresent=${expectPresent}): ${JSON.stringify(result)}`
      )
    }
  }

  /**
   * Drives the same renderer data flow the VersionManager static tab uses:
   * brewStore.module(typeFlag).fetchStatic() -> IPC fetchAllOnlineVersion.
   * The localStorage fetchVerion cache is cleared first so the assertion always
   * exercises the live IPC path, not a cached response.
   */
  private async expectPluginSmokeVersionList(label: string) {
    const result = await this.mainWindow?.webContents.executeJavaScript(
      `(async () => {
        try {
          localStorage.removeItem('fetchVerion-runtime-smoke-plugin')
          const storeFn = window.__FLYENV_PLUGIN_BREW_STORE__
          if (!storeFn) return { ok: false, error: 'BrewStore global missing' }
          const brewStore = storeFn()
          const mod = brewStore.module('runtime-smoke-plugin')
          if (!mod.isPlugin) return { ok: false, error: 'module was not recreated as a plugin module', isPlugin: mod.isPlugin }
          mod.fetchStatic()
          for (let i = 0; i < 40; i += 1) {
            if (!mod.staticFetching) break
            await new Promise((r) => setTimeout(r, 250))
          }
          return { ok: true, count: mod.static.length, fetching: mod.staticFetching }
        } catch (e) {
          return { ok: false, error: String(e) }
        }
      })()`,
      true
    )
    if (!result?.ok || !(result?.count > 0)) {
      throw new Error(
        `renderer plugin version list failed to load (${label}): ${JSON.stringify(result)}`
      )
    }
  }

  /**
   * Simulates the renderer state that caused the disable/re-enable installed
   * version bug: while the plugin is disabled, a still-alive caller recreates
   * the BrewStore module record, and because AppModules no longer contains the
   * plugin the record is created with isPlugin=false.
   */
  private async poisonPluginSmokeBrewModule() {
    const result = await this.mainWindow?.webContents.executeJavaScript(
      `(async () => {
        try {
          const storeFn = window.__FLYENV_PLUGIN_BREW_STORE__
          if (!storeFn) return { ok: false, error: 'BrewStore global missing' }
          const mod = storeFn().module('runtime-smoke-plugin')
          return { ok: mod.isPlugin === false, isPlugin: mod.isPlugin }
        } catch (e) {
          return { ok: false, error: String(e) }
        }
      })()`,
      true
    )
    if (!result?.ok) {
      throw new Error(`failed to poison brew module while disabled: ${JSON.stringify(result)}`)
    }
  }

  /**
   * After re-enable, the poisoned BrewStore record must be reconciled back to a
   * plugin module and fetchInstalled must go through the plugin fork channel
   * (app-fork:<typeFlag>) again, returning the installed versions.
   */
  private async expectPluginSmokeInstalledList(label: string) {
    const result = await this.mainWindow?.webContents.executeJavaScript(
      `(async () => {
        try {
          const storeFn = window.__FLYENV_PLUGIN_BREW_STORE__
          if (!storeFn) return { ok: false, error: 'BrewStore global missing' }
          const mod = storeFn().module('runtime-smoke-plugin')
          if (!mod.isPlugin) {
            return { ok: false, error: 'stale module record was not reconciled to a plugin module' }
          }
          mod.installedFetched = false
          await mod.fetchInstalled()
          return { ok: mod.installed.length > 0, count: mod.installed.length }
        } catch (e) {
          return { ok: false, error: String(e) }
        }
      })()`,
      true
    )
    if (!result?.ok) {
      throw new Error(
        `renderer plugin installed list failed to load (${label}): ${JSON.stringify(result)}`
      )
    }
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
    Helper.appHelper = AppHelper

    AppHelper.onStatusMessage((message) => {
      this.handleHelperStatusMessage(message)
    })

    AppHelper.onSuduExecSuccess(() => {
      // Windows 安装由当前权限请求持有租约；此回调再恢复目录会递归申请租约而死锁。
      if (isWindows()) return
      return this.serverManager.initServerDir().then((ready) => {
        global.Server.DataDirectoryReady = ready
        if (ready && this.mainWindow) {
          this.windowManager.sendCommandTo(
            this.mainWindow!,
            'APP-Data-Directory-Ready',
            'APP-Data-Directory-Ready',
            true
          )
        }
      })
    })
  }

  /** 后台只检查健康，交互请求才可恢复/安装；安装与业务 UAC 共用全局租约。 */
  private async ensureWindowsHelper(interactive = true) {
    if (!interactive || this.windowsPrivilege.isClosing()) {
      // 退出只使用已安装且健康的 Helper；不能在关闭窗口时启动安装/修复流程。
      await AppHelperCheck()
      return
    }
    const lease = await this.windowsPrivilege.acquire(this)
    try {
      // 排队期间设置可能已经改变；安装前重新读取主进程配置，禁止旧请求复活 Helper。
      if (
        (await this.windowsPrivilege.resolve({ operation: 'helper/install', interactive })) !==
        'helper'
      )
        throw new Error('Authorization method changed before Helper installation')
      await AppHelper.initHelper()
    } finally {
      this.windowsPrivilege.release(lease, this)
    }
  }

  /** 主进程配置是唯一权威，广播给主窗口、托盘和全部 fork，禁止静默改用户方式。 */
  private publishWindowsPrivilege(snapshot: WindowsPrivilegeSnapshot) {
    applyWindowsPrivilegeSnapshot(snapshot)
    this.forkManager?.broadcastWindowsPrivilege(snapshot)
    const command = 'APP-Windows-Elevation-Method-Changed'
    // 权限控制器只在主窗口注册；托盘通过自己的状态广播获得展示数据。
    for (const win of [this.mainWindow]) {
      if (!win || win.isDestroyed()) continue
      try {
        // 某个窗口发送失败时继续通知其他窗口；各接收者自行过滤旧 revision。
        this.windowManager.sendCommandTo(win, command, command, snapshot)
      } catch (error) {
        void appDebugLog('[WindowsPrivilege][publish]', String(error)).catch(() => {})
      }
    }
  }

  private retryServerDataDirectory(): Promise<boolean> {
    if (global.Server.DataDirectoryReady) {
      return Promise.resolve(true)
    }
    if (this.serverDirectoryRetry) {
      return this.serverDirectoryRetry
    }

    this.serverDirectoryHelperInstall.resetRequest()
    const retry = this.serverManager
      .initServerDir()
      .then((ready) => {
        global.Server.DataDirectoryReady = ready
        if (ready && this.mainWindow) {
          this.windowManager.sendCommandTo(
            this.mainWindow,
            'APP-Data-Directory-Ready',
            'APP-Data-Directory-Ready',
            true
          )
        }
        return ready
      })
      .finally(() => {
        if (this.serverDirectoryRetry === retry) {
          this.serverDirectoryRetry = undefined
        }
      })
    this.serverDirectoryRetry = retry
    return retry
  }

  private notifyDataDirectoryFailure(reason: DirectoryPermissionFailureReason) {
    if (!this.mainWindow) {
      return
    }
    const key = 'APP-Data-Directory-Failure'
    this.windowManager.sendCommandTo(this.mainWindow, key, key, { reason })
  }

  /**
   * 处理 Helper 状态消息
   */
  private handleHelperStatusMessage(message: {
    state: string
    reason?: string
    installationPerformed?: boolean
  }) {
    // Windows 业务请求会反复确认 Helper 健康；检查/恢复成功不等于又安装了一次。
    // 设置切换/修复由其控制器在响应成功后提示“已就绪”；首次业务的真实安装仍
    // 广播成功，保留原 renderer 的 busy 过滤，避免设置操作得到两份成功提示。
    if (isWindows() && message.state === 'checkSuccess' && !message.installationPerformed) return
    if (!this.mainWindow) {
      return
    }

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
        // renderer 结合显式选择过滤通知，不再由失败通知触发隐式 UAC 切换。
        status: message.state,
        reason: message.reason
      })
    }
  }

  /**
   * 初始化 Fork 管理器
   */
  private initForkManager() {
    this.forkManager = new ForkManager(getElectronResourcePath('fork.mjs'))
    // 在惰性创建任何 worker 前注入桥接层，否则早期 worker 无法等待首次权限选择。
    this.forkManager.windowsPrivilegeBridge = new WindowsPrivilegeBridge(
      this.windowsPrivilege,
      (interactive) => this.ensureWindowsHelper(interactive)
    )
    this.forkManager.setLanguageSnapshotProvider(() => this.languageCoordinator.snapshot())
    this.forkManager.on(({ key, info }: { key: string; info: any }) => {
      // 兼容旧事件但不再应用自动 fallback；模式变化只能通过显式选择提交。
      if (key === 'App-Windows-Elevation-Method-Fallback') {
        return
      }
      // 旧初始化请求只能作用于已确认 Helper 的 Windows 用户，未选择/UAC 不提示安装。
      if (key === 'App-Need-Init-FlyEnv-Helper') {
        if (
          !isWindows() ||
          (global.Server.WindowsElevationChoiceVersion === WINDOWS_ELEVATION_CHOICE_VERSION &&
            global.Server.WindowsElevationMethod === 'helper')
        )
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

    // MCP Server 需要 forkManager 句柄；仅在自动启动或首次手动启动时加载实现。
    this.mcpRuntime = new MCPRuntime(this.mcpConfigManager, async () => {
      const { default: MCPServer } = await import('./core/MCPServer')
      return new MCPServer(this.forkManager!, this.mcpConfigManager, this.configManager)
    })
    this.ipcHandler.updateDependencies({
      forkManager: this.forkManager,
      mcpRuntime: this.mcpRuntime
    })
    void this.mcpRuntime.startOnLaunch()

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
      this.serverManager.updateGlobalConfig()
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

    this.ipcHandler.on('application:renderer-initialized', () => {
      // 延后呈现选择及目录恢复，避免启动时窗口还不存在导致授权请求失去宿主。
      this.rendererReady = true
      this.windowsPrivilege.present()
      this.serverDirectoryHelperInstall.markReady()
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

  private async syncPlugins() {
    await this.pluginManager.refresh()
    ;(global.Server as any).Plugins = this.pluginManager.getForkSnapshot()
    if (this.forkManager) {
      this.forkManager.broadcastServer(this.serverManager.getGlobalServer())
    }
    this.sendGlobalServerUpdate()
  }

  show(page = 'index') {
    if (page === 'index') {
      this.trayManager?.closePopup()
    }
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

    this.trayManager.on('click', (x, y, arrowOffset, show, side) => {
      this.handleTrayClick(x, y, arrowOffset, show, side)
    })

    this.trayManager.on('double-click', () => {
      this.show('index')
    })

    this.trayManager.on('action', (action: TrayAction, typeFlag?: string) => {
      this.handleTrayAction(action, typeFlag)
    })

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
        // 首次显示前先把弹窗方向/箭头同步给渲染层
        this.trayManager.pushPopupLayout()
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

  private handleTrayClick(
    x: number,
    y: number,
    arrowOffset: number,
    show: boolean,
    side: TrayPopupSide
  ) {
    if (show) {
      // 布局同步、移动、显示及失焦关闭统一由 TrayManager 管理
      this.trayManager.openPopup(x, y, side, arrowOffset)
    } else {
      this.trayManager.closePopup()
    }
  }

  private handleTrayAction(action: TrayAction, typeFlag?: string) {
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
      case 'startupGroupDo':
        this.windowManager.sendCommandTo(
          this.mainWindow!,
          'APP:Tray-Command',
          'APP:Tray-Command',
          'startupGroupDo',
          typeFlag
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
    // 只创建本轮退出的诊断 ID；已有 stopPromise 继续防重，不引入退出状态机或批次协议。
    const quitId = randomUUID()
    const quitStarted = performanceDiagnosticNow()
    const quitData = { quitId }
    logServiceStopBoundary('quit.begin', quitData)
    logger.info('[FlyEnv] application stop !!!')
    // 菜单退出、app.quit 和 relaunch 共用此顺序；已确认授权在并行清理期间继续有效。
    this.windowManager?.setWillQuit(true)
    this.windowsPrivilege.beginShutdown()
    // 同步关闭两层入口，再等待已接纳请求的完整终态消费者；尤其要等迟到的 start PID
    // 登记完成后才允许并行停止取得最终表。排队请求靠 AsyncLocalStorage 通行证继续运行；
    // 尚未完成首次权限方式选择的请求由 beginShutdown 取消并结算，已选方式的请求可收尾。
    ServiceProcessManager.beginLifecycleShutdown()
    this.forkManager?.beginServiceLifecycleShutdown()
    await timeServiceStopBoundary('quit.service-drain', quitData, () =>
      ServiceProcessManager.drainLifecycleRequests()
    )
    // 保留两个屏障的先后关系：服务终态消费者可能继续派发配置/hosts 等原始请求。
    // 只有消费者结束后再 drain fork，才能保证随后并行清理 hosts 时没有旧写入回流。
    await timeServiceStopBoundary('quit.fork-drain', quitData, () =>
      this.forkManager?.drainServiceLifecycleRequests()
    )
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
    // 门禁及 drain 已完成：HTTP/MCP 关闭、服务停止和 main 的 hosts 清理互不依赖。
    // 每个任务保留自己的计时及错误接收者；allSettled 等全部收尾，即使某个任务或
    // 错误日志意外拒绝，也不能提前销毁其他任务正在使用的 worker/权限协调器。
    // parallel-cleanup.completed 仅表示整组等待结束，单项失败仍看对应 failed 日志。
    // 快捷键/屏幕/PTY 等上面的同步清理没有可重叠的 await，继续直接执行。
    try {
      await timeServiceStopBoundary('quit.parallel-cleanup', quitData, () =>
        Promise.allSettled([
          (async () => {
            try {
              await timeServiceStopBoundary('quit.http-stop', quitData, () =>
                httpServerRuntime.peek()?.stopAll()
              )
            } catch (e) {
              console.log('HttpServer.stopAll e: ', e)
            }
          })(),
          (async () => {
            try {
              await timeServiceStopBoundary('quit.mcp-stop', quitData, () =>
                this.mcpRuntime?.stopLoaded()
              )
            } catch (e) {
              console.log('mcpRuntime.stop e: ', e)
            }
          })(),
          (async () => {
            try {
              // 仍使用普通权限执行 Windows 服务 kill；hosts 的 UAC 独立计时。
              // 服务实例本身已并行，继续复用既有首表与停止结果登记。
              await timeServiceStopBoundary('quit.services-stop', quitData, () =>
                withWindowsPrivilegeInteraction(true, () => this.serverManager.stopServer())
              )
            } catch (e) {
              console.log('serverManager.stopServer e: ', e)
            }
          })(),
          (async () => {
            try {
              // 用户主动退出可申请已选 UAC；closing 禁止新的权限方式选择。
              // main 的文件操作不使用服务 worker；drain 已收口旧 hosts 写入，所以
              // 可以与服务停止重叠。诊断/交互上下文只绑定本分支，不串到其他任务。
              await withServiceStopDiagnostics({ module: 'quit-hosts', quitId }, () =>
                timeServiceStopBoundary('quit.hosts-cleanup', quitData, () =>
                  withWindowsPrivilegeInteraction(true, () => this.serverManager.cleanHosts())
                )
              )
            } catch (error) {
              // UAC 取消、拒绝或未知结果仍记录真实失败并继续退出，不自动重放写入。
              logger.warn('[FlyEnv][quit][hosts-cleanup]', error)
            }
          })()
        ])
      )
      try {
        // 服务停止依赖 worker；destroy 还会释放 EnvSync provider。等并行组全部
        // 结算后再回收，避免截断停止请求或改变 hosts 清理中的依赖生命周期。
        await timeServiceStopBoundary('quit.forks-destroy', quitData, () =>
          this.forkManager?.destroy()
        )
      } catch (e) {
        console.log('forkManager.destroy e: ', e)
      }
    } finally {
      // hosts 可能先于服务结束；不能在单个 hosts 分支的 finally 中撤销其他任务的
      // 提权租约。并行组和 fork 回收均已收尾后，才统一释放退出权限资源。
      this.windowsPrivilege.dispose()
    }
    try {
      this.trayManager?.destroy()
    } catch (e) {
      console.log('trayManager.destroy e: ', e)
    }
    // returned 仅表示 doStop 已收尾，不把被原 catch 记录的失败解释为所有服务/hosts 成功。
    logServiceStopBoundary('quit.returned', {
      quitId,
      durationMs: performanceDiagnosticElapsed(quitStarted)
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
}
