import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { MemoryEngine } from '../fork/MemoryEngine'
import { AtomicFile, AtomicWriteFailure } from '../fork/AtomicFile'
import type { MemoryInputs } from '../shared'

const draft = (): MemoryInputs['store'] => ({
  scope: 'global',
  request_id: randomUUID(),
  type: 'note',
  title: 'Acceptance',
  topic: 'acceptance',
  summary: 'Constructed integration record',
  tags: [],
  content: 'ORIGINAL body',
  source: { kind: 'document', agent: 'acceptance', description: 'Temporary fixture' }
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'memory-acceptance-'))
  const a = join(root, 'a'),
    b = join(root, 'b'),
    data = join(root, 'data')
  await Promise.all([mkdir(a), mkdir(b)])
  return { root, a, b, data, clean: () => rm(root, { recursive: true, force: true }) }
}
test('project/global isolation, lost reply replay, concurrent revision and restart share one durable engine contract', async () => {
  const f = await fixture()
  const engine = new MemoryEngine(f.data)
  try {
    const request = draft()
    const refs = [
      { scope: 'project' as const, project_path: f.a },
      { scope: 'project' as const, project_path: f.b },
      { scope: 'global' as const }
    ]
    const results = await Promise.all(
      refs.map((ref) => engine.call('store', { ...request, ...ref }))
    )
    assert.equal(new Set(results.map((r) => r.data!.id)).size, 3)
    for (const [index, ref] of refs.entries()) {
      const searched = await engine.call('search', ref)
      assert.deepEqual(
        searched.data!.results.map((r) => r.id),
        [results[index].data!.id]
      )
    }
    const id = results[0].data!.id
    const update = {
      ...refs[0],
      id,
      expected_revision: 1,
      reason: 'Concurrent edit',
      changes: { content: 'NEW body' }
    }
    const competing = await Promise.all([
      engine.call('update', { ...update, request_id: randomUUID() }),
      engine.call('update', { ...update, request_id: randomUUID() })
    ])
    assert.deepEqual(competing.map((r) => r.outcome).sort(), ['conflict', 'success'])
    assert.deepEqual((await engine.call('store', { ...request, ...refs[0] })).data, results[0].data)
    await engine.close()
    const restarted = new MemoryEngine(f.data)
    assert.equal((await restarted.call('get', { ...refs[0], id })).data!.content, 'NEW body')
    assert.equal(
      (await restarted.call('get', { ...refs[0], id, revision: 1 })).data!.content,
      'ORIGINAL body'
    )
    await restarted.close()
  } finally {
    await engine.close()
    await f.clean()
  }
})
test('post-rename unknown and pre-rename failure keep complete versions and exact receipts through restart', async () => {
  const f = await fixture()
  const atomic = new AtomicFile()
  let failure: 'none' | 'before' | 'after' = 'none'
  const engine = new MemoryEngine(f.data, {
    atomic: {
      replace: async (path, bytes) => {
        if (path.includes('/records/') && failure === 'before')
          throw new AtomicWriteFailure('failed')
        await atomic.replace(path, bytes)
        if (path.includes('/records/') && failure === 'after')
          throw new AtomicWriteFailure('unknown')
        return 'committed'
      }
    }
  })
  try {
    const stored = await engine.call('store', draft())
    const id = stored.data!.id
    const update = {
      scope: 'global' as const,
      id,
      expected_revision: 1,
      request_id: randomUUID(),
      reason: 'Fault boundary',
      changes: { content: 'COMMITTED body' }
    }
    failure = 'before'
    assert.equal((await engine.call('update', update)).outcome, 'failed')
    assert.equal((await engine.call('get', { scope: 'global', id })).data!.content, 'ORIGINAL body')
    failure = 'after'
    assert.equal((await engine.call('update', update)).outcome, 'unknown')
    await engine.close()
    const restarted = new MemoryEngine(f.data)
    assert.equal(
      (await restarted.call('get', { scope: 'global', id })).data!.content,
      'COMMITTED body'
    )
    assert.equal((await restarted.call('update', update)).data!.revision, 2)
    await restarted.close()
  } finally {
    await engine.close()
    await f.clean()
  }
})
test('mapping previous failure blocks registration while global and pending-delete recovery remain independent', async () => {
  const f = await fixture()
  const atomic = new AtomicFile()
  const engine = new MemoryEngine(f.data, {
    atomic: {
      replace: async (path, bytes) => {
        if (path.endsWith('projects.previous.json')) throw new AtomicWriteFailure('failed')
        return atomic.replace(path, bytes)
      }
    },
    deletionIO: {
      unlink: async () => {
        throw new Error('fixture denial')
      }
    }
  })
  try {
    const rejected = await engine.call('store', { ...draft(), scope: 'project', project_path: f.a })
    assert.equal(rejected.error_code, 'project_previous_save_failed')
    await assert.rejects(readFile(join(f.data, 'projects.json')), { code: 'ENOENT' })
    const saved = await engine.call('store', draft())
    assert.equal(saved.outcome, 'success')
    const request = {
      scope: 'global' as const,
      id: saved.data!.id,
      expected_revision: 1,
      request_id: randomUUID()
    }
    assert.equal((await engine.call('forget', request)).outcome, 'partial')
    await engine.close()
    await writeFile(join(f.data, 'global/records', `${randomUUID()}.json`), '{broken')
    const restarted = new MemoryEngine(f.data)
    assert.equal((await restarted.call('search', { scope: 'global' })).outcome, 'partial')
    assert.equal((await restarted.call('forget', request)).outcome, 'success')
    assert.equal(
      (await restarted.call('get', { scope: 'global', id: saved.data!.id })).outcome,
      'deleted'
    )
    await restarted.close()
  } finally {
    await engine.close()
    await f.clean()
  }
})
