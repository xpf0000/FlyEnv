import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CreateRequest } from '../shared'
const api = await import('../render/controller').catch(() => ({} as any))
const request: CreateRequest = { cluster: { id: 'g', name: 'g', mode: 'standalone', memberIds: ['a'] }, instances: [{ id: 'a', name: 'a', engine: { version: '8.4.8', path: '/mysql', bin: '/mysql/bin/mysqld', source: 'Static' }, port: 13306, socket: '/tmp/a.sock', dataDir: '/tmp/mc/a', serverId: 1 }], credentials: { a: { user: 'root', password: 'secret' } } }
function deps() {
  let saved: unknown, started = 0
  let catalog = { schemaVersion: 1, instances: [], clusters: [] } as any
  const service = { run: false, running: false, pid: '', async start() { started++; this.run = true; return true }, async stop() { this.run = false; return true }, async restart() { return true } }
  return { read: async () => saved, write: async (v: unknown) => { saved = v }, notify: () => {}, installed: async () => {}, service: () => service,
    rpc: async (method: string, args: any[]) => {
      if (method === 'readCatalog') return catalog
      if (method === 'prepareInstances') { catalog = { schemaVersion: 1, instances: args[0].instances, clusters: [args[0].cluster] }; return catalog }
      if (method === 'listInstances') return catalog.instances.map((i: any) => ({ id: i.id, state: service.run ? 'running' : 'stopped', pid: service.run ? '123' : '' }))
      return undefined
    }, getStarted: () => started, getSaved: () => saved }
}
test('singleton retains an in-flight create across view reentry and merges duplicate invocation', async () => {
  assert.equal(typeof api.MysqlClusterController, 'function')
  const d = deps(); let release!: () => void
  const initialize = new Promise<void>(r => { release = r })
  const original = d.rpc
  d.rpc = async (method, args) => method === 'initializeInstance' ? initialize : original(method, args)
  const c = new api.MysqlClusterController(d)
  const first = c.create(request)
  assert.equal(first, c.create(request))
  await new Promise(r => setTimeout(r, 0))
  assert.equal(c.operations.g.busy, true)
  release(); const result = await first
  assert.equal(result.status, 'completed'); assert.equal(d.getStarted(), 1)
  assert.equal(c.operations.g.busy, false)
  assert.equal(JSON.stringify(d.getSaved()).includes('secret'), false)
})
test('storage failure prevents initialization and keeps terminal error available for retry', async () => {
  const d = deps(); d.write = async () => { throw new Error('disk unavailable') }
  const c = new api.MysqlClusterController(d)
  const result = await c.create(request)
  assert.equal(result.status, 'failed'); assert.equal(d.getStarted(), 0)
  assert.match(c.operations.g.error, /disk unavailable/)
})
test('notice failures do not overwrite completed operations', async () => {
  const d = deps(); d.notify = () => { throw new Error('notice unavailable') }
  const c = new api.MysqlClusterController(d)
  assert.equal((await c.create(request)).status, 'completed')
})
test('one initialization failure preserves sibling completion without starting dependent replication', async () => {
  const d = deps(); const original = d.rpc; let configured = false
  d.rpc = async (method, args) => {
    if (method === 'initializeInstance' && args[0] === 'a') throw new Error('init failed')
    if (method === 'configureReplication') configured = true
    return original(method, args)
  }
  const r = structuredClone(request); r.cluster.mode = 'replication'; r.cluster.memberIds.push('b')
  r.instances.push({ ...r.instances[0], id: 'b', name: 'b', port: 13307, socket: '/tmp/b.sock', dataDir: '/tmp/mc/b', serverId: 2 }); r.credentials.b = { user: 'root', password: 'secret' }
  const c = new api.MysqlClusterController(d), result = await c.create(r)
  assert.equal(result.status, 'partial'); assert.equal(configured, false)
  assert.equal(result.items.find((i: any) => i.id === 'a').status, 'failed')
  assert.equal(result.items.find((i: any) => i.id === 'b').status, 'completed')
})
