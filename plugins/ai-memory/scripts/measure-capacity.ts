import { mkdtemp, mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { ScopeCoordinator } from '../fork/ScopeCoordinator'
import { RecordStore } from '../fork/RecordStore'
import { ScopeCache } from '../fork/ScopeCache'
import { searchPage } from '../core/search'
import { EXPERIMENT_BUDGETS } from '../core/limits'
import type { MemoryRecord, MemorySnapshot, SearchHit } from '../shared'

const arg = (name: string, fallback: string) =>
  process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback
const count = Number(arg('--records', '1000'))
if (!Number.isSafeInteger(count) || count < 1 || count > 10000)
  throw new Error('records must be 1..10000')
const reportPath = resolve(
  arg('--report', 'docs/superpowers/reports/2026-11-03-flyenv-ai-memory-capacity.md')
)
const root = await realpath(await mkdtemp(join(tmpdir(), 'flyenv-capacity-')))
const results: any[] = []
const samples = JSON.parse(
  await readFile('plugins/ai-memory/tests/fixtures/memories.json', 'utf8')
) as SearchHit[]
const budgets = {
  ...EXPERIMENT_BUDGETS,
  scopeReadBytes: 128 * 1024 * 1024,
  cacheBytes: 16 * 1024 * 1024
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const defaults = {
  type: 'decision' as const,
  topic: 'cache/history',
  title: 'Measured preview capacity',
  summary:
    'Constructed workload for metadata search and revision history. Use measured byte limits; never truncate durable receipts.',
  tags: ['memory', 'metadata', 'history', 'bounded'],
  source: {
    kind: 'document' as const,
    agent: 'capacity-fixture',
    description: 'Synthetic input; no user memory is read.'
  },
  status: 'active' as const,
  pinned: false
}
function document(history: number, row?: SearchHit): MemoryRecord {
  const id = randomUUID()
  const body_ref = `${id}/${randomUUID()}.md`
  const revisions = Array.from({ length: history + 1 }, (_, index): MemorySnapshot => ({
    ...defaults,
    ...(row
      ? {
          type: row.type,
          topic: row.topic,
          title: row.title,
          summary: row.summary,
          tags: row.tags,
          source: row.source,
          pinned: row.pinned,
          status: row.status
        }
      : {}),
    id,
    revision: index + 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    change_reason: index ? 'Measured revision' : 'initial',
    body_ref,
    body_sha256: digest('sample'),
    body_bytes: 6,
    receipt: {
      operation: index ? 'update' : 'store',
      request_id: randomUUID(),
      request_digest: digest(`${id}:${index}`),
      result_revision: index + 1
    }
  }))
  return { schema_version: 1, current: revisions.at(-1)!, history: revisions.slice(0, -1) }
}
try {
  for (const scenario of [
    { name: 'current-only', history: 0, count },
    { name: 'five-history', history: 5, count },
    { name: 'thirty-history', history: 30, count },
    { name: 'stage-A-constructed-corpus', history: 0, count: samples.length, corpus: true }
  ]) {
    const directory = join(root, scenario.name)
    await mkdir(join(directory, 'records'), { recursive: true })
    let totalBytes = 0
    let maximumBytes = 0
    let next = 0
    // Fixture writing is bounded too; generated JSON is valid, bodies are intentionally not needed.
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (next < scenario.count) {
          const index = next++
          const record = document(scenario.history, scenario.corpus ? samples[index] : undefined)
          const text = JSON.stringify(record)
          totalBytes += Buffer.byteLength(text)
          maximumBytes = Math.max(maximumBytes, Buffer.byteLength(text))
          await writeFile(join(directory, 'records', record.current.id + '.json'), text)
        }
      })
    )
    const scope = { key: 'global', directory }
    const coordinator = new ScopeCoordinator()
    const records = new RecordStore(budgets)
    const cache = new ScopeCache(coordinator, records, budgets)
    const before = process.memoryUsage()
    const snapshot = await coordinator.run(scope, (lease) =>
      cache.withSnapshot(lease, (value) => value)
    )
    let hotMs = 0
    for (let i = 0; i < 20; i++) {
      const started = performance.now()
      await coordinator.run(scope, (lease) =>
        cache.withSnapshot(lease, (value) =>
          searchPage([value], {
            scope: 'global',
            queries: scenario.corpus ? ['Ubuntu', 'tray'] : ['metadata', 'history']
          })
        )
      )
      hotMs += performance.now() - started
    }
    results.push({
      name: scenario.name,
      records: scenario.count,
      totalBytes,
      maximumBytes,
      ...snapshot.stats,
      hotSearchMs: hotMs / 20,
      rssBefore: before.rss,
      heapBefore: before.heapUsed
    })
    cache.clear()
    await coordinator.close()
  }
  const mib = (value: number) => (value / 1024 / 1024).toFixed(2)
  const report =
    `# AI Memory capacity experiment\n\nMeasured ${new Date().toISOString()} on ${process.platform}/${process.arch}, Node ${process.versions.node}.\n\nAll records are constructed fixtures, not user history. Cold means an empty plugin metadata cache; OS filesystem caches were not flushed. The stage-A corpus retains its text but is grouped into one scope for this capacity-only measurement; retrieval quality is evaluated separately by the original labelled queries. No Markdown body is read.\n\n| Workload | Records | JSON MiB | Current MiB | History MiB | Metadata cache MiB | Cold ms | Hot search ms (20 mean) | Max file KiB | Read concurrency | Observed peak RSS MiB | Observed peak heap MiB |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n` +
    results
      .map(
        (r) =>
          `| ${r.name} | ${r.records} | ${mib(r.totalBytes)} | ${mib(r.currentBytes)} | ${mib(r.historyBytes)} | ${mib(r.metadataBytes)} | ${r.loadMs.toFixed(1)} | ${r.hotSearchMs.toFixed(2)} | ${(r.maximumBytes / 1024).toFixed(2)} | ${r.peakConcurrentReads} | ${mib(r.observedPeakRss)} | ${mib(r.observedPeakHeap)} |`
      )
      .join('\n') +
    `\n\nMemory samples are observed after bounded file reads in one Node process; they include runtime/fixture allocation and are not an isolated heap maximum or a memory guarantee. Cache bytes mean serialized current metadata plus warnings, not precise heap usage. Stress measurements use a 128 MiB scope read budget and 16 MiB metadata cache so history-heavy cases can be observed; these are not preview defaults.\n\n## Preview defaults\n\n- Per record JSON: 256 KiB; one larger record is skipped with a controlled reason, and growth is rejected before writing its body/JSON.\n- Per scope JSON reads: 8 MiB; exceeding it fails the load instead of returning an apparently complete subset. The five-history workload fits while the thirty-history workload is intentionally refused at this setting.\n- All cached current metadata: 4 MiB; idle scopes are evicted in insertion order, and busy scopes retain their queues.\n- Concurrent JSON reads: 4. Search response: 8 KiB by default, hard maximum 32 KiB, including the full result envelope and cursor.\n\nHistory dominates the thirty-revision workload and has a visible cold-load cost, so V1 keeps a conservative read ceiling rather than increasing it silently or dropping history/receipts. There is no new history index/layout in this preview. Direct-ID deletion and streaming pending cleanup remain available above the search budget. These limits are preview choices for measured local workloads; Windows/Linux/Electron memory behavior is not established by this Node experiment.\n`
  await mkdir(dirname(reportPath), { recursive: true })
  await writeFile(reportPath, report)
  console.log(JSON.stringify(results, null, 2))
} finally {
  await rm(root, { recursive: true, force: true })
}
