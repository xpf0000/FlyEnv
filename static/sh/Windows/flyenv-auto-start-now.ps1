[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

try {
  $taskName = "#TASKNAME#"
  $exePath = "#EXECPATH#"
  $dataPath = "#DATAPATH#"
  $allowDir = Join-Path $env:ProgramData "FlyEnv"
  $allowFile = Join-Path $allowDir "flyenv.allowed-roots"

  $currentUserName = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

  if (Test-Path -LiteralPath $exePath) {
    $processName = [System.IO.Path]::GetFileNameWithoutExtension($exePath)
    $runningProcesses = Get-Process -Name $processName -ErrorAction SilentlyContinue
    if ($runningProcesses) {
      $runningProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 500
    }
  }

  if (-not (Test-Path -LiteralPath $dataPath)) {
    New-Item -Path $dataPath -ItemType Directory -Force | Out-Null
    try {
      $acl = Get-Acl -Path $dataPath
      $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($currentUserName, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
      $acl.SetAccessRule($rule)
      Set-Acl -Path $dataPath -AclObject $acl -ErrorAction SilentlyContinue
    } catch {
      Write-Host "Warning: Failed to set permissions: $($_.Exception.Message)"
    }
  }

  if (-not (Test-Path -LiteralPath $allowDir)) {
    New-Item -Path $allowDir -ItemType Directory -Force | Out-Null
  }

  $roots = @($dataPath, (Split-Path -Parent $exePath)) | Where-Object { $_ -and $_.Trim().Length -gt 0 } | Sort-Object -Unique
  Set-Content -LiteralPath $allowFile -Value $roots -Encoding UTF8

  try {
    $adminSid = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-32-544")
    $systemSid = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-18")
    $userSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User

    $dirAcl = New-Object System.Security.AccessControl.DirectorySecurity
    $dirAcl.SetAccessRuleProtection($true, $false)
    $dirAcl.SetOwner($adminSid)
    $dirAcl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($adminSid, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")))
    $dirAcl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($systemSid, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")))
    $dirAcl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($userSid, "ReadAndExecute", "ContainerInherit,ObjectInherit", "None", "Allow")))
    Set-Acl -LiteralPath $allowDir -AclObject $dirAcl

    $fileAcl = New-Object System.Security.AccessControl.FileSecurity
    $fileAcl.SetAccessRuleProtection($true, $false)
    $fileAcl.SetOwner($adminSid)
    $fileAcl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($adminSid, "FullControl", "None", "None", "Allow")))
    $fileAcl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($systemSid, "FullControl", "None", "None", "Allow")))
    $fileAcl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($userSid, "Read", "None", "None", "Allow")))
    Set-Acl -LiteralPath $allowFile -AclObject $fileAcl
  } catch {
    Write-Host "Warning: Failed to lock allowed roots file permissions: $($_.Exception.Message)"
  }

  try {
    Start-Process -FilePath $exePath -WindowStyle Hidden
  } catch {
    Write-Host "Failed to start application: $($_.Exception.Message)"
  }

  Write-Host "Creating scheduled task via API..."

  $scheduler = New-Object -ComObject "Schedule.Service"
  $scheduler.Connect()
  $rootFolder = $scheduler.GetFolder("\")

  try {
    $existingTask = $rootFolder.GetTask($taskName)
    if ($existingTask) {
      $rootFolder.DeleteTask($taskName, 1)
    }
  } catch {}

  try {
    $existingTask = $rootFolder.GetTask("flyenv-helper")
    if ($existingTask) {
      $rootFolder.DeleteTask($taskName, 1)
    }
  } catch {}

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

  Write-Host "Task '$taskName' created successfully via API."
  exit 0
}
catch {
  Write-Host "Task creation failed. Error: $($_.Exception.Message)"
  exit 1
}
