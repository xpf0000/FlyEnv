import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateDirectory } from '../fork/terminal'
import { openDirectoryPath } from '../render/path'

test('path opening accepts the real host true acknowledgment and Electron string results', async () => {
  for (const response of [true, '']) {
    let called = false
    await openDirectoryPath(tmpdir(), validateDirectory, async () => {
      called = true
      return response
    })
    assert.equal(called, true)
  }
  await assert.rejects(
    openDirectoryPath(tmpdir(), validateDirectory, async () => 'open failed'),
    /open failed/
  )
})

test('missing paths and regular files never reach the OS file opener', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shortcut-path-'))
  try {
    const file = join(root, 'program.exe')
    await writeFile(file, '')
    let called = false
    const open = async () => {
      called = true
      return true
    }
    await assert.rejects(openDirectoryPath(file, validateDirectory, open))
    await assert.rejects(openDirectoryPath(join(root, 'missing'), validateDirectory, open))
    assert.equal(called, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
