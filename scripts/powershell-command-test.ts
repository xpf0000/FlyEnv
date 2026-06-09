import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { encodePowerShellCommand, powerShellInlineArgs } from '../src/shared/PowerShellCommand'

const script = "[Console]::OutputEncoding = [Text.Encoding]::UTF8; Write-Output 'FlyEnv 环境同步'"
const encoded = encodePowerShellCommand(script)

assert.equal(Buffer.from(encoded, 'base64').toString('utf16le'), script)

const args = powerShellInlineArgs(script)
assert.ok(args.includes('-EncodedCommand'))
assert.ok(!args.includes('-File'))
assert.equal(args.at(-1), encoded)

if (process.platform === 'win32') {
  const execFilePromise = promisify(execFile)
  const res: any = await execFilePromise(
    'powershell.exe',
    powerShellInlineArgs("Write-Output 'FlyEnvInlineOk'"),
    {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10000
    }
  )
  assert.equal(`${res.stdout}`.trim(), 'FlyEnvInlineOk')
}

console.log('powershell command tests passed')
