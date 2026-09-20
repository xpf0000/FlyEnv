import assert from 'node:assert/strict'
import fs from 'fs-extra'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPlugin } from './plugin-builder'
import { validatePluginManifest } from '../src/shared/plugin/PluginManifest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const output = path.resolve(root, 'tmp/plugin-system-test/mailpit-example')

const sourceManifest = validatePluginManifest(
  await fs.readJson(path.resolve(root, 'plugins/mailpit/plugin.json'))
)
assert.equal(sourceManifest.id, 'mailpit-example')
assert.equal(sourceManifest.module.typeFlag, 'mailpit-plugin')

await buildPlugin('mailpit', { outputRoot: output, minify: false })

const builtManifest = validatePluginManifest(await fs.readJson(path.join(output, 'plugin.json')))
assert.equal(builtManifest.entry.render, 'render/index.mjs')
assert.equal(builtManifest.entry.fork, 'fork/index.mjs')
assert.equal(await fs.pathExists(path.join(output, 'render/index.mjs')), true)
assert.equal(await fs.pathExists(path.join(output, 'fork/index.mjs')), true)

const forkEntry = await fs.readFile(path.resolve(root, 'plugins/mailpit/fork/index.ts'), 'utf8')
assert.match(forkEntry, /@fork\/module\/MailPit/)

const rendererEntry = await fs.readFile(
  path.resolve(root, 'plugins/mailpit/render/Index.vue'),
  'utf8'
)
assert.match(rendererEntry, /fetchAllOnlineVersion/)
assert.match(rendererEntry, /startService/)
assert.match(rendererEntry, /installSoft/)
assert.match(rendererEntry, /BrewStore/)
assert.match(rendererEntry, /module\.fetchInstalled/)

const pluginRuntime = await fs.readFile(path.resolve(root, 'src/render/core/Plugin.ts'), 'utf8')
assert.match(pluginRuntime, /__FLYENV_PLUGIN_HOST__/)
assert.match(pluginRuntime, /vue-router/)
assert.match(pluginRuntime, /plugin:\s*\{/)

const moduleRuntime = await fs.readFile(
  path.resolve(root, 'src/render/core/Module/Module.ts'),
  'utf8'
)
assert.match(moduleRuntime, /this\.isPlugin/)
assert.match(moduleRuntime, /app-fork:\$\{this\.typeFlag\}/)
assert.match(moduleRuntime, /'allInstalledVersions', setup/)

const appStartup = await fs.readFile(path.resolve(root, 'src/render/App.vue'), 'utf8')
assert.match(appStartup, /module\.isPlugin = !!item\.plugin/)

const moduleSettings = await fs.readFile(
  path.resolve(root, 'src/render/components/Setup/ModuleShowHide/index.vue'),
  'utf8'
)
assert.match(moduleSettings, />Plugin<\/)
assert.match(moduleSettings, /plugin\.version/)

const baseManager = await fs.readFile(path.resolve(root, 'src/fork/BaseManager.ts'), 'utf8')
assert.match(baseManager, /pluginLoader\.load\(module\)/)
assert.match(baseManager, /ProcessSendError\(ipcCommandKey, 'No Found Module'\)/)

const appModules = await fs.readFile(path.resolve(root, 'src/render/core/App.ts'), 'utf8')
assert.match(appModules, /loadRendererPluginModules/)
assert.match(appModules, /built-in module already owns typeFlag/)

await fs.remove(output)
console.log('plugin system test passed')
