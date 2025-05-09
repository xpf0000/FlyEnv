[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$rawPath = (Get-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" `
    -Name "Path"
).Path
Write-Host "##FlyEnv-PATH-GET$($rawPath)FlyEnv-PATH-GET##"
