import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { transformSync } from 'esbuild'

const load = (file: string, dependencies: Record<string, unknown>) => {
  const module = { exports: {} as any }
  const code = transformSync(readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code
  runInNewContext(code, {
    module,
    exports: module.exports,
    require: (id: string) => {
      const value = dependencies[id] as any
      return value?.default ? { __esModule: true, ...value } : (value ?? {})
    },
    console,
    global: { Server: {} }
  })
  return module.exports.default
}

const setup = () => {
  const ipcMain = new EventEmitter()
  const replies: unknown[][] = []
  const pids: string[] = []
  const WindowManager = load('src/main/ui/WindowManager.ts', {
    events: { EventEmitter },
    '@shared/utils': { isMacOS: () => true }
  })
  const windowManager = Object.create(WindowManager.prototype)
  windowManager.willQuit = false
  const mainWindow = {
    isDestroyed: () => false,
    webContents: { send: (...args: unknown[]) => replies.push(args) }
  }
  const IPCHandler = load('src/main/core/IPCHandler.ts', {
    events: { EventEmitter },
    electron: { ipcMain },
    './ServiceLifecycle': { isServiceLifecycleContextExpired: () => false },
    './ServiceProcess': {
      default: {
        addPid: (_module: string, pid: string) => pids.push(pid),
        statusOf: () => ({ revision: 1 })
      }
    }
  })
  const trayUpdates: boolean[] = []
  const deps = {
    windowManager,
    mainWindow,
    trayManager: { iconChange: (active: boolean) => trayUpdates.push(active) },
    appNodeFnManager: {},
    languageCoordinator: {} as any
  }
  const handler = new IPCHandler(deps)
  handler.init()
  return { ipcMain, handler, windowManager, replies, pids, trayUpdates, deps }
}

test('quitting blocks command and event requests before listeners or business dispatch', () => {
  const { ipcMain, handler, windowManager, trayUpdates, replies } = setup()
  let commands = 0
  let events = 0
  handler.on('Application:tray-status-change', () => commands++)
  handler.on('application:show', () => events++)
  ipcMain.emit('command', {}, 'Application:tray-status-change', 'before', true)
  ipcMain.emit('event', {}, 'application:show', 'index')
  assert.deepEqual(trayUpdates, [true])
  assert.equal(commands, 1)
  assert.equal(events, 1)
  windowManager.setWillQuit(true)
  ipcMain.emit('command', {}, 'Application:tray-status-change', 'after', false)
  ipcMain.emit('event', {}, 'application:show', 'index')
  handler.handleCommand('Application:tray-status-change', 'direct', false)
  assert.deepEqual(trayUpdates, [true])
  assert.equal(commands, 1)
  assert.equal(events, 1)
  assert.deepEqual(replies, [])
})

test('accepted asynchronous requests finish without late UI replies', async () => {
  const { ipcMain, windowManager, replies, deps } = setup()
  let resolve!: (data: string) => void
  deps.languageCoordinator.prepare = () => new Promise<string>((done) => (resolve = done))
  ipcMain.emit('command', {}, 'application:language-prepare', 'key', 'en')
  windowManager.setWillQuit(true)
  resolve('prepared')
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(replies, [])
})

test('fork terminal callbacks still register started PIDs during quit without replying to UI', () => {
  const { handler, windowManager, replies, pids } = setup()
  windowManager.setWillQuit(true)
  handler.handleForkCallback(
    'app-fork:nginx',
    'key',
    'nginx',
    {
      code: 0,
      data: { 'APP-Service-Start-PID': '1234', 'APP-Service-Stop-Args': ['stopService', {}] }
    },
    ['startService', {}]
  )
  assert.deepEqual(pids, ['1234'])
  assert.deepEqual(replies, [])
})

test('application closes IPC before the first drain and keeps cleanup single flight', async () => {
  const { handler, windowManager, ipcMain, trayUpdates, deps, replies } = setup()
  let release!: () => void
  const drain = new Promise<void>((resolve) => (release = resolve))
  let finishNodeFn!: (value: unknown) => void
  const nodeFnResult = new Promise((resolve) => (finishNodeFn = resolve))
  const nodeFn = load('src/main/core/AppNodeFn.ts', {
    electron: { nativeTheme: { shouldUseDarkColors: true } },
    './lazy/LazyRuntime': {
      LazyRuntime: class {
        load() {
          return nodeFnResult
        }
      }
    }
  })
  nodeFn.mainWindow = deps.mainWindow
  nodeFn.trayWindow = deps.mainWindow
  nodeFn.nativeTheme_shouldUseDarkColors('theme', 'key')
  assert.equal(replies.length, 2)
  replies.length = 0
  nodeFn.node_forge_publicKeyToPem('forge', 'key', 'public-key')
  let stops = 0
  const Application = load('src/main/Application.ts', {
    events: { EventEmitter },
    electron: { globalShortcut: { unregisterAll() {} } },
    'node:crypto': { randomUUID },
    '@shared/PerformanceDiagnostics': {
      performanceDiagnosticNow: () => 0,
      performanceDiagnosticElapsed: () => 0
    },
    '@shared/ServiceStopDiagnostics': {
      logServiceStopBoundary() {},
      timeServiceStopBoundary: (_name: string, _data: unknown, work: () => unknown) => work(),
      withServiceStopDiagnostics: (_data: unknown, work: () => unknown) => work()
    },
    '@shared/WindowsPrivilege': {
      withWindowsPrivilegeInteraction: (_interactive: boolean, work: () => unknown) => work()
    },
    './core/AppNodeFn': { default: nodeFn },
    './core/ServiceProcess': {
      default: { beginLifecycleShutdown() {}, drainLifecycleRequests: () => drain }
    },
    './core/ScreenManager': { default: { destroy() {} } },
    './core/Logger': { default: { info() {}, warn() {} } },
    './utils': { logger: { info() {}, warn() {} } },
    './core/lazy/OptionalRuntimes': Object.fromEntries(
      [
        'siteSuckerRuntime',
        'oauthRuntime',
        'nodePtyRuntime',
        'capturerRuntime',
        'httpServerRuntime'
      ].map((name) => [name, { peek: () => undefined }])
    )
  })
  const application = Object.create(Application.prototype)
  Object.assign(application, {
    windowManager,
    ipcHandler: handler,
    windowsPrivilege: { beginShutdown() {}, dispose() {} },
    serverManager: { stopServer: async () => stops++, cleanHosts: async () => {} },
    trayManager: { destroy() {} }
  })
  const first = application.stop()
  const second = application.stop()
  const closing = windowManager.willQuit
  ipcMain.emit('command', {}, 'Application:tray-status-change', 'after', true)
  const mainTarget = nodeFn.mainWindow
  const trayTarget = nodeFn.trayWindow
  release()
  finishNodeFn({ pki: { publicKeyToPem: () => 'pem' } })
  await Promise.all([first, second])
  assert.equal(closing, true)
  assert.deepEqual(trayUpdates, [])
  assert.equal(mainTarget, undefined)
  assert.equal(trayTarget, undefined)
  assert.deepEqual(replies, [])
  assert.equal(stops, 1)
})
