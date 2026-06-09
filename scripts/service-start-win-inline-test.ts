import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { powerShellInlineArgs } from '../src/shared/PowerShellCommand'
import {
  buildWindowsCmdServiceStartCommand,
  buildWindowsCustomerServiceStartScript,
  buildWindowsPowerShellServiceStartScript
} from '../src/fork/util/ServiceStart.win'

const base = {
  execEnv: '$env:FLYENV_TEST = "1"',
  cwd: 'C:\\FlyEnv Test\\service',
  bin: 'C:\\FlyEnv Test\\service\\bin\\server.exe',
  execArgs: '--config "C:\\FlyEnv Test\\conf\\server.conf"',
  outFile: 'C:\\FlyEnv Test\\logs\\out.log',
  errFile: 'C:\\FlyEnv Test\\logs\\err.log'
}

const psScript = buildWindowsPowerShellServiceStartScript(base)
assert.ok(psScript.includes('Start-Process'))
assert.ok(psScript.includes('-RedirectStandardOutput $OUTLOG'))
assert.ok(psScript.includes('-RedirectStandardError $ERRLOG'))
assert.ok(!psScript.includes('#BIN#'))
assert.ok(!psScript.includes('#ARGS#'))

const psArgs = powerShellInlineArgs(psScript)
assert.ok(psArgs.includes('-EncodedCommand'))
assert.ok(!psArgs.includes('-File'))

const cmdCommand = buildWindowsCmdServiceStartCommand({
  ...base,
  bin: 'server.exe'
})
assert.ok(cmdCommand.includes('chcp 65001>nul'))
assert.ok(cmdCommand.includes('cd /d "C:\\FlyEnv Test\\service"'))
assert.ok(cmdCommand.includes('start "" /B server.exe --config "C:\\FlyEnv Test\\conf\\server.conf"'))
assert.ok(!cmdCommand.includes('#BIN#'))
assert.ok(!cmdCommand.includes('#ARGS#'))

const customerCommandScript = buildWindowsCustomerServiceStartScript({
  env: '$env:PATH = "C:\\FlyEnv Test\\bin;" + $env:PATH',
  cwd: 'C:\\FlyEnv Test\\project',
  commandType: 'command',
  command: "Write-Output 'customer ok'",
  commandFile: '',
  outFile: 'C:\\FlyEnv Test\\logs\\customer-out.log',
  errFile: 'C:\\FlyEnv Test\\logs\\customer-err.log'
})
assert.ok(customerCommandScript.includes('-EncodedCommand'))
assert.ok(!customerCommandScript.includes("'-File'"))
assert.ok(!customerCommandScript.includes('.start.ps1'))

const customerFileScript = buildWindowsCustomerServiceStartScript({
  env: '',
  cwd: 'C:\\FlyEnv Test\\project',
  commandType: 'file',
  command: '',
  commandFile: 'C:\\FlyEnv Test\\project\\run.ps1',
  outFile: 'C:\\FlyEnv Test\\logs\\customer-file-out.log',
  errFile: 'C:\\FlyEnv Test\\logs\\customer-file-err.log'
})
assert.ok(customerFileScript.includes('-File'))
assert.ok(customerFileScript.includes('run.ps1'))

const execFilePromise = promisify(execFile)

async function waitForText(file: string, text: string): Promise<void> {
  let last = ''
  for (let i = 0; i < 30; i += 1) {
    try {
      last = await readFile(file, 'utf8')
      if (last.includes(text)) {
        return
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  assert.fail(`Expected ${file} to contain ${text}. Last content: ${last}`)
}

if (process.platform === 'win32') {
  const tempDir = await mkdtemp(join(tmpdir(), 'flyenv-service-inline-'))
  try {
    const psString = (text: string) => `'${text.replace(/'/g, "''")}'`
    const childScriptArgs = (script: string) =>
      powerShellInlineArgs(
        `[Console]::OutputEncoding = [Text.Encoding]::UTF8; ${script}`
      ).join(' ')
    const childOutputArgs = (text: string) => childScriptArgs(`Write-Output ${psString(text)}`)

    const psOut = join(tempDir, 'ps-out.log')
    const psErr = join(tempDir, 'ps-err.log')
    const actualPsScript = buildWindowsPowerShellServiceStartScript({
      execEnv: '',
      cwd: tempDir,
      bin: 'powershell.exe',
      execArgs: childOutputArgs('service-inline-ok'),
      outFile: psOut,
      errFile: psErr
    })
    const psRes: any = await execFilePromise('powershell.exe', powerShellInlineArgs(actualPsScript), {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10000
    })
    assert.ok(`${psRes.stdout}`.includes('FlyEnv-Process-ID'))
    await waitForText(psOut, 'service-inline-ok')

    const cmdOut = join(tempDir, 'cmd-out.log')
    const cmdErr = join(tempDir, 'cmd-err.log')
    const cmdMarker = join(tempDir, 'cmd-marker.txt')
    const cmdCommand = buildWindowsCmdServiceStartCommand({
      execEnv: '',
      cwd: tempDir,
      bin: 'powershell.exe',
      execArgs: childScriptArgs(
        `[IO.File]::WriteAllText(${psString(cmdMarker)}, ${psString('cmd-inline-ok')}, [Text.Encoding]::UTF8)`
      ),
      outFile: cmdOut,
      errFile: cmdErr
    })
    await execFilePromise('cmd.exe', ['/d', '/s', '/c', cmdCommand], {
      encoding: 'utf8',
      windowsHide: true,
      windowsVerbatimArguments: true,
      timeout: 10000
    })
    await waitForText(cmdMarker, 'cmd-inline-ok')

    const customerOut = join(tempDir, 'customer-out.log')
    const customerErr = join(tempDir, 'customer-err.log')
    const actualCustomerScript = buildWindowsCustomerServiceStartScript({
      env: '',
      cwd: tempDir,
      commandType: 'command',
      command: "[Console]::OutputEncoding = [Text.Encoding]::UTF8; Write-Output 'customer-inline-ok'",
      commandFile: '',
      outFile: customerOut,
      errFile: customerErr
    })
    const customerRes: any = await execFilePromise(
      'powershell.exe',
      powerShellInlineArgs(actualCustomerScript),
      {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 10000
      }
    )
    assert.ok(`${customerRes.stdout}`.includes('FlyEnv-Process-ID'))
    await waitForText(customerOut, 'customer-inline-ok')
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

console.log('service-start-win inline tests passed')
