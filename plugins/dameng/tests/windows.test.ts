import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { spawn } from 'node:child_process'
import {
  assertWindowsIdentity,
  windowsServiceBody,
  windowsInstallBody,
  windowsUninstallBody,
  windowsRegistrationBody,
  spawnWindowsCommand,
  windowsElevationScript,
  encodeWindowsScript,
  windowsOperationError
} from '../fork/windows'

const root = 'C:\\FlyEnv\\app\\dameng\\DM8WIN'
const ini = 'C:\\FlyEnv\\server\\dameng\\DM8WIN\\DAMENG\\dm.ini'
const service = 'DmServiceFLYENVDM8WIN'

test('Windows selectors reject external service names and noncanonical config paths', () => {
  assert.doesNotThrow(() => assertWindowsIdentity(root, ini, service))
  for (const name of ['DmServiceEXTERNAL', 'DmServiceFLYENV', service + ';bad']) {
    assert.throws(() => assertWindowsIdentity(root, ini, name))
  }
  for (const value of [
    'C:\\other\\bad.ini',
    'C:\\other\\..\\dm.ini',
    '\\\\host\\share\\dm.ini',
    'C:\\dm.ini:other'
  ]) {
    assert.throws(() => assertWindowsIdentity(root, value, service))
  }
})

test('stop rejects absent PID and script binds exact SCM executable/config before normal control', () => {
  for (const pid of ['', '0', '-1', '12;Stop-Service x']) {
    assert.throws(() => windowsServiceBody(root, ini, service, 'stop', pid))
  }
  const stop = windowsServiceBody(root, ini, service, 'stop', '123')
  assert.match(stop, /Get-OwnedDmService/)
  assert.match(stop, /ProcessId -ne 123/)
  assert.match(stop.slice(stop.lastIndexOf('\n$root=')), /Stop-DmOwnedService/)
  assert.doesNotMatch(stop, /taskkill|Stop-Process|\.Kill\(/)
  assert.match(windowsServiceBody(root, ini, service, 'start'), /already running outside FlyEnv/)
})

test('installer confines mount and install to one elevation and preserves required vs cleanup outcomes', () => {
  const body = windowsInstallBody(
    'C:\\FlyEnv\\cache\\official.iso',
    root,
    '<DATABASE><INIT_DB>N</INIT_DB></DATABASE>'
  )
  assert.match(body, /Mount-DiskImage/)
  assert.match(body, /Dismount-DiskImage/)
  assert.match(body, /setup\.bat/)
  assert.match(body, /installed=\$true/)
  assert.match(body, /warning/)
  assert.match(body, /Assert-NoExternalDm/)
  assert.match(body, /INIT_DB/)
  assert.doesNotMatch(body, /Remove-Item.+Recurse/)
})

test('registration uses exact dmsvc database selector and grants caller SID without changing account', () => {
  const body = windowsRegistrationBody(root, ini, service)
  assert.match(body, /dmsvc\.exe/)
  assert.match(body, /database FLYENVDM8WIN/)
  assert.match(body, /Manual/)
  assert.match(body, /Grant-DmServiceAccess/)
  assert.match(body, /Grant-DmDirectoryAccess/)
  assert.doesNotMatch(body, /ServiceAccount|Credential|Password/)
})

test('uninstall validates unchanged global proof and refuses running/foreign services', () => {
  const body = windowsUninstallBody(root)
  assert.match(body, /Assert-DmGlobalProof/)
  assert.match(body, /State -ne 'Stopped'/)
  assert.match(body, /uninstall\.exe/)
  assert.doesNotMatch(
    body.slice(body.lastIndexOf('\n$root=')),
    /taskkill|Stop-Service|Remove-Item.+Recurse/
  )
})

test('elevation captures initiating SID before runas and waits asynchronously for exact result transport', () => {
  const script = windowsElevationScript(
    '$result.installed=$true',
    'C:\\temp\\result.json',
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
  )
  assert.match(script, /WindowsIdentity\]::GetCurrent/)
  assert.match(script, /-Verb RunAs/)
  assert.match(script, /WaitForExit\(500\)/)
  assert.match(script, /WriteAllText/)
  assert.match(script, /GZipStream/)
})

test('command transport keeps stdout independent from successful stderr diagnostics', async () => {
  const fakeSpawn = (() => {
    const child = new EventEmitter() as any
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => true
    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from('{"state":"Stopped"}'))
      child.stderr.emit('data', Buffer.from('#< CLIXML diagnostics'))
      child.emit('close', 0, null)
    })
    return child
  }) as typeof spawn
  assert.equal(await spawnWindowsCommand('powershell', [], 1000, fakeSpawn), '{"state":"Stopped"}')
})

test('all generated privileged scripts parse in native PowerShell when available', async (t) => {
  const { existsSync } = await import('node:fs')
  const { spawnSync } = await import('node:child_process')
  const shell = '/tmp/flyenv-powershell-test/pwsh'
  if (!existsSync(shell)) return t.skip('optional PowerShell parser unavailable')
  const scripts = [
    windowsServiceBody(root, ini, service, 'start'),
    windowsServiceBody(root, ini, service, 'stop', '123'),
    windowsRegistrationBody(root, ini, service),
    windowsInstallBody('C:\\FlyEnv\\cache\\official.iso', root, '<DATABASE/>'),
    windowsUninstallBody(root),
    windowsElevationScript('Write-Output "test"', 'C:\\temp\\result.json', 'C:\\powershell.exe')
  ]
  for (const script of scripts) {
    const parser = `$s=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(script).toString('base64')}')); $tokens=$null; $errors=$null; $null=[Management.Automation.Language.Parser]::ParseInput($s,[ref]$tokens,[ref]$errors); if ($errors.Count) { $errors | ForEach-Object { Write-Error $_ }; exit 1 }`
    const result = spawnSync(shell, ['-NoProfile', '-NonInteractive', '-Command', parser], {
      encoding: 'utf8'
    })
    assert.equal(
      result.status,
      0,
      JSON.stringify({ stdout: result.stdout, stderr: result.stderr, error: result.error })
    )
  }
})

test('real PowerShell lifecycle guards refuse external running service and replaced owned PID', async (t) => {
  const { existsSync } = await import('node:fs')
  const { spawnSync } = await import('node:child_process')
  const shell = '/tmp/flyenv-powershell-test/pwsh'
  if (!existsSync(shell)) return t.skip('optional PowerShell unavailable')
  const mock = `
$global:controlCalls=0; $global:current=[pscustomobject]@{State='Running';ProcessId=456}
function Get-OwnedDmService { return $global:current }
function Start-Service { $global:controlCalls++ }
function Stop-DmOwnedService { $global:controlCalls++ }
`
  for (const [action, pid] of [
    ['start', ''],
    ['stop', '123']
  ] as const) {
    const body = windowsServiceBody(root, ini, service, action, pid).replace(
      '\n$root=',
      `${mock}\n$root=`
    )
    const script = `$ErrorActionPreference='Stop'; $result=@{}; try { ${body}; throw 'guard did not reject' } catch { if ($_.Exception.Message -notmatch 'outside FlyEnv|PID changed') { throw }; if ($global:controlCalls -ne 0) { throw 'external service was controlled' } }; exit 0`
    const result = spawnSync(
      shell,
      [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64')
      ],
      { encoding: 'utf8' }
    )
    assert.equal(
      result.status,
      0,
      JSON.stringify({ stdout: result.stdout, stderr: result.stderr, error: result.error })
    )
  }
})

test('compressed initial native transport executes large Unicode payload without truncation', async (t) => {
  const { existsSync } = await import('node:fs')
  const { spawnSync } = await import('node:child_process')
  const shell = '/tmp/flyenv-powershell-test/pwsh'
  if (!existsSync(shell)) return t.skip('optional PowerShell unavailable')
  const text = '达梦安装参数'.repeat(10000)
  const encoded = encodeWindowsScript(`[Console]::Write('${text}')`)
  assert.ok(encoded.length < 30000)
  const result = spawnSync(shell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    encoding: 'utf8'
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, text)
})

test('real PowerShell companion handoff continues after one helper fails and skips unverified names', async (t) => {
  const { existsSync } = await import('node:fs')
  const { spawnSync } = await import('node:child_process')
  const { windowsFunctions } = await import('../fork/windows')
  const shell = '/tmp/flyenv-powershell-test/pwsh'
  if (!existsSync(shell)) return t.skip('optional PowerShell unavailable')
  const script = `${windowsFunctions}
$ErrorActionPreference='Stop'; $global:configured=@()
$global:services=@(
  [pscustomobject]@{Name='DmAPService';PathName='"/owned/bin/dmsvc.exe" dmap';State='Stopped';ProcessId=0},
  [pscustomobject]@{Name='DmAuditMonitorService';PathName='"/owned/bin/dmsvc.exe" dmamon';State='Stopped';ProcessId=0},
  [pscustomobject]@{Name='DmUnexpected';PathName='"/owned/bin/dmsvc.exe" external';State='Stopped';ProcessId=0}
)
function Get-DmServices { $global:services }
function Get-DmServiceBinary { '/owned/bin/dmsvc.exe' }
function Assert-DmPath { }
function Set-Service($Name) { if ($Name -eq 'DmAPService') { throw 'simulated helper permission failure' }; $global:configured+= $Name }
function Stop-Service { throw 'unexpected stop' }
function Get-CimInstance($Class,$Filter) { $global:services | Where-Object { $Filter -eq ("Name='"+$_.Name+"'") } }
$result=Stop-DmInstalledCompanions '/owned'
if ($result.records.Count -ne 2 -or $result.errors.Count -ne 2 -or $global:configured.Count -ne 1 -or $global:configured[0] -ne 'DmAuditMonitorService') { throw 'independent companion handoff failed' }
exit 0`
  const result = spawnSync(
    shell,
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodeWindowsScript(script)],
    { encoding: 'utf8' }
  )
  assert.equal(result.status, 0, result.stderr)
})

test('native service discovery excludes Windows device management and reports actual DM conflicts', async (t) => {
  const { windowsFunctions } = await import('../fork/windows')
  await runPolicyScript(
    String.raw`${windowsFunctions}
$ErrorActionPreference='Stop'; $callerDmHome=''
$env:SystemRoot='/windows'
$global:services=@(
  [pscustomobject]@{Name='dmwappushservice';PathName='C:\Windows\system32\svchost.exe -k netsvcs'},
  [pscustomobject]@{Name='DmEnrollmentSvc';PathName='C:\Windows\system32\svchost.exe -k netsvcs'},
  [pscustomobject]@{Name='DmUnrelated';PathName='"C:\Other\other.exe"'},
  [pscustomobject]@{Name='CommandArgument';PathName='"C:\Other\other.exe" "C:\DM\bin\dmsvc.exe"'},
  [pscustomobject]@{Name='SimilarExecutable';PathName='"C:\DM\bin\dmsvc.exe.bak"'},
  [pscustomobject]@{Name='ExecutableDirectory';PathName='"C:\DM\dmsvc.exe\other.exe"'}
)
function Get-CimInstance { $global:services }
function Get-DmGlobalPaths { @() }
function Test-Path { $false }
function Get-ChildItem { @() }
$existingDmHome=[Environment]::GetEnvironmentVariable('DM_HOME','User')
try {
  [Environment]::SetEnvironmentVariable('DM_HOME',$null,'User')
  if (@(Get-DmServices).Count) { throw 'Windows or unrelated service falsely identified as DM' }
  Assert-NoExternalDm
  $global:services+=@(
    [pscustomobject]@{Name='DmServiceDMSERVER';PathName=''},
    [pscustomobject]@{Name='DmAPService';PathName=''},
    [pscustomobject]@{Name='DmAuditMonitorService';PathName=''},
    [pscustomobject]@{Name='DmJobMonitorService';PathName=''},
    [pscustomobject]@{Name='DmInstanceMonitorService';PathName=''},
    [pscustomobject]@{Name='RenamedDM';PathName='"C:\Program Files\DM\bin\dmsvc.exe" database DMSERVER'},
    [pscustomobject]@{Name='RenamedAP';PathName='C:\DM\bin\dmap.exe'},
    [pscustomobject]@{Name='RenamedMonitor';PathName='"C:/DM/bin/dmmonitor.exe" -f C:/DM/monitor.ini'}
  )
  $found=@(Get-DmServices)
  if ($found.Count -ne 8) { throw ('Wrong DM candidates: '+($found.Name -join ', ')) }
  try { Assert-NoExternalDm; throw 'DM conflicts ignored' } catch {
    if ($_.Exception.Message -notlike 'Existing DM services cannot be taken over:*' -or $_.Exception.Message -notmatch 'DmAPService' -or $_.Exception.Message -notmatch 'RenamedDM' -or $_.Exception.Message -match 'dmwappushservice') { throw }
  }
} finally { [Environment]::SetEnvironmentVariable('DM_HOME',$existingDmHome,'User') }
exit 0`,
    t
  )
})

test('command timeout reports unknown result without blind installer retries', async () => {
  let launches = 0
  const fakeSpawn = (() => {
    launches++
    const child = new EventEmitter() as any
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => true
    return child
  }) as typeof spawn
  await assert.rejects(
    spawnWindowsCommand('powershell', [], 5, fakeSpawn),
    /DAMENG_OUTCOME_UNKNOWN/
  )
  assert.equal(launches, 1)
})

test('installer precondition refusal never adopts a preexisting engine from its catch path', async (t) => {
  const { existsSync } = await import('node:fs')
  const { spawnSync } = await import('node:child_process')
  const shell = '/tmp/flyenv-powershell-test/pwsh'
  if (!existsSync(shell)) return t.skip('optional PowerShell unavailable')
  const body = windowsInstallBody('C:\\FlyEnv\\cache\\official.iso', root, '<DATABASE/>').replace(
    '\n$iso=',
    `\nfunction Assert-NoExternalDm { throw 'external global conflict' }\nfunction Test-Path { throw 'preexisting engine must not be inspected after precondition refusal' }\n$iso=`
  )
  const script = `$ErrorActionPreference='Stop'; $result=@{}; try { ${body}; throw 'guard did not reject' } catch { if ($_.Exception.Message -ne 'external global conflict') { throw }; if ($result.installed) { throw 'preexisting engine was adopted' } }; exit 0`
  const result = spawnSync(
    shell,
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodeWindowsScript(script)],
    { encoding: 'utf8' }
  )
  assert.equal(result.status, 0, result.stderr)
})

test('native stop bridge compiles and requests only the owned service stop/query handle', async (t) => {
  const { existsSync } = await import('node:fs')
  const { spawnSync } = await import('node:child_process')
  const { windowsFunctions } = await import('../fork/windows')
  const shell = '/tmp/flyenv-powershell-test/pwsh'
  if (!existsSync(shell)) return t.skip('optional PowerShell unavailable')
  const csharp = windowsFunctions.match(/Add-Type -TypeDefinition @'\n([\s\S]*?)\n'@/)?.[1]
  assert.ok(csharp)
  assert.match(csharp, /OpenServiceW\(manager,name,0x24\)/)
  assert.match(csharp, /ControlService\(service,1,out status\)/)
  assert.doesNotMatch(csharp, /EnumDependent|TerminateProcess/)
  const script = `$ErrorActionPreference='Stop'; Add-Type -TypeDefinition @'\n${csharp}\n'@\nif (!('FlyEnvDamengServiceStop' -as [type])) { throw 'native stop bridge compilation failed' }; exit 0`
  const result = spawnSync(
    shell,
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodeWindowsScript(script)],
    { encoding: 'utf8' }
  )
  assert.equal(result.status, 0, result.stderr)
})

async function runPolicyScript(script: string, t: { skip: (reason: string) => void }) {
  const { existsSync } = await import('node:fs')
  const { spawnSync } = await import('node:child_process')
  const shell = '/tmp/flyenv-powershell-test/pwsh'
  if (!existsSync(shell)) {
    t.skip('optional PowerShell unavailable')
    return
  }
  const result = spawnSync(
    shell,
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodeWindowsScript(script)],
    { encoding: 'utf8' }
  )
  assert.equal(result.status, 0, result.stderr)
}

function selectedDirectoryInstallPolicy(
  kind: 'empty' | 'nonempty' | 'file' | 'reparse' | 'partial'
) {
  const full = windowsInstallBody(
    'C:\\FlyEnv\\cache\\official.iso',
    root,
    '<DATABASE><INIT_DB>N</INIT_DB><INSTALL_PATH>/owned</INSTALL_PATH></DATABASE>'
  ).replace(`$root='${root}'`, "$root='/owned'")
  return full.replace(
    '\n$iso=',
    `
$global:selectedRoot='/owned'; $global:kind='${kind}'; $global:entries=@(); $global:launches=0; $global:mounts=0; $global:rootChecks=0; $global:rootDeletes=0
if ($global:kind -eq 'nonempty') { $global:entries=@([pscustomobject]@{Name='.hidden-existing'}) }
$env:SystemRoot=[IO.Path]::GetTempPath()
function Assert-NoExternalDm { }
function Assert-DmPath($Path) { if ($Path -eq $global:selectedRoot) { $global:rootChecks++; if ($global:kind -eq 'reparse') { throw 'selected root reparse refused' } } }
function Test-Path($LiteralPath,$PathType) { return ($LiteralPath -eq $global:selectedRoot -or $LiteralPath.EndsWith('setup.bat')) }
function Get-Item($LiteralPath) { if ($LiteralPath -ne $global:selectedRoot) { throw 'unexpected item query' }; [pscustomobject]@{PSIsContainer=($global:kind -ne 'file')} }
function Get-ChildItem($LiteralPath) { if ($LiteralPath -ne $global:selectedRoot) { throw 'unexpected child query' }; $global:entries }
function Get-DiskImage { return $null }
function Mount-DiskImage { $global:mounts++; [pscustomobject]@{Attached=$true} }
function Get-Volume { [pscustomobject]@{DriveLetter='Z'} }
function Start-Process { $global:launches++; if ($global:kind -eq 'partial') { $global:entries=@([pscustomobject]@{Name='partial-install'}) }; [pscustomobject]@{HasExited=$true} }
function Wait-DmChild { throw 'Official DM installer exited 7' }
function Dismount-DiskImage { }
function Remove-Item($LiteralPath) { if ($LiteralPath -eq $global:selectedRoot) { $global:rootDeletes++; throw 'selected root must be retained' }; [IO.File]::Delete($LiteralPath) }
$iso=`
  )
}

test('selected empty final directory reaches the installer and survives a known failed attempt', async (t) => {
  await runPolicyScript(
    `$ErrorActionPreference='Stop'; $result=@{}; try { ${selectedDirectoryInstallPolicy('empty')}; throw 'installer failure was lost' } catch { if ($_.Exception.Message -ne 'Official DM installer exited 7') { throw } }
if ($global:launches -ne 1 -or $global:rootChecks -lt 1 -or $global:rootDeletes -ne 0 -or $global:entries.Count -ne 0 -or $result.installed) { throw 'empty selected-directory contract failed' }; exit 0`,
    t
  )
})

test('selected nonempty directory, regular file and reparse root fail before mounting or installation', async (t) => {
  for (const kind of ['nonempty', 'file', 'reparse'] as const) {
    await t.test(kind, async (subtest) => {
      await runPolicyScript(
        `$ErrorActionPreference='Stop'; $result=@{}; try { ${selectedDirectoryInstallPolicy(kind)}; throw 'unsafe destination accepted' } catch { if ($_.Exception.Message -notmatch 'not an empty|reparse refused') { throw } }
if ($global:mounts -ne 0 -or $global:launches -ne 0 -or $global:rootDeletes -ne 0) { throw 'destination refusal had side effects' }; exit 0`,
        subtest
      )
    })
  }
})

test('failed installation leaving partial files in the selected directory remains unknown', async (t) => {
  await runPolicyScript(
    `$ErrorActionPreference='Stop'; $result=@{}; try { ${selectedDirectoryInstallPolicy('partial')}; throw 'partial failure was lost' } catch { if ($_.Exception.Message -notmatch 'DAMENG_OUTCOME_UNKNOWN') { throw } }
if ($global:launches -ne 1 -or $global:rootDeletes -ne 0 -or $global:entries.Count -ne 1) { throw 'partial selected-directory facts were lost' }; exit 0`,
    t
  )
})

test('installed engine survives cleanup warning without required handoff failure', async (t) => {
  const full = windowsInstallBody('C:\\FlyEnv\\cache\\official.iso', root, '<DATABASE/>')
  const tail = full.slice(full.indexOf('  $installerRunning=$true;'))
  await runPolicyScript(
    `$ErrorActionPreference='Stop'; $result=@{}; $root='/owned'; $attempted=$true; $mounted=$true; $xmlFile=$null; $child=[pscustomobject]@{HasExited=$true}
function Wait-DmChild { }
function Test-Path($LiteralPath) { return !($LiteralPath -match '[/\\\\]log$') }
function Assert-DmPath { }
function Stop-DmInstalledCompanions { @{records=@();errors=@()} }
function Save-DmGlobalProof { }
function Dismount-DiskImage { throw 'dismount cleanup only' }
try { ${tail}
if (!$result.installed -or $result.handoffError -or $result.warning -notmatch 'dismount cleanup only') { throw 'cleanup overwrote installed outcome' }; exit 0`,
    t
  )
})

test('installed engine preserves required companion handoff failure separately from cleanup', async (t) => {
  const full = windowsInstallBody('C:\\FlyEnv\\cache\\official.iso', root, '<DATABASE/>')
  const tail = full.slice(full.indexOf('  $installerRunning=$true;'))
  await runPolicyScript(
    `$ErrorActionPreference='Stop'; $result=@{}; $root='/owned'; $attempted=$true; $mounted=$false; $xmlFile=$null; $child=[pscustomobject]@{HasExited=$true}
function Wait-DmChild { }
function Test-Path($LiteralPath) { return !($LiteralPath -match '[/\\\\]log$') }
function Assert-DmPath { }
function Stop-DmInstalledCompanions { @{records=@();errors=@('helper could not stop')} }
function Save-DmGlobalProof { }
try { ${tail}
if (!$result.installed -or $result.handoffError -notmatch 'helper could not stop' -or $result.warning) { throw 'required handoff was classified as cleanup warning' }; exit 0`,
    t
  )
})

test('official nonzero uninstall preserves completed engine removal and warns', async (t) => {
  const full = windowsUninstallBody(root)
  const tail = full.slice(full.lastIndexOf('$vendorWarning=$null'))
  await runPolicyScript(
    `$ErrorActionPreference='Stop'; $result=@{}; $root='/owned'; $child=$null; $services=@()
function Wait-DmChild { throw 'Official DM installer exited 7' }
function Test-Path { return $false }
function Get-DmServices { @() }
${tail}
if (!$result.uninstalled -or $result.warning -notmatch 'exited 7') { throw 'completed uninstall fact was lost' }; exit 0`,
    t
  )
})

test('accepted service start followed by pending timeout is unknown and never blindly stopped', async (t) => {
  const body = windowsServiceBody(root, ini, service, 'start').replace(
    '\n$root=',
    `
$global:stops=0
function Get-OwnedDmService { [pscustomobject]@{State='Stopped';ProcessId=0} }
function Get-Service { $s=New-Object PSObject; $s | Add-Member ScriptMethod Start { }; $s | Add-Member ScriptMethod WaitForStatus { throw 'simulated pending timeout' }; return $s }
function Stop-DmOwnedService { $global:stops++ }
$root=`
  )
  await runPolicyScript(
    `$ErrorActionPreference='Stop'; $result=@{}; try { ${body}; throw 'start unexpectedly passed' } catch { if ($_.Exception.Message -notmatch 'DAMENG_OUTCOME_UNKNOWN' -or $global:stops -ne 0) { throw } }; exit 0`,
    t
  )
})

test('accepted service stop followed by pending timeout is unknown without another control attempt', async (t) => {
  const body = windowsServiceBody(root, ini, service, 'stop', '123').replace(
    '\n$root=',
    `
$global:stops=0
function Get-OwnedDmService { [pscustomobject]@{State='Running';ProcessId=123} }
function Stop-DmOwnedService { $global:stops++ }
function Get-Service { $s=New-Object PSObject; $s | Add-Member ScriptMethod WaitForStatus { throw 'simulated pending stop timeout' }; return $s }
$root=`
  )
  await runPolicyScript(
    `$ErrorActionPreference='Stop'; $result=@{}; try { ${body}; throw 'stop unexpectedly passed' } catch { if ($_.Exception.Message -notmatch 'DAMENG_OUTCOME_UNKNOWN' -or $global:stops -ne 1) { throw } }; exit 0`,
    t
  )
})

test('native service stop refusal remains known and does not retry control', async (t) => {
  const body = windowsServiceBody(root, ini, service, 'stop', '123').replace(
    '\n$root=',
    `
$global:stops=0
function Get-OwnedDmService { [pscustomobject]@{State='Running';ProcessId=123} }
function Stop-DmOwnedService { $global:stops++; throw 'simulated native stop refusal' }
function Get-Service { throw 'must not wait for rejected control' }
$root=`
  )
  await runPolicyScript(
    `$ErrorActionPreference='Stop'; $result=@{}; try { ${body}; throw 'stop unexpectedly passed' } catch { if ($_.Exception.Message -ne 'simulated native stop refusal' -or $global:stops -ne 1) { throw } }; exit 0`,
    t
  )
})

test('registration resumes its durable intent after service creation interrupted before registry values', async (t) => {
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const directory = await mkdtemp(join(tmpdir(), 'dm-registration-policy-'))
  try {
    const body = windowsRegistrationBody(root, ini, service)
    const policy = body
      .slice(body.indexOf('\n$root='))
      .replace(`$root='${root}'`, `$root='${directory.replaceAll("'", "''")}'`)
    const script = `$ErrorActionPreference='Stop'; $result=@{}; $global:proof=[pscustomobject]@{files=@();companions=@()}; $global:service=$null; $global:key=$false; $global:values=[pscustomobject]@{}; $global:interrupt=$true; $global:creates=0
function Assert-DmGlobalProof($Root) { $file=Join-Path $Root '.flyenv-windows-global.json'; if ([IO.File]::Exists($file)) { $global:proof=ConvertFrom-Json ([IO.File]::ReadAllText($file)) }; return $global:proof }
function Assert-DmPath { }
function Get-CimInstance { return $global:service }
function Test-Path { return $global:key }
function New-Service($Name,$BinaryPathName) {
  $global:creates++; $global:service=[pscustomobject]@{Name=$Name;PathName=$BinaryPathName;State='Stopped';ProcessId=0}
  if ($global:interrupt) { $global:interrupt=$false; throw 'simulated worker interruption after SCM write' }
}
function New-Item { $global:key=$true }
function Get-ItemProperty { return $global:values }
function New-ItemProperty($Name,$Value) { $global:values | Add-Member NoteProperty $Name $Value -Force }
function Get-OwnedDmService { if (!$global:key -or $global:values.path -ne '${ini}' -or $global:values.model -ne 'open') { throw 'incomplete registry cannot control service' }; return $global:service }
function Set-Service { }
function Grant-DmServiceAccess { }
function Grant-DmDirectoryAccess { }
try { ${policy}; throw 'interruption was not simulated' } catch { if ($_.Exception.Message -ne 'simulated worker interruption after SCM write') { throw } }
${policy}
if ($global:creates -ne 1 -or $global:values.path -ne '${ini}' -or $global:values.model -ne 'open') { throw 'durable registration repair did not resume exact binding' }
$global:values.path='external.ini'
try { ${policy}; throw 'conflicting registry was adopted' } catch { if ($_.Exception.Message -notmatch 'Conflicting present DM registry') { throw } }
if ($global:values.path -ne 'external.ini' -or $global:creates -ne 1) { throw 'conflicting registry was mutated' }
[IO.File]::WriteAllText((Join-Path '${directory.replaceAll("'", "''")}' '.flyenv-windows-global.json'),'{"files":[],"companions":[],"instances":[]}')
try { ${policy}; throw 'external service without intent was adopted' } catch { if ($_.Exception.Message -notmatch 'lacks this installation registration intent') { throw } }
if ($global:creates -ne 1) { throw 'external service was mutated' }
exit 0`
    await runPolicyScript(script, t)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('uninstall unknown timeout propagates even if engine visibility disappeared', async (t) => {
  const full = windowsUninstallBody(root)
  const tail = full.slice(full.lastIndexOf('$vendorWarning=$null'))
  await runPolicyScript(
    `$ErrorActionPreference='Stop'; $result=@{}; $root='/owned'; $child=$null; $services=@()
function Wait-DmChild { throw 'DAMENG_OUTCOME_UNKNOWN: vendor still running' }
function Test-Path { return $false }
function Get-DmServices { @() }
try { ${tail}; throw 'unknown uninstall was treated as complete' } catch { if ($_.Exception.Message -notmatch 'DAMENG_OUTCOME_UNKNOWN' -or $result.uninstalled) { throw } }; exit 0`,
    t
  )
})

test('known installer nonzero preserves existing engine with required handoff error', async (t) => {
  const full = windowsInstallBody('C:\\FlyEnv\\cache\\official.iso', root, '<DATABASE/>')
  const tail = full.slice(full.indexOf('  $installerRunning=$true;'))
  await runPolicyScript(
    `$ErrorActionPreference='Stop'; $result=@{}; $root='/owned'; $attempted=$true; $mounted=$false; $xmlFile=$null; $child=[pscustomobject]@{HasExited=$true}
function Wait-DmChild { throw 'Official DM installer exited 7' }
function Test-Path { return $true }
function Assert-DmPath { }
try { ${tail}
if (!$result.installed -or $result.handoffError -notmatch 'exited 7' -or $result.warning) { throw 'partial installed fact was lost or misclassified' }; exit 0`,
    t
  )
})

test('uninstall preflight failure remains explicitly unattempted', async (t) => {
  const full = windowsUninstallBody(root)
  const body = full.slice(full.lastIndexOf('\n$root=')).replace(`$root='${root}'`, "$root='/owned'")
  // Keep any marker immediately before the first real preflight body.
  const marker = full.slice(
    full.indexOf('\n$result.attempted=$false'),
    full.lastIndexOf('\n$root=')
  )
  await runPolicyScript(
    `$ErrorActionPreference='Stop'; $result=@{}; $global:launches=0
function Assert-DmPath { throw 'uninstaller missing' }
function Start-Process { $global:launches++; throw 'must not launch' }
try { ${marker}${body}; throw 'preflight unexpectedly passed' } catch { if ($_.Exception.Message -ne 'uninstaller missing') { throw } }
if (!$result.ContainsKey('attempted') -or $result.attempted -ne $false -or $global:launches -ne 0) { throw 'read-only refusal lost explicit no-side-effects fact' }; exit 0`,
    t
  )
})

test('error transport tags only explicit unattempted uninstall preflight and never unknown outcomes', () => {
  assert.equal(
    windowsOperationError({ error: 'uninstaller missing', attempted: false }).noSideEffects,
    true
  )
  assert.equal(
    windowsOperationError({ error: 'vendor failed', attempted: true }).noSideEffects,
    undefined
  )
  assert.equal(windowsOperationError({ error: 'generic install failed' }).noSideEffects, undefined)
  assert.equal(
    windowsOperationError({ error: 'DAMENG_OUTCOME_UNKNOWN: timeout', attempted: false })
      .noSideEffects,
    undefined
  )
  const elevation = windowsElevationScript(
    'Write-Output test',
    'C:\\temp\\result.json',
    'C:\\powershell.exe'
  )
  assert.match(elevation, /NativeErrorCode -eq 1223/)
  assert.match(elevation, /DAMENG_UAC_CANCELED/)
})
