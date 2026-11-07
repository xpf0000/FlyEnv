import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { inspectFormula, catalogFromInfo } from '../src/fork/module/Brew/UpgradeCatalog'
const root = await realpath(await mkdtemp(join(tmpdir(), 'brew-catalog-')))
try {
  const identity = {
    bin: '/opt/homebrew/bin/brew',
    prefix: root,
    cellar: join(root, 'Cellar'),
    arch: 'arm64'
  }
  const info = {
    name: 'php',
    full_name: 'php',
    tap: 'homebrew/core',
    versions: { stable: '8.5.12' },
    revision: 0,
    installed: [{ version: '8.5.7' }, { version: '8.4.1' }],
    outdated: true,
    pinned: false
  }
  for (const v of info.installed) {
    await mkdir(join(identity.cellar, 'php', v.version), { recursive: true })
    await writeFile(
      join(identity.cellar, 'php', v.version, 'INSTALL_RECEIPT.json'),
      JSON.stringify({ source: { tap: 'homebrew/core' }, arch: 'arm64' })
    )
  }
  const inspect = (patch = {}, id = identity) =>
    inspectFormula(id, { ...info, ...patch }, ['homebrew/core/php'])
  const old = await inspect()
  assert.equal(old.eligible, true)
  assert.equal(old.availableVersion, '8.5.12')
  assert.deepEqual(old.installedVersions, ['8.4.1', '8.5.7'])
  assert.equal(old.kegs.length, 2)
  assert.equal((await inspect({ pinned: true })).reason, 'pinned')
  assert.equal((await inspect({ tap: 'shivammathur/php' })).eligible, false)
  assert.equal((await inspect({ versions: { stable: '' } })).eligible, false)
  assert.equal((await inspect({ outdated: false })).eligible, false)
  assert.equal(
    (await inspect({ versions: { stable: '8.5.7' }, revision: 1 })).availableVersion,
    '8.5.7_1'
  )
  assert.equal(
    (await inspect({ tap: 'shivammathur/php', full_name: 'shivammathur/php/php' })).eligible,
    false
  )
  assert.equal(
    (await inspect({}, { ...identity, cellar: join(root, 'other/Cellar') })).eligible,
    false
  )
  assert.equal((await inspect({}, { ...identity, arch: 'x86_64' })).eligible, false)
  const rows = await catalogFromInfo(
    identity,
    [{ ...info, name: '../bad' }, info],
    ['homebrew/core/php']
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].eligible, true)
  console.log(
    'PASS catalog: actual/stable, revision, pin, latest, tap, prefix, arch, kegs, independent invalid candidate'
  )
} finally {
  await rm(root, { recursive: true, force: true })
}
// A current shared library is not itself upgraded; unrelated database services remain independent.
const { dependencyImpact } = await import('../src/fork/module/Brew/UpgradeCatalog')
const graph = [
  { name: 'php', dependencies: ['openssl'], installed: [{ version: '8.5.7' }], outdated: true },
  { name: 'openssl', dependencies: [], installed: [{ version: '3.5' }], outdated: false },
  { name: 'mysql', dependencies: ['openssl'], installed: [{ version: '9' }], outdated: false }
] as any
assert.deepEqual(dependencyImpact(graph, 'php'), ['php'])
graph[1].outdated = true
assert.deepEqual(dependencyImpact(graph, 'php'), ['mysql', 'openssl', 'php'])
console.log(
  'PASS dependency impact: current shared libraries do not connect unrelated databases; changing libraries include dependents'
)

const missing = new Set<string>()
assert.deepEqual(
  dependencyImpact(
    [
      {
        name: 'php',
        dependencies: [],
        build_dependencies: ['pkg-config'],
        installed: [{ version: '8.5.7' }]
      }
    ] as any,
    'php',
    missing
  ),
  ['php', 'pkg-config']
)
assert.deepEqual([...missing], ['pkg-config'])
assert.deepEqual(
  dependencyImpact(
    [
      {
        name: 'php',
        dependencies: [],
        build_dependencies: ['pkg-config'],
        installed: [{ version: '8.5.7' }]
      },
      { name: 'pkgconf', aliases: ['pkg-config'], installed: [], dependencies: [] }
    ] as any,
    'php'
  ),
  ['php', 'pkgconf']
)
console.log('PASS dependency impact: missing build metadata requested and aliases canonicalized')
