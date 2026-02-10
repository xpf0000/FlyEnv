[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

try {
  $taskName = "#TASKNAME#"
  $exePath = "#EXECPATH#"
  $dataPath = "#DATAPATH#"

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
  $action.Path = "`"$exePath`""

  $taskDefinition.Principal.UserId = $currentUserName
  $taskDefinition.Principal.LogonType = 3
  $taskDefinition.Principal.RunLevel = 1

  $rootFolder.RegisterTaskDefinition($taskName, $taskDefinition, 6, $null, $null, 3)

  Write-Host "Task '$taskName' created successfully via API."
  exit 0
}
catch {
  Write-Host "Task creation failed. Error: $($_.Exception.Message)"
  exit 1
}
