import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'

const root = path.resolve(import.meta.dirname, '../..')

test('plugin utilities preserve host responsive columns through loading, updates and re-enable', async () => {
  await mkdir(path.join(root, 'tmp'), { recursive: true })
  const dir = await mkdtemp(path.join(root, 'tmp/plugin-styles-'))
  try {
    const built = await build({
      entryPoints: [path.join(root, 'src/render/core/PluginStyles.ts')],
      bundle: true,
      format: 'iife',
      globalName: 'PluginStyles',
      write: false
    })
    const runner = path.join(dir, 'runner.cjs')
    await writeFile(
      runner,
      `
const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
app.setPath('userData', ${JSON.stringify(path.join(dir, 'user-data'))})
app.whenReady().then(async () => {
  let window
  try {
    window = new BrowserWindow({ show: false, width: 1800, height: 900 })
    await window.loadURL('data:text/html,<html><head></head><body></body></html>')
    const result = await window.webContents.executeJavaScript(${JSON.stringify(`
      ${built.outputFiles[0].text}
      (() => {
        const host = document.createElement('style')
        // Same base and responsive rules used by StartupGroup/Index.vue.
        host.textContent = '.grid {display:grid}.grid-cols-1 {grid-template-columns:repeat(1,minmax(0,1fr))}@media(min-width:1280px){[class~="xl:grid-cols-2"] {grid-template-columns:repeat(2,minmax(0,1fr))}}@media(min-width:1536px){[class~="2xl:grid-cols-3"] {grid-template-columns:repeat(3,minmax(0,1fr))}}' 
        document.head.appendChild(host)
        const group = document.createElement('div')
        group.className = 'grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3'
        document.body.appendChild(group)
        const extra = document.createElement('div')
        extra.className = 'plugin-extra'
        document.body.appendChild(extra)
        const columns = () => getComputedStyle(group).gridTemplateColumns.split(' ').length
        const result = { before: columns() }
        const css = '.grid-cols-1 {grid-template-columns:repeat(1,minmax(0,1fr))}.plugin-extra{padding:13px}'
        PluginStyles.syncPluginStyles([{id:'mysql-cluster',css}])
        result.after = columns()
        result.pluginPadding = getComputedStyle(extra).paddingTop
        PluginStyles.syncPluginStyles([{id:'mysql-cluster',css:css.replace('13px','17px')}])
        result.updated = columns()
        result.updatedPadding = getComputedStyle(extra).paddingTop
        result.styleCount = document.querySelectorAll('style[data-flyenv-plugin]').length
        PluginStyles.syncPluginStyles([])
        result.removed = columns()
        result.removedCount = document.querySelectorAll('style[data-flyenv-plugin]').length
        PluginStyles.syncPluginStyles([{id:'mysql-cluster',css},{id:'mariadb-cluster',css}])
        result.reenabled = columns()
        return result
      })()
    `)})
    assert.equal(result.before, 3, 'desktop host baseline must have three columns')
    assert.equal(result.after, 3, 'plugin base utilities must not collapse the host to one column')
    assert.equal(result.updated, 3)
    assert.equal(result.pluginPadding, '13px', 'plugin-only styles still apply')
    assert.equal(result.updatedPadding, '17px')
    assert.equal(result.styleCount, 1, 'hot updates reuse their style node')
    assert.equal(result.removed, 3)
    assert.equal(result.removedCount, 0)
    assert.equal(result.reenabled, 3)
    console.log('plugin style browser regression passed')
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    window?.destroy()
    app.exit(process.exitCode || 0)
  }
})
`
    )
    const result = await promisify(execFile)(
      path.join(root, 'node_modules/.bin/electron'),
      [runner],
      {
        timeout: 30_000,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '' }
      }
    )
    assert.match(result.stdout, /plugin style browser regression passed/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
