import assert from 'node:assert/strict'
import { test } from 'node:test'
const api = await import('../../../src/render/components/VersionManager/RemovalPolicy').catch(
  () => ({}) as any
)
const policy = await import('../render/versionUse').catch(() => ({}) as any)
test('blocked or unverifiable removal never reaches the mutation and default allows it', async () => {
  let removed = false
  const mutate = async () => {
    removed = true
    return 'done'
  }
  assert.equal(typeof api.guardedRemoval, 'function')
  await api.guardedRemoval({ version: '8.4.8' }, async () => false, mutate)
  assert.equal(removed, false)
  await assert.rejects(
    api.guardedRemoval(
      {},
      async () => {
        throw new Error('unknown')
      },
      mutate
    ),
    /unknown/
  )
  assert.equal(removed, false)
  assert.equal(await api.guardedRemoval({}, undefined, mutate), 'done')
})
test('installation matching accounts for the real path, brew formula and patch version', () => {
  const engine = {
    path: '/opt/homebrew/Cellar/mysql@8.4/8.4.8',
    bin: '/opt/homebrew/Cellar/mysql@8.4/8.4.8/bin/mysqld',
    version: '8.4.8',
    source: 'Homebrew'
  }
  assert.equal(
    policy.usesInstallation?.(engine, { name: 'homebrew/core/mysql@8.4', source: 'Homebrew' }),
    true
  )
  assert.equal(policy.usesInstallation(engine, { name: 'mysql@8.0', source: 'Homebrew' }), false)
  assert.equal(policy.usesInstallation(engine, { version: '8.4.8', source: 'Static' }), false)
})
