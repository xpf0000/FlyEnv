import assert from 'node:assert/strict'
import { test } from 'node:test'
import { constants } from 'node:fs'
import type { Stats } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openRegularFile } from '../fork/RegularFile'

const invalid = (): never => {
  throw new Error('invalid_regular_file')
}
const stats = ({ symbolic = false, ino = 1, dev = 1, file = true } = {}) =>
  ({
    isFile: () => file,
    isSymbolicLink: () => symbolic,
    dev,
    ino
  }) as Stats

test('a final-component symlink is rejected before opening', async () => {
  let opens = 0
  await assert.rejects(
    openRegularFile('linked', constants.O_RDONLY, undefined, invalid, {
      lstat: async () => stats({ symbolic: true }),
      open: async () => {
        opens++
        throw new Error('must not open')
      }
    }),
    /invalid_regular_file/
  )
  assert.equal(opens, 0)
})

test('an opened identity mismatch closes the handle and preserves the validation failure', async () => {
  let closes = 0
  const handle = {
    stat: async () => stats({ ino: 2 }),
    close: async () => {
      closes++
    }
  } as unknown as FileHandle
  await assert.rejects(
    openRegularFile('record', constants.O_RDONLY, undefined, invalid, {
      lstat: async () => stats(),
      open: async () => handle
    }),
    /invalid_regular_file/
  )
  assert.equal(closes, 1)
})

test('a regular file can be opened and read', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'memory-regular-file-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'record.json')
  await writeFile(path, 'complete')
  const handle = await openRegularFile(path, constants.O_RDONLY, undefined, invalid)
  try {
    assert.equal(await handle.readFile('utf8'), 'complete')
  } finally {
    await handle.close()
  }
})

test('a missing file can be created when the caller requests creation', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'memory-regular-file-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'instructions.md')
  const handle = await openRegularFile(
    path,
    constants.O_CREAT | constants.O_EXCL | constants.O_RDWR,
    0o600,
    invalid
  )
  try {
    await handle.writeFile('created')
  } finally {
    await handle.close()
  }
  assert.equal(await readFile(path, 'utf8'), 'created')
})

test('a missing file without creation preserves ENOENT and never opens', async () => {
  let opens = 0
  await assert.rejects(
    openRegularFile('missing', constants.O_RDONLY, undefined, invalid, {
      lstat: async () => {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      },
      open: async () => {
        opens++
        throw new Error('must not open')
      }
    }),
    (error: NodeJS.ErrnoException) => error.code === 'ENOENT'
  )
  assert.equal(opens, 0)
})

test('a non-regular final component is rejected before opening', async () => {
  let opens = 0
  await assert.rejects(
    openRegularFile('directory', constants.O_RDONLY, undefined, invalid, {
      lstat: async () => stats({ file: false }),
      open: async () => {
        opens++
        throw new Error('must not open')
      }
    }),
    /invalid_regular_file/
  )
  assert.equal(opens, 0)
})

test('a non-regular opened handle is rejected and closed', async () => {
  let closes = 0
  const handle = {
    stat: async () => stats({ file: false }),
    close: async () => {
      closes++
    }
  } as unknown as FileHandle
  await assert.rejects(
    openRegularFile('directory', constants.O_RDONLY, undefined, invalid, {
      lstat: async () => stats(),
      open: async () => handle
    }),
    /invalid_regular_file/
  )
  assert.equal(closes, 1)
})

test('a post-open metadata failure closes the handle and preserves the IO error', async () => {
  let closes = 0
  let reads = 0
  const handle = {
    stat: async () => stats(),
    close: async () => {
      closes++
    }
  } as unknown as FileHandle
  await assert.rejects(
    openRegularFile('record', constants.O_RDONLY, undefined, invalid, {
      lstat: async () => {
        reads++
        if (reads > 1) throw new Error('metadata_unavailable')
        return stats()
      },
      open: async () => handle
    }),
    /metadata_unavailable/
  )
  assert.equal(closes, 1)
})

test('a close failure cannot replace the validation failure', async () => {
  const handle = {
    stat: async () => stats({ ino: 2 }),
    close: async () => {
      throw new Error('close_failed')
    }
  } as unknown as FileHandle
  await assert.rejects(
    openRegularFile('record', constants.O_RDONLY, undefined, invalid, {
      lstat: async () => stats(),
      open: async () => handle
    }),
    /invalid_regular_file/
  )
})
