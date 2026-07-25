import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const scriptPath = path.resolve(process.cwd(), 'static/sh/Windows/flyenv-auto-start-now.ps1')
const source = fs.readFileSync(scriptPath, 'utf8')
const helperWhitelistPath = path.resolve(process.cwd(), 'src/helper-go/utils/whitelist.go')
const helperWhitelistSource = fs.readFileSync(helperWhitelistPath, 'utf8')

assert.match(source, /\$ErrorActionPreference\s*=\s*'Stop'/)
assert.match(source, /\$programData\s*=\s*\$env:ProgramData/)
assert.match(
  source,
  /\$programData\s*=\s*\[System\.Environment\]::GetFolderPath\(\[System\.Environment\+SpecialFolder\]::CommonApplicationData\)/
)
assert.match(
  source,
  /\[System\.Environment\+SpecialFolder\]::CommonApplicationData\)\s+if \(\$null -eq \$programData -or \$programData -eq ""\) \{\s+\$programData = "C:\\ProgramData"/
)
assert.match(
  helperWhitelistSource,
  /programData := os\.Getenv\("ProgramData"\)\s+if programData == "" \{\s+programData = commonApplicationDataPath\(\)/
)
assert.doesNotMatch(source, /\[string\]::IsNullOrWhiteSpace\(\$programData\)/)
assert.match(source, /if \(\$null -eq \$programData -or \$programData -eq ""\) \{/)
assert.match(source, /Test-Path -LiteralPath \$exePath -PathType Leaf/)
assert.match(source, /FlyEnv data path is not a directory: \$dataPath/)
assert.match(source, /function Assert-PathHasNoReparsePoints/)
assert.match(source, /Assert-PathHasNoReparsePoints -Path \$dataPath -Label ['"]FlyEnv data directory['"]/)
assert.match(source, /\$allowDir = Assert-PathHasNoReparsePoints -Path \$allowDir -Label ['"]FlyEnv allowed roots directory['"]/)
assert.match(source, /\$canonicalPath = \[System\.IO\.Path\]::GetFullPath\(\$Path\)/)
assert.match(source, /Wait-Process -Id \$runningProcesses\.Id -Timeout 5 -ErrorAction Stop/)
assert.match(
  source,
  /\$helperProcessNames = @\(\[System\.IO\.Path\]::GetFileNameWithoutExtension\(\$exePath\), ['"]flyenv-helper\*['"]\) \| Sort-Object -Unique/
)
assert.match(source, /Get-Process -Name \$helperProcessName -ErrorAction SilentlyContinue/)
assert.match(source, /function Remove-TaskIfExists/)
assert.match(source, /\$RootFolder\.DeleteTask\(\$TaskName, 0\)/)
assert.match(source, /\$_.Exception\.HResult -ne -2147024894/)
assert.match(source, /Throw-InstallerError -Code 'helper_acl_invalid'/)
assert.match(source, /\$registeredTask = \$rootFolder\.GetTask\(\$taskName\)/)
assert.match(source, /function Assert-AllowedRootsAcl/)
assert.match(source, /Assert-AllowedRootsAcl -Path \$allowDir/)
assert.match(source, /Assert-AllowedRootsAcl -Path \$allowFile/)
assert.match(source, /FLYENV_HELPER_INSTALL_ERROR:/)
assert.match(source, /\$appUserName = "#APPUSERNAME#"/)
assert.match(source, /\$appUserSid = New-Object System\.Security\.Principal\.SecurityIdentifier\("#APPUSERSID#"\)/)
assert.match(source, /\$keyPath = "#KEYPATH#"/)
assert.match(source, /\$action\.Arguments = "--key-path/)
assert.match(source, /\$taskDefinition\.Principal\.UserId = \$appUserName/)
assert.match(source, /function Assert-RegisteredTaskConfiguration/)
assert.match(source, /Assert-RegisteredTaskConfiguration -Task \$registeredTask/)
assert.match(source, /\$registeredTask\.Run\(\$null\)/)

console.log('windows-helper-install-script-test: ok')
