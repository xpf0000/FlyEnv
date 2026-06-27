import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildWindowsHelperFallbackPlan
} from '../src/shared/WindowsHelperFallback'

const originalProgramData = process.env.ProgramData
const tempProgramData = path.join(os.tmpdir(), `flyenv-helper-plan-test-${Date.now()}`)
const allowedRootsDir = path.join(tempProgramData, 'FlyEnv')
const allowedRootsFile = path.join(allowedRootsDir, 'flyenv.allowed-roots')

process.env.ProgramData = tempProgramData
fs.mkdirSync(allowedRootsDir, { recursive: true })
fs.writeFileSync(allowedRootsFile, 'C:\\FlyEnv\n', 'utf8')

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
      ['D:/outside/flyenv/test.txt', 'x'],
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
  () => buildWindowsHelperFallbackPlan('tools', 'setAutoStartWin', ['true', 'FlyEnvStartup', 'C:/FlyEnv/flyenv.exe'], 2000),
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
