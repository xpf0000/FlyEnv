import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import PluginManager from '../src/main/plugins/PluginManager'
import { validatePluginManifest } from '../src/shared/plugin/PluginManifest'

const require = createRequire(import.meta.url)
const sevenZip = require('7zip-min-electron') as {
  pack(source: string, target: string, callback: (error?: Error | null) => void): void
}

const pack = (source: string, target: string) =>
  new Promise<void>((resolve, reject) =>
    sevenZip.pack(source, target, (error) => (error ? reject(error) : resolve()))
  )

const manifestFixture = (overrides: Record<string, unknown> = {}) => ({
  apiVersion: 1,
  id: 'sample.plugin',
  name: 'Sample Plugin',
  version: '1.0.0',
  module: { typeFlag: 'sample-plugin', moduleType: 'other', label: 'Sample' },
  entry: { render: 'render/index.mjs' },
  ...overrides
})

const root = await mkdtemp(join(tmpdir(), 'flyenv-plugin-manager-'))
try {
  const source = join(root, 'source')
  const archive = join(root, 'sample.flyenv-plugin')
  const missingEntrySource = join(root, 'missing-entry-source')
  const missingEntryArchive = join(root, 'missing-entry.flyenv-plugin')
  const incompatibleSource = join(root, 'incompatible-source')
  const incompatibleArchive = join(root, 'incompatible.flyenv-plugin')
  const failedUpdateSource = join(root, 'failed-update-source')
  const failedUpdateArchive = join(root, 'failed-update.flyenv-plugin')
  await writeFile(join(root, 'placeholder'), '')
  await import('node:fs/promises').then(({ mkdir }) =>
    mkdir(join(source, 'render'), { recursive: true })
  )
  await writeFile(join(source, 'plugin.json'), JSON.stringify(manifestFixture()))
  await writeFile(join(source, 'render/index.mjs'), 'export default { typeFlag: "sample-plugin" }')
  await pack(source, archive)
  const bytes = await readFile(archive)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  await mkdir(missingEntrySource, { recursive: true })
  await writeFile(
    join(missingEntrySource, 'plugin.json'),
    JSON.stringify(manifestFixture({ id: 'missing.entry', module: { typeFlag: 'missing-entry' } }))
  )
  await pack(missingEntrySource, missingEntryArchive)
  const missingEntryBytes = await readFile(missingEntryArchive)
  await mkdir(incompatibleSource, { recursive: true })
  await writeFile(
    join(incompatibleSource, 'plugin.json'),
    JSON.stringify(
      manifestFixture({
        id: 'incompatible.plugin',
        module: { typeFlag: 'incompatible-plugin', platform: ['Windows'] }
      })
    )
  )
  await pack(incompatibleSource, incompatibleArchive)
  const incompatibleBytes = await readFile(incompatibleArchive)
  await mkdir(failedUpdateSource, { recursive: true })
  await writeFile(
    join(failedUpdateSource, 'plugin.json'),
    JSON.stringify(manifestFixture({ version: '2.0.0' }))
  )
  await pack(failedUpdateSource, failedUpdateArchive)
  const failedUpdateBytes = await readFile(failedUpdateArchive)
  const archiveBytes = new Map([
    ['https://example.test/sample.flyenv-plugin', bytes],
    ['https://example.test/missing-entry.flyenv-plugin', missingEntryBytes],
    ['https://example.test/incompatible.flyenv-plugin', incompatibleBytes],
    ['https://example.test/failed-update.flyenv-plugin', failedUpdateBytes]
  ])
  const previousRegistry = process.env.FLYENV_PLUGIN_REGISTRY_URL
  process.env.FLYENV_PLUGIN_REGISTRY_URL = 'https://official.test/registry.json'
  const manager = new PluginManager({
    pluginsRoot: join(root, 'plugins'),
    statePath: join(root, 'plugins.json'),
    fetchImpl: async (url) =>
      url.toString().includes('registry')
        ? new Response(
            JSON.stringify({
              plugins: [
                {
                  id: 'sample.plugin',
                  name: 'Sample Plugin',
                  version: '1.0.0',
                  artifact: { url: 'https://official.test/sample.flyenv-plugin', sha256 }
                }
              ]
            }),
            { status: 200 }
          )
        : new Response(archiveBytes.get(url.toString()) ?? bytes, { status: 200 })
  })

  assert.throws(
    () => validatePluginManifest(manifestFixture({ version: 'release-latest' })),
    /version/i
  )
  assert.throws(
    () => validatePluginManifest(manifestFixture({ entry: { render: '../outside.mjs' } })),
    /entry/i
  )
  assert.throws(
    () =>
      validatePluginManifest(
        manifestFixture({ module: { typeFlag: 'sample-plugin', platform: ['Android'] } })
      ),
    /platform/i
  )

  await assert.rejects(
    () =>
      manager.install({
        id: 'sample.plugin',
        version: '1.0.0',
        url: 'https://example.test/sample.flyenv-plugin',
        source: 'official'
      }),
    /checksum/i
  )
  await assert.rejects(
    () =>
      manager.install({
        id: 'sample.plugin',
        version: '1.0.0',
        url: 'https://example.test/sample.flyenv-plugin',
        sha256: '0'.repeat(64),
        source: 'official'
      }),
    /checksum/i
  )
  await assert.rejects(
    () =>
      manager.install({
        id: 'missing.entry',
        version: '1.0.0',
        url: 'https://example.test/missing-entry.flyenv-plugin',
        sha256: createHash('sha256').update(missingEntryBytes).digest('hex'),
        source: 'official'
      }),
    /entry/i
  )
  await assert.rejects(
    () =>
      manager.install({
        id: 'incompatible.plugin',
        version: '1.0.0',
        url: 'https://example.test/incompatible.flyenv-plugin',
        sha256: createHash('sha256').update(incompatibleBytes).digest('hex'),
        source: 'official'
      }),
    /compatible/i
  )

  const installed = await manager.install({
    id: 'sample.plugin',
    version: '1.0.0',
    url: 'https://example.test/sample.flyenv-plugin',
    sha256,
    source: 'official'
  })
  assert.equal(installed.id, 'sample.plugin')
  assert.equal(installed.enabled, true)
  assert.equal((await manager.getForkSnapshot())['sample-plugin'], undefined)
  assert.equal((await manager.getRendererPlugins()).length, 1)
  assert.equal((await manager.listCatalog())[0].installed, '1.0.0')

  await assert.rejects(
    () =>
      manager.install({
        id: 'sample.plugin',
        version: '2.0.0',
        url: 'https://example.test/failed-update.flyenv-plugin',
        sha256: createHash('sha256').update(failedUpdateBytes).digest('hex'),
        source: 'official'
      }),
    /entry/i
  )
  const stateAfterFailedUpdate = JSON.parse(await readFile(join(root, 'plugins.json'), 'utf8'))
  assert.equal(stateAfterFailedUpdate.plugins['sample.plugin'].activeVersion, '1.0.0')
  assert.equal(
    await import('node:fs/promises').then(({ access }) =>
      access(join(root, 'plugins/sample.plugin/1.0.0/plugin.json'))
        .then(() => true)
        .catch(() => false)
    ),
    true
  )

  const firstToggle = manager.setEnabled('sample.plugin', false)
  const secondToggle = manager.setEnabled('sample.plugin', true)
  assert.equal(firstToggle, secondToggle)
  await firstToggle

  await writeFile(
    join(root, 'plugins.json'),
    JSON.stringify({
      version: 1,
      plugins: { 'sample.plugin': { enabled: true, activeVersion: '9.9.9' } },
      sources: []
    })
  )
  await manager.refresh()
  assert.equal(
    manager.getDiagnostics().some((item) => /active plugin version/i.test(item.message)),
    true
  )

  const duplicateRoot = join(root, 'duplicate-plugins')
  for (const id of ['one.plugin', 'two.plugin']) {
    const dir = join(duplicateRoot, id)
    await mkdir(join(dir, 'render'), { recursive: true })
    await writeFile(
      join(dir, 'plugin.json'),
      JSON.stringify(manifestFixture({ id, module: { typeFlag: 'duplicate-module' } }))
    )
    await writeFile(join(dir, 'render/index.mjs'), 'export default {}')
  }
  const linkDir = join(duplicateRoot, 'link.plugin')
  await mkdir(join(linkDir, 'render'), { recursive: true })
  await writeFile(
    join(linkDir, 'plugin.json'),
    JSON.stringify(manifestFixture({ id: 'link.plugin' }))
  )
  await symlink(join(root, 'placeholder'), join(linkDir, 'render/index.mjs'))
  const duplicateManager = new PluginManager({
    pluginsRoot: duplicateRoot,
    statePath: join(root, 'duplicate-plugins.json')
  })
  await duplicateManager.refresh()
  assert.equal(
    duplicateManager.getDiagnostics().some((item) => /duplicate plugin module/i.test(item.message)),
    true
  )
  assert.equal(
    duplicateManager.getDiagnostics().some((item) => /entry file is missing/i.test(item.message)),
    true
  )

  const pendingPath = join(root, 'pending-delete-plugin')
  await mkdir(pendingPath, { recursive: true })
  const pendingStatePath = join(root, 'pending-state.json')
  await writeFile(
    pendingStatePath,
    JSON.stringify({
      version: 1,
      plugins: { pending: { enabled: false, pendingDelete: [pendingPath] } },
      sources: []
    })
  )
  const pendingManager = new PluginManager({
    pluginsRoot: join(root, 'pending-plugins'),
    statePath: pendingStatePath
  })
  await pendingManager.refresh()
  assert.equal(
    await readFile(pendingStatePath, 'utf8').then((value) =>
      value.includes('pending-delete-plugin')
    ),
    false
  )
  assert.equal(
    await import('node:fs/promises').then(({ access }) =>
      access(pendingPath)
        .then(() => true)
        .catch(() => false)
    ),
    false
  )

  ;(globalThis as any).Server = { DataDirectoryReady: false }
  const recoveryManager = new PluginManager({
    pluginsRoot: join(root, 'recovery-plugins'),
    statePath: join(root, 'recovery-state.json')
  })
  assert.deepEqual(await recoveryManager.refresh(), [])
  assert.equal(
    await import('node:fs/promises').then(({ access }) =>
      access(join(root, 'recovery-plugins'))
        .then(() => true)
        .catch(() => false)
    ),
    false
  )
  delete (globalThis as any).Server

  await manager.setEnabled('sample.plugin', false)
  assert.equal((await manager.getRendererPlugins()).length, 0)
  await manager.setEnabled('sample.plugin', true)
  assert.equal((await manager.getRendererPlugins()).length, 1)

  await manager.addSource('https://third-party.test/registry.json')
  assert.deepEqual(
    (await manager.listSources()).map((item) => item.url),
    ['https://third-party.test/registry.json']
  )
  await manager.removeSource('https://third-party.test/registry.json')
  assert.equal((await manager.listSources()).length, 0)

  await manager.uninstall('sample.plugin')
  assert.equal((await manager.listInstalled()).length, 0)
  if (previousRegistry === undefined) delete process.env.FLYENV_PLUGIN_REGISTRY_URL
  else process.env.FLYENV_PLUGIN_REGISTRY_URL = previousRegistry
  console.log('plugin manager test passed')
} finally {
  await rm(root, { recursive: true, force: true })
}
