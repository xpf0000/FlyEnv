import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createHelper } from '../src/fork/Helper'
import { AppHelperError } from '../src/shared/WindowsHelperState'

class FakeSocket extends EventEmitter {
  destroyed = false
  private readonly writeHook?: (chunk: string | Uint8Array) => void

  constructor(writeHook?: (chunk: string | Uint8Array) => void) {
    super()
    this.writeHook = writeHook
  }

  write(_chunk: string | Uint8Array, callback?: (error?: Error | null) => void) {
    this.writeHook?.(_chunk)
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
  let missingPrompts = 0
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
  missingBinaryHelper.appHelper = {
    needInstall() {
      missingPrompts += 1
    }
  } as any

  assert.equal(
    await missingBinaryHelper.send('tools', 'writeFileByRoot', 'C:\\FlyEnv\\test.txt', 'content'),
    true
  )
  assert.equal(missingFallbacks, 1)
  assert.equal(missingReason, '')
  assert.equal(missingPrompts, 0)

  assert.equal(
    await missingBinaryHelper.send('tools', 'installFlyEnvPowerShellIntegration', {
      scriptPath: 'C:\\FlyEnv\\bin\\flyenv.ps1',
      scriptBase64: 'VwByAGkAdABlAC0ATwB1AHQAcAB1AHQA',
      profiles: [
        {
          edition: 'pwsh',
          path: 'C:\\Users\\FlyEnv\\Documents\\PowerShell\\Profile.ps1'
        }
      ]
    }),
    true
  )
  assert.equal(missingFallbacks, 2)
  assert.equal(missingReason, '')
  assert.equal(missingPrompts, 0)

  assert.equal(
    await missingBinaryHelper.send(
      'tools',
      'ensureFlyEnvDataDirectory',
      'C:\\Program Files\\FlyEnv-Data'
    ),
    true
  )
  assert.equal(missingFallbacks, 3)
  assert.equal(missingReason, '')
  assert.equal(missingPrompts, 0)

  await assert.rejects(
    missingBinaryHelper.send('tools', 'readFileByRoot', 'C:\\FlyEnv\\test.txt'),
    (error: any) => {
      assert.equal(error?.code, 'helper_binary_missing')
      assert.match(error?.message ?? '', /missing/i)
      return true
    }
  )
  assert.equal(missingFallbacks, 3)
  assert.equal(missingPrompts, 0)

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

  let preferredHelperChecks = 0
  let preferredHelperFallbacks = 0
  const preferredHelper = createHelper({
    isWindows: () => true,
    getWindowsElevationMethod: () => 'uac',
    appHelperCheck: async () => {
      preferredHelperChecks += 1
      return true
    },
    getHelperKey: async () => null,
    createConnection: (() => {
      const socket = new FakeSocket((chunk) => {
        const request = JSON.parse(Buffer.from(chunk).toString())
        queueMicrotask(() => {
          socket.emit(
            'data',
            Buffer.from(
              JSON.stringify({
                key: request.key,
                code: 0,
                data:
                  request.function === 'ensureFlyEnvDataDirectory'
                    ? true
                    : { scriptState: 'unchanged', profiles: [] }
              })
            )
          )
          socket.emit('end')
        })
      })
      queueMicrotask(() => socket.emit('connect'))
      return socket as any
    }) as any,
    runWindowsHelperFallback: async () => {
      preferredHelperFallbacks += 1
      return true
    }
  })
  assert.deepEqual(
    await preferredHelper.send('tools', 'installFlyEnvPowerShellIntegration', {
      scriptPath: 'C:\\FlyEnv\\bin\\flyenv.ps1',
      scriptBase64: 'VwByAGkAdABlAC0ATwB1AHQAcAB1AHQA',
      profiles: []
    }),
    { scriptState: 'unchanged', profiles: [] }
  )
  assert.equal(preferredHelperChecks, 1)
  assert.equal(preferredHelperFallbacks, 0)
  assert.equal(
    await preferredHelper.send(
      'tools',
      'ensureFlyEnvDataDirectory',
      'C:\\Program Files\\FlyEnv-Data'
    ),
    true,
    'data-directory recovery must prefer a running Helper even after an earlier UAC fallback'
  )
  assert.equal(preferredHelperFallbacks, 0)

  let deletedHelperConnections = 0
  let deletedHelperChecks = 0
  let deletedHelperFallbacks = 0
  const deletedHelper = createHelper({
    isWindows: () => true,
    getWindowsElevationMethod: () => 'helper',
    helperBinaryExists: () => false,
    appHelperCheck: async () => {
      deletedHelperChecks += 1
      throw new AppHelperError('helper_binary_missing', 'helper was removed')
    },
    runWindowsHelperFallback: async () => {
      deletedHelperFallbacks += 1
      return true
    },
    createConnection: (() => {
      deletedHelperConnections += 1
      throw new Error('must not connect after helper binary removal')
    }) as any
  } as any)
  deletedHelper.enable = true
  assert.equal(
    await deletedHelper.send('tools', 'setSystemEnv', 'FLYENV_ALIAS', 'C:\\FlyEnv\\alias'),
    true
  )
  assert.equal(deletedHelperChecks, 1)
  assert.equal(deletedHelperFallbacks, 1)
  assert.equal(deletedHelperConnections, 0)

  let rawPathFallbackArgs: unknown[] | undefined
  const rawPathUacHelper = createHelper({
    isWindows: () => true,
    getWindowsElevationMethod: () => 'uac',
    runWindowsHelperFallback: async (_module, _fn, args) => {
      rawPathFallbackArgs = args
      return true
    }
  })
  const rawPathEntries = ['%INTEL_DEV_REDIST%redist\\intel64\\compiler', '..\\relative', '']
  assert.equal(
    await rawPathUacHelper.send('tools', 'setSystemPath', rawPathEntries, {}, 'C:\\SDK\\bin;'),
    true
  )
  assert.deepEqual(rawPathFallbackArgs, [rawPathEntries, {}, 'C:\\SDK\\bin;'])

  const rawExpectedPath = 'C:\\FlyEnv\\..\\old;relative\\bin;'
  assert.equal(
    await rawPathUacHelper.send('tools', 'setSystemPath', ['C:\\FlyEnv\\bin'], {}, rawExpectedPath),
    true
  )
  assert.deepEqual(rawPathFallbackArgs, [['C:\\FlyEnv\\bin'], {}, rawExpectedPath])

  await assert.rejects(
    rawPathUacHelper.send('tools', 'writeFileByRoot', 'C:\\FlyEnv\\..\\outside.txt', 'x'),
    /Path traversal detected/
  )

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

  await assert.rejects(
    unavailableHelper.send('tools', 'installFlyEnvPowerShellIntegration', {
      scriptPath: 'C:\\FlyEnv\\bin\\flyenv.ps1',
      scriptBase64: 'VwByAGkAdABlAC0ATwB1AHQAcAB1AHQA',
      profiles: [
        {
          edition: 'pwsh',
          path: 'C:\\Users\\FlyEnv\\Documents\\PowerShell\\Profile.ps1'
        }
      ]
    }),
    (error: any) => {
      assert.equal(error?.code, 'helper_unreachable')
      return true
    }
  )
  assert.equal(unavailablePromptCalls, 2)
  assert.equal(unavailableFallbackCalls, 0)

  let socketFallbackCalls = 0
  let socketPromptCalls = 0
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
  socketFallbackHelper.appHelper = {
    needInstall() {
      socketPromptCalls += 1
    }
  } as any

  await assert.rejects(
    socketFallbackHelper.send('tools', 'setSystemEnv', 'FLYENV_ALIAS', 'C:\\FlyEnv\\alias'),
    (error: any) => error?.code === 'helper_pipe_unreachable'
  )
  assert.equal(socketFallbackCalls, 0)
  assert.equal(socketPromptCalls, 1)

  let noResponseFallbackCalls = 0
  let noResponsePromptCalls = 0
  const noResponseHelper = createHelper({
    isWindows: () => true,
    appHelperCheck: async () => true,
    getHelperKey: async () => null,
    helperRequestTimeoutMs: 25,
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
  noResponseHelper.appHelper = {
    needInstall() {
      noResponsePromptCalls += 1
    }
  } as any

  const noResponseResult = await Promise.race([
    noResponseHelper.send('tools', 'writeFileByRoot', 'C:\\FlyEnv\\slow.txt', 'x').then(
      () => 'resolved',
      (error) => error
    ),
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 2500))
  ])
  assert.equal((noResponseResult as any)?.code, 'helper_pipe_unreachable')
  assert.equal(noResponsePromptCalls, 1)
  assert.equal(noResponseFallbackCalls, 0)

  let helperBusinessFailureFallbackCalls = 0
  const helperBusinessFailure = createHelper({
    isWindows: () => true,
    appHelperCheck: async () => true,
    getHelperKey: async () => null,
    createConnection: (() => {
      const socket = new FakeSocket((chunk) => {
        const request = JSON.parse(Buffer.from(chunk).toString())
        queueMicrotask(() => {
          socket.emit(
            'data',
            Buffer.from(JSON.stringify({ key: request.key, code: 1, msg: 'business denied' }))
          )
          socket.emit('end')
        })
      })
      queueMicrotask(() => {
        socket.emit('connect')
      })
      return socket as any
    }) as any,
    runWindowsHelperFallback: async () => {
      helperBusinessFailureFallbackCalls += 1
      return true
    }
  })

  await assert.rejects(
    helperBusinessFailure.send('tools', 'writeFileByRoot', 'C:\\FlyEnv\\denied.txt', 'x'),
    (error: any) => {
      assert.equal(error?.code, 'helper_execution_failed')
      assert.equal(error?.message, 'business denied')
      return true
    }
  )
  assert.equal(helperBusinessFailureFallbackCalls, 0)

  let helperBusinessFailurePromptCalls = 0
  helperBusinessFailure.appHelper = {
    needInstall() {
      helperBusinessFailurePromptCalls += 1
    }
  } as any
  await assert.rejects(
    helperBusinessFailure.send('tools', 'installFlyEnvPowerShellIntegration', {
      scriptPath: 'C:\\FlyEnv\\bin\\flyenv.ps1',
      scriptBase64: 'VwByAGkAdABlAC0ATwB1AHQAcAB1AHQA',
      profiles: [
        {
          edition: 'pwsh',
          path: 'C:\\Users\\FlyEnv\\Documents\\PowerShell\\Profile.ps1'
        }
      ]
    }),
    (error: any) => error?.code === 'helper_execution_failed'
  )
  assert.equal(helperBusinessFailureFallbackCalls, 0)
  assert.equal(helperBusinessFailurePromptCalls, 0)

  let signatureFailurePrompts = 0
  const signatureFailureHelper = createHelper({
    isWindows: () => true,
    appHelperCheck: async () => true,
    getHelperKey: async () => Buffer.alloc(32, 1),
    createConnection: (() => {
      const socket = new FakeSocket((chunk) => {
        const request = JSON.parse(Buffer.from(chunk).toString())
        queueMicrotask(() => {
          socket.emit(
            'data',
            Buffer.from(JSON.stringify({ key: request.key, code: 1, msg: 'invalid signature' }))
          )
          socket.emit('end')
        })
      })
      queueMicrotask(() => socket.emit('connect'))
      return socket as any
    }) as any
  })
  signatureFailureHelper.appHelper = {
    needInstall() {
      signatureFailurePrompts += 1
    }
  } as any
  await assert.rejects(
    signatureFailureHelper.send(
      'tools',
      'ensureFlyEnvDataDirectory',
      'C:\\Program Files\\FlyEnv-Data'
    ),
    (error: any) => error?.code === 'helper_signature_invalid'
  )
  assert.equal(
    signatureFailurePrompts,
    0,
    'a persistent signature mismatch must remain a direct Helper error instead of opening installation'
  )

  let staleKeyChecks = 0
  let staleKeyReads = 0
  let staleKeyConnections = 0
  const staleKeyHelper = createHelper({
    isWindows: () => true,
    getWindowsElevationMethod: () => 'helper',
    appHelperCheck: async () => {
      staleKeyChecks += 1
      return true
    },
    getHelperKey: async () => {
      staleKeyReads += 1
      return Buffer.alloc(32, staleKeyReads === 1 ? 1 : 2)
    },
    createConnection: (() => {
      staleKeyConnections += 1
      const connectionNumber = staleKeyConnections
      const socket = new FakeSocket((chunk) => {
        const request = JSON.parse(Buffer.from(chunk).toString())
        queueMicrotask(() => {
          socket.emit(
            'data',
            Buffer.from(
              JSON.stringify(
                connectionNumber === 2
                  ? { key: request.key, code: 1, msg: 'invalid signature' }
                  : { key: request.key, code: 0, data: true }
              )
            )
          )
          socket.emit('end')
        })
      })
      queueMicrotask(() => socket.emit('connect'))
      return socket as any
    }) as any
  })

  assert.equal(
    await staleKeyHelper.send('tools', 'writeFileByRoot', 'C:\\FlyEnv\\stale.txt', 'first'),
    true
  )
  assert.equal(
    await staleKeyHelper.send('tools', 'writeFileByRoot', 'C:\\FlyEnv\\stale.txt', 'second'),
    true
  )
  assert.equal(staleKeyChecks, 2)
  assert.equal(staleKeyReads, 2)
  assert.equal(staleKeyConnections, 3)

  console.log('windows helper send test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
