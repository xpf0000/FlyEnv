param(
  [ValidateSet("test", "vet")]
  [string]$Mode = "test",
  [string]$LogPath = ""
)

$ErrorActionPreference = "Stop"

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$helperDir = Join-Path $repoRoot "src\helper-go"

if (-not $LogPath) {
  $LogPath = Join-Path $repoRoot "test\helper-go-admin-test.log"
}

if (-not (Test-IsAdmin)) {
  $powerShell = (Get-Process -Id $PID).Path
  if (-not $powerShell) {
    $powerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  }

  $argString = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Mode $Mode -LogPath `"$LogPath`""
  $proc = Start-Process -FilePath $powerShell -ArgumentList $argString -Verb RunAs -Wait -PassThru

  if (Test-Path $LogPath) {
    Get-Content -Path $LogPath
  }

  exit $proc.ExitCode
}

$bundledGo = "D:\Program Files\PhpWebStudy-Data\app\static-go-1.25.0\bin\go.exe"
if ($env:FLYENV_GO) {
  $go = $env:FLYENV_GO
} elseif (Test-Path $bundledGo) {
  $go = $bundledGo
} else {
  $go = "go"
}

$goArgs = @($Mode, "./...")
Push-Location $helperDir
try {
  New-Item -ItemType Directory -Force -Path (Split-Path $LogPath -Parent) | Out-Null
  & $go @goArgs *> $LogPath
  $exitCode = $LASTEXITCODE
} finally {
  Pop-Location
}

if (Test-Path $LogPath) {
  Get-Content -Path $LogPath
}

exit $exitCode
