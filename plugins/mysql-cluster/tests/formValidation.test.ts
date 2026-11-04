import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createT } from '../lang'
import { createDraftRequest } from '../render/form'

const api = await import('../render/formValidation').catch(() => ({}) as any)
const t = createT(() => 'zh')
function fixture(mode = 'replication') {
  const engine = {
    version: '9.6.0',
    path: '/mysql',
    bin: '/mysql/bin/mysqld',
    source: 'Static' as const
  }
  const request = createDraftRequest(
    {
      id: 'abc',
      uuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      name: 'dev',
      mode: mode as any,
      count: mode === 'group-replication' ? 3 : 1,
      startPort: 13306,
      rootDir: '/data',
      password: 'secret',
      engine
    },
    'macOS'
  )
  return {
    model: {
      name: 'dev',
      mode: mode as any,
      count: mode === 'group-replication' ? 3 : 1,
      startPort: 13306,
      password: 'secret',
      engineBin: engine.bin,
      members: request.instances
    },
    context: {
      platform: 'macOS' as const,
      catalog: { schemaVersion: 1 as const, clusters: [], instances: [] },
      engine,
      t
    }
  }
}
test('valid multi-member form has no field errors', () => {
  const f = fixture()
  assert.equal(typeof api.instanceFormErrors, 'function')
  assert.deepEqual(api.instanceFormErrors(f.model, f.context), {})
})
test('required errors identify the cluster, password, version and exact member inputs', () => {
  const f = fixture()
  Object.assign(f.model, { name: ' ', password: '', engineBin: '' })
  Object.assign(f.model.members[0], { name: '', dataDir: '', socket: '', port: undefined })
  const errors = api.instanceFormErrors(f.model, f.context)
  assert.match(errors.name, /集群名称/)
  assert.match(errors.password, /Root/)
  assert.ok(errors.engineBin)
  for (const key of ['name', 'dataDir', 'socket', 'port'])
    assert.ok(errors[`members.0.${key}`], key)
})
test('cluster and member duplicate errors map to their own fields, including both duplicate rows', () => {
  const f = fixture()
  f.context.catalog = {
    schemaVersion: 1,
    clusters: [{ id: 'old', name: ' DEV ', mode: 'standalone', memberIds: ['old'] }],
    instances: [
      {
        ...f.model.members[0],
        id: 'old',
        name: 'Other',
        port: 12345,
        dataDir: '/other',
        socket: '/other.sock'
      }
    ]
  } as any
  f.model.members[0].name = f.model.members[1].name = ' Other '
  const errors = api.instanceFormErrors(f.model, f.context)
  assert.match(errors.name, /集群名称重复/)
  assert.match(errors['members.0.name'], /实例名称重复/)
  assert.match(errors['members.1.name'], /实例名称重复/)
})
test('editing excludes owned names and paths and does not require a new password', () => {
  const f = fixture()
  f.model.password = ''
  const context = {
    ...f.context,
    editingGroupId: 'abc',
    catalog: {
      schemaVersion: 1,
      clusters: [
        { id: 'abc', name: 'dev', mode: 'replication', memberIds: f.model.members.map((i) => i.id) }
      ],
      instances: f.model.members
    }
  }
  assert.deepEqual(api.instanceFormErrors(f.model, context), {})
})
test('SQL and GR port collisions and overflowing initial ranges identify exact fields', () => {
  const f = fixture('group-replication')
  f.model.members[1].port = f.model.members[0].groupPort!
  f.model.members[2].groupPort = 70000
  f.model.startPort = 70000
  const errors = api.instanceFormErrors(f.model, f.context)
  assert.ok(errors['members.0.groupPort'])
  assert.ok(errors['members.1.port'])
  assert.ok(errors['members.2.groupPort'])
  assert.ok(errors.startPort)
})
test('custom member ports can correct an overflowing generated GR range', () => {
  const f = fixture('group-replication')
  f.model.startPort = 65450
  f.model.members.forEach((member, index) => {
    member.port = 65450 + index
    member.groupPort = 65000 + index
  })
  assert.deepEqual(api.instanceFormErrors(f.model, f.context), {})
})
test('invalid and overlapping directories and sockets have per-row reasons and clear after correction', () => {
  const f = fixture()
  f.model.members[0].dataDir = '/data/abc'
  f.model.members[1].socket = f.model.members[0].socket
  let errors = api.instanceFormErrors(f.model, f.context)
  assert.ok(errors['members.0.dataDir'])
  assert.ok(errors['members.1.dataDir'])
  assert.ok(errors['members.0.socket'])
  assert.ok(errors['members.1.socket'])
  f.model.members[0].dataDir = '/first'
  f.model.members[1].socket = '/tmp/fixed.sock'
  errors = api.instanceFormErrors(f.model, f.context)
  assert.deepEqual(errors, {})
  f.model.members[0].dataDir = 'relative/path'
  f.model.members[1].socket = '/tmp/' + 'x'.repeat(110)
  errors = api.instanceFormErrors(f.model, f.context)
  assert.ok(errors['members.0.dataDir'])
  assert.ok(errors['members.1.socket'])
})
test('unsupported replication versions fail the version field and Windows pipe errors are localized', () => {
  const f = fixture('group-replication')
  f.context.engine.version = '8.0.22'
  assert.ok(api.instanceFormErrors(f.model, f.context).engineBin)
  const windows = {
    ...f.context,
    platform: 'Windows',
    engine: { ...f.context.engine, version: '9.6.0' }
  }
  f.model.members[0].socket = 'bad/pipe'
  assert.match(api.instanceFormErrors(f.model, windows)['members.0.socket'], /命名管道/)
})
