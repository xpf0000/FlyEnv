[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$systemPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
Write-Host "##FlyEnv-PATH-GET$($systemPath)FlyEnv-PATH-GET##"
