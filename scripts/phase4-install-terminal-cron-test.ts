import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import {
  renderWindowsPipInstallScript,
  renderWindowsPythonInstallScript
} from '../src/fork/module/Python/index'
import { buildWindowsCronWrapperScript } from '../src/fork/module/Cron/WindowsSystemScheduler'
import { buildWindowsTerminalInlineScript } from '../src/shared/WindowsTerminal'
import { powerShellInlineArgs } from '../src/shared/PowerShellCommand'

const execFileAsync = promisify(execFile)

const pythonInstall = renderWindowsPythonInstallScript(
  'cd "#DARKDIR#"\n./dark.exe -x "#TMPL#" "#EXE#"\n$targetDir = "#APPDIR#"',
  {
    darkDir: 'C:\\FlyEnv\\cache\\dark',
    tmpDir: 'C:\\FlyEnv\\cache\\python tmp',
    exe: 'C:\\FlyEnv\\cache\\python.exe',
    appDir: 'C:\\FlyEnv\\app\\python'
  }
)
assert.ok(pythonInstall.includes('C:\\FlyEnv\\cache\\dark'))
assert.ok(pythonInstall.includes('C:\\FlyEnv\\cache\\python tmp'))
assert.ok(!pythonInstall.includes('#DARKDIR#'))
assert.ok(!pythonInstall.includes('#TMPL#'))
assert.ok(powerShellInlineArgs(pythonInstall).includes('-EncodedCommand'))
assert.ok(!powerShellInlineArgs(pythonInstall).includes('-File'))

const pipInstall = renderWindowsPipInstallScript('cd "#APPDIR#"\n./python.exe -m ensurepip', {
  appDir: 'C:\\FlyEnv\\app\\python'
})
assert.ok(pipInstall.includes('C:\\FlyEnv\\app\\python'))
assert.ok(!pipInstall.includes('#APPDIR#'))

const terminalScript = buildWindowsTerminalInlineScript("Write-Output 'FlyEnv terminal ok'")
assert.ok(terminalScript.includes('Start-Process'))
assert.ok(terminalScript.includes('-EncodedCommand'))
assert.ok(!/['"]-File['"]/.test(terminalScript))
assert.ok(!terminalScript.includes('exec-by-terminal.ps1'))
assert.ok(!terminalScript.includes('command-'))

const cronWrapper = buildWindowsCronWrapperScript({
  jobId: 'job-1',
  hostId: undefined,
  scope: 'global',
  command: 'echo FlyEnv Cron',
  workDir: 'C:\\FlyEnv Project',
  runDir: 'C:\\FlyEnv\\cron\\tmp',
  logFile: 'C:\\FlyEnv\\cron\\job-1.log',
  cmdExe: 'C:\\Windows\\System32\\cmd.exe',
  envPath: 'C:\\Windows\\System32'
})
assert.ok(cronWrapper.includes('$psi.FileName = $CmdExe'))
assert.ok(cronWrapper.includes("$psi.Arguments = '/d /c ' + $Command"))
assert.ok(!cronWrapper.includes('$CmdFile'))
assert.ok(!cronWrapper.includes('WriteAllText($CmdFile'))
assert.ok(!cronWrapper.includes('.cmd'))

const cronLockRoot = await mkdtemp(join(tmpdir(), 'flyenv-cron-lock-'))
const cronLockRunDir = join(cronLockRoot, 'tmp')
const cronLockLogFile = join(cronLockRoot, 'runs', 'job-lock.jsonl')
const cronLockScript = join(cronLockRoot, 'job-lock.ps1')
const cronLockDir = join(cronLockRunDir, 'job-lock.lock')
const utf8Output = 'FlyEnv 中文输出'
const utf8OutputBase64 = Buffer.from(utf8Output, 'utf-8').toString('base64')

try {
  await mkdir(cronLockDir, { recursive: true })
  const staleAt = new Date(Date.now() - 10 * 60 * 1000)
  await utimes(cronLockDir, staleAt, staleAt)
  await writeFile(
    cronLockScript,
    buildWindowsCronWrapperScript({
      jobId: 'job-lock',
      scope: 'global',
      command: `powershell -NoProfile -Command "[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); [Console]::Write([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${utf8OutputBase64}')))"`,
      workDir: cronLockRoot,
      runDir: cronLockRunDir,
      logFile: cronLockLogFile,
      cmdExe: join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe'),
      envPath: process.env.Path || process.env.PATH || ''
    })
  )

  const powerShell = join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  )
  const result = await execFileAsync(
    powerShell,
    ['-NoProfile', '-NonInteractive', '-File', cronLockScript],
    {
      encoding: 'utf-8',
      timeout: 15_000,
      windowsHide: true
    }
  )
  assert.equal(result.stderr, '')

  const records = (await readFile(cronLockLogFile, 'utf-8')).trim().split(/\r?\n/)
  assert.equal(records.length, 1)
  const record = JSON.parse(records[0])
  assert.equal(record.exitCode, 0)
  assert.equal(record.output, utf8Output)
} finally {
  await rm(cronLockRoot, { recursive: true, force: true })
}

console.log('phase4 install terminal cron tests passed')
