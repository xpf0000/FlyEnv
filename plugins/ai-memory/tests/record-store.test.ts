import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, writeFile, rm, readdir, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ScopeCoordinator } from '../fork/ScopeCoordinator'
import { RecordStore } from '../fork/RecordStore'
import { AtomicFile, AtomicWriteFailure } from '../fork/AtomicFile'
import { EXPERIMENT_BUDGETS } from '../core/limits'
import type { MemoryInputs, ResolvedScope } from '../shared'

const draft = (request_id = randomUUID()): MemoryInputs['store'] => ({
  scope: 'global',
  request_id,
  type: 'decision',
  topic: 'memory/storage',
  title: 'Central storage',
  summary: 'Use one private directory per project.',
  tags: ['Memory'],
  content: '# Decision\n集中存储；按项目隔离。',
  source: { kind: 'user_statement', agent: 'fixture', description: 'Constructed acceptance sample' }
})
async function fixture(atomic: Pick<AtomicFile, 'replace'> = new AtomicFile()) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'flyenv-record-')))
  const scope: ResolvedScope = Object.freeze({ key: 'global', directory: join(root, 'global') })
  const coordinator = new ScopeCoordinator()
  const store = new RecordStore(EXPERIMENT_BUDGETS, atomic)
  return {
    root,
    scope,
    coordinator,
    store,
    run: <T>(work: (lease: any) => Promise<T>) => coordinator.run(scope, work),
    clean: () => rm(root, { recursive: true, force: true })
  }
}
const successful = (result: any) => {
  assert.equal(result.outcome, 'success', JSON.stringify(result))
  return result.data as { id: string; revision: number }
}
const update = (
  id: string,
  expected_revision: number,
  changes: MemoryInputs['update']['changes'],
  reason = 'New evidence',
  request_id = randomUUID()
): MemoryInputs['update'] => ({
  scope: 'global',
  id,
  expected_revision,
  changes,
  reason,
  request_id
})

test('concurrent stores persist distinct records; conflicting revisions allow only one update', async () => {
  const f = await fixture()
  try {
    const [a, b] = await Promise.all([
      f.run((l) => f.store.store(l, draft())),
      f.run((l) => f.store.store(l, draft()))
    ])
    const first = successful(a)
    assert.notEqual(first.id, successful(b).id)
    const results = await Promise.all([
      f.run((l) => f.store.update(l, update(first.id, 1, { title: 'A' }))),
      f.run((l) => f.store.update(l, update(first.id, 1, { title: 'B' })))
    ])
    assert.deepEqual(results.map((r: any) => r.outcome).sort(), ['conflict', 'success'])
    assert.equal((await readdir(join(f.scope.directory, 'records'))).length, 2)
  } finally {
    await f.clean()
  }
})
test('store replays durable receipts across restart and rejects changed normalized arguments', async () => {
  const f = await fixture()
  try {
    const input = draft()
    const first = successful(await f.run((l) => f.store.store(l, input)))
    const restarted = new RecordStore(EXPERIMENT_BUDGETS)
    assert.deepEqual(
      successful(await f.run((l) => restarted.store(l, { ...input, tags: ['memory', 'Memory'] }))),
      first
    )
    assert.equal(
      ((await f.run((l) => restarted.store(l, { ...input, title: 'Different' }))) as any)
        .error_code,
      'request_conflict'
    )
    assert.equal((await readdir(join(f.scope.directory, 'bodies', first.id))).length, 1)
  } finally {
    await f.clean()
  }
})
test('update receipts precede expected_revision and preserve per-version reasons and immutable bodies', async () => {
  const f = await fixture()
  try {
    const created = successful(await f.run((l) => f.store.store(l, draft())))
    const input = update(created.id, 1, { title: 'Reviewed' }, 'Review finding')
    const second = successful(await f.run((l) => f.store.update(l, input)))
    const third = successful(
      await f.run((l) =>
        f.store.update(l, update(created.id, 2, { content: 'New body' }, 'Body correction'))
      )
    )
    assert.equal(third.revision, 3)
    assert.deepEqual(
      successful(await f.run((l) => new RecordStore(EXPERIMENT_BUDGETS).update(l, input))),
      second
    )
    const disk = JSON.parse(
      await readFile(join(f.scope.directory, 'records', created.id + '.json'), 'utf8')
    )
    assert.deepEqual(
      [...disk.history, disk.current].map((v) => v.change_reason),
      ['initial', 'Review finding', 'Body correction']
    )
    assert.equal(disk.history[0].body_ref, disk.history[1].body_ref)
    assert.notEqual(disk.current.body_ref, disk.history[1].body_ref)
    const initial: any = await f.run((l) =>
      f.store.get(l, { scope: 'global', id: created.id, revision: 1 })
    )
    assert.equal(initial.data.content, draft().content)
    assert.equal(initial.data.change_reason, 'initial')
    assert.equal(initial.data.body_ref, undefined)
    assert.equal(
      ((await f.run((l) => f.store.get(l, { scope: 'global', id: created.id }))) as any).data
        .content,
      'New body'
    )
  } finally {
    await f.clean()
  }
})
test('body byte bounds, broken hashes, absent content and unsupported record schema are explicit failures', async () => {
  const f = await fixture()
  try {
    assert.equal(
      ((await f.run((l) => f.store.store(l, { ...draft(), content: '文'.repeat(6000) }))) as any)
        .error_code,
      'invalid_input'
    )
    const created = successful(await f.run((l) => f.store.store(l, draft())))
    const file = join(f.scope.directory, 'records', created.id + '.json')
    const disk = JSON.parse(await readFile(file, 'utf8'))
    const body = join(f.scope.directory, 'bodies', disk.current.body_ref)
    await writeFile(body, 'bad')
    assert.equal(
      ((await f.run((l) => f.store.get(l, { scope: 'global', id: created.id }))) as any).error_code,
      'body_corrupt'
    )
    await rm(body)
    assert.equal(
      ((await f.run((l) => f.store.get(l, { scope: 'global', id: created.id }))) as any).error_code,
      'body_missing'
    )
    await writeFile(file, JSON.stringify({ ...disk, schema_version: 99 }))
    assert.equal(
      ((await f.run((l) => f.store.get(l, { scope: 'global', id: created.id }))) as any).error_code,
      'record_schema_unsupported'
    )
  } finally {
    await f.clean()
  }
})
test('untrusted body references cannot escape the managed ID directory', async () => {
  const f = await fixture()
  try {
    const created = successful(await f.run((l) => f.store.store(l, draft())))
    const file = join(f.scope.directory, 'records', created.id + '.json')
    const disk = JSON.parse(await readFile(file, 'utf8'))
    disk.current.body_ref = '../../outside.md'
    await writeFile(file, JSON.stringify(disk))
    assert.equal(
      ((await f.run((l) => f.store.get(l, { scope: 'global', id: created.id }))) as any).error_code,
      'record_corrupt'
    )
  } finally {
    await f.clean()
  }
})
test('JSON failure keeps the previous version while the new body remains unreferenced for later maintenance', async () => {
  const f = await fixture()
  try {
    const created = successful(await f.run((l) => f.store.store(l, draft())))
    const atomic = new AtomicFile()
    const failing = new RecordStore(EXPERIMENT_BUDGETS, {
      replace: async (path, bytes) => {
        if (path.endsWith('.json')) throw new AtomicWriteFailure('failed')
        return atomic.replace(path, bytes)
      }
    })
    assert.equal(
      (
        (await f.run((l) =>
          failing.update(l, update(created.id, 1, { content: 'orphan body' }))
        )) as any
      ).outcome,
      'failed'
    )
    const visible: any = await f.run((l) => f.store.get(l, { scope: 'global', id: created.id }))
    assert.equal(visible.data.revision, 1)
    assert.equal(visible.data.content, draft().content)
    assert.equal((await readdir(join(f.scope.directory, 'bodies', created.id))).length, 2)
  } finally {
    await f.clean()
  }
})
test('unknown JSON persistence blocks all scope writes until durable receipts are reloaded', async () => {
  const atomic = new AtomicFile()
  let uncertain = true
  const f = await fixture({
    replace: async (path, bytes) => {
      await atomic.replace(path, bytes)
      if (uncertain && path.endsWith('.json')) {
        uncertain = false
        throw new AtomicWriteFailure('unknown')
      }
      return 'committed'
    }
  })
  try {
    const input = draft()
    const result: any = await f.run((l) => f.store.store(l, input))
    assert.equal(result.outcome, 'unknown')
    assert.equal(
      ((await f.run((l) => f.store.store(l, draft()))) as any).error_code,
      'scope_commit_unknown'
    )
    const recovered: any = await f.run((l) => f.store.recover(l))
    assert.equal(recovered.outcome, 'success')
    assert.equal(recovered.data.committed, true)
    assert.equal(successful(await f.run((l) => f.store.store(l, input))).id, result.id)
    assert.equal((await readdir(join(f.scope.directory, 'records'))).length, 1)
  } finally {
    await f.clean()
  }
})
test('record expansion above budget retains old JSON and all durable receipts', async () => {
  const f = await fixture()
  try {
    const input = draft()
    const created = successful(await f.run((l) => f.store.store(l, input)))
    const file = join(f.scope.directory, 'records', created.id + '.json')
    const before = await readFile(file, 'utf8')
    const bounded = new RecordStore({
      ...EXPERIMENT_BUDGETS,
      recordBytes: Buffer.byteLength(before) + 50
    })
    assert.equal(
      (
        (await f.run((l) =>
          bounded.update(l, update(created.id, 1, { summary: 'More context' }))
        )) as any
      ).error_code,
      'record_too_large'
    )
    assert.equal(await readFile(file, 'utf8'), before)
  } finally {
    await f.clean()
  }
})

test('UTF-8 bodies round-trip including a leading BOM and reject unpaired surrogate input', async () => {
  const f = await fixture()
  try {
    const input = { ...draft(), content: '\ufeff原始文字\n🙂' }
    const created = successful(await f.run((l) => f.store.store(l, input)))
    assert.equal(
      ((await f.run((l) => f.store.get(l, { scope: 'global', id: created.id }))) as any).data
        .content,
      input.content
    )
    assert.equal(
      ((await f.run((l) => f.store.store(l, { ...draft(), content: 'broken\ud800' }))) as any)
        .error_code,
      'invalid_input'
    )
  } finally {
    await f.clean()
  }
})

test('body-commit failure never advances JSON; requests and records remain scope isolated', async () => {
  const f = await fixture()
  try {
    const input = draft()
    const created = successful(await f.run((l) => f.store.store(l, input)))
    const failing = new RecordStore(EXPERIMENT_BUDGETS, {
      replace: async () => {
        throw new AtomicWriteFailure('unknown')
      }
    })
    assert.equal(
      ((await f.run((l) => failing.update(l, update(created.id, 1, { content: 'new' })))) as any)
        .outcome,
      'failed'
    )
    assert.equal(
      ((await f.run((l) => f.store.get(l, { scope: 'global', id: created.id }))) as any).data
        .revision,
      1
    )
    const other = {
      key: 'project:' + randomUUID(),
      directory: join(f.root, 'project'),
      projectId: randomUUID()
    }
    const missing: any = await f.coordinator.run(other, (lease) =>
      f.store.get(lease, { scope: 'project', project_path: f.root, id: created.id })
    )
    assert.equal(missing.error_code, 'record_not_found')
    const isolated: any = await f.coordinator.run(other, (lease) =>
      f.store.store(lease, { ...input, scope: 'project', project_path: f.root })
    )
    assert.notEqual(successful(isolated).id, created.id)
  } finally {
    await f.clean()
  }
})
