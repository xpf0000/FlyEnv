import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createAppHelper } from '../src/main/core/AppHelper'
import { AppHelperError } from '../src/shared/WindowsHelperState'

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const fixture = () => {
  let healthy = false
  let failure = new AppHelperError('helper_version_mismatch', 'Helper must be updated')
  let recover = false
  let recoveryFailure = false
  let preparationGate: Promise<void> | undefined
  let installGate: Promise<void> | undefined
  let checks = 0
  let recoveries = 0
  let commands = 0
  let installs = 0
  const states: string[] = []
  const helper = createAppHelper({
    appHelperCheck: async () => {
      checks++
      await preparationGate
      if (!healthy) throw failure
      return true
    },
    recoverWindowsHelper: async () => {
      recoveries++
      if (recoveryFailure) throw new Error('Existing task could not be started')
      if (recover) healthy = true
      return recover
    },
    installWindows: async () => {
      installs++
      await installGate
      healthy = true
      return { stdout: '', stderr: '' }
    },
    sudo: async () => {
      assert.fail('Unexpected privilege prompt')
    },
    windowsDiagnostics: async () => ''
  })
  helper.command = async () => {
    commands++
    return { command: '', icns: '', windowsScript: 'test installer; never executed' }
  }
  helper.onStatusMessage(({ state }) => states.push(state))
  return {
    helper,
    states,
    setHealthy: () => (healthy = true),
    setRecoverable: () => {
      failure = new AppHelperError('helper_pipe_unreachable', 'Helper is stopped')
      recover = true
    },
    setRecoveryFailure: () => {
      failure = new AppHelperError('helper_pipe_unreachable', 'Helper is stopped')
      recoveryFailure = true
    },
    setPreparationGate: (promise: Promise<void>) => (preparationGate = promise),
    setInstallGate: (promise: Promise<void>) => (installGate = promise),
    counts: () => ({ checks, recoveries, commands, installs })
  }
}

{
  const { helper, states, setHealthy, counts } = fixture()
  setHealthy()
  assert.equal(await helper.ensureReady(), true)
  assert.deepEqual(states, [])
  assert.deepEqual(counts(), { checks: 1, recoveries: 0, commands: 0, installs: 0 })
}

{
  const { helper, states, setRecoverable, counts } = fixture()
  setRecoverable()
  assert.equal(await helper.ensureReady(), true)
  assert.deepEqual(states, [], 'restoring an intact task does not request installation')
  assert.deepEqual(counts(), { checks: 2, recoveries: 1, commands: 0, installs: 0 })
}

{
  const { helper, states, setRecoveryFailure, counts } = fixture()
  setRecoveryFailure()
  await assert.rejects(helper.ensureReady(), { code: 'helper_pipe_unreachable' })
  assert.deepEqual(states, ['needInstall'])
  assert.equal(counts().installs, 0, 'recovery failure cannot authorize UAC installation')
}

{
  const { helper, states, setPreparationGate, setInstallGate, counts } = fixture()
  const check = deferred()
  setPreparationGate(check.promise)
  const first = helper.ensureReady()
  assert.equal(helper.ensureReady(), first, 'concurrent callers share one readiness operation')
  const rejected = assert.rejects(first, { code: 'helper_version_mismatch' })
  check.resolve()
  await rejected
  assert.deepEqual(states, ['needInstall'])
  assert.equal(helper.state, 'normal')
  assert.deepEqual(counts(), { checks: 1, recoveries: 0, commands: 0, installs: 0 })

  // Cancelling/closing the UI sends no installation IPC: waiting itself cannot start UAC.
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(counts().installs, 0)

  // A later attempt may prompt again, but still cannot install without the confirmed IPC.
  await assert.rejects(helper.ensureReady(), { code: 'helper_version_mismatch' })
  assert.deepEqual(states, ['needInstall', 'needInstall'])
  assert.equal(counts().commands, 0)

  const install = deferred()
  setInstallGate(install.promise)
  // This is the entry invoked by APP-FlyEnv-Helper-Install after the UI's confirm button.
  const confirmed = helper.initHelper()
  assert.equal(helper.initHelper(), confirmed, 'duplicate confirmed IPC shares installation')
  assert.equal(helper.ensureReady(), confirmed, 'business requests join the confirmed installation')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(counts().installs, 1)
  install.resolve()
  assert.equal(await confirmed, true)
  assert.equal(helper.state, 'normal')
  assert.equal(counts().commands, 1)
  assert.equal(counts().installs, 1)
  assert.equal(states.at(-1), 'checkSuccess')
  assert.equal(await helper.ensureReady(), true)
  assert.equal(counts().installs, 1)
}

{
  const { helper, counts } = fixture()
  helper.onStatusMessage(() => {
    throw new Error('Renderer was destroyed')
  })
  await assert.rejects(helper.ensureReady(), { code: 'helper_version_mismatch' })
  assert.equal(counts().installs, 0, 'failed notifications never authorize installation')
}

const application = readFileSync(new URL('../src/main/Application.ts', import.meta.url), 'utf8')
const readinessRoute = application.slice(
  application.indexOf('private async ensureWindowsHelper('),
  application.indexOf('private publishWindowsPrivilege(')
)
assert.match(readinessRoute, /await AppHelper\.ensureReady\(\)/)
assert.doesNotMatch(readinessRoute, /AppHelper\.initHelper\(/)
console.log('Windows helper confirmation and readiness lifecycle regression tests passed')
