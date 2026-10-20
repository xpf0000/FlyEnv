import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reactive, watchEffect, nextTick } from 'vue'
import type { CreateRequest } from '../shared'
const api = await import('../render/controller').catch(() => ({}) as any)
const request: CreateRequest = {
  cluster: { id: 'g', name: 'g', mode: 'standalone', memberIds: ['a'] },
  instances: [
    {
      id: 'a',
      name: 'a',
      engine: { version: '8.4.8', path: '/mysql', bin: '/mysql/bin/mysqld', source: 'Static' },
      port: 13306,
      socket: '/tmp/a.sock',
      dataDir: '/tmp/mc/a',
      serverId: 1
    }
  ],
  credentials: { a: { user: 'root', password: 'secret' } }
}
function deps() {
  let saved: unknown,
    started = 0
  let catalog = { schemaVersion: 1, instances: [], clusters: [] } as any
  const service = {
    run: false,
    running: false,
    pid: '',
    async start() {
      started++
      this.run = true
      return true
    },
    async stop() {
      this.run = false
      return true
    },
    async restart() {
      return true
    }
  }
  return {
    read: async () => saved,
    write: async (v: unknown) => {
      saved = v
    },
    notify: () => {},
    installed: async () => {},
    service: () => service,
    rpc: async (method: string, args: any[]) => {
      if (method === 'readCatalog') return catalog
      if (method === 'prepareInstances') {
        catalog = { schemaVersion: 1, instances: args[0].instances, clusters: [args[0].cluster] }
        return catalog
      }
      if (method === 'listInstances')
        return catalog.instances.map((i: any) => ({
          id: i.id,
          state: service.run ? 'running' : 'stopped',
          pid: service.run ? '123' : ''
        }))
      return undefined
    },
    getStarted: () => started,
    getSaved: () => saved
  }
}
test('reactive operation observers receive the terminal busy=false transition', async () => {
  const c = reactive(new api.MysqlClusterController(deps()))
  const states: Array<boolean | undefined> = []
  const stop = watchEffect(() => {
    states.push(c.operations.g?.busy)
  })
  await c.create(request)
  await nextTick()
  stop()
  assert.equal(states.at(-1), false)
})
test('singleton retains an in-flight create across view reentry and merges duplicate invocation', async () => {
  assert.equal(typeof api.MysqlClusterController, 'function')
  const d = deps()
  let release!: () => void
  const initialize = new Promise<void>((r) => {
    release = r
  })
  const original = d.rpc
  d.rpc = async (method, args) =>
    method === 'initializeInstance' ? initialize : original(method, args)
  const c = new api.MysqlClusterController(d)
  const first = c.create(request)
  assert.equal(first, c.create(request))
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(c.operations.g.busy, true)
  release()
  const result = await first
  assert.equal(result.status, 'completed')
  assert.equal(d.getStarted(), 1)
  assert.equal(c.operations.g.busy, false)
  assert.equal(JSON.stringify(d.getSaved()).includes('secret'), false)
})
test('storage failure prevents initialization and keeps terminal error available for retry', async () => {
  const d = deps()
  d.write = async () => {
    throw new Error('disk unavailable')
  }
  const c = new api.MysqlClusterController(d)
  const result = await c.create(request)
  assert.equal(result.status, 'failed')
  assert.equal(d.getStarted(), 0)
  assert.match(c.operations.g.error, /disk unavailable/)
})
test('failed initial storage read cannot overwrite saved settings through a new create', async () => {
  const d = deps()
  d.read = async () => {
    throw new Error('settings locked')
  }
  let written = false
  d.write = async () => {
    written = true
  }
  const c = new api.MysqlClusterController(d)
  assert.equal((await c.create(request)).status, 'failed')
  assert.equal(written, false)
  assert.equal(d.getStarted(), 0)
})
test('unsupported hosts show the compatibility error before any instance mutation', async () => {
  const d = deps()
  let mutations = 0
  const original = d.rpc
  d.rpc = async (method, args) => {
    if (method === 'prepareInstances') mutations++
    return original(method, args)
  }
  const c = new api.MysqlClusterController(d)
  c.blocked = true
  c.loadError = 'Host update required'
  const result = await c.create(request)
  assert.equal(result.status, 'failed')
  assert.equal(mutations, 0)
  assert.match(result.items[0].error, /Host update required/)
})
test('notice failures do not overwrite completed operations', async () => {
  const d = deps()
  d.notify = () => {
    throw new Error('notice unavailable')
  }
  const c = new api.MysqlClusterController(d)
  assert.equal((await c.create(request)).status, 'completed')
})
test('concurrent preference changes on different instances preserve both records', async () => {
  const d = deps()
  let release!: () => void
  let calls = 0
  d.write = async () => {
    if (++calls === 1)
      await new Promise<void>((r) => {
        release = r
      })
  }
  const c = new api.MysqlClusterController(d)
  const first = c.savePreferences('a', { marks: { a: 'first' } })
  const second = c.savePreferences('b', { marks: { b: 'second' } })
  await new Promise((r) => setTimeout(r, 0))
  release()
  await Promise.all([first, second])
  assert.deepEqual(Object.keys(c.preferences).sort(), ['a', 'b'])
})
test('one initialization failure preserves sibling completion without starting dependent replication', async () => {
  const d = deps()
  const original = d.rpc
  let configured = false
  d.rpc = async (method, args) => {
    if (method === 'initializeInstance' && args[0] === 'a') throw new Error('init failed')
    if (method === 'configureReplication') configured = true
    return original(method, args)
  }
  const r = structuredClone(request)
  r.cluster.mode = 'replication'
  r.cluster.memberIds.push('b')
  r.instances.push({
    ...r.instances[0],
    id: 'b',
    name: 'b',
    port: 13307,
    socket: '/tmp/b.sock',
    dataDir: '/tmp/mc/b',
    serverId: 2
  })
  r.credentials.b = { user: 'root', password: 'secret' }
  const c = new api.MysqlClusterController(d),
    result = await c.create(r)
  assert.equal(result.status, 'partial')
  assert.equal(configured, false)
  assert.equal(result.items.find((i: any) => i.id === 'a').status, 'failed')
  assert.equal(result.items.find((i: any) => i.id === 'b').status, 'completed')
})
test('replication setup failure retains each completed server start as partial completion', async () => {
  const d = deps(),
    original = d.rpc
  d.rpc = async (method, args) => {
    if (method === 'configureReplication') throw new Error('channel failed')
    return original(method, args)
  }
  const r = structuredClone(request)
  r.cluster.mode = 'replication'
  r.cluster.memberIds.push('b')
  r.instances.push({
    ...r.instances[0],
    id: 'b',
    name: 'b',
    port: 13307,
    socket: '/tmp/b.sock',
    dataDir: '/tmp/mc/b',
    serverId: 2
  })
  r.credentials.b = { user: 'root', password: 'secret' }
  const c = new api.MysqlClusterController(d),
    result = await c.create(r)
  assert.equal(result.status, 'partial')
  assert.equal(result.items.filter((i: any) => i.status === 'completed').length, 2)
})
test('a group restart requires credentials before stopping healthy members', async () => {
  const d: any = deps(),
    original = d.rpc
  const r = structuredClone(request)
  r.cluster.mode = 'replication'
  r.cluster.memberIds.push('b')
  r.instances.push({
    ...r.instances[0],
    id: 'b',
    name: 'b',
    port: 13307,
    socket: '/tmp/b.sock',
    dataDir: '/tmp/mc/b',
    serverId: 2
  })
  let stops = 0
  const services: Record<string, any> = Object.fromEntries(
    r.instances.map((i) => [
      i.id,
      {
        run: true,
        running: false,
        pid: '123',
        async stop() {
          stops++
          this.run = false
          return true
        },
        async start() {
          this.run = true
          return true
        }
      }
    ])
  )
  d.service = (id: string) => services[id]
  d.rpc = async (method: string, args: any[]) =>
    method === 'readCatalog'
      ? { schemaVersion: 1, instances: r.instances, clusters: [r.cluster] }
      : method === 'listInstances'
        ? r.instances.map((i) => ({
            id: i.id,
            state: services[i.id].run ? 'running' : 'stopped',
            pid: '123'
          }))
        : original(method, args)
  const c = new api.MysqlClusterController(d)
  assert.equal((await c.runGroup(r.cluster, 'restart')).status, 'failed')
  assert.equal(stops, 0)
})
