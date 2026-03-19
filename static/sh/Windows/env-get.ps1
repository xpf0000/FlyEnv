[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$userVars = [Environment]::GetEnvironmentVariables('User')
$machineVars = [Environment]::GetEnvironmentVariables('Machine')

$result = @{}
foreach ($key in $machineVars.Keys) { $result[$key] = $machineVars[$key] }
foreach ($key in $userVars.Keys) { $result[$key] = $userVars[$key] }

$mPath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
$uPath = [Environment]::GetEnvironmentVariable('Path', 'User')

$combinedPath = ($mPath.Split(';') + $uPath.Split(';')) | Where-Object { $_ } | Select-Object -Unique
$result['PATH'] = $combinedPath -join ';'

$result | ConvertTo-Json -Compress
