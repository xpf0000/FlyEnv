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
      return undefined
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
    await assert.rejects(
      c.package({ name: 'shivammathur/extensions/imagick@8.5', installed: false, typeFlag: 'php' }),
      /busy/
    )
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
// Extension formula installation shares the flight and does not release renderer ownership before its required copy.
let packageRelease!: () => void
let copied = 0
const extensionOwner = new HomebrewUpgradeController({
  call: async (action) => {
    assert.equal(action, 'packageOperation')
    return { operationId: 'extension', action: 'install', outcome: 'succeeded', logs: 'installed' }
  },
  stop: async () => true,
  refresh: async () => {},
  notify: () => {}
})
const extensionFlight = extensionOwner.package(
  { name: 'shivammathur/extensions/imagick@85', installed: false, typeFlag: 'php' },
  {
    afterPackage: async () => {
      copied++
      await new Promise<void>((r) => {
        packageRelease = r
      })
    }
  }
)
await new Promise((r) => setTimeout(r, 0))
assert.equal(copied, 1)
assert.equal(extensionOwner.busy, true)
await assert.rejects(extensionOwner.prepare('php'), /busy/)
packageRelease()
assert.equal((await extensionFlight).outcome, 'succeeded')
console.log(
  'PASS controller: extension postprocessing shares package flight and blocks another UI mutation'
)
const catalogReplies: ((value: any) => void)[] = []
const catalogOwner = new HomebrewUpgradeController({
  call: async () =>
    new Promise((resolve) => {
      catalogReplies.push(resolve)
    }),
  stop: async () => true,
  refresh: async () => {},
  notify: () => {}
})
const oldCatalog = catalogOwner.loadCatalog(['php'])
const newCatalog = catalogOwner.loadCatalog(['php'])
catalogReplies[1]([{ formula: 'homebrew/core/php', installedVersions: ['8.5.12'] }])
await newCatalog
catalogReplies[0]([{ formula: 'homebrew/core/php', installedVersions: ['8.5.7'] }])
await oldCatalog
assert.deepEqual(catalogOwner.catalog['homebrew/core/php'].installedVersions, ['8.5.12'])
console.log('PASS catalog: late older reply cannot replace successful post-upgrade catalog')

const partial = await extensionOwner.package(
  { name: 'shivammathur/extensions/imagick@8.5', installed: false, typeFlag: 'php' },
  {
    afterPackage: async () => {
      throw new Error('extension copy failed')
    }
  }
)
assert.equal(partial.outcome, 'succeeded')
assert.match(partial.postprocessError!, /copy failed/)
assert.match(extensionOwner.error, /copy failed/)
console.log(
  'PASS package postprocessing failure preserves completed command and reports partial completion'
)
