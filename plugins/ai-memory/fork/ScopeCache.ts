import { lstat, opendir } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  MemorySnapshot,
  MemoryWarning,
  ResolvedScope,
  ScopeBudgets,
  SearchHit
} from '../shared'
import { isUuid, MemoryFault } from '../core/validation'
import type { ScopeCoordinator, ScopeLease } from './ScopeCoordinator'
import type { RecordStore } from './RecordStore'

export type ScopeLoadStats = {
  files: number
  readBytes: number
  currentBytes: number
  historyBytes: number
  metadataBytes: number
  peakConcurrentReads: number
  bodyReads: number
  loadMs: number
  observedPeakRss: number
  observedPeakHeap: number
}
export type ScopeSnapshot = {
  scopeKey: string
  generation: string
  records: readonly SearchHit[]
  warnings: readonly MemoryWarning[]
  stats: ScopeLoadStats
}
type Entry = { snapshot: ScopeSnapshot; bytes: number; users: number; release: () => void }
type Loading = { promise: Promise<Entry>; cancelled: boolean }
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}
export function currentSearchHit(current: MemorySnapshot, scope: ResolvedScope): SearchHit {
  const {
    id,
    revision,
    type,
    topic,
    title,
    summary,
    tags,
    source,
    created_at,
    updated_at,
    status,
    pinned,
    expires_at,
    occurred_at
  } = current
  return {
    id,
    revision,
    type,
    topic,
    title,
    summary,
    tags: [...tags],
    source: { ...source },
    created_at,
    updated_at,
    status,
    pinned,
    ...(expires_at === undefined ? {} : { expires_at }),
    ...(occurred_at === undefined ? {} : { occurred_at }),
    scope: scope.projectId ? 'project' : 'global',
    ...(scope.projectId ? { projectId: scope.projectId } : {})
  }
}
const size = (records: readonly SearchHit[], warnings: readonly MemoryWarning[]) =>
  Buffer.byteLength(JSON.stringify({ records, warnings }))

/** Only current metadata lives here; queue lifetime and mutation ownership stay in ScopeCoordinator. */
export class ScopeCache {
  private readonly entries = new Map<string, Entry>()
  private readonly loading = new Map<string, Loading>()
  private bytes = 0
  constructor(
    private readonly coordinator: ScopeCoordinator,
    private readonly records: RecordStore,
    private readonly budgets: ScopeBudgets
  ) {
    for (const value of Object.values(budgets))
      if (!Number.isSafeInteger(value) || value < 1) throw new MemoryFault('invalid_budget')
  }
  get residentBytes() {
    return this.bytes
  }
  get size() {
    return this.entries.size
  }
  private room(required: number, protectedKey: string) {
    if (required > this.budgets.cacheBytes) throw new MemoryFault('capacity_exceeded')
    for (const [key, entry] of this.entries) {
      if (this.bytes + required <= this.budgets.cacheBytes) return
      if (key !== protectedKey && !entry.users && this.coordinator.isIdle(key)) this.invalidate(key)
    }
    if (this.bytes + required > this.budgets.cacheBytes) throw new MemoryFault('busy', 'busy')
  }
  invalidate(scopeKey: string) {
    const loading = this.loading.get(scopeKey)
    if (loading) loading.cancelled = true
    const entry = this.entries.get(scopeKey)
    if (entry) {
      this.entries.delete(scopeKey)
      this.bytes -= entry.bytes
      entry.release()
    }
  }
  clear() {
    for (const key of new Set([...this.entries.keys(), ...this.loading.keys()]))
      this.invalidate(key)
  }
  async withSnapshot<T>(
    lease: ScopeLease,
    fn: (snapshot: ScopeSnapshot) => T | Promise<T>
  ): Promise<T> {
    lease.assertActive()
    const key = lease.scope.key
    let entry = this.entries.get(key)
    if (entry && entry.snapshot.generation !== lease.generation) {
      this.invalidate(key)
      entry = undefined
    }
    if (!entry) {
      let loading = this.loading.get(key)
      if (!loading) {
        loading = { promise: Promise.resolve(undefined as never), cancelled: false }
        const token = loading
        loading.promise = this.load(lease, token).finally(() => {
          if (this.loading.get(key) === token) this.loading.delete(key)
        })
        this.loading.set(key, loading)
      }
      entry = await loading.promise
    }
    entry.users++
    try {
      return await fn(entry.snapshot)
    } finally {
      entry.users--
    }
  }
  private async load(lease: ScopeLease, loading: Loading): Promise<Entry> {
    const started = performance.now()
    const release = lease.retain()
    const hits: SearchHit[] = []
    const warnings: MemoryWarning[] = []
    const stats: ScopeLoadStats = {
      files: 0,
      readBytes: 0,
      currentBytes: 0,
      historyBytes: 0,
      metadataBytes: 0,
      peakConcurrentReads: 0,
      bodyReads: 0,
      loadMs: 0,
      observedPeakRss: 0,
      observedPeakHeap: 0
    }
    const warn = (code: string, id?: string) => {
      if (warnings.length < 99) warnings.push({ code, ...(id ? { id } : {}) })
      else if (warnings.length === 99) warnings.push({ code: 'warnings_truncated' })
    }
    let reserved = 0
    let active = 0
    const pending = new Set<Promise<void>>()
    try {
      const directory = join(lease.scope.directory, 'records')
      let listing: Awaited<ReturnType<typeof opendir>> | undefined
      try {
        await this.records.assertManagedPath(lease, directory)
        listing = await opendir(directory)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          throw new MemoryFault('scope_unavailable')
      }
      if (listing)
        for await (const entry of listing) {
          if (loading.cancelled) throw new MemoryFault('cache_invalidated')
          if (!entry.name.endsWith('.json')) continue
          const id = entry.name.slice(0, -5)
          stats.files++
          if (!isUuid(id) || !entry.isFile()) {
            warn('invalid_record_file')
            continue
          }
          if (pending.size >= this.budgets.readConcurrency) await Promise.race(pending)
          let metadata: Awaited<ReturnType<typeof lstat>>
          try {
            metadata = await lstat(join(directory, entry.name))
          } catch {
            warn('record_unavailable', id)
            continue
          }
          if (!metadata.isFile()) {
            warn('invalid_record_file', id)
            continue
          }
          if (metadata.size > this.budgets.recordBytes) {
            warn('record_too_large', id)
            continue
          }
          while (reserved + metadata.size > this.budgets.scopeReadBytes && pending.size)
            await Promise.race(pending)
          if (reserved + metadata.size > this.budgets.scopeReadBytes)
            throw new MemoryFault('capacity_exceeded')
          reserved += metadata.size
          active++
          stats.peakConcurrentReads = Math.max(stats.peakConcurrentReads, active)
          let read = 0
          const task = this.records
            .readDocumentDetailed(lease, id, metadata.size, (bytes) => {
              read += bytes
              stats.readBytes += bytes
            })
            .then(({ document }) => {
              if (!document || 'operation' in document) return
              stats.currentBytes += Buffer.byteLength(JSON.stringify(document.current))
              stats.historyBytes += Buffer.byteLength(JSON.stringify(document.history))
              hits.push(currentSearchHit(document.current, lease.scope))
            })
            .catch((error) => {
              warn(error instanceof MemoryFault ? error.code : 'record_unavailable', id)
            })
            .finally(() => {
              reserved -= metadata.size - read
              active--
              pending.delete(task)
              const memory = process.memoryUsage()
              stats.observedPeakRss = Math.max(stats.observedPeakRss, memory.rss)
              stats.observedPeakHeap = Math.max(stats.observedPeakHeap, memory.heapUsed)
            })
          pending.add(task)
        }
      await Promise.all(pending)
      if (loading.cancelled) throw new MemoryFault('cache_invalidated')
      const bytes = size(hits, warnings)
      this.room(bytes, lease.scope.key)
      stats.metadataBytes = bytes
      stats.loadMs = performance.now() - started
      lease.publishChange()
      const snapshot = freeze({
        scopeKey: lease.scope.key,
        generation: lease.generation,
        records: hits,
        warnings,
        stats
      })
      const entry: Entry = { snapshot, bytes, users: 0, release }
      this.entries.set(lease.scope.key, entry)
      this.bytes += bytes
      return entry
    } catch (error) {
      await Promise.all(pending)
      release()
      throw error
    }
  }
  publish(lease: ScopeLease, current: MemorySnapshot) {
    lease.assertActive()
    const entry = this.entries.get(lease.scope.key)
    if (!entry) return
    const records = entry.snapshot.records.filter((hit) => hit.id !== current.id)
    records.push(currentSearchHit(current, lease.scope))
    const bytes = size(records, entry.snapshot.warnings)
    // Disk is already committed. Failure invalidates cache and must never replay a write.
    this.bytes -= entry.bytes
    try {
      this.room(bytes, lease.scope.key)
      entry.snapshot = freeze({
        ...entry.snapshot,
        records,
        generation: lease.generation,
        stats: { ...entry.snapshot.stats, metadataBytes: bytes }
      })
      entry.bytes = bytes
      this.bytes += bytes
    } catch (error) {
      this.entries.delete(lease.scope.key)
      entry.release()
      throw error
    }
  }
}
