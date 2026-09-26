import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as identity from '../src/shared/WindowsHelperIdentity'

async function main() {
  assert.equal(typeof identity.buildWindowsHelperInstallScript, 'function')
  const target = {
    account: 'MYCOMPANY\\rabdallah',
    sid: 'S-1-5-21-100-200-300-400',
    localAppData: "C:\\Users\\John Smith测试'$()\\AppData\\Local",
    ...identity.windowsHelperInstancePaths('S-1-5-21-100-200-300-400', 'C:\\ProgramData')
  }
  const config = {
    identity: target,
    executable: target.executable,
    sourceExecutable: 'C:\\Program Files\\FlyEnv\\helper\\flyenv-helper.exe',
    backupExecutable: 'C:\\Program Files\\FlyEnv\\helper\\flyenv-helper-backup.exe',
    dataPath: 'C:\\FlyEnv Data',
    helperVersion: 27
  }
  const script = identity.buildWindowsHelperInstallScript('#INSTALL_CONFIG#', config)
  const decoded = JSON.parse(Buffer.from(script, 'base64').toString('utf8'))
  assert.deepEqual(decoded, config)
  const good = {
    principal: 'S-1-5-18',
    logonType: 5,
    runLevel: 1,
    enabled: true,
    executable: config.executable,
    arguments: `--instance-id "${target.instanceId}" --expected-user-sid "${target.sid}"`,
    actionCount: 1,
    triggerSid: target.sid,
    triggerCount: 1,
    binaryMatches: true
  }
  assert.equal(identity.windowsHelperTaskInvalidReason(good, target, config.executable), undefined)
  for (const patch of [
    { principal: 'S-1-5-21-100-200-300-500' },
    { logonType: 3 },
    { executable: config.sourceExecutable },
    { arguments: '--key-path "admin-profile"' },
    { actionCount: 2 },
    { triggerSid: 'S-1-5-21-100-200-300-500' },
    { binaryMatches: false },
    { enabled: false }
  ]) {
    assert.ok(
      identity.windowsHelperTaskInvalidReason({ ...good, ...patch }, target, config.executable)
    )
  }
  assert.ok(identity.windowsHelperTaskInvalidReason(null, target, config.executable))
  // Execute the data transfer under a simulated different elevation environment.
  if (process.platform === 'win32') {
    const current = await identity.getWindowsHelperIdentity()
    assert.equal(current.localAppData, process.env.LOCALAPPDATA)
    assert.equal(current.keyPath, identity.windowsHelperInstancePaths(current.sid).keyPath)
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        'scripts/windows-helper-task-behavior-test.ps1'
      ],
      { windowsHide: true }
    )
    const ps = `$env:LOCALAPPDATA = 'C:\\Users\\adminuser.adm\\AppData\\Local'; $config = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${script}')) | ConvertFrom-Json; $config.identity | ConvertTo-Json -Compress`
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-EncodedCommand',
        Buffer.from('[Console]::OutputEncoding = [Text.Encoding]::UTF8; ' + ps, 'utf16le').toString(
          'base64'
        )
      ],
      { encoding: 'utf8', windowsHide: true }
    )
    assert.deepEqual(JSON.parse(out.trim()), target)
    const template = fs.readFileSync('static/sh/Windows/flyenv-auto-start-now.ps1', 'utf8')
    const built = identity.buildWindowsHelperInstallScript(template, config)
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'flyenv-helper-test-'))
    try {
      const file = path.join(temp, 'installer.ps1')
      fs.writeFileSync(file, '\ufeff' + built)
      const parse = `$tokens=$null; $errors=$null; [Management.Automation.Language.Parser]::ParseFile('${file.replace(/'/g, "''")}', [ref]$tokens, [ref]$errors) | Out-Null; if ($errors.Count) { throw ($errors | Out-String) }`
      execFileSync(
        'powershell.exe',
        ['-NoProfile', '-EncodedCommand', Buffer.from(parse, 'utf16le').toString('base64')],
        { windowsHide: true }
      )
    } finally {
      fs.rmSync(temp, { recursive: true, force: true })
    }
    const commandTemp = fs.mkdtempSync(path.join(os.tmpdir(), "flyenv helper '测试-"))
    const commandFile = path.join(commandTemp, 'failure.ps1')
    fs.writeFileSync(commandFile, 'exit 37')
    const command = identity.windowsHelperInstallerCommand(commandFile, commandTemp)
    const encoded = command.split('-EncodedCommand ')[1]
    const failure = spawnSync('powershell.exe', ['-NoProfile', '-EncodedCommand', encoded], {
      windowsHide: true
    })
    assert.equal(
      failure.status,
      37,
      'installer command must preserve the underlying failure exit code'
    )
    assert.equal(
      fs.existsSync(commandTemp),
      false,
      'installer command must clean its own temporary directory'
    )
  }
  console.log('windows-helper-cross-user-test: ok')
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
