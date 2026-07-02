import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createHelper } from '../src/fork/Helper'
import { AppHelperError } from '../src/shared/WindowsHelperState'

class FakeSocket extends EventEmitter {
  destroyed = false
  private readonly writeHook?: () => void

  constructor(writeHook?: () => void) {
    super()
    this.writeHook = writeHook
  }

  write(_chunk: string | Uint8Array, callback?: (error?: Error | null) => void) {
    this.writeHook?.()
    callback?.(null)
    return true
  }

  end() {
    this.emit('end')
    return this
  }

  destroy() {
    this.destroyed = true
    return this
  }
}

async function main() {
  assert.equal(typeof createHelper, 'function')

  let promptCalls = 0
  let fallbackCalls = 0
  const missingBinaryHelper = createHelper({
    isWindows: () => true,
    appHelperCheck: async () => {
      throw new AppHelperError('helper_binary_missing', 'missing')
    },
    runWindowsHelperFallback: async () => {
      fallbackCalls += 1
      return true
    }
  })
  missingBinaryHelper.appHelper = {
    needInstall() {
      promptCalls += 1
    }
  } as any

  await assert.rejects(
    missingBinaryHelper.send('tools', 'writeFileByRoot', 'C:\\FlyEnv\\test.txt', 'content'),
    (error: any) => {
      assert.equal(error?.code, 'helper_binary_missing')
      return true
    }
  )
  assert.equal(fallbackCalls, 0)
  assert.equal(promptCalls, 0)

  await assert.rejects(
    missingBinaryHelper.send('tools', 'readFileByRoot', 'C:\\FlyEnv\\test.txt'),
    (error: any) => {
      assert.equal(error?.code, 'helper_binary_missing')
      return true
    }
  )
  assert.equal(promptCalls, 0)
  assert.equal(fallbackCalls, 0)

  let unavailablePromptCalls = 0
  let unavailableFallbackCalls = 0
  const unavailableHelper = createHelper({
    isWindows: () => true,
    appHelperCheck: async () => {
      throw new AppHelperError('helper_unreachable', 'unreachable')
    },
    runWindowsHelperFallback: async () => {
      unavailableFallbackCalls += 1
      return true
    }
  })
  unavailableHelper.appHelper = {
    needInstall() {
      unavailablePromptCalls += 1
    }
  } as any

  await assert.rejects(
    unavailableHelper.send('tools', 'setSystemEnv', 'FLYENV_ALIAS', 'C:\\FlyEnv\\alias'),
    (error: any) => {
      assert.equal(error?.code, 'helper_unreachable')
      return true
    }
  )
  assert.equal(unavailablePromptCalls, 1)
  assert.equal(unavailableFallbackCalls, 0)

  let socketFallbackCalls = 0
  const socketFallbackHelper = createHelper({
    isWindows: () => true,
    appHelperCheck: async () => true,
    getHelperKey: async () => null,
    createConnection: (() => {
      const socket = new FakeSocket(() => {
        queueMicrotask(() => {
          socket.emit('error', new Error('socket failed'))
          socket.emit('error', new Error('socket failed again'))
        })
      })
      queueMicrotask(() => {
        socket.emit('connect')
      })
      return socket as any
    }) as any,
    runWindowsHelperFallback: async () => {
      socketFallbackCalls += 1
      return true
    }
  })

  const socketFallbackResult = await socketFallbackHelper.send(
    'tools',
    'setSystemEnv',
    'FLYENV_ALIAS',
    'C:\\FlyEnv\\alias'
  )
  assert.equal(socketFallbackResult, true)
  assert.equal(socketFallbackCalls, 1)

  let noResponseFallbackCalls = 0
  const noResponseHelper = createHelper({
    isWindows: () => true,
    appHelperCheck: async () => true,
    getHelperKey: async () => null,
    createConnection: (() => {
      const socket = new FakeSocket()
      queueMicrotask(() => {
        socket.emit('connect')
      })
      return socket as any
    }) as any,
    runWindowsHelperFallback: async () => {
      noResponseFallbackCalls += 1
      return true
    },
    socketResponseTimeoutMs: 20
  } as any)

  const noResponseResult = await Promise.race([
    noResponseHelper.send('tools', 'writeFileByRoot', 'C:\\FlyEnv\\slow.txt', 'x'),
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 200))
  ])
  assert.equal(noResponseResult, true)
  assert.equal(noResponseFallbackCalls, 1)

  console.log('windows helper send test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
