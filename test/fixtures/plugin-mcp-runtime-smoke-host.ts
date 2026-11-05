import { app, BrowserWindow, dialog } from 'electron'
import { join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const root = process.env.FLYENV_DATA_ROOT!
app.setPath('userData', root)
app.setPath('logs', join(root, 'logs'))
app.on('window-all-closed', () => {})
void app.whenReady().then(async () => {
  const checkpoints: string[] = []
  let forks: any
  let mcp: any
  let window: BrowserWindow | undefined
  try {
    const { default: PluginManager } = await import('../../src/main/plugins/PluginManager')
    const { ForkManager } = await import('../../src/main/core/ForkManager')
    const { PluginMCPRegistry } = await import('../../src/main/core/PluginMCPRegistry')
    const { MCPRuntime } = await import('../../src/main/core/MCPRuntime')
    const { default: MCPServer } = await import('../../src/main/core/MCPServer')
    const { default: IPCHandler } = await import('../../src/main/core/IPCHandler')
    const { default: MCPConfigManager } = await import('../../src/main/core/MCPConfigManager')
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const { StreamableHTTPClientTransport } =
      await import('@modelcontextprotocol/sdk/client/streamableHttp.js')
    const options = JSON.parse(await readFile(join(root, 'options.json'), 'utf8'))
    await mkdir(join(root, 'base'), { recursive: true })
    ;(global as any).Server = {
      BaseDir: join(root, 'base'),
      Cache: root,
      AppDir: root,
      Static: options.staticPath,
      Licenses: '',
      Plugins: {}
    }
    forks = new ForkManager(options.forkFile)
    const config = new MCPConfigManager()
    config.setConfig({
      host: '127.0.0.1',
      port: options.port,
      enabledTools: [],
      approval: {},
      token: 'temporary-smoke-token'
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
    const sync = async () => {
      await manager.refresh()
      ;(global.Server as any).Plugins = manager.getForkSnapshot()
      registry.replace(manager.getMCPRegistrations())
      forks.broadcastServer(global.Server)
    }
    const appConfig: any = { getConfig: () => ({}), setConfig: () => {} }
    mcp = new MCPServer(forks, config, appConfig, registry)
    const runtime = new MCPRuntime(config, async () => mcp, registry)
    window = new BrowserWindow({
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
      onPluginsChanged: sync,
      mcpConfigManager: config,
      mcpRuntime: runtime
    } as any)
    ipc.init()
    await window.loadFile(options.html)
    const ui = (command: string, ...args: any[]) =>
      window!.webContents.executeJavaScript(
        `window.fixtureIPC(${JSON.stringify(command)}, ...${JSON.stringify(args)})`
      )
    const install = await ui('application:plugin-install', options.v1)
    assert.equal(install.code, 0, JSON.stringify(install))
    checkpoints.push('install-api2')
    const tools = await ui('mcp:listTools')
    assert.ok(tools.data.some((tool: any) => tool.name === 'fixture_counter_read'))
    assert.equal(runtime.peek(), undefined)
    checkpoints.push('list-with-http-off')
    const code = (await manager.getRendererPlugins())[0].code
    await window.webContents.executeJavaScript(`window.mountFixture(${JSON.stringify(code)})`)
    await mcp.start()
    const client = new Client({ name: 'flyenv', version: '1.0.0' })
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${options.port}/mcp`), {
        requestInit: { headers: { Authorization: 'Bearer temporary-smoke-token' } }
      })
    )
    assert.equal((await client.listTools()).tools.length, 0)
    config.setConfig({
      enabledTools: ['fixture_counter_read', 'fixture_counter_write'],
      approval: { fixture_counter_write: 'auto' }
    })
    const http = async (name: string, args: any = {}) => {
      const result: any = await client.callTool({ name, arguments: args })
      return JSON.parse(result.content[0].text)
    }
    const first = await ui('app-fork:mcp-runtime-fixture', 'read', {})
    assert.equal(first.data.data.count, 0)
    const written = await http('fixture_counter_write', { increment: 2 })
    assert.equal(written.data.pid, first.data.data.pid)
    await window.webContents.executeJavaScript("document.getElementById('counter-write').click()")
    let rendered = ''
    for (let i = 0; i < 100; i++) {
      rendered = await window.webContents.executeJavaScript(
        "document.getElementById('counter-result').textContent"
      )
      if (rendered.includes('"count":3')) break
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    assert.match(rendered, /"count":3/)
    assert.equal((await http('fixture_counter_read')).data.count, 3)
    checkpoints.push('renderer-http-single-owner')
    const owner = await forks.pluginWorkers.capture('mcp-runtime-fixture')
    const worker = forks.pluginWorkers.workers()[0]
    let exited = false
    void worker.actualExit.then(() => {
      exited = true
    })
    const delayed = http('fixture_counter_write', { increment: 1, delay: 150 })
    await new Promise((resolve) => setTimeout(resolve, 30))
    const disabled = await ui('application:plugin-toggle', 'mcp-runtime-fixture', false)
    assert.equal(disabled.code, 0, JSON.stringify(disabled))
    assert.equal(exited, true)
    assert.equal((await delayed).data.count, 4)
    assert.equal((await http('fixture_counter_read')).error_code, 'tool_unavailable')
    checkpoints.push('disable-drain-actual-exit')
    assert.equal((await ui('application:plugin-toggle', 'mcp-runtime-fixture', true)).code, 0)
    config.setConfig('approval', { fixture_counter_write: 'confirm' })
    const originalConfirm = dialog.showMessageBox
    ;(dialog as any).showMessageBox = async () => {
      await manager.setEnabled('mcp-runtime-fixture', false)
      await sync()
      return { response: 1 }
    }
    const raced = await http('fixture_counter_write', { increment: 99 })
    dialog.showMessageBox = originalConfirm
    assert.equal(raced.outcome, 'failed')
    checkpoints.push('approval-generation-recheck')
    assert.equal((await ui('application:plugin-toggle', 'mcp-runtime-fixture', true)).code, 0)
    const upgraded = await ui('application:plugin-install', options.v2)
    assert.equal(upgraded.code, 0, JSON.stringify(upgraded))
    const latest = await http('fixture_counter_read')
    assert.equal(latest.data.build, 'fixture-v2')
    assert.equal(latest.data.count, 4)
    assert.notEqual(
      (await forks.pluginWorkers.capture('mcp-runtime-fixture')).installGeneration,
      owner.installGeneration
    )
    checkpoints.push('upgrade-keeps-data-new-worker')
    assert.equal((await ui('application:plugin-uninstall', 'mcp-runtime-fixture')).code, 0)
    assert.equal((await client.listTools()).tools.length, 0)
    assert.equal(
      JSON.parse(await readFile(join(root, 'plugin-data/mcp-runtime-fixture/counter.json'), 'utf8'))
        .count,
      4
    )
    checkpoints.push('uninstall-retains-data')
    await client.close()
    await writeFile(join(root, 'result.json'), JSON.stringify({ ok: true, checkpoints }))
  } catch (error) {
    await writeFile(
      join(root, 'result.json'),
      JSON.stringify({
        ok: false,
        checkpoints,
        error: String(error),
        stack: (error as Error).stack
      })
    )
  } finally {
    await mcp?.stop().catch(() => {})
    await forks?.destroy().catch(() => {})
    window?.destroy()
    app.exit(0)
  }
})
