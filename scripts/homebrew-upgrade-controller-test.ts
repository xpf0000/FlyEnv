import assert from 'node:assert/strict'
import { HomebrewUpgradeController } from '../src/render/components/VersionManager/brew/UpgradeController'
import type { BrewUpgradePreview } from '../src/fork/module/Brew/UpgradeTypes'
const preview = {
  previewId: 'p',
  module: 'php',
  snapshot: { formula: 'homebrew/core/php' },
  targets: [
    { module: 'php', item: { pid: '1' } },
    { module: 'php', item: { pid: '2' } }
  ]
} as BrewUpgradePreview
for (const failStop of [false, true]) {
  const events: string[] = []
  let finish!: () => void
  let notices = 0
  const c = new HomebrewUpgradeController({
    call: async (action, args, progress) => {
      events.push(action)
      if (action === 'prepareUpgrade') return preview
      if (action === 'beginUpgrade') return { operationId: 'op', targets: preview.targets }
      if (action === 'executeUpgrade') {
        progress?.('working')
        await new Promise<void>((r) => {
          finish = r
        })
        return { operationId: 'op', action: 'upgrade', outcome: 'succeeded', logs: 'done' }
      }
    },
    stop: async (target) => {
      events.push(`stop${target.item.pid}`)
      return failStop && target.item.pid === '2' ? 'cannot stop' : true
    },
    refresh: async () => {
      throw new Error('refresh failed')
    },
    notify: () => {
      notices++
    }
  })
  const p = await c.prepare('php')
  assert.equal(events.includes('beginUpgrade'), false)
  const pending = c.confirm(p)
  assert.equal(c.confirm(p), pending)
  await new Promise((r) => setTimeout(r, 0))
  if (!failStop) {
    assert.equal(c.phase, 'upgrading')
    assert.equal(c.busy, true)
    assert.equal(c.logs, 'working')
    assert.deepEqual(events.slice(2, 5), ['stop1', 'stop2', 'executeUpgrade'])
    finish()
  }
  const result = await pending
  assert.equal(result.outcome, failStop ? 'failed' : 'succeeded')
  assert.equal(c.phase, failStop ? 'failed' : 'succeeded')
  assert.equal(events.filter((v) => v === 'executeUpgrade').length, failStop ? 0 : 1)
  assert.equal(c.refreshFailed, !failStop)
  assert.equal(notices, 1)
  assert(!events.some((e) => /start|restart/i.test(e)))
}
console.log(
  'PASS controller: cancel preview, duplicate flight, page-independent progress, stop-before-upgrade, stop failure, no restart, refresh warning'
)
