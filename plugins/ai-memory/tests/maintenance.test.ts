import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  symlink,
  rename,
  readdir,
  chmod,
  lstat
} from 'node:fs/promises'
import { join, basename, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { DataRootLease } from '../../../src/fork/runtime/DataRootLease'
import { MemoryWorkspace } from '../fork/MemoryWorkspace'
import { createMemoryBackup, recoverMemoryRestore } from '../fork/memory-backup'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'memory-maintenance-'))
  const data = join(root, 'memory')
  await mkdir(data)
  return { root, data, clean: () => rm(root, { recursive: true, force: true }) }
}
const draft = () => ({
  scope: 'global' as const,
  type: 'note' as const,
  topic: 'test',
  title: 'Maintenance fixture',
  summary: 'Backup test',
  tags: [],
  content: 'original',
  source: { kind: 'document' as const, agent: 'test', description: 'Synthetic fixture' },
  request_id: randomUUID()
})

test('backup/restore preserves all scopes, histories, deleted receipts and a copy of replaced data', async () => {
  const f = await fixture()
  const ws = await MemoryWorkspace.open(f.data)
  try {
    const input = draft()
    const saved = await ws.run((e) => e.call('store', input))
    assert.equal(saved.outcome, 'success')
    const id = saved.data!.id
    const project = join(f.root, 'project')
    await mkdir(project)
    const projectInput = { ...draft(), scope: 'project' as const, project_path: project }
    const scoped = await ws.run((e) => e.call('store', projectInput))
    assert.equal(scoped.outcome, 'success')
    await ws.run((e) =>
      e.call('update', {
        scope: 'global',
        id,
        expected_revision: 1,
        request_id: randomUUID(),
        reason: 'Test history',
        changes: { content: 'version two' }
      })
    )
    const forgotten = await ws.run((e) => e.call('store', draft()))
    const forgetInput = {
      scope: 'global' as const,
      id: forgotten.data!.id,
      expected_revision: 1,
      request_id: randomUUID()
    }
    await ws.run((e) => e.call('forget', forgetInput))
    const backup = await ws.backup(f.root)
    assert.equal(backup.outcome, 'success')
    await ws.run((e) =>
      e.call('update', {
        scope: 'global',
        id,
        expected_revision: 2,
        request_id: randomUUID(),
        reason: 'After backup',
        changes: { content: 'newer current data' }
      })
    )
    const restored = await ws.restore(backup.data!.path)
    assert.equal(restored.outcome, 'success')
    assert.ok(restored.data!.safetyBackupPath)
    assert.equal(
      (await ws.run((e) => e.call('get', { scope: 'global', id }))).data!.content,
      'version two'
    )
    assert.equal(
      (await ws.run((e) => e.call('get', { scope: 'global', id, revision: 1 }))).data!.content,
      'original'
    )
    assert.equal(
      (
        await ws.run((e) =>
          e.call('get', { scope: 'project', project_path: project, id: scoped.data!.id })
        )
      ).outcome,
      'success'
    )
    assert.equal((await ws.run((e) => e.call('forget', forgetInput))).outcome, 'success')
    const preserved = await ws.restore(restored.data!.safetyBackupPath!)
    assert.equal(preserved.outcome, 'success')
    assert.equal(
      (await ws.run((e) => e.call('get', { scope: 'global', id }))).data!.content,
      'newer current data'
    )
  } finally {
    await ws.close()
    await f.clean()
  }
})

test('tampered backups, escaping paths, symlinks and nested destinations never replace current data', async () => {
  const f = await fixture()
  const ws = await MemoryWorkspace.open(f.data)
  try {
    const saved = await ws.run((e) => e.call('store', draft()))
    const id = saved.data!.id
    assert.equal((await ws.backup(f.data)).outcome, 'failed')
    const backup = await ws.backup(f.root)
    const folder = backup.data!.path
    const manifestPath = join(folder, 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const entry = manifest.files[0]
    await writeFile(join(folder, 'data', entry.path), 'tampered')
    assert.equal((await ws.restore(folder)).outcome, 'failed')
    manifest.files[0].path = '../outside'
    await writeFile(manifestPath, JSON.stringify(manifest))
    assert.equal((await ws.restore(folder)).outcome, 'failed')
    await symlink(join(f.root, 'project-secrets'), join(f.data, 'unexpected-link'))
    assert.equal((await ws.backup(f.root)).outcome, 'failed')
    assert.equal((await ws.run((e) => e.call('get', { scope: 'global', id }))).outcome, 'success')
  } finally {
    await ws.close()
    await f.clean()
  }
})

test('maintenance drains earlier writes, holds later calls and survives a failed backup', async () => {
  const f = await fixture()
  let release!: () => void
  let entered!: () => void
  const enteredPromise = new Promise<void>((r) => {
    entered = r
  })
  const gate = new Promise<void>((r) => {
    release = r
  })
  const ws = await MemoryWorkspace.open(f.data, {
    backup: async (...args) => {
      entered()
      await gate
      return createMemoryBackup(...args)
    }
  })
  try {
    const write = ws.run((e) => e.call('store', draft()))
    const backup = ws.backup(f.root)
    await enteredPromise
    let after = false
    const next = ws.run(async () => {
      after = true
      return 1
    })
    await Promise.resolve()
    assert.equal(after, false)
    release()
    assert.equal((await backup).outcome, 'success')
    assert.equal(await next, 1)
    assert.equal((await write).outcome, 'success')
    assert.equal((await ws.backup(join(f.root, 'missing'))).outcome, 'failed')
    assert.equal(
      (await ws.run((e) => e.call('search', { scope: 'global' }))).data!.results.length,
      1
    )
    await ws.close()
    await assert.rejects(
      ws.run(async () => 1),
      /engine_closed/
    )
  } finally {
    release?.()
    await ws.close()
    await f.clean()
  }
})

test('interrupted payload installation rolls back while the actual host lock remains held', async () => {
  const f = await fixture()
  const lease = await DataRootLease.acquire(f.data)
  try {
    await writeFile(join(f.data, 'keep.txt'), 'current data')
    const stage = join(f.root, `.memory-restore-stage-${randomUUID()}`)
    const rollback = join(f.root, `.memory-restore-previous-${randomUUID()}`)
    await mkdir(stage)
    await mkdir(rollback)
    await writeFile(join(stage, 'incoming.txt'), 'incoming')
    await rename(join(f.data, 'keep.txt'), join(rollback, 'keep.txt'))
    await rename(join(stage, 'incoming.txt'), join(f.data, 'incoming.txt'))
    const journal = join(dirname(f.data), `.${basename(f.data)}.memory-restore.json`)
    await writeFile(
      journal,
      JSON.stringify({
        version: 2,
        root: f.data,
        stage,
        rollback,
        phase: 'installing',
        originalNames: ['keep.txt'],
        incomingNames: ['incoming.txt']
      })
    )
    await recoverMemoryRestore(f.data)
    assert.equal(await readFile(join(f.data, 'keep.txt'), 'utf8'), 'current data')
    assert.deepEqual((await readdir(f.data)).sort(), ['.flyenv-owner.lock', 'keep.txt'])
    await assert.rejects(DataRootLease.acquire(f.data), (e: any) => e.code === 'owner_busy')
  } finally {
    await lease.release()
    await f.clean()
  }
})

test('restore preserves the live ownership lock inode and never backs it up', async () => {
  const f = await fixture()
  const lease = await DataRootLease.acquire(f.data)
  const ws = await MemoryWorkspace.open(f.data)
  try {
    const before = await lstat(join(f.data, '.flyenv-owner.lock'))
    await ws.run((e) => e.call('store', draft()))
    const backup = await ws.backup(f.root)
    const manifest = JSON.parse(await readFile(join(backup.data!.path, 'manifest.json'), 'utf8'))
    assert.ok(!manifest.files.some((item: any) => item.path === '.flyenv-owner.lock'))
    assert.equal((await ws.restore(backup.data!.path)).outcome, 'success')
    assert.equal((await lstat(join(f.data, '.flyenv-owner.lock'))).ino, before.ino)
    await assert.rejects(DataRootLease.acquire(f.data), (e: any) => e.code === 'owner_busy')
  } finally {
    await ws.close()
    await lease.release()
    await f.clean()
  }
})

test('a completed restore remains usable and can reopen when supplementary old-data cleanup fails', async () => {
  const f = await fixture()
  let ws = await MemoryWorkspace.open(f.data)
  try {
    await ws.run((e) => e.call('store', draft()))
    await mkdir(join(f.data, 'retained', 'readonly'), { recursive: true })
    await writeFile(join(f.data, 'retained', 'readonly', 'keep'), 'original')
    const backup = await ws.backup(f.root)
    await chmod(join(f.data, 'retained', 'readonly'), 0o500)
    const restored = await ws.restore(backup.data!.path)
    assert.equal(restored.outcome, 'success')
    assert.ok(restored.data!.warnings?.includes('restore_cleanup_warning'))
    assert.equal((await ws.run((e) => e.call('search', { scope: 'global' }))).outcome, 'success')
    await ws.close()
    ws = await MemoryWorkspace.open(f.data)
    assert.equal(
      (await ws.run((e) => e.call('search', { scope: 'global' }))).data!.results.length,
      1
    )
  } finally {
    await ws.close()
    await chmod(join(f.data, 'retained', 'readonly'), 0o700).catch(() => {})
    for (const name of await readdir(f.root))
      if (name.startsWith('.memory-restore-previous-'))
        await chmod(join(f.root, name, 'retained', 'readonly'), 0o700).catch(() => {})
    await f.clean()
  }
})

test('rechecking a maintenance receipt never repeats a completed backup', async () => {
  const f = await fixture()
  const ws = await MemoryWorkspace.open(f.data)
  try {
    const id = randomUUID()
    const first = ws.backup(f.root, id)
    assert.equal(first, ws.backup(f.root, id))
    assert.equal(first, ws.result(id))
    const result = await first
    assert.deepEqual(await ws.backup(f.root, id), result)
    assert.equal((await readdir(f.root)).filter((n) => n.startsWith('AI-Memory-')).length, 1)
  } finally {
    await ws.close()
    await f.clean()
  }
})
