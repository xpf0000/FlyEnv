import assert from 'node:assert/strict'
import fs from 'fs-extra'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPlugin } from './plugin-builder'
import { validatePluginManifest } from '../src/shared/plugin/PluginManifest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const output = path.resolve(root, 'tmp/plugin-system-test/example')

const sourceManifest = validatePluginManifest(
  await fs.readJson(path.resolve(root, 'plugins/example/plugin.json'))
)
assert.equal(sourceManifest.id, 'example')
assert.equal(sourceManifest.module.typeFlag, 'example-plugin')

await buildPlugin('example', { outputRoot: output, minify: false })

const builtManifest = validatePluginManifest(await fs.readJson(path.join(output, 'plugin.json')))
assert.equal(builtManifest.entry.render, 'render/index.mjs')
assert.equal(builtManifest.entry.fork, 'fork/index.mjs')
assert.equal(await fs.pathExists(path.join(output, 'render/index.mjs')), true)
assert.equal(await fs.pathExists(path.join(output, 'fork/index.mjs')), true)

const baseManager = await fs.readFile(path.resolve(root, 'src/fork/BaseManager.ts'), 'utf8')
assert.match(baseManager, /pluginLoader\.load\(module\)/)
assert.match(baseManager, /ProcessSendError\(ipcCommandKey, 'No Found Module'\)/)

const appModules = await fs.readFile(path.resolve(root, 'src/render/core/App.ts'), 'utf8')
assert.match(appModules, /loadRendererPluginModules/)
assert.match(appModules, /built-in module already owns typeFlag/)

await fs.remove(output)
console.log('plugin system test passed')
