[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

try {
    $taskName = "#TASKNAME#"
    $exePath = "#EXECPATH#"

    if (-not (Test-Path -LiteralPath $exePath)) {
        throw "$exePath not exist"
    }

    Write-Host "Starting application immediately..."
    try {
      $process = Start-Process -FilePath $exePath -WindowStyle Hidden -PassThru
      if ($process.Id) {
        Write-Host "✓ Application started successfully (PID: $($process.Id))"
      }
    }
    catch {
      Write-Host "✗ Failed to start application: $($_.Exception.Message)"
    }

    $xmlConfig = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>FlyEnv Auto Start</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>$(whoami)</UserId>
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

    $xmlPath = "$env:TEMP\FlyEnvTask.xml"
    $xmlConfig | Out-File -FilePath $xmlPath -Encoding Unicode -Force

    schtasks /Create /XML "$xmlPath" /TN "$taskName" /F

    if (Test-Path -LiteralPath $xmlPath) {
        Remove-Item -LiteralPath $xmlPath -Force
    }

    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
        Start-Sleep -Milliseconds 1500
        Write-Host "Task Create Success: $taskName"
    } else {
        throw "Task Create Failed"
    }
    exit 0
}
catch {
    Write-Host "Task Create Failed, Error: $($_.Exception.Message)"
    exit 1
}
finally {
  if ($xmlPath -and (Test-Path -LiteralPath $xmlPath)) {
    Remove-Item -LiteralPath $xmlPath -Force -ErrorAction SilentlyContinue
  }
}
