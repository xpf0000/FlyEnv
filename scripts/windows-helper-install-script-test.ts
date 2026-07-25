import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const scriptPath = path.resolve(process.cwd(), 'static/sh/Windows/flyenv-auto-start-now.ps1')
const source = fs.readFileSync(scriptPath, 'utf8')
const helperWhitelistPath = path.resolve(process.cwd(), 'src/helper-go/utils/whitelist.go')
const helperWhitelistSource = fs.readFileSync(helperWhitelistPath, 'utf8')

assert.match(source, /\$ErrorActionPreference\s*=\s*'Stop'/)
assert.match(source, /\$programData\s*=\s*\$env:ProgramData/)
assert.match(source, /\$programData\s*=\s*"C:\\ProgramData"/)
assert.match(
  helperWhitelistSource,
  /programData := os\.Getenv\("ProgramData"\)\s+if programData == ""/
)
assert.doesNotMatch(source, /\[string\]::IsNullOrWhiteSpace\(\$programData\)/)
assert.match(source, /if \(\$null -eq \$programData -or \$programData -eq ""\) \{/)
assert.doesNotMatch(source, /CommonApplicationData/)
assert.match(source, /Test-Path -LiteralPath \$exePath -PathType Leaf/)
assert.match(source, /FlyEnv data path is not a directory: \$dataPath/)
assert.match(source, /Start-Process -FilePath \$exePath -WindowStyle Hidden -PassThru/)
assert.match(source, /Wait-Process -Id \$runningProcesses\.Id -Timeout 5 -ErrorAction Stop/)
assert.match(source, /function Remove-TaskIfExists/)
assert.match(source, /\$RootFolder\.DeleteTask\(\$TaskName, 0\)/)
assert.match(source, /\$_.Exception\.HResult -ne -2147024894/)
assert.match(source, /throw "Failed to lock allowed roots file permissions:/)
assert.match(source, /if \(\$helperProcess -and -not \$helperProcess\.HasExited\)/)
assert.match(source, /\$registeredTask = \$rootFolder\.GetTask\(\$taskName\)/)

console.log('windows-helper-install-script-test: ok')
