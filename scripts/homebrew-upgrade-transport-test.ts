import assert from 'node:assert/strict'
import { loadIsolated } from './helpers/load-isolated'
import { HomebrewUpgradeController } from '../src/render/components/VersionManager/brew/UpgradeController'

type Response = { code: number; msg?: string; outcome?: string; data?: unknown }
async function renderer() {
  const requests: {
    key: string
    action: string
    args: unknown[]
    receive?: (key: string, response: Response) => void
  }[] = []
  const removed: string[] = []
  const notices: { message: string }[] = []
  let refreshes = 0
  const loaded = await loadIsolated('src/render/components/VersionManager/brew/Controller.ts', {
    'element-plus': {
      ElMessage: (notice: { message: string }) => {
        notices.push(notice)
      }
    },
    '@lang/index': { I18nT: (key: string) => key },
    '@/util/IPC': {
      send: (_channel: string, action: string, ...args: unknown[]) => {
        const request: (typeof requests)[number] = {
          key: `request-${requests.length}`,
          action,
          args
        }
        requests.push(request)
        return {
          key: request.key,
          then: (receive: typeof request.receive) => {
            request.receive = receive
          }
        }
      },
      off: (key: string) => {
        removed.push(key)
      }
    },
    '@/util/Index': { reactiveBind: (value: unknown) => value },
    '@/store/brew': {
      BrewStore: () => {
        refreshes++
        throw new Error('Unexpected refresh for an unknown/failed package')
      }
    },
    '@/core/Module/ModuleInstalledItem': {},
    './UpgradeController': { HomebrewUpgradeController }
  })
  const reply = (index: number, info: Response) =>
    requests[index].receive!(requests[index].key, info)
  return { ...loaded, requests, removed, notices, reply, refreshes: () => refreshes }
}

for (const action of ['executeUpgrade', 'packageOperation']) {
  const bridge = await renderer()
  const args = action === 'executeUpgrade' ? ['accepted-op'] : ['uninstall', 'homebrew/core/php']
  let settled = false
  const pending = bridge.brewRequest(action, args).then((result: any) => {
    settled = true
    return result
  })
  bridge.reply(0, { code: 200, msg: 'still running' })
  await Promise.resolve()
  assert.equal(settled, false)
  assert.equal(bridge.removed.length, 0)
  bridge.reply(0, { code: 1, msg: 'worker exited', outcome: 'unknown' })
  const result = await pending
  assert.equal(result.outcome, 'unknown', `${action}: retain transport uncertainty`)
  assert.equal(result.action, action === 'executeUpgrade' ? 'upgrade' : 'uninstall')
  assert.equal(result.error, 'worker exited')
  assert.deepEqual(bridge.removed, ['request-0'])
  bridge.reply(0, { code: 1, msg: 'late duplicate', outcome: 'unknown' })
  assert.deepEqual(bridge.removed, ['request-0'])

  const knownFailure = bridge.brewRequest(action, args)
  bridge.reply(1, { code: 1, msg: 'precondition failed' })
  assert.equal((await knownFailure).outcome, 'failed')
}
console.log(
  'PASS transport: execute/package unknown is preserved, known failure stays failed, progress and terminal cleanup remain correct'
)

for (const workflow of ['install', 'upgrade']) {
  const bridge = await renderer()
  const pending =
    workflow === 'install'
      ? bridge.homebrewUpgrade.package({
          name: 'homebrew/core/php',
          installed: false,
          typeFlag: 'php'
        })
      : bridge.homebrewUpgrade.confirm({ previewId: 'confirmed-preview', module: 'php' })
  assert.equal(bridge.homebrewUpgrade.busy, true)
  const commandIndex = workflow === 'install' ? 0 : 1
  if (workflow === 'upgrade') {
    bridge.reply(0, { code: 0, data: { operationId: 'accepted-op', targets: [] } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(bridge.requests[1].action, 'executeUpgrade')
  }
  bridge.reply(commandIndex, { code: 200, msg: 'package output' })
  bridge.reply(commandIndex, { code: 1, msg: 'worker exited', outcome: 'unknown' })
  assert.equal((await pending).outcome, 'unknown')
  assert.equal(bridge.homebrewUpgrade.phase, 'unknown')
  assert.equal(bridge.homebrewUpgrade.busy, true)
  assert.match(bridge.homebrewUpgrade.logs, /package output/)
  assert.equal(bridge.refreshes(), 0)
  assert.equal(bridge.notices.length, 1)
  assert.match(bridge.notices[0].message, /brewUpgradeUnknown/)
  await assert.rejects(bridge.homebrewUpgrade.prepare('homebrew/core/php'), /busy/)
  assert.equal(bridge.requests.length, commandIndex + 1)
}
console.log(
  'PASS renderer: transport unknown keeps install/upgrade controllers busy, preserves logs, warns once, and never refreshes or replays'
)
