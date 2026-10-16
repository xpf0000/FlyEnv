import { win32 } from 'node:path'
import { windowsArgument } from './runtime'
import { mssqlMajorOfVersion } from './version'

const psString = (value: string) => `'${value.replaceAll("'", "''")}'`
const serviceFilter = (service: string) => psString(`Name='${service.replaceAll("'", "\\'")}'`)

export function windowsConfigurationManagerPath(version: string, systemRoot: string): string {
  const major = mssqlMajorOfVersion(version)
  if (!/^\d{1,2}$/.test(major) || Number(major) < 11) {
    throw new Error('Invalid SQL Server product version')
  }
  return win32.join(systemRoot, 'SysWOW64', `SQLServerManager${major}.msc`)
}

/** Acknowledge launch; the official panel owns its lifetime after this request. */
export function windowsConfigurationManagerScript(mmc: string, consoleFile: string): string {
  const args = [consoleFile, '/32'].map(windowsArgument).join(' ')
  return `$ErrorActionPreference='Stop'; $p=Start-Process -FilePath ${psString(mmc)} -ArgumentList ${psString(args)} -Verb RunAs -WindowStyle Normal -PassThru; if (!$p) { throw 'SQL Server Configuration Manager was not launched' }; if ($p.WaitForExit(1500) -and $p.ExitCode -ne 0) { throw "SQL Server Configuration Manager exited $($p.ExitCode)" }`
}

export function windowsOperationScript(body: string, resultFile: string): string {
  return `$ErrorActionPreference='Stop'; $result=@{ok=$false; installed=$false}; try { ${body}; $result.ok=$true } catch { $result.error=$_.Exception.Message } finally { [IO.File]::WriteAllText(${psString(resultFile)}, (ConvertTo-Json -InputObject $result -Compress)) }; if (!$result.ok) { exit 1 }`
}

/** Compress the complete runtime script, including the captured token groups. */
export function windowsEncodeElevationScript(): string {
  const loader =
    '$stream=[IO.MemoryStream]::new([Convert]::FromBase64String("__FLYENV_PAYLOAD__")); $gzip=[IO.Compression.GZipStream]::new($stream,[IO.Compression.CompressionMode]::Decompress); $reader=[IO.StreamReader]::new($gzip,[Text.Encoding]::UTF8); try { & ([scriptblock]::Create($reader.ReadToEnd())) } finally { $reader.Dispose(); $gzip.Dispose(); $stream.Dispose() }'
  return `$buffer=[IO.MemoryStream]::new(); $zip=$null; try { $zip=[IO.Compression.GZipStream]::new($buffer,[IO.Compression.CompressionMode]::Compress,$true); $bytes=[Text.Encoding]::UTF8.GetBytes($script); $zip.Write($bytes,0,$bytes.Length); $zip.Dispose(); $payload=[Convert]::ToBase64String($buffer.ToArray()) } finally { if ($zip) { $zip.Dispose() }; $buffer.Dispose() }; $loader=${psString(loader)}.Replace('__FLYENV_PAYLOAD__',$payload); $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($loader)); if ($encoded.Length -gt 30000) { throw 'SQL Server elevation request exceeds the Windows command limit' }`
}

/** Capture the caller before UAC, including when different admin credentials are used. */
export function windowsElevationScript(
  body: string,
  resultFile: string,
  powershell: string
): string {
  const script = windowsOperationScript(body, resultFile)
  return `$ErrorActionPreference='Stop'; [Console]::OutputEncoding=New-Object Text.UTF8Encoding($false); $identity=[Security.Principal.WindowsIdentity]::GetCurrent(); $caller=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($identity.Name)); $groups=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes(($identity.Groups.Value -join ','))); $principal=[Security.Principal.WindowsPrincipal]::new($identity); $enabled=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes((@($identity.Groups | Where-Object { $principal.IsInRole($_) } | ForEach-Object { $_.Value }) -join ','))); $script='$callerAllowGroupSids=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String("' + $enabled + '")).Split(",");$callerGroupSids=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String("' + $groups + '")).Split(",");$callerSid="' + $identity.User.Value + '";$caller=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String("' + $caller + '"));' + ${psString(script)}; ${windowsEncodeElevationScript()}; $p=Start-Process -FilePath ${psString(powershell)} -ArgumentList ('-NoProfile -NonInteractive -EncodedCommand ' + $encoded) -Verb RunAs -WindowStyle Hidden -Wait -PassThru; if (!(Test-Path -LiteralPath ${psString(resultFile)})) { throw "SQL Server elevated operation exited $($p.ExitCode) without a result" }; [IO.File]::ReadAllText(${psString(resultFile)})`
}

export function windowsServiceControlBody(
  service: string,
  action: 'start' | 'stop',
  expectedPid?: string,
  accessBody = ''
): string {
  if (!/^MSSQL(?:SERVER|\$[^"\r\n\\/]+)$/i.test(service)) {
    throw new Error('Invalid SQL Server service name')
  }
  if (action === 'stop' && !/^[1-9]\d*$/.test(expectedPid ?? '')) {
    throw new Error('SQL Server stop requires its owned PID')
  }
  // Recheck after UAC: the pre-elevation observation may no longer be current.
  const guard =
    action === 'start'
      ? `if ($current.State -ne 'Stopped') { throw 'SQL Server service is already running outside FlyEnv' }; Start-Service -InputObject (Get-Service -Name $name)`
      : `if ($current.State -ne 'Stopped') { if ($current.ProcessId -ne ${expectedPid}) { throw 'SQL Server service PID changed; external service left untouched' }; Stop-Service -InputObject (Get-Service -Name $name) }`
  const supplementaryAccess = accessBody
    ? `; try { ${accessBody} } catch { $result.permissionError=$_.Exception.Message }`
    : ''
  return `$name=${psString(service)}; $current=Get-CimInstance Win32_Service -Filter ${serviceFilter(service)}; if (!$current) { throw 'SQL Server service could not be found' }; ${guard}${supplementaryAccess}`
}

/** Setup creates/starts the engine even with Manual startup; hand it back stopped. */
export function windowsInstallBody(
  setup: string,
  args: string[],
  service: string,
  accessBody = ''
): string {
  return `$name=${psString(service)}; if (Get-CimInstance Win32_Service -Filter ${serviceFilter(service)}) { throw 'SQL Server instance already exists; refresh the installed list' }; $arguments=${psString(args.map(windowsArgument).join(' '))} + ' "/SQLSYSADMINACCOUNTS=' + $caller + '"'; $p=Start-Process -FilePath ${psString(setup)} -ArgumentList $arguments -WorkingDirectory ${psString(win32.dirname(setup))} -WindowStyle Hidden -Wait -PassThru; $result.setupExitCode=$p.ExitCode; if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { throw "SQL Server Setup exited $($p.ExitCode). See Microsoft SQL Server Setup Bootstrap\\Log for details" }; $result.installed=$true; $result.rebootRequired=($p.ExitCode -eq 3010); $service=Get-Service -Name $name; Set-Service -InputObject $service -StartupType Manual; $service.Refresh(); if ($service.Status -ne 'Stopped') { $service.Stop() }; $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(60)); $service.Refresh(); if ($service.Status -ne 'Stopped') { throw 'The newly installed SQL Server service did not stop' }; ${accessBody}`
}
