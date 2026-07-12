import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  isBinVersionCacheFile,
  isBinVersionCacheGet,
  isBinVersionCacheGetResponse,
  isBinVersionCacheSet,
  type BinVersionFingerprint
} from '../src/shared/BinVersionCache'

void readFileSync

const nginxFingerprint: BinVersionFingerprint = {
  path: '/opt/flyenv/nginx',
  mtimeMs: 100,
  size: 200
}

assert.equal(
  isBinVersionCacheGet({
    type: 'bin-version-cache-get',
    requestId: 'get-1',
    fingerprint: nginxFingerprint
  }),
  true
)
assert.equal(
  isBinVersionCacheGetResponse({
    type: 'bin-version-cache-get-response',
    requestId: 'get-1',
    hit: true,
    value: { version: '1.27.4' }
  }),
  true
)
assert.equal(
  isBinVersionCacheSet({
    type: 'bin-version-cache-set',
    fingerprint: nginxFingerprint,
    value: { version: '1.27.4' }
  }),
  true
)
assert.equal(
  isBinVersionCacheFile({
    schemaVersion: 1,
    entries: {
      '/opt/flyenv/nginx': {
        mtimeMs: 100,
        size: 200,
        value: { version: '1.27.4' }
      }
    }
  }),
  true
)
assert.equal(isBinVersionCacheGet({ type: 'normal-task' }), false)
assert.equal(isBinVersionCacheFile({ schemaVersion: 2, entries: {} }), false)
