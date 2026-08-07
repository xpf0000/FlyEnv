import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import Helper from '../src/fork/Helper'
import { AppHelperError } from '../src/shared/WindowsHelperState'
import { ProcessKillStrict } from '../src/shared/Process'
import { waitTime } from '../src/shared/utils'

const testGlobal = global as typeof globalThis & {
  Server?: { WindowsElevationMethod?: string }
}
const previousServer = testGlobal.Server
testGlobal.Server = { ...previousServer, WindowsElevationMethod: 'uac' }
const previousHelperEnabled = Helper.enable
const previousHelperSend = Helper.send
Helper.enable = true
;(Helper as any).send = async () => {
  throw new AppHelperError(
    'windows_fallback_not_supported',
    'Windows UAC does not support tools/kill'
  )
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
  stdio: 'ignore',
  windowsHide: true
})

await new Promise<void>((resolve, reject) => {
  child.once('spawn', resolve)
  child.once('error', reject)
})

const pid = child.pid
assert.ok(pid, 'test child process PID must be available')

try {
  await ProcessKillStrict('-INT', [`${pid}`])
  for (let attempt = 0; attempt < 20 && isAlive(pid); attempt += 1) {
    await waitTime(100)
  }
  assert.equal(isAlive(pid), false, 'ProcessKillStrict must terminate a same-user Windows process')
} finally {
  if (isAlive(pid)) {
    child.kill('SIGKILL')
  }
  Helper.enable = previousHelperEnabled
  ;(Helper as any).send = previousHelperSend
  testGlobal.Server = previousServer
}

console.log('Process kill fallback test passed')
