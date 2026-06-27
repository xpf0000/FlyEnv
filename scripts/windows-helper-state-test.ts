import assert from 'node:assert/strict'
import {
  AppHelperError,
  buildHelperCheckResponse,
  isWindowsHelperFallbackAllowed,
  resolveWindowsHelperTransport,
  shouldOpenHelperInstaller
} from '../src/shared/WindowsHelperState'

assert.equal(isWindowsHelperFallbackAllowed('tools', 'writeFileByRoot'), true)
assert.equal(isWindowsHelperFallbackAllowed('tools', 'writeBufferBase64ByRoot'), true)
assert.equal(isWindowsHelperFallbackAllowed('tools', 'rm'), true)
assert.equal(isWindowsHelperFallbackAllowed('tools', 'setSystemPath'), true)
assert.equal(isWindowsHelperFallbackAllowed('tools', 'setSystemEnv'), true)
assert.equal(isWindowsHelperFallbackAllowed('tools', 'setAutoStartWin'), true)
assert.equal(isWindowsHelperFallbackAllowed('host', 'sslAddTrustedCert'), true)
assert.equal(isWindowsHelperFallbackAllowed('tools', 'readFileByRoot'), false)

assert.equal(
  resolveWindowsHelperTransport(
    new AppHelperError('helper_binary_missing', 'missing'),
    'tools',
    'writeFileByRoot'
  ),
  'fallback'
)
assert.equal(
  resolveWindowsHelperTransport(
    new AppHelperError('helper_binary_missing', 'missing'),
    'tools',
    'readFileByRoot'
  ),
  'reject'
)
assert.equal(
  resolveWindowsHelperTransport(
    new AppHelperError('helper_unreachable', 'unreachable'),
    'tools',
    'setSystemEnv'
  ),
  'fallback'
)
assert.equal(
  resolveWindowsHelperTransport(
    new AppHelperError('helper_unreachable', 'unreachable'),
    'tools',
    'readFileByRoot'
  ),
  'prompt'
)
assert.equal(
  resolveWindowsHelperTransport(
    new AppHelperError('helper_version_mismatch', 'mismatch'),
    'host',
    'sslAddTrustedCert'
  ),
  'fallback'
)

assert.deepEqual(buildHelperCheckResponse(null), { code: 0, data: true })
assert.deepEqual(
  buildHelperCheckResponse(new AppHelperError('helper_binary_missing', 'missing')),
  { code: 1, data: false, reason: 'helper_binary_missing' }
)
assert.deepEqual(
  buildHelperCheckResponse(new AppHelperError('helper_unreachable', 'unreachable')),
  { code: 1, data: false, reason: 'helper_unreachable' }
)

assert.equal(shouldOpenHelperInstaller('helper_binary_missing'), false)
assert.equal(shouldOpenHelperInstaller('helper_unreachable'), true)
assert.equal(shouldOpenHelperInstaller('helper_version_mismatch'), true)

console.log('windows-helper-state-test: ok')
