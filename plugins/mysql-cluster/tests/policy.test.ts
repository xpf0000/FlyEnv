import assert from 'node:assert/strict'
import { test } from 'node:test'

const policy = await import('../policy').catch(() => ({}) as any)
const engine = { version: '8.4.8', path: '/mysql', bin: '/mysql/bin/mysqld', source: 'Static' }
const instance = (id = 'a', port = 13306) => ({
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
test('rejects shared data directories, sockets and cross-used GR ports', () => {
  const r: any = request()
  r.cluster.mode = 'replication'
  r.cluster.memberIds.push('b')
  r.instances.push({ ...instance('b', 13307), dataDir: '/tmp/mc/a/data/child' })
  assert.throws(() => policy.validateCreateRequest(r, 'macOS'), /director/i)
  r.instances[1].dataDir = '/tmp/mc/b/data'
  r.instances[1].socket = r.instances[0].socket
  assert.throws(() => policy.validateCreateRequest(r, 'macOS'), /socket/i)
  r.instances[1].socket = '/tmp/mc-b.sock'
  r.instances[1].groupPort = 13306
  assert.throws(() => policy.validateCreateRequest(r, 'macOS'), /port/i)
})
test('checks complete membership and duplicate server identities', () => {
  const r: any = request()
  r.cluster.mode = 'replication'
  r.cluster.memberIds.push('b')
  assert.throws(() => policy.validateCreateRequest(r, 'macOS'), /member/i)
  r.instances.push({ ...instance('b', 13307), serverId: 13306 })
  assert.throws(() => policy.validateCreateRequest(r, 'macOS'), /server/i)
})
test('permits only the chosen odd GR group sizes and a uniform engine', () => {
  for (const size of [2, 3, 4, 5, 7, 9, 10]) {
    const r: any = request()
    r.cluster.mode = 'group-replication'
    r.instances = Array.from({ length: size }, (_, i) => ({
      ...instance(`n${i}`, 14000 + i),
      groupPort: 15000 + i
    }))
    r.cluster.memberIds = r.instances.map((i: any) => i.id)
    if ([3, 5, 7, 9].includes(size)) assert.equal(policy.validateCreateRequest(r, 'macOS'), true)
    else assert.throws(() => policy.validateCreateRequest(r, 'macOS'), /node/i)
  }
  const r: any = request()
  r.cluster.mode = 'replication'
  r.cluster.memberIds.push('b')
  r.instances.push({ ...instance('b', 13307), engine: { ...engine, version: '8.0.44' } })
  assert.throws(() => policy.validateCreateRequest(r, 'macOS'), /version/i)
})
test('rejects MariaDB as MySQL and unsupported replication versions', () => {
  assert.equal(policy.replicationCapabilities?.('8.4.8').supported, true)
  assert.equal(policy.replicationCapabilities('8.0.22').sourceSyntax, false)
  assert.equal(policy.replicationCapabilities('8.0.23').sourceSyntax, true)
  assert.equal(policy.replicationCapabilities('12.3.2-MariaDB').supported, false)
  assert.equal(policy.replicationCapabilities('5.7.44').supported, false)
})
test('treats Windows paths case-insensitively and sockets as pipe names', () => {
  const r: any = request()
  r.instances[0].dataDir = 'C:\\data\\one'
  r.instances[0].socket = 'FlyEnv-one'
  assert.equal(policy.validateCreateRequest(r, 'Windows'), true)
  r.instances[0].socket = '/tmp/mysql.sock'
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
  r.instances.push({ ...instance('b', 13307), name: 'a' })
  assert.throws(() => policy.validateUniqueNames(r, catalog, 'g'), /instance name/i)
})

test('legacy duplicate names remain readable so users can repair individual groups', () => {
  const r: any = request()
  r.cluster.mode = 'replication'
  r.cluster.memberIds.push('b')
  r.instances.push({ ...instance('b', 13307), name: ' A ' })
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
      instances: [...r.instances, { ...instance('c', 13308), name: 'a' }],
      clusters: [r.cluster, second]
    }).instances.length,
    3
  )
})

test('permits same-installation MySQL 8 innovation and 9.x replication groups', () => {
  for (const version of ['8.1.0', '8.4.8', '9.0.0', '9.6.0', '9.7.4']) {
    assert.equal(policy.replicationCapabilities(version).supported, true, version)
    assert.equal(policy.replicationCapabilities(version).groupSupported, true, version)
    for (const mode of ['replication', 'group-replication']) {
      const r: any = request()
      r.cluster.mode = mode
      r.instances = ['a', 'b', 'c'].map((id, n) => ({
        ...instance(id, 14000 + n),
        engine: { ...engine, version },
        groupPort: 15000 + n
      }))
      r.cluster.memberIds = r.instances.map((i: any) => i.id)
      assert.equal(policy.validateCreateRequest(r, 'macOS'), true, version + ' ' + mode)
    }
  }
  for (const version of ['8.0.12', '5.7.44', '9.6.0-MariaDB', 'invalid'])
    assert.equal(policy.replicationCapabilities(version).supported, false, version)
  assert.equal(policy.replicationCapabilities('8.0.26').groupSupported, false)
})
