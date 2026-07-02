import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  AppHelperError,
  buildHelperCheckResponse,
  isAppHelperError,
  isWindowsHelperFallbackAllowed,
  resolveWindowsHelperTransport,
  shouldOpenHelperInstaller
} from '../src/shared/WindowsHelperState'

const sourcePath = path.resolve(process.cwd(), 'src/shared/WindowsHelperState.ts')
const source = fs.readFileSync(sourcePath, 'utf8')

const expectedAllowlist = [
  'tools/writeFileByRoot',
  'tools/writeBufferBase64ByRoot',
  'tools/rm',
  'tools/setSystemPath',
  'tools/setSystemEnv',
  'tools/setAutoStartWin',
  'host/sslAddTrustedCert'
]

const allowlistMatch = source.match(/const FALLBACK_ALLOWLIST = new Set\(\[(?<entries>[\s\S]*?)\]\)/)
assert.ok(allowlistMatch?.groups?.entries, 'FALLBACK_ALLOWLIST entries must be declared inline')

const actualAllowlist = [...allowlistMatch.groups.entries.matchAll(/'([^']+)'/g)].map((match) => match[1])
assert.deepEqual(actualAllowlist, expectedAllowlist)

for (const entry of expectedAllowlist) {
  const [module, fn] = entry.split('/')
  assert.equal(isWindowsHelperFallbackAllowed(module, fn), true)
}
assert.equal(isWindowsHelperFallbackAllowed('tools', 'readFileByRoot'), false)

assert.match(source, /export type HelperCheckResponse =/)
assert.match(source, /shouldOpenHelperInstaller = \(reason\?: string\)/)

assert.equal(
  resolveWindowsHelperTransport(
    new AppHelperError('helper_binary_missing', 'missing'),
    'tools',
    'writeFileByRoot'
  ),
  'reject'
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
  'prompt'
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
  'prompt'
)
assert.equal(
  resolveWindowsHelperTransport(
    new AppHelperError('helper_execution_failed', 'execution failed'),
    'tools',
    'writeFileByRoot'
  ),
  'fallback'
)

const helperMissing = new AppHelperError('helper_binary_missing', 'missing')
assert.equal(isAppHelperError(helperMissing), true)
assert.equal(isAppHelperError(helperMissing, 'helper_binary_missing'), true)
assert.equal(isAppHelperError(helperMissing, 'helper_unreachable'), false)
assert.equal(isAppHelperError(new Error('x')), false)
assert.equal(isAppHelperError({ code: 'helper_binary_missing' }), false)

assert.deepEqual(buildHelperCheckResponse(null), { code: 0, data: true })
assert.deepEqual(
  buildHelperCheckResponse(helperMissing),
  { code: 1, data: false, reason: 'helper_binary_missing' }
)
assert.deepEqual(
  buildHelperCheckResponse(new AppHelperError('helper_unreachable', 'unreachable')),
  { code: 1, data: false, reason: 'helper_unreachable' }
)
assert.deepEqual(buildHelperCheckResponse(new Error('x')), {
  code: 1,
  data: false,
  reason: 'helper_execution_failed'
})

assert.equal(shouldOpenHelperInstaller('helper_binary_missing'), false)
assert.equal(shouldOpenHelperInstaller('helper_unreachable'), true)
assert.equal(shouldOpenHelperInstaller('helper_version_mismatch'), true)
assert.equal(shouldOpenHelperInstaller('anything_else_from_ipc'), true)

console.log('windows-helper-state-test: ok')
