import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, win32 } from 'node:path'
import { gzipSync } from 'node:zlib'

const ps = (value: string) => `'${value.replaceAll("'", "''")}'`
const argument = (value: string) =>
  `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`
const proofName = '.flyenv-windows-global.json'

function assertPath(value: string) {
  if (
    !/^[A-Za-z]:\\/.test(value) ||
    /["<>|?*\x00-\x1f]/.test(value) ||
    value.slice(2).includes(':') ||
    value.split(/[\\/]/).some((part) => part === '..' || part === '.' || /[. ]$/.test(part)) ||
    !win32.normalize(value).toLowerCase().startsWith(value.slice(0, 3).toLowerCase()) ||
    win32.normalize(value).toLowerCase() !== value.toLowerCase() ||
    value.length > 240
  )
    throw new Error('Invalid canonical local Windows path')
}

export function assertWindowsIdentity(installDir: string, iniFile: string, serviceName: string) {
  assertPath(installDir)
  assertPath(iniFile)
  if (installDir.length <= 3 || win32.basename(iniFile).toLowerCase() !== 'dm.ini') {
    throw new Error('Invalid DM installation or instance configuration path')
  }
  if (!/^DmServiceFLYENV[A-Z0-9]+$/.test(serviceName))
    throw new Error('Invalid owned DM service name')
}

/** Native stdout alone carries results; successful CLIXML stderr remains diagnostic. */
export function spawnWindowsCommand(
  file: string,
  args: string[],
  timeoutMs = 40 * 60 * 1000,
  spawnCommand: typeof spawn = spawn
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawnCommand(file, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(stdout)
    }
    const timer = setTimeout(() => {
      // Elevated installers cannot safely be killed or replayed after wrapper timeout.
      const error = new Error(
        'DAMENG_OUTCOME_UNKNOWN: Windows operation timed out; do not retry installation'
      )
      finish(error)
      try {
        child.kill()
      } catch {
        /* the elevated transaction may still be running */
      }
    }, timeoutMs)
    child.stdout?.on('data', (data: Buffer) => {
      stdout = (stdout + data.toString()).slice(-16000)
    })
    child.stderr?.on('data', (data: Buffer) => {
      stderr = (stderr + data.toString()).slice(-16000)
    })
    child.once('error', (error) => finish(error))
    child.once('close', (code, signal) =>
      finish(
        code === 0
          ? undefined
          : new Error(`DM command exited ${code ?? signal}: ${stderr || stdout}`)
      )
    )
  })
}

/** Shared functions verify real filesystem ancestors and the vendor's complete service binding. */
export const windowsFunctions = String.raw`
function Assert-DmPath($Path) {
  $item=Get-Item -LiteralPath $Path -Force
  while ($item) {
    if ([int]$item.Attributes -band [int][IO.FileAttributes]::ReparsePoint) { throw "DM reparse path is unsupported: $($item.FullName)" }
    if (!$item.Parent) {
      if ($item.PSIsContainer) { $parent=$item.Parent } else { $parent=$item.Directory }
    } else { $parent=$item.Parent }
    $item=$parent
  }
}
function Test-DmEmptyInstallDirectory($Directory) {
  Assert-DmPath $Directory
  $item=Get-Item -LiteralPath $Directory -Force
  return ($item.PSIsContainer -and @(Get-ChildItem -LiteralPath $Directory -Force).Count -eq 0)
}
function Stop-DmOwnedService($Name) {
  if (!('FlyEnvDamengServiceStop' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class FlyEnvDamengServiceStop {
  [StructLayout(LayoutKind.Sequential)] struct ServiceStatus {
    public uint Type, State, Accepted, ExitCode, SpecificExitCode, CheckPoint, WaitHint;
  }
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, ExactSpelling=true, SetLastError=true)]
  static extern IntPtr OpenSCManagerW(string machine, string database, uint access);
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, ExactSpelling=true, SetLastError=true)]
  static extern IntPtr OpenServiceW(IntPtr manager, string name, uint access);
  [DllImport("advapi32.dll", SetLastError=true)]
  static extern bool ControlService(IntPtr service, uint control, out ServiceStatus status);
  [DllImport("advapi32.dll", SetLastError=true)]
  static extern bool CloseServiceHandle(IntPtr handle);
  public static void Stop(string name) {
    IntPtr manager=OpenSCManagerW(null,null,1);
    if(manager==IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
    try {
      IntPtr service=OpenServiceW(manager,name,0x24);
      if(service==IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
      try {
        ServiceStatus status;
        if(!ControlService(service,1,out status)) throw new Win32Exception(Marshal.GetLastWin32Error());
      } finally { CloseServiceHandle(service); }
    } finally { CloseServiceHandle(manager); }
  }
}
'@
  }
  [FlyEnvDamengServiceStop]::Stop($Name)
}
function Get-DmGlobalPaths { @((Join-Path $env:SystemRoot 'System32\dm_svc.conf'),(Join-Path $env:SystemRoot 'SysWOW64\dm_svc.conf')) | Select-Object -Unique }
function Get-DmServices {
  @(Get-CimInstance Win32_Service | Where-Object {
    $_.Name -match '^(?:DmService[^\s]+|DmAPService|DmAuditMonitorService|DmJobMonitorService|DmInstanceMonitorService)$' -or
    $_.PathName -match '^\s*(?:"[^"\r\n]*[/\\](?:dmsvc|dmap|dmmonitor)\.exe"|[^\s"]*[/\\](?:dmsvc|dmap|dmmonitor)\.exe)(?:\s|$)'
  })
}
function Assert-NoExternalDm {
  foreach ($path in Get-DmGlobalPaths) { if (Test-Path -LiteralPath $path) { throw "Existing DM global configuration cannot be safely preserved: $path" } }
  $existingServices=@(Get-DmServices)
  if ($existingServices.Count) { throw ('Existing DM services cannot be taken over: '+($existingServices.Name -join ', ')) }
  if (Test-Path 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Dameng') { throw 'Existing DM registry installation cannot be taken over' }
  if (Test-Path 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Dameng') { throw 'Existing 32-bit DM registry installation cannot be taken over' }
  foreach ($uninstall in @('Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall','Registry::HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')) {
    foreach ($entry in Get-ChildItem -LiteralPath $uninstall -ErrorAction SilentlyContinue) { $values=Get-ItemProperty -LiteralPath $entry.PSPath; if ($entry.PSChildName -match '^(dm8Uninst|Dameng)$' -or [string]$values.Publisher -match 'Dameng|达梦') { throw 'Existing DM installer registration cannot be taken over' } }
  }
  if ($callerDmHome) { throw 'Initiating user already has an external DM_HOME' }
  foreach ($odbc in @('Registry::HKEY_LOCAL_MACHINE\SOFTWARE\ODBC\ODBCINST.INI\DM8 ODBC DRIVER','Registry::HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\ODBC\ODBCINST.INI\DM8 ODBC DRIVER')) { if (Test-Path -LiteralPath $odbc) { throw 'Existing DM ODBC installation cannot be overwritten' } }
  foreach ($scope in @('Machine','User')) { if ([Environment]::GetEnvironmentVariable('DM_HOME',$scope)) { throw 'Existing DM_HOME installation cannot be taken over' } }
}
function Assert-DmRegistrationOwnership($Root) {
  $registration=Get-ItemProperty -LiteralPath 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Dameng'
  if (![string]$registration.Path -or ![IO.Path]::GetFullPath([string]$registration.Path).TrimEnd('\').Equals($Root,[StringComparison]::OrdinalIgnoreCase)) { throw 'DM shared installation registration does not match its owned root' }
  foreach ($scope in @('Machine','User')) {
    $home=[Environment]::GetEnvironmentVariable('DM_HOME',$scope)
    if ($home -and ![IO.Path]::GetFullPath($home).TrimEnd('\').Equals($Root,[StringComparison]::OrdinalIgnoreCase)) { throw 'External DM_HOME prevents official uninstall' }
  }
  foreach ($uninstall in @('Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall','Registry::HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')) {
    foreach ($entry in Get-ChildItem -LiteralPath $uninstall -ErrorAction SilentlyContinue) {
      $values=Get-ItemProperty -LiteralPath $entry.PSPath
      if ($entry.PSChildName -match '^(dm8Uninst|Dameng)$' -or [string]$values.Publisher -match 'Dameng|达梦') {
        if (![string]$values.UninstallString -or ![IO.Path]::GetFullPath(([string]$values.UninstallString).Trim('"')).Equals((Join-Path $Root 'uninstall.exe'),[StringComparison]::OrdinalIgnoreCase)) { throw 'External DM uninstall registration prevents official uninstall' }
      }
    }
  }
  foreach ($odbc in @('Registry::HKEY_LOCAL_MACHINE\SOFTWARE\ODBC\ODBCINST.INI\DM8 ODBC DRIVER','Registry::HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\ODBC\ODBCINST.INI\DM8 ODBC DRIVER')) {
    if (Test-Path -LiteralPath $odbc) {
      $driver=Get-ItemProperty -LiteralPath $odbc
      if (![string]$driver.Driver -or ![IO.Path]::GetFullPath([string]$driver.Driver).Equals((Join-Path $Root 'bin\dodbc.dll'),[StringComparison]::OrdinalIgnoreCase)) { throw 'External DM ODBC registration prevents official uninstall' }
    }
  }
}
function Get-OwnedDmService($Root,$Ini,$Name) {
  $service=Get-CimInstance Win32_Service -Filter ("Name='"+$Name+"'")
  if (!$service) { return $null }
  $bin=Join-Path $Root 'bin\dmsvc.exe'
  Assert-DmPath $bin; Assert-DmPath $Ini
  if ($service.PathName -notmatch '^\s*"([^"\r\n]+)"\s+database\s+([A-Z0-9]+)\s*$') { throw 'DM service command is not an exact owned database selector' }
  if (![IO.Path]::GetFullPath($Matches[1]).Equals($bin,[StringComparison]::OrdinalIgnoreCase) -or $Matches[2] -cne $Name.Substring(9)) { throw 'DM service executable or instance does not match' }
  $key=Get-ItemProperty -LiteralPath ('Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Dameng\'+$Name)
  if (![string]$key.path -or ![IO.Path]::GetFullPath([string]$key.path).Equals($Ini,[StringComparison]::OrdinalIgnoreCase) -or [string]$key.model -cne 'open') { throw 'DM service configuration does not match its owned dm.ini' }
  return $service
}
function Get-DmServiceBinary($Service) {
  if ($Service.PathName -notmatch '^\s*(?:"([^"\r\n]+)"|([^\s"]+))') { throw 'DM companion service executable is unknown' }
  return [IO.Path]::GetFullPath($(if ($Matches[1]) { $Matches[1] } else { $Matches[2] }))
}
function Stop-DmInstalledCompanions($Root) {
  $records=@(); $errors=@()
  $selectors=@{DmAPService='dmap';DmAuditMonitorService='dmamon';DmJobMonitorService='dmjmon';DmInstanceMonitorService='dmimon'}
  foreach ($service in Get-DmServices) {
    try {
      $bin=Get-DmServiceBinary $service
      if (!$selectors.ContainsKey([string]$service.Name) -or !$bin.Equals((Join-Path $Root 'bin\dmsvc.exe'),[StringComparison]::OrdinalIgnoreCase)) { throw 'DM companion service is not an exact official owned helper' }
      $expected=$selectors[[string]$service.Name]
      if ($service.PathName -notmatch ('^\s*(?:"[^"\r\n]+"|[^\s"]+)\s+'+[regex]::Escape($expected)+'\s*$')) { throw 'DM companion selector differs from the official helper' }
      Assert-DmPath $bin
      $records+=@{name=$service.Name;binary=$bin;imagePath=[string]$service.PathName}
      if ($service.State -ne 'Stopped') { Stop-Service -Name $service.Name; $control=Get-Service -Name $service.Name; $control.WaitForStatus('Stopped',[TimeSpan]::FromSeconds(60)) }
      Set-Service -Name $service.Name -StartupType Manual
      $fresh=Get-CimInstance Win32_Service -Filter ("Name='"+$service.Name+"'")
      if ($fresh.State -ne 'Stopped' -or [int64]$fresh.ProcessId -ne 0 -or $fresh.PathName -cne $service.PathName) { throw 'DM companion handoff did not confirm stopped ownership' }
    } catch { $errors+=($service.Name+': '+$_.Exception.Message) }
  }
  return @{records=$records;errors=$errors}
}
function Save-DmGlobalProof($Root,$Companions) {
  $files=@(foreach ($path in Get-DmGlobalPaths) { if (Test-Path -LiteralPath $path) { Assert-DmPath $path; @{path=$path;sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash} } })
  [IO.File]::WriteAllText((Join-Path $Root '${proofName}'),(ConvertTo-Json -InputObject @{files=$files;companions=@($Companions)} -Depth 4 -Compress))
}
function Assert-DmGlobalProof($Root) {
  $proofPath=Join-Path $Root '${proofName}'
  Assert-DmPath $proofPath
  $proof=ConvertFrom-Json ([IO.File]::ReadAllText($proofPath))
  foreach ($path in Get-DmGlobalPaths) {
    $record=@($proof.files | Where-Object { $_.path -eq $path })
    if (Test-Path -LiteralPath $path) {
      Assert-DmPath $path
      if ($record.Count -ne 1 -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $record[0].sha256) { throw 'DM global configuration changed; automatic uninstall refused' }
    } elseif ($record.Count) { throw 'DM global configuration disappeared; installation ownership is uncertain' }
  }
  return $proof
}
function Assert-DmAccess($Dacl,$Required,$Kind) {
  if ($null -eq $Dacl) { return }
  $remaining=[long]$Required
  $principals=@($callerSid)+@($callerGroupSids)
  $generic=if ($Kind -eq 'service') { @(0x2008d,0x20002,0x20170,0xf01ff) } else { @(0x120089,0x120116,0x1200a0,0x1f01ff) }
  foreach ($ace in $Dacl) {
    if ([int]$ace.AceFlags -band [int][Security.AccessControl.AceFlags]::InheritOnly) { continue }
    if ($principals -notcontains $ace.SecurityIdentifier.Value) { continue }
    $mask=[long]$ace.AccessMask -band 0xffffffffL
    foreach ($bit in @(0,1,2,3)) { if ($mask -band @(0x80000000L,0x40000000L,0x20000000L,0x10000000L)[$bit]) { $mask=$mask -bor $generic[$bit] } }
    if (!($remaining -band $mask)) { continue }
    if ($ace.IsCallback) { throw 'Conditional DM access rules cannot be verified' }
    if ($ace.AceQualifier.ToString() -eq 'AccessDenied') { throw 'Existing access rules deny the initiating user DM access' }
    if ($ace.AceQualifier.ToString() -eq 'AccessAllowed' -and ($ace.SecurityIdentifier.Value -eq $callerSid -or @($callerAllowGroupSids) -contains $ace.SecurityIdentifier.Value)) { $remaining=$remaining -band (-bnot $mask) }
    if (!$remaining) { return }
  }
  throw 'Initiating user DM access could not be verified'
}
function Grant-DmServiceAccess($Name) {
  $sc=Join-Path $env:SystemRoot 'System32\sc.exe'
  $output=(& $sc sdshow $Name | Out-String)
  if ($LASTEXITCODE -ne 0) { throw 'Reading DM service DACL failed' }
  $sddl=($output -split '\r?\n' | Where-Object { $_.Trim() -match '^(O:|G:|D:|S:)' } | Select-Object -First 1).Trim()
  $sd=[Security.AccessControl.RawSecurityDescriptor]::new($sddl)
  if ($null -eq $sd.DiscretionaryAcl) { return }
  $index=$sd.DiscretionaryAcl.Count
  for ($i=0; $i -lt $sd.DiscretionaryAcl.Count; $i++) { if ([int]$sd.DiscretionaryAcl[$i].AceFlags -band [int][Security.AccessControl.AceFlags]::Inherited) { $index=$i; break } }
  $ace=[Security.AccessControl.CommonAce]::new([Security.AccessControl.AceFlags]::None,[Security.AccessControl.AceQualifier]::AccessAllowed,0x35,[Security.Principal.SecurityIdentifier]::new($callerSid),$false,$null)
  $sd.DiscretionaryAcl.InsertAce($index,$ace)
  Assert-DmAccess $sd.DiscretionaryAcl 0x35 'service'
  $null=& $sc sdset $Name ($sd.GetSddlForm([Security.AccessControl.AccessControlSections]::All))
  if ($LASTEXITCODE -ne 0) { throw 'Writing DM service DACL failed' }
}
function Grant-DmDirectoryAccess($Directory) {
  Assert-DmPath $Directory
  $identity=[Security.Principal.SecurityIdentifier]::new($callerSid)
  foreach ($item in @((Get-Item -LiteralPath $Directory -Force))+@(Get-ChildItem -LiteralPath $Directory -Recurse -Force)) {
    Assert-DmPath $item.FullName
    $acl=Get-Acl -LiteralPath $item.FullName
    $inheritance=if ($item.PSIsContainer) { [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit } else { [Security.AccessControl.InheritanceFlags]::None }
    $rights=[Security.AccessControl.FileSystemRights]::ReadAndExecute -bor [Security.AccessControl.FileSystemRights]::Write -bor [Security.AccessControl.FileSystemRights]::Synchronize
    $rule=[Security.AccessControl.FileSystemAccessRule]::new($identity,$rights,$inheritance,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)
    [void]$acl.AddAccessRule($rule)
    $sd=[Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access))
    Assert-DmAccess $sd.DiscretionaryAcl ([long]$rights) 'file'
    Set-Acl -LiteralPath $item.FullName -AclObject $acl
  }
}
function Wait-DmChild($Child,$Minutes) {
  $deadline=[DateTime]::UtcNow.AddMinutes($Minutes)
  while (!$Child.WaitForExit(500)) { if ([DateTime]::UtcNow -ge $deadline) { throw 'DAMENG_OUTCOME_UNKNOWN: official DM installer is still running; do not replay' } }
  $Child.WaitForExit()
  if ($Child.ExitCode -ne 0) { throw "Official DM installer exited $($Child.ExitCode)" }
}
`

export function windowsInstallBody(isoFile: string, installDir: string, xml: string) {
  assertPath(isoFile)
  assertPath(installDir)
  if (win32.extname(isoFile).toLowerCase() !== '.iso' || installDir.length <= 3)
    throw new Error('Invalid DM installation media or destination')
  // Decode XML as XML in the privileged transaction too; DB creation is always separate.
  return `${windowsFunctions}
$iso=${ps(isoFile)}; $root=${ps(installDir)}; $mounted=$false; $installerRunning=$false; $xmlFile=$null; $child=$null; $attempted=$false
try {
  Assert-NoExternalDm; Assert-DmPath $iso; Assert-DmPath ([IO.Path]::GetDirectoryName($root))
  if ((Test-Path -LiteralPath $root) -and !(Test-DmEmptyInstallDirectory $root)) { throw 'DM final installation path is not an empty regular directory; existing files were retained' }
  $xmlText=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(${ps(Buffer.from(xml).toString('base64'))}))
  [xml]$document=$xmlText
  if ([string]$document.DATABASE.INIT_DB -cne 'N' -or ![IO.Path]::GetFullPath([string]$document.DATABASE.INSTALL_PATH).Equals($root,[StringComparison]::OrdinalIgnoreCase)) { throw 'DM installation XML must bind final path and INIT_DB=N' }
  $xmlFile=Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString('N')+'.xml')
  [IO.File]::WriteAllText($xmlFile,$xmlText,[Text.UTF8Encoding]::new($false))
  $existing=Get-DiskImage -ImagePath $iso -ErrorAction SilentlyContinue
  if ($existing -and $existing.Attached) { throw 'DM ISO is already mounted outside this transaction' }
  $image=Mount-DiskImage -ImagePath $iso -Access ReadOnly -PassThru; $mounted=$true
  $volume=@($image | Get-Volume | Where-Object { $_.DriveLetter })
  if ($volume.Count -ne 1) { throw 'DM ISO does not expose one installation volume' }
  $setup=([string]$volume[0].DriveLetter)+':\\setup.bat'
  if (!(Test-Path -LiteralPath $setup -PathType Leaf)) { throw 'Official Windows setup.bat was not found on DM media' }
  $command='/d /s /c ""'+$setup+'" -q "'+$xmlFile+'""'
  $attempted=$true
  $child=Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\\cmd.exe') -ArgumentList $command -WorkingDirectory ([IO.Path]::GetDirectoryName($setup)) -WindowStyle Hidden -PassThru
  $installerRunning=$true; Wait-DmChild $child 35; $installerRunning=$false
  if (!(Test-Path -LiteralPath (Join-Path $root 'bin\\dmserver.exe') -PathType Leaf)) { throw 'DAMENG_OUTCOME_UNKNOWN: official installer did not produce the owned DM engine' }
  Assert-DmPath (Join-Path $root 'bin\\dmserver.exe'); $result.installed=$true
  $handoff=Stop-DmInstalledCompanions $root; $handoffErrors=@($handoff.errors)
  try { Save-DmGlobalProof $root $handoff.records } catch { $handoffErrors+=('global proof: '+$_.Exception.Message) }
  $log=Join-Path $root 'log'; if (Test-Path -LiteralPath $log) { try { Grant-DmDirectoryAccess $log } catch { $handoffErrors+=('log permissions: '+$_.Exception.Message) } }
  if ($handoffErrors.Count) { $result.handoffError='DM engine installed; handoff incomplete: '+($handoffErrors -join '; ') }
} catch {
  if (!$attempted) { throw }
  $installerRunning=($child -and !$child.HasExited)
  if ($installerRunning) { throw ('DAMENG_OUTCOME_UNKNOWN: official DM installer remains active; '+$_.Exception.Message) }
  if (Test-Path -LiteralPath (Join-Path $root 'bin\\dmserver.exe') -PathType Leaf) { Assert-DmPath (Join-Path $root 'bin\\dmserver.exe'); $result.installed=$true; $result.handoffError='DM engine exists but installation requires inspection: '+$_.Exception.Message }
  elseif (Test-Path -LiteralPath $root) {
    $failure=$_.Exception.Message
    try { $empty=Test-DmEmptyInstallDirectory $root } catch { throw ('DAMENG_OUTCOME_UNKNOWN: DM installation directory could not be inspected after installer failure; '+$_.Exception.Message) }
    if (!$empty) { throw ('DAMENG_OUTCOME_UNKNOWN: DM installer left partial files; '+$failure) }
    throw
  }
  else { throw }
} finally {
  if (!$installerRunning) {
    if ($mounted) { try { Dismount-DiskImage -ImagePath $iso } catch { $result.warning=(@($result.warning,'DM media dismount failed: '+$_.Exception.Message) | Where-Object { $_ }) -join '; ' } }
    if ($xmlFile) { try { Remove-Item -LiteralPath $xmlFile -Force -ErrorAction Stop } catch { $result.warning=(@($result.warning,'DM temporary XML cleanup failed') | Where-Object { $_ }) -join '; ' } }
  }
}`
}

export function windowsRegistrationBody(installDir: string, iniFile: string, serviceName: string) {
  assertWindowsIdentity(installDir, iniFile, serviceName)
  const imagePath = `${argument(win32.join(installDir, 'bin', 'dmsvc.exe'))} database ${serviceName.slice(9)}`
  return `${windowsFunctions}
$root=${ps(installDir)}; $ini=${ps(iniFile)}; $name=${ps(serviceName)}; $expectedImage=${ps(imagePath)}
$proof=Assert-DmGlobalProof $root
$known=@($proof.instances | Where-Object { $_.name -ceq $name })
if ($known.Count -gt 1 -or ($known.Count -eq 1 -and (!([string]$known[0].ini).Equals($ini,[StringComparison]::OrdinalIgnoreCase) -or [string]$known[0].imagePath -cne $expectedImage))) { throw 'DM instance proof belongs to a different configuration or command' }
Assert-DmPath (Join-Path $root 'bin\\dmsvc.exe'); Assert-DmPath $ini
$key='Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Dameng\\'+$name
$existing=Get-CimInstance Win32_Service -Filter ("Name='"+$name+"'")
$keyPresent=Test-Path -LiteralPath $key
if (!$known.Count) {
  if ($existing -or $keyPresent) { throw 'Existing DM service or registry lacks this installation registration intent' }
  $instances=@($proof.instances | Where-Object { $_ })+@(@{name=$name;ini=$ini;imagePath=$expectedImage;phase='registration-intent'})
  $proof | Add-Member -MemberType NoteProperty -Name instances -Value $instances -Force
  [IO.File]::WriteAllText((Join-Path $root '${proofName}'),(ConvertTo-Json -InputObject $proof -Depth 6 -Compress))
  $known=@($proof.instances | Where-Object { $_.name -ceq $name })
}
if ([string]$known[0].phase -notin @('registration-intent','registered')) { throw 'DM service has no durable registration intent' }
if ($existing -and ($existing.State -ne 'Stopped' -or [int64]$existing.ProcessId -ne 0 -or [string]$existing.PathName -cne $expectedImage)) { throw 'DM service is running or its exact registration command changed; left untouched' }
$values=if ($keyPresent) { Get-ItemProperty -LiteralPath $key } else { $null }
$hasPath=$values -and ($values.PSObject.Properties.Name -contains 'path')
$hasModel=$values -and ($values.PSObject.Properties.Name -contains 'model')
if (($hasPath -and !([string]$values.path).Equals($ini,[StringComparison]::OrdinalIgnoreCase)) -or ($hasModel -and [string]$values.model -cne 'open')) { throw 'Conflicting present DM registry binding cannot be repaired' }
if (!$existing) { $null=New-Service -Name $name -BinaryPathName $expectedImage -DisplayName $name -StartupType Manual }
if (!$keyPresent) { $null=New-Item -Path $key -Force }
if (!$hasPath) { $null=New-ItemProperty -LiteralPath $key -Name 'path' -Value $ini -PropertyType String }
if (!$hasModel) { $null=New-ItemProperty -LiteralPath $key -Name 'model' -Value 'open' -PropertyType String }
$null=Get-OwnedDmService $root $ini $name
Set-Service -Name $name -StartupType Manual
$known[0].phase='registered'
[IO.File]::WriteAllText((Join-Path $root '${proofName}'),(ConvertTo-Json -InputObject $proof -Depth 6 -Compress))
$errors=@()
try { Grant-DmServiceAccess $name } catch { $errors+=('service: '+$_.Exception.Message) }
try { Grant-DmDirectoryAccess ([IO.Path]::GetDirectoryName($ini)) } catch { $errors+=('data: '+$_.Exception.Message) }
$log=Join-Path $root 'log'; if (Test-Path -LiteralPath $log) { try { Grant-DmDirectoryAccess $log } catch { $errors+=('log: '+$_.Exception.Message) } }
if ($errors.Count) { throw ('DM service registered; permissions incomplete: '+($errors -join '; ')) }
`
}

export function windowsServiceBody(
  installDir: string,
  iniFile: string,
  serviceName: string,
  action: 'status' | 'start' | 'stop',
  ownedPid = ''
) {
  assertWindowsIdentity(installDir, iniFile, serviceName)
  if (action === 'stop' && !/^[1-9]\d{0,9}$/.test(ownedPid))
    throw new Error('DM stop requires a positive owned PID')
  const bind = `$root=${ps(installDir)}; $ini=${ps(iniFile)}; $name=${ps(serviceName)}; $current=Get-OwnedDmService $root $ini $name`
  const control =
    action === 'status'
      ? ''
      : action === 'start'
        ? `if (!$current) { throw 'DM service is not registered' }; if ($current.State -ne 'Stopped') { throw 'DM service is already running outside FlyEnv' }; $service=Get-Service -Name $name; $service.Start(); $startAccepted=$true; $service.WaitForStatus('Running',[TimeSpan]::FromSeconds(60))`
        : `if (!$current) { throw 'Owned DM service disappeared' }; if ($current.State -ne 'Stopped') { if ([int64]$current.ProcessId -ne ${ownedPid}) { throw 'DM service PID changed; external service left untouched' }; Stop-DmOwnedService $name; $stopAccepted=$true; $service=Get-Service -Name $name; $service.WaitForStatus('Stopped',[TimeSpan]::FromSeconds(60)) }`
  const operation = `${bind}; ${control}; $current=Get-OwnedDmService $root $ini $name; if (!$current) { $result.state='Missing'; $result.pid='' } else { $result.state=[string]$current.State; $result.pid=if ([int64]$current.ProcessId -gt 0) { [string]$current.ProcessId } else { '' } }`
  // Keep control refusal known; after accepted control, failed observation is uncertain.
  return `${windowsFunctions}\n$startAccepted=$false; $stopAccepted=$false; try {\n${operation} } catch { if ($startAccepted) { throw ('DAMENG_OUTCOME_UNKNOWN: DM service start was accepted but its final state could not be confirmed: '+$_.Exception.Message) }; if ($stopAccepted) { throw ('DAMENG_OUTCOME_UNKNOWN: DM service stop was accepted but its final state could not be confirmed: '+$_.Exception.Message) }; throw }`
}

export function windowsUninstallBody(installDir: string) {
  assertPath(installDir)
  if (installDir.length <= 3) throw new Error('Invalid DM installation directory')
  return `${windowsFunctions}
$result.attempted=$false
$root=${ps(installDir)}; $uninstaller=Join-Path $root 'uninstall.exe'; Assert-DmPath $uninstaller; $proof=Assert-DmGlobalProof $root; Assert-DmRegistrationOwnership $root
$services=Get-DmServices
foreach ($service in $services) {
  if ($service.Name -cmatch '^DmServiceFLYENV[A-Z0-9]+$') {
    $instance=@($proof.instances | Where-Object { $_.name -ceq $service.Name })
    if ($instance.Count -ne 1) { throw 'DM service is missing its exact owned instance proof' }
    $null=Get-OwnedDmService $root ([string]$instance[0].ini) $service.Name
  } else {
    $record=@($proof.companions | Where-Object { $_.name -ceq $service.Name })
    $bin=Get-DmServiceBinary $service
    if ($record.Count -ne 1 -or !$bin.Equals([string]$record[0].binary,[StringComparison]::OrdinalIgnoreCase) -or $service.PathName -cne [string]$record[0].imagePath -or !$bin.StartsWith($root+'\\',[StringComparison]::OrdinalIgnoreCase)) { throw 'External DM services prevent safe official uninstallation' }
    Assert-DmPath $bin
  }
  if ($service.State -ne 'Stopped' -or [int64]$service.ProcessId -ne 0) { throw 'Running DM service prevents uninstallation; stop its owned PID first' }
}
if (Test-Path 'Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Dameng') { throw 'External 32-bit DM registry prevents uninstall' }
$registry='Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Dameng'
if (Test-Path $registry) { foreach ($key in Get-ChildItem -LiteralPath $registry) { if (@($services.Name) -notcontains $key.PSChildName) { throw 'Unrecognized DM registry registration prevents safe uninstall' } } }
$result.attempted=$true
$child=Start-Process -FilePath $uninstaller -WorkingDirectory $root -WindowStyle Normal -PassThru
$vendorWarning=$null
try { Wait-DmChild $child 35 } catch { if ($_.Exception.Message -match 'DAMENG_OUTCOME_UNKNOWN') { throw }; $vendorWarning=$_.Exception.Message }
if (Test-Path -LiteralPath (Join-Path $root 'bin\\dmserver.exe')) { throw 'Official DM uninstall did not remove the engine; data and installation facts retained' }
$result.uninstalled=$true
if ($vendorWarning) { $result.warning='DM engine removed; official uninstaller reported: '+$vendorWarning }
try { $remaining=@(Get-DmServices | Where-Object { @($services.Name) -contains $_.Name }); if ($remaining.Count) { $result.warning=(@($result.warning,'DM engine removed; official uninstaller left registered services: '+($remaining.Name -join ', ')) | Where-Object { $_ }) -join '; ' } } catch { $result.warning=(@($result.warning,'DM engine removed; remaining service query failed: '+$_.Exception.Message) | Where-Object { $_ }) -join '; ' }
`
}

export function windowsElevationScript(body: string, resultFile: string, powershell: string) {
  const operation = `$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; $result=@{ok=$false}; try { ${body}; $result.ok=$true } catch { $result.error=$_.Exception.Message } finally { [IO.File]::WriteAllText(${ps(resultFile)},(ConvertTo-Json -InputObject $result -Depth 6 -Compress),[Text.UTF8Encoding]::new($false)) }; if (!$result.ok) { exit 1 }`
  const loader =
    '$stream=[IO.MemoryStream]::new([Convert]::FromBase64String("__PAYLOAD__")); $gzip=[IO.Compression.GZipStream]::new($stream,[IO.Compression.CompressionMode]::Decompress); $reader=[IO.StreamReader]::new($gzip,[Text.Encoding]::UTF8); try { & ([scriptblock]::Create($reader.ReadToEnd())) } finally { $reader.Dispose(); $gzip.Dispose(); $stream.Dispose() }'
  return `$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; $identity=[Security.Principal.WindowsIdentity]::GetCurrent(); $principal=[Security.Principal.WindowsPrincipal]::new($identity); $groups=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes(($identity.Groups.Value -join ','))); $enabled=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes((@($identity.Groups | Where-Object { $principal.IsInRole($_) } | ForEach-Object { $_.Value }) -join ','))); $script='$callerDmHome='+([int][bool][Environment]::GetEnvironmentVariable('DM_HOME','User'))+';$callerSid="'+$identity.User.Value+'";$callerGroupSids=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String("'+$groups+'")).Split(",");$callerAllowGroupSids=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String("'+$enabled+'")).Split(",");'+${ps(operation)}; $buffer=[IO.MemoryStream]::new(); $zip=[IO.Compression.GZipStream]::new($buffer,[IO.Compression.CompressionMode]::Compress,$true); $bytes=[Text.Encoding]::UTF8.GetBytes($script); $zip.Write($bytes,0,$bytes.Length); $zip.Dispose(); $payload=[Convert]::ToBase64String($buffer.ToArray()); $buffer.Dispose(); $loader=${ps(loader)}.Replace('__PAYLOAD__',$payload); $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($loader)); if ($encoded.Length -gt 30000) { throw 'DM elevation request exceeds Windows command limit' }; try { $child=Start-Process -FilePath ${ps(powershell)} -ArgumentList ('-NoProfile -NonInteractive -EncodedCommand '+$encoded) -Verb RunAs -WindowStyle Hidden -PassThru } catch { $native=$_.Exception; while ($native) { if ($native -is [ComponentModel.Win32Exception] -and $native.NativeErrorCode -eq 1223) { throw 'DAMENG_UAC_CANCELED: Win32 1223; elevated transaction was not launched' }; $native=$native.InnerException }; throw }; $deadline=[DateTime]::UtcNow.AddMinutes(38); while (!$child.WaitForExit(500)) { if ([DateTime]::UtcNow -ge $deadline) { throw 'DAMENG_OUTCOME_UNKNOWN: elevated DM transaction is still running' } }; if (!(Test-Path -LiteralPath ${ps(resultFile)})) { throw 'DAMENG_OUTCOME_UNKNOWN: elevated DM transaction returned no result' }`
}

/** Compress before the initial native command too, including large XML/Unicode paths. */
export function encodeWindowsScript(script: string): string {
  const payload = gzipSync(Buffer.from(script, 'utf8')).toString('base64')
  const loader = `$stream=[IO.MemoryStream]::new([Convert]::FromBase64String(${ps(payload)})); $gzip=[IO.Compression.GZipStream]::new($stream,[IO.Compression.CompressionMode]::Decompress); $reader=[IO.StreamReader]::new($gzip,[Text.Encoding]::UTF8); try { & ([scriptblock]::Create($reader.ReadToEnd())) } finally { $reader.Dispose(); $gzip.Dispose(); $stream.Dispose() }`
  const encoded = Buffer.from(loader, 'utf16le').toString('base64')
  if (encoded.length > 30000) throw new Error('DM Windows request exceeds native command limit')
  return encoded
}

type WindowsResult = {
  ok: boolean
  error?: string
  installed?: boolean
  attempted?: boolean
  uninstalled?: boolean
  warning?: string
  handoffError?: string
  state?: string
  pid?: string
}

/** An explicit preflight fact alone authorizes restoring the previous manifest phase. */
export function windowsOperationError(result: {
  error?: string
  attempted?: boolean
}): Error & { noSideEffects?: boolean } {
  const error: Error & { noSideEffects?: boolean } = new Error(
    result.error ?? 'DM Windows operation failed'
  )
  if (result.attempted === false && !error.message.includes('DAMENG_OUTCOME_UNKNOWN'))
    error.noSideEffects = true
  return error
}

async function execute(body: string, elevated: boolean): Promise<WindowsResult> {
  if (process.platform !== 'win32')
    throw new Error('DM Windows backend requires native Windows x64')
  const powershell = win32.join(
    process.env.SystemRoot ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  )
  const directory = await mkdtemp(join(tmpdir(), 'flyenv-dameng-'))
  const resultFile = join(directory, 'result.json')
  let unknown = false
  try {
    const script = elevated
      ? windowsElevationScript(body, resultFile, powershell)
      : `$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; $result=@{ok=$false}; try { ${body}; $result.ok=$true } catch { $result.error=$_.Exception.Message } finally { [IO.File]::WriteAllText(${ps(resultFile)},(ConvertTo-Json -InputObject $result -Depth 6 -Compress),[Text.UTF8Encoding]::new($false)) }`
    await spawnWindowsCommand(powershell, [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      encodeWindowsScript(script)
    ])
    const result = JSON.parse(await readFile(resultFile, 'utf8')) as WindowsResult
    if (!result.ok) throw windowsOperationError(result)
    return result
  } catch (error) {
    unknown = String(error).includes('DAMENG_OUTCOME_UNKNOWN')
    throw error
  } finally {
    // Preserve transport while an elevated operation may still write its terminal result.
    if (!unknown)
      await rm(directory, { recursive: true, force: true }).catch((error) =>
        console.warn('[dameng] Windows result cleanup failed', error)
      )
  }
}

export async function windowsInstall(
  isoFile: string,
  installDir: string,
  xml: string
): Promise<{ installed: boolean; warning?: string; handoffError?: string }> {
  const result = await execute(windowsInstallBody(isoFile, installDir, xml), true)
  return {
    installed: result.installed === true,
    ...(result.handoffError ? { handoffError: result.handoffError } : {}),
    ...(result.warning ? { warning: result.warning } : {})
  }
}
export async function windowsRegisterService(
  installDir: string,
  iniFile: string,
  serviceName: string
): Promise<void> {
  await execute(windowsRegistrationBody(installDir, iniFile, serviceName), true)
}
export async function windowsServiceStatus(
  installDir: string,
  iniFile: string,
  serviceName: string
): Promise<{ state: string; pid: string }> {
  const result = await execute(
    windowsServiceBody(installDir, iniFile, serviceName, 'status'),
    false
  )
  return { state: result.state ?? 'Unknown', pid: result.pid ?? '' }
}
export async function windowsStartService(
  installDir: string,
  iniFile: string,
  serviceName: string
): Promise<{ pid: string }> {
  const result = await execute(windowsServiceBody(installDir, iniFile, serviceName, 'start'), false)
  if (result.state !== 'Running' || !/^[1-9]\d*$/.test(result.pid ?? ''))
    throw new Error(
      'DAMENG_OUTCOME_UNKNOWN: DM start outcome unknown; inspect service before retry'
    )
  return { pid: result.pid! }
}
export async function windowsStopService(
  installDir: string,
  iniFile: string,
  serviceName: string,
  ownedPid: string
): Promise<void> {
  const result = await execute(
    windowsServiceBody(installDir, iniFile, serviceName, 'stop', ownedPid),
    false
  )
  if (result.state !== 'Stopped' || result.pid)
    throw new Error('DAMENG_OUTCOME_UNKNOWN: DM stop outcome unknown; installation retained')
}
export async function windowsUninstall(
  installDir: string
): Promise<{ uninstalled: boolean; warning?: string }> {
  try {
    const result = await execute(windowsUninstallBody(installDir), true)
    return {
      uninstalled: result.uninstalled === true,
      ...(result.warning ? { warning: result.warning } : {})
    }
  } catch (error) {
    // This marker is emitted only from a native Win32 cancellation before ShellExecute launched.
    if (
      String(error).includes('DAMENG_UAC_CANCELED') &&
      !String(error).includes('DAMENG_OUTCOME_UNKNOWN')
    ) {
      throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
        noSideEffects: true
      })
    }
    throw error
  }
}
