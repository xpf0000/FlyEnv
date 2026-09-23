import assert from 'node:assert/strict'
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { buildPlugin } from './plugin-builder'
import { validatePluginCatalog, validatePluginManifest } from '../src/shared/plugin/PluginManifest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const output = path.resolve(root, 'tmp/plugin-system-test/mailpit-example')
const archive = path.resolve(root, 'tmp/plugin-system-test/mailpit-example.flyenv-plugin')
const registryPath = path.resolve(root, 'plugins/registry.json')
const require = createRequire(import.meta.url)
const sevenZip = require('7zip-min-electron') as {
  list(path: string, callback: (error: Error | null, output: Array<{ name: string }>) => void): void
}

const sourceManifest = validatePluginManifest(
  await fs.readJson(path.resolve(root, 'plugins/mailpit/plugin.json'))
)
assert.equal(sourceManifest.id, 'mailpit-example')
assert.equal(sourceManifest.module.typeFlag, 'mailpit-plugin')

// The archived build upserts plugins/registry.json as a side effect; snapshot it
// now and restore it at the end so the test does not dirty the repository file.
const registryBackup = (await fs.pathExists(registryPath))
  ? await fs.readFile(registryPath, 'utf8')
  : null

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

// Host skeleton code must never be bundled into the plugin artifact: the plugin
// consumes it via the __FLYENV_PLUGIN_HOST__ bridges at runtime.
const renderArtifact = await fs.readFile(path.join(output, 'render/index.mjs'), 'utf8')
assert.doesNotMatch(renderArtifact, /__FLYENV_PLUGIN_HOST__ = pluginHost/)
assert.doesNotMatch(renderArtifact, /__vite_glob/)
assert.doesNotMatch(renderArtifact, /createWebHashHistory/)
assert.doesNotMatch(renderArtifact, /defineStore\("brew"/)
assert.match(renderArtifact, /__FLYENV_PLUGIN_HOST__/)

// The render bundle must stay lean: heavy shared dependencies live in the host
// and are consumed via component/runtime bridges, never bundled.
assert.doesNotMatch(renderArtifact, /monaco-editor|monacoEditor/)
assert.doesNotMatch(renderArtifact, /xterm/i)
// Both the raw (`host?.components?.X`) and the esbuild-transpiled
// (`(_a?.components) == null ? void 0 : _b.X`) bridge forms must be accepted.
for (const sharedComponent of [
  'ServiceManager',
  'VersionManager',
  'Conf',
  'ConfCommon',
  'Log',
  'LogTool'
]) {
  assert.match(renderArtifact, new RegExp(`components[^;]*${sharedComponent}`))
}

const forkArtifact = await fs.readFile(path.join(output, 'fork/index.mjs'), 'utf8')
assert.match(forkArtifact, /mailpit-plugin/)
// Runtime require() calls that survive bundling (e.g. 7zip-min-electron) must be
// anchored at global.Server.Static, not at the plugin install directory.
assert.match(forkArtifact, /__flyenvPluginRequireAnchor/)

// The fork bundle must load from a directory OUTSIDE the repository: inside the
// repo, Node's resolution would walk up to the repo's node_modules and the test
// would pass even if runtime require() anchoring were broken.
const isolatedRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flyenv-plugin-fork-import-'))
try {
  const isolatedPlugin = path.join(isolatedRoot, 'mailpit-example')
  await fs.copy(output, isolatedPlugin)
  ;(globalThis as any).Server = { Static: path.resolve(root, 'static') }
  const entryUrl = pathToFileURL(path.join(isolatedPlugin, 'fork/index.mjs')).href
  const loaded = await import(`${entryUrl}?t=${Date.now()}`)
  assert.ok(loaded.default, 'isolated fork bundle must expose a default export')
  assert.equal(typeof loaded.default.exec, 'function')
} finally {
  delete (globalThis as any).Server
  await fs.remove(isolatedRoot)
}

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
assert.match(forkEntry, /from '\.\/MailPit'/)
assert.doesNotMatch(forkEntry, /@fork\/module\/MailPit/)

const forkModule = await fs.readFile(
  path.resolve(root, 'plugins/mailpit/fork/MailPit/index.ts'),
  'utf8'
)
assert.match(forkModule, /this\.type = 'mailpit-plugin'/)

const rendererEntry = await fs.readFile(
  path.resolve(root, 'plugins/mailpit/render/Index.vue'),
  'utf8'
)
assert.doesNotMatch(rendererEntry, /flyenv:mailpit/)
assert.match(rendererEntry, /mailpit-plugin/)

const pluginRuntime = await fs.readFile(path.resolve(root, 'src/render/core/Plugin.ts'), 'utf8')
assert.match(pluginRuntime, /__FLYENV_PLUGIN_HOST__/)
assert.match(pluginRuntime, /vue-router/)
assert.match(pluginRuntime, /element-plus/)
assert.match(pluginRuntime, /coreModule/)
assert.match(pluginRuntime, /BrewStore/)
assert.match(pluginRuntime, /appModules/)
assert.match(pluginRuntime, /vueExtend/)
assert.doesNotMatch(pluginRuntime, /MailpitAside/)
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
assert.match(appModules, /syncRendererPluginModules/)
assert.match(appModules, /reactive\(\[\]\)/)
assert.match(appModules, /unregisterPluginRoute/)

// Hot reload without restart: fork loader must bust Node's import() URL cache,
// the router must support removing plugin routes, the renderer must react to
// Plugins snapshot changes, and the market controller must prefer hot sync over
// the restart prompt.
const forkPluginLoader = await fs.readFile(path.resolve(root, 'src/fork/PluginLoader.ts'), 'utf8')
assert.match(forkPluginLoader, /\?t=\$\{encodeURIComponent\(stamp\)\}/)
assert.match(forkPluginLoader, /mtimeMs/)

const routerSource = await fs.readFile(path.resolve(root, 'src/render/router/index.ts'), 'utf8')
assert.match(routerSource, /name: item\.typeFlag/)
assert.match(routerSource, /export function unregisterPluginRoute/)
assert.match(routerSource, /router\.removeRoute/)

const globalIPCOn = await fs.readFile(path.resolve(root, 'src/render/util/GlobalIPCOn.ts'), 'utf8')
assert.match(globalIPCOn, /syncRendererPluginModules/)
assert.match(globalIPCOn, /pluginsChanged/)

const pluginMarketController = await fs.readFile(
  path.resolve(root, 'src/render/components/Setup/Plugins/controller.ts'),
  'utf8'
)
assert.match(pluginMarketController, /applyHotReload/)
assert.match(pluginMarketController, /syncRendererPluginModules/)
assert.match(pluginMarketController, /restartRequired = true/)

const pluginBuilder = await fs.readFile(path.resolve(root, 'scripts/plugin-builder.ts'), 'utf8')
assert.match(pluginBuilder, /flyenv-plugin-wasm-stub/)
assert.match(pluginBuilder, /\.flyenv-plugin/)
assert.match(pluginBuilder, /flyenv:ipc/)
assert.match(pluginBuilder, /'@\/core\/ASide'/)
assert.match(pluginBuilder, /'@\/core\/VueExtend'/)
assert.match(pluginBuilder, /'@\/core\/AppModules'/)
assert.match(pluginBuilder, /normalizeBridgeId/)
assert.doesNotMatch(pluginBuilder, /flyenv:mailpit/)

const pluginRunner = await fs.readFile(path.resolve(root, 'scripts/plugin-runner.ts'), 'utf8')
assert.match(pluginRunner, /tmp[\\/]plugins/)
assert.match(pluginRunner, /dist\/plugins/)
assert.match(pluginRunner, /Run: yarn plugin:build/)

const runtimeSmoke = await fs.readFile(
  path.resolve(root, 'scripts/plugin-runtime-smoke.ts'),
  'utf8'
)
for (const checkpoint of [
  'renderer-route',
  'fork-version-scan',
  'start-stop',
  'version-list',
  'update',
  'hot-fork-update',
  'hot-disable',
  'hot-reenable',
  'hot-reenable-version-list',
  'uninstall',
  'hot-uninstall',
  'runtime-data-preserved'
]) {
  assert.match(runtimeSmoke, new RegExp(checkpoint))
}
const packageJson = await fs.readJson(path.resolve(root, 'package.json'))
assert.equal(packageJson.scripts['plugin:runtime-smoke'], 'tsx scripts/plugin-runtime-smoke.ts')

const officialRegistry = await fs.readJson(registryPath)
assert.equal(officialRegistry.schemaVersion, 1)
assert.equal(Array.isArray(officialRegistry.plugins), true)
for (const item of officialRegistry.plugins) {
  assert.equal(item.official, true)
  assert.match(item.artifact.sha256, /^[a-f0-9]{64}$/)
}

// The archived build above must have upserted the mailpit entry into the official
// registry: official flag set, empty draft URL, sha256 matching the real archive.
const registryEntry = officialRegistry.plugins.find((item: any) => item.id === 'mailpit-example')
assert.ok(registryEntry, 'registry.json must contain the mailpit-example entry after build')
assert.equal(registryEntry.official, true)
assert.equal(registryEntry.artifact.url, '')
const archiveSha256 = crypto
  .createHash('sha256')
  .update(await fs.readFile(archive))
  .digest('hex')
assert.equal(registryEntry.artifact.sha256, archiveSha256)
assert.deepEqual(registryEntry.module, sourceManifest.module)
assert.deepEqual(registryEntry.platforms, sourceManifest.module.platform)

// Draft entries (empty artifact url) must be filtered out, not reject the catalog.
const draftCatalog = validatePluginCatalog(structuredClone(officialRegistry))
assert.equal(
  draftCatalog.plugins.some((item) => item.id === 'mailpit-example'),
  false,
  'validatePluginCatalog must filter empty-url draft entries'
)
assert.throws(
  () =>
    validatePluginCatalog({
      plugins: [{ id: 'bad', name: 'Bad', version: '1.0.0', artifact: { url: 'ftp://x' } }]
    }),
  /artifact URL is invalid/
)

// The updated registry must also be copied next to the archive.
const registryCopyPath = path.join(path.dirname(archive), 'registry.json')
assert.equal(await fs.pathExists(registryCopyPath), true, 'registry copy missing next to archive')
assert.deepEqual(await fs.readJson(registryCopyPath), officialRegistry)

// A default-path build must isolate all outputs per plugin folder under
// dist/plugins/<name>/, including the archive and the registry copy.
await buildPlugin('mailpit', { minify: false, archive: true })
const distPluginRoot = path.resolve(root, 'dist/plugins/mailpit')
const distArchivePath = path.join(
  distPluginRoot,
  `mailpit-example-${sourceManifest.version}.flyenv-plugin`
)
const distRegistryPath = path.join(distPluginRoot, 'registry.json')
assert.equal(
  await fs.pathExists(path.join(distPluginRoot, 'mailpit-example/render/index.mjs')),
  true,
  'dist render entry missing'
)
assert.equal(
  await fs.pathExists(path.join(distPluginRoot, 'mailpit-example/fork/index.mjs')),
  true,
  'dist fork entry missing'
)
assert.equal(await fs.pathExists(distArchivePath), true, 'dist archive missing')
assert.equal(await fs.pathExists(distRegistryPath), true, 'dist registry copy missing')
const distRegistry = await fs.readJson(distRegistryPath)
assert.deepEqual(distRegistry, await fs.readJson(registryPath))
const distArchiveSha256 = crypto
  .createHash('sha256')
  .update(await fs.readFile(distArchivePath))
  .digest('hex')
assert.equal(
  distRegistry.plugins.find((item: any) => item.id === 'mailpit-example')?.artifact?.sha256,
  distArchiveSha256,
  'dist registry sha256 must match the dist archive'
)

// Restore the repository registry file so the test leaves no side effects behind.
if (registryBackup === null) {
  await fs.remove(registryPath)
} else {
  await fs.writeFile(registryPath, registryBackup)
}

// Cleanup: only this plugin's isolated dist directory, never other plugins'.
await fs.remove(distPluginRoot)

await fs.remove(output)
await fs.remove(archive)
await fs.remove(path.join(path.dirname(archive), 'registry.json'))
console.log('plugin system test passed')
