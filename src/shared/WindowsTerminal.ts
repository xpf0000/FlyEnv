import { encodePowerShellCommand } from './PowerShellCommand'
import { windowsPowerShellPath } from './WindowsSystemPaths'

function powerShellSingleQuoted(value: string): string {
  return `'${`${value}`.replace(/'/g, "''")}'`
}

export function powerShellDoubleQuoted(value: string): string {
  return `"${`${value}`.replace(/`/g, '``').replace(/"/g, '`"').replace(/\$/g, '`$')}"`
}

export function buildWindowsTerminalInlineScript(
  command: string,
  // 纯脚本构造使用完整系统路径；真正启动的调用方另做存在检查，不依赖 PATH。
  powerShellPath = windowsPowerShellPath()
): string {
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
$systemPowerShell = ${powerShellSingleQuoted(powerShellPath)}
$encodedPayload = ${powerShellSingleQuoted(encodedPayload)}
$argumentList = @('-NoExit', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encodedPayload)
# 可选终端只接受已解析的应用程序，避免命令别名/函数改变执行目标。
# Windows Terminal 的 ArgumentList 会拼成一条命令行，因此系统路径须保留双引号，
# 支持非默认盘及带空格的 Windows 安装目录；业务内容仍由 EncodedCommand 携带。
$windowsTerminal = Get-Command 'wt.exe' -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
$powerShell7 = Get-Command 'pwsh.exe' -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
$terminals = @(
    @{
        Name = 'Windows Terminal'
        Test = { $null -ne $windowsTerminal }
        Launch = { Start-Process -FilePath $windowsTerminal.Source -ArgumentList (@(('"' + $systemPowerShell + '"')) + $argumentList) }
    },
    @{
        Name = 'PowerShell 7'
        Test = { $null -ne $powerShell7 }
        Launch = { Start-Process -FilePath $powerShell7.Source -ArgumentList $argumentList }
    },
    @{
        Name = 'Windows PowerShell'
        Test = { Test-Path -LiteralPath $systemPowerShell -PathType Leaf }
        Launch = { Start-Process -FilePath $systemPowerShell -ArgumentList $argumentList }
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
