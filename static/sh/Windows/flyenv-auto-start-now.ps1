[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$rootFolder = $null
$registeredTask = $null
$taskRegistered = $false
$taskStarted = $false
$pendingAllowFile = $null
$allowFileBackup = $null
$allowFileInstalled = $false

function Throw-InstallerError {
  param(
    [Parameter(Mandatory = $true)][string]$Code,
    [Parameter(Mandatory = $true)][string]$Message
  )

  throw "FLYENV_HELPER_INSTALL_ERROR:${Code}:$Message"
}

function Assert-NotReparsePoint {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Label
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  $item = Get-Item -LiteralPath $Path -Force
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    Throw-InstallerError -Code 'helper_acl_invalid' -Message "$Label must not be a reparse point: $Path"
  }
}

function Assert-PathHasNoReparsePoints {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Label
  )

  $canonicalPath = [System.IO.Path]::GetFullPath($Path)
  $candidate = $canonicalPath
  while ($true) {
    Assert-NotReparsePoint -Path $candidate -Label $Label
    $parent = [System.IO.Directory]::GetParent($candidate)
    if ($null -eq $parent -or $parent.FullName -eq $candidate) {
      break
    }
    $candidate = $parent.FullName
  }
  return $canonicalPath
}

function Set-AllowedRootsDirectoryAcl {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)]$AdminSid,
    [Parameter(Mandatory = $true)]$SystemSid,
    [Parameter(Mandatory = $true)]$UserSid
  )

  $acl = New-Object System.Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true, $false)
  $acl.SetOwner($AdminSid)
  $acl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($AdminSid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
  $acl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($SystemSid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
  $acl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($UserSid, 'ReadAndExecute', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
  Set-Acl -LiteralPath $Path -AclObject $acl -ErrorAction Stop
}

function Set-AllowedRootsFileAcl {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)]$AdminSid,
    [Parameter(Mandatory = $true)]$SystemSid,
    [Parameter(Mandatory = $true)]$UserSid
  )

  $acl = New-Object System.Security.AccessControl.FileSecurity
  $acl.SetAccessRuleProtection($true, $false)
  $acl.SetOwner($AdminSid)
  $acl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($AdminSid, 'FullControl', 'None', 'None', 'Allow')))
  $acl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($SystemSid, 'FullControl', 'None', 'None', 'Allow')))
  $acl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($UserSid, 'Read', 'None', 'None', 'Allow')))
  Set-Acl -LiteralPath $Path -AclObject $acl -ErrorAction Stop
}

function Assert-AllowedRootsAcl {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)]$AdminSid,
    [Parameter(Mandatory = $true)]$SystemSid
  )

  $acl = Get-Acl -LiteralPath $Path -ErrorAction Stop
  if (-not $acl.AreAccessRulesProtected) {
    Throw-InstallerError -Code 'helper_acl_invalid' -Message "ACL inheritance is enabled for $Path"
  }
  $owner = $acl.GetOwner([System.Security.Principal.SecurityIdentifier])
  if ($owner.Value -ne $AdminSid.Value -and $owner.Value -ne $SystemSid.Value) {
    Throw-InstallerError -Code 'helper_acl_invalid' -Message "Untrusted owner for ${Path}: $($owner.Value)"
  }

  $writeMask = [System.Security.AccessControl.FileSystemRights]::WriteData -bor
    [System.Security.AccessControl.FileSystemRights]::AppendData -bor
    [System.Security.AccessControl.FileSystemRights]::CreateFiles -bor
    [System.Security.AccessControl.FileSystemRights]::CreateDirectories -bor
    [System.Security.AccessControl.FileSystemRights]::WriteExtendedAttributes -bor
    [System.Security.AccessControl.FileSystemRights]::WriteAttributes -bor
    [System.Security.AccessControl.FileSystemRights]::Delete -bor
    [System.Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor
    [System.Security.AccessControl.FileSystemRights]::ChangePermissions -bor
    [System.Security.AccessControl.FileSystemRights]::TakeOwnership
  $trustedFullControl = @{
    $AdminSid.Value = $false
    $SystemSid.Value = $false
  }
  $rules = $acl.GetAccessRules($true, $false, [System.Security.Principal.SecurityIdentifier])
  foreach ($rule in $rules) {
    if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) {
      continue
    }
    $sid = $rule.IdentityReference.Value
    $rights = [int64]$rule.FileSystemRights
    if ($trustedFullControl.ContainsKey($sid)) {
      if (($rights -band [int64][System.Security.AccessControl.FileSystemRights]::FullControl) -eq [int64][System.Security.AccessControl.FileSystemRights]::FullControl) {
        $trustedFullControl[$sid] = $true
      }
      continue
    }
    if (($rights -band [int64]$writeMask) -ne 0) {
      Throw-InstallerError -Code 'helper_acl_invalid' -Message "Untrusted SID $sid has write access to $Path"
    }
  }
  foreach ($trustedSid in $trustedFullControl.Keys) {
    if (-not $trustedFullControl[$trustedSid]) {
      Throw-InstallerError -Code 'helper_acl_invalid' -Message "Trusted SID $trustedSid lacks full control for $Path"
    }
  }
}

function Resolve-UserSid {
  param([Parameter(Mandatory = $true)][string]$Identity)

  try {
    return New-Object System.Security.Principal.SecurityIdentifier($Identity)
  } catch {
    return (New-Object System.Security.Principal.NTAccount($Identity)).Translate([System.Security.Principal.SecurityIdentifier])
  }
}

function Assert-RegisteredTaskConfiguration {
  param(
    [Parameter(Mandatory = $true)]$Task,
    [Parameter(Mandatory = $true)][string]$ExePath,
    [Parameter(Mandatory = $true)]$AppUserSid,
    [Parameter(Mandatory = $true)][string]$ExpectedArguments
  )

  $actualSid = Resolve-UserSid -Identity $Task.Definition.Principal.UserId
  if ($actualSid.Value -ne $AppUserSid.Value) {
    Throw-InstallerError -Code 'helper_task_invalid' -Message "Scheduled task user SID does not match FlyEnv user"
  }
  if ($Task.Definition.Principal.LogonType -ne 3 -or $Task.Definition.Principal.RunLevel -ne 1) {
    Throw-InstallerError -Code 'helper_task_invalid' -Message 'Scheduled task principal is not configured for the expected interactive elevated token'
  }
  if ($Task.Definition.Actions.Count -ne 1) {
    Throw-InstallerError -Code 'helper_task_invalid' -Message 'Scheduled task must contain exactly one helper action'
  }
  $actualAction = $Task.Definition.Actions.Item(1)
  if (-not [string]::Equals([System.IO.Path]::GetFullPath($actualAction.Path), [System.IO.Path]::GetFullPath($ExePath), [System.StringComparison]::OrdinalIgnoreCase)) {
    Throw-InstallerError -Code 'helper_task_invalid' -Message 'Scheduled task action path does not match helper binary'
  }
  if ($actualAction.Arguments -ne $ExpectedArguments) {
    Throw-InstallerError -Code 'helper_task_invalid' -Message 'Scheduled task action arguments do not match helper identity contract'
  }
}

function Remove-TaskIfExists {
  param(
    [Parameter(Mandatory = $true)]$RootFolder,
    [Parameter(Mandatory = $true)][string]$TaskName
  )

  try {
    $existingTask = $RootFolder.GetTask($TaskName)
  } catch {
    if ($_.Exception.HResult -ne -2147024894) {
      throw
    }
    return
  }
  if ($existingTask) {
    $RootFolder.DeleteTask($TaskName, 0)
  }
}

try {
  $taskName = '#TASKNAME#'
  $exePath = '#EXECPATH#'
  $dataPath = '#DATAPATH#'
  $appUserName = "#APPUSERNAME#"
  $appUserSid = New-Object System.Security.Principal.SecurityIdentifier("#APPUSERSID#")
  $keyPath = "#KEYPATH#"
  $programData = $env:ProgramData
  if ($null -eq $programData -or $programData -eq "") {
    $programData = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::CommonApplicationData)
    if ($null -eq $programData -or $programData -eq "") {
      $programData = "C:\ProgramData"
    }
  }
  $allowDir = Join-Path $programData 'FlyEnv'
  $adminSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')
  $systemSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')

  if ([string]::IsNullOrWhiteSpace($appUserName) -or [string]::IsNullOrWhiteSpace($keyPath)) {
    Throw-InstallerError -Code 'helper_task_invalid' -Message 'FlyEnv user identity or stable key path is missing'
  }
  if ([string]::IsNullOrWhiteSpace($exePath) -or -not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
    Throw-InstallerError -Code 'helper_binary_missing' -Message "FlyEnv helper binary not found: $exePath"
  }
  if ([string]::IsNullOrWhiteSpace($dataPath)) {
    Throw-InstallerError -Code 'helper_acl_invalid' -Message 'FlyEnv data path is empty'
  }
  $dataPath = Assert-PathHasNoReparsePoints -Path $dataPath -Label 'FlyEnv data directory'
  if (-not (Test-Path -LiteralPath $dataPath)) {
    New-Item -Path $dataPath -ItemType Directory -Force | Out-Null
    try {
      $dataAcl = Get-Acl -LiteralPath $dataPath
      $dataAcl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($appUserName, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
      Set-Acl -LiteralPath $dataPath -AclObject $dataAcl -ErrorAction Stop
    } catch {
      Throw-InstallerError -Code 'helper_acl_invalid' -Message "Failed to grant FlyEnv user access to data directory: $($_.Exception.Message)"
    }
  } elseif (-not (Test-Path -LiteralPath $dataPath -PathType Container)) {
    Throw-InstallerError -Code 'helper_acl_invalid' -Message "FlyEnv data path is not a directory: $dataPath"
  }
  $dataPath = Assert-PathHasNoReparsePoints -Path $dataPath -Label 'FlyEnv data directory'

  $allowDir = Assert-PathHasNoReparsePoints -Path $allowDir -Label 'FlyEnv allowed roots directory'
  $allowFile = Join-Path $allowDir 'flyenv.allowed-roots'
  if (-not (Test-Path -LiteralPath $allowDir -PathType Container)) {
    New-Item -Path $allowDir -ItemType Directory -Force | Out-Null
  }
  $allowDir = Assert-PathHasNoReparsePoints -Path $allowDir -Label 'FlyEnv allowed roots directory'
  $allowFile = Join-Path $allowDir 'flyenv.allowed-roots'
  Assert-NotReparsePoint -Path $allowFile -Label 'FlyEnv allowed roots file'
  if ((Test-Path -LiteralPath $allowFile) -and (Get-Item -LiteralPath $allowFile -Force).PSIsContainer) {
    Throw-InstallerError -Code 'helper_acl_invalid' -Message "FlyEnv allowed roots path is not a file: $allowFile"
  }

  try {
    Set-AllowedRootsDirectoryAcl -Path $allowDir -AdminSid $adminSid -SystemSid $systemSid -UserSid $appUserSid
    Assert-AllowedRootsAcl -Path $allowDir -AdminSid $adminSid -SystemSid $systemSid
    $roots = @($dataPath, (Split-Path -Parent $exePath)) |
      Where-Object { $_ -and $_.Trim().Length -gt 0 } |
      ForEach-Object { [System.IO.Path]::GetFullPath($_) } |
      Sort-Object -Unique
    if ($roots.Count -eq 0) {
      Throw-InstallerError -Code 'helper_acl_invalid' -Message 'FlyEnv allowed roots list is empty'
    }
    $pendingAllowFile = Join-Path $allowDir ("flyenv.allowed-roots.$([Guid]::NewGuid().ToString('N')).pending")
    Set-Content -LiteralPath $pendingAllowFile -Value $roots -Encoding UTF8 -ErrorAction Stop
    Assert-NotReparsePoint -Path $pendingAllowFile -Label 'FlyEnv pending allowed roots file'
    Set-AllowedRootsFileAcl -Path $pendingAllowFile -AdminSid $adminSid -SystemSid $systemSid -UserSid $appUserSid
    Assert-AllowedRootsAcl -Path $pendingAllowFile -AdminSid $adminSid -SystemSid $systemSid
    if (Test-Path -LiteralPath $allowFile) {
      $allowFileBackup = Join-Path $allowDir ("flyenv.allowed-roots.$([Guid]::NewGuid().ToString('N')).backup")
      [System.IO.File]::Replace($pendingAllowFile, $allowFile, $allowFileBackup, $true)
    } else {
      Move-Item -LiteralPath $pendingAllowFile -Destination $allowFile -ErrorAction Stop
    }
    $pendingAllowFile = $null
    $allowFileInstalled = $true
    Assert-AllowedRootsAcl -Path $allowFile -AdminSid $adminSid -SystemSid $systemSid
    if ($allowFileBackup -and (Test-Path -LiteralPath $allowFileBackup)) {
      Remove-Item -LiteralPath $allowFileBackup -Force -ErrorAction Stop
    }
    $allowFileBackup = $null
    $allowFileInstalled = $false
  } catch {
    if ($_.Exception.Message -like 'FLYENV_HELPER_INSTALL_ERROR:*') {
      throw
    }
    Throw-InstallerError -Code 'helper_acl_invalid' -Message "Failed to lock or verify allowed roots permissions: $($_.Exception.Message)"
  }

  $helperProcessNames = @([System.IO.Path]::GetFileNameWithoutExtension($exePath), 'flyenv-helper*') | Sort-Object -Unique
  $runningProcesses = @(
    foreach ($helperProcessName in $helperProcessNames) {
      Get-Process -Name $helperProcessName -ErrorAction SilentlyContinue
    }
  )
  $runningProcesses = @($runningProcesses | Sort-Object Id -Unique)
  if ($runningProcesses.Count -gt 0) {
    try {
      $runningProcesses | Stop-Process -Force -ErrorAction Stop
      Wait-Process -Id $runningProcesses.Id -Timeout 5 -ErrorAction Stop
    } catch {
      $remainingProcesses = @(Get-Process -Id $runningProcesses.Id -ErrorAction SilentlyContinue)
      if ($remainingProcesses.Count -gt 0) {
        Throw-InstallerError -Code 'helper_task_start_failed' -Message "Existing FlyEnv helper is still running: $($_.Exception.Message)"
      }
    }
  }

  Write-Host 'Creating scheduled task via API...'
  $scheduler = New-Object -ComObject 'Schedule.Service'
  $scheduler.Connect()
  $rootFolder = $scheduler.GetFolder('\')
  foreach ($existingTaskName in @($taskName, 'flyenv-helper') | Sort-Object -Unique) {
    Remove-TaskIfExists -RootFolder $rootFolder -TaskName $existingTaskName
  }

  $taskDefinition = $scheduler.NewTask(0)
  $taskDefinition.RegistrationInfo.Description = 'FlyEnv Helper Auto Start'
  $taskDefinition.RegistrationInfo.Author = $appUserName
  $taskDefinition.Settings.ExecutionTimeLimit = 'PT0S'
  $taskDefinition.Settings.DisallowStartIfOnBatteries = $false
  $taskDefinition.Settings.StopIfGoingOnBatteries = $false
  $trigger = $taskDefinition.Triggers.Create(9)
  $trigger.Enabled = $true
  $trigger.UserId = $appUserName
  $action = $taskDefinition.Actions.Create(0)
  $action.Path = $exePath
  $action.Arguments = "--key-path `"$keyPath`" --expected-user-sid `"$($appUserSid.Value)`""
  $taskDefinition.Principal.UserId = $appUserName
  $taskDefinition.Principal.LogonType = 3
  $taskDefinition.Principal.RunLevel = 1

  try {
    $rootFolder.RegisterTaskDefinition($taskName, $taskDefinition, 6, $appUserName, $null, 3)
    $taskRegistered = $true
    $registeredTask = $rootFolder.GetTask($taskName)
    if (-not $registeredTask) {
      Throw-InstallerError -Code 'helper_task_invalid' -Message "Scheduled task was not registered: $taskName"
    }
    Assert-RegisteredTaskConfiguration -Task $registeredTask -ExePath $exePath -AppUserSid $appUserSid -ExpectedArguments $action.Arguments
    $runningTask = $registeredTask.Run($null)
    if (-not $runningTask) {
      Throw-InstallerError -Code 'helper_task_start_failed' -Message 'Task Scheduler did not return a running helper task'
    }
    $taskStarted = $true
  } catch {
    if ($_.Exception.Message -like 'FLYENV_HELPER_INSTALL_ERROR:*') {
      throw
    }
    Throw-InstallerError -Code 'helper_task_invalid' -Message "Failed to register or start FlyEnv helper task: $($_.Exception.Message)"
  }

  Write-Host "Task '$taskName' started successfully via API."
  exit 0
}
catch {
  if ($allowFileBackup -and (Test-Path -LiteralPath $allowFileBackup)) {
    try {
      [System.IO.File]::Replace($allowFileBackup, $allowFile, $null, $true)
    } catch {}
  } elseif ($allowFileInstalled -and $allowFile -and (Test-Path -LiteralPath $allowFile)) {
    try {
      Remove-Item -LiteralPath $allowFile -Force -ErrorAction Stop
    } catch {}
  }
  if ($pendingAllowFile -and (Test-Path -LiteralPath $pendingAllowFile)) {
    try {
      Remove-Item -LiteralPath $pendingAllowFile -Force -ErrorAction Stop
    } catch {}
  }
  if ($taskStarted -and $registeredTask) {
    try {
      $registeredTask.Stop(0)
    } catch {}
  }
  if ($taskRegistered -and $rootFolder) {
    try {
      $rootFolder.DeleteTask($taskName, 0)
    } catch {}
  }
  $message = $_.Exception.Message
  if ($message -notlike 'FLYENV_HELPER_INSTALL_ERROR:*') {
    $message = "FLYENV_HELPER_INSTALL_ERROR:helper_execution_failed:$message"
  }
  [Console]::Error.WriteLine($message)
  exit 1
}
