import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, realpath, rm, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { ScopeCoordinator } from '../fork/ScopeCoordinator'
import { RecordStore } from '../fork/RecordStore'
import { ScopeCache } from '../fork/ScopeCache'
import { Deletion } from '../fork/Deletion'
import { EXPERIMENT_BUDGETS } from '../core/limits'
import type { ResolvedScope } from '../shared'

async function fixture(count = 5) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'flyenv-cache-')))
  const coordinator = new ScopeCoordinator()
  const budgets = { ...EXPERIMENT_BUDGETS }
  const records = new RecordStore(budgets)
  const scope = (id: string): ResolvedScope => ({
    key: 'project:' + id,
    directory: join(root, id),
    projectId: id
  })
  const a = scope(randomUUID())
  const b = scope(randomUUID())
  const ids: string[] = []
  for (const selected of [a, b])
    for (let i = 0; i < count; i++) {
      const result = await coordinator.run(selected, (lease) =>
        records.store(lease, {
          scope: 'project',
          project_path: root,
          request_id: randomUUID(),
          type: 'note',
          title: 'Fixture',
          topic: 'cache',
          summary: 'Search metadata only',
          tags: [],
          content: 'BODY NOT NEEDED FOR SEARCH',
          source: { kind: 'document', agent: 'fixture', description: 'Constructed input' }
        })
      )
      assert.equal(result.outcome, 'success')
      if (selected === a) ids.push(result.data!.id)
    }
  return {
    root,
    coordinator,
    budgets,
    records,
    a,
    b,
    ids,
    clean: () => rm(root, { recursive: true, force: true })
  }
}

test('concurrent snapshot consumers share one bounded metadata load and never read Markdown', async () => {
  const f = await fixture(12)
  try {
    let reads = 0
    const original = f.records.readDocumentDetailed.bind(f.records)
    f.records.readDocumentDetailed = async (...args) => {
      reads++
      return original(...args)
    }
    await rm(join(f.a.directory, 'bodies'), { recursive: true })
    const cache = new ScopeCache(f.coordinator, f.records, f.budgets)
    await f.coordinator.run(f.a, async (lease) => {
      const [a, b] = await Promise.all([
        cache.withSnapshot(lease, (snapshot) => snapshot),
        cache.withSnapshot(lease, (snapshot) => snapshot)
      ])
      assert.equal(a, b)
      assert.equal(a.records.length, 12)
      assert.ok(a.stats.peakConcurrentReads <= f.budgets.readConcurrency)
      assert.equal(a.stats.bodyReads, 0)
      assert.equal(Object.isFrozen(a.records[0]), true)
    })
    await f.coordinator.run(f.a, (lease) => cache.withSnapshot(lease, () => {}))
    assert.equal(reads, 12)
    cache.clear()
  } finally {
    await f.clean()
  }
})
test('oversized and corrupt JSON are skipped individually, but aggregate overflow never yields a partial subset', async () => {
  const f = await fixture(3)
  try {
    await writeFile(
      join(f.a.directory, 'records', `${f.ids[0]}.json`),
      'x'.repeat(f.budgets.recordBytes + 1)
    )
    await writeFile(join(f.a.directory, 'records', `${f.ids[1]}.json`), '{corrupt')
    const cache = new ScopeCache(f.coordinator, f.records, f.budgets)
    const snapshot = await f.coordinator.run(f.a, (lease) =>
      cache.withSnapshot(lease, (value) => value)
    )
    assert.equal(snapshot.records.length, 1)
    assert.deepEqual(snapshot.warnings.map((warning) => warning.code).sort(), [
      'record_corrupt',
      'record_too_large'
    ])
    cache.clear()
    const limited = new ScopeCache(f.coordinator, f.records, { ...f.budgets, scopeReadBytes: 10 })
    let published = false
    await assert.rejects(
      f.coordinator.run(f.b, (lease) =>
        limited.withSnapshot(lease, () => {
          published = true
        })
      ),
      /capacity_exceeded/
    )
    assert.equal(published, false)
    assert.equal(limited.size, 0)
    limited.clear()
  } finally {
    await f.clean()
  }
})
test('insertion-order eviction releases only idle caches and leaves the scope coordinator intact during work', async () => {
  const f = await fixture(1)
  try {
    const probe = new ScopeCache(f.coordinator, f.records, f.budgets)
    await f.coordinator.run(f.a, (lease) => probe.withSnapshot(lease, () => {}))
    const bytes = probe.residentBytes
    probe.clear()
    const cache = new ScopeCache(f.coordinator, f.records, { ...f.budgets, cacheBytes: bytes })
    let release!: () => void
    let entered!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const ready = new Promise<void>((resolve) => {
      entered = resolve
    })
    const active = f.coordinator.run(f.a, (lease) =>
      cache.withSnapshot(lease, async () => {
        entered()
        await gate
      })
    )
    await ready
    await assert.rejects(
      f.coordinator.run(f.b, (lease) => cache.withSnapshot(lease, () => {})),
      /busy/
    )
    assert.equal(cache.size, 1)
    release()
    await active
    await f.coordinator.run(f.b, (lease) => cache.withSnapshot(lease, () => {}))
    assert.equal(cache.size, 1)
    assert.equal(f.coordinator.size, 1)
    cache.clear()
    assert.equal(f.coordinator.size, 0)
  } finally {
    await f.clean()
  }
})
test('committed publication and cache reload change generations; tombstones never enter the search map', async () => {
  const f = await fixture(1)
  try {
    const cache = new ScopeCache(f.coordinator, f.records, f.budgets)
    const first = await f.coordinator.run(f.a, (lease) =>
      cache.withSnapshot(lease, (snapshot) => snapshot)
    )
    await f.coordinator.run(f.a, async (lease) => {
      const result = await f.records.update(lease, {
        scope: 'project',
        project_path: f.root,
        id: f.ids[0],
        expected_revision: 1,
        request_id: randomUUID(),
        reason: 'Updated',
        changes: { title: 'New title' }
      })
      assert.equal(result.outcome, 'success')
      cache.publish(lease, result.committed!)
      const second = await cache.withSnapshot(lease, (snapshot) => snapshot)
      assert.notEqual(second.generation, first.generation)
      assert.equal(second.records[0].title, 'New title')
    })
    cache.invalidate(f.a.key)
    const reloaded = await f.coordinator.run(f.a, (lease) =>
      cache.withSnapshot(lease, (snapshot) => snapshot)
    )
    assert.notEqual(reloaded.generation, first.generation)
    await f.coordinator.run(f.a, async (lease) => {
      const pending = await new Deletion(f.records, {
        unlink: async () => {
          throw new Error('pending')
        }
      }).forget(lease, {
        scope: 'project',
        project_path: f.root,
        id: f.ids[0],
        expected_revision: 2,
        request_id: randomUUID()
      })
      assert.equal(pending.outcome, 'partial')
      cache.invalidate(f.a.key)
      const deleted = await cache.withSnapshot(lease, (snapshot) => snapshot)
      assert.equal(deleted.records.length, 0)
    })
    cache.clear()
  } finally {
    await f.clean()
  }
})
test('a single record at the exact aggregate-byte limit loads; one byte less fails without unbounded readFile', async () => {
  const f = await fixture(1)
  try {
    const bytes = Buffer.byteLength(
      await readFile(join(f.a.directory, 'records', `${f.ids[0]}.json`), 'utf8')
    )
    const exact = new ScopeCache(f.coordinator, f.records, { ...f.budgets, scopeReadBytes: bytes })
    const snapshot = await f.coordinator.run(f.a, (lease) =>
      exact.withSnapshot(lease, (value) => value)
    )
    assert.equal(snapshot.stats.readBytes, bytes)
    exact.clear()
    const tooSmall = new ScopeCache(f.coordinator, f.records, {
      ...f.budgets,
      scopeReadBytes: bytes - 1
    })
    await assert.rejects(
      f.coordinator.run(f.a, (lease) => tooSmall.withSnapshot(lease, () => {})),
      /capacity_exceeded/
    )
    tooSmall.clear()
  } finally {
    await f.clean()
  }
})

test('measured preview ceilings accept exact record/scope limits and refuse the next byte or record', async () => {
  const { PREVIEW_BUDGETS } = await import('../core/limits')
  assert.equal(PREVIEW_BUDGETS?.recordBytes, 256 * 1024)
  assert.equal(PREVIEW_BUDGETS.scopeReadBytes, 8 * 1024 * 1024)
  assert.equal(PREVIEW_BUDGETS.cacheBytes, 4 * 1024 * 1024)
  const f = await fixture(32)
  try {
    for (const id of f.ids) {
      const path = join(f.a.directory, 'records', `${id}.json`)
      const raw = await readFile(path, 'utf8')
      await writeFile(path, raw + ' '.repeat(PREVIEW_BUDGETS.recordBytes - Buffer.byteLength(raw)))
    }
    const cache = new ScopeCache(f.coordinator, f.records, PREVIEW_BUDGETS)
    const snapshot = await f.coordinator.run(f.a, (lease) =>
      cache.withSnapshot(lease, (value) => value)
    )
    assert.equal(snapshot.stats.readBytes, PREVIEW_BUDGETS.scopeReadBytes)
    assert.equal(snapshot.records.length, 32)
    cache.clear()
    const extra = await f.coordinator.run(f.a, (lease) =>
      f.records.store(lease, {
        scope: 'project',
        project_path: f.root,
        request_id: randomUUID(),
        type: 'note',
        title: 'Extra',
        topic: 'capacity',
        summary: 'Over aggregate ceiling',
        tags: [],
        content: 'fixture',
        source: { kind: 'document', agent: 'fixture', description: 'Constructed' }
      })
    )
    assert.equal(extra.outcome, 'success')
    await assert.rejects(
      f.coordinator.run(f.a, (lease) => cache.withSnapshot(lease, () => {})),
      /capacity_exceeded/
    )
    await rm(join(f.a.directory, 'records', `${extra.data!.id}.json`))
    const path = join(f.a.directory, 'records', `${f.ids[0]}.json`)
    await writeFile(path, (await readFile(path, 'utf8')) + ' ')
    const partial = await f.coordinator.run(f.a, (lease) =>
      cache.withSnapshot(lease, (value) => value)
    )
    assert.equal(partial.records.length, 31)
    assert.equal(partial.warnings[0].code, 'record_too_large')
    cache.clear()
  } finally {
    await f.clean()
  }
})
