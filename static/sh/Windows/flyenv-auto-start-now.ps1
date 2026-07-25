[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$helperProcess = $null
$rootFolder = $null
$taskRegistered = $false

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
    throw "$Label must not be a reparse point: $Path"
  }
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
  $acl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($AdminSid, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")))
  $acl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($SystemSid, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")))
  $acl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($UserSid, "ReadAndExecute", "ContainerInherit,ObjectInherit", "None", "Allow")))
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
  $acl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($AdminSid, "FullControl", "None", "None", "Allow")))
  $acl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($SystemSid, "FullControl", "None", "None", "Allow")))
  $acl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($UserSid, "Read", "None", "None", "Allow")))
  Set-Acl -LiteralPath $Path -AclObject $acl -ErrorAction Stop
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
  $taskName = "#TASKNAME#"
  $exePath = "#EXECPATH#"
  $dataPath = "#DATAPATH#"
  $programData = $env:ProgramData
  if ($null -eq $programData -or $programData -eq "") {
    $programData = "C:\ProgramData"
  }
  $allowDir = Join-Path $programData "FlyEnv"
  $allowFile = Join-Path $allowDir "flyenv.allowed-roots"
  $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $currentUserName = $currentUser.Name
  $userSid = $currentUser.User

  if ([string]::IsNullOrWhiteSpace($exePath) -or -not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
    throw "FlyEnv helper binary not found: $exePath"
  }
  if ([string]::IsNullOrWhiteSpace($dataPath)) {
    throw "FlyEnv data path is empty"
  }

  if (-not (Test-Path -LiteralPath $dataPath)) {
    New-Item -Path $dataPath -ItemType Directory -Force | Out-Null
    try {
      $dataAcl = Get-Acl -LiteralPath $dataPath
      $dataAcl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($currentUserName, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")))
      Set-Acl -LiteralPath $dataPath -AclObject $dataAcl -ErrorAction Stop
    } catch {
      Write-Host "Warning: Failed to set data directory permissions: $($_.Exception.Message)"
    }
  } elseif (-not (Test-Path -LiteralPath $dataPath -PathType Container)) {
    throw "FlyEnv data path is not a directory: $dataPath"
  }

  Assert-NotReparsePoint -Path $allowDir -Label "FlyEnv allowed roots directory"
  if (-not (Test-Path -LiteralPath $allowDir -PathType Container)) {
    New-Item -Path $allowDir -ItemType Directory -Force | Out-Null
  }
  Assert-NotReparsePoint -Path $allowDir -Label "FlyEnv allowed roots directory"
  Assert-NotReparsePoint -Path $allowFile -Label "FlyEnv allowed roots file"
  if ((Test-Path -LiteralPath $allowFile) -and (Get-Item -LiteralPath $allowFile -Force).PSIsContainer) {
    throw "FlyEnv allowed roots path is not a file: $allowFile"
  }

  $adminSid = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-32-544")
  $systemSid = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-18")
  try {
    Set-AllowedRootsDirectoryAcl -Path $allowDir -AdminSid $adminSid -SystemSid $systemSid -UserSid $userSid

    $roots = @($dataPath, (Split-Path -Parent $exePath)) |
      Where-Object { $_ -and $_.Trim().Length -gt 0 } |
      ForEach-Object { [System.IO.Path]::GetFullPath($_) } |
      Sort-Object -Unique
    if ($roots.Count -eq 0) {
      throw "FlyEnv allowed roots list is empty"
    }
    Set-Content -LiteralPath $allowFile -Value $roots -Encoding UTF8 -ErrorAction Stop
    Assert-NotReparsePoint -Path $allowFile -Label "FlyEnv allowed roots file"
    Set-AllowedRootsFileAcl -Path $allowFile -AdminSid $adminSid -SystemSid $systemSid -UserSid $userSid
  } catch {
    throw "Failed to lock allowed roots file permissions: $($_.Exception.Message)"
  }

  $processName = [System.IO.Path]::GetFileNameWithoutExtension($exePath)
  $runningProcesses = @(Get-Process -Name $processName -ErrorAction SilentlyContinue)
  if ($runningProcesses.Count -gt 0) {
    $runningProcesses | Stop-Process -Force -ErrorAction Stop
    try {
      Wait-Process -Id $runningProcesses.Id -Timeout 5 -ErrorAction Stop
    } catch {
      $remainingProcesses = @(Get-Process -Id $runningProcesses.Id -ErrorAction SilentlyContinue)
      if ($remainingProcesses.Count -gt 0) {
        throw "Failed to stop the existing FlyEnv helper process: $($_.Exception.Message)"
      }
    }
  }

  $helperProcess = Start-Process -FilePath $exePath -WindowStyle Hidden -PassThru -ErrorAction Stop
  Start-Sleep -Milliseconds 500
  $helperProcess.Refresh()
  if ($helperProcess.HasExited) {
    throw "FlyEnv helper exited during startup"
  }

  Write-Host "Creating scheduled task via API..."
  $scheduler = New-Object -ComObject "Schedule.Service"
  $scheduler.Connect()
  $rootFolder = $scheduler.GetFolder("\")

  foreach ($existingTaskName in @($taskName, "flyenv-helper") | Sort-Object -Unique) {
    Remove-TaskIfExists -RootFolder $rootFolder -TaskName $existingTaskName
  }

  $taskDefinition = $scheduler.NewTask(0)
  $taskDefinition.RegistrationInfo.Description = "FlyEnv Helper Auto Start"
  $taskDefinition.RegistrationInfo.Author = $currentUserName
  $taskDefinition.Settings.ExecutionTimeLimit = "PT0S"
  $taskDefinition.Settings.DisallowStartIfOnBatteries = $false
  $taskDefinition.Settings.StopIfGoingOnBatteries = $false

  $trigger = $taskDefinition.Triggers.Create(9)
  $trigger.Enabled = $true
  $trigger.UserId = $currentUserName

  $action = $taskDefinition.Actions.Create(0)
  $action.Path = $exePath

  $taskDefinition.Principal.UserId = $currentUserName
  $taskDefinition.Principal.LogonType = 3
  $taskDefinition.Principal.RunLevel = 1

  $rootFolder.RegisterTaskDefinition($taskName, $taskDefinition, 6, $currentUserName, $null, 3)
  $taskRegistered = $true
  $registeredTask = $rootFolder.GetTask($taskName)
  if (-not $registeredTask) {
    throw "Scheduled task was not registered: $taskName"
  }

  Write-Host "Task '$taskName' created successfully via API."
  exit 0
}
catch {
  if ($taskRegistered -and $rootFolder) {
    try {
      $rootFolder.DeleteTask($taskName, 0)
    } catch {}
  }
  if ($helperProcess -and -not $helperProcess.HasExited) {
    try {
      Stop-Process -Id $helperProcess.Id -Force -ErrorAction Stop
    } catch {}
  }
  Write-Host "FlyEnv helper installation failed: $($_.Exception.Message)"
  exit 1
}
