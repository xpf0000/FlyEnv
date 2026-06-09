import assert from 'node:assert/strict'

import {
  renderWindowsPipInstallScript,
  renderWindowsPythonInstallScript
} from '../src/fork/module/Python/index'
import { buildWindowsCronWrapperScript } from '../src/fork/module/Cron/WindowsSystemScheduler'
import { buildWindowsTerminalInlineScript } from '../src/shared/WindowsTerminal'
import { powerShellInlineArgs } from '../src/shared/PowerShellCommand'

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
assert.ok(cronWrapper.includes("$psi.Arguments = '/d /s /c ' + $Command"))
assert.ok(!cronWrapper.includes('$CmdFile'))
assert.ok(!cronWrapper.includes('WriteAllText($CmdFile'))
assert.ok(!cronWrapper.includes('.cmd'))

console.log('phase4 install terminal cron tests passed')
