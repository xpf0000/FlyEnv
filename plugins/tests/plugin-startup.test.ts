import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises'
import { promises as filesystem } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import ts from 'typescript'
import PluginManager from '../../src/main/plugins/PluginManager'

const root = path.resolve(import.meta.dirname, '../..')

async function fixture(version = 1) {
  const dir = await mkdtemp(path.join(tmpdir(), 'flyenv-plugin-startup-'))
  const manifest = {
    apiVersion: 1,
    id: 'startup-fixture',
    name: 'Startup fixture',
    version: '1.0.0',
    module: { typeFlag: 'startup-fixture', moduleType: 'other', label: 'Startup fixture' },
    entry: { render: 'render/index.mjs', fork: 'fork/index.mjs' }
  }
  const pluginRoot = path.join(dir, 'plugins', manifest.id, manifest.version)
  await mkdir(path.join(pluginRoot, 'render'), { recursive: true })
  await mkdir(path.join(pluginRoot, 'fork'), { recursive: true })
  const raw = JSON.stringify(manifest)
  await writeFile(path.join(pluginRoot, 'plugin.json'), raw)
  await writeFile(path.join(pluginRoot, 'render/index.mjs'), 'export default {}')
  await writeFile(path.join(pluginRoot, 'fork/index.mjs'), 'export default {}')
  await writeFile(path.join(dir, '.plugin-install-secret'), 'fixture-secret')
  const token = createHash('sha256')
    .update(`fixture-secret:startup-fixture:1.0.0:${raw}`)
    .digest('hex')
  const statePath = path.join(dir, 'plugins.json')
  await writeFile(
    statePath,
    JSON.stringify({
      version,
      plugins: {
        'startup-fixture': {
          enabled: true,
          activeVersion: '1.0.0',
          ...(version === 2 ? { installToken: token } : {})
        }
      },
      sources: []
    })
  )
  return {
    dir,
    statePath,
    manager: () =>
      new PluginManager({
        pluginsRoot: path.join(dir, 'plugins'),
        statePath,
        licenseCheck: async () => global.Server?.Licenses === 'saved-license'
      })
  }
}

// Exercise Application.init itself, replacing only its Electron/UI boundaries.
// The scan, on-disk state migration, token verification and fork snapshot are real.
async function loadApplication(dir: string, filename = 'Application.ts') {
  const entry = path.join(root, 'src/main', filename)
  const source = ts.createSourceFile(entry, await readFile(entry, 'utf8'), ts.ScriptTarget.Latest)
  const exportsByImport = new Map<string, string[]>()
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue
    const clause = statement.importClause
    if (clause?.isTypeOnly) continue
    const names = clause?.namedBindings
    exportsByImport.set(statement.moduleSpecifier.text, [
      ...new Set([
        ...(exportsByImport.get(statement.moduleSpecifier.text) ?? []),
        ...(names && ts.isNamedImports(names)
          ? names.elements
              .filter((item) => !item.isTypeOnly)
              .map((item) => item.propertyName?.text ?? item.name.text)
          : [])
      ])
    ])
  }
  const output = path.join(dir, 'application.mjs')
  await build({
    entryPoints: [entry],
    outfile: output,
    bundle: true,
    platform: 'node',
    format: 'esm',
    plugins: [
      {
        name: 'application-platform-boundaries',
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, (args) => {
            if (!args.importer || args.path === 'events' || args.path.startsWith('node:')) return
            return { path: args.path, namespace: 'platform-fixture' }
          })
          builder.onLoad({ filter: /.*/, namespace: 'platform-fixture' }, (args) => ({
            contents: [
              'const noop = () => {}; export default noop;',
              ...(exportsByImport.get(args.path) ?? []).map(
                (name) =>
                  `export const ${name} = ${name === 'isWindows' ? '() => false' : name === 'getLanguage' ? '(value) => value' : name === 'logger' ? '{ warn() {} }' : 'noop'};`
              )
            ].join('\n')
          }))
        }
      }
    ]
  })
  return (await import(pathToFileURL(output).href)).default
}

test('cold startup migrates installed v1 plugins using the persisted license before the scan', async () => {
  const f = await fixture()
  const previousServer = global.Server
  try {
    ;(global as any).Server = { DataDirectoryReady: true }
    const Application = await loadApplication(f.dir)
    const manager = f.manager()
    const ready = new Error('plugin snapshot published; UI startup boundary')
    const application = Object.create(Application.prototype)
    Object.assign(application, {
      configManager: { getConfig: () => 'en' },
      languageRepository: { ready: async () => {} },
      languageCoordinator: { initialize: async () => {} },
      serverDirectoryInitialization: Promise.resolve(true),
      serverManager: {
        updateGlobalConfig: () => {
          global.Server.Licenses = 'saved-license'
        },
        setProxy: () => {}
      },
      pluginManager: {
        refresh: () => manager.refresh(),
        getDiagnostics: () => manager.getDiagnostics(),
        getForkSnapshot: () => {
          throw ready
        }
      }
    })
    await assert.rejects(application.init(), (error) => error === ready)
    assert.equal(manager.listInstalled().length, 1, 'installed plugin must survive cold startup')
    assert.ok(
      manager.getForkSnapshot()['startup-fixture'],
      'restored plugin must be available to the fork'
    )
    const saved = JSON.parse(await readFile(f.statePath, 'utf8'))
    assert.equal(saved.version, 2)
    assert.ok(saved.plugins['startup-fixture'].installToken)
    assert.equal(
      (await f.manager().refresh()).length,
      1,
      'migrated record must survive the next process'
    )
  } finally {
    global.Server = previousServer
    await rm(f.dir, { recursive: true, force: true })
  }
})

test('v2 plugins survive a new manager with no fresh license and invalid siblings remain isolated', async () => {
  const f = await fixture(2)
  const previousServer = global.Server
  try {
    ;(global as any).Server = { DataDirectoryReady: true }
    assert.equal((await f.manager().refresh()).length, 1)
    const badRoot = path.join(f.dir, 'plugins', 'bad-plugin', '1.0.0')
    await mkdir(badRoot, { recursive: true })
    await writeFile(path.join(badRoot, 'plugin.json'), '{invalid json')
    const restarted = f.manager()
    assert.equal((await restarted.refresh()).length, 1)
    assert.equal(restarted.getDiagnostics().length, 1)
    assert.ok(restarted.getForkSnapshot()['startup-fixture'])
    const manifestPath = path.join(f.dir, 'plugins/startup-fixture/1.0.0/plugin.json')
    await writeFile(manifestPath, `${await readFile(manifestPath, 'utf8')} `)
    const tampered = f.manager()
    assert.equal((await tampered.refresh()).length, 0, 'token mismatches must still be rejected')
    assert.ok(
      tampered.getDiagnostics().some((item) => item.message.includes('install record mismatch'))
    )
  } finally {
    global.Server = previousServer
    await rm(f.dir, { recursive: true, force: true })
  }
})

test('a corrupt registry rejects mutations instead of replacing installed records with an empty registry', async () => {
  const f = await fixture(2)
  const previousServer = global.Server
  try {
    ;(global as any).Server = { DataDirectoryReady: true }
    const manager = f.manager()
    await manager.refresh()
    const original = await readFile(f.statePath, 'utf8')
    await writeFile(f.statePath, '{interrupted registry')
    await assert.rejects(manager.refresh(), /plugin.*(state|record|registry)/i)
    await assert.rejects(manager.addSource('https://fixture.invalid/catalog.json'))
    assert.equal(await readFile(f.statePath, 'utf8'), '{interrupted registry')
    await access(path.join(f.dir, 'plugins/startup-fixture/1.0.0/plugin.json'))
    assert.throws(() => manager.listInstalled(), /plugin.*(state|record|registry)/i)
    await writeFile(f.statePath, original)
    assert.equal(
      (await manager.refresh()).length,
      1,
      'an explicit retry must recover the existing installation'
    )
  } finally {
    global.Server = previousServer
    await rm(f.dir, { recursive: true, force: true })
  }
})

for (const contents of ['{"version":2,"plugins":[]}', '{"version":2}', 'null']) {
  test(`invalid registry shape cannot be rewritten as an empty installation: ${contents}`, async () => {
    const f = await fixture(2)
    try {
      await writeFile(f.statePath, contents)
      await assert.rejects(f.manager().addSource('https://fixture.invalid/catalog.json'))
      assert.equal(await readFile(f.statePath, 'utf8'), contents)
    } finally {
      await rm(f.dir, { recursive: true, force: true })
    }
  })
}

test('a missing registry with installed files is an error, while a new empty installation can save a source', async () => {
  const f = await fixture(2)
  try {
    await rm(f.statePath)
    await assert.rejects(f.manager().addSource('https://fixture.invalid/catalog.json'))
    await assert.rejects(access(f.statePath), { code: 'ENOENT' })
    await rm(path.join(f.dir, 'plugins'), { recursive: true })
    await f.manager().addSource('https://fixture.invalid/catalog.json')
    const saved = JSON.parse(await readFile(f.statePath, 'utf8'))
    assert.deepEqual(saved.sources, ['https://fixture.invalid/catalog.json'])
  } finally {
    await rm(f.dir, { recursive: true, force: true })
  }
})

test('an unreadable registry cannot be overwritten by a source change', async () => {
  const f = await fixture(2)
  const originalRead = filesystem.readFile
  try {
    const original = await readFile(f.statePath, 'utf8')
    filesystem.readFile = (async (...args: any[]) => {
      if (args[0] === f.statePath)
        throw Object.assign(new Error('fixture read denied'), { code: 'EACCES' })
      return (originalRead as any)(...args)
    }) as typeof originalRead
    await assert.rejects(
      f.manager().addSource('https://fixture.invalid/catalog.json'),
      /fixture read denied/
    )
    filesystem.readFile = originalRead
    assert.equal(await readFile(f.statePath, 'utf8'), original)
  } finally {
    filesystem.readFile = originalRead
    await rm(f.dir, { recursive: true, force: true })
  }
})

test('a failed registry write does not leak its uncommitted source into the next successful write', async () => {
  const f = await fixture(2)
  const originalRename = filesystem.rename
  try {
    const manager = f.manager()
    filesystem.rename = (async (...args: any[]) => {
      if (args[1] === f.statePath)
        throw Object.assign(new Error('fixture write denied'), { code: 'EACCES' })
      return (originalRename as any)(...args)
    }) as typeof originalRename
    await assert.rejects(
      manager.addSource('https://failed.invalid/catalog.json'),
      /fixture write denied/
    )
    filesystem.rename = originalRename
    await manager.addSource('https://saved.invalid/catalog.json')
    const saved = JSON.parse(await readFile(f.statePath, 'utf8'))
    assert.deepEqual(saved.sources, ['https://saved.invalid/catalog.json'])
    assert.ok(saved.plugins['startup-fixture'].installToken)
    assert.equal(
      (await filesystem.readdir(f.dir)).some((name) => name.endsWith('.tmp')),
      false
    )
  } finally {
    filesystem.rename = originalRename
    await rm(f.dir, { recursive: true, force: true })
  }
})

test('verification never regenerates a missing secret for existing install tokens', async () => {
  const f = await fixture(2)
  const previousServer = global.Server
  try {
    ;(global as any).Server = { DataDirectoryReady: true }
    const secretPath = path.join(f.dir, '.plugin-install-secret')
    await rm(secretPath)
    const manager = f.manager()
    await assert.rejects(manager.refresh(), /secret/i)
    await assert.rejects(access(secretPath), { code: 'ENOENT' })
    assert.throws(() => manager.listInstalled(), /secret/i)
    await writeFile(secretPath, 'fixture-secret')
    assert.equal((await manager.refresh()).length, 1)
  } finally {
    global.Server = previousServer
    await rm(f.dir, { recursive: true, force: true })
  }
})

test('an initial source query cannot overwrite a concurrently committed registry with its older snapshot', async () => {
  const f = await fixture(2)
  const originalRead = filesystem.readFile
  let releaseFirst!: () => void
  let releaseSecond!: () => void
  const first = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  const second = new Promise<void>((resolve) => {
    releaseSecond = resolve
  })
  let reads = 0
  try {
    const snapshot = await readFile(f.statePath, 'utf8')
    filesystem.readFile = (async (...args: any[]) => {
      if (args[0] !== f.statePath) return (originalRead as any)(...args)
      const index = reads++
      await (index === 0 ? first : second)
      return snapshot
    }) as typeof originalRead
    const manager = f.manager()
    const writer = manager.addSource('https://first.invalid/catalog.json')
    // Allow the serialized mutation to start reading before the independent query.
    await new Promise<void>((resolve) => setImmediate(resolve))
    const reader = manager.listSources()
    releaseFirst()
    await writer
    releaseSecond()
    await reader
    filesystem.readFile = originalRead
    await manager.addSource('https://second.invalid/catalog.json')
    const saved = JSON.parse(await readFile(f.statePath, 'utf8'))
    assert.deepEqual(saved.sources, [
      'https://first.invalid/catalog.json',
      'https://second.invalid/catalog.json'
    ])
    assert.ok(saved.plugins['startup-fixture'].installToken)
  } finally {
    releaseFirst()
    releaseSecond()
    filesystem.readFile = originalRead
    await rm(f.dir, { recursive: true, force: true })
  }
})

test('registry initialization failure is reported without preventing application window initialization', async () => {
  const f = await fixture(2)
  try {
    const Application = await loadApplication(f.dir)
    const ready = new Error('continued to plugin snapshot and UI initialization')
    const application = Object.create(Application.prototype)
    Object.assign(application, {
      configManager: { getConfig: () => 'en' },
      languageRepository: { ready: async () => {} },
      languageCoordinator: { initialize: async () => {} },
      serverDirectoryInitialization: Promise.resolve(true),
      serverManager: { updateGlobalConfig() {}, setProxy() {} },
      pluginManager: {
        refresh: async () => {
          throw new Error('Cannot read plugin installation records')
        },
        getDiagnostics: () => [],
        getForkSnapshot: () => {
          throw ready
        }
      }
    })
    await assert.rejects(application.init(), (error) => error === ready)
  } finally {
    await rm(f.dir, { recursive: true, force: true })
  }
})

for (const decrypt of [
  () => {
    throw new Error('fixture keychain unavailable')
  },
  () => ''
]) {
  test('a keychain failure cannot turn installed plugins into a successful empty market list', async () => {
    const f = await fixture(2)
    const previousServer = global.Server
    try {
      ;(global as any).Server = { DataDirectoryReady: true }
      await writeFile(path.join(f.dir, '.plugin-install-secret'), 'enc:fixture-ciphertext')
      const manager = new PluginManager({
        pluginsRoot: path.join(f.dir, 'plugins'),
        statePath: f.statePath,
        secretProtect: { encrypt: () => 'unused', decrypt }
      })
      await assert.rejects(manager.refresh(), /secret/i)
      assert.throws(() => manager.listInstalled(), /secret/i)
      await assert.rejects(manager.addSource('https://fixture.invalid/catalog.json'), /secret/i)
      assert.deepEqual(JSON.parse(await readFile(f.statePath, 'utf8')).sources, [])
      assert.equal(
        await readFile(path.join(f.dir, '.plugin-install-secret'), 'utf8'),
        'enc:fixture-ciphertext'
      )
    } finally {
      global.Server = previousServer
      await rm(f.dir, { recursive: true, force: true })
    }
  })
}

test('a failed registry read blocks uninstall and disable before stopping services or removing files', async () => {
  const f = await fixture(2)
  const previousServer = global.Server
  try {
    ;(global as any).Server = { DataDirectoryReady: true }
    let stopped = 0
    const manager = new PluginManager({
      pluginsRoot: path.join(f.dir, 'plugins'),
      statePath: f.statePath,
      stopPluginServices: async () => {
        stopped++
        return { stopped: true }
      }
    })
    await manager.refresh()
    await writeFile(f.statePath, '{corrupt registry')
    await assert.rejects(manager.refresh())
    await assert.rejects(manager.setEnabled('startup-fixture', false))
    await assert.rejects(manager.uninstall('startup-fixture'))
    assert.equal(stopped, 0)
    await access(path.join(f.dir, 'plugins/startup-fixture/1.0.0/plugin.json'))
  } finally {
    global.Server = previousServer
    await rm(f.dir, { recursive: true, force: true })
  }
})

test('market list IPC requests recover a transient registry error together and publish restored plugins', async () => {
  const f = await fixture(2)
  const previousServer = global.Server
  try {
    ;(global as any).Server = { DataDirectoryReady: true }
    const original = await readFile(f.statePath, 'utf8')
    await writeFile(f.statePath, '{transient failure')
    const manager = f.manager()
    await assert.rejects(manager.refresh())
    const IPCHandler = await loadApplication(f.dir, 'core/IPCHandler.ts')
    let published = 0
    const responses: any[] = []
    let completed!: () => void
    const done = new Promise<void>((resolve) => {
      completed = resolve
    })
    const handler = new IPCHandler({
      pluginManager: manager,
      onPluginsChanged: async () => {
        await manager.refresh()
        published++
      }
    })
    handler.sendToMainWindow = (_command: string, key: string, data: any) => {
      responses.push({ key, ...data })
      if (responses.length === 2) completed()
    }
    await writeFile(f.statePath, original)
    handler.handlePluginInstalled('application:plugin-installed', 'installed')
    handler.handlePluginSources('application:plugin-sources', 'sources')
    await done
    assert.equal(published, 1)
    assert.ok(responses.every((item) => item.code === 0))
    assert.equal(responses.find((item) => item.key === 'installed').data[0].id, 'startup-fixture')
    assert.equal(manager.hasLoadError, false)
  } finally {
    global.Server = previousServer
    await rm(f.dir, { recursive: true, force: true })
  }
})

async function replacementInstaller(f: Awaited<ReturnType<typeof fixture>>) {
  const incoming = path.join(f.dir, 'incoming')
  await mkdir(path.join(incoming, 'render'), { recursive: true })
  await mkdir(path.join(incoming, 'fork'), { recursive: true })
  const manifest = JSON.parse(
    await readFile(path.join(f.dir, 'plugins/startup-fixture/1.0.0/plugin.json'), 'utf8')
  )
  manifest.name = 'Updated fixture'
  await writeFile(path.join(incoming, 'plugin.json'), JSON.stringify(manifest))
  await writeFile(path.join(incoming, 'render/index.mjs'), 'export default { updated: true }')
  await writeFile(path.join(incoming, 'fork/index.mjs'), 'export default { updated: true }')
  const archive = path.join(f.dir, 'update.flyenv-plugin')
  const sevenZip = createRequire(import.meta.url)('7zip-min-electron')
  await new Promise<void>((resolve, reject) =>
    sevenZip.pack(incoming, archive, (error: Error | null) => (error ? reject(error) : resolve()))
  )
  const bytes = await readFile(archive)
  return new PluginManager({
    pluginsRoot: path.join(f.dir, 'plugins'),
    statePath: f.statePath,
    licenseCheck: async () => true,
    fetchImpl: async () => new Response(bytes)
  })
}

for (const failure of ['backup removal', 'old-version cleanup write']) {
  test(`${failure} cannot undo a committed reinstall or invalidate its installed record`, async () => {
    const f = await fixture(2)
    const previousServer = global.Server
    const originalRm = filesystem.rm
    const originalRename = filesystem.rename
    try {
      ;(global as any).Server = { DataDirectoryReady: true }
      const manager = await replacementInstaller(f)
      await manager.refresh()
      let writes = 0
      let triggered = false
      filesystem.rm = (async (...args: any[]) => {
        if (failure === 'backup removal' && String(args[0]).includes('.backup-')) {
          triggered = true
          throw new Error('fixture backup removal failed')
        }
        return (originalRm as any)(...args)
      }) as typeof originalRm
      filesystem.rename = (async (...args: any[]) => {
        if (args[1] === f.statePath && ++writes === 2 && failure === 'old-version cleanup write') {
          triggered = true
          throw new Error('fixture cleanup registry write failed')
        }
        return (originalRename as any)(...args)
      }) as typeof originalRename
      const installed = await manager.install({
        id: 'startup-fixture',
        url: 'http://fixture.invalid/update'
      })
      assert.equal(triggered, true)
      assert.equal(installed.name, 'Updated fixture')
      assert.equal(
        JSON.parse(
          await readFile(path.join(f.dir, 'plugins/startup-fixture/1.0.0/plugin.json'), 'utf8')
        ).name,
        'Updated fixture'
      )
      filesystem.rm = originalRm
      filesystem.rename = originalRename
      assert.equal((await f.manager().refresh())[0].name, 'Updated fixture')
    } finally {
      filesystem.rm = originalRm
      filesystem.rename = originalRename
      global.Server = previousServer
      await rm(f.dir, { recursive: true, force: true })
    }
  })
}

test('a failed reinstall rollback preserves the original backup when restoring its directory fails', async () => {
  const f = await fixture(2)
  const previousServer = global.Server
  const originalRename = filesystem.rename
  try {
    ;(global as any).Server = { DataDirectoryReady: true }
    const manager = await replacementInstaller(f)
    await manager.refresh()
    const originalState = await readFile(f.statePath, 'utf8')
    filesystem.rename = (async (...args: any[]) => {
      if (args[1] === f.statePath || String(args[0]).includes('.backup-'))
        throw new Error('fixture rename failed')
      return (originalRename as any)(...args)
    }) as typeof originalRename
    await assert.rejects(
      manager.install({ id: 'startup-fixture', url: 'http://fixture.invalid/update' })
    )
    const versionsRoot = path.join(f.dir, 'plugins/startup-fixture')
    const backups = (await filesystem.readdir(versionsRoot)).filter((name) =>
      name.includes('.backup-')
    )
    assert.equal(backups.length, 1, 'the original files must remain available for recovery')
    assert.equal(
      JSON.parse(await readFile(path.join(versionsRoot, backups[0], 'plugin.json'), 'utf8')).name,
      'Startup fixture'
    )
    assert.equal(await readFile(f.statePath, 'utf8'), originalState)
  } finally {
    filesystem.rename = originalRename
    global.Server = previousServer
    await rm(f.dir, { recursive: true, force: true })
  }
})

test('an unavailable data directory cannot be reported as a successful empty plugin installation', async () => {
  const f = await fixture(2)
  const previousServer = global.Server
  try {
    ;(global as any).Server = { DataDirectoryReady: false }
    const original = await readFile(f.statePath, 'utf8')
    const manager = f.manager()
    await assert.rejects(manager.refresh(), /data directory/i)
    assert.throws(() => manager.listInstalled(), /data directory/i)
    assert.equal(await readFile(f.statePath, 'utf8'), original)
    global.Server.DataDirectoryReady = true
    assert.equal((await manager.refresh()).length, 1)
  } finally {
    global.Server = previousServer
    await rm(f.dir, { recursive: true, force: true })
  }
})

test('a market query arriving after the registry read still waits for the ongoing recovery scan', async () => {
  const f = await fixture(2)
  const previousServer = global.Server
  const originalRead = filesystem.readFile
  let release!: () => void
  let entered!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const paused = new Promise<void>((resolve) => {
    entered = resolve
  })
  try {
    ;(global as any).Server = { DataDirectoryReady: true }
    const original = await readFile(f.statePath, 'utf8')
    await writeFile(f.statePath, '{transient failure')
    const manager = f.manager()
    await assert.rejects(manager.refresh())
    const IPCHandler = await loadApplication(f.dir, 'core/IPCHandler.ts')
    const responses: any[] = []
    let completed!: () => void
    const done = new Promise<void>((resolve) => {
      completed = resolve
    })
    const handler = new IPCHandler({
      pluginManager: manager,
      onPluginsChanged: async () => {
        await manager.refresh()
      }
    })
    handler.sendToMainWindow = (_command: string, key: string, data: any) => {
      responses.push({ key, ...data })
      if (responses.length === 2) completed()
    }
    await writeFile(f.statePath, original)
    filesystem.readFile = (async (...args: any[]) => {
      if (args[0] === path.join(f.dir, '.plugin-install-secret')) {
        entered()
        await gate
      }
      return (originalRead as any)(...args)
    }) as typeof originalRead
    handler.handlePluginSources('application:plugin-sources', 'sources')
    await paused
    assert.equal(manager.hasLoadError, false, 'the registry read completed before the scan')
    handler.handlePluginInstalled('application:plugin-installed', 'installed')
    await new Promise<void>((resolve) => setImmediate(resolve))
    const earlyCount = responses.length
    release()
    await done
    assert.equal(earlyCount, 0, 'all queries must wait for the recovery scan to finish')
    assert.equal(responses.find((item) => item.key === 'installed').data[0].id, 'startup-fixture')
  } finally {
    release()
    filesystem.readFile = originalRead
    global.Server = previousServer
    await rm(f.dir, { recursive: true, force: true })
  }
})
