import assert from 'node:assert/strict'
import { test } from 'node:test'
const api = await import('../render/RemovalPolicy').catch(() => ({}) as any)
const policy = await import('../render/versionUse').catch(() => ({}) as any)
test('blocked or unverifiable removal never reaches the mutation and default allows it', async () => {
  let removed = false
  const mutate = async () => {
    removed = true
    return 'done'
  }
  assert.equal(typeof api.guardedRemoval, 'function')
  await api.guardedRemoval({ version: '10.11.10' }, async () => false, mutate)
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
    path: '/opt/homebrew/Cellar/mariadb@10.11/10.11.10',
    bin: '/opt/homebrew/Cellar/mariadb@10.11/10.11.10/bin/mariadbd',
    version: '10.11.10',
    source: 'Homebrew'
  }
  assert.equal(
    policy.usesInstallation?.(engine, {
      name: 'homebrew/core/mariadb@10.11',
      source: 'Homebrew'
    }),
    true
  )
  assert.equal(policy.usesInstallation(engine, { name: 'mariadb@10.6', source: 'Homebrew' }), false)
  assert.equal(policy.usesInstallation(engine, { version: '10.11.10', source: 'Static' }), false)
})
test('host scan defaults cannot bypass brew, MacPorts or wrapper installation matching', () => {
  const brew = {
    path: '/opt/homebrew/Cellar/mariadb@10.11/10.11.10/',
    bin: '/opt/homebrew/Cellar/mariadb@10.11/10.11.10/bin/mariadbd',
    version: '10.11.10',
    source: 'Static'
  }
  assert.equal(policy.usesInstallation(brew, { name: 'mariadb@10.11', source: 'Homebrew' }), true)
  const port = {
    path: '/opt/local/lib/mariadb-10.11/',
    bin: '/opt/local/lib/mariadb-10.11/bin/mariadbd',
    version: '10.11.10',
    source: 'Static'
  }
  assert.equal(
    policy.usesInstallation(port, { name: 'mariadb-10.11-server', source: 'Macports' }),
    true
  )
  assert.equal(
    policy.usesInstallation(port, {
      name: 'mariadb-10.6-server',
      source: 'Macports',
      dependentRemoval: true
    }),
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
      { name: 'mariadb@10.6', source: 'Homebrew' }
    ),
    false
  )
})
test('adapts actual Unix host installed entries to the real server while retaining removal identity', async () => {
  const engine = await import('../render/engine').catch(() => ({}) as any)
  assert.equal(typeof engine.engineFromInstalled, 'function')
  for (const [path, flag, source] of [
    ['/opt/homebrew/Cellar/mariadb@10.11/10.11.10/', '', 'Homebrew'],
    ['/opt/local/lib/mariadb-10.11/', 'macports', 'Macports'],
    ['/Applications/FlyEnv/mariadb/', '', 'Static']
  ]) {
    const candidate = {
      path,
      bin: path + 'bin/mariadbd-safe',
      version: '10.11.10',
      source: 'Static',
      flag
    }
    const result = engine.engineFromInstalled(candidate)
    assert.equal(result.bin, path + 'bin/mariadbd')
    assert.equal(result.installationBin, candidate.bin)
    assert.equal(result.source, source)
  }
})
test('service-list default source cannot override an exact wrapper or installation path match', () => {
  const engine = {
    path: '/opt/homebrew/Cellar/mariadb@10.11/10.11.10/',
    bin: '/opt/homebrew/Cellar/mariadb@10.11/10.11.10/bin/mariadbd',
    installationBin: '/opt/homebrew/Cellar/mariadb@10.11/10.11.10/bin/mariadbd-safe',
    version: '10.11.10',
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
