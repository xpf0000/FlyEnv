import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm, readdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DataRootLease } from '../src/fork/runtime/DataRootLease'

test('fixed directory lock rejects concurrent descriptors including realpath aliases', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'flyenv-lease-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const data = join(root, 'data')
  const owner = await DataRootLease.acquire(data)
  try {
    await assert.rejects(DataRootLease.acquire(data), (e: any) => e.code === 'owner_busy')
    await symlink(data, join(root, 'alias'), 'junction')
    await assert.rejects(
      DataRootLease.acquire(join(root, 'alias')),
      (e: any) => e.code === 'owner_busy'
    )
  } finally {
    await owner.release()
  }
  const names = await readdir(data)
  assert.equal(names.length, 1, 'fixed lock inode is preserved after release')
  const next = await DataRootLease.acquire(data)
  await next.release()
  await next.release()
  assert.deepEqual(await readdir(data), names)
})
