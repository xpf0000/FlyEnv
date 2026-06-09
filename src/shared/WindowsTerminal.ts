import { encodePowerShellCommand } from './PowerShellCommand'

function powerShellSingleQuoted(value: string): string {
  return `'${`${value}`.replace(/'/g, "''")}'`
}

export function powerShellDoubleQuoted(value: string): string {
  return `"${`${value}`.replace(/`/g, '``').replace(/"/g, '`"').replace(/\$/g, '`$')}"`
}

export function buildWindowsTerminalInlineScript(command: string): string {
  const commandBytes = Buffer.from(command, 'utf8').toString('base64')
  const terminalPayload = `
$ErrorActionPreference = 'Continue'
$Host.UI.RawUI.BackgroundColor = 'Black'
Clear-Host

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "FlyEnv Command Execution" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$cmdBytes = [Convert]::FromBase64String(${powerShellSingleQuoted(commandBytes)})
$decodedCmd = [System.Text.Encoding]::UTF8.GetString($cmdBytes)
Write-Host "$ " -ForegroundColor Yellow -NoNewline
Write-Host $decodedCmd -ForegroundColor White
Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor DarkGray
Write-Host ""

$scriptBlock = [ScriptBlock]::Create($decodedCmd)
& $scriptBlock

$exitCode = $LASTEXITCODE
if ($? -eq $false -and $exitCode -eq 0) { $exitCode = 1 }

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor DarkGray
if ($exitCode -eq 0) {
    Write-Host "Command executed successfully." -ForegroundColor Green
} else {
    Write-Host "Command exited with code: $exitCode" -ForegroundColor Yellow
}
Write-Host "Press any key to close..." -ForegroundColor Cyan
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
`
  const encodedPayload = encodePowerShellCommand(terminalPayload)

  return `
$terminalFound = $false
$encodedPayload = ${powerShellSingleQuoted(encodedPayload)}
$argumentList = @('-NoExit', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encodedPayload)
$terminals = @(
    @{
        Name = 'Windows Terminal'
        Test = { Get-Command 'wt' -ErrorAction SilentlyContinue }
        Launch = { Start-Process -FilePath 'wt' -ArgumentList (@('powershell.exe') + $argumentList) }
    },
    @{
        Name = 'PowerShell 7'
        Test = { Get-Command 'pwsh' -ErrorAction SilentlyContinue }
        Launch = { Start-Process -FilePath 'pwsh' -ArgumentList $argumentList }
    },
    @{
        Name = 'Windows PowerShell'
        Test = { Get-Command 'powershell' -ErrorAction SilentlyContinue }
        Launch = { Start-Process -FilePath 'powershell' -ArgumentList $argumentList }
    },
    @{
        Name = 'Windows PowerShell System32'
        Test = { Test-Path "$env:SystemRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" }
        Launch = { Start-Process -FilePath "$env:SystemRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -ArgumentList $argumentList }
    }
)

foreach ($terminal in $terminals) {
    if (& $terminal.Test) {
        try {
            & $terminal.Launch
            $terminalFound = $true
            break
        } catch {
            continue
        }
    }
}

if (-not $terminalFound) {
    Write-Error 'Error: Could not find a suitable PowerShell terminal to open.'
    exit 1
}
`
}
