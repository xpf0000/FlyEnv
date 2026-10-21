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
test('start resumes the original prepared group after Storage failed following Fork preparation', async () => {
  const d = deps(),
    original = d.rpc
  let initialized = false,
    prepared = 0,
    writes = 0
  d.rpc = async (method, args) => {
    if (method === 'prepareInstances') prepared++
    if (method === 'initializeInstance') initialized = true
    return original(method, args)
  }
  d.write = async () => {
    if (++writes === 1) throw new Error('storage temporarily locked')
  }
  const service = d.service()
  service.start = async () => {
    if (!initialized) throw new Error('Instance is not safely initialized')
    return true
  }
  const c = new api.MysqlClusterController(d)
  assert.equal((await c.create(request)).status, 'failed')
  assert.deepEqual(c.catalog.clusters[0].memberIds, ['a'])
  assert.equal(c.credentials.a?.password, 'secret')
  assert.equal((await c.runGroup(c.catalog.clusters[0], 'start')).status, 'completed')
  assert.equal(prepared, 1)
})
test('hiding the plugin waits for admitted lifecycle work before stopping the local collection', async () => {
  const d = deps(),
    c = new api.MysqlClusterController(d)
  await c.create(request)
  let release!: () => void,
    stopped = 0
  const service = d.service()
  service.start = async () => {
    await new Promise<void>((r) => (release = r))
    return true
  }
  service.stop = async () => {
    stopped++
    return true
  }
  const starting = c.runGroup(c.catalog.clusters[0], 'start')
  await new Promise((r) => setTimeout(r, 0))
  const hidden = c.stopForVisibility()
  assert.equal(c.stopForVisibility(), hidden)
  assert.equal(stopped, 0)
  release()
  await starting
  await hidden
  assert.equal(stopped, 1)
})
test('refresh removes process snapshots of deleted local instances', async () => {
  const d = deps(),
    c = new api.MysqlClusterController(d)
  await c.create(request)
  assert.equal(c.snapshots.a.state, 'running')
  const rpc = d.rpc
  d.rpc = async (method, args) =>
    method === 'readCatalog'
      ? { schemaVersion: 1, instances: [], clusters: [] }
      : method === 'listInstances'
        ? []
        : rpc(method, args)
  await c.refresh()
  assert.deepEqual(c.snapshots, {})
})

test('reactive create and preference persistence submit plain structured-cloneable records', async () => {
  const d = deps()
  const saved: any[] = []
  d.write = async (value: unknown) => {
    saved.push(structuredClone(value))
  }
  const c = reactive(new api.MysqlClusterController(d))
  assert.equal((await c.create(reactive(structuredClone(request)))).status, 'completed')
  assert.equal(await c.setCredential('a', 'remembered', true), true)
  assert.equal(
    (await c.savePreferences('a', reactive({ backup: { directory: '/backup' } }))).status,
    'completed'
  )
  await c.persist()
  assert.equal(saved.length, 4)
  assert.equal(saved[0].catalog.instances[0].id, 'a')
  assert.equal(saved[0].preferences.a, undefined)
  assert.equal(saved[1].preferences.a.rootCredential.password, 'remembered')
  assert.equal(saved[2].preferences.a.backup.directory, '/backup')
})

test('creation failure requests one public notice and retains the failure result for recovery', async () => {
  const d = deps()
  const notices: any[] = []
  d.notify = (...args: any[]) => {
    notices.push(args)
  }
  d.write = async () => {
    throw new Error('settings unavailable')
  }
  const c = new api.MysqlClusterController(d)
  const result = await c.create(request)
  assert.equal(result.status, 'failed')
  assert.equal(d.getStarted(), 0)
  assert.equal(notices.length, 1)
  assert.deepEqual(notices[0], ['error', 'g: settings unavailable'])
})
test('form validation errors request a public notice without making an operation or overwriting saved state', () => {
  const d = deps()
  const notices: any[] = []
  d.notify = (...args: any[]) => {
    notices.push(args)
  }
  const c = new api.MysqlClusterController(d)
  c.reportFormError(new Error('Root password is required'))
  assert.deepEqual(notices, [['error', 'Root password is required']])
  assert.deepEqual(c.operations, {})
  assert.equal(d.getSaved(), undefined)
})

test('group lifecycle keeps its busy guard until the final process snapshot refresh settles', async () => {
  const d = deps()
  const c = new api.MysqlClusterController(d)
  await c.create(request)
  const group = c.catalog.clusters[0]
  const rpc = d.rpc
  let release!: () => void, entered!: () => void
  const refreshing = new Promise<void>((resolve) => {
    entered = resolve
  })
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  d.rpc = async (method, args) => {
    if (method === 'listInstances' && !d.service().run) {
      entered()
      await gate
    }
    return rpc(method, args)
  }
  const stopping = c.runGroup(group, 'stop')
  await refreshing
  assert.equal(d.service().run, false)
  assert.equal(c.snapshots.a.state, 'running')
  assert.equal(c.operations.g.busy, true)
  assert.equal(c.runGroup(group, 'stop'), stopping)
  assert.equal((await c.runGroup(group, 'start')).status, 'failed')
  release()
  assert.equal((await stopping).status, 'completed')
  assert.equal(c.snapshots.a.state, 'stopped')
  assert.equal(c.operations.g.busy, false)
})

test('failed post-stop refresh releases loading without rejecting or replaying the completed stop', async () => {
  const d = deps()
  const c = new api.MysqlClusterController(d)
  await c.create(request)
  const rpc = d.rpc
  let stops = 0
  const service = d.service()
  service.stop = async () => {
    stops++
    service.run = false
    return true
  }
  d.rpc = async (method, args) => {
    if (method === 'listInstances' && !service.run) throw new Error('status refresh unavailable')
    return rpc(method, args)
  }
  const result = await c.runGroup(c.catalog.clusters[0], 'stop')
  assert.equal(result.status, 'completed')
  assert.equal(stops, 1)
  assert.equal(c.operations.g.busy, false)
  assert.match(c.loadError, /status refresh unavailable/)
})
