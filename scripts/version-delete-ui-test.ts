import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import { compileScript, compileStyle, parse } from '@vue/compiler-sfc'
import electron from 'electron'

const root = resolve(import.meta.dirname, '..')
const temporary = await mkdtemp(join(tmpdir(), 'flyenv-version-delete-ui-'))
try {
  const { descriptor } = parse(
    await readFile(join(root, 'src/render/components/ServiceManager/delDialog.vue'), 'utf8')
  )
  const component = compileScript(descriptor, {
    id: 'version-delete-test',
    inlineTemplate: true
  }).content
  const english = JSON.parse(await readFile(join(root, 'src/lang/en/base.json'), 'utf8'))
  const chinese = JSON.parse(await readFile(join(root, 'src/lang/zh/base.json'), 'utf8'))
  const style = compileStyle({
    source: descriptor.styles[0].content,
    filename: 'delDialog.vue',
    id: 'version-delete-test',
    preprocessLang: 'scss'
  })
  assert.deepEqual(style.errors, [])
  await writeFile(join(temporary, 'component.css'), style.code)
  await build({
    stdin: {
      contents: `import { createApp, nextTick } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import Dialog from 'fixture-dialog'
window.fixture = { managed: true, locale: 'en', deleted: [], done: 0, inspected: 0, opened: [] }
const fixture = window.fixture
let app
fixture.mount = async (managed = true, locale = 'en') => {
  app?.unmount()
  document.body.innerHTML = '<div id="app"></div>'
  fixture.managed = managed
  fixture.locale = locale
  fixture.deleted = []
  fixture.done = 0
  app = createApp(Dialog, {
    item: { typeFlag: 'php', version: '8.3', path: 'C:\\\\FlyEnv\\\\app\\\\php-8.3', bin: 'C:\\\\FlyEnv\\\\app\\\\php-8.3\\\\php-cgi.exe' },
    onDone: () => { fixture.done++ }
  }).use(ElementPlus)
  app.mount('#app')
  await nextTick()
}
fixture.unmount = () => app?.unmount()
window.fixtureReady = true`,
      resolveDir: root,
      loader: 'ts'
    },
    bundle: true,
    platform: 'browser',
    format: 'iife',
    outfile: join(temporary, 'renderer.js'),
    logLevel: 'silent',
    plugins: [
      {
        name: 'isolated-version-delete-ui',
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /^(fixture-dialog|@\/util\/AsyncComponent|@lang\/index|@\/util\/NodeFn|@\/util\/InstalledVersionNote|\.\/VersionDeleteController)$/
            },
            (args) => ({ path: args.path, namespace: 'fixture' })
          )
          builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => {
            const sources: Record<string, string> = {
              'fixture-dialog': component,
              '@/util/AsyncComponent': `import { ref, onMounted } from 'vue'; export function AsyncComponentSetup() { const show = ref(false); onMounted(() => { show.value = true }); return { show, onClosed() {}, onSubmit() {}, closedFn() {} } }`,
              '@lang/index': `const locales = ${JSON.stringify({ en: english, zh: chinese })}; export const I18nT = key => locales[window.fixture.locale][key.replace('base.', '')] ?? key`,
              '@/util/NodeFn': `export const shell = { showItemInFolder: path => window.fixture.opened.push(path) }`,
              '@/util/InstalledVersionNote': `export const installedVersionNote = () => ''`,
              './VersionDeleteController': `export default { inspect: async target => { window.fixture.inspected++; return window.fixture.managed ? { ...target, identity: 'fixture' } : undefined }, isDeleting: () => false, remove: async (target, directory, confirmation, done) => { window.fixture.deleted.push({ target, confirmation }); done(); return true } }`
            }
            return { contents: sources[args.path], loader: 'ts', resolveDir: root }
          })
        }
      }
    ]
  })
  await writeFile(
    join(temporary, 'index.html'),
    '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><link rel="stylesheet" href="component.css"></head><body><script src="renderer.js"></script></body></html>'
  )
  const uiChecks = String.raw`(async () => {
      const ensure = (value, message) => {
        if (!value) throw new Error(message)
      }
      const waitFor = async (predicate) => {
        for (let i = 0; i < 200; i++) {
          if (predicate()) return
          await new Promise((resolve) => setTimeout(resolve, 10))
        }
        throw new Error('UI wait timed out')
      }
      await waitFor(() => window.fixtureReady)
      const fixture = window.fixture
      const dialogs = () =>
        [...document.querySelectorAll('[role="dialog"]')].filter(
          (element) => element.getClientRects().length
        )
      const buttons = (dialog) => [...dialog.querySelectorAll('button')]
      const forceButton = () =>
        buttons(dialogs()[0]).find(
          (button) =>
            button.textContent.trim() === (fixture.locale === 'en' ? 'Force Delete' : '强制删除')
        )
      const input = () => document.querySelector('#version-force-delete-input')
      const confirmButton = () => dialogs().at(-1).querySelector('button.el-button--danger')
      const fill = async (value) => {
        input().value = value
        input().dispatchEvent(new Event('input', { bubbles: true }))
        await Promise.resolve()
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
      let checks = 0
      for (const locale of ['en', 'zh']) {
        await fixture.mount(false, locale)
        await waitFor(() => dialogs().length === 1)
        await new Promise((resolve) => setTimeout(resolve, 50))
        ensure(!forceButton(), 'external version must not show Force Delete')
        checks++
        await fixture.mount(true, locale)
        await waitFor(() => forceButton())
        forceButton().click()
        await waitFor(() => dialogs().length === 2 && input())
        ensure(
          dialogs()[1].textContent.includes(
            locale === 'en' ? 'It does not just remove a link' : '不是仅删除链接'
          ),
          'warning must explain actual directory deletion'
        )
        ensure(
          dialogs()[1].textContent.includes('C:\\FlyEnv\\app\\php-8.3'),
          'actual target path must be shown'
        )
        ensure(confirmButton().disabled, 'empty confirmation must be disabled')
        for (const value of ['force delete', 'Force delete', 'Force Delete ', ' Force Delete']) {
          await fill(value)
          ensure(confirmButton().disabled, 'incorrect confirmation must remain disabled: ' + value)
          input().dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
          ensure(fixture.deleted.length === 0, 'Enter must not bypass exact confirmation')
          checks++
        }
        await fill('Force Delete')
        ensure(!confirmButton().disabled, 'exact confirmation must enable OK')
        buttons(dialogs()[1])
          .find((button) => button.textContent.trim() === (locale === 'en' ? 'Cancel' : '取消'))
          .click()
        await waitFor(() => dialogs().length === 1)
        ensure(fixture.deleted.length === 0, 'cancelling must never delete')
        await new Promise((resolve) => setTimeout(resolve, 350))
        forceButton().click()
        await waitFor(() => dialogs().length === 2)
        ensure(input().value === '', 'reopening must clear the confirmation')
        ensure(confirmButton().disabled, 'reopening must require fresh input')
        await fill('Force Delete')
        confirmButton().click()
        await waitFor(() => fixture.deleted.length === 1)
        ensure(
          fixture.deleted[0].confirmation === 'Force Delete',
          'controller must receive the confirmed phrase'
        )
        ensure(fixture.done === 1, 'completion callback must fire once')
        checks += 5
      }
      await fixture.mount(true, 'en')
      await waitFor(() => forceButton())
      forceButton().click()
      await waitFor(() => dialogs().length === 2)
      await new Promise(resolve => setTimeout(resolve, 450))
      return { checks, deleted: fixture.deleted.length }
    })()`
  const screenshot = join(tmpdir(), 'flyenv-version-delete-confirmation.png')
  await writeFile(
    join(temporary, 'main.cjs'),
    `const { app, BrowserWindow } = require('electron')
const fs = require('node:fs/promises')
app.setPath('userData', ${JSON.stringify(join(temporary, 'profile'))})
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1000, height: 850, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false } })
  await win.loadFile(${JSON.stringify(join(temporary, 'index.html'))})
  try {
    const result = await win.webContents.executeJavaScript(${JSON.stringify(uiChecks)})
    await fs.writeFile(${JSON.stringify(screenshot)}, (await win.webContents.capturePage()).toPNG())
    console.log('VERSION_DELETE_UI_RESULT=' + JSON.stringify(result))
    app.exit(0)
  } catch (error) { console.error(error); app.exit(1) }
})
setTimeout(() => app.exit(2), 25000)`
  )
  const result = await new Promise<{ code: number | null; output: string }>(
    (resolveResult, reject) => {
      const child = spawn(String(electron), [join(temporary, 'main.cjs')], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
        stdio: ['ignore', 'pipe', 'pipe']
      })
      let output = ''
      child.stdout.on('data', (chunk) => {
        output += chunk
      })
      child.stderr.on('data', (chunk) => {
        output += chunk
      })
      child.on('error', reject)
      child.on('close', (code) => resolveResult({ code, output }))
    }
  )
  assert.equal(result.code, 0, result.output)
  console.log(
    result.output
      .split('\n')
      .filter((line) => line.includes('VERSION_DELETE_UI_RESULT='))
      .join('\n')
  )
  console.log(`Confirmation screenshot: ${screenshot}`)
} finally {
  await rm(temporary, { recursive: true, force: true })
}
