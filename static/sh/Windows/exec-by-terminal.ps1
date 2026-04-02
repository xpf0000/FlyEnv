#Requires -Version 5.1

<#
.SYNOPSIS
    Open PowerShell terminal and execute multi-line commands from a file
.DESCRIPTION
    This script opens a new PowerShell window and executes commands from a file,
    similar to the Linux exec-by-terminal.sh script.
.PARAMETER CommandFile
    Path to the file containing commands to execute
.PARAMETER NoWait
    If specified, the terminal will close immediately after command execution
    without waiting for user input
.EXAMPLE
    .\exec-by-terminal.ps1 "C:\temp\commands.ps1"
#>

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$CommandFile,
    
    [switch]$NoWait
)

function Open-PowerShellWithCommand {
    param(
        [string]$CommandFile,
        [bool]$WaitForInput = $true
    )

    $terminalFound = $false
    
    # Read the command from file
    if (-not (Test-Path $CommandFile)) {
        Write-Error "Command file not found: $CommandFile"
        return 1
    }
    
    $processedCommand = Get-Content -Path $CommandFile -Raw -Encoding UTF8
    
    # Always use temp file for reliable execution (similar to Linux version)
    $tempFile = Join-Path $env:TEMP ("flyenv-cmd-{0:yyyyMMddHHmmssfff}.ps1" -f (Get-Date))
    
    # Build the wait/completion block
    $waitBlock = ""
    if ($WaitForInput) {
        $waitBlock = @"

Write-Host ""
if (`$exitCode -eq 0) {
    Write-Host "Command executed successfully." -ForegroundColor Green
} else {
    Write-Host "Command exited with code: `$exitCode" -ForegroundColor Yellow
}
Write-Host "Press any key to close..." -ForegroundColor Cyan
`$null = `$Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
"@
    }
    
    # Build the command display block - escape the command for safe embedding
    # Use Base64 encoding to avoid all escaping issues
    $commandBytes = [System.Text.Encoding]::UTF8.GetBytes($processedCommand)
    $encodedCommand = [Convert]::ToBase64String($commandBytes)
    
    $scriptContent = @"
`# Auto-generated temporary script by FlyEnv
`$ErrorActionPreference = 'Continue'
`$Host.UI.RawUI.BackgroundColor = 'Black'
Clear-Host

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "FlyEnv Command Execution" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

`# Decode and display the command being executed
`$cmdBytes = [Convert]::FromBase64String('$encodedCommand')
`$decodedCmd = [System.Text.Encoding]::UTF8.GetString(`$cmdBytes)
Write-Host "`$ " -ForegroundColor Yellow -NoNewline
Write-Host `$decodedCmd -ForegroundColor White
Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor DarkGray
Write-Host ""

`# Execute user commands
`$scriptBlock = [ScriptBlock]::Create(`$decodedCmd)
& `$scriptBlock

`$exitCode = `$LASTEXITCODE
if (`$? -eq `$false -and `$exitCode -eq 0) { `$exitCode = 1 }

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor DarkGray
$waitBlock

`# Self-cleanup
Start-Sleep -Milliseconds 500
Remove-Item -Path "`$PSCommandPath" -Force -ErrorAction SilentlyContinue
"@

    # Write to temp file using UTF8 BOM encoding for best compatibility
    $utf8BomEncoding = New-Object System.Text.UTF8Encoding $true
    [System.IO.File]::WriteAllText($tempFile, $scriptContent, $utf8BomEncoding)
    
    Write-Host "Created temporary script: $tempFile" -ForegroundColor Green

    # Try different PowerShell terminals in order of preference
    $terminals = @(
        @{ 
            Name = "Windows Terminal"; 
            Test = { Get-Command "wt" -ErrorAction SilentlyContinue };
            Launch = { param($file) Start-Process -FilePath "wt" -ArgumentList "powershell.exe", "-NoExit", "-ExecutionPolicy", "Bypass", "-File", $file }
        },
        @{ 
            Name = "PowerShell 7"; 
            Test = { Get-Command "pwsh" -ErrorAction SilentlyContinue };
            Launch = { param($file) Start-Process -FilePath "pwsh" -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", $file }
        },
        @{ 
            Name = "Windows PowerShell"; 
            Test = { Get-Command "powershell" -ErrorAction SilentlyContinue };
            Launch = { param($file) Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", $file }
        },
        @{ 
            Name = "Windows PowerShell (System32)"; 
            Test = { Test-Path "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" };
            Launch = { param($file) Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", $file }
        }
    )

    foreach ($terminal in $terminals) {
        if (& $terminal.Test) {
            try {
                Write-Host "Found terminal: $($terminal.Name)" -ForegroundColor Green
                & $terminal.Launch $tempFile
                $terminalFound = $true
                Write-Host "Launched successfully!" -ForegroundColor Green
                break
            }
            catch {
                Write-Warning "Failed to launch with $($terminal.Name): $_"
                continue
            }
        }
    }

    # Cleanup the command file
    try {
        Remove-Item $CommandFile -Force -ErrorAction SilentlyContinue
    } catch {}

    if (-not $terminalFound) {
        # Cleanup on failure
        if (Test-Path $tempFile) {
            Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
        }
        Write-Error "Error: Could not find a suitable PowerShell terminal to open."
        Write-Error "Tried: Windows Terminal, PowerShell 7 (pwsh), Windows PowerShell"
        return 1
    }

    return 0
}

# Main execution
Write-Host "PowerShell exec-by-terminal" -ForegroundColor Cyan
Write-Host "==========================" -ForegroundColor Cyan
Write-Host ""

$exitCode = Open-PowerShellWithCommand -CommandFile $CommandFile -WaitForInput (-not $NoWait)

exit $exitCode
