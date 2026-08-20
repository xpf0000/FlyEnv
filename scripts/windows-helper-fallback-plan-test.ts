import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildFlyEnvDataDirectoryRecoveryUacPlan,
  buildWindowsHelperFallbackPlan
} from '../src/shared/WindowsHelperFallback'

const originalProgramData = process.env.ProgramData
const tempProgramData = path.join(os.tmpdir(), `flyenv-helper-plan-test-${Date.now()}`)
const allowedRootsDir = path.join(tempProgramData, 'FlyEnv')
const allowedRootsFile = path.join(allowedRootsDir, 'flyenv.allowed-roots')

process.env.ProgramData = tempProgramData
fs.mkdirSync(allowedRootsDir, { recursive: true })
fs.writeFileSync(allowedRootsFile, 'C:\\FlyEnv\n', 'utf8')

const dataDirectoryRecoveryPlan = buildFlyEnvDataDirectoryRecoveryUacPlan(
  'C:\\FlyEnv',
  'S-1-5-21-111-222-333-444'
)
assert.match(dataDirectoryRecoveryPlan.command, /-EncodedCommand/)
assert.match(dataDirectoryRecoveryPlan.script, /FromBase64String/)
assert.doesNotMatch(dataDirectoryRecoveryPlan.script, /C:\\FlyEnv/)
assert.doesNotMatch(dataDirectoryRecoveryPlan.script, /S-1-5-21-111-222-333-444/)
assert.match(dataDirectoryRecoveryPlan.script, /\[System\.IO\.Directory\]::CreateDirectory/)
assert.match(dataDirectoryRecoveryPlan.script, /reparse point/)
assert.match(dataDirectoryRecoveryPlan.script, /FileSystemAccessRule/)
assert.match(dataDirectoryRecoveryPlan.script, /FullControl/)
assert.match(dataDirectoryRecoveryPlan.script, /ContainerInherit,ObjectInherit/)
assert.match(dataDirectoryRecoveryPlan.script, /Set-Acl -LiteralPath/)

assert.throws(
  () => buildFlyEnvDataDirectoryRecoveryUacPlan('C:\\FlyEnv\\child', 'S-1-5-21-111-222-333-444'),
  (error: unknown) => {
    assert.equal((error as { code?: string }).code, 'helper_execution_failed')
    return true
  }
)

assert.throws(
  () => buildFlyEnvDataDirectoryRecoveryUacPlan('D:\\outside', 'S-1-5-21-111-222-333-444'),
  (error: unknown) => {
    assert.equal((error as { code?: string }).code, 'helper_execution_failed')
    return true
  }
)

const inlineWritePlan = buildWindowsHelperFallbackPlan(
  'tools',
  'writeFileByRoot',
  ['C:/FlyEnv/flyenv-inline.txt', 'ok'],
  2000
)
assert.equal(inlineWritePlan.mode, 'inline')
assert.match(inlineWritePlan.command, /-EncodedCommand/)
assert.equal(inlineWritePlan.tempFileContent, undefined)

const emptyWritePlan = buildWindowsHelperFallbackPlan(
  'tools',
  'writeFileByRoot',
  ['C:/FlyEnv/empty.txt', ''],
  2000
)
assert.equal(emptyWritePlan.mode, 'inline')

const multilineWritePlan = buildWindowsHelperFallbackPlan(
  'tools',
  'writeFileByRoot',
  ['C:/FlyEnv/multiline.txt', 'line1\nline2'],
  2000
)
assert.equal(multilineWritePlan.mode, 'inline')

const tinyLimitPlan = buildWindowsHelperFallbackPlan(
  'tools',
  'writeFileByRoot',
  ['C:/FlyEnv/final-length.txt', 'ok'],
  80
)
assert.equal(tinyLimitPlan.mode, 'data-file')
assert.equal(tinyLimitPlan.tempFileKind, 'text')
assert.equal(tinyLimitPlan.tempFileContent, 'ok')
assert.match(tinyLimitPlan.script, /Get-Content -LiteralPath/)

const largeContent = 'x'.repeat(5000)
const dataFilePlan = buildWindowsHelperFallbackPlan(
  'tools',
  'writeFileByRoot',
  ['C:/FlyEnv/flyenv-large.txt', largeContent],
  2000
)
assert.equal(dataFilePlan.mode, 'data-file')
assert.equal(dataFilePlan.tempFileKind, 'text')
assert.equal(dataFilePlan.tempFileContent, largeContent)
assert.match(dataFilePlan.script, /Get-Content -LiteralPath/)

const tinyBase64LimitPlan = buildWindowsHelperFallbackPlan(
  'tools',
  'writeBufferBase64ByRoot',
  ['C:/FlyEnv/bin/flyenv-helper.exe', 'T0s='],
  80
)
assert.equal(tinyBase64LimitPlan.mode, 'data-file')
assert.equal(tinyBase64LimitPlan.tempFileKind, 'base64')
assert.equal(tinyBase64LimitPlan.tempFileContent, 'T0s=')
assert.match(tinyBase64LimitPlan.script, /Get-Content -LiteralPath/)

const setEnvPlan = buildWindowsHelperFallbackPlan(
  'tools',
  'setSystemEnv',
  ['FLYENV_ALIAS', 'C:/FlyEnv/alias'],
  6000
)
assert.equal(setEnvPlan.mode, 'inline')
assert.match(setEnvPlan.script, /Set-ItemProperty/)

const rawPathEntries = [
  '%INTEL_DEV_REDIST%redist\\intel64\\compiler',
  'relative\\tool',
  '..\\traversal',
  '$env:SystemRoot\\System32',
  '\\\\server\\share\\bin',
  '路径\\工具',
  ''
]
const expectedRawPath = 'C:\\SDK\\bin;%INTEL_DEV_REDIST%redist\\intel64\\compiler;'
const setPathPlan = buildWindowsHelperFallbackPlan(
  'tools',
  'setSystemPath',
  [rawPathEntries, {}, expectedRawPath],
  6000
)
assert.equal(setPathPlan.mode, 'data-file')
assert.equal(
  setPathPlan.tempFileContent,
  JSON.stringify({ paths: rawPathEntries, otherVars: {}, expectedPath: expectedRawPath })
)
assert.match(
  setPathPlan.script,
  /Get-Content -LiteralPath .+ -Raw -Encoding UTF8 \| ConvertFrom-Json/
)
assert.match(setPathPlan.script, /\[string\]::Join\(';', \[string\[\]\]\$paths\)/)
assert.doesNotMatch(setPathPlan.script, /Where-Object/)
assert.doesNotMatch(setPathPlan.script, /\+ ';'/)
assert.match(setPathPlan.script, /DoNotExpandEnvironmentNames/)
assert.match(setPathPlan.script, /\$currentPath -cne \$expectedPath/)
assert.match(setPathPlan.script, /throw 'system_path_changed'/)

assert.throws(
  () => buildWindowsHelperFallbackPlan('tools', 'setSystemPath', [['bad\0path'], {}], 6000),
  (error: unknown) => {
    assert.equal((error as { code?: string }).code, 'helper_execution_failed')
    return true
  }
)

assert.throws(
  () =>
    buildWindowsHelperFallbackPlan(
      'tools',
      'setSystemPath',
      [['C:\\FlyEnv\\bin'], {}, 'bad\0path'],
      6000
    ),
  (error: unknown) => {
    assert.equal((error as { code?: string }).code, 'helper_execution_failed')
    return true
  }
)

const setAutoStartPlan = buildWindowsHelperFallbackPlan(
  'tools',
  'setAutoStartWin',
  [true, 'FlyEnvStartup', 'C:/FlyEnv/flyenv.exe'],
  6000
)
assert.equal(setAutoStartPlan.mode, 'inline')
assert.match(setAutoStartPlan.script, /\$schtasksExe = \$null/)
assert.match(setAutoStartPlan.script, /Sysnative/)
assert.match(setAutoStartPlan.script, /System32/)
assert.doesNotMatch(setAutoStartPlan.script, /& schtasks\.exe /)
assert.match(setAutoStartPlan.script, /\/rl limited/)

const setHelperAutoStartPlan = buildWindowsHelperFallbackPlan(
  'tools',
  'setAutoStartWin',
  [true, 'FlyEnvHelperTask', 'C:/FlyEnv/flyenv-helper.exe'],
  6000
)
assert.match(setHelperAutoStartPlan.script, /\/rl highest/)

assert.throws(
  () => buildWindowsHelperFallbackPlan('tools', 'setSystemEnv', ['FLYENV-ALIAS', 'x'], 2000),
  (error: unknown) => {
    assert.equal((error as { code?: string }).code, 'helper_execution_failed')
    return true
  }
)

assert.throws(
  () =>
    buildWindowsHelperFallbackPlan(
      'tools',
      'writeFileByRoot',
      ['D:/outside/project/test.txt', 'x'],
      2000
    ),
  (error: unknown) => {
    assert.equal((error as { code?: string }).code, 'helper_execution_failed')
    return true
  }
)

assert.throws(
  () =>
    buildWindowsHelperFallbackPlan(
      'tools',
      'writeBufferBase64ByRoot',
      ['C:/FlyEnv/buffer.bin', '***not-base64***'],
      2000
    ),
  (error: unknown) => {
    assert.equal((error as { code?: string }).code, 'helper_execution_failed')
    return true
  }
)

assert.throws(
  () =>
    buildWindowsHelperFallbackPlan(
      'tools',
      'setAutoStartWin',
      ['true', 'FlyEnvStartup', 'C:/FlyEnv/flyenv.exe'],
      2000
    ),
  (error: unknown) => {
    assert.equal((error as { code?: string }).code, 'helper_execution_failed')
    return true
  }
)

assert.throws(
  () =>
    buildWindowsHelperFallbackPlan(
      'tools',
      'writeFileByRoot',
      ['C:/Windows/System32/not-allowed.txt', 'x'],
      2000
    ),
  (error: unknown) => {
    assert.equal((error as { code?: string }).code, 'helper_execution_failed')
    return true
  }
)

assert.throws(
  () =>
    buildWindowsHelperFallbackPlan(
      'tools',
      'setAutoStartWin',
      [true, 'FlyEnvStartup', 'C:/Windows/System32/flyenv.exe'],
      2000
    ),
  (error: unknown) => {
    assert.equal((error as { code?: string }).code, 'helper_execution_failed')
    return true
  }
)

console.log('windows helper fallback plan test passed')

if (originalProgramData == null) {
  delete process.env.ProgramData
} else {
  process.env.ProgramData = originalProgramData
}
fs.rmSync(tempProgramData, { recursive: true, force: true })
