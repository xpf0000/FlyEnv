[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$rootFolder = $null
$registeredTask = $null
$taskRegistered = $false
$taskStarted = $false
$pendingAllowFile = $null
$allowFileBackup = $null
$allowFileInstalled = $false
$pendingHelperFile = $null
$pendingKeyFile = $null
$pendingInstanceConfigFile = $null

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

function Set-HelperSharedDirectoryAcl {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)]$AdminSid,
    [Parameter(Mandatory = $true)]$SystemSid
  )

  $usersSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-545')
  $acl = New-Object System.Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true, $false)
  $acl.SetOwner($AdminSid)
  $acl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($AdminSid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
  $acl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($SystemSid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
  $acl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($usersSid, 'ReadAndExecute', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
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

function Get-HelperInstanceId {
  param([Parameter(Mandatory = $true)][string]$Sid)
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $sidHash = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Sid.ToUpperInvariant()))
    return -join @($sidHash[0..15] | ForEach-Object { $_.ToString('x2') })
  } finally {
    $sha.Dispose()
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
  if ($actualSid.Value -ne 'S-1-5-18') {
    Throw-InstallerError -Code 'helper_task_invalid' -Message 'Scheduled task principal is not SYSTEM'
  }
  if ($Task.Definition.Principal.LogonType -ne 5 -or $Task.Definition.Principal.RunLevel -ne 1) {
    Throw-InstallerError -Code 'helper_task_invalid' -Message 'Scheduled task principal must use ServiceAccount/Highest'
  }
  if ($Task.Definition.Triggers.Count -ne 1 -or $Task.Definition.Triggers.Item(1).UserId -ne $AppUserSid.Value) {
    Throw-InstallerError -Code 'helper_task_invalid' -Message 'Scheduled task trigger must belong to the target SID'
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

function Get-OrCreateTaskFolder {
  param(
    [Parameter(Mandatory = $true)]$Scheduler,
    [Parameter(Mandatory = $true)][string]$FolderPath,
    [Parameter(Mandatory = $true)][string]$FolderSddl
  )

  $currentFolder = $Scheduler.GetFolder('\')
  $currentPath = ''
  foreach ($segment in @($FolderPath.Trim('\').Split('\') | Where-Object { $_ })) {
    $currentPath = "${currentPath}\${segment}"
    try {
      $currentFolder = $Scheduler.GetFolder($currentPath)
    } catch {
      if ($_.Exception.HResult -ne -2147024894) {
        throw
      }
      $currentFolder.CreateFolder($segment, $FolderSddl) | Out-Null
      $currentFolder = $Scheduler.GetFolder($currentPath)
    }
    $currentFolder.SetSecurityDescriptor($FolderSddl, 0)
  }
  return $currentFolder
}

function Get-TaskIfExists {
  param(
    [Parameter(Mandatory = $true)]$TaskFolder,
    [Parameter(Mandatory = $true)][string]$TaskName
  )
  try { return $TaskFolder.GetTask($TaskName) } catch {
    if ($_.Exception.HResult -ne -2147024894) { throw }
    return $null
  }
}

try {
  $config = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('#INSTALL_CONFIG#')) | ConvertFrom-Json
  $instanceId = [string]$config.identity.instanceId
  $instanceRoot = [string]$config.identity.instanceRoot
  $taskFolderPath = [string]$config.identity.taskFolder
  $taskName = [string]$config.identity.taskName
  $exePath = [string]$config.executable
  $backupExePath = [string]$config.backupExecutable
  $dataPath = [string]$config.dataPath
  $appUserName = [string]$config.identity.account
  $appUserSid = New-Object System.Security.Principal.SecurityIdentifier([string]$config.identity.sid)
  $keyPath = [string]$config.identity.keyPath
  $allowFile = [string]$config.identity.allowedRootsPath
  $instanceConfigPath = [string]$config.identity.instanceConfigPath
  $pipeName = [string]$config.identity.pipeName
  $stage = 'validate-target'
  Write-Host "targetUserName=$appUserName targetUserSid=$($appUserSid.Value) helperInstanceId=$instanceId targetHelperKeyPath=$keyPath elevatedUserName=$([Security.Principal.WindowsIdentity]::GetCurrent().Name)"
  $programData = $env:ProgramData
  if ($null -eq $programData -or $programData -eq "") {
    $programData = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::CommonApplicationData)
    if ($null -eq $programData -or $programData -eq "") {
      $programData = "C:\ProgramData"
    }
  }
  $flyenvRoot = Join-Path $programData 'FlyEnv'
  $helperRoot = Join-Path $flyenvRoot 'Helper'
  $usersRoot = Join-Path $helperRoot 'users'
  $adminSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')
  $systemSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')

  if ([string]::IsNullOrWhiteSpace($appUserName) -or $instanceId -notmatch '^[0-9a-f]{32}$') {
    Throw-InstallerError -Code 'helper_task_invalid' -Message 'FlyEnv user identity or helper instance ID is invalid'
  }
  $expectedInstanceId = Get-HelperInstanceId -Sid $appUserSid.Value
  if ($instanceId -ne $expectedInstanceId) {
    Throw-InstallerError -Code 'helper_task_invalid' -Message 'Helper instance ID does not match target SID'
  }
  $expectedInstanceRoot = Join-Path $usersRoot $instanceId
  $expectedExePath = Join-Path $expectedInstanceRoot 'bin\flyenv-helper.exe'
  $expectedKeyPath = Join-Path $expectedInstanceRoot 'helper.key'
  $expectedAllowFile = Join-Path $expectedInstanceRoot 'allowed-roots'
  $expectedInstanceConfigPath = Join-Path $expectedInstanceRoot 'instance.json'
  $expectedPipeName = "FlyEnv.Helper.$instanceId"
  if ($instanceRoot -ne $expectedInstanceRoot -or $exePath -ne $expectedExePath -or $keyPath -ne $expectedKeyPath -or $allowFile -ne $expectedAllowFile -or $instanceConfigPath -ne $expectedInstanceConfigPath) {
    Throw-InstallerError -Code 'helper_task_invalid' -Message 'Helper instance paths do not match the target SID namespace'
  }
  if ($pipeName -ne $expectedPipeName) {
    Throw-InstallerError -Code 'helper_task_invalid' -Message 'Helper pipe name does not match the target SID namespace'
  }
  if ($taskFolderPath -ne '\FlyEnv\Helper' -or $taskName -ne $instanceId) {
    Throw-InstallerError -Code 'helper_task_invalid' -Message 'Helper task path does not match the target SID namespace'
  }
  if ([string]::IsNullOrWhiteSpace($exePath)) {
    Throw-InstallerError -Code 'helper_binary_missing' -Message 'FlyEnv helper binary path is empty'
  }
  if ((Test-Path -LiteralPath $exePath) -and -not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
    Throw-InstallerError -Code 'helper_binary_missing' -Message "FlyEnv helper binary path is not a file: $exePath"
  }
  if ([string]::IsNullOrWhiteSpace($backupExePath) -or -not (Test-Path -LiteralPath $backupExePath -PathType Leaf)) {
    Throw-InstallerError -Code 'helper_binary_missing' -Message "FlyEnv helper backup binary not found: $backupExePath"
  }
  $backupHash = (Get-FileHash -LiteralPath $backupExePath -Algorithm SHA256 -ErrorAction Stop).Hash
  if (Test-Path -LiteralPath ([string]$config.sourceExecutable) -PathType Leaf) {
    $sourceHash = (Get-FileHash -LiteralPath ([string]$config.sourceExecutable) -Algorithm SHA256 -ErrorAction Stop).Hash
    if (-not [string]::Equals($sourceHash, $backupHash, [System.StringComparison]::OrdinalIgnoreCase)) {
      Throw-InstallerError -Code 'helper_execution_failed' -Message 'FlyEnv packaged helper fingerprints do not match'
    }
  }
  $helperNeedsRestore = $true
  if (Test-Path -LiteralPath $exePath -PathType Leaf) {
    $helperHash = (Get-FileHash -LiteralPath $exePath -Algorithm SHA256 -ErrorAction Stop).Hash
    $helperNeedsRestore = -not [string]::Equals($helperHash, $backupHash, [System.StringComparison]::OrdinalIgnoreCase)
  }
  if ([string]::IsNullOrWhiteSpace($dataPath)) {
    Throw-InstallerError -Code 'helper_acl_invalid' -Message 'FlyEnv data path is empty'
  }
  $dataPath = Assert-PathHasNoReparsePoints -Path $dataPath -Label 'FlyEnv data directory'
  if (-not (Test-Path -LiteralPath $dataPath)) {
    New-Item -Path $dataPath -ItemType Directory -Force | Out-Null
    try {
      $dataAcl = Get-Acl -LiteralPath $dataPath
      $dataAcl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($appUserSid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
      Set-Acl -LiteralPath $dataPath -AclObject $dataAcl -ErrorAction Stop
    } catch {
      Throw-InstallerError -Code 'helper_acl_invalid' -Message "Failed to grant FlyEnv user access to data directory: $($_.Exception.Message)"
    }
  } elseif (-not (Test-Path -LiteralPath $dataPath -PathType Container)) {
    Throw-InstallerError -Code 'helper_acl_invalid' -Message "FlyEnv data path is not a directory: $dataPath"
  }
  $dataPath = Assert-PathHasNoReparsePoints -Path $dataPath -Label 'FlyEnv data directory'

  foreach ($sharedDirectory in @($flyenvRoot, $helperRoot, $usersRoot)) {
    if (-not (Test-Path -LiteralPath $sharedDirectory -PathType Container)) {
      New-Item -Path $sharedDirectory -ItemType Directory -Force | Out-Null
    }
    $sharedDirectory = Assert-PathHasNoReparsePoints -Path $sharedDirectory -Label 'FlyEnv helper shared directory'
    Set-HelperSharedDirectoryAcl -Path $sharedDirectory -AdminSid $adminSid -SystemSid $systemSid
  }
  if (-not (Test-Path -LiteralPath $instanceRoot -PathType Container)) {
    New-Item -Path $instanceRoot -ItemType Directory -Force | Out-Null
  }
  $instanceRoot = Assert-PathHasNoReparsePoints -Path $instanceRoot -Label 'FlyEnv helper instance directory'
  Set-AllowedRootsDirectoryAcl -Path $instanceRoot -AdminSid $adminSid -SystemSid $systemSid -UserSid $appUserSid
  Assert-AllowedRootsAcl -Path $instanceRoot -AdminSid $adminSid -SystemSid $systemSid
  Assert-NotReparsePoint -Path $allowFile -Label 'FlyEnv allowed roots file'
  if ((Test-Path -LiteralPath $allowFile) -and (Get-Item -LiteralPath $allowFile -Force).PSIsContainer) {
    Throw-InstallerError -Code 'helper_acl_invalid' -Message "FlyEnv allowed roots path is not a file: $allowFile"
  }

  try {
    $roots = @($dataPath) |
      Where-Object { $_ -and $_.Trim().Length -gt 0 } |
      ForEach-Object { [System.IO.Path]::GetFullPath($_) } |
      Sort-Object -Unique
    if ($roots.Count -eq 0) {
      Throw-InstallerError -Code 'helper_acl_invalid' -Message 'FlyEnv allowed roots list is empty'
    }
    $pendingAllowFile = Join-Path $instanceRoot ("allowed-roots.$([Guid]::NewGuid().ToString('N')).pending")
    Set-Content -LiteralPath $pendingAllowFile -Value $roots -Encoding UTF8 -ErrorAction Stop
    Assert-NotReparsePoint -Path $pendingAllowFile -Label 'FlyEnv pending allowed roots file'
    Set-AllowedRootsFileAcl -Path $pendingAllowFile -AdminSid $adminSid -SystemSid $systemSid -UserSid $appUserSid
    Assert-AllowedRootsAcl -Path $pendingAllowFile -AdminSid $adminSid -SystemSid $systemSid
    if (Test-Path -LiteralPath $allowFile) {
      $allowFileBackup = Join-Path $instanceRoot ("allowed-roots.$([Guid]::NewGuid().ToString('N')).backup")
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

  $stage = 'stop-current-instance'
  $scheduler = New-Object -ComObject 'Schedule.Service'
  $scheduler.Connect()
  $taskFolderSddl = 'D:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;FR;;;BU)'
  $rootFolder = Get-OrCreateTaskFolder -Scheduler $scheduler -FolderPath $taskFolderPath -FolderSddl $taskFolderSddl
  $registeredTask = Get-TaskIfExists -TaskFolder $rootFolder -TaskName $taskName
  if ($registeredTask) {
    $registeredTask.Stop(0)
    $stopDeadline = [DateTime]::UtcNow.AddSeconds(5)
    while ($registeredTask.State -eq 4 -and [DateTime]::UtcNow -lt $stopDeadline) {
      Start-Sleep -Milliseconds 100
      $registeredTask = Get-TaskIfExists -TaskFolder $rootFolder -TaskName $taskName
      if (-not $registeredTask) { break }
    }
    if ($registeredTask -and $registeredTask.State -eq 4) {
      Throw-InstallerError -Code 'helper_task_start_failed' -Message 'Current SID helper task did not stop'
    }
  }

  $stage = 'protect-helper-and-key'
  $helperDirectory = Split-Path -Parent $exePath
  if (-not (Test-Path -LiteralPath $helperDirectory)) { New-Item -ItemType Directory -Path $helperDirectory | Out-Null }
  $helperDirectory = Assert-PathHasNoReparsePoints -Path $helperDirectory -Label 'Helper executable directory'
  Set-AllowedRootsDirectoryAcl -Path $helperDirectory -AdminSid $adminSid -SystemSid $systemSid -UserSid $appUserSid
  Assert-AllowedRootsAcl -Path $helperDirectory -AdminSid $adminSid -SystemSid $systemSid
  Assert-PathHasNoReparsePoints -Path $exePath -Label 'Helper executable' | Out-Null
  if ($helperNeedsRestore) {
    try {
      $helperDirectory = Split-Path -Parent $exePath
      $pendingHelperFile = Join-Path $helperDirectory ("flyenv-helper.$([Guid]::NewGuid().ToString('N')).pending")
      Copy-Item -LiteralPath $backupExePath -Destination $pendingHelperFile -Force -ErrorAction Stop
      $pendingHelperHash = (Get-FileHash -LiteralPath $pendingHelperFile -Algorithm SHA256 -ErrorAction Stop).Hash
      if (-not [string]::Equals($pendingHelperHash, $backupHash, [System.StringComparison]::OrdinalIgnoreCase)) {
        Throw-InstallerError -Code 'helper_execution_failed' -Message 'FlyEnv helper backup hash changed while restoring'
      }
      if (Test-Path -LiteralPath $exePath -PathType Leaf) {
        [System.IO.File]::Replace(
          $pendingHelperFile,
          $exePath,
          [System.Management.Automation.Language.NullString]::Value,
          $true
        )
      } else {
        [System.IO.File]::Move($pendingHelperFile, $exePath)
      }
      $pendingHelperFile = $null
    } catch {
      if ($_.Exception.Message -like 'FLYENV_HELPER_INSTALL_ERROR:*') {
        throw
      }
      Throw-InstallerError -Code 'helper_execution_failed' -Message "Failed to restore FlyEnv helper from backup: $($_.Exception.Message)"
    }
  }

  # Executable needs ReadAndExecute for the target user (file ACL inherits protected directory).
  $exeAcl = Get-Acl -LiteralPath $exePath
  $exeAcl.SetAccessRuleProtection($false, $true)
  foreach ($rule in @($exeAcl.Access | Where-Object { -not $_.IsInherited })) { $exeAcl.RemoveAccessRuleSpecific($rule) }
  $exeAcl.SetOwner($adminSid)
  Set-Acl -LiteralPath $exePath -AclObject $exeAcl
  # The key is provisioned before SYSTEM starts, never derived from the SYSTEM profile.
  $keyDirectory = Assert-PathHasNoReparsePoints -Path (Split-Path -Parent $keyPath) -Label 'Target helper key directory'
  if (-not (Test-Path -LiteralPath $keyDirectory)) { New-Item -ItemType Directory -Path $keyDirectory | Out-Null }
  Set-AllowedRootsDirectoryAcl -Path $keyDirectory -AdminSid $adminSid -SystemSid $systemSid -UserSid $appUserSid
  Assert-PathHasNoReparsePoints -Path $keyPath -Label 'Target helper key' | Out-Null
  if (Test-Path -LiteralPath $keyPath) {
    if (-not (Test-Path -LiteralPath $keyPath -PathType Leaf)) { Throw-InstallerError -Code 'helper_acl_invalid' -Message 'Helper key is not a file' }
  }
  $keyBytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($keyBytes) } finally { $rng.Dispose() }
  $pendingKeyFile = Join-Path $keyDirectory ("flyenv-helper.key.$([Guid]::NewGuid().ToString('N')).pending")
  [IO.File]::WriteAllBytes($pendingKeyFile, $keyBytes)
  [Array]::Clear($keyBytes, 0, $keyBytes.Length)
  Set-AllowedRootsFileAcl -Path $pendingKeyFile -AdminSid $adminSid -SystemSid $systemSid -UserSid $appUserSid
  if (Test-Path -LiteralPath $keyPath) {
    # Rename replacement does not write through a preexisting hard link.
    Remove-Item -LiteralPath $keyPath -Force -ErrorAction Stop
  }
  [IO.File]::Move($pendingKeyFile, $keyPath)
  $pendingKeyFile = $null
  Set-AllowedRootsFileAcl -Path $keyPath -AdminSid $adminSid -SystemSid $systemSid -UserSid $appUserSid
  Assert-AllowedRootsAcl -Path $keyPath -AdminSid $adminSid -SystemSid $systemSid

  $instanceState = [ordered]@{
    schemaVersion = 1
    instanceId = $instanceId
    sid = $appUserSid.Value
    helperProtocol = [int]$config.helperVersion
    helperSha256 = $backupHash.ToLowerInvariant()
    executable = $exePath
    keyPath = $keyPath
    allowedRootsPath = $allowFile
    pipeName = $pipeName
    dataPath = $dataPath
  }
  $pendingInstanceConfigFile = Join-Path $instanceRoot ("instance.$([Guid]::NewGuid().ToString('N')).pending")
  Set-Content -LiteralPath $pendingInstanceConfigFile -Value ($instanceState | ConvertTo-Json -Compress) -Encoding UTF8 -ErrorAction Stop
  Set-AllowedRootsFileAcl -Path $pendingInstanceConfigFile -AdminSid $adminSid -SystemSid $systemSid -UserSid $appUserSid
  if (Test-Path -LiteralPath $instanceConfigPath) {
    Remove-Item -LiteralPath $instanceConfigPath -Force -ErrorAction Stop
  }
  [IO.File]::Move($pendingInstanceConfigFile, $instanceConfigPath)
  $pendingInstanceConfigFile = $null
  Set-AllowedRootsFileAcl -Path $instanceConfigPath -AdminSid $adminSid -SystemSid $systemSid -UserSid $appUserSid
  Assert-AllowedRootsAcl -Path $instanceConfigPath -AdminSid $adminSid -SystemSid $systemSid

  Write-Host 'Creating scheduled task via API...'

  $taskDefinition = $scheduler.NewTask(0)
  $taskDefinition.RegistrationInfo.Description = 'FlyEnv Helper Auto Start'
  $taskDefinition.RegistrationInfo.Author = $appUserName
  $taskDefinition.Settings.ExecutionTimeLimit = 'PT0S'
  $taskDefinition.Settings.DisallowStartIfOnBatteries = $false
  $taskDefinition.Settings.StopIfGoingOnBatteries = $false
  $trigger = $taskDefinition.Triggers.Create(9)
  $trigger.Enabled = $true
  $trigger.UserId = $appUserSid.Value
  $action = $taskDefinition.Actions.Create(0)
  $action.Path = $exePath
  $action.Arguments = "--instance-id `"$instanceId`" --expected-user-sid `"$($appUserSid.Value)`""
  $taskDefinition.Principal.UserId = $systemSid.Value
  $taskDefinition.Principal.LogonType = 5
  $taskDefinition.Principal.RunLevel = 1

  try {
    $stage = 'register-task'
    $taskSddl = "D:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;FR;;;$($appUserSid.Value))"
    Write-Host "stage=$stage taskName=$taskName taskPrincipal=$($systemSid.Value) taskLogonType=ServiceAccount helperExecutable=$exePath expectedUserSid=$($appUserSid.Value)"
    $rootFolder.RegisterTaskDefinition($taskName, $taskDefinition, 6, $systemSid.Value, $null, 5, $taskSddl) | Out-Null
    $taskRegistered = $true
    $registeredTask = $rootFolder.GetTask($taskName)
    if (-not $registeredTask) {
      Throw-InstallerError -Code 'helper_task_invalid' -Message "Scheduled task was not registered: $taskName"
    }
    Assert-RegisteredTaskConfiguration -Task $registeredTask -ExePath $exePath -AppUserSid $appUserSid -ExpectedArguments $action.Arguments
    $stage = 'start-task'
    $runningTask = $registeredTask.Run($null)
    if (-not $runningTask) {
      Throw-InstallerError -Code 'helper_task_start_failed' -Message 'Task Scheduler did not return a running helper task'
    }
    $taskStarted = $true
  } catch {
    if ($_.Exception.Message -like 'FLYENV_HELPER_INSTALL_ERROR:*') {
      throw
    }
    $code = if ($stage -eq 'start-task') { 'helper_task_start_failed' } else { 'helper_task_invalid' }
    Throw-InstallerError -Code $code -Message "${stage}: $($_.Exception.Message)"
  }

  Write-Host "Task '$taskName' started successfully via API."
  exit 0
}
catch {
  $originalError = $_.Exception.Message
  if ($pendingKeyFile -and (Test-Path -LiteralPath $pendingKeyFile)) {
    try { Remove-Item -LiteralPath $pendingKeyFile -Force -ErrorAction Stop } catch {}
  }
  if ($pendingInstanceConfigFile -and (Test-Path -LiteralPath $pendingInstanceConfigFile)) {
    try { Remove-Item -LiteralPath $pendingInstanceConfigFile -Force -ErrorAction Stop } catch {}
  }
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
  if ($pendingHelperFile -and (Test-Path -LiteralPath $pendingHelperFile)) {
    try {
      Remove-Item -LiteralPath $pendingHelperFile -Force -ErrorAction Stop
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
  $message = $originalError
  if ($message -notlike 'FLYENV_HELPER_INSTALL_ERROR:*') {
    $message = "FLYENV_HELPER_INSTALL_ERROR:helper_execution_failed:$message"
  }
  [Console]::Error.WriteLine("${message} (stage=$stage)")
  exit 1
}
