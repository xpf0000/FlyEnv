import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import {
  AppHelperCheck,
  HelperVersion,
  createAppHelperChecker,
  getWindowsHelperBinaryPath,
  helperSignatureArgsJSON,
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
  assert.equal(
    helperSignatureArgsJSON([
      {
        scriptPath: 'C:\\FlyEnv\\bin\\flyenv.ps1',
        scriptBase64: 'abc',
        profiles: [{ path: 'C:\\Users\\FlyEnv\\Profile.ps1', edition: 'pwsh' }]
      }
    ]),
    '[{"profiles":[{"edition":"pwsh","path":"C:\\\\Users\\\\FlyEnv\\\\Profile.ps1"}],"scriptBase64":"abc","scriptPath":"C:\\\\FlyEnv\\\\bin\\\\flyenv.ps1"}]'
  )

  let createConnectionCalled = false
  const missingBinaryCheck = createAppHelperChecker({
    isWindows: () => true,
    helperBinaryExists: () => false,
    createConnection: (() => {
      createConnectionCalled = true
      return new FakeSocket() as any
    }) as any,
    getHelperKey: async () => Buffer.alloc(32)
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
          const data =
            request.function === 'health'
              ? { version: HelperVersion, pid: 1234, sid: 'S-1-5-21-1234' }
              : HelperVersion
          socket.emit(
            'data',
            Buffer.from(
              JSON.stringify({
                key: request.key,
                code: 0,
                data
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
    getHelperKey: async () => Buffer.alloc(32)
  })

  const healthyResult = await healthyCheck()
  assert.notEqual(healthyResult, true)
  if (healthyResult === true) {
    throw new Error('Windows health check must return PID health data')
  }
  assert.equal(healthyResult.pid, 1234)

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
    getHelperKey: async () => Buffer.alloc(32)
  })

  await assert.rejects(mismatchCheck(), (error: unknown) => {
    assert.equal(isAppHelperError(error, 'helper_version_mismatch'), true)
    return true
  })

  const signatureRejectedCheck = createAppHelperChecker({
    isWindows: () => true,
    helperBinaryExists: () => true,
    createConnection: (() => {
      const socket = new FakeSocket((payload) => {
        const request = JSON.parse(payload)
        queueMicrotask(() => {
          socket.emit(
            'data',
            Buffer.from(JSON.stringify({ key: request.key, code: 1, msg: 'invalid signature' }))
          )
        })
      })
      queueMicrotask(() => {
        socket.emit('connect')
      })
      return socket as any
    }) as any,
    getHelperKey: async () => Buffer.alloc(32)
  })

  await assert.rejects(signatureRejectedCheck(), (error: unknown) => {
    assert.equal(isAppHelperError(error, 'helper_signature_invalid'), true)
    return true
  })

  const invalidKeyCheck = createAppHelperChecker({
    isWindows: () => true,
    helperBinaryExists: () => true,
    createConnection: (() => {
      throw new Error('the checker must reject an invalid key before opening the pipe')
    }) as any,
    getHelperKey: async () => Buffer.alloc(31)
  })

  await assert.rejects(invalidKeyCheck(), (error: unknown) => {
    assert.equal(isAppHelperError(error, 'helper_key_invalid'), true)
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
    getHelperKey: async () => Buffer.alloc(32)
  })

  await assert.rejects(unreachableCheck(), (error: unknown) => {
    assert.equal(isAppHelperError(error, 'helper_pipe_unreachable'), true)
    return true
  })

  console.log('windows helper check test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
