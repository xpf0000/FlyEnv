import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const api = await import('../fork/catalog').catch(() => ({}) as any)
const config = await import('../fork/config').catch(() => ({}) as any)
const init = await import('../fork/initialize').catch(() => ({}) as any)
const runtime = await import('../fork/runtime')
export const fixture = (root: string) => ({
  cluster: { id: 'g', name: 'test', mode: 'standalone' as const, memberIds: ['a'] },
  instances: [
    {
      id: 'a',
      name: 'a',
      engine: {
        version: '8.4.8',
        path: '/engine',
        bin: '/engine/bin/mysqld',
        source: 'Static' as const
      },
      port: 23306,
      socket: '/tmp/mc-a.sock',
      dataDir: join(root, 'data'),
      serverId: 23306
    }
  ],
  credentials: { a: { user: 'root', password: 'a b\'"$`\\' } }
})
test('preparation retry repairs a missing managed config without initializing existing data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-prepare-retry-'))
  try {
    const c = new api.InstanceCatalog(join(root, 'owned'), 'macOS'),
      request = fixture(root)
    await mkdir(c.paths('a').config, { recursive: true })
    await assert.rejects(c.prepare(request, { probe: async () => undefined, checkPorts: false }))
    await rm(c.paths('a').config, { recursive: true })
    await c.prepare(request, { probe: async () => undefined, checkPorts: false })
    assert.match(await readFile(c.paths('a').config, 'utf8'), /port=23306/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
test('interrupted multi-node config updates block startup until an explicit successful edit retry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-edit-'))
  try {
    const c = new api.InstanceCatalog(join(root, 'owned'), 'macOS'),
      request: any = fixture(root)
    request.cluster.mode = 'replication'
    request.cluster.memberIds.push('b')
    request.instances.push({
      ...request.instances[0],
      id: 'b',
      name: 'b',
      dataDir: join(root, 'data-b'),
      port: 23307,
      socket: '/tmp/mc-b.sock',
      serverId: 23307
    })
    await c.prepare(request, { probe: async () => undefined, checkPorts: false })
    for (const id of ['a', 'b']) await c.setStage(id, 'ready')
    const update = structuredClone(request)
    update.instances[0].port = 23400
    update.instances[1].port = 23401
    await rm(c.paths('b').config)
    await mkdir(c.paths('b').config)
    assert.equal(typeof c.update, 'function')
    await assert.rejects(c.update(update))
    const r = new runtime.MysqlInstanceRuntime(c, { list: async () => [], stop: async () => [] })
    await assert.rejects(r.start('a', request.credentials.a), /pending|incomplete/i)
    await rm(c.paths('b').config, { recursive: true })
    await c.update(update)
    assert.equal((await c.instance('a')).spec.port, 23400)
    assert.match(await readFile(c.paths('b').config, 'utf8'), /port=23401/)
    assert.equal((await c.instance('a')).pendingUpdate, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
test('prepares config and catalog atomically, retaining initialized data on retry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-cat-'))
  try {
    assert.equal(typeof api.InstanceCatalog, 'function')
    const catalog = new api.InstanceCatalog(join(root, 'owned'), 'macOS')
    const request = fixture(root)
    await catalog.prepare(request, { probe: async () => undefined, checkPorts: false })
    await catalog.setStage('a', 'initialized')
    await writeFile(join(request.instances[0].dataDir, 'ibdata1'), 'keep')
    await catalog.prepare(request, { probe: async () => undefined, checkPorts: false })
    assert.equal(await readFile(join(root, 'data/ibdata1'), 'utf8'), 'keep')
    const disk = await catalog.read()
    assert.equal(disk.stages.a, 'initialized')
    assert.equal(JSON.stringify(disk).includes('a b'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
test('rejects nonempty and aliased directories before writing managed configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-dirs-'))
  try {
    const request = fixture(root)
    await mkdir(request.instances[0].dataDir)
    await writeFile(join(request.instances[0].dataDir, 'business'), 'keep')
    const catalog = new api.InstanceCatalog(join(root, 'owned'), 'macOS')
    await assert.rejects(
      catalog.prepare(request, { probe: async () => undefined, checkPorts: false }),
      /not empty/i
    )
    await rm(join(root, 'data/business'))
    await symlink(join(root, 'data'), join(root, 'alias'))
    request.cluster.mode = 'replication' as any
    request.cluster.memberIds.push('b')
    request.instances.push({
      ...request.instances[0],
      id: 'b',
      name: 'b',
      dataDir: join(root, 'alias'),
      port: 23307,
      serverId: 23307,
      socket: '/tmp/mc-b.sock'
    })
    await assert.rejects(
      catalog.prepare(request, { probe: async () => undefined, checkPorts: false }),
      /director/i
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
test('config preserves literal quoted paths and blocks identity changes', () => {
  const spec = fixture('/tmp/a b/$`').instances[0]
  const text = config.renderConfig?.(
    spec,
    'replication',
    { config: '/tmp/a.cnf', pid: '/tmp/a.pid', error: '/tmp/a.log', slow: '/tmp/a-slow.log' },
    'macOS'
  )
  assert.match(text ?? '', /mysqlx=0/)
  assert.match(text, /gtid-mode=ON/)
  assert.match(text, /sql-require-primary-key=ON/)
  assert.throws(
    () => config.validateConfigEdit(spec, text.replace('port=23306', 'port=3306')),
    /managed/i
  )
  assert.doesNotThrow(() => config.validateConfigEdit(spec, text + '\nmax_connections=50\n'))
})
test('initialization never repeats after files were created or execution outcome is unknown', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-init-'))
  try {
    const c = new api.InstanceCatalog(join(root, 'owned'), 'macOS')
    await c.prepare(fixture(root), { probe: async () => undefined, checkPorts: false })
    let calls = 0
    await assert.rejects(
      init.initializeInstance(
        c,
        'a',
        () => {},
        async () => {
          calls++
          throw new Error('terminated')
        }
      ),
      /terminated/
    )
    assert.equal((await c.read()).stages.a, 'unknown')
    await assert.rejects(
      init.initializeInstance(
        c,
        'a',
        () => {},
        async () => {
          calls++
        }
      ),
      /unknown|inspect/i
    )
    assert.equal(calls, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
test('duplicate fork initialization requests share execution and exclude a simultaneous service start', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-init-flight-'))
  try {
    const c = new api.InstanceCatalog(join(root, 'owned'), 'macOS')
    await c.prepare(fixture(root), { probe: async () => undefined, checkPorts: false })
    let release!: () => void,
      calls = 0
    const gate = new Promise<void>((r) => {
      release = r
    })
    const run = async () => {
      calls++
      await gate
      return ''
    }
    const first = init.initializeInstance(c, 'a', () => {}, run)
    const second = init.initializeInstance(c, 'a', () => {}, run)
    await new Promise((r) => setTimeout(r, 30))
    const r = new runtime.MysqlInstanceRuntime(c, { list: async () => [], stop: async () => [] })
    const start = assert.rejects(r.start('a', fixture(root).credentials.a), /busy/i)
    release()
    const results = await Promise.allSettled([first, second])
    await start
    assert.equal(calls, 1)
    assert.ok(results.every((result) => result.status === 'fulfilled'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
test('a transient initialization mysqld is never published as a running service', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-init-status-'))
  try {
    const c = new api.InstanceCatalog(join(root, 'owned'), 'macOS')
    await c.prepare(fixture(root), { probe: async () => undefined, checkPorts: false })
    await c.setStage('a', 'initializing')
    const r = new runtime.MysqlInstanceRuntime(c, { list: async () => [], stop: async () => [] })
    const snapshot = await r.discover('a', [
      {
        PID: '123',
        PPID: '1',
        COMMAND: `/engine/bin/mysqld --defaults-file=${c.paths('a').config} --initialize-insecure`
      }
    ])
    assert.equal(snapshot.state, 'unknown')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
