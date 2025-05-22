[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$script:lastFlyenvDir = $null
$script:allowedPathsCache = $null

function global:Prompt {
  if ($null -eq $script:allowedPathsCache) {
    $script:allowedPathsCache = Get-FlyEnvAllowedPaths
  }

  $currentPath = $PWD.Path.Replace('/', '\').TrimEnd('\')
  $isAllowed = $script:allowedPathsCache -contains $currentPath

  if ($isAllowed -and (Test-Path ".flyenv") -and ($currentPath -ne $script:lastFlyenvDir)) {
    Write-Host "[FlyEnv] Loading environment variables..." -ForegroundColor Cyan
    try {
      Get-Content ".flyenv" -Raw | Invoke-Expression
      Write-Host "[FlyEnv] Load successful" -ForegroundColor Green
      $script:lastFlyenvDir = $currentPath
    } catch {
      Write-Host "[FlyEnv] Load failed: $_" -ForegroundColor Red
    }
  }

  if ($PSVersionTable.PSVersion.Major -ge 6) {
    "PS $($executionContext.SessionState.Path.CurrentLocation)$('>' * ($nestedPromptLevel + 1)) "
  } else {
    "PS $($pwd.Path)$('>' * ($nestedPromptLevel + 1)) "
  }
}

function Get-FlyEnvAllowedPaths {
  $configFile = Join-Path $PSScriptRoot ".flyenv.dir"
  if (Test-Path $configFile) {
    try {
      $jsonContent = Get-Content $configFile -Raw | ConvertFrom-Json -ErrorAction Stop
      return $jsonContent | Where-Object { $_ -ne $null } | ForEach-Object {
        $_.ToString().Replace('/', '\').TrimEnd('\')
      }
    } catch {
      return @()
    }
  } else {
    return @()
  }
}
