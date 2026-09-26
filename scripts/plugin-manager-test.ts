import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
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
  const incompatibleArchitectureSource = join(root, 'incompatible-architecture-source')
  const incompatibleArchitectureArchive = join(root, 'incompatible-architecture.flyenv-plugin')
  const failedUpdateSource = join(root, 'failed-update-source')
  const failedUpdateArchive = join(root, 'failed-update.flyenv-plugin')
  const updateSource = join(root, 'update-source')
  const updateArchive = join(root, 'update.flyenv-plugin')
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
        module: {
          typeFlag: 'incompatible-plugin',
          // Must exclude the platform running this test, otherwise the
          // compatibility check passes and validation fails elsewhere first.
          platform: [process.platform === 'win32' ? 'macOS' : 'Windows']
        }
      })
    )
  )
  await pack(incompatibleSource, incompatibleArchive)
  const incompatibleBytes = await readFile(incompatibleArchive)
  await mkdir(join(incompatibleArchitectureSource, 'render'), { recursive: true })
  await writeFile(
    join(incompatibleArchitectureSource, 'plugin.json'),
    JSON.stringify(
      manifestFixture({
        id: 'incompatible-architecture.plugin',
        architecture: [process.arch === 'arm64' ? 'x64' : 'arm64']
      })
    )
  )
  await writeFile(
    join(incompatibleArchitectureSource, 'render/index.mjs'),
    'export default { typeFlag: "sample-plugin" }'
  )
  await pack(incompatibleArchitectureSource, incompatibleArchitectureArchive)
  const incompatibleArchitectureBytes = await readFile(incompatibleArchitectureArchive)
  await mkdir(failedUpdateSource, { recursive: true })
  await writeFile(
    join(failedUpdateSource, 'plugin.json'),
    JSON.stringify(manifestFixture({ version: '2.0.0' }))
  )
  await pack(failedUpdateSource, failedUpdateArchive)
  const failedUpdateBytes = await readFile(failedUpdateArchive)
  await mkdir(join(updateSource, 'render'), { recursive: true })
  await writeFile(
    join(updateSource, 'plugin.json'),
    JSON.stringify(manifestFixture({ version: '2.0.0' }))
  )
  await writeFile(
    join(updateSource, 'render/index.mjs'),
    'export default { typeFlag: "sample-plugin" }'
  )
  await pack(updateSource, updateArchive)
  const updateBytes = await readFile(updateArchive)
  const archiveBytes = new Map([
    ['https://example.test/sample.flyenv-plugin', bytes],
    ['https://example.test/missing-entry.flyenv-plugin', missingEntryBytes],
    ['https://example.test/incompatible.flyenv-plugin', incompatibleBytes],
    ['https://example.test/incompatible-architecture.flyenv-plugin', incompatibleArchitectureBytes],
    ['https://example.test/failed-update.flyenv-plugin', failedUpdateBytes],
    ['https://example.test/update.flyenv-plugin', updateBytes]
  ])
  const previousRegistry = process.env.FLYENV_PLUGIN_REGISTRY_URL
  process.env.FLYENV_PLUGIN_REGISTRY_URL = 'https://official.test/registry.json'
  let stopCalls = 0
  let serviceRunning = false
  let failStop = false
  let licenseOk = true
  const manager = new PluginManager({
    pluginsRoot: join(root, 'plugins'),
    statePath: join(root, 'plugins.json'),
    licenseCheck: async () => licenseOk,
    stopPluginServices: async () => {
      stopCalls += 1
      if (failStop) throw new Error('service stop failed')
      serviceRunning = false
      return { stopped: true }
    },
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
  assert.throws(
    () => validatePluginManifest(manifestFixture({ architecture: ['mips'] })),
    /architecture/i
  )

  licenseOk = false
  await assert.rejects(
    () =>
      manager.install({
        id: 'sample.plugin',
        version: '1.0.0',
        url: 'https://example.test/sample.flyenv-plugin',
        sha256,
        source: 'official'
      }),
    /license/i
  )
  licenseOk = true

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
  await assert.rejects(
    () =>
      manager.install({
        id: 'incompatible-architecture.plugin',
        version: '1.0.0',
        url: 'https://example.test/incompatible-architecture.flyenv-plugin',
        sha256: createHash('sha256').update(incompatibleArchitectureBytes).digest('hex'),
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

  serviceRunning = true
  await manager.setEnabled('sample.plugin', false)
  assert.equal(stopCalls, 1)
  assert.equal(serviceRunning, false)
  await manager.setEnabled('sample.plugin', true)
  serviceRunning = true
  failStop = true
  await assert.rejects(() => manager.setEnabled('sample.plugin', false), /service stop failed/i)
  assert.equal((await manager.listInstalled())[0].enabled, true)
  assert.equal(
    await readFile(join(root, 'plugins/sample.plugin/1.0.0/plugin.json')).then(() => true),
    true
  )
  failStop = false
  serviceRunning = false

  serviceRunning = true
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
  serviceRunning = false
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

  serviceRunning = true
  const stopCallsBeforeSuccessfulUpdate = stopCalls
  const updated = await manager.install({
    id: 'sample.plugin',
    version: '2.0.0',
    url: 'https://example.test/update.flyenv-plugin',
    sha256: createHash('sha256').update(updateBytes).digest('hex'),
    source: 'official'
  })
  assert.equal(updated.version, '2.0.0')
  assert.equal(stopCalls, stopCallsBeforeSuccessfulUpdate + 1)
  assert.equal(
    JSON.parse(await readFile(join(root, 'plugins.json'), 'utf8')).plugins['sample.plugin']
      .activeVersion,
    '2.0.0'
  )
  serviceRunning = false

  // Copying the plugin files together with the plugins.json state file into
  // another installation (different install secret) must not activate it.
  const cloneRoot = join(root, 'clone')
  await cp(join(root, 'plugins'), join(cloneRoot, 'plugins'), { recursive: true })
  await cp(join(root, 'plugins.json'), join(cloneRoot, 'plugins.json'))
  const cloneManager = new PluginManager({
    pluginsRoot: join(cloneRoot, 'plugins'),
    statePath: join(cloneRoot, 'plugins.json')
  })
  await cloneManager.refresh()
  assert.equal(cloneManager.listInstalled().length, 0)
  assert.equal(
    cloneManager.getDiagnostics().some((item) => /install record mismatch/i.test(item.message)),
    true
  )

  // With OS keychain encryption (safeStorage) the install secret survives
  // restarts on the same account, and copying even the secret file to another
  // machine — where the keychain cannot decrypt it — blocks the copied plugins.
  const protectorFor = (key: string) => ({
    encrypt: (text: string) => Buffer.from(`${key}:${text}`, 'utf8').toString('base64'),
    decrypt: (data: string) => {
      const raw = Buffer.from(data, 'base64').toString('utf8')
      if (!raw.startsWith(`${key}:`)) throw new Error('decryption failed')
      return raw.slice(key.length + 1)
    }
  })
  const encRoot = join(root, 'encrypted')
  const encOptions = {
    pluginsRoot: join(encRoot, 'plugins'),
    statePath: join(encRoot, 'plugins.json'),
    licenseCheck: async () => true,
    secretProtect: protectorFor('machine-a'),
    fetchImpl: async (url: URL | RequestInfo) =>
      new Response(archiveBytes.get(url.toString()) ?? bytes, { status: 200 })
  }
  await new PluginManager(encOptions).install({
    id: 'sample.plugin',
    version: '1.0.0',
    url: 'https://example.test/sample.flyenv-plugin',
    sha256,
    source: 'official'
  })
  assert.equal(
    (await readFile(join(encRoot, '.plugin-install-secret'), 'utf8')).startsWith('enc:'),
    true
  )
  const encRestart = await new PluginManager(encOptions).refresh()
  assert.equal(encRestart.length, 1)

  const encCloneRoot = join(root, 'encrypted-clone')
  await cp(encRoot, encCloneRoot, { recursive: true })
  const encClone = new PluginManager({
    pluginsRoot: join(encCloneRoot, 'plugins'),
    statePath: join(encCloneRoot, 'plugins.json'),
    secretProtect: protectorFor('machine-b')
  })
  await encClone.refresh()
  assert.equal(encClone.listInstalled().length, 0)
  assert.equal(
    encClone.getDiagnostics().some((item) => /install secret/i.test(item.message)),
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
  // Windows only allows symlink creation with developer mode or elevation;
  // without it the entry simply does not exist, which exercises the same
  // "entry file is missing" diagnostic below.
  try {
    await symlink(join(root, 'placeholder'), join(linkDir, 'render/index.mjs'))
  } catch (error: any) {
    if (error?.code !== 'EPERM') throw error
  }
  // A version-1 state file marks these as pre-token legacy installs, so the
  // scan guard accepts them once and backfills their install tokens.
  await writeFile(
    join(root, 'duplicate-plugins.json'),
    JSON.stringify({
      version: 1,
      plugins: {
        'one.plugin': { enabled: true, activeVersion: '1.0.0' },
        'two.plugin': { enabled: true, activeVersion: '1.0.0' },
        'link.plugin': { enabled: true, activeVersion: '1.0.0' }
      },
      sources: []
    })
  )
  const duplicateManager = new PluginManager({
    pluginsRoot: duplicateRoot,
    statePath: join(root, 'duplicate-plugins.json'),
    licenseCheck: async () => true
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

  // Plugin files copied directly into the plugins directory (no state record)
  // must not load.
  const copiedRoot = join(root, 'copied-plugins')
  const copiedDir = join(copiedRoot, 'copied.plugin', '1.0.0')
  await mkdir(join(copiedDir, 'render'), { recursive: true })
  await writeFile(
    join(copiedDir, 'plugin.json'),
    JSON.stringify(manifestFixture({ id: 'copied.plugin', module: { typeFlag: 'copied-module' } }))
  )
  await writeFile(join(copiedDir, 'render/index.mjs'), 'export default {}')
  const copiedManager = new PluginManager({
    pluginsRoot: copiedRoot,
    statePath: join(root, 'copied-plugins.json')
  })
  await copiedManager.refresh()
  assert.equal(copiedManager.listInstalled().length, 0)
  assert.equal(
    copiedManager
      .getDiagnostics()
      .some((item) => /not installed through the plugin manager/i.test(item.message)),
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

  serviceRunning = true
  const stopCallsBeforeUninstall = stopCalls
  await manager.uninstall('sample.plugin')
  assert.equal(stopCalls, stopCallsBeforeUninstall + 1)
  assert.equal((await manager.listInstalled()).length, 0)
  if (previousRegistry === undefined) delete process.env.FLYENV_PLUGIN_REGISTRY_URL
  else process.env.FLYENV_PLUGIN_REGISTRY_URL = previousRegistry
  console.log('plugin manager test passed')
} finally {
  await rm(root, { recursive: true, force: true })
}
