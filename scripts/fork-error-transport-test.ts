import assert from 'node:assert/strict'
import { ProcessSendError } from '../src/fork/Fn'
import {
  AppHelperError,
  appHelperErrorFromIPC,
  isAppHelperError
} from '../src/shared/WindowsHelperState'

const originalSend = process.send
let sent: any

try {
  process.send = ((message: any) => {
    sent = message
    return true
  }) as typeof process.send

  ProcessSendError(
    'helper-install',
    new AppHelperError('helper_pipe_unreachable', 'connect ENOENT \\\\.\\pipe\\flyenv-helper_sock')
  )

  assert.equal(sent?.info?.code, 1)
  assert.equal(sent?.info?.errorCode, 'helper_pipe_unreachable')
  const error = appHelperErrorFromIPC(sent?.info)
  assert.equal(isAppHelperError(error, 'helper_pipe_unreachable'), true)
} finally {
  process.send = originalSend
}

console.log('fork error transport test passed')
