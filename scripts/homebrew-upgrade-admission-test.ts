import assert from 'node:assert/strict'
import { HomebrewOperationCoordinator } from '../src/main/core/HomebrewOperationCoordinator'
import type { BrewFormulaSnapshot } from '../src/fork/module/Brew/UpgradeTypes'
let running = [
  {
    module: 'php',
    item: {
      bin: '/opt/homebrew/Cellar/php/8.5.7/bin/php',
      path: '/opt/homebrew/Cellar/php/8.5.7',
      version: '8.5.7',
      enable: true,
      run: true,
      running: false,
      num: 85,
      typeFlag: 'php' as const,
      pid: '123'
    }
  }
]
const snapshot = {
  identity: {
    bin: '/opt/homebrew/bin/brew',
    prefix: '/opt/homebrew',
    cellar: '/opt/homebrew/Cellar',
    arch: 'arm64'
  },
  formula: 'homebrew/core/php',
  fingerprint: 'v1',
  affectedRacks: ['/opt/homebrew/Cellar/php'],
  kegs: ['/opt/homebrew/Cellar/php/8.5.7'],
  eligible: true
} as BrewFormulaSnapshot
let executed = 0
let release: (() => void) | undefined
const c = new HomebrewOperationCoordinator({
  inspect: async () => structuredClone(snapshot),
  running: () => structuredClone(running),
  idle: async () => {},
  run: async (id, action) => {
    executed++
    await new Promise<void>((r) => {
      release = r
    })
    return { operationId: id, action, outcome: 'succeeded', logs: '' }
  }
})
const p = await c.prepareUpgrade('php', 'homebrew/core/php')
assert.equal(executed, 0)
assert.equal(p.targets.length, 1)
await assert.rejects(c.beginUpgrade('forged'))
snapshot.fingerprint = 'v2'
await assert.rejects(c.beginUpgrade(p.previewId), /changed/)
const p2 = await c.prepareUpgrade('php', 'homebrew/core/php')
const accepted = await c.beginUpgrade(p2.previewId)
assert.throws(() => c.assertStart('php', running[0].item), /Homebrew/)
assert.doesNotThrow(() => c.assertStart('php', { bin: '/another/Cellar/php/8.5.7/bin/php' }))
assert.throws(() => c.assertStart('php', {}), /Homebrew/)
await assert.rejects(c.beginUpgrade(p2.previewId))
assert.equal((await c.execute(accepted.operationId)).outcome, 'failed')
assert.doesNotThrow(() => c.assertStart('php', {}))
assert.equal(executed, 0)
c.cancelPending(accepted.operationId)
const p3 = await c.prepareUpgrade('php', 'homebrew/core/php')
const op = await c.beginUpgrade(p3.previewId)
running = []
const result = c.execute(op.operationId)
await new Promise((r) => setTimeout(r, 0))
assert.equal(executed, 1)
assert.equal(c.execute(op.operationId), result)
assert.throws(() => c.cancelPending(op.operationId), /running/)
release!()
assert.equal((await result).outcome, 'succeeded')
assert.doesNotThrow(() => c.assertStart('php', {}))
assert.equal(await c.execute(op.operationId), await result)
assert.equal(executed, 1)
console.log(
  'PASS admission: opaque tokens, stale confirmation, stops required, start gate, single execution, terminal replay'
)
// Execute owns admission even while awaiting its last read-only revalidation.
let inspectBarrier: Promise<void> = Promise.resolve()
let releaseInspect!: () => void
const guarded = new HomebrewOperationCoordinator({
  inspect: async () => {
    await inspectBarrier
    return structuredClone(snapshot)
  },
  running: () => [],
  idle: async () => {},
  run: async (id, action) => ({
    operationId: id,
    action,
    outcome: 'unknown',
    error: 'worker exited',
    logs: ''
  })
})
const gp = await guarded.prepareUpgrade('php', 'php')
const go = await guarded.beginUpgrade(gp.previewId)
inspectBarrier = new Promise<void>((resolve) => {
  releaseInspect = resolve
})
const gf = guarded.execute(go.operationId)
await new Promise((r) => setTimeout(r, 0))
assert.throws(() => guarded.cancelPending(go.operationId), /running|executing/)
releaseInspect()
assert.equal((await gf).outcome, 'unknown')
assert.throws(() => guarded.assertStart('php', {}), /Homebrew/)
await assert.rejects(guarded.beginUpgrade(gp.previewId))
console.log(
  'PASS admission: cancellation cannot release execute preflight, worker loss retains gate'
)
const uncertain = new HomebrewOperationCoordinator({
  inspect: async () => snapshot,
  idle: async () => {},
  running: () => [
    {
      module: 'php',
      item: { ...previewItem(), bin: '/opt/homebrew/opt/nonexistent-flyenv-fixture/sbin/php-fpm' }
    }
  ],
  run: async () => {
    throw new Error('must not run')
  }
})
function previewItem() {
  return {
    bin: '',
    path: '',
    version: '8.5.7',
    enable: true,
    run: true,
    running: false,
    num: 85,
    typeFlag: 'php' as const,
    pid: '123'
  }
}
await assert.rejects(uncertain.prepareUpgrade('php', 'php'), /verify.*service/i)
console.log(
  'PASS admission: unverifiable running alias blocks preparation rather than becoming a stop target'
)

for (const action of ['install', 'uninstall'] as const) {
  let failIdle = true
  let runs = 0
  const owner = new HomebrewOperationCoordinator({
    inspect: async () => snapshot,
    running: () => [],
    idle: async () => {
      if (failIdle) throw new Error('earlier start result is unknown')
    },
    run: async (id, command) => {
      runs++
      return { operationId: id, action: command, outcome: 'succeeded', logs: '' }
    }
  })
  const preflight = owner.mutate(action, snapshot, () => {})
  assert.throws(() => owner.assertStart('php', { bin: snapshot.kegs[0] + '/bin/php' }), /Homebrew/)
  const rejected = await preflight
  assert.equal(rejected.outcome, 'failed', `${action}: pre-submission failure is known`)
  assert.match(rejected.error!, /earlier start/)
  assert.equal(runs, 0)
  assert.doesNotThrow(() => owner.assertStart('php', { bin: snapshot.kegs[0] + '/bin/php' }))
  assert.equal((await owner.mutate(action, snapshot, () => {})).outcome, 'failed')
  assert.equal(runs, 0)
  failIdle = false
  const preview = await owner.prepareUpgrade('php', 'php')
  const upgrade = await owner.beginUpgrade(preview.previewId)
  owner.cancelPending(upgrade.operationId)
  assert.equal((await owner.mutate(action, snapshot, () => {})).outcome, 'succeeded')
  assert.equal(runs, 1)
}
console.log(
  'PASS admission: install/uninstall preflight failure submits nothing and releases the gate for the next mutation/upgrade'
)

for (const failure of ['throw', 'unknown'] as const) {
  let runs = 0
  const owner = new HomebrewOperationCoordinator({
    inspect: async () => snapshot,
    running: () => [],
    idle: async () => {},
    run: async (id, action) => {
      runs++
      if (failure === 'throw') throw new Error('package transport exited after submission')
      return { operationId: id, action, outcome: 'unknown', logs: '' }
    }
  })
  assert.equal((await owner.mutate('install', snapshot, () => {})).outcome, 'unknown')
  assert.equal(runs, 1)
  await assert.rejects(
    owner.mutate('uninstall', snapshot, () => {}),
    /busy/
  )
  assert.throws(() => owner.assertStart('php', { bin: snapshot.kegs[0] + '/bin/php' }), /Homebrew/)
  assert.equal(runs, 1)
}
console.log('PASS admission: submitted package exceptions/unknown retain the gate without replay')
