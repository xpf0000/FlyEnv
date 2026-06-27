import assert from 'node:assert/strict'
import {
  buildWindowsHelperFallbackPlan
} from '../src/shared/WindowsHelperFallback'

const inlineWritePlan = buildWindowsHelperFallbackPlan(
  'tools',
  'writeFileByRoot',
  ['C:/Temp/flyenv-inline.txt', 'ok'],
  2000
)
assert.equal(inlineWritePlan.mode, 'inline')
assert.match(inlineWritePlan.command, /-EncodedCommand/)
assert.equal(inlineWritePlan.tempFileContent, undefined)

const largeContent = 'x'.repeat(5000)
const dataFilePlan = buildWindowsHelperFallbackPlan(
  'tools',
  'writeFileByRoot',
  ['C:/Temp/flyenv-large.txt', largeContent],
  2000
)
assert.equal(dataFilePlan.mode, 'data-file')
assert.equal(dataFilePlan.tempFileKind, 'text')
assert.equal(dataFilePlan.tempFileContent, largeContent)
assert.match(dataFilePlan.script, /Get-Content -LiteralPath/)

const setEnvPlan = buildWindowsHelperFallbackPlan(
  'tools',
  'setSystemEnv',
  ['FLYENV_ALIAS', 'C:/FlyEnv/alias'],
  2000
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
      'writeBufferBase64ByRoot',
      ['C:/Temp/buffer.bin', '***not-base64***'],
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

console.log('windows-helper-fallback-plan-test: ok')
