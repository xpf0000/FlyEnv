import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const scriptPath = path.resolve(process.cwd(), 'static/sh/Windows/flyenv-auto-start-now.ps1')
const source = fs.readFileSync(scriptPath, 'utf8')
const appHelperPath = path.resolve(process.cwd(), 'src/main/core/AppHelper.ts')
const appHelperSource = fs.readFileSync(appHelperPath, 'utf8')
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
  /if runtime\.GOOS == "windows" \{\s+return windowsHelperAllowedRootsPath/
)
assert.doesNotMatch(source, /\[string\]::IsNullOrWhiteSpace\(\$programData\)/)
assert.match(source, /if \(\$null -eq \$programData -or \$programData -eq ""\) \{/)
assert.match(source, /\$backupExePath = \[string\]\$config.backupExecutable/)
assert.match(source, /Test-Path -LiteralPath \$backupExePath -PathType Leaf/)
assert.match(source, /Get-FileHash -LiteralPath \$backupExePath -Algorithm SHA256/)
assert.match(source, /Copy-Item -LiteralPath \$backupExePath -Destination \$pendingHelperFile/)
assert.match(
  source,
  /\[System\.IO\.File\]::Replace\(\s*\$pendingHelperFile,\s*\$exePath,\s*\[System\.Management\.Automation\.Language\.NullString\]::Value,\s*\$true\s*\)/
)
assert.match(appHelperSource, /join\(dirname\(bin\), 'flyenv-helper-backup\.exe'\)/)
assert.match(appHelperSource, /backupExecutable: backupBin/)
assert.match(source, /FlyEnv data path is not a directory: \$dataPath/)
assert.match(source, /function Assert-PathHasNoReparsePoints/)
assert.match(
  source,
  /Assert-PathHasNoReparsePoints -Path \$dataPath -Label ['"]FlyEnv data directory['"]/
)
assert.match(
  source,
  /\$instanceRoot = Assert-PathHasNoReparsePoints -Path \$instanceRoot -Label ['"]FlyEnv helper instance directory['"]/
)
assert.match(source, /\$canonicalPath = \[System\.IO\.Path\]::GetFullPath\(\$Path\)/)
assert.doesNotMatch(source, /Get-Process -Name \$helperProcessName/)
assert.doesNotMatch(source, /Stop-Process/)
assert.match(source, /\$instanceId = \[string\]\$config\.identity\.instanceId/)
assert.match(source, /\$taskFolderPath = \[string\]\$config\.identity\.taskFolder/)
assert.match(source, /\$taskName = \[string\]\$config\.identity\.taskName/)
assert.match(source, /\$allowFile = \[string\]\$config\.identity\.allowedRootsPath/)
assert.match(source, /\$instanceConfigPath = \[string\]\$config\.identity\.instanceConfigPath/)
assert.match(source, /\$pipeName = \[string\]\$config\.identity\.pipeName/)
assert.match(source, /\$expectedPipeName = "FlyEnv\.Helper\.\$instanceId"/)
assert.match(source, /\$pipeName -ne \$expectedPipeName/)
assert.match(source, /ConvertTo-Json -Compress/)
assert.match(source, /function Get-OrCreateTaskFolder/)
assert.ok(source.includes(String.raw`$currentFolder = $Scheduler.GetFolder('\')`))
assert.ok(source.includes(String.raw`$taskFolderPath -ne '\FlyEnv\Helper'`))
assert.ok(!source.includes(String.raw`$taskFolderPath -ne '\\FlyEnv\\Helper'`))
assert.match(source, /\$currentFolder\.CreateFolder\(\$segment, \$FolderSddl\)/)
assert.match(source, /\$currentFolder\.SetSecurityDescriptor\(\$FolderSddl, 0\)/)
assert.match(source, /\(A;;FR;;;BU\)/)
assert.match(source, /Throw-InstallerError -Code 'helper_acl_invalid'/)
assert.match(
  source,
  /\$registeredTask = Get-TaskIfExists -TaskFolder \$rootFolder -TaskName \$taskName/
)
assert.match(source, /function Assert-AllowedRootsAcl/)
assert.match(source, /Assert-AllowedRootsAcl -Path \$instanceRoot/)
assert.match(source, /Assert-AllowedRootsAcl -Path \$allowFile/)
assert.match(source, /FLYENV_HELPER_INSTALL_ERROR:/)
assert.match(source, /\$appUserName = \[string\]\$config.identity.account/)
assert.match(
  source,
  /\$appUserSid = New-Object System\.Security\.Principal\.SecurityIdentifier\(\[string\]\$config.identity.sid\)/
)
assert.match(source, /\$keyPath = \[string\]\$config.identity.keyPath/)
assert.match(source, /\$action\.Arguments = "--instance-id/)
assert.doesNotMatch(source, /--key-path/)
assert.match(source, /\$taskDefinition\.Principal\.UserId = \$systemSid.Value/)
assert.match(source, /function Assert-RegisteredTaskConfiguration/)
assert.match(source, /Assert-RegisteredTaskConfiguration -Task \$registeredTask/)
assert.match(source, /\$registeredTask\.Run\(\$null\)/)
assert.doesNotMatch(source, /FlyEnvHelperTask/)

console.log('windows-helper-install-script-test: ok')
