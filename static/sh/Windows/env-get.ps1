[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$userVars = [Environment]::GetEnvironmentVariables('User')
$machineVars = [Environment]::GetEnvironmentVariables('Machine')

$result = @{}
foreach ($key in $machineVars.Keys) { $result[$key] = $machineVars[$key] }
foreach ($key in $userVars.Keys) { $result[$key] = $userVars[$key] }

$mPath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
$uPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$combinedPath = ($mPath.Split(';') + $uPath.Split(';')) | Where-Object { $_ } | Select-Object -Unique
$rawPath = $combinedPath -join ';'

foreach ($key in @($result.Keys)) {
  $value = $result[$key]
  if ($value -is [string]) {
    [Environment]::SetEnvironmentVariable($key, $value, 'Process')
  }
}

$result['PATH'] = $rawPath

foreach ($key in @($result.Keys)) {
  $value = $result[$key]
  if ($value -is [string] -and $value -match '%[^%]+%') {
    $expandedValue = [Environment]::ExpandEnvironmentVariables($value)
    $result[$key] = $expandedValue
    [Environment]::SetEnvironmentVariable($key, $expandedValue, 'Process')
  }
}

$result | ConvertTo-Json -Compress
