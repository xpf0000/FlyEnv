import { app } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

async function run() {
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
  const root = process.env.FLYENV_DATA_ROOT!
  const output = process.env.MEMORY_SMOKE_OUTPUT!
  app.setPath('userData', join(root, 'user'))
  app.setPath('sessionData', join(root, 'user'))
  app.setPath('logs', join(root, 'logs'))
  app.setAppPath(process.env.MEMORY_SMOKE_REPO!)
  global.__static = join(process.env.MEMORY_SMOKE_REPO!, 'dist/electron/static')
  await mkdir(join(root, 'user'), { recursive: true })
  await writeFile(
    join(root, 'user/user.json'),
    JSON.stringify({
      showTour: false,
      moduleOnboardingVersion: 1,
      setup: {
        lang: 'en',
        autoCheck: false,
        hosts: { write: false },
        proxy: { on: false, proxy: '' },
        common: { showItem: { 'ai-memory': true, mcp: true } }
      }
    })
  )
  app.on('window-all-closed', () => {})
  await app.whenReady()
  let application: any
  const checkpoints: string[] = []
  try {
    const { default: Application } = await import('../../src/main/Application')
    application = new Application()
    global.application = application
    application.configManager.setConfig('showTour', false)
    application.configManager.setConfig('moduleOnboardingVersion', 1)
    application.configManager.setConfig('setup.autoCheck', false)
    application.configManager.setConfig('setup.hosts', { write: false })
    await application.init()
    const { createServer: createPortProbe } = await import('node:net')
    const sidebarPortProbe = createPortProbe()
    await new Promise<void>((resolve) => sidebarPortProbe.listen(0, '127.0.0.1', resolve))
    const sidebarPort = (sidebarPortProbe.address() as any).port
    await new Promise<void>((resolve) => sidebarPortProbe.close(() => resolve()))
    const siblingTool = application.mcpRuntime.listTools().find((tool: any) => !tool.pluginId).name
    application.mcpConfigManager.setConfig({ port: sidebarPort, enabledTools: [siblingTool] })
    application.start('index')
    const window = application.mainWindow
    window.webContents.setBackgroundThrottling(false)
    window.setSize(1260, 900)
    window.show()
    window.focus()
    const js = async (source: string) => {
      try {
        return await window.webContents.executeJavaScript(source, true)
      } catch (error) {
        throw new Error(`UI script failed: ${source.slice(0, 200)}: ${String(error)}`)
      }
    }
    const capture = async (name: string) => {
      window.show()
      window.focus()
      await js(
        `new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`
      )
      await new Promise((resolve) => setTimeout(resolve, 400))
      await writeFile(join(output, name), (await window.webContents.capturePage()).toPNG())
    }
    const waitFor = async (expression: string, timeout = 60_000) => {
      const until = Date.now() + timeout
      while (Date.now() < until) {
        await js(
          `document.querySelectorAll('.el-message-box').forEach(box => { if (/FlyEnv Helper|Administrator|network is using a proxy/.test(box.textContent)) box.querySelector('.el-message-box__headerbtn')?.click(); })`
        ).catch(() => {})
        if (await js(expression).catch(() => false)) return
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
      throw new Error(`UI condition timed out: ${expression}`)
    }
    await waitFor(
      `!!window.__FLYENV_PLUGIN_ROUTER__?.getRoutes().find(r => r.path === '/ai-memory')`,
      120_000
    )
    window.webContents.closeDevTools()
    await waitFor(`window.innerWidth >= 960`)
    await js(`window.__FLYENV_PLUGIN_ROUTER__.push('/mcp')`)
    const memoryAside = `Array.from(document.querySelectorAll('.aside .menu li')).find(item => item.textContent.includes('AI Memory'))`
    await waitFor(`!!(${memoryAside})`, 10_000)
    await js(`(${memoryAside}).click()`)
    await waitFor(`!!document.querySelector('#memory-search')`)
    await waitFor(`!!document.querySelector('.aside .active .icon-block svg')`)
    await waitFor(
      `(() => { const use=document.querySelector('[data-module="ai-memory"] .icon-block use'); const ref=use?.getAttribute('xlink:href') || use?.getAttribute('href'); return ref && !!document.querySelector(ref + ' path'); })()`
    )
    const memorySwitch = `document.querySelector('[data-module="ai-memory"] .el-switch')`
    await waitFor(`!(${memorySwitch}).classList.contains('is-disabled')`)
    await js(
      `if (document.querySelector('.aside').classList.contains('fold')) document.querySelector('.top-tool > li:last-child').click()`
    )
    await waitFor(
      `document.querySelector('.aside').classList.contains('expanded') && (${memorySwitch}).getBoundingClientRect().width > 0`
    )
    await js(`(${memorySwitch}).click()`)
    await waitFor(
      `(${memorySwitch}).classList.contains('is-checked') && !(${memorySwitch}).classList.contains('is-disabled')`
    )
    assert.equal(application.mcpRuntime.status().running, true)
    const enabled = application.mcpConfigManager.getConfig('enabledTools')
    assert.ok(enabled.includes(siblingTool))
    assert.equal(enabled.filter((name: string) => name.startsWith('flyenv_memory_')).length, 5)
    async function toolCatalog() {
      const config = application.mcpConfigManager.getConfig()
      const response = await fetch(`http://127.0.0.1:${config.port}/mcp`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream'
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
      })
      assert.equal(response.status, 200)
      const body = await response.text()
      const payload = body.trim().startsWith('{')
        ? JSON.parse(body)
        : JSON.parse(
            body
              .split('\n')
              .find((line) => line.startsWith('data:'))!
              .slice(5)
          )
      return payload.result.tools.map((tool: any) => tool.name) as string[]
    }
    assert.equal(
      (await toolCatalog()).filter((name) => name.startsWith('flyenv_memory_')).length,
      5
    )
    await capture('ui-sidebar-mcp-on.png')
    await js(`(${memorySwitch}).click()`)
    await waitFor(
      `!(${memorySwitch}).classList.contains('is-checked') && !(${memorySwitch}).classList.contains('is-disabled')`
    )
    assert.equal(
      application.mcpRuntime.status().running,
      true,
      'memory off must not stop the shared gateway'
    )
    assert.deepEqual(application.mcpConfigManager.getConfig('enabledTools'), [siblingTool])
    assert.equal(
      (await toolCatalog()).some((name) => name.startsWith('flyenv_memory_')),
      false
    )
    assert.ok((await toolCatalog()).includes(siblingTool))
    // Existing read-only permissions are still an active MCP; one off click revokes them.
    await js(
      `window.__FLYENV_PLUGIN_HOST__.mcp.setToolsEnabled(['flyenv_memory_search','flyenv_memory_get'],true)`
    )
    await waitFor(`(${memorySwitch}).classList.contains('is-checked')`)
    await js(`(${memorySwitch}).click()`)
    await waitFor(
      `!(${memorySwitch}).classList.contains('is-checked') && !(${memorySwitch}).classList.contains('is-disabled')`
    )
    assert.deepEqual(application.mcpConfigManager.getConfig('enabledTools'), [siblingTool])
    // Both the generic tool page and plugin use atomic updates; neither revives a stale array.
    await js(
      `Promise.all([window.__FLYENV_PLUGIN_HOST__.mcp.toggleTool(${JSON.stringify(siblingTool)},false),window.__FLYENV_PLUGIN_HOST__.mcp.setToolsEnabled(['flyenv_memory_search'],true)])`
    )
    assert.deepEqual(application.mcpConfigManager.getConfig('enabledTools'), [
      'flyenv_memory_search'
    ])
    await js(
      `Promise.all([window.__FLYENV_PLUGIN_HOST__.mcp.toggleTool(${JSON.stringify(siblingTool)},true),window.__FLYENV_PLUGIN_HOST__.mcp.setToolsEnabled(['flyenv_memory_search'],false)])`
    )
    assert.deepEqual(application.mcpConfigManager.getConfig('enabledTools'), [siblingTool])
    const configSet = application.mcpConfigManager.setConfig.bind(application.mcpConfigManager)
    try {
      application.mcpConfigManager.setConfig = () => {
        throw new Error('fixture storage failure')
      }
      assert.equal(
        await js(
          `window.__FLYENV_PLUGIN_HOST__.mcp.toggleTool(${JSON.stringify(siblingTool)},false)`
        ),
        false
      )
      assert.deepEqual(application.mcpConfigManager.getConfig('enabledTools'), [siblingTool])
    } finally {
      application.mcpConfigManager.setConfig = configSet
    }
    assert.equal(
      await js(`window.__FLYENV_PLUGIN_HOST__.mcp.setToolsEnabled(['unknown_fixture_tool'],true)`),
      false
    )
    assert.deepEqual(application.mcpConfigManager.getConfig('enabledTools'), [siblingTool])
    checkpoints.push('partial-permissions-concurrent-tool-updates-and-write-failure')
    await application.mcpRuntime.stopLoaded()
    await js(`document.querySelector('.top-tool > li:last-child').click()`)
    checkpoints.push('sidebar-rendered-icon-memory-toggle-isolated-http-catalog')
    checkpoints.push('sidebar-plugin-entry-navigation')
    window.webContents.closeDevTools()
    await js(
      `document.querySelectorAll('.el-message-box').forEach(box => { if (box.textContent.includes('FlyEnv Helper')) box.querySelector('.el-message-box__headerbtn')?.click(); })`
    )
    checkpoints.push('full-application-plugin-route')
    const call = (method: string, input: any) =>
      js(
        `new Promise(resolve => { const ipc = window.__FLYENV_PLUGIN_HOST__.ipc; ipc.sendSensitive('app-fork:ai-memory', ${JSON.stringify(method)}, ${JSON.stringify(input)}).then((key,res) => { if (res?.code === 200) return; ipc.off(key); resolve(res); }); })`
      )
    // A real user starts in an empty library, validates a form, creates and deletes a record.
    await waitFor(`!!document.querySelector('.memory-table .el-empty')`)
    await capture('ui-empty.png')
    await js(`document.querySelector('#memory-new').click()`)
    await waitFor(`!!document.querySelector('#memory-save')`)
    await js(`document.querySelector('#memory-save').click()`)
    await waitFor(`!!document.querySelector('#memory-validation')`)
    await waitFor(`document.querySelectorAll('.el-dialog .el-form-item__error').length >= 3`)
    assert.equal(
      await js(`document.querySelectorAll('.el-dialog .el-form-item__error').length >= 3`),
      true
    )
    await js(
      `for (const [selector,value] of [['#memory-title','First manual memory'],['#memory-summary','Saved from the actual form'],['#memory-content','A complete user-created memory']]) { const el=document.querySelector(selector); el.value=value; el.dispatchEvent(new Event('input',{bubbles:true})); }`
    )
    // Simulate a committed response lost in transit. Only this test renderer alters the reply.
    await js(
      `(() => { const ipc=window.__FLYENV_PLUGIN_HOST__.ipc; const original=ipc.sendSensitive.bind(ipc); ipc.sendSensitive=(command,...args) => { const call=original(command,...args); if(command!=='app-fork:ai-memory'||args[0]!=='store') return call; ipc.sendSensitive=original; return {key:call.key, then(cb) { call.then((key,res)=>cb(key,res?.code===0 ? {code:0,data:{outcome:'unknown',error_code:'response_timeout'}} : res)); }}; }; })()`
    )
    await js(`document.querySelector('#memory-save').click()`)
    await waitFor(
      `document.querySelector('.el-dialog #memory-operation')?.textContent.includes('uncertain')`
    )
    assert.equal(await js(`document.querySelector('#memory-save').disabled`), true)
    await new Promise((resolve) => setTimeout(resolve, 350))
    await capture('ui-unknown-dialog.png')
    await js(`document.querySelector('.el-dialog #memory-operation button').click()`)
    await waitFor(
      `!!document.querySelector('.memory-row')?.textContent.includes('First manual memory')`
    )
    const manual = await call('search', { scope: 'global', queries: ['First manual memory'] })
    assert.equal(manual.data.data.results.length, 1)
    assert.equal(
      manual.data.data.results[0].source.description,
      'Entered manually by the user in FlyEnv.'
    )
    await js(`document.querySelector('.memory-row').click()`)
    await waitFor(`!!document.querySelector('#memory-delete')`)
    // Archive with required reason, find it through the archived filter, then restore.
    for (const action of ['Archive', 'Restore']) {
      await js(
        `Array.from(document.querySelectorAll('.memory-detail-actions button')).find(el=>el.textContent.trim()===${JSON.stringify(action)}).click()`
      )
      await waitFor(`!!document.querySelector('#memory-archive-save')`)
      if (action === 'Archive') {
        await js(`document.querySelector('#memory-archive-save').click()`)
        await waitFor(`!!document.querySelector('.el-dialog .el-form-item__error')`)
      }
      await js(
        `var input=document.querySelector('#memory-archive-reason'); input.value='UI archive/restore test'; input.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('#memory-archive-save').click()`
      )
      await waitFor(`document.querySelectorAll('.memory-row').length===0`)
      if (action === 'Archive') {
        await js(
          `Array.from(document.querySelectorAll('.memory-toolbar button')).find(el=>el.textContent.trim()==='Filters').click()`
        )
        await waitFor(`document.querySelectorAll('.memory-filters .el-select').length===2`)
      }
      await js(`document.querySelectorAll('.memory-filters .el-select')[1].click()`)
      const option = action === 'Archive' ? 'Archived' : 'Active'
      await waitFor(
        `Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(el=>el.textContent.trim()===${JSON.stringify(option)})`
      )
      await js(
        `Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(el=>el.textContent.trim()===${JSON.stringify(option)}).click(); document.querySelector('#memory-search').click()`
      )
      await waitFor(
        `document.querySelector('.memory-row')?.textContent.includes('First manual memory')`
      )
      await js(`document.querySelector('.memory-row').click()`)
      await waitFor(`!!document.querySelector('#memory-delete')`)
    }
    await js(
      `Array.from(document.querySelectorAll('.memory-toolbar button')).find(el=>el.textContent.trim()==='Filters').click()`
    )
    checkpoints.push('manual-archive-required-reason-and-restore')
    await js(`document.querySelector('#memory-delete').click()`)
    await waitFor(
      `Array.from(document.querySelectorAll('.el-popconfirm button')).some(el=>el.textContent.includes('Delete permanently'))`
    )
    await js(
      `Array.from(document.querySelectorAll('.el-popconfirm button')).find(el=>el.textContent.includes('Delete permanently')).click()`
    )
    await waitFor(`document.querySelectorAll('.memory-row').length===0`)
    checkpoints.push('empty-library-manual-create-validation-unknown-retry-delete')
    const ids: string[] = []
    for (let i = 0; i < 10; i++) {
      const result = await call('store', {
        scope: 'global',
        request_id: randomUUID(),
        type: 'note',
        title: `Memory UI fixture ${i}`,
        topic: 'acceptance',
        summary: `Constructed summary ${i}`,
        tags: ['ui'],
        content: `# Fixture ${i}\n\n**Complete** Markdown body. <img src="https://invalid.example/track">`,
        source: { kind: 'document', agent: 'smoke', description: 'Temporary constructed sample' }
      })
      assert.equal(result.code, 0)
      assert.equal(result.data.outcome, 'success')
      ids.push(result.data.data.id)
    }
    await js(`document.querySelector('#memory-search').click()`)
    await waitFor(`document.querySelectorAll('.memory-row').length === 8`)
    await js(`document.querySelectorAll('.memory-row')[0].click()`)
    await waitFor(`!!document.querySelector('#memory-delete')`)
    await js(
      `(() => { const ipc=window.__FLYENV_PLUGIN_HOST__.ipc; const original=ipc.sendSensitive.bind(ipc); ipc.sendSensitive=(command,...args)=> { if(command!=='app-fork:ai-memory'||args[0]!=='forget') return original(command,...args); ipc.sendSensitive=original; return {key:'fixture-failed-delete', then(cb) { setTimeout(()=>cb('fixture-failed-delete',{code:0,data:{outcome:'failed',error_code:'operation_failed'}}),0); }}; }; })()`
    )
    await js(`document.querySelector('#memory-delete').click()`)
    await waitFor(
      `Array.from(document.querySelectorAll('.el-popconfirm button')).some(el=>el.textContent.includes('Delete permanently'))`
    )
    await js(
      `Array.from(document.querySelectorAll('.el-popconfirm button')).find(el=>el.textContent.includes('Delete permanently')).click()`
    )
    await waitFor(
      `document.querySelector('.memory-detail #memory-operation')?.textContent.includes('Failed')`
    )
    await js(
      `document.querySelector('.memory-detail').closest('.el-drawer').querySelector('.el-drawer__close-btn').click()`
    )
    await new Promise((resolve) => setTimeout(resolve, 500))
    await js(
      `window.__memoryExpectedTitle=document.querySelectorAll('.memory-row strong')[1].textContent; document.querySelectorAll('.memory-row')[1].click()`
    )
    await waitFor(
      `document.querySelector('.memory-detail h3')?.textContent.trim()===window.__memoryExpectedTitle`
    )
    await waitFor(`!!document.querySelector('#memory-edit')`)
    assert.equal(
      await js(`!!document.querySelector('.memory-detail #memory-operation')`),
      false,
      'another record must not offer to retry the previous deletion'
    )
    await js(
      `document.querySelector('.memory-detail').closest('.el-drawer').querySelector('.el-drawer__close-btn').click()`
    )
    await new Promise((resolve) => setTimeout(resolve, 500))
    checkpoints.push('failed-delete-retry-stays-with-original-record')
    await js(`document.querySelector('#memory-next').click()`)
    await waitFor(`document.querySelectorAll('.memory-row').length === 2`)
    await js(`document.querySelector('#memory-prev').click()`)
    await waitFor(`document.querySelectorAll('.memory-row').length === 8`)
    await js(`document.querySelector('#memory-next').click()`)
    await waitFor(`document.querySelectorAll('.memory-row').length === 2`)
    checkpoints.push('pagination-next-previous-next')
    await js(`document.querySelector('.memory-row').click()`)
    await waitFor(`!!document.querySelector('#memory-edit')`)
    assert.equal(await js(`document.querySelectorAll('.memory-markdown img').length`), 0)
    await js(`document.querySelector('#memory-edit').click()`)
    await waitFor(`!!document.querySelector('#memory-title')`)
    await js(
      `for (const [selector,value] of [['#memory-title','Edited in full FlyEnv UI'],['#memory-reason','UI acceptance edit']]) { const el=document.querySelector(selector); el.value=value; el.dispatchEvent(new Event('input',{bubbles:true})); }`
    )
    await js(
      `document.querySelector('#memory-save').click(); window.__FLYENV_PLUGIN_ROUTER__.push('/mcp')`
    )
    await new Promise((resolve) => setTimeout(resolve, 400))
    await js(`window.__FLYENV_PLUGIN_ROUTER__.push('/ai-memory')`)
    await waitFor(
      `Array.from(document.querySelectorAll('.memory-row')).some(el => el.textContent.includes('Edited in full FlyEnv UI'))`
    )
    const result = await call('search', { scope: 'global', queries: ['Edited in full FlyEnv UI'] })
    const edited = result.data.data.results.find(
      (row: any) => row.title === 'Edited in full FlyEnv UI'
    )
    assert.ok(edited)
    assert.equal(edited.revision, 2)
    const body = await call('get', { scope: 'global', id: edited.id })
    assert.equal(body.data.data.change_reason, 'UI acceptance edit')
    checkpoints.push('edit-save-navigation-reentry-durable-receipt')
    const projectPath = join(root, 'reentry-project')
    await mkdir(projectPath)
    const projectRecord = await call('store', {
      scope: 'project',
      project_path: projectPath,
      request_id: randomUUID(),
      type: 'note',
      title: 'Project reentry fixture',
      topic: 'reentry',
      summary: 'Project detail scope',
      tags: ['reentry'],
      content: 'Project-scoped body',
      source: { kind: 'document', agent: 'smoke', description: 'Temporary reentry sample' }
    })
    assert.equal(projectRecord.data.outcome, 'success')
    await js(
      `document.querySelector('#memory-search').click(); document.querySelector('#memory-scope').click()`
    )
    await waitFor(
      `Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(el => el.textContent.includes('reentry-project'))`
    )
    await js(
      `Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(el => el.textContent.includes('reentry-project')).click()`
    )
    await waitFor(
      `document.querySelector('.memory-row')?.textContent.includes('Project reentry fixture')`
    )
    await js(`document.querySelector('.memory-row').click()`)
    await waitFor(
      `document.querySelector('.memory-detail h3')?.textContent === 'Project reentry fixture'`
    )
    await js(`window.__FLYENV_PLUGIN_ROUTER__.push('/mcp')`)
    await waitFor(`!document.querySelector('#memory-search')`)
    await js(`window.__FLYENV_PLUGIN_ROUTER__.push('/ai-memory')`)
    await waitFor(`!!document.querySelector('#memory-search')`)
    assert.equal(
      await js(`!!document.querySelector('#memory-edit')`),
      false,
      'remount must not retain project content with a reset global target'
    )
    checkpoints.push('project-detail-cleared-on-remount')
    await js(
      `Array.from(document.querySelectorAll('.memory-toolbar button')).find(el => el.textContent.includes('Filters')).click()`
    )
    await waitFor(`!!document.querySelector('.memory-filters')`)
    await js(
      `Array.from(document.querySelectorAll('.el-checkbox')).find(el => el.textContent.includes('Include global')).click(); document.querySelector('#memory-search').click()`
    )
    await waitFor(
      `Array.from(document.querySelectorAll('.memory-row')).some(el => el.textContent.includes('Edited in full FlyEnv UI'))`
    )
    await js(
      `Array.from(document.querySelectorAll('.memory-row')).find(el => el.textContent.includes('Edited in full FlyEnv UI')).click()`
    )
    await waitFor(
      `document.querySelector('.memory-detail h3')?.textContent === 'Edited in full FlyEnv UI'`
    )
    await js(`window.__FLYENV_PLUGIN_ROUTER__.push('/mcp')`)
    await waitFor(`!document.querySelector('#memory-search')`)
    await js(`window.__FLYENV_PLUGIN_ROUTER__.push('/ai-memory')`)
    await waitFor(`!!document.querySelector('#memory-search')`)
    assert.equal(await js(`!!document.querySelector('#memory-edit')`), false)
    checkpoints.push('global-hit-in-project-view-cleared-on-remount')
    await js(`document.querySelector('.memory-row').click()`)
    await waitFor(`!!document.querySelector('#memory-edit')`)
    window.webContents.closeDevTools()
    await js(
      `document.querySelectorAll('.el-message-box').forEach(box => { if (box.textContent.includes('FlyEnv Helper')) box.querySelector('.el-message-box__headerbtn')?.click(); })`
    )
    await js(
      `window.__FLYENV_PLUGIN_HOST__['element-plus'].ElMessageBox.close(); document.documentElement.classList.remove('dark'); document.documentElement.classList.add('light')`
    )
    await new Promise((resolve) => setTimeout(resolve, 500))
    await capture('ui-light.png')
    await js(
      `document.documentElement.classList.remove('light'); document.documentElement.classList.add('dark')`
    )
    await new Promise((resolve) => setTimeout(resolve, 200))
    await capture('ui-dark.png')
    await js(
      `document.querySelector('.memory-detail').closest('.el-drawer').querySelector('.el-drawer__close-btn').click()`
    )
    await js(
      `window.__FLYENV_PLUGIN_HOST__.lang.AppI18n().global.locale = 'zh'; document.querySelectorAll('.memory-page > .el-radio-group .el-radio-button')[1].click()`
    )
    await waitFor(`document.body.textContent.includes('准备记忆服务')`)
    await new Promise((resolve) => setTimeout(resolve, 500))
    await waitFor(`document.body.textContent.includes('未启动')`)
    assert.equal(
      await js(
        `Array.from(document.querySelectorAll('.memory-client-row button')).every(el => el.disabled)`
      ),
      true
    )
    const { createServer } = await import('node:net')
    const portProbe = createServer()
    await new Promise<void>((resolve) => portProbe.listen(0, '127.0.0.1', resolve))
    const memoryPort = (portProbe.address() as any).port
    await new Promise<void>((resolve) => portProbe.close(() => resolve()))
    application.mcpConfigManager.setConfig('port', memoryPort)
    application.mcpConfigManager.setConfig(
      'enabledTools',
      ['search', 'get', 'store', 'update', 'forget'].map((name) => 'flyenv_memory_' + name)
    )
    await application.mcpRuntime.start()
    await js(
      `Array.from(document.querySelectorAll('.memory-setting-actions button')).find(el=>el.textContent.trim()==='检查状态').click()`
    )
    await waitFor(`document.body.textContent.includes('服务已就绪')`)
    assert.equal(
      await js(
        `Array.from(document.querySelectorAll('.memory-client-row button')).every(el=>!el.disabled)`
      ),
      true
    )
    checkpoints.push('connection-stopped-disabled-then-real-service-ready')
    await new Promise((resolve) => setTimeout(resolve, 400))
    await capture('ui-zh-setup.png')
    await js(
      `Array.from(document.querySelectorAll('.memory-page > .el-radio-group .el-radio-button')).find(el => el.textContent.includes('维护')).click()`
    )
    await waitFor(`document.body.textContent.includes('离线备份与恢复')`)
    assert.equal(
      await js(
        `document.querySelector('.memory-settings')?.textContent.includes('JSON.stringify')`
      ),
      false
    )
    window.setSize(900, 760)
    await new Promise((resolve) => setTimeout(resolve, 300))
    await capture('ui-zh-maintenance-narrow.png')
    checkpoints.push('light-dark-chinese-setup')
    await writeFile(join(output, 'result.json'), JSON.stringify({ ok: true, checkpoints }, null, 2))
  } catch (error) {
    try {
      await writeFile(
        join(output, 'ui-failure.png'),
        (await application!.mainWindow.webContents.capturePage()).toPNG()
      )
    } catch {}
    await writeFile(
      join(output, 'result.json'),
      JSON.stringify(
        { ok: false, checkpoints, error: error instanceof Error ? error.stack : String(error) },
        null,
        2
      )
    )
  } finally {
    await application?.mcpRuntime
      ?.peek()
      ?.stop()
      .catch(() => {})
    await application?.forkManager?.destroy().catch(() => {})
    // No Application.stop(): full-app quit would run unrelated system hosts cleanup.
    app.exit()
  }
}
void run()
