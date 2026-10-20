import assert from 'node:assert/strict'
import { test } from 'node:test'
const gtid = await import('../fork/gtid').catch(() => ({} as any))
const group = await import('../fork/groupReplication').catch(() => ({} as any))
const uuid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
test('selects a member whose transactions contain all other members, not the first row', () => {
  assert.equal(gtid.chooseRecoveryCandidate?.([
    { id: 'old', executed: `${uuid}:1-10`, received: '' },
    { id: 'new', executed: `${uuid}:1-12`, received: `${uuid}:1-12` }
  ]), 'new')
})
test('refuses divergent or unapplied transaction sets and unknown members', () => {
  assert.throws(() => gtid.chooseRecoveryCandidate([{ id: 'a', executed: `${uuid}:1-2`, received: '' }, { id: 'b', executed: `${uuid}:1:3`, received: '' }]), /diverg/i)
  assert.throws(() => gtid.chooseRecoveryCandidate([{ id: 'a', executed: `${uuid}:1-2`, received: `${uuid}:1-3` }]), /unapplied/i)
  assert.throws(() => gtid.chooseRecoveryCandidate([{ id: 'a', executed: null, received: '' }]), /unknown|invalid/i)
})
test('handles interval unions and 64-bit GTID values without rounding', () => {
  assert.equal(gtid.isGtidSubset?.(`${uuid}:2-5:9`, `${uuid}:1-3:4-10`), true)
  assert.equal(gtid.isGtidSubset(`${uuid}:9007199254740993`, `${uuid}:1-9007199254740992`), false)
})
test('bootstrap is turned off even when START GROUP_REPLICATION fails', async () => {
  assert.equal(typeof group.withBootstrap, 'function')
  const commands: string[] = []
  const session = { async query(sql: string) { commands.push(sql); return [] } }
  await assert.rejects(group.withBootstrap(session, async () => { throw new Error('join failure') }), /join failure/)
  assert.deepEqual(commands, ['SET GLOBAL group_replication_bootstrap_group=ON', 'SET GLOBAL group_replication_bootstrap_group=OFF'])
})
test('bootstrap reset failure cannot be reported as successful creation', async () => {
  const s = { async query(sql: string) { if (sql.endsWith('OFF')) throw new Error('offline'); return [] } }
  await assert.rejects(group.withBootstrap(s, async () => undefined), /bootstrap.*OFF|bootstrap.*reset/i)
})
