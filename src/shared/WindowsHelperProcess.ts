type HelperProcessTarget = {
  instanceId: string
  sid: string
  executablePaths: string[]
}

/** 安装/停用共用归属与退出规则；任务状态不能证明独立启动的旧进程已经退出。 */
export const buildWindowsHelperProcessStopScript = (target: HelperProcessTarget): string => {
  const config = Buffer.from(JSON.stringify(target), 'utf8').toString('base64')
  return String.raw`
& {
  $helperStopConfig = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${config}')) | ConvertFrom-Json
  $helperStopPaths = @($helperStopConfig.executablePaths | ForEach-Object { [IO.Path]::GetFullPath([string]$_) })
  $instanceValue = '(?i:' + [regex]::Escape([string]$helperStopConfig.instanceId) + ')'
  $sidValue = '(?i:' + [regex]::Escape([string]$helperStopConfig.sid) + ')'
  $instanceArg = '--?instance-id(?:=|\s+)(?:"' + $instanceValue + '"|' + $instanceValue + ')'
  $sidArg = '--?expected-user-sid(?:=|\s+)(?:"' + $sidValue + '"|' + $sidValue + ')'
  # 完整参数匹配，不以 SID/实例 ID 子串或程序名证明归属；共享程序也可供其他 SID 使用。
  $helperCommandPattern = '^(?:"[^"]+"|[^\s"]+)\s+(?:' + $instanceArg + '\s+' + $sidArg + '|' + $sidArg + '\s+' + $instanceArg + ')\s*$'
  function Get-FlyEnvTargetHelperProcesses {
    foreach ($candidate in @(Get-CimInstance Win32_Process -Filter "Name LIKE 'flyenv-helper%'" -ErrorAction Stop)) {
      if ([string]::IsNullOrWhiteSpace($candidate.ExecutablePath)) { continue }
      $candidatePath = [IO.Path]::GetFullPath([string]$candidate.ExecutablePath)
      if ($helperStopPaths -notcontains $candidatePath) { continue }
      if ([string]$candidate.CommandLine -cmatch $helperCommandPattern) {
        $candidate
      } else {
        Write-Host "Skipping helper PID=$($candidate.ProcessId): arguments do not identify the target SID and instance"
      }
    }
  }
  $stopFailures = New-Object 'Collections.Generic.List[string]'
  foreach ($candidate in @(Get-FlyEnvTargetHelperProcesses)) {
    $ownedProcess = $null
    try {
      try { $ownedProcess = [Diagnostics.Process]::GetProcessById([int]$candidate.ProcessId) }
      catch [ArgumentException] { continue }
      # 固定原进程句柄，并与首次 CIM 创建时间比较；PID 被复用时保留后来进程。
      $null = $ownedProcess.Handle
      if ($ownedProcess.HasExited) { continue }
      $created = $ownedProcess.StartTime.ToUniversalTime().ToString('yyyyMMddHHmmss.ffffff', [Globalization.CultureInfo]::InvariantCulture)
      $expectedCreated = $candidate.CreationDate.ToUniversalTime().ToString('yyyyMMddHHmmss.ffffff', [Globalization.CultureInfo]::InvariantCulture)
      if ($created -cne $expectedCreated) {
        Write-Host "Skipping helper PID=$($candidate.ProcessId): process identity changed"
        continue
      }
      Write-Host "Stopping helper PID=$($candidate.ProcessId) instance=$($helperStopConfig.instanceId) expectedUserSid=$($helperStopConfig.sid)"
      $ownedProcess.Kill()
      if (-not $ownedProcess.WaitForExit(10000)) { throw 'Target Helper did not exit after termination' }
    } catch {
      $stopFailure = $_.Exception.Message
      $exited = $false
      if ($null -ne $ownedProcess) { try { $exited = $ownedProcess.HasExited } catch {} }
      if (-not $exited) { $stopFailures.Add("PID=$($candidate.ProcessId): $stopFailure") }
    } finally {
      if ($null -ne $ownedProcess) { $ownedProcess.Dispose() }
    }
  }
  $remaining = @(Get-FlyEnvTargetHelperProcesses)
  if ($remaining.Count -gt 0 -or $stopFailures.Count -gt 0) {
    throw ("Target SID Helper shutdown is incomplete. Remaining PIDs: " + (($remaining | ForEach-Object { $_.ProcessId }) -join ', ') + "; " + ($stopFailures -join '; '))
  }
}
`
}
