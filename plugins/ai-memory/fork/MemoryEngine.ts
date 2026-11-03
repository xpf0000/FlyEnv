import { PREVIEW_BUDGETS } from '../core/limits'
import { MemoryFault, validateInput } from '../core/validation'
import { searchPage, type SearchSnapshot } from '../core/search'
import type {
  MemoryAPI,
  MemoryAdminAPI,
  MemoryAdminInput,
  MemoryInputs,
  MemoryMethod,
  MemoryOutputs,
  MemoryResult,
  MemoryWarning,
  ResolvedScope,
  ScopeBudgets,
  SearchInput
} from '../shared'
import { AtomicFile } from './AtomicFile'
import { ProjectRegistry } from './ProjectRegistry'
import { ScopeCoordinator, type ScopeLease } from './ScopeCoordinator'
import { RecordStore } from './RecordStore'
import { ScopeCache } from './ScopeCache'
import { Deletion } from './Deletion'

export const MEMORY_METHODS: readonly MemoryMethod[] = [
  'search',
  'get',
  'store',
  'update',
  'forget'
]
const isMethod = (method: string): method is MemoryMethod =>
  MEMORY_METHODS.includes(method as MemoryMethod)
export function memoryToolResult<T>(method: MemoryMethod, result: MemoryResult<T>) {
  return {
    ...result,
    isError:
      !['success', 'already_deleted'].includes(result.outcome) &&
      !(method === 'search' && result.outcome === 'partial' && !!result.data)
  }
}
type Options = {
  budgets?: ScopeBudgets
  atomic?: Pick<AtomicFile, 'replace'>
  deletionIO?: { unlink(path: string): Promise<void> }
}

/** All UI and MCP work passes through this owner. Constructing it performs no IO. */
export class MemoryEngine implements MemoryAPI, MemoryAdminAPI {
  private readonly projects: ProjectRegistry
  private readonly coordinator = new ScopeCoordinator()
  private readonly records: RecordStore
  private readonly cache: ScopeCache
  private readonly deletion: Deletion
  private readonly budgets: ScopeBudgets
  private readonly active = new Set<Promise<unknown>>()
  private closing = false
  private closed?: Promise<void>
  constructor(
    readonly dataRoot: string,
    options: Options = {}
  ) {
    this.budgets = { ...(options.budgets ?? PREVIEW_BUDGETS) }
    this.projects = new ProjectRegistry(dataRoot, options.atomic)
    this.records = new RecordStore(this.budgets, options.atomic)
    this.cache = new ScopeCache(this.coordinator, this.records, this.budgets)
    this.deletion = new Deletion(this.records, options.deletionIO)
  }
  private failure(error: unknown): MemoryResult<never> {
    return error instanceof MemoryFault
      ? { outcome: error.outcome, error_code: error.code }
      : { outcome: 'failed', error_code: 'operation_failed' }
  }
  private track<T>(work: () => Promise<MemoryResult<T>>): Promise<MemoryResult<T>> {
    if (this.closing) return Promise.resolve({ outcome: 'failed', error_code: 'engine_closed' })
    const task = Promise.resolve()
      .then(work)
      .catch((error) => this.failure(error))
    this.active.add(task)
    void task.then(() => this.active.delete(task))
    return task
  }
  call<M extends MemoryMethod>(
    method: M,
    raw: MemoryInputs[M]
  ): Promise<MemoryResult<MemoryOutputs[M]>> {
    // Snapshot before the first await; callers cannot change a queued request.
    let input: MemoryInputs[M]
    try {
      if (!isMethod(method)) throw new MemoryFault('invalid_method')
      input = validateInput(method, structuredClone(raw))
    } catch (error) {
      return Promise.resolve(this.failure(error))
    }
    return this.track(async () => {
      const scope = await this.projects.resolve(input, {
        create: method === 'store',
        createProject: method === 'store' && (input as MemoryInputs['store']).create_project
      })
      if (!('key' in scope)) {
        if (method !== 'search' || scope.error_code !== 'project_unregistered')
          return { ...scope, outcome: scope.outcome === 'success' ? 'failed' : scope.outcome }
        const search = input as SearchInput
        const snapshots = search.include_global ? [await this.globalSnapshot()] : []
        // Candidate metadata participates in the response-byte budget as well.
        return searchPage(snapshots, search, this.budgets.responseBytes, {
          unregistered: true,
          ...(scope.project_candidates ? { project_candidates: scope.project_candidates } : {})
        }) as MemoryResult<MemoryOutputs[M]>
      }
      return this.resolved(scope, method, input)
    })
  }
  callForProject<M extends MemoryMethod>(
    projectId: string,
    method: M,
    raw: MemoryAdminInput<M>
  ): Promise<MemoryResult<MemoryOutputs[M]>> {
    let input: MemoryInputs[M]
    try {
      if (!isMethod(method)) throw new MemoryFault('invalid_method')
      if (!raw || typeof raw !== 'object' || 'scope' in raw || 'project_path' in raw)
        throw new MemoryFault('invalid_input')
      input = validateInput(method, {
        ...structuredClone(raw),
        scope: 'project',
        project_path: '/registered-project'
      })
    } catch (error) {
      return Promise.resolve(this.failure(error))
    }
    return this.track(async () => {
      const scope = await this.projects.resolveById(projectId)
      return 'key' in scope ? this.resolved(scope, method, input) : scope
    })
  }
  listProjects() {
    return this.track(() => this.projects.listProjects())
  }
  inspectRecovery() {
    return this.track(async () => ({
      outcome: 'success',
      data: await this.projects.inspectRecovery()
    }))
  }
  private async prepare(lease: ScopeLease): Promise<MemoryWarning[]> {
    if (lease.unknown) {
      this.cache.invalidate(lease.scope.key)
      const result = await this.records.recover(lease)
      if (result.outcome !== 'success') throw new MemoryFault('scope_commit_unknown', 'unknown')
    }
    if (lease.recovered) return []
    const recovery = await this.deletion.recoverScope(lease)
    if (lease.unknown || recovery.outcome === 'unknown')
      throw new MemoryFault('scope_commit_unknown', 'unknown')
    lease.markRecovered()
    // Failed cleanup of one old record cannot prevent independent valid work.
    return [
      ...(recovery.warnings ?? []),
      ...(recovery.outcome === 'failed'
        ? [{ code: recovery.error_code ?? 'recovery_incomplete' }]
        : [])
    ]
  }
  private snapshot(scope: ResolvedScope): Promise<SearchSnapshot> {
    return this.coordinator.run(scope, async (lease) => {
      const warnings = await this.prepare(lease)
      return this.cache.withSnapshot(lease, (snapshot) => ({
        ...snapshot,
        warnings: [...snapshot.warnings, ...warnings]
      }))
    })
  }
  private async globalSnapshot() {
    const scope = await this.projects.resolve({ scope: 'global' }, { create: false })
    if (!('key' in scope)) throw new MemoryFault('scope_unavailable')
    return this.snapshot(scope)
  }
  private async resolved<M extends MemoryMethod>(
    scope: ResolvedScope,
    method: M,
    input: MemoryInputs[M]
  ): Promise<MemoryResult<MemoryOutputs[M]>> {
    if (method === 'search') {
      const search = input as SearchInput
      const snapshots = [await this.snapshot(scope)]
      if (scope.projectId && search.include_global) snapshots.push(await this.globalSnapshot())
      return searchPage(snapshots, search, this.budgets.responseBytes) as MemoryResult<
        MemoryOutputs[M]
      >
    }
    return this.coordinator.run(scope, async (lease) => {
      const warnings = await this.prepare(lease)
      let result: MemoryResult<any>
      if (method === 'get') result = await this.records.get(lease, input as MemoryInputs['get'])
      else if (method === 'forget') {
        const { cleanup: _cleanup, ...publicResult } = await this.deletion.forget(
          lease,
          input as MemoryInputs['forget']
        )
        this.cache.invalidate(scope.key)
        result = publicResult
      } else {
        const mutation =
          method === 'store'
            ? await this.records.store(lease, input as MemoryInputs['store'])
            : await this.records.update(lease, input as MemoryInputs['update'])
        const { committed, changed: _changed, ...publicResult } = mutation
        result = publicResult
        if (committed) {
          try {
            this.cache.publish(lease, committed)
          } catch {
            this.cache.invalidate(scope.key)
            warnings.push({ code: 'cache_invalidated' })
          }
        } else if (result.outcome === 'unknown') this.cache.invalidate(scope.key)
      }
      if (warnings.length) result.warnings = [...(result.warnings ?? []), ...warnings].slice(0, 100)
      return result
    })
  }
  close() {
    if (!this.closed) {
      this.closing = true
      this.closed = (async () => {
        await Promise.all([...this.active])
        await this.coordinator.close()
        this.cache.clear()
      })()
    }
    return this.closed
  }
}
