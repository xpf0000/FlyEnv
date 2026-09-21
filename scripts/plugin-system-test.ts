import assert from 'node:assert/strict'
import fs from 'fs-extra'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { buildPlugin } from './plugin-builder'
import { validatePluginManifest } from '../src/shared/plugin/PluginManifest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const output = path.resolve(root, 'tmp/plugin-system-test/mailpit-example')
const debugOutput = path.resolve(root, 'tmp/plugins/debug/mailpit-example')
const archive = path.resolve(root, 'tmp/plugin-system-test/mailpit-example.flyenv-plugin')
const require = createRequire(import.meta.url)
const sevenZip = require('7zip-min-electron') as {
  list(path: string, callback: (error: Error | null, output: Array<{ name: string }>) => void): void
}

const sourceManifest = validatePluginManifest(
  await fs.readJson(path.resolve(root, 'plugins/mailpit/plugin.json'))
)
assert.equal(sourceManifest.id, 'mailpit-example')
assert.equal(sourceManifest.module.typeFlag, 'mailpit-plugin')

await buildPlugin('mailpit', { outputRoot: output, minify: false })
await buildPlugin('mailpit', {
  outputRoot: output,
  minify: false,
  archive: true,
  archivePath: archive
})

const builtManifest = validatePluginManifest(await fs.readJson(path.join(output, 'plugin.json')))
assert.equal(builtManifest.entry.render, 'render/index.mjs')
assert.equal(builtManifest.entry.fork, 'fork/index.mjs')
assert.equal(await fs.pathExists(path.join(output, 'render/index.mjs')), true)
assert.equal(await fs.pathExists(path.join(output, 'fork/index.mjs')), true)

const archiveListing = await new Promise<Array<{ name: string }>>((resolve, reject) => {
  sevenZip.list(archive, (error, listing) => (error ? reject(error) : resolve(listing)))
})
for (const entry of ['plugin.json', 'render/index.mjs', 'fork/index.mjs']) {
  assert.equal(
    archiveListing.some((item) => item.name.endsWith(entry)),
    true,
    `archive missing ${entry}`
  )
}

const forkEntry = await fs.readFile(path.resolve(root, 'plugins/mailpit/fork/index.ts'), 'utf8')
assert.match(forkEntry, /@fork\/module\/MailPit/)

const rendererEntry = await fs.readFile(
  path.resolve(root, 'plugins/mailpit/render/Index.vue'),
  'utf8'
)
assert.match(rendererEntry, /flyenv:mailpit/)
assert.match(rendererEntry, /mailpit-plugin/)

const pluginRuntime = await fs.readFile(path.resolve(root, 'src/render/core/Plugin.ts'), 'utf8')
assert.match(pluginRuntime, /__FLYENV_PLUGIN_HOST__/)
assert.match(pluginRuntime, /vue-router/)
assert.match(pluginRuntime, /MailpitAside/)
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
assert.match(moduleSettings, />Plugin<\//)
assert.match(moduleSettings, /plugin\.version/)

const baseManager = await fs.readFile(path.resolve(root, 'src/fork/BaseManager.ts'), 'utf8')
assert.match(baseManager, /pluginLoader\.load\(module\)/)
assert.match(baseManager, /ProcessSendError\(ipcCommandKey, 'No Found Module'\)/)

const appModules = await fs.readFile(path.resolve(root, 'src/render/core/AppModules.ts'), 'utf8')
assert.match(appModules, /loadRendererPluginModules/)
assert.match(appModules, /built-in module already owns typeFlag/)
assert.match(appModules, /loadAppPluginModules/)

const pluginBuilder = await fs.readFile(path.resolve(root, 'scripts/plugin-builder.ts'), 'utf8')
assert.match(pluginBuilder, /flyenv-plugin-wasm-stub/)
assert.match(pluginBuilder, /\.flyenv-plugin/)
assert.match(pluginBuilder, /flyenv:ipc/)
assert.match(pluginBuilder, /flyenv:mailpit/)

const pluginRunner = await fs.readFile(path.resolve(root, 'scripts/plugin-runner.ts'), 'utf8')
assert.match(pluginRunner, /tmp[\\/]plugins[\\/]debug/)
assert.doesNotMatch(pluginRunner, /dist[\\/]plugins.*manifest\.id/)

await fs.ensureDir(debugOutput)
await fs.writeJson(path.join(debugOutput, 'plugin.json'), builtManifest)
await fs.remove(path.resolve(root, 'dist'))
assert.equal(await fs.pathExists(path.join(debugOutput, 'plugin.json')), true)
await fs.remove(debugOutput)

await fs.remove(output)
await fs.remove(archive)
console.log('plugin system test passed')
