import { memoryProjectSelection } from './presentation'
import type { MCPHttpClientFlag } from '../../../src/shared/mcpClientConfig'
import type {
  MemoryDraft,
  MemoryInputs,
  MemoryMethod,
  MemoryOutputs,
  MemoryProjectInfo,
  MemoryResult,
  MemoryView,
  ProjectRecoveryReport,
  ProjectRelinkReceipt,
  SearchPage,
  ScopeRef
} from '../shared'

export type MemoryTarget = ScopeRef | { projectId: string }
type Filters = Omit<MemoryInputs['search'], 'scope' | 'project_path'>
type MutationMethod = 'store' | 'update' | 'forget'
type ActionResult = { success: boolean; errorCode?: string; cancelled?: boolean; path?: string }
export type MemoryConnection = { running: boolean; http: boolean; enabledCount: number }
type Action = { status: 'running' | 'complete'; result?: ActionResult }
type Mutation = {
  target: MemoryTarget
  method: MutationMethod
  input: Record<string, any>
  status: 'running' | 'complete'
  result?: MemoryResult<any>
}
export interface MemoryControllerDeps {
  ipc: {
    sendSensitive(
      command: string,
      ...args: any[]
    ): { key: string; then(cb: (key: string, response: any) => void): void }
    off(key: string): void
  }
  id(): string
  readPreferences(): Promise<unknown>
  writePreferences(value: MemoryTarget): Promise<void>
  configure(client: MCPHttpClientFlag): Promise<ActionResult>
  readConnection(): Promise<MemoryConnection>
  chooseProject(): Promise<string | undefined>
  copyVerification(): Promise<void>
  copyRules(): Promise<void>
  downloadRules(): Promise<boolean>
  openPath(path: string): Promise<void>
  openTerminal(path: string): Promise<void>
  notify(type: 'success' | 'error', key: string): void
  timeoutMs?: number
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const completed = (result: MemoryResult<unknown>) =>
  ['success', 'already_deleted'].includes(result.outcome)

/** Page lifetime does not own requests, their immutable inputs, receipts or listener cleanup. */
export class MemoryController {
  relinkedProject?: ProjectRelinkReceipt
  preferredTarget: MemoryTarget = { scope: 'global' }
  projectsResult?: MemoryResult<MemoryProjectInfo[]>
  searchResult?: MemoryResult<SearchPage>
  detail?: MemoryResult<MemoryView>
  callsResult?: MemoryResult<any[]>
  recoveryResult?: MemoryResult<ProjectRecoveryReport>
  runtimeResult?: MemoryResult<{ dataRoot: string }>
  searchBusy = false
  detailBusy = false
  projectsBusy = false
  mutation?: Mutation
  actions: Record<string, Action> = {}
  connection?: MemoryConnection
  private searchSequence = 0
  private searchKey?: string
  private readonly searchCache = new Map<string, MemoryResult<SearchPage>>()
  private projectsStale = true
  private projectsSequence = 0
  private projectsFlightSequence = 0
  private searchFlight?: {
    key: string
    sequence: number
    promise: Promise<MemoryResult<SearchPage>>
  }
  private detailSequence = 0
  private detailRequest?: { target: MemoryTarget; id: string }
  private mutationFlight?: Promise<MemoryResult<any>>
  private preferenceWrite?: { key: string; promise: Promise<ActionResult> }
  private projectsFlight?: Promise<MemoryResult<MemoryProjectInfo[]>>
  private initialization?: Promise<void>
  private readonly actionFlights = new Map<string, Promise<ActionResult>>()
  constructor(private readonly deps: MemoryControllerDeps) {}
  private notice(type: 'success' | 'error', key: string) {
    try {
      this.deps.notify(type, key)
    } catch {
      /* supplementary */
    }
  }
  private request<T>(command: string, args: unknown[], mutation = false): Promise<MemoryResult<T>> {
    return new Promise((resolve) => {
      let settled = false
      let key = ''
      let timer: ReturnType<typeof setTimeout> | undefined
      const finish = (result: MemoryResult<T>) => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        if (key) this.deps.ipc.off(key)
        resolve(result)
      }
      try {
        const call = this.deps.ipc.sendSensitive(command, ...clone(args))
        key = call.key
        timer = setTimeout(
          () =>
            finish({ outcome: mutation ? 'unknown' : 'failed', error_code: 'response_timeout' }),
          this.deps.timeoutMs ?? 90_000
        )
        call.then((_key, response) => {
          if (response?.code === 200) return
          if (response?.code === 0)
            finish(
              response.data?.outcome ? response.data : { outcome: 'success', data: response.data }
            )
          else
            finish({
              outcome: response?.outcome === 'unknown' ? 'unknown' : 'failed',
              error_code: 'request_failed'
            })
        })
      } catch {
        finish({ outcome: mutation ? 'unknown' : 'failed', error_code: 'request_failed' })
      }
    })
  }
  private call<M extends MemoryMethod>(
    target: MemoryTarget,
    method: M,
    input: Record<string, any>,
    mutation = false
  ): Promise<MemoryResult<MemoryOutputs[M]>> {
    const args =
      'projectId' in target
        ? ['callForProject', target.projectId, method, input]
        : [method, { ...input, ...target }]
    return this.request('app-fork:ai-memory', args, mutation)
  }
  initialize() {
    if (!this.initialization)
      this.initialization = (async () => {
        try {
          const value: any = await this.deps.readPreferences()
          if (value?.scope === 'global') this.preferredTarget = { scope: 'global' }
          else if (typeof value?.projectId === 'string')
            this.preferredTarget = { projectId: value.projectId }
          else if (value?.scope === 'project' && typeof value.project_path === 'string')
            this.preferredTarget = { scope: 'project', project_path: value.project_path }
        } catch {
          /* absent preferences use the default; database results remain independent */
        }
      })()
    return this.initialization
  }
  savePreference(target: MemoryTarget) {
    const snapshot = clone(target)
    this.preferredTarget = snapshot
    const key = JSON.stringify(snapshot)
    if (this.preferenceWrite?.key === key) return this.preferenceWrite.promise
    const preceding = this.preferenceWrite?.promise ?? Promise.resolve()
    const promise = preceding.then(() =>
      this.action('preferences', async () => {
        await this.deps.writePreferences(snapshot)
        return { success: true }
      })
    )
    this.preferenceWrite = { key, promise }
    void promise.then(() => {
      if (this.preferenceWrite?.promise === promise) this.preferenceWrite = undefined
    })
    return promise
  }
  applyProjectRelink(receipt: ProjectRelinkReceipt) {
    this.relinkedProject = clone(receipt)
    this.invalidateData()
    const target = this.preferredTarget
    if ('projectId' in target && receipt.mergedProjectIds?.includes(target.projectId))
      return this.savePreference({ projectId: receipt.projectId })
    if (
      'scope' in target &&
      target.scope === 'project' &&
      (target.project_path === receipt.previousPath || target.project_path === receipt.selectedPath)
    )
      return this.savePreference({ projectId: receipt.projectId })
    return Promise.resolve<ActionResult>({ success: true })
  }
  loadProjects(fresh = false): Promise<MemoryResult<MemoryProjectInfo[]>> {
    if (this.projectsFlight)
      return fresh || this.projectsFlightSequence !== this.projectsSequence
        ? this.projectsFlight.then(() => this.loadProjects(fresh))
        : this.projectsFlight
    if (!fresh && !this.projectsStale && this.projectsResult?.outcome === 'success')
      return Promise.resolve(this.projectsResult)
    const sequence = this.projectsSequence
    this.projectsFlightSequence = sequence
    this.projectsBusy = true
    this.projectsFlight = this.request<MemoryProjectInfo[]>('app-fork:ai-memory', ['listProjects'])
      .then((result) => {
        if (sequence !== this.projectsSequence) return result
        this.projectsStale = result.outcome !== 'success'
        this.projectsResult = result.data ? result : { ...result, data: this.projectsResult?.data }
        if (result.outcome === 'success' && result.data && 'projectId' in this.preferredTarget) {
          const id = memoryProjectSelection(result, this.preferredTarget.projectId)
          if (id !== this.preferredTarget.projectId)
            void this.savePreference(id === 'global' ? { scope: 'global' } : { projectId: id })
        }
        return result
      })
      .finally(() => {
        this.projectsBusy = false
        this.projectsFlight = undefined
      })
    return this.projectsFlight
  }
  search(target: MemoryTarget, filters: Filters = {}, all = false, fresh = false) {
    const targetSnapshot = clone(target)
    const filterSnapshot = clone(filters)
    if (all) {
      delete filterSnapshot.cursor
      delete filterSnapshot.limit
    }
    const key = JSON.stringify([targetSnapshot, filterSnapshot, all])
    if (all && this.searchFlight?.key === key && this.searchFlight.sequence === this.searchSequence)
      return this.searchFlight.promise
    const previous = this.searchKey === key ? this.searchResult : undefined
    const cached = all && !fresh ? this.searchCache.get(key) : undefined
    const sequence = ++this.searchSequence
    this.searchKey = key
    if (cached) {
      this.searchCache.delete(key)
      this.searchCache.set(key, cached)
      this.searchResult = cached
      this.searchBusy = false
      return Promise.resolve(cached)
    }
    if (fresh) this.searchCache.delete(key)
    this.searchBusy = true
    if (all) this.searchResult = previous
    const request = all
      ? this.request<SearchPage>(
          'app-fork:ai-memory',
          'projectId' in targetSnapshot
            ? ['universeForProject', targetSnapshot.projectId, filterSnapshot]
            : ['universe', { ...filterSnapshot, ...targetSnapshot }]
        )
      : this.call(targetSnapshot, 'search', filterSnapshot)
    const promise = request
      .then((result) => {
        if (sequence === this.searchSequence) {
          this.searchResult = result.data ? result : { ...result, data: previous?.data }
          this.searchBusy = false
          if (all && result.outcome === 'success' && result.data && !result.data.truncated) {
            this.searchCache.delete(key)
            this.searchCache.set(key, result)
            if (this.searchCache.size > 12)
              this.searchCache.delete(this.searchCache.keys().next().value!)
          }
        }
        return result
      })
      .finally(() => {
        if (this.searchFlight?.sequence === sequence) this.searchFlight = undefined
      })
    this.searchFlight = { key, sequence, promise }
    return promise
  }
  private invalidateSearchCache() {
    this.searchSequence++
    this.searchCache.clear()
    this.searchBusy = false
  }
  clearSearch() {
    this.invalidateSearchCache()
    this.searchKey = undefined
    this.searchResult = undefined
  }
  invalidateData() {
    this.clearSearch()
    this.clearDetail()
    this.projectsStale = true
    this.projectsSequence++
  }
  clearDetail() {
    this.detailSequence++
    this.detail = undefined
    this.detailBusy = false
    this.detailRequest = undefined
  }
  get(target: MemoryTarget, id: string, revision?: number) {
    const sequence = ++this.detailSequence
    this.detailRequest = { target: clone(target), id }
    this.detailBusy = true
    this.detail = undefined
    return this.call(clone(target), 'get', { id, ...(revision ? { revision } : {}) }).then(
      (result) => {
        if (sequence === this.detailSequence) {
          this.detail = result
          this.detailBusy = false
        }
        return result
      }
    )
  }
  mutate(target: MemoryTarget, method: MutationMethod, input: Record<string, any>) {
    if (this.mutationFlight) return this.mutationFlight
    if (this.mutation?.result?.outcome === 'unknown') return Promise.resolve(this.mutation.result)
    this.mutation = {
      target: clone(target),
      method,
      input: { ...clone(input), request_id: this.deps.id() },
      status: 'running'
    }
    return this.executeMutation()
  }
  private executeMutation() {
    const operation = this.mutation!
    operation.status = 'running'
    const flight = this.call(operation.target, operation.method, operation.input, true)
      .then((result) => {
        operation.result = result
        operation.status = 'complete'
        if (['success', 'already_deleted', 'partial', 'unknown'].includes(result.outcome)) {
          this.invalidateSearchCache()
          this.projectsStale = true
          this.projectsSequence++
        }
        if (
          operation.method === 'forget' &&
          result.data?.id &&
          ['success', 'already_deleted', 'partial'].includes(result.outcome)
        ) {
          const id = result.data.id
          const pending = this.detailRequest
          const sameTarget =
            pending &&
            ('projectId' in pending.target
              ? 'projectId' in operation.target &&
                pending.target.projectId === operation.target.projectId
              : !('projectId' in operation.target) &&
                pending.target.scope === operation.target.scope &&
                (pending.target.scope === 'global' ||
                  (operation.target.scope === 'project' &&
                    pending.target.project_path === operation.target.project_path)))
          if ((pending?.id === id && sameTarget) || (!pending && this.detail?.data?.id === id))
            this.clearDetail()
          this.searchSequence++
          this.searchBusy = false
          if (this.searchResult?.data)
            this.searchResult = {
              ...this.searchResult,
              data: {
                results: this.searchResult.data.results.filter((hit) => hit.id !== id),
                truncated: false
              }
            }
        }
        this.notice(
          completed(result) ? 'success' : 'error',
          completed(result) ? 'saved' : result.outcome
        )
        return result
      })
      .finally(() => {
        this.mutationFlight = undefined
      })
    this.mutationFlight = flight
    return flight
  }
  retryMutation(): Promise<MemoryResult<any>> {
    if (this.mutationFlight) return this.mutationFlight
    if (!this.mutation)
      return Promise.resolve({ outcome: 'failed', error_code: 'no_pending_request' })
    return this.executeMutation()
  }
  mutationFor(requestId: string | undefined) {
    return requestId && this.mutation?.input.request_id === requestId ? this.mutation : undefined
  }
  save(target: MemoryTarget, draft: MemoryDraft, current?: MemoryView, reason = '') {
    return current
      ? this.mutate(target, 'update', {
          id: current.id,
          expected_revision: current.revision,
          reason,
          changes: draft
        })
      : this.mutate(target, 'store', draft)
  }
  archive(target: MemoryTarget, current: MemoryView, reason: string) {
    return this.mutate(target, 'update', {
      id: current.id,
      expected_revision: current.revision,
      reason,
      changes: { status: current.status === 'active' ? 'archived' : 'active' }
    })
  }
  forget(target: MemoryTarget, current: MemoryView) {
    return this.mutate(target, 'forget', { id: current.id, expected_revision: current.revision })
  }
  private action(key: string, work: () => Promise<ActionResult>): Promise<ActionResult> {
    const current = this.actionFlights.get(key)
    if (current) return current
    this.actions[key] = { status: 'running' }
    const flight = Promise.resolve()
      .then(work)
      .catch(() => ({ success: false, errorCode: 'action_failed' }))
      .then((result) => {
        this.actions[key] = { status: 'complete', result }
        return result
      })
      .finally(() => this.actionFlights.delete(key))
    this.actionFlights.set(key, flight)
    return flight
  }
  configureClient(client: MCPHttpClientFlag) {
    return this.action(`configure:${client}`, () => this.deps.configure(client))
  }
  loadConnection() {
    return this.action('connection', async () => {
      this.connection = undefined
      this.connection = await this.deps.readConnection()
      return { success: true }
    })
  }
  chooseProject() {
    return this.action('project:choose', async () => {
      const path = await this.deps.chooseProject()
      return path ? { success: true, path } : { success: false, cancelled: true }
    }).then((result) => result.path)
  }
  copyVerification() {
    return this.action('verification:copy', async () => {
      await this.deps.copyVerification()
      return { success: true }
    })
  }
  copyRules() {
    return this.action('rules:copy', async () => {
      await this.deps.copyRules()
      return { success: true }
    })
  }
  downloadRules() {
    return this.action('rules:download', async () => {
      const saved = await this.deps.downloadRules()
      return { success: saved, cancelled: !saved }
    })
  }
  loadCalls() {
    return this.request<any[]>('plugin:diagnostics', ['ai-memory']).then((result) => {
      this.callsResult = result
      return result
    })
  }
  inspectRecovery() {
    return this.request<ProjectRecoveryReport>('app-fork:ai-memory', ['inspectRecovery']).then(
      (result) => {
        this.recoveryResult = result
        return result
      }
    )
  }
  loadRuntime() {
    return this.request<{ dataRoot: string }>('app-fork:ai-memory', ['runtimeInfo']).then(
      (result) => {
        this.runtimeResult = result
        return result
      }
    )
  }
  openProjectDirectory(path: string) {
    return this.action(`project:open:${path}`, async () => {
      try {
        await this.deps.openPath(path)
        return { success: true }
      } catch {
        this.deps.notify('error', 'directory_unavailable')
        return { success: false, errorCode: 'directory_unavailable' }
      }
    })
  }
  openProjectTerminal(path: string) {
    return this.action(`project:terminal:${path}`, async () => {
      try {
        await this.deps.openTerminal(path)
        return { success: true }
      } catch {
        this.notice('error', 'terminalUnavailable')
        return { success: false, errorCode: 'terminalUnavailable' }
      }
    })
  }
  openDataDirectory() {
    return this.action('directory', async () => {
      const result = this.runtimeResult ?? (await this.loadRuntime())
      if (!result.data?.dataRoot)
        return { success: false, errorCode: result.error_code ?? 'directory_unavailable' }
      await this.deps.openPath(result.data.dataRoot)
      return { success: true }
    })
  }
}
