import { app } from 'electron'
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import assert from 'node:assert/strict'

async function run() {
  const root = process.env.BREW_SMOKE_ROOT!
  const output = process.env.BREW_SMOKE_OUTPUT!
  const repo = process.env.BREW_SMOKE_REPO!
  app.setPath('userData', join(root, 'user'))
  app.setPath('sessionData', join(root, 'user'))
  app.setPath('logs', join(root, 'logs'))
  app.setAppPath(repo)
  global.__static = join(repo, 'dist/electron/static')
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
  await mkdir(join(root, 'user'), { recursive: true })
  await writeFile(
    join(root, 'user/user.json'),
    JSON.stringify({
      showTour: false,
      moduleOnboardingVersion: 1,
      setup: {
        lang: 'en',
        autoCheck: false,
        phpBrewInitiated: true,
        hosts: { write: false },
        proxy: { on: false, proxy: '' },
        common: { showItem: {} }
      }
    })
  )
  app.on('window-all-closed', () => {})
  await app.whenReady()
  let application: any
  let service: ChildProcess | undefined
  const checkpoints: string[] = []
  try {
    const { default: Application } = await import('../../src/main/Application')
    const { default: ServiceProcess } = await import('../../src/main/core/ServiceProcess')
    application = new Application()
    global.application = application
    const { AppModuleEnum } = await import('../../src/render/core/type')
    application.configManager.setConfig(
      'setup.common.showItem',
      Object.fromEntries(Object.values(AppModuleEnum).map((flag) => [flag, flag === 'php']))
    )
    application.configManager.setConfig('setup.autoCheck', false)
    application.configManager.setConfig('setup.hosts', { write: false })
    await application.init()
    application.start('index')
    const win = application.mainWindow
    win.webContents.on('console-message', (_e: unknown, level: number, message: string) => {
      if (level >= 2 || /brew|Homebrew/.test(message)) console.log('[renderer]', message)
    })
    win.webContents.setBackgroundThrottling(false)
    win.setSize(1180, 820)
    win.show()
    const js = (source: string) => win.webContents.executeJavaScript(source, true)
    const wait = async (expression: string, timeout = 60_000) => {
      const until = Date.now() + timeout
      while (Date.now() < until) {
        await js(`window.__FLYENV_PLUGIN_HOST__?.['element-plus']?.ElMessageBox.close()`).catch(
          () => {}
        )
        if (await js(expression).catch(() => false)) return
        await new Promise((r) => setTimeout(r, 150))
      }
      throw new Error(
        `UI timeout: ${expression}; state=${await js('JSON.stringify({phase:window.brewSmoke?.phase,error:window.brewSmoke?.error})').catch(() => 'unavailable')}`
      )
    }
    await wait('!!window.__FLYENV_PLUGIN_ROUTER__', 100_000)
    win.webContents.closeDevTools()
    await js(
      `(async()=>{ const { AppModuleTab }=await import('/core/Module.ts'); const { BrewStore }=await import('/store/brew.ts');AppModuleTab.php=2;BrewStore().LibUse.php='brew';await window.__FLYENV_PLUGIN_ROUTER__.push('/php');window.brewSmoke=(await import('/components/VersionManager/brew/Controller.ts')).homebrewUpgrade;})()`
    )
    const update = `Array.from(document.querySelectorAll('.el-table button')).find(b=>b.textContent.trim()==='Update')`
    await wait(`!!(${update}) && !(${update}).disabled`, 100_000)
    const ini = join(root, 'user-php.ini')
    await writeFile(ini, 'user setting remains unchanged\n')
    const current = {
      bin: join(root, 'prefix/Cellar/php/8.5.7/sbin/php-fpm'),
      path: join(root, 'prefix/Cellar/php/8.5.7'),
      version: '8.5.7',
      enable: true,
      num: 85,
      source: 'Homebrew'
    }
    application.configManager.setConfig('server.php.current', current)
    const before = JSON.stringify(application.configManager.getConfig('server.php.current'))
    await js(
      `(async()=>{const {AppStore}=await import('/store/app.ts');AppStore().config.server.php.current=${before}; const notes=await import('/util/InstalledVersionNote.ts');await notes.setInstalledVersionNote({...${before},typeFlag:'php'},'keep old version note','php')})()`
    )

    const startService = async () => {
      service = spawn(process.env.BREW_SMOKE_NODE!, ['-e', 'setInterval(()=>{},1000)'], {
        stdio: 'ignore'
      })
      await new Promise<void>((yes, no) => {
        service!.once('spawn', yes)
        service!.once('error', no)
      })
      await writeFile(join(root, 'service-pids.json'), JSON.stringify([service.pid]))
      const item = { ...current, pid: String(service.pid), run: true, running: false }
      ServiceProcess.addPid('php', String(service.pid), item as any, [item])
      return item
    }
    const item = await startService()
    await js(`(${update}).click()`)
    await wait(
      `Array.from(document.querySelectorAll('.el-dialog')).some(d=>d.getBoundingClientRect().height>0 && d.textContent.includes('You must manually'))`
    )
    await writeFile(
      join(output, 'warning-en-light.png'),
      (await win.webContents.capturePage()).toPNG()
    )
    await js(
      `Array.from(document.querySelectorAll('.el-dialog button')).find(b=>b.textContent.trim()==='Cancel').click()`
    )
    await wait(
      `!Array.from(document.querySelectorAll('.el-dialog')).some(d=>d.getBoundingClientRect().height>0)`
    )
    assert.equal(existsSync(join(root, 'events')), false)
    assert.equal(ServiceProcess.statusOf('php').instances.length, 1)
    checkpoints.push('cancel-has-no-stop-or-upgrade')
    const installResult = await js(
      `window.brewSmoke.package({name:'shivammathur/extensions/imagick@8.5',installed:false,typeFlag:'php'})`
    )
    assert.equal(installResult.outcome, 'failed')
    assert.match(installResult.error, /stop.*service/i)
    assert.equal(ServiceProcess.statusOf('php').instances.length, 1)
    assert.equal(existsSync(join(root, 'events')), false)
    checkpoints.push('ordinary-extension-install-blocked-with-running-service-no-stop-or-package')
    const confirm = async () => {
      await js(`(${update}).click()`)
      await wait(
        `window.brewSmoke.phase==='idle' && Array.from(document.querySelectorAll('.el-dialog button')).some(b=>b.textContent.trim()==='Confirm update' && b.getBoundingClientRect().height>0 && !b.disabled)`
      )
      await js(
        `Array.from(document.querySelectorAll('.el-dialog button')).find(b=>b.textContent.trim()==='Confirm update' && b.getBoundingClientRect().height>0).click()`
      )
    }
    await writeFile(join(root, 'fail-stop'), 'yes')
    await confirm()
    await wait(`window.brewSmoke.phase==='failed'`)
    assert.match(await js('window.brewSmoke.error'), /fixture stop failure/)
    assert.equal(existsSync(join(root, 'events')), false)
    assert.equal(ServiceProcess.statusOf('php').instances.length, 1)
    checkpoints.push('failed-stop-never-runs-brew')
    await rm(join(root, 'fail-stop'))
    await writeFile(join(root, 'fail-upgrade'), 'yes')
    await confirm()
    await wait(`window.brewSmoke.phase==='upgrading'`)
    const blocked: any = await application.forkManager
      .send('php', 'startService', item)
      .catch((e: Error) => ({ code: 1, msg: e.message }))
    assert.equal(blocked.code, 1)
    assert.match(blocked.msg, /Homebrew/)
    await wait(`window.brewSmoke.phase==='failed'`)
    assert.equal(ServiceProcess.statusOf('php').instances.length, 0)
    assert.deepEqual((await readFile(join(root, 'events'), 'utf8')).trim().split('\n'), [
      'stopped',
      'upgrade'
    ])
    checkpoints.push('stop-before-upgrade-failure-no-restart-start-gated')
    await rm(join(root, 'fail-upgrade'))
    await startService()
    await confirm()
    await wait(`window.brewSmoke.phase==='upgrading'`)
    await js(`window.__FLYENV_PLUGIN_ROUTER__.push('/mcp')`)
    await new Promise((r) => setTimeout(r, 250))
    await js(`window.__FLYENV_PLUGIN_ROUTER__.push('/php')`)
    await wait(`window.brewSmoke.phase==='succeeded'`)
    await wait(`document.querySelector('.el-table')?.textContent.includes('8.5.12')`)
    assert.equal(ServiceProcess.statusOf('php').instances.length, 0)
    assert.equal(JSON.stringify(application.configManager.getConfig('server.php.current')), before)
    assert.equal(await readFile(ini, 'utf8'), 'user setting remains unchanged\n')
    assert.equal(
      await js(
        `(async()=>JSON.stringify((await import('/store/app.ts')).AppStore().config.server.php.current))()`
      ),
      before
    )
    assert.equal(
      await js(
        `(async()=>(await import('/util/InstalledVersionNote.ts')).installedVersionNote({...${before},typeFlag:'php'},'php'))()`
      ),
      'keep old version note'
    )

    const events = (await readFile(join(root, 'events'), 'utf8')).trim().split('\n')
    assert.deepEqual(events, ['stopped', 'upgrade', 'stopped', 'upgrade'])
    checkpoints.push('success-refresh-page-reentry-settings-preserved-no-restart')
    await rm(join(root, 'upgraded'))
    await writeFile(join(root, 'fail-catalog'), 'yes')
    await js(`window.brewSmoke.loadCatalog(['homebrew/core/php'])`)
    await wait(`!!(${update}) && !(${update}).disabled`)
    await confirm()
    await wait(`window.brewSmoke.phase==='upgrading'`)
    await wait(`window.brewSmoke.logs.includes('fixture upgrade running')`)
    await assert.rejects(
      ServiceProcess.runLifecycle(
        'php',
        'start',
        async () => {
          throw new Error('must not dispatch')
        },
        item
      ),
      /Homebrew/
    )
    const drainStart = Date.now()
    await application.forkManager.drainServiceLifecycleRequests()
    assert(Date.now() - drainStart > 1000, 'drain must wait for real package close')
    await wait(`window.brewSmoke.phase==='succeeded'`)
    checkpoints.push('shared-lifecycle-start-gated-and-quit-drain-waits-package-close')
    assert.equal(await js('window.brewSmoke.result.outcome'), 'succeeded')
    assert.equal(await js('window.brewSmoke.refreshFailed'), true)
    assert.match(await js('window.brewSmoke.catalogError'), /fixture catalog query failure/)
    assert.equal(await js('Object.keys(window.brewSmoke.catalog).length'), 0)
    await wait(
      `document.querySelector('.el-alert')?.textContent.includes('Some Homebrew update information')`
    )
    assert.equal((await readFile(join(root, 'events'), 'utf8')).match(/upgrade/g)?.length, 3)
    await rm(join(root, 'fail-catalog'))
    await js(`window.brewSmoke.loadCatalog(['homebrew/core/php'])`)
    assert.equal(await js('window.brewSmoke.catalogError'), '')
    checkpoints.push('catalog-query-failure-visible-success-preserved-no-replay-refresh-recovers')

    await js(
      `(async()=>{await (await import('/core/LanguageService.ts')).RendererLanguage.switchLocale('zh');window.__FLYENV_PLUGIN_HOST__['element-plus'].ElMessage.closeAll();window.__FLYENV_PLUGIN_HOST__['element-plus'].ElMessageBox.close();document.documentElement.classList.remove('light');document.documentElement.classList.add('dark')})()`
    )
    await wait(`document.body.textContent.includes('更新成功')`)
    win.setSize(900, 760)
    await new Promise((r) => setTimeout(r, 700))
    await writeFile(
      join(output, 'success-dark-narrow.png'),
      (await win.webContents.capturePage()).toPNG()
    )
    await writeFile(
      join(output, 'result.json'),
      JSON.stringify(
        {
          ok: true,
          checkpoints,
          scope:
            'Real Application/renderer/IPC/admission/package child; test-only PHP process adapter; no real Homebrew upgrade'
        },
        null,
        2
      )
    )
  } catch (error) {
    try {
      await writeFile(
        join(output, 'failure.png'),
        (await application.mainWindow.webContents.capturePage()).toPNG()
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
    service?.kill('SIGKILL')
    await application?.mcpRuntime
      ?.peek()
      ?.stop()
      .catch(() => {})
    await application?.forkManager?.destroy().catch(() => {})
    app.exit()
  }
}
void run()
