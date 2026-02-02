[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

try {
  $srcExePath = "#SRCEXECPATH#"
  $taskName = "#TASKNAME#"
  $exePath = "#EXECPATH#"
  $dataPath = "#DATAPATH#"

  $currentUserName = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

  if (Test-Path -LiteralPath $exePath) {
    $processName = [System.IO.Path]::GetFileNameWithoutExtension($exePath)
    Write-Host "Checking for running process: $processName..."

    $runningProcesses = Get-Process -Name $processName -ErrorAction SilentlyContinue
    if ($runningProcesses) {
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

  $shouldUpdate = $false

  if (-not [string]::IsNullOrWhiteSpace($srcExePath)) {
    if (Test-Path -LiteralPath $srcExePath) {
      $shouldUpdate = $true
    } else {
      Write-Host "Source path provided ('$srcExePath') but file not found. Skipping update."
    }
  }

  if ($shouldUpdate) {
    Write-Host "Source file detected. Starting update procedure..."

    $destDir = [System.IO.Path]::GetDirectoryName($exePath)
    if (-not (Test-Path -LiteralPath $destDir)) {
      Write-Host "Creating installation directory: $destDir"
      New-Item -Path $destDir -ItemType Directory -Force | Out-Null
    }

    if (Test-Path -LiteralPath $exePath) {
      Write-Host "Removing old executable: $exePath"
      try {
        Remove-Item -LiteralPath $exePath -Force -ErrorAction Stop
      } catch {
        throw "Failed to remove old file. It might be locked. Error: $($_.Exception.Message)"
      }
    }

    Write-Host "Copying new executable..."
    try {
      Copy-Item -LiteralPath $srcExePath -Destination $exePath -Force -ErrorAction Stop
      Write-Host "File update completed."
    } catch {
      throw "Failed to copy file: $($_.Exception.Message)"
    }
  } else {
    Write-Host "No valid source file provided. Skipping file update, using existing installation."
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
    Set-Acl -Path $dataPath -AclObject $acl
    Write-Host "Permissions set successfully for $currentUserName."
  }
  catch {
    Write-Host "Warning: Failed to set permissions on '$dataPath': $($_.Exception.Message)"
  }

  Write-Host "Starting application immediately..."
  try {
    $process = Start-Process -FilePath $exePath -WindowStyle Hidden -PassThru
    if ($process.Id) {
      Write-Host "Application started successfully (PID: $($process.Id))"
    }
  }
  catch {
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

  # 使用 /F 强制覆盖 (虽然前面已经删除了，但双重保险)
  schtasks /Create /XML "$xmlPath" /TN "$taskName" /F

  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Start-Sleep -Milliseconds 1000
    Write-Host "Task '$taskName' created successfully."
  } else {
    throw "Failed to create scheduled task '$taskName'."
  }
  exit 0
}
catch {
  Write-Host "Task creation failed. Error: $($_.Exception.Message)"
  exit 1
}
finally {
  if ($xmlPath -and (Test-Path -LiteralPath $xmlPath)) {
    Remove-Item -LiteralPath $xmlPath -Force -ErrorAction SilentlyContinue
  }
}
