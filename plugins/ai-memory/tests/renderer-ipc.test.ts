import assert from 'node:assert/strict'
import { test } from 'node:test'

test('sensitive replies remain redacted after timeout cleanup and after duplicate terminal replies', async () => {
  let receive!: (...args: any[]) => void
  ;(globalThis as any).window = {
    FlyEnvNodeAPI: {
      ipcReceiveFromMain: (cb: (...args: any[]) => void) => {
        receive = cb
      },
      ipcSendToMain: () => {}
    }
  }
  const { default: ipc } = await import('../../../src/render/util/IPC')
  const logs: unknown[][] = []
  const original = console.log
  try {
    console.log = (...args) => {
      logs.push(args)
    }
    const request = ipc.sendSensitive('mcp:getConfig')
    ipc.off(request.key)
    receive(null, 'mcp:getConfig', request.key, {
      code: 200,
      data: { token: 'TEST_PRIVATE_SENTINEL' }
    })
    receive(null, 'mcp:getConfig', request.key, {
      code: 0,
      data: { token: 'TEST_PRIVATE_SENTINEL' }
    })
    receive(null, 'mcp:getConfig', request.key, {
      code: 0,
      data: { token: 'TEST_PRIVATE_SENTINEL' }
    })
  } finally {
    console.log = original
  }
  assert.equal(JSON.stringify(logs).includes('TEST_PRIVATE_SENTINEL'), false)
  assert.equal(logs.length, 3)
})
