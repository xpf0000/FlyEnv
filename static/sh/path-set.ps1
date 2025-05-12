$newPath = "##NEW_PATH##;"
if (-not [string]::IsNullOrEmpty($newPath)) {
  [Microsoft.Win32.Registry]::SetValue(
    "HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Session Manager\Environment",
    "Path",
    $newPath,
    [Microsoft.Win32.RegistryValueKind]::ExpandString
  )
  [Environment]::SetEnvironmentVariable("FLYENV_ENV_FLUSH", "0", "Machine")
  $env:PATH = $newPath
  Write-Output "Set PATH = $newPath" -ForegroundColor Green
}

$otherVars = @{
  ##OTHER##
}

if ($otherVars.Count -gt 0) {
  foreach ($var in $otherVars.Keys) {
    $value = $otherVars[$var]
    [Environment]::SetEnvironmentVariable($var, $value, "Machine")
    Invoke-Expression "`$env:$var = '$value'"
    Write-Output "Set $var = $value" -ForegroundColor Green
  }
}


try
{
  rundll32.exe user32.dll,UpdatePerUserSystemParameters 1, True
} catch {
  Write-Output "rundll32.exe UpdatePerUserSystemParameters error: $_"
}

Write-Output "`nDone! New terminal sessions will use the updated variables." -ForegroundColor Cyan
