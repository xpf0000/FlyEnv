import assert from 'node:assert/strict'
import { createAppHelper } from '../src/main/core/AppHelper'

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => (resolve = done))
  return { promise, resolve }
}

const execution = deferred()
const health = deferred()
let commandCalls = 0
let readyCalls = 0
const helper = createAppHelper({
  appHelperCheck: async () => {
    await health.promise
    return true
  },
  sudo: async () => {
    throw new Error('GUI authorization must not run during terminal installation')
  }
})
helper.command = async () => {
  commandCalls++
  return { command: 'fixed installer', icns: '', caFingerprint: 'approved' }
}
helper.onSuduExecSuccess(() => readyCalls++)
const pending = helper.installInTerminal(async (options) => {
  assert.equal(options.command, 'fixed installer')
  await execution.promise
})
await assert.rejects(helper.initHelper(), /already in progress/)
await assert.rejects(
  helper.installInTerminal(async () => {}),
  /already in progress/
)
assert.equal(commandCalls, 1)
assert.equal(helper.state, 'installing')
execution.resolve()
await new Promise((resolve) => setImmediate(resolve))
await assert.rejects(helper.initHelper(), /already in progress/)
assert.equal(readyCalls, 0, 'terminal exit alone does not prove helper health')
health.resolve()
assert.equal(await pending, true)
assert.equal(readyCalls, 1)
assert.equal(helper.state, 'normal')

const initialCheck = deferred()
const graphical = createAppHelper({
  appHelperCheck: async () => {
    await initialCheck.promise
    return true
  }
})
const gui = graphical.initHelper()
assert.equal(graphical.initHelper(), gui, 'duplicate graphical requests share their flight')
await assert.rejects(
  graphical.installInTerminal(async () => {}),
  /already in progress/
)
initialCheck.resolve()
await gui

for (const step of ['preparation', 'execution', 'health']) {
  const failed = createAppHelper({
    appHelperCheck: async () => {
      if (step === 'health') throw new Error('health rejected')
      return true
    }
  })
  failed.command = async () => {
    if (step === 'preparation') throw new Error('preparation rejected')
    return { command: 'installer', icns: '' }
  }
  let completed = 0
  failed.onSuduExecSuccess(() => completed++)
  await assert.rejects(
    failed.installInTerminal(async () => {
      if (step === 'execution') throw new Error('execution rejected')
    }),
    new RegExp(step)
  )
  assert.equal(completed, 0)
  assert.equal(failed.state, 'normal', 'required failures release the actual installation flight')
  if (step !== 'health') assert.equal(await failed.initHelper(), true)
}
console.log(
  'Helper terminal installation: cross-mode exclusion, health ownership and failure cleanup passed'
)
