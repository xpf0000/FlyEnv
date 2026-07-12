import assert from 'node:assert/strict'
import {
  isEnvSyncGetRequest,
  isEnvSyncGetResponse,
  isEnvSyncInvalidateRequest,
  isEnvSyncInvalidateResponse,
  isEnvSyncInvalidated,
  isEnvSyncSnapshot,
  type EnvSyncSnapshot
} from '../src/shared/EnvSyncProtocol'

const snapshot: EnvSyncSnapshot = {
  revision: 3,
  env: { PATH: '/usr/bin', HOME: '/Users/flyenv' },
  cmdPath: 'C:/Windows/System32/cmd.exe',
  powerShellPath: 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
  systemPath: 'C:/Windows/System32',
  fetchedAt: 1_000,
  expiresAt: 301_000
}

assert.equal(isEnvSyncSnapshot(snapshot), true)
assert.equal(isEnvSyncSnapshot({ ...snapshot, env: { PATH: undefined } }), false)
assert.equal(isEnvSyncSnapshot({ ...snapshot, expiresAt: Number.NaN }), false)
assert.equal(isEnvSyncGetRequest({ type: 'env-sync-get', requestId: 'get-1' }), true)
assert.equal(isEnvSyncGetRequest({ type: 'env-sync-get', requestId: '' }), false)
assert.equal(
  isEnvSyncGetResponse({ type: 'env-sync-get-response', requestId: 'get-1', snapshot }),
  true
)
assert.equal(
  isEnvSyncInvalidateRequest({ type: 'env-sync-invalidate', requestId: 'clean-1' }),
  true
)
assert.equal(
  isEnvSyncInvalidateResponse({
    type: 'env-sync-invalidate-response',
    requestId: 'clean-1',
    revision: 4
  }),
  true
)
assert.equal(isEnvSyncInvalidated({ type: 'env-sync-invalidated', revision: 4 }), true)
assert.equal(isEnvSyncInvalidated({ type: 'env-sync-invalidated', revision: -1 }), false)

console.log('env sync coordinator tests passed')
