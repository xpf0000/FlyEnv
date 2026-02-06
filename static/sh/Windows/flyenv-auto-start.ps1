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

  $taskDefinition = $service.NewTask(0)
  $taskDefinition.RegistrationInfo.Description = "FlyEnv Auto Start"

  $settings = $taskDefinition.Settings
  $settings.Enabled = $true
  $settings.AllowStartOnDemand = $true
  $settings.ExecutionTimeLimit = "PT0S"
  $settings.DisallowStartIfOnBatteries = $false
  $settings.StopIfGoingOnBatteries = $false
  $settings.MultipleInstancesPolicy = 2

  $triggers = $taskDefinition.Triggers
  $trigger = $triggers.Create(9)
  $trigger.Enabled = $true

  $actions = $taskDefinition.Actions
  $action = $actions.Create(0)
  $action.Path = $exePath

  $rootFolder = $service.GetFolder("\")
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
