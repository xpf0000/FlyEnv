import { app, BrowserWindow } from 'electron'
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.env.FLYENV_DATA_ROOT!
app.setPath('userData', join(root, 'user'))
app.setPath('logs', join(root, 'logs'))
app.on('window-all-closed', () => {})
void app.whenReady().then(async () => {
  let forks: any, mcp: any
  let interval: ReturnType<typeof setInterval> | undefined
  try {
    const options = JSON.parse(await readFile(join(root, 'options.json'), 'utf8'))
    const { default: PluginManager } = await import('../../src/main/plugins/PluginManager')
    const { ForkManager } = await import('../../src/main/core/ForkManager')
    const { PluginMCPRegistry } = await import('../../src/main/core/PluginMCPRegistry')
    const { MCPRuntime } = await import('../../src/main/core/MCPRuntime')
    const { default: MCPServer } = await import('../../src/main/core/MCPServer')
    const { default: MCPConfigManager } = await import('../../src/main/core/MCPConfigManager')
    const { default: IPCHandler } = await import('../../src/main/core/IPCHandler')
    await mkdir(join(root, 'base'), { recursive: true })
    ;(global as any).Server = {
      BaseDir: join(root, 'base'),
      AppDir: root,
      Cache: root,
      Static: options.staticPath,
      Licenses: '',
      Plugins: {}
    }
    forks = new ForkManager(options.forkFile)
    const config = new MCPConfigManager()
    config.setConfig({
      host: '127.0.0.1',
      port: options.port,
      token: options.token,
      enabledTools: [
        'memory_search',
        'memory_get',
        'memory_store',
        'memory_update',
        'memory_forget'
      ],
      approval: { memory_store: 'auto', memory_update: 'auto', memory_forget: 'auto' }
    })
    const registry = new PluginMCPRegistry(forks.pluginWorkers, (key, fallback) =>
      config.getConfig(key, fallback)
    )
    const manager = new PluginManager({
      pluginsRoot: join(root, 'plugins'),
      statePath: join(root, 'plugins.json'),
      licenseCheck: async () => true,
      stopPluginServices: async (module) => {
        await forks.closePluginWorker(module)
        return { stopped: true }
      }
    })
    await manager.refresh()
    global.Server.Plugins = manager.getForkSnapshot()
    registry.replace(manager.getMCPRegistrations())
    const appConfig: any = { getConfig: () => ({}), setConfig: () => {} }
    mcp = new MCPServer(forks, config, appConfig, registry)
    const runtime = new MCPRuntime(config, async () => mcp, registry)
    const window = new BrowserWindow({
      show: false,
      webPreferences: { preload: options.preload, contextIsolation: true, sandbox: true }
    })
    const ipc = new IPCHandler({
      mainWindow: window,
      windowManager: {
        willQuit: false,
        sendCommandTo: (target: BrowserWindow, command: string, ...args: any[]) =>
          target.webContents.send('reply', command, ...args)
      },
      serverManager: { setProxy() {}, updateGlobalConfig() {} },
      configManager: appConfig,
      forkManager: forks,
      pluginManager: manager,
      mcpConfigManager: config,
      mcpRuntime: runtime
    } as any)
    ipc.init()
    await window.loadFile(options.html)
    await mcp.start()
    await writeFile(
      join(root, 'ready.json'),
      JSON.stringify({
        ready: true,
        pid: process.pid,
        dataRoot: global.Server.Plugins['ai-memory'].dataRoot
      })
    )
    let active = false
    interval = setInterval(async () => {
      if (active) return
      active = true
      try {
        let request: any
        try {
          request = JSON.parse(await readFile(join(root, 'request.json'), 'utf8'))
        } catch {
          return
        }
        await rm(join(root, 'request.json'), { force: true })
        let result: any
        if (request.kind === 'ui') {
          result = await window.webContents.executeJavaScript(
            `new Promise(resolve => { const key = crypto.randomUUID(); window.FlyEnvNodeAPI.receive((command, responseKey, response) => { if (key === responseKey && response?.code !== 200) resolve(response); }); window.FlyEnvNodeAPI.send('app-fork:ai-memory', key, ...${JSON.stringify(request.args)}); })`
          )
        } else if (request.kind === 'audit') result = registry.diagnostics('ai-memory')
        else if (request.kind === 'tools') {
          config.setConfig({ enabledTools: request.names })
          result = true
        } else if (request.kind === 'approvalRace') {
          config.setConfig({ approval: { memory_store: 'confirm' } })
          try {
            result = await registry.invoke('memory_store', request.input, async () => {
              config.setConfig({ enabledTools: ['memory_search', 'memory_get'] })
              return true
            })
          } finally {
            config.setConfig({
              enabledTools: [
                'memory_search',
                'memory_get',
                'memory_store',
                'memory_update',
                'memory_forget'
              ],
              approval: { memory_store: 'auto', memory_update: 'auto', memory_forget: 'auto' }
            })
          }
        } else if (request.kind === 'stop') {
          clearInterval(interval)
          await mcp.stop()
          await forks.destroy()
          await writeFile(
            join(root, 'response.json'),
            JSON.stringify({ id: request.id, result: { stopped: true } })
          )
          app.exit()
          return
        } else result = { error: 'unknown_test_command' }
        await writeFile(join(root, 'response.json'), JSON.stringify({ id: request.id, result }))
      } catch (error) {
        await writeFile(join(root, 'host-error.json'), JSON.stringify({ error: String(error) }))
      } finally {
        active = false
      }
    }, 25)
  } catch (error) {
    await writeFile(join(root, 'host-error.json'), JSON.stringify({ error: String(error) }))
    if (interval) clearInterval(interval)
    await mcp?.stop().catch(() => {})
    await forks?.destroy().catch(() => {})
    app.exit(1)
  }
})
