import assert from 'node:assert/strict'
import { createAppHelper } from '../src/main/core/AppHelper'

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

  console.log('windows app helper init test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
