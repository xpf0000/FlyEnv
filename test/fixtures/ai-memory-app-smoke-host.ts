import { app } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

async function run() {
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
    application.start('index')
    const window = application.mainWindow
    window.setSize(1260, 900)
    const js = (source: string) => window.webContents.executeJavaScript(source, true)
    const waitFor = async (expression: string, timeout = 60_000) => {
      const until = Date.now() + timeout
      while (Date.now() < until) {
        if (await js(expression).catch(() => false)) return
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
      throw new Error(`UI condition timed out: ${expression}`)
    }
    await waitFor(
      `!!window.__FLYENV_PLUGIN_ROUTER__?.getRoutes().find(r => r.path === '/ai-memory')`,
      120_000
    )
    await js(`window.__FLYENV_PLUGIN_ROUTER__.push('/ai-memory')`)
    await waitFor(`!!document.querySelector('#memory-search')`)
    window.webContents.closeDevTools()
    await js(
      `document.querySelectorAll('.el-message-box').forEach(box => { if (box.textContent.includes('FlyEnv Helper')) box.querySelector('.el-message-box__headerbtn')?.click(); })`
    )
    checkpoints.push('full-application-plugin-route')
    const call = (method: string, input: any) =>
      js(
        `new Promise(resolve => { const ipc = window.__FLYENV_PLUGIN_HOST__.ipc; ipc.sendSensitive('app-fork:ai-memory', ${JSON.stringify(method)}, ${JSON.stringify(input)}).then((key,res) => { if (res?.code === 200) return; ipc.off(key); resolve(res); }); })`
      )
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
    await js(`document.querySelector('#memory-next').click()`)
    await waitFor(`document.querySelectorAll('.memory-row').length === 2`)
    checkpoints.push('pagination-8-then-2')
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
    await waitFor(`document.querySelector('#memory-operation')?.textContent.includes('Completed')`)
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
      `Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(el => el.textContent.includes(${JSON.stringify(projectPath)}))`
    )
    await js(
      `Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(el => el.textContent.includes(${JSON.stringify(projectPath)})).click()`
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
    await writeFile(join(output, 'ui-light.png'), (await window.webContents.capturePage()).toPNG())
    await js(
      `document.documentElement.classList.remove('light'); document.documentElement.classList.add('dark')`
    )
    await new Promise((resolve) => setTimeout(resolve, 200))
    await writeFile(join(output, 'ui-dark.png'), (await window.webContents.capturePage()).toPNG())
    await js(
      `window.__FLYENV_PLUGIN_HOST__.lang.AppI18n().global.locale = 'zh'; document.querySelector('.el-collapse-item__header').click()`
    )
    await waitFor(`document.body.textContent.includes('离线备份与恢复')`)
    await js(`document.querySelector('.memory-setup').scrollIntoView({block:'start'})`)
    await new Promise((resolve) => setTimeout(resolve, 500))
    await writeFile(
      join(output, 'ui-zh-setup.png'),
      (await window.webContents.capturePage()).toPNG()
    )
    checkpoints.push('light-dark-chinese-setup')
    await writeFile(join(output, 'result.json'), JSON.stringify({ ok: true, checkpoints }, null, 2))
  } catch (error) {
    await writeFile(
      join(output, 'result.json'),
      JSON.stringify({ ok: false, checkpoints, error: String(error) }, null, 2)
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
