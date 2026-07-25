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

  let missingFallbacks = 0
  let missingReason = ''
  const missingBinaryHelper = createHelper({
    isWindows: () => true,
    getWindowsElevationMethod: () => 'helper',
    appHelperCheck: async () => {
      throw new AppHelperError('helper_binary_missing', 'missing')
    },
    runWindowsHelperFallback: async () => {
      missingFallbacks += 1
      return true
    },
    notifyWindowsElevationFallback: (reason) => {
      missingReason = reason
    }
  })

  assert.equal(
    await missingBinaryHelper.send('tools', 'writeFileByRoot', 'C:\\FlyEnv\\test.txt', 'content'),
    true
  )
  assert.equal(missingFallbacks, 1)
  assert.equal(missingReason, 'helper_binary_missing')

  await assert.rejects(
    missingBinaryHelper.send('tools', 'readFileByRoot', 'C:\\FlyEnv\\test.txt'),
    (error: any) => {
      assert.equal(error?.code, 'helper_binary_missing')
      return true
    }
  )
  assert.equal(missingFallbacks, 1)

  let uacChecks = 0
  let uacFallbacks = 0
  const uacHelper = createHelper({
    isWindows: () => true,
    getWindowsElevationMethod: () => 'uac',
    appHelperCheck: async () => {
      uacChecks += 1
      return true
    },
    runWindowsHelperFallback: async () => {
      uacFallbacks += 1
      return true
    }
  })

  assert.equal(
    await uacHelper.send('tools', 'setSystemEnv', 'FLYENV_ALIAS', 'C:\\FlyEnv\\alias'),
    true
  )
  assert.equal(uacChecks, 0)
  assert.equal(uacFallbacks, 1)

  await assert.rejects(
    uacHelper.send('tools', 'readFileByRoot', 'C:\\FlyEnv\\private.txt'),
    (error: any) => error?.code === 'windows_fallback_not_supported'
  )

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
    }
  } as any)

  const noResponseResult = await Promise.race([
    noResponseHelper.send('tools', 'writeFileByRoot', 'C:\\FlyEnv\\slow.txt', 'x'),
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 2500))
  ])
  assert.equal(noResponseResult, 'timeout')
  assert.equal(noResponseFallbackCalls, 0)

  console.log('windows helper send test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
