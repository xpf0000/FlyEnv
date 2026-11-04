import assert from 'node:assert/strict'
import { test } from 'node:test'

const policy = await import('../policy').catch(() => ({}) as any)
const engine = { version: '10.11.9', path: '/mariadb', bin: '/mariadb/bin/mariadbd', source: 'Static' }
const instance = (id = 'a', port = 13307) => ({
  id,
  name: id,
  engine,
  port,
  socket: `/tmp/mc-${id}.sock`,
  dataDir: `/tmp/mc/${id}/data`,
  serverId: port
})
const request = () => ({
  cluster: { id: 'g', name: 'test', mode: 'standalone', memberIds: ['a'] },
  instances: [instance()],
  credentials: { a: { user: 'root', password: 's!afe' } }
})

test('validates a complete standalone request without restricting shell-safe paths unnecessarily', () => {
  const r = request()
  r.instances[0].dataDir = '/tmp/a b/$hello`world`/data'
  assert.equal(policy.validateCreateRequest?.(r, 'macOS'), true)
})
test('rejects invalid ports and identifiers before creating files', () => {
  for (const port of [0, -1, 65536, 3.5, NaN]) {
    const r = request()
    r.instances[0].port = port
    assert.throws(() => policy.validateCreateRequest(r, 'macOS'), /port/i)
  }
  const r = request()
  r.instances[0].id = '../escape'
  assert.throws(() => policy.validateCreateRequest(r, 'macOS'), /id/i)
})
test('rejects shared data directories and duplicate sockets', () => {
  const r: any = request()
  r.cluster.mode = 'replication'
  r.cluster.memberIds.push('b')
  r.instances.push({ ...instance('b', 13308), dataDir: '/tmp/mc/a/data/child' })
  assert.throws(() => policy.validateCreateRequest(r, 'macOS'), /director/i)
  r.instances[1].dataDir = '/tmp/mc/b/data'
  r.instances[1].socket = r.instances[0].socket
  assert.throws(() => policy.validateCreateRequest(r, 'macOS'), /socket/i)
})
test('checks complete membership and duplicate server identities', () => {
  const r: any = request()
  r.cluster.mode = 'replication'
  r.cluster.memberIds.push('b')
  assert.throws(() => policy.validateCreateRequest(r, 'macOS'), /member/i)
  r.instances.push({ ...instance('b', 13308), serverId: 13307 })
  assert.throws(() => policy.validateCreateRequest(r, 'macOS'), /server/i)
})
test('requires two member nodes for replication and a uniform engine', () => {
  const r: any = request()
  r.cluster.mode = 'replication'
  assert.throws(() => policy.validateCreateRequest(r, 'macOS'), /node/i)
  r.cluster.memberIds.push('b')
  r.instances.push({ ...instance('b', 13308), engine: { ...engine, version: '10.6.18' } })
  assert.throws(() => policy.validateCreateRequest(r, 'macOS'), /version/i)
})
test('accepts MariaDB 10.4+ and rejects older versions for replication', () => {
  assert.equal(policy.supportedMariaDBVersion?.('10.3.39'), false)
  assert.equal(policy.supportedMariaDBVersion('10.4.34'), true)
  assert.equal(policy.supportedMariaDBVersion('11.4.5'), true)
  assert.equal(policy.supportedMariaDBVersion('10.11.9-MariaDB'), true)
  assert.equal(policy.supportedMariaDBVersion('5.5.68'), false)
  assert.equal(policy.supportedMariaDBVersion('invalid'), false)
  const r: any = request()
  r.cluster.mode = 'replication'
  r.cluster.memberIds.push('b')
  r.instances.push({ ...instance('b', 13308), engine: { ...engine, version: '10.3.39' } })
  assert.throws(() => policy.validateCreateRequest(r, 'macOS'), /10\.4/)
})
test('treats Windows paths case-insensitively and sockets as pipe names', () => {
  const r: any = request()
  r.instances[0].dataDir = 'C:\\data\\one'
  r.instances[0].socket = 'FlyEnv-one'
  assert.equal(policy.validateCreateRequest(r, 'Windows'), true)
  r.instances[0].socket = '/tmp/mariadb.sock'
  assert.throws(() => policy.validateCreateRequest(r, 'Windows'), /pipe/i)
})
test('validates persisted catalog and drops no malformed rows silently', () => {
  const r = request()
  assert.equal(
    policy.validateCatalog?.({ schemaVersion: 1, instances: r.instances, clusters: [r.cluster] })
      .instances.length,
    1
  )
  assert.throws(() => policy.validateCatalog({ schemaVersion: 99 }), /schema/i)
})

test('names are unique after trimming and case folding within separate cluster and instance scopes', () => {
  const r = request()
  const catalog = { schemaVersion: 1, clusters: [r.cluster], instances: r.instances }
  const candidate: any = request()
  candidate.cluster.id = 'other'
  candidate.instances[0].id = 'b'
  candidate.cluster.memberIds = ['b']
  candidate.cluster.name = ' TEST '
  candidate.instances[0].name = 'different'
  assert.throws(() => policy.validateUniqueNames(candidate, catalog), /cluster name/i)
  candidate.cluster.name = 'different'
  candidate.instances[0].name = ' A '
  assert.throws(() => policy.validateUniqueNames(candidate, catalog), /instance name/i)
  candidate.cluster.name = 'a'
  candidate.instances[0].name = 'test'
  assert.doesNotThrow(() => policy.validateUniqueNames(candidate, catalog))
  candidate.cluster.name = 'one'
  candidate.instances[0].name = 'one'
  assert.doesNotThrow(() => policy.validateUniqueNames(candidate, catalog))
})

test('name validation excludes the edited group identities and rejects duplicate incoming members', () => {
  const r: any = request()
  const catalog = { schemaVersion: 1, clusters: [r.cluster], instances: r.instances }
  r.cluster.name = ' TEST '
  r.instances[0].name = ' A '
  assert.doesNotThrow(() => policy.validateUniqueNames(r, catalog, 'g'))
  r.instances.push({ ...instance('b', 13308), name: 'a' })
  assert.throws(() => policy.validateUniqueNames(r, catalog, 'g'), /instance name/i)
})

test('legacy duplicate names remain readable so users can repair individual groups', () => {
  const r: any = request()
  r.cluster.mode = 'replication'
  r.cluster.memberIds.push('b')
  r.instances.push({ ...instance('b', 13308), name: ' A ' })
  const second = {
    ...r.cluster,
    id: 'other',
    name: ' TEST ',
    mode: 'standalone',
    memberIds: ['c']
  }
  assert.equal(
    policy.validateCatalog({
      schemaVersion: 1,
      instances: [...r.instances, { ...instance('c', 13309), name: 'a' }],
      clusters: [r.cluster, second]
    }).instances.length,
    3
  )
})

test('permits same-installation MariaDB replication groups on supported versions', () => {
  for (const version of ['10.4.34', '10.6.18', '10.11.9', '11.4.5', '11.8.2']) {
    assert.equal(policy.supportedMariaDBVersion(version), true, version)
    const r: any = request()
    r.cluster.mode = 'replication'
    r.instances = ['a', 'b', 'c'].map((id, n) => ({
      ...instance(id, 14000 + n),
      engine: { ...engine, version }
    }))
    r.cluster.memberIds = r.instances.map((i: any) => i.id)
    assert.equal(policy.validateCreateRequest(r, 'macOS'), true, version)
  }
  for (const version of ['10.3.39', '5.5.68', 'invalid'])
    assert.equal(policy.supportedMariaDBVersion(version), false, version)
})
