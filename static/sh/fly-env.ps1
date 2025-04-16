[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$lastFlyenvDir = $null

function global:Prompt {
  if ((Test-Path ".flyenv") -and ($PWD.Path -ne $lastFlyenvDir)) {
    Write-Host "Found .flyenv file, loading..." -ForegroundColor Green
    . ".flyenv"
    Write-Host "Successfully loaded environment variables from .flyenv" -ForegroundColor Green
    $script:lastFlyenvDir = $PWD.Path
  }

  if ($PSVersionTable.PSVersion.Major -ge 6) {
    "PS $($executionContext.SessionState.Path.CurrentLocation)$('>' * ($nestedPromptLevel + 1)) "
  } else {
    "PS $($pwd.Path)$('>' * ($nestedPromptLevel + 1)) "
  }
}
