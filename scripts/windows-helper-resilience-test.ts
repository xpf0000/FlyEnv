import assert from 'node:assert/strict'
import { createAppHelper, waitForHelperHealth } from '../src/main/core/AppHelper'
import { AppHelperError, buildHelperCheckResponse } from '../src/shared/WindowsHelperState'

async function main() {
  const error = new AppHelperError('helper_acl_invalid', 'allowed-roots owner is invalid')
  const response = buildHelperCheckResponse(error)
  assert.equal((response as any).msg, error.message, 'IPC must preserve errors without stderr')
  let checks = 0
  await assert.rejects(
    waitForHelperHealth(
      async () => {
        checks++
        throw error
      },
      {
        sleep: async () => {
          throw new Error('permanent ACL failure must not be retried')
        }
      }
    ),
    (actual: unknown) => actual === error
  )
  assert.equal(checks, 1)
  const programmingError = new TypeError('check implementation bug')
  let programmingChecks = 0
  await assert.rejects(
    waitForHelperHealth(
      async () => {
        programmingChecks++
        throw programmingError
      },
      {
        sleep: async () => {
          throw new Error('unknown errors must fail fast without retry')
        }
      }
    ),
    (actual: unknown) => actual === programmingError
  )
  assert.equal(programmingChecks, 1)
  let release: (() => void) | undefined
  const helper = createAppHelper({
    appHelperCheck: async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return true
    }
  })
  const first = helper.initHelper()
  const second = helper.initHelper()
  assert.equal(first, second, 'duplicate install callers must share the terminal result')
  release?.()
  assert.deepEqual(await Promise.all([first, second]), [true, true])
  assert.equal(helper.state, 'normal')
  let recoveryChecks = 0
  const stopped = createAppHelper({
    appHelperCheck: async () => {
      if (++recoveryChecks === 1)
        throw new AppHelperError('helper_pipe_unreachable', 'task stopped')
      return true
    },
    recoverWindowsHelper: async () => true,
    sudo: async () => {
      throw new Error('restarting an intact task must not reinstall')
    }
  } as any)
  stopped.command = async () => {
    throw new Error('must recover before preparing installation')
  }
  assert.equal(await stopped.initHelper(), true)
  assert.equal(recoveryChecks, 2)
  const broken = createAppHelper({
    appHelperCheck: async () => {
      throw new AppHelperError('helper_key_missing', 'missing')
    },
    installWindows: async () => {
      throw new AppHelperError('helper_task_start_failed', 'blocked')
    },
    windowsDiagnostics: async () => 'Task state=3, LastTaskResult=5\nstartup fixture'
  })
  broken.command = async () => ({ command: '', icns: '', windowsScript: 'fixture' })
  await assert.rejects(
    broken.initHelper(),
    (error: any) =>
      error.code === 'helper_task_start_failed' && /LastTaskResult=5/.test(error.stderr)
  )
  assert.equal(broken.state, 'normal')
  console.log('windows-helper-resilience-test: ok')
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
