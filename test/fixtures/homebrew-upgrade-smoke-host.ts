import { app } from 'electron'
import { mkdir, writeFile, readFile, rm, open } from 'node:fs/promises'
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
    const previousExtension = join(root, 'extension.so')
    const nextExtension = join(root, 'next-extension.so')
    await writeFile(previousExtension, 'previous library')
    await writeFile(nextExtension, 'replacement library')
    const liveLibrary = await open(previousExtension, 'r')
    try {
      const copy = (source: string) =>
        js(
          `(async()=> (await import('/util/NodeFn.ts')).fs.copyFile(${JSON.stringify(source)}, ${JSON.stringify(previousExtension)}, true))()`
        )
      assert.equal(await copy(nextExtension), true)
      assert.equal(await liveLibrary.readFile('utf8'), 'previous library')
      assert.equal(await copy(join(root, 'unavailable-extension.so')), false)
      assert.equal(await readFile(previousExtension, 'utf8'), 'replacement library')
    } finally {
      await liveLibrary.close()
    }
    checkpoints.push('atomic-extension-copy-preserves-open-library-and-reports-write-failure')
    const list = `document.querySelector('.version-manager .el-table')`
    const terminal = `document.querySelector('.version-manager .xterm .xterm-screen')`
    const terminalFits = `(${terminal}).offsetHeight <= (${terminal}).closest('[role="region"]').clientHeight`
    const confirmButton = `document.querySelector('.version-manager .el-card__footer .el-button--primary')`
    const confirmTerminal = async () => {
      await wait(`!!(${confirmButton}) && !!(${terminal}) && !(${list})`)
      await wait(terminalFits, 3000)
      await js(`(${confirmButton}).click()`)
      await wait(`!!(${list}) && !(${terminal})`)
    }
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
    await confirmTerminal()
    const confirm = async () => {
      await js(`(${update}).click()`)
      await wait(
        `window.brewSmoke.phase==='idle' && Array.from(document.querySelectorAll('.el-dialog button')).some(b=>b.textContent.trim()==='Confirm update' && b.getBoundingClientRect().height>0 && !b.disabled)`
      )
      await js(
        `Array.from(document.querySelectorAll('.el-dialog button')).find(b=>b.textContent.trim()==='Confirm update' && b.getBoundingClientRect().height>0).click()`
      )
    }
    const { nodePtyRuntime } = await import('../../src/main/core/lazy/OptionalRuntimes')
    const loadNodePty = nodePtyRuntime.load
    nodePtyRuntime.load = async () => {
      throw new Error('fixture NodePTY load failure')
    }
    try {
      await confirm()
      await wait(`window.brewSmoke.phase==='failed'`)
      assert.match(await js('window.brewSmoke.error'), /fixture NodePTY load failure/)
      assert.equal(ServiceProcess.statusOf('php').instances.length, 1)
      assert.equal(existsSync(join(root, 'events')), false)
      await confirmTerminal()
    } finally {
      nodePtyRuntime.load = loadNodePty
    }
    checkpoints.push('terminal-load-failure-preserves-running-service-and-allows-retry')
    await writeFile(join(root, 'fail-stop'), 'yes')
    await confirm()
    await wait(`window.brewSmoke.phase==='failed'`)
    assert.match(await js('window.brewSmoke.error'), /fixture stop failure/)
    assert.equal(existsSync(join(root, 'events')), false)
    assert.equal(ServiceProcess.statusOf('php').instances.length, 1)
    checkpoints.push('failed-stop-never-runs-brew')
    await confirmTerminal()
    await rm(join(root, 'fail-stop'))
    await writeFile(join(root, 'fail-upgrade'), 'yes')
    await confirm()
    await wait(`window.brewSmoke.phase==='upgrading'`)
    await wait(
      `window.brewSmoke.logs.includes('fixture upgrade running TTY') && !!(${terminal}) && !(${list})`
    )
    assert.equal(await js(`!!(${confirmButton})`), false)
    await writeFile(
      join(output, 'terminal-live.png'),
      (await win.webContents.capturePage()).toPNG()
    )
    checkpoints.push('live-node-pty-output-replaces-list-with-xterm')
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
    await confirmTerminal()
    await rm(join(root, 'fail-upgrade'))
    await startService()
    await confirm()
    await wait(`window.brewSmoke.phase==='upgrading'`)
    await wait(`!!(${terminal}) && !(${list})`)
    await js(`window.__FLYENV_PLUGIN_ROUTER__.push('/mcp')`)
    await new Promise((r) => setTimeout(r, 250))
    await js(`window.__FLYENV_PLUGIN_ROUTER__.push('/php')`)
    await wait(`window.brewSmoke.phase==='succeeded'`)
    await confirmTerminal()
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
    assert.match(await js('window.brewSmoke.catalogs.php.error'), /fixture catalog query failure/)
    assert.equal(await js('Object.keys(window.brewSmoke.catalogs.php.rows).length'), 0)
    await confirmTerminal()
    await wait(
      `document.querySelector('.el-alert')?.textContent.includes('Some Homebrew update information')`
    )
    assert.equal((await readFile(join(root, 'events'), 'utf8')).match(/upgrade/g)?.length, 3)
    await rm(join(root, 'fail-catalog'))
    await js(`window.brewSmoke.loadCatalog(['homebrew/core/php'])`)
    assert.equal(await js('window.brewSmoke.catalogs.php.error'), '')
    checkpoints.push('catalog-query-failure-visible-success-preserved-no-replay-refresh-recovers')

    const selectVersionTab = (tab: number) =>
      js(
        `(async()=>{ const { AppModuleTab }=await import('/core/Module.ts'); const { BrewStore }=await import('/store/brew.ts'); BrewStore().LibUse.composer='brew'; AppModuleTab.php=${tab}; })()`
      )
    const packageButton = (label: string) =>
      `Array.from(document.querySelectorAll('.version-manager .el-table button')).find(b=>b.textContent.trim()===${JSON.stringify(label)})`
    await selectVersionTab(3)
    const startComposerOperation = async (action: string, label: string) => {
      const button = packageButton(label)
      await wait(`!!(${button}) && !(${button}).disabled`)
      await js(`(${button}).click()`)
      await wait(
        `!!window.brewSmoke.terminalId && window.brewSmoke.logs.includes('fixture composer ${action} TTY') && !!(${terminal}) && !(${list})`
      )
    }
    const composerMarker = join(root, 'composer-installed')
    await startComposerOperation('install', 'Install')
    const sharedPtyKey = await js('window.brewSmoke.terminalId')
    assert(nodePtyRuntime.peek()?.pty[sharedPtyKey])
    assert.equal(
      await js(
        `(async()=>{const { BrewSetup }=await import('/components/VersionManager/brew/setup.ts'); window.brewSmokeView=BrewSetup.xterm; return BrewSetup.xterm.ptyKey})()`
      ),
      sharedPtyKey
    )
    await selectVersionTab(2)
    await wait(`!!(${terminal}) && !(${list})`)
    await selectVersionTab(3)
    assert.equal(
      await js(
        `(async()=>{const { BrewSetup }=await import('/components/VersionManager/brew/setup.ts'); return window.brewSmokeView===BrewSetup.xterm})()`
      ),
      true
    )
    await wait(`document.activeElement?.classList.contains('xterm-helper-textarea')`)
    const footer = `document.querySelector('.version-manager .el-card__footer')`
    const footerBottom = `(${footer})?.getBoundingClientRect().bottom`
    const initialFooterBottom = await js(footerBottom)
    assert(initialFooterBottom > 0)
    win.webContents.sendInputEvent({ type: 'char', keyCode: 'y' })
    assert.equal(await js(footerBottom), initialFooterBottom)
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
    await wait(`window.brewSmoke.phase==='refreshing'`)
    assert.equal(await js(footerBottom), initialFooterBottom)
    assert.equal(await js(`(${footer}).querySelector('button').disabled`), true)
    await wait(`window.brewSmoke.phase==='succeeded'`)
    assert.equal(await readFile(composerMarker, 'utf8'), '2.8.7')
    assert.equal(nodePtyRuntime.peek()?.pty[sharedPtyKey], undefined)
    await confirmTerminal()
    checkpoints.push('composer-keyboard-input-and-refresh-keep-terminal-footer-fixed')

    await wait(`!!(${update}) && !(${update}).disabled`)
    await confirm()
    await wait(`window.brewSmoke.phase==='succeeded'`)
    assert.equal(await readFile(composerMarker, 'utf8'), '2.9.0')
    await confirmTerminal()
    await wait(`!(${update})`)
    checkpoints.push('non-php-upgrade-confirmed-executed-and-refreshed')

    await startComposerOperation('uninstall', 'Uninstall')
    const canceledPtyKey = await js('window.brewSmoke.terminalId')
    await js(`document.querySelector('.version-manager .el-card__footer button').click()`)
    await wait(`window.brewSmoke.result?.canceled && !!(${list}) && !(${terminal})`)
    assert.equal(nodePtyRuntime.peek()?.pty[canceledPtyKey], undefined)
    assert.equal(await readFile(composerMarker, 'utf8'), '2.9.0')
    checkpoints.push('running-package-cancel-waits-for-exit-before-returning-to-list')

    await startComposerOperation('uninstall', 'Uninstall')
    const keyboardCanceledPtyKey = await js('window.brewSmoke.terminalId')
    await wait(`document.activeElement?.classList.contains('xterm-helper-textarea')`)
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'C', modifiers: ['control'] })
    await wait(`window.brewSmoke.result?.canceled && !!(${list}) && !(${terminal})`)
    assert.equal(nodePtyRuntime.peek()?.pty[keyboardCanceledPtyKey], undefined)
    assert.equal(await readFile(composerMarker, 'utf8'), '2.9.0')
    checkpoints.push('xterm-ctrl-c-uses-package-cancellation')

    await startComposerOperation('uninstall', 'Uninstall')
    await wait(`window.brewSmoke.phase==='succeeded'`)
    assert.equal(existsSync(composerMarker), false)
    await confirmTerminal()
    await wait(`!!(${packageButton('Install')})`)
    checkpoints.push('uninstall-button-refreshes-list-and-restores-install-action')
    await selectVersionTab(2)

    await js(
      `(async()=>{await (await import('/core/LanguageService.ts')).RendererLanguage.switchLocale('zh');window.__FLYENV_PLUGIN_HOST__['element-plus'].ElMessage.closeAll();window.__FLYENV_PLUGIN_HOST__['element-plus'].ElMessageBox.close();document.documentElement.classList.remove('light');document.documentElement.classList.add('dark')})()`
    )
    await wait(`!!(${list}) && !(${terminal})`)
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
