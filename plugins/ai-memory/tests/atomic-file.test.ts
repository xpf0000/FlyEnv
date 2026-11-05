import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, readFile, readdir, rm, open, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AtomicFile, type AtomicFileIO } from '../fork/AtomicFile'

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(join(tmpdir(), 'flyenv-atomic-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'record.json')
  await writeFile(path, '{"revision":1}')
  return { root, path }
}
const realIO: AtomicFileIO = { open, rename, unlink }
test('atomic replacement publishes complete new bytes and leaves no temporary file', async (t) => {
  const { root, path } = await fixture(t)
  assert.equal(await new AtomicFile().replace(path, '{"revision":2}'), 'committed')
  assert.equal(await readFile(path, 'utf8'), '{"revision":2}')
  assert.deepEqual(await readdir(root), ['record.json'])
})
for (const point of ['write', 'file-sync', 'rename', 'directory-sync'] as const) {
  test(`failure at ${point} preserves the correct committed state`, async (t) => {
    const { root, path } = await fixture(t)
    const io: AtomicFileIO = {
      ...realIO,
      rename: async (from, to) => {
        if (point === 'rename') throw new Error('injected rename failure')
        await rename(from, to)
      },
      open: async (target, flags, mode) => {
        const handle = await open(target, flags, mode)
        return {
          writeFile: async (bytes) => {
            if (point === 'write') throw new Error('injected write failure')
            await handle.writeFile(bytes)
          },
          sync: async () => {
            if (
              (point === 'file-sync' && flags === 'wx') ||
              (point === 'directory-sync' && flags === 'r')
            )
              throw new Error('injected sync failure')
            await handle.sync()
          },
          close: () => handle.close()
        }
      }
    }
    const unknown = point === 'directory-sync'
    await assert.rejects(
      new AtomicFile(io, true).replace(path, '{"revision":2}'),
      (error: any) => error.outcome === (unknown ? 'unknown' : 'failed')
    )
    assert.equal(await readFile(path, 'utf8'), unknown ? '{"revision":2}' : '{"revision":1}')
    assert.deepEqual(await readdir(root), ['record.json'])
  })
}
