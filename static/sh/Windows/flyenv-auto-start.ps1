[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

try {
  $taskName = "#TASKNAME#"
  $exePath = "#EXECPATH#"

  if (-not (Test-Path -LiteralPath $exePath)) {
    throw "$exePath not exist"
  }

  $currentUserName = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

  $service = New-Object -ComObject "Schedule.Service"
  $service.Connect()
  $rootFolder = $service.GetFolder("\")

  $taskDefinition = $service.NewTask(0)
  $taskDefinition.RegistrationInfo.Description = "FlyEnv Auto Start"
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

  $rootFolder.RegisterTaskDefinition(
    $taskName,
    $taskDefinition,
    6,
    $currentUserName,
    $null,
    3
  )

  Write-Host "Task Create Success: $taskName"
  exit 0
}
catch {
  Write-Host "Task Create Failed, Error: $($_.Exception.Message)"
  exit 1
}
