import assert from 'node:assert/strict'
import { createAppHelper, waitForHelperHealth } from '../src/main/core/AppHelper'
import { AppHelperError, isAppHelperError } from '../src/shared/WindowsHelperState'

async function main() {
  assert.equal(typeof createAppHelper, 'function')

  let checkCalls = 0
  let commandCalls = 0
  let sudoCalls = 0
  const statuses: string[] = []
  let releaseCommand: (() => void) | undefined
  let signalCommandStarted: (() => void) | undefined
  const commandStarted = new Promise<void>((resolve) => {
    signalCommandStarted = resolve
  })

  const helper = createAppHelper({
    appHelperCheck: async () => {
      checkCalls += 1
      throw new Error('helper unreachable')
    },
    sudo: async () => {
      sudoCalls += 1
      throw new Error('sudo failed')
    }
  })

  helper.onStatusMessage((message) => {
    statuses.push(message.state)
  })

  helper.command = async () => {
    commandCalls += 1
    signalCommandStarted?.()
    await new Promise<void>((resolve) => {
      releaseCommand = resolve
    })
    return {
      command: 'echo helper',
      icns: ''
    }
  }

  const firstInit = helper.initHelper()
  await commandStarted

  await assert.rejects(helper.initHelper(), /Please Wait/)
  assert.equal(helper.state, 'installing')
  assert.equal(commandCalls, 1)
  assert.equal(statuses.filter((state) => state === 'needInstall').length, 1)

  releaseCommand?.()

  await assert.rejects(firstInit, /sudo failed/)
  assert.equal(sudoCalls, 1)
  assert.equal(checkCalls, 1)

  let releaseDirectoryStartup: (() => void) | undefined
  let healthyInitSettled = false
  const healthyHelper = createAppHelper({
    appHelperCheck: async () => true
  })
  healthyHelper.onSuduExecSuccess(
    () =>
      new Promise<void>((resolve) => {
        releaseDirectoryStartup = resolve
      })
  )
  const healthyInit = healthyHelper.initHelper().then(() => {
    healthyInitSettled = true
  })
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(
    healthyInitSettled,
    false,
    'a healthy Helper check must wait for the data-directory startup gate to finish'
  )
  releaseDirectoryStartup?.()
  await healthyInit
  assert.equal(healthyInitSettled, true)

  let attempts = 0
  let now = 0
  const delays: number[] = []
  await waitForHelperHealth(
    async () => {
      attempts += 1
      if (attempts < 3) {
        throw new AppHelperError('helper_pipe_unreachable', 'named pipe is not ready')
      }
      return true
    },
    {
      deadlineMs: 5000,
      initialDelayMs: 100,
      maxDelayMs: 500,
      now: () => now,
      sleep: async (milliseconds) => {
        delays.push(milliseconds)
        now += milliseconds
      }
    }
  )
  assert.equal(attempts, 3)
  assert.deepEqual(delays, [100, 200])

  now = 0
  await assert.rejects(
    waitForHelperHealth(
      async () => {
        throw new AppHelperError('helper_pipe_unreachable', 'named pipe is not ready')
      },
      {
        deadlineMs: 100,
        initialDelayMs: 100,
        maxDelayMs: 100,
        now: () => now,
        sleep: async (milliseconds) => {
          now += milliseconds
        }
      }
    ),
    (error: unknown) => {
      assert.equal(isAppHelperError(error, 'helper_start_timeout'), true)
      assert.match((error as Error).message, /named pipe is not ready/)
      return true
    }
  )

  console.log('windows app helper init test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
