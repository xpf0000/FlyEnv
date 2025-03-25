[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$envVars = @{
  "PATH" = "##NEW_PATH##"
  ##OTHER##
}

foreach ($var in $envVars.Keys) {
  $value = $envVars[$var]

  [Environment]::SetEnvironmentVariable($var, $value, "Machine")

  Invoke-Expression "`$env:$var = '$value'"

  Write-Output "Set $var = $value" -ForegroundColor Green
}

Write-Output "`nDone! New terminal sessions will use the updated variables." -ForegroundColor Cyan
