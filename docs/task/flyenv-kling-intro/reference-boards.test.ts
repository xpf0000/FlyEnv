import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { MODULES, REPO_ROOT, partitionModules } from './module-manifest.ts'

test('manifest contains 24 unique modules backed by existing assets', () => {
  assert.equal(MODULES.length, 24)
  assert.equal(new Set(MODULES.map((item) => item.name)).size, 24)
  for (const item of MODULES) {
    assert.equal(existsSync(path.join(REPO_ROOT, item.asset)), true, item.asset)
  }
})

test('manifest partitions into three ordered boards of eight modules', () => {
  const groups = partitionModules(MODULES)
  assert.deepEqual(
    groups.map((group) => group.length),
    [8, 8, 8]
  )
  assert.deepEqual(groups.flat(), MODULES)
})
