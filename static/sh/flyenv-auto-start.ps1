[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 配置参数
$taskName = "FlyEnvStartup"
$exePath = "#EXECPATH#"

$action = New-ScheduledTaskAction -Execute "`"$exePath`""
$trigger = New-ScheduledTaskTrigger -AtLogon

$settings = New-ScheduledTaskSettingsSet `
    -DontStopOnIdleEnd:$true `
    -StartWhenAvailable:$true `
    -AllowStartIfOnBatteries:$true `
    -DontStopIfGoingOnBatteries:$true `
    -ExecutionTimeLimit "PT0S" `
    -RunOnlyIfLoggedOn:$true

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -RunLevel Highest `
    -Force

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Write-Host "Task Create Success: $taskName"
} else {
    Write-Host "Task Create Failed"
    exit 1
}
