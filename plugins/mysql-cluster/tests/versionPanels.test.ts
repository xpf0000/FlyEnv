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
test('host scan defaults cannot bypass brew, MacPorts or wrapper installation matching', () => {
  const brew = {
    path: '/opt/homebrew/Cellar/mysql@8.4/8.4.8/',
    bin: '/opt/homebrew/Cellar/mysql@8.4/8.4.8/bin/mysqld',
    version: '8.4.8',
    source: 'Static'
  }
  assert.equal(policy.usesInstallation(brew, { name: 'mysql@8.4', source: 'Homebrew' }), true)
  const port = {
    path: '/opt/local/lib/mysql8/',
    bin: '/opt/local/lib/mysql8/bin/mysqld',
    version: '8.0.44',
    source: 'Static'
  }
  assert.equal(policy.usesInstallation(port, { name: 'mysql8', source: 'Macports' }), true)
  assert.equal(
    policy.usesInstallation(port, { name: 'mysql9', source: 'Macports', dependentRemoval: true }),
    true
  )
  assert.equal(
    policy.usesInstallation(
      { ...brew, source: 'Homebrew' },
      { name: 'unresolved-alias', source: 'Homebrew' }
    ),
    true
  )
  assert.equal(
    policy.usesInstallation(
      { ...brew, source: 'Homebrew' },
      { name: 'mysql@8.0', source: 'Homebrew' }
    ),
    false
  )
})
test('adapts actual Unix host installed entries to the real server while retaining removal identity', async () => {
  const engine = await import('../render/engine').catch(() => ({}) as any)
  assert.equal(typeof engine.engineFromInstalled, 'function')
  for (const [path, flag, source] of [
    ['/opt/homebrew/Cellar/mysql@8.4/8.4.8/', '', 'Homebrew'],
    ['/opt/local/lib/mysql8/', 'macports', 'Macports'],
    ['/Applications/FlyEnv/mysql/', '', 'Static']
  ]) {
    const candidate = {
      path,
      bin: path + 'bin/mysqld_safe',
      version: '8.4.8',
      source: 'Static',
      flag
    }
    const result = engine.engineFromInstalled(candidate)
    assert.equal(result.bin, path + 'bin/mysqld')
    assert.equal(result.installationBin, candidate.bin)
    assert.equal(result.source, source)
  }
})
test('service-list default source cannot override an exact wrapper or installation path match', () => {
  const engine = {
    path: '/opt/homebrew/Cellar/mysql@8.4/8.4.8/',
    bin: '/opt/homebrew/Cellar/mysql@8.4/8.4.8/bin/mysqld',
    installationBin: '/opt/homebrew/Cellar/mysql@8.4/8.4.8/bin/mysqld_safe',
    version: '8.4.8',
    source: 'Homebrew'
  }
  assert.equal(
    policy.usesInstallation(engine, {
      source: 'Static',
      bin: engine.installationBin,
      path: engine.path
    }),
    true
  )
})
