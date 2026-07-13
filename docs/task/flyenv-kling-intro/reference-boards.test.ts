import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import sharp from 'sharp'
import { MODULES, REPO_ROOT, partitionModules } from './module-manifest.ts'
import { BOARD_FILES, renderReferenceBoards } from './reference-boards.ts'

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

test('renderer creates six compliant 1920x1080 PNG boards', async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'flyenv-intro-'))
  try {
    await renderReferenceBoards(output)
    assert.deepEqual(BOARD_FILES, [
      'modules-a.png',
      'modules-b.png',
      'modules-c.png',
      'flyenv-logo.png',
      'spatial-style.png',
      'end-card.png'
    ])
    for (const filename of BOARD_FILES) {
      const metadata = await sharp(path.join(output, filename)).metadata()
      assert.equal(metadata.format, 'png')
      assert.equal(metadata.width, 1920)
      assert.equal(metadata.height, 1080)
    }
  } finally {
    await rm(output, { recursive: true, force: true })
  }
})
