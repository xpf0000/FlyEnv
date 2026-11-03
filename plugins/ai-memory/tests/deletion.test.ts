import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  mkdtemp,
  realpath,
  readFile,
  readdir,
  writeFile,
  rm,
  unlink,
  mkdir
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ScopeCoordinator } from '../fork/ScopeCoordinator'
import { RecordStore } from '../fork/RecordStore'
import { Deletion } from '../fork/Deletion'
import { AtomicFile, AtomicWriteFailure } from '../fork/AtomicFile'
import { EXPERIMENT_BUDGETS } from '../core/limits'
import type { MemoryInputs, ResolvedScope } from '../shared'

const draft = (): MemoryInputs['store'] => ({
  scope: 'global',
  request_id: randomUUID(),
  type: 'note',
  topic: 'fixture',
  title: 'Private title',
  summary: 'Private summary',
  content: 'PRIVATE_BODY_TO_DELETE',
  tags: ['private-tag'],
  source: { kind: 'document', agent: 'fixture', description: 'Private source' }
})
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'flyenv-delete-')))
  const scope: ResolvedScope = { key: 'global', directory: join(root, 'global') }
  const coordinator = new ScopeCoordinator()
  const store = new RecordStore(EXPERIMENT_BUDGETS)
  const input = draft()
  const created: any = await coordinator.run(scope, (l) => store.store(l, input))
  assert.equal(created.outcome, 'success')
  const id = created.data.id as string
  const request: MemoryInputs['forget'] = {
    scope: 'global',
    id,
    expected_revision: 1,
    request_id: randomUUID()
  }
  return {
    root,
    scope,
    coordinator,
    store,
    input,
    id,
    request,
    run: <T>(work: (lease: any) => Promise<T>) => coordinator.run(scope, work),
    file: join(scope.directory, 'records', `${id}.json`),
    bodyDir: join(scope.directory, 'bodies', id),
    clean: () => rm(root, { recursive: true, force: true })
  }
}

test('forget retains only a content-free receipt and old requests cannot revive the record', async () => {
  const f = await fixture()
  try {
    const update: MemoryInputs['update'] = {
      scope: 'global',
      id: f.id,
      expected_revision: 1,
      request_id: randomUUID(),
      reason: 'Correction',
      changes: { content: 'PRIVATE_HISTORY_BODY' }
    }
    await f.run((l) => f.store.update(l, update))
    f.request.expected_revision = 2
    const deletion = new Deletion(f.store)
    const result: any = await f.run((l) => deletion.forget(l, f.request))
    assert.equal(result.outcome, 'success')
    assert.equal(result.data.revision, 3)
    const tombstone = JSON.parse(await readFile(f.file, 'utf8'))
    assert.deepEqual(
      Object.keys(tombstone).sort(),
      [
        'schema_version',
        'id',
        'deleted_revision',
        'operation',
        'request_id',
        'request_digest',
        'cleanup_state',
        'outcome'
      ].sort()
    )
    assert.equal(JSON.stringify(tombstone).includes('PRIVATE'), false)
    assert.equal((await readdir(f.bodyDir)).length, 0)
    for (const revision of [undefined, 1, 2])
      assert.equal(
        (
          (await f.run((l) =>
            f.store.get(l, { scope: 'global', id: f.id, ...(revision ? { revision } : {}) })
          )) as any
        ).outcome,
        'deleted'
      )
    assert.equal(((await f.run((l) => f.store.store(l, f.input))) as any).outcome, 'deleted')
    assert.equal(((await f.run((l) => f.store.update(l, update))) as any).outcome, 'deleted')
    assert.equal(((await f.run((l) => deletion.forget(l, f.request))) as any).outcome, 'success')
    assert.equal(
      ((await f.run((l) => deletion.forget(l, { ...f.request, expected_revision: 999 }))) as any)
        .error_code,
      'request_conflict'
    )
    assert.equal(
      ((await f.run((l) => deletion.forget(l, { ...f.request, request_id: randomUUID() }))) as any)
        .outcome,
      'already_deleted'
    )
  } finally {
    await f.clean()
  }
})
test('partial cleanup keeps pending state; same request resumes and a new request cannot replace its receipt', async () => {
  const f = await fixture()
  try {
    let fail = true
    const deletion = new Deletion(f.store, {
      unlink: async (path) => {
        if (fail && String(path).endsWith('.md')) throw new Error('PRIVATE_IO_ERROR')
        return unlink(path)
      }
    })
    const first: any = await f.run((l) => deletion.forget(l, f.request))
    assert.equal(first.outcome, 'partial')
    assert.equal(first.data.cleanup_state, 'pending')
    assert.equal(
      ((await f.run((l) => f.store.get(l, { scope: 'global', id: f.id }))) as any).outcome,
      'deleted'
    )
    assert.equal(
      ((await f.run((l) => deletion.forget(l, { ...f.request, request_id: randomUUID() }))) as any)
        .error_code,
      'deletion_pending'
    )
    fail = false
    assert.equal(((await f.run((l) => deletion.forget(l, f.request))) as any).outcome, 'success')
    assert.equal(JSON.parse(await readFile(f.file, 'utf8')).request_id, f.request.request_id)
  } finally {
    await f.clean()
  }
})
test('cleanup includes history/orphan bodies and record/body temporary files belonging to the ID', async () => {
  const f = await fixture()
  try {
    await writeFile(join(f.bodyDir, `${randomUUID()}.md`), 'ORPHAN')
    await writeFile(join(f.bodyDir, `.memory-${randomUUID()}.md-${randomUUID()}.tmp`), 'BODY TEMP')
    const temp = join(f.scope.directory, 'records', `.memory-${f.id}.json-${randomUUID()}.tmp`)
    await writeFile(temp, 'JSON TEMP')
    const other = join(
      f.scope.directory,
      'records',
      `.memory-${randomUUID()}.json-${randomUUID()}.tmp`
    )
    await writeFile(other, 'OTHER ID')
    assert.equal(
      ((await f.run((l) => new Deletion(f.store).forget(l, f.request))) as any).outcome,
      'success'
    )
    assert.equal((await readdir(f.bodyDir)).length, 0)
    assert.equal(await readFile(temp, 'utf8').catch(() => null), null)
    assert.equal(await readFile(other, 'utf8'), 'OTHER ID')
  } finally {
    await f.clean()
  }
})
test('a completed logical get may arrive after deletion; new logical reads return deleted', async () => {
  const f = await fixture()
  try {
    const snapshot: any = await f.run((l) => f.store.get(l, { scope: 'global', id: f.id }))
    const result: any = await f.run((l) => new Deletion(f.store).forget(l, f.request))
    assert.equal(result.outcome, 'success')
    const delayedResponse = await Promise.resolve(snapshot)
    assert.equal(delayedResponse.data.content, 'PRIVATE_BODY_TO_DELETE')
    assert.equal(
      ((await f.run((l) => f.store.get(l, { scope: 'global', id: f.id }))) as any).outcome,
      'deleted'
    )
  } finally {
    await f.clean()
  }
})
test('failure to commit the initial tombstone never deletes the old body', async () => {
  const f = await fixture()
  try {
    const store = new RecordStore(EXPERIMENT_BUDGETS, {
      replace: async () => {
        throw new AtomicWriteFailure('failed')
      }
    })
    assert.equal(
      ((await f.run((l) => new Deletion(store).forget(l, f.request))) as any).outcome,
      'failed'
    )
    assert.equal(
      ((await f.run((l) => f.store.get(l, { scope: 'global', id: f.id }))) as any).outcome,
      'success'
    )
  } finally {
    await f.clean()
  }
})
test('complete-receipt failure preserves completed cleanup and retries only the original deletion', async () => {
  for (const outcome of ['failed', 'unknown'] as const) {
    const f = await fixture()
    try {
      const atomic = new AtomicFile()
      let fails = true
      const store = new RecordStore(EXPERIMENT_BUDGETS, {
        replace: async (path, bytes) => {
          const value = JSON.parse(String(bytes))
          if (fails && value.cleanup_state === 'complete') {
            if (outcome === 'unknown') await atomic.replace(path, bytes)
            throw new AtomicWriteFailure(outcome)
          }
          return atomic.replace(path, bytes)
        }
      })
      const deletion = new Deletion(store)
      const result: any = await f.run((l) => deletion.forget(l, f.request))
      assert.equal(result.outcome, outcome === 'unknown' ? 'unknown' : 'partial')
      assert.equal((await readdir(f.bodyDir)).length, 0)
      fails = false
      if (outcome === 'unknown')
        assert.equal(((await f.run((l) => store.recover(l))) as any).outcome, 'success')
      assert.equal(((await f.run((l) => deletion.forget(l, f.request))) as any).outcome, 'success')
    } finally {
      await f.clean()
    }
  }
})
test('scope recovery continues sibling pending records and ignores untouched scopes even above search budget', async () => {
  const f = await fixture()
  try {
    const second: any = await f.run((l) => f.store.store(l, draft()))
    const deny = new Deletion(f.store, {
      unlink: async () => {
        throw new Error('temporary failure')
      }
    })
    await f.run((l) => deny.forget(l, f.request))
    await f.run((l) =>
      deny.forget(l, {
        scope: 'global',
        id: second.data.id,
        expected_revision: 1,
        request_id: randomUUID()
      })
    )
    const untouched = join(f.root, 'untouched', 'records')
    await mkdir(untouched, { recursive: true })
    await writeFile(join(untouched, 'unread.json'), 'BROKEN UNVISITED SCOPE')
    await writeFile(join(f.scope.directory, 'records', `${randomUUID()}.json`), '{corrupt sibling')
    const bounded = new RecordStore({ ...EXPERIMENT_BUDGETS, scopeReadBytes: 1 })
    const recovery = new Deletion(bounded, {
      unlink: async (path) => {
        if (String(path).includes(f.id)) throw new Error('still unavailable')
        return unlink(path)
      }
    })
    const result: any = await f.run((l) => recovery.recoverScope(l))
    assert.equal(result.outcome, 'partial')
    assert.equal(result.data.recovered, 1)
    assert.equal(result.data.skipped, 1)
    assert.equal(JSON.parse(await readFile(f.file, 'utf8')).cleanup_state, 'pending')
    assert.equal(
      JSON.parse(
        await readFile(join(f.scope.directory, 'records', `${second.data.id}.json`), 'utf8')
      ).cleanup_state,
      'complete'
    )
    assert.equal(await readFile(join(untouched, 'unread.json'), 'utf8'), 'BROKEN UNVISITED SCOPE')
    assert.equal(
      ((await f.run((l) => new Deletion(bounded).resumePending(l, f.id))) as any).outcome,
      'success'
    )
  } finally {
    await f.clean()
  }
})

test('uncertain initial tombstone freezes writes and preserves bodies until receipt recovery', async () => {
  const f = await fixture()
  try {
    const atomic = new AtomicFile()
    let fail = true
    const store = new RecordStore(EXPERIMENT_BUDGETS, {
      replace: async (path, bytes) => {
        await atomic.replace(path, bytes)
        if (fail) {
          fail = false
          throw new AtomicWriteFailure('unknown')
        }
        return 'committed'
      }
    })
    const deletion = new Deletion(store)
    assert.equal(((await f.run((l) => deletion.forget(l, f.request))) as any).outcome, 'unknown')
    assert.equal((await readdir(f.bodyDir)).length, 1)
    assert.equal(
      ((await f.run((l) => deletion.resumePending(l, f.id))) as any).error_code,
      'scope_commit_unknown'
    )
    assert.equal(
      ((await f.run((l) => store.get(l, { scope: 'global', id: f.id }))) as any).outcome,
      'deleted'
    )
    assert.equal(((await f.run((l) => store.recover(l))) as any).data.committed, true)
    assert.equal(((await f.run((l) => deletion.resumePending(l, f.id))) as any).outcome, 'success')
  } finally {
    await f.clean()
  }
})

test('a complete-receipt capacity failure reports partial after content was cleaned', async () => {
  const f = await fixture()
  try {
    await f.run((l) =>
      new Deletion(f.store, {
        unlink: async () => {
          throw new Error('pending fixture')
        }
      }).forget(l, f.request)
    )
    const bytes = Buffer.byteLength(await readFile(f.file, 'utf8'))
    const bounded = new RecordStore({ ...EXPERIMENT_BUDGETS, recordBytes: bytes })
    const result: any = await f.run((l) => new Deletion(bounded).forget(l, f.request))
    assert.equal(result.outcome, 'partial')
    assert.ok(result.warnings.some((warning: any) => warning.code === 'content_cleanup_complete'))
    assert.equal((await readdir(f.bodyDir)).length, 0)
  } finally {
    await f.clean()
  }
})
