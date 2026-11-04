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
  SearchPage,
  ScopeRef
} from '../shared'

export type MemoryTarget = ScopeRef | { projectId: string }
type Filters = Omit<MemoryInputs['search'], 'scope' | 'project_path'>
type MutationMethod = 'store' | 'update' | 'forget'
type ActionResult = { success: boolean; errorCode?: string; cancelled?: boolean }
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
  copyRules(): Promise<void>
  downloadRules(): Promise<boolean>
  openPath(path: string): Promise<void>
  notify(type: 'success' | 'error', key: string): void
  timeoutMs?: number
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const completed = (result: MemoryResult<unknown>) =>
  ['success', 'already_deleted'].includes(result.outcome)

/** Page lifetime does not own requests, their immutable inputs, receipts or listener cleanup. */
export class MemoryController {
  preferredTarget: MemoryTarget = { scope: 'global' }
  projectsResult?: MemoryResult<MemoryProjectInfo[]>
  searchResult?: MemoryResult<SearchPage>
  detail?: MemoryResult<MemoryView>
  diagnosticsResult?: MemoryResult<any[]>
  recoveryResult?: MemoryResult<ProjectRecoveryReport>
  runtimeResult?: MemoryResult<{ dataRoot: string }>
  searchBusy = false
  detailBusy = false
  projectsBusy = false
  mutation?: Mutation
  actions: Record<string, Action> = {}
  private searchSequence = 0
  private detailSequence = 0
  private mutationFlight?: Promise<MemoryResult<any>>
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
    return this.action('preferences', async () => {
      await this.deps.writePreferences(snapshot)
      return { success: true }
    })
  }
  loadProjects() {
    if (this.projectsFlight) return this.projectsFlight
    this.projectsBusy = true
    this.projectsFlight = this.request<MemoryProjectInfo[]>('app-fork:ai-memory', ['listProjects'])
      .then((result) => {
        this.projectsResult = result
        return result
      })
      .finally(() => {
        this.projectsBusy = false
        this.projectsFlight = undefined
      })
    return this.projectsFlight
  }
  search(target: MemoryTarget, filters: Filters = {}) {
    const sequence = ++this.searchSequence
    this.searchBusy = true
    return this.call(clone(target), 'search', clone(filters)).then((result) => {
      if (sequence === this.searchSequence) {
        this.searchResult = result
        this.searchBusy = false
      }
      return result
    })
  }
  clearDetail() {
    this.detailSequence++
    this.detail = undefined
    this.detailBusy = false
  }
  get(target: MemoryTarget, id: string, revision?: number) {
    const sequence = ++this.detailSequence
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
        if (
          operation.method === 'forget' &&
          result.data?.id &&
          ['success', 'already_deleted', 'partial'].includes(result.outcome)
        ) {
          const id = result.data.id
          if (this.detail?.data?.id === id) this.clearDetail()
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
  private action(key: string, work: () => Promise<ActionResult>) {
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
  loadDiagnostics() {
    return this.request<any[]>('plugin:diagnostics', ['ai-memory']).then((result) => {
      this.diagnosticsResult = result
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
