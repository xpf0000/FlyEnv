import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import {
  AppHelperCheck,
  HelperVersion,
  createAppHelperChecker,
  getWindowsHelperBinaryPath,
  windowsHelperBinaryExists
} from '../src/shared/AppHelperCheck'
import { isAppHelperError } from '../src/shared/WindowsHelperState'

class FakeSocket extends EventEmitter {
  destroyed = false
  private readonly writeHook?: (payload: string) => void

  constructor(writeHook?: (payload: string) => void) {
    super()
    this.writeHook = writeHook
  }

  write(chunk: string | Uint8Array, callback?: (error?: Error | null) => void) {
    const payload = Buffer.isBuffer(chunk) ? chunk.toString() : `${chunk}`
    this.writeHook?.(payload)
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
  assert.equal(typeof AppHelperCheck, 'function')
  assert.equal(typeof createAppHelperChecker, 'function')
  assert.equal(typeof getWindowsHelperBinaryPath, 'function')
  assert.equal(typeof windowsHelperBinaryExists, 'function')

  let createConnectionCalled = false
  const missingBinaryCheck = createAppHelperChecker({
    isWindows: () => true,
    helperBinaryExists: () => false,
    createConnection: (() => {
      createConnectionCalled = true
      return new FakeSocket() as any
    }) as any,
    getHelperKey: async () => null
  })

  await assert.rejects(missingBinaryCheck(), (error: unknown) => {
    assert.equal(isAppHelperError(error, 'helper_binary_missing'), true)
    return true
  })
  assert.equal(createConnectionCalled, false)

  const healthyCheck = createAppHelperChecker({
    isWindows: () => true,
    helperBinaryExists: () => true,
    createConnection: (() => {
      const socket = new FakeSocket((payload) => {
        const request = JSON.parse(payload)
        queueMicrotask(() => {
          socket.emit(
            'data',
            Buffer.from(
              JSON.stringify({
                key: request.key,
                code: 0,
                data: HelperVersion
              })
            )
          )
        })
      })
      queueMicrotask(() => {
        socket.emit('connect')
      })
      return socket as any
    }) as any,
    getHelperKey: async () => null
  })

  await assert.doesNotReject(healthyCheck())

  const mismatchCheck = createAppHelperChecker({
    isWindows: () => true,
    helperBinaryExists: () => true,
    createConnection: (() => {
      const socket = new FakeSocket((payload) => {
        const request = JSON.parse(payload)
        queueMicrotask(() => {
          socket.emit(
            'data',
            Buffer.from(
              JSON.stringify({
                key: request.key,
                code: 0,
                data: HelperVersion - 1
              })
            )
          )
        })
      })
      queueMicrotask(() => {
        socket.emit('connect')
      })
      return socket as any
    }) as any,
    getHelperKey: async () => null
  })

  await assert.rejects(mismatchCheck(), (error: unknown) => {
    assert.equal(isAppHelperError(error, 'helper_version_mismatch'), true)
    return true
  })

  const unreachableCheck = createAppHelperChecker({
    isWindows: () => true,
    helperBinaryExists: () => true,
    createConnection: (() => {
      const socket = new FakeSocket()
      queueMicrotask(() => {
        socket.emit('error', new Error('connect failed'))
      })
      return socket as any
    }) as any,
    getHelperKey: async () => null
  })

  await assert.rejects(unreachableCheck(), (error: unknown) => {
    assert.equal(isAppHelperError(error, 'helper_unreachable'), true)
    return true
  })

  console.log('windows helper check test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
