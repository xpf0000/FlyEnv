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
catalogReplies[1]({
  rows: [{ formula: 'homebrew/core/php', installedVersions: ['8.5.12'] }],
  failures: []
})
await newCatalog
catalogReplies[0]({
  rows: [],
  failures: [{ formula: 'homebrew/core/php', error: 'stale failure' }]
})
await assert.rejects(oldCatalog, /stale failure/)
assert.deepEqual(catalogOwner.catalog['homebrew/core/php'].installedVersions, ['8.5.12'])
assert.equal(catalogOwner.catalogError, '')
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

let catalogResponse: any = {
  rows: [{ formula: 'homebrew/core/php', installedVersions: ['8.5.12'], eligible: true }],
  failures: []
}
let catalogTransportError = false
let packageCalls = 0
let notices = 0
const queryOwner = new HomebrewUpgradeController({
  call: async (action) => {
    if (action === 'getUpgradeCatalog') {
      if (catalogTransportError) throw new Error('catalog worker exited')
      return catalogResponse
    }
    if (action === 'beginUpgrade') return { operationId: 'query-check', targets: [] }
    if (action === 'executeUpgrade') {
      packageCalls++
      return { operationId: 'query-check', action: 'upgrade', outcome: 'succeeded', logs: '' }
    }
    throw new Error('Unexpected action: ' + action)
  },
  stop: async () => true,
  refresh: async () => {
    await queryOwner.loadCatalog(['php', 'php@8.4'])
  },
  notify: () => {
    notices++
  }
})
await queryOwner.loadCatalog(['php'])
catalogResponse = {
  rows: [{ formula: 'homebrew/core/php@8.4', installedVersions: ['8.4.15'] }],
  failures: [{ formula: 'homebrew/core/php', error: 'info query timed out' }]
}
await assert.rejects(queryOwner.loadCatalog(['php', 'php@8.4']), /php.*timed out/)
assert.equal(Object.hasOwn(queryOwner.catalog, 'homebrew/core/php'), false)
assert.deepEqual(queryOwner.catalog['homebrew/core/php@8.4'].installedVersions, ['8.4.15'])
assert.match(queryOwner.catalogError, /timed out/)
const completed = await queryOwner.confirm({ previewId: 'query-preview', module: 'php' } as any)
assert.equal(completed.outcome, 'succeeded')
assert.equal(queryOwner.refreshFailed, true)
assert.equal(queryOwner.busy, false)
assert.match(queryOwner.logs, /timed out/)
assert.equal(packageCalls, 1)
assert.equal(notices, 1)
catalogResponse = { rows: [], failures: [{ formula: 'homebrew/core/php', error: 'invalid JSON' }] }
await assert.rejects(queryOwner.loadCatalog(['php']), /invalid JSON/)
assert.match(queryOwner.catalogError, /invalid JSON/)
catalogTransportError = true
await assert.rejects(queryOwner.loadCatalog(['php']), /worker exited/)
assert.match(queryOwner.catalogError, /worker exited/)
catalogTransportError = false
catalogResponse = {
  rows: [{ formula: 'homebrew/core/php', installedVersions: ['8.5.12'] }],
  failures: []
}
await queryOwner.loadCatalog(['php'])
assert.equal(queryOwner.catalogError, '')
assert.equal(queryOwner.catalog['homebrew/core/php'].installedVersions[0], '8.5.12')
assert.equal(packageCalls, 1)
assert.equal(notices, 1)
console.log(
  'PASS catalog/controller: partial success retained, stale failed rows removed, all/transport failures visible, completed upgrade preserved with refresh warning and no replay, later recovery'
)
