import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const gtid = await import('../fork/gtid').catch(() => ({}) as any)
const group = await import('../fork/groupReplication').catch(() => ({}) as any)
const uuid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
test('selects a member whose transactions contain all other members, not the first row', () => {
  assert.equal(
    gtid.chooseRecoveryCandidate?.([
      { id: 'old', executed: `${uuid}:1-10`, received: '' },
      { id: 'new', executed: `${uuid}:1-12`, received: `${uuid}:1-12` }
    ]),
    'new'
  )
})
test('refuses divergent or unapplied transaction sets and unknown members', () => {
  assert.throws(
    () =>
      gtid.chooseRecoveryCandidate([
        { id: 'a', executed: `${uuid}:1-2`, received: '' },
        { id: 'b', executed: `${uuid}:1:3`, received: '' }
      ]),
    /diverg/i
  )
  assert.throws(
    () =>
      gtid.chooseRecoveryCandidate([{ id: 'a', executed: `${uuid}:1-2`, received: `${uuid}:1-3` }]),
    /unapplied/i
  )
  assert.throws(
    () => gtid.chooseRecoveryCandidate([{ id: 'a', executed: null, received: '' }]),
    /unknown|invalid/i
  )
})
test('handles interval unions and 64-bit GTID values without rounding', () => {
  assert.equal(gtid.isGtidSubset?.(`${uuid}:2-5:9`, `${uuid}:1-3:4-10`), true)
  assert.equal(gtid.isGtidSubset(`${uuid}:9007199254740993`, `${uuid}:1-9007199254740992`), false)
})
test('bootstrap is turned off even when START GROUP_REPLICATION fails', async () => {
  assert.equal(typeof group.withBootstrap, 'function')
  const commands: string[] = []
  const session = {
    async query(sql: string) {
      commands.push(sql)
      return []
    }
  }
  await assert.rejects(
    group.withBootstrap(session, async () => {
      throw new Error('join failure')
    }),
    /join failure/
  )
  assert.deepEqual(commands, [
    'SET GLOBAL group_replication_bootstrap_group=ON',
    'SET GLOBAL group_replication_bootstrap_group=OFF'
  ])
})
test('bootstrap reset failure cannot be reported as successful creation', async () => {
  const s = {
    async query(sql: string) {
      if (sql.endsWith('OFF')) throw new Error('offline')
      return []
    }
  }
  await assert.rejects(
    group.withBootstrap(s, async () => undefined),
    /bootstrap.*OFF|bootstrap.*reset/i
  )
})
test('configuration retries reset bootstrap on every ONLINE member before reporting success', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-bootstrap-'))
  try {
    let failReset = true
    const commands: string[] = []
    const cluster = {
      id: 'g',
      mode: 'group-replication',
      memberIds: ['a', 'b', 'c'],
      groupUuid: uuid
    }
    const catalog = {
      operations: { runMany: (_ids: any, _op: any, task: any) => task() },
      instance: async (id: string) => ({ spec: { id, groupPort: 23300 } }),
      root
    }
    const connect = async (_c: any, id: string, _credential: any, task: any) =>
      task({
        async query(sql: string) {
          commands.push(id + ':' + sql)
          if (sql.includes('bootstrap_group=OFF') && failReset) throw new Error('reset unavailable')
          return []
        }
      })
    const service = new group.GroupReplicationService(catalog, connect)
    service.planRecovery = async () => ({ memberIds: cluster.memberIds })
    service.status = async (id: string) => ({
      state: 'online',
      role: id === 'a' ? 'PRIMARY' : 'SECONDARY'
    })
    await assert.rejects(
      service.configure(cluster, {}, () => {}),
      /reset unavailable/
    )
    failReset = false
    commands.splice(0)
    assert.equal((await service.configure(cluster, {}, () => {})).status, 'completed')
    assert.equal(commands.filter((c) => c.includes('bootstrap_group=OFF')).length, 3)
    assert.equal(
      commands.some((c) => c.includes('START GROUP_REPLICATION')),
      false
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
