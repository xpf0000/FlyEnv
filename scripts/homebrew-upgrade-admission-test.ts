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
      pid: '123'
    }
  }
]
let snapshot = {
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
await assert.rejects(c.execute(accepted.operationId), /still running/)
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
