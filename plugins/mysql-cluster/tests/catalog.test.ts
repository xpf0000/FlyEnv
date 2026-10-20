import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const api = await import('../fork/catalog').catch(() => ({} as any))
const config = await import('../fork/config').catch(() => ({} as any))
const init = await import('../fork/initialize').catch(() => ({} as any))
export const fixture = (root: string) => ({
  cluster: { id: 'g', name: 'test', mode: 'standalone' as const, memberIds: ['a'] },
  instances: [{ id: 'a', name: 'a', engine: { version: '8.4.8', path: '/engine', bin: '/engine/bin/mysqld', source: 'Static' as const },
    port: 23306, socket: '/tmp/mc-a.sock', dataDir: join(root, 'data'), serverId: 23306 }],
  credentials: { a: { user: 'root', password: 'a b\'"$`\\' } }
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
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('rejects nonempty and aliased directories before writing managed configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-dirs-'))
  try {
    const request = fixture(root)
    await mkdir(request.instances[0].dataDir)
    await writeFile(join(request.instances[0].dataDir, 'business'), 'keep')
    const catalog = new api.InstanceCatalog(join(root, 'owned'), 'macOS')
    await assert.rejects(catalog.prepare(request, { probe: async () => undefined, checkPorts: false }), /not empty/i)
    await rm(join(root, 'data/business'))
    await symlink(join(root, 'data'), join(root, 'alias'))
    request.cluster.mode = 'replication' as any; request.cluster.memberIds.push('b')
    request.instances.push({ ...request.instances[0], id: 'b', name: 'b', dataDir: join(root, 'alias'), port: 23307, serverId: 23307, socket: '/tmp/mc-b.sock' })
    await assert.rejects(catalog.prepare(request, { probe: async () => undefined, checkPorts: false }), /director/i)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('config preserves literal quoted paths and blocks identity changes', () => {
  const spec = fixture('/tmp/a b/$`').instances[0]
  const text = config.renderConfig?.(spec, 'replication', { config: '/tmp/a.cnf', pid: '/tmp/a.pid', error: '/tmp/a.log', slow: '/tmp/a-slow.log' }, 'macOS')
  assert.match(text ?? '', /mysqlx=0/)
  assert.match(text, /gtid-mode=ON/)
  assert.match(text, /sql-require-primary-key=ON/)
  assert.throws(() => config.validateConfigEdit(spec, text.replace('port=23306', 'port=3306')), /managed/i)
  assert.doesNotThrow(() => config.validateConfigEdit(spec, text + '\nmax_connections=50\n'))
})
test('initialization never repeats after files were created or execution outcome is unknown', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-init-'))
  try {
    const c = new api.InstanceCatalog(join(root, 'owned'), 'macOS')
    await c.prepare(fixture(root), { probe: async () => undefined, checkPorts: false })
    let calls = 0
    await assert.rejects(init.initializeInstance(c, 'a', () => {}, async () => { calls++; throw new Error('terminated') }), /terminated/)
    assert.equal((await c.read()).stages.a, 'unknown')
    await assert.rejects(init.initializeInstance(c, 'a', () => {}, async () => { calls++ }), /unknown|inspect/i)
    assert.equal(calls, 1)
  } finally { await rm(root, { recursive: true, force: true }) }
})
