param (
  [string]$instDir
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$instDir = $instDir.Trim('"')

$logFile = Join-Path $env:TEMP "flyenv-helper-init.log"
function Write-Log($msg) {
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  "$timestamp : $msg" | Out-File -FilePath $logFile -Append -Encoding UTF8
}

Write-Log "Script started. Raw instDir: $instDir"

try {
  $taskName = "flyenv-helper"

  $parentDir = Split-Path -Path $instDir -Parent
  $dataPath = Join-Path $parentDir "PhpWebStudy-Data"
  $exePath = Join-Path $instDir "resources\helper\flyenv-helper.exe"

  Write-Log "Parsed Path - exePath: $exePath"
  Write-Log "Parsed Path - dataPath: $dataPath"

  $currentUserName = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

  Write-Log "Current User: $currentUserName"

  if (Test-Path -LiteralPath $exePath) {
    $processName = [System.IO.Path]::GetFileNameWithoutExtension($exePath)
    Write-Host "Checking for running process: $processName..."

    $runningProcesses = Get-Process -Name $processName -ErrorAction SilentlyContinue
    if ($runningProcesses) {
      Write-Log "Stopping processes..."
      Write-Host "Stopping existing process(es)..."
      $runningProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 500 # 等待进程完全释放
    }
  }

  Write-Host "Checking for existing scheduled task: $taskName..."
  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Write-Host "Removing existing task..."
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop
  }

  if (-not (Test-Path -LiteralPath $exePath)) {
    throw "'$exePath' does not exist."
  }

  if (-not (Test-Path -LiteralPath $dataPath)) {
    Write-Host "Creating data directory: $dataPath"
    try {
      New-Item -Path $dataPath -ItemType Directory -Force | Out-Null
      Write-Host "Data directory created successfully."
    }
    catch {
      throw "Failed to create data directory '$dataPath': $($_.Exception.Message)"
    }
  }

  Write-Host "Setting full access permissions for current user on: $dataPath"
  try {
    $acl = Get-Acl -Path $dataPath
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    $currentUserName,
    "FullControl",
    "ContainerInherit,ObjectInherit",
    "None",
    "Allow"
    )
    $acl.SetAccessRule($rule)
    Set-Acl -Path $dataPath -AclObject $acl -ErrorAction SilentlyContinue
    Write-Host "Permissions set successfully for $currentUserName."
  }
  catch {
    Write-Host "Warning: Failed to set permissions on '$dataPath': $($_.Exception.Message)"
  }

  Write-Log "Starting process..."
  Write-Host "Starting application immediately..."
  try {
    $process = Start-Process -FilePath $exePath -WindowStyle Hidden -PassThru
    if ($process.Id) {
      Write-Log "Application started successfully (PID: $($process.Id))"
      Write-Host "Application started successfully (PID: $($process.Id))"
    }
  }
  catch {
    Write-Log "Failed to start application: $($_.Exception.Message)"
    Write-Host "Failed to start application: $($_.Exception.Message)"
  }

  $xmlConfig = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>FlyEnv Helper Auto Start</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>$($currentUserName)</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>"$exePath"</Command>
    </Exec>
  </Actions>
</Task>
"@

  $xmlPath = Join-Path $env:TEMP "FlyEnvHelperTask.xml"
  $xmlConfig | Out-File -FilePath $xmlPath -Encoding Unicode -Force

  schtasks /Create /XML "$xmlPath" /TN "$taskName" /F

  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Start-Sleep -Milliseconds 1000
    Write-Log "Task '$taskName' created successfully."
    Write-Host "Task '$taskName' created successfully."
  } else {
    throw "Failed to create scheduled task '$taskName'."
  }
  exit 0
}
catch {
  Write-Log "Task creation failed. Error: $($_.Exception.Message)"
  Write-Host "Task creation failed. Error: $($_.Exception.Message)"
  exit 1
}
finally {
  if ($xmlPath -and (Test-Path -LiteralPath $xmlPath)) {
    Remove-Item -LiteralPath $xmlPath -Force -ErrorAction SilentlyContinue
  }
}
