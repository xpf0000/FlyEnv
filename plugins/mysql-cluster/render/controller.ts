import type {
  CreateRequest,
  SavedCatalog,
  InstanceSnapshot,
  Credentials,
  OperationResult,
  ItemOutcome,
  ClusterSpec,
  OperationEvent
} from '../shared'
import { emptyCatalog, errorText, summarize } from '../shared'
import { validateCatalog } from '../policy'

export interface ServiceItem {
  run: boolean
  running: boolean
  pid?: string
  start(interactive?: boolean): Promise<string | boolean>
  stop(interactive?: boolean): Promise<string | boolean>
  restart(): Promise<string | boolean>
}
export interface ControllerDependencies {
  read(): Promise<any>
  write(value: any): Promise<void>
  rpc(method: string, args: any[], progress?: (event: OperationEvent) => void): Promise<any>
  installed(): Promise<void>
  service(id: string): ServiceItem
  notify(type: 'success' | 'error', message: string): void
}
export interface OperationState {
  action: string
  busy: boolean
  stage: string
  error: string
  result?: OperationResult
}
export class MysqlClusterController {
  catalog: SavedCatalog = emptyCatalog()
  snapshots: Record<string, InstanceSnapshot> = {}
  credentials: Credentials = {}
  preferences: Record<string, any> = {}
  operations: Record<string, OperationState> = {}
  initialized = false
  blocked = false
  refreshing = false
  loadError = ''
  private flights = new Map<string, { action: string; promise: Promise<OperationResult> }>()
  private visibilityFlight?: Promise<OperationResult[]>
  private allFlight?: { action: 'start' | 'stop'; promise: Promise<OperationResult> }
  get allBusy() {
    return !!this.allFlight
  }
  private loadFlight?: Promise<void>
  private refreshFlight?: Promise<void>
  private replicationRefreshFlight?: Promise<void>
  private persistence: Promise<unknown> = Promise.resolve()
  private serializeWrite<T>(task: () => Promise<T>): Promise<T> {
    const next = this.persistence.then(task, task)
    this.persistence = next.catch(() => undefined)
    return next
  }
  constructor(readonly deps: ControllerDependencies) {}
  load(): Promise<void> {
    if (this.blocked) return Promise.reject(new Error(this.loadError))
    if (this.initialized) return Promise.resolve()
    if (this.loadFlight) return this.loadFlight
    this.loadFlight = (async () => {
      try {
        let saved: any
        try {
          saved = await this.deps.read()
        } catch (error) {
          if (!['no found', 'expire'].includes(errorText(error))) throw error
        }
        if (saved) {
          if (saved.schemaVersion !== 1) throw new Error('Unknown saved catalog schema')
          this.preferences = saved.preferences ?? {}
          for (const [id, pref] of Object.entries(this.preferences))
            if (pref.rootCredential) this.credentials[id] = pref.rootCredential
        }
        await this.refresh()
        this.initialized = true
        this.loadError = ''
      } catch (error) {
        this.loadError = errorText(error)
        throw error
      } finally {
        this.loadFlight = undefined
      }
    })()
    return this.loadFlight
  }
  private writeState(catalog: SavedCatalog, preferences: Record<string, any>) {
    // IndexedDB cannot clone Vue proxies, including proxies nested in a plain envelope.
    const snapshot = JSON.parse(JSON.stringify({ schemaVersion: 1, catalog, preferences }))
    return this.deps.write(snapshot)
  }
  async persist(catalog = this.catalog) {
    await this.serializeWrite(() => this.writeState(catalog, this.preferences))
  }
  refresh(includeReplication = false): Promise<void> {
    const processes = this.refreshProcesses()
    return includeReplication ? processes.then(() => this.refreshReplication()) : processes
  }
  private refreshProcesses(): Promise<void> {
    if (this.blocked) return Promise.reject(new Error(this.loadError))
    if (this.refreshFlight) return this.refreshFlight
    this.refreshing = true
    this.refreshFlight = (async () => {
      const catalog = validateCatalog(await this.deps.rpc('readCatalog', []))
      await this.deps.installed()
      const values: InstanceSnapshot[] = await this.deps.rpc('listInstances', [])
      this.catalog = catalog
      const snapshots: Record<string, InstanceSnapshot> = {}
      for (const snapshot of values) {
        snapshots[snapshot.id] = snapshot
        const item = this.deps.service(snapshot.id)
        if (!item.running) {
          item.run = snapshot.state === 'running'
          item.pid = snapshot.pid ?? ''
        }
      }
      this.snapshots = snapshots
    })().finally(() => {
      this.refreshFlight = undefined
      this.refreshing = !!this.replicationRefreshFlight
    })
    return this.refreshFlight
  }
  private refreshReplication(): Promise<void> {
    if (this.replicationRefreshFlight) return this.replicationRefreshFlight
    this.refreshing = true
    const targets = Object.values(this.snapshots)
      .filter(
        (snapshot) =>
          snapshot.state === 'running' &&
          this.credentials[snapshot.id] &&
          this.groupFor(snapshot.id)?.mode !== 'standalone'
      )
      .map((snapshot) => ({
        id: snapshot.id,
        pid: snapshot.pid,
        credential: JSON.parse(JSON.stringify(this.credentials[snapshot.id]))
      }))
    this.replicationRefreshFlight = (async () => {
      for (const target of targets) {
        const before = this.snapshots[target.id]
        if (before?.state !== 'running' || before.pid !== target.pid) continue
        let replication: InstanceSnapshot['replication']
        try {
          replication = await this.deps.rpc('replicationStatus', [target.id, target.credential])
        } catch (error) {
          replication = { state: 'unknown', role: 'UNKNOWN', lag: null, error: errorText(error) }
        }
        // Observation cannot replace a newer stop/restart result or its PID.
        const current = this.snapshots[target.id]
        if (current?.state === 'running' && current.pid === target.pid) {
          current.replication = replication
          current.role = replication?.role
        }
      }
    })().finally(() => {
      this.replicationRefreshFlight = undefined
      this.refreshing = !!this.refreshFlight
    })
    return this.replicationRefreshFlight
  }
  groupFor(id: string): ClusterSpec | undefined {
    return this.catalog.clusters.find((g) => g.memberIds.includes(id))
  }
  reportFormError(error: unknown) {
    this.notice('error', errorText(error))
  }
  private notice(type: 'success' | 'error', message: string) {
    try {
      this.deps.notify(type, message)
    } catch {
      /* Notification cannot undo a completed operation. */
    }
  }
  operate(
    key: string,
    action: string,
    task: (op: OperationState) => Promise<OperationResult>,
    notify = true
  ): Promise<OperationResult> {
    const current = this.flights.get(key)
    if (current)
      return current.action === action
        ? current.promise
        : Promise.resolve(
            summarize([
              { id: key, status: 'failed', stage: 'busy', error: 'An operation is already running' }
            ])
          )
    this.operations[key] = { action, busy: true, stage: 'validating', error: '' }
    const op = this.operations[key]
    const promise = Promise.resolve()
      .then(async () => {
        if (this.blocked) throw new Error(this.loadError)
        if (!this.initialized) await this.load()
        return task(op)
      })
      .catch((error) => {
        op.error = errorText(error)
        return summarize([{ id: key, status: 'failed', stage: op.stage, error: op.error }])
      })
      .then((result) => {
        op.result = result
        op.error = result.items
          .filter((i) => i.error)
          .map((i) => `${i.id}: ${i.error}`)
          .join('\n')
        if (notify || result.status !== 'completed')
          this.notice(
            result.status === 'completed' ? 'success' : 'error',
            op.error || result.status
          )
        return result
      })
      .finally(async () => {
        try {
          await this.refresh()
        } catch (error) {
          this.loadError = errorText(error)
        } finally {
          op.busy = false
          this.flights.delete(key)
        }
      })
    this.flights.set(key, { action, promise })
    return promise
  }
  async command<T>(id: string, method: string, args: any[], write = false): Promise<T | undefined> {
    const group = this.groupFor(id)
    if (group && this.operations[group.id]?.busy) {
      this.notice('error', 'Cluster operation is running')
      return undefined
    }
    let value: T | undefined
    const result = await this.operate(
      id,
      method,
      async (op) => {
        value = await this.deps.rpc(method, [id, ...JSON.parse(JSON.stringify(args))], (event) => {
          op.stage = event.stage
        })
        if (value && typeof value === 'object' && 'status' in value && 'items' in value)
          return value as OperationResult
        return summarize([{ id, status: 'completed', stage: method }])
      },
      write
    )
    return result.status === 'completed' || value !== undefined ? value : undefined
  }
  async savePreferences(id: string, patch: Record<string, any>) {
    return this.operate(
      id,
      'preferences',
      async () => {
        await this.serializeWrite(async () => {
          const next = JSON.parse(JSON.stringify(this.preferences))
          next[id] = { ...next[id], ...patch }
          await this.writeState(this.catalog, next)
          this.preferences = next
        })
        return summarize([{ id, status: 'completed', stage: 'saved' }])
      },
      false
    )
  }
  async setCredential(id: string, password: string, remember: boolean) {
    if (!password) return false
    const credential = { user: 'root', password }
    const result = await this.savePreferences(id, {
      rootCredential: remember ? credential : undefined
    })
    if (result.status !== 'completed') return false
    this.credentials[id] = credential
    return true
  }
  create(input: CreateRequest) {
    const request: CreateRequest = JSON.parse(JSON.stringify(input))
    return this.operate(request.cluster.id, 'create', async (op) => {
      if (request.instances.some((instance) => !request.credentials[instance.id]?.password))
        throw new Error('Initial administrator credentials are required')
      Object.assign(this.credentials, request.credentials)
      op.stage = 'preparing'
      const catalog = validateCatalog(await this.deps.rpc('prepareInstances', [request]))
      await this.persist(catalog)
      this.catalog = catalog
      await this.deps.installed()
      const items: ItemOutcome[] = []
      for (const instance of request.instances) {
        try {
          op.stage = `initializing: ${instance.name}`
          await this.deps.rpc('initializeInstance', [instance.id], (e) => {
            op.stage = `${e.stage}: ${instance.name}`
          })
          op.stage = `starting: ${instance.name}`
          const result = await this.deps.service(instance.id).start()
          if (result !== true) throw new Error(String(result))
          items.push({ id: instance.id, status: 'completed', stage: 'started' })
        } catch (error) {
          items.push({
            id: instance.id,
            status: 'failed',
            stage: op.stage,
            error: errorText(error)
          })
        }
      }
      if (request.cluster.mode !== 'standalone' && items.every((i) => i.status === 'completed')) {
        op.stage = 'configuring-replication'
        return this.configureStartedGroup(request.cluster, op, items)
      }
      return summarize(items)
    })
  }
  private requireGroupCredentials(group: ClusterSpec) {
    for (const id of group.memberIds)
      if (!this.credentials[id]?.password)
        throw new Error(
          'Enter administrator credentials for each member before configuring replication'
        )
  }
  private async configureStartedGroup(
    group: ClusterSpec,
    op: OperationState,
    started: ItemOutcome[]
  ) {
    op.stage = 'configuring-replication'
    try {
      return await this.configureGroup(group, op)
    } catch (error) {
      return summarize([
        ...started,
        { id: group.id, status: 'failed', stage: 'replication', error: errorText(error) }
      ])
    }
  }
  private configureGroup(group: ClusterSpec, op: OperationState) {
    this.requireGroupCredentials(group)
    return this.deps.rpc(
      group.mode === 'replication' ? 'configureReplication' : 'configureGroupReplication',
      [group.id, JSON.parse(JSON.stringify(this.credentials))],
      (event) => {
        op.stage = `${event.stage}${event.instanceId ? ': ' + event.instanceId : ''}`
      }
    ) as Promise<OperationResult>
  }
  recoverReplication(group: ClusterSpec) {
    return this.operate(group.id, 'configure-replication', async (op) => {
      if (group.memberIds.some((id) => this.operations[id]?.busy))
        throw new Error('A member operation is running')
      await this.refresh()
      const current = this.catalog.clusters.find((item) => item.id === group.id)
      if (!current || current.mode === 'standalone') throw new Error('Unknown replication group')
      if (current.memberIds.some((id) => this.snapshots[id]?.state !== 'running'))
        throw new Error('Start every member before configuring replication')
      op.stage = 'configuring-replication'
      return this.configureGroup(current, op)
    })
  }
  runInstance(id: string, action: 'start' | 'stop' | 'restart') {
    const group = this.groupFor(id)
    if (group && this.operations[group.id]?.busy)
      return Promise.resolve(
        summarize([{ id, status: 'failed', stage: 'busy', error: 'Cluster operation is running' }])
      )
    return this.operate(id, action, async () => {
      await this.refresh()
      if (this.snapshots[id]?.state === 'unknown') throw new Error('Cannot verify instance state')
      if (action !== 'stop') await this.deps.rpc('initializeInstance', [id])
      const result = await this.deps.service(id)[action]()
      if (result !== true) throw new Error(String(result))
      return summarize([{ id, status: 'completed', stage: action }])
    })
  }
  runAll(action: 'start' | 'stop', interactive = true): Promise<OperationResult> {
    if (this.allFlight) {
      if (this.allFlight.action === action) return this.allFlight.promise
      return Promise.resolve(
        summarize([
          {
            id: 'mysql-cluster',
            status: 'failed',
            stage: 'busy',
            error: 'An all-instances operation is already running'
          }
        ])
      )
    }
    const promise = Promise.resolve()
      .then(async () => {
        if (!this.initialized) await this.load()
        if (Object.values(this.operations).some((operation) => operation.busy))
          throw new Error('An instance operation is already running')
        const groups: ClusterSpec[] = JSON.parse(JSON.stringify(this.catalog.clusters))
        const results = await Promise.allSettled(
          groups.map((group) => this.runGroup(group, action, interactive))
        )
        // Per-group refreshes can share a snapshot captured before a sibling starts.
        // Every group has now settled, so this refresh observes the complete batch.
        try {
          await this.refresh()
        } catch (error) {
          this.loadError = errorText(error)
          this.notice('error', this.loadError)
        }
        return summarize(
          results.flatMap((result, index) =>
            result.status === 'fulfilled'
              ? result.value.items
              : [
                  {
                    id: groups[index].id,
                    status: 'failed' as const,
                    stage: action,
                    error: errorText(result.reason)
                  }
                ]
          )
        )
      })
      .catch((error) => {
        const message = errorText(error)
        this.notice('error', message)
        return summarize([{ id: 'mysql-cluster', status: 'failed', stage: action, error: message }])
      })
      .finally(() => {
        this.allFlight = undefined
      })
    this.allFlight = { action, promise }
    return promise
  }
  stopForVisibility(): Promise<OperationResult[]> {
    if (this.visibilityFlight) return this.visibilityFlight
    const admitted = [...this.flights.values()].map((value) => value.promise)
    if (this.allFlight) admitted.push(this.allFlight.promise)
    this.visibilityFlight = Promise.all(admitted)
      .then(async () => {
        if (!this.initialized) await this.load()
        const results: OperationResult[] = []
        for (const group of this.catalog.clusters)
          results.push(await this.runGroup(group, 'stop', false))
        return results
      })
      .finally(() => {
        this.visibilityFlight = undefined
      })
    return this.visibilityFlight
  }
  runGroup(group: ClusterSpec, action: 'start' | 'stop' | 'restart', interactive = true) {
    return this.operate(group.id, action, async (op) => {
      if (group.memberIds.some((id) => this.operations[id]?.busy))
        throw new Error('A member operation is running')
      await this.refresh()
      const outcomes: ItemOutcome[] = []
      if (action !== 'start') {
        for (const id of [...group.memberIds].reverse()) {
          try {
            if (this.snapshots[id]?.state === 'unknown') throw new Error('Unknown process state')
            const result = await this.deps.service(id).stop(interactive)
            if (result !== true) throw new Error(String(result))
            outcomes.push({ id, status: 'completed', stage: 'stop' })
          } catch (error) {
            outcomes.push({ id, status: 'failed', stage: 'stop', error: errorText(error) })
          }
        }
        if (action === 'stop' || outcomes.some((i) => i.status !== 'completed'))
          return summarize(outcomes)
      }
      outcomes.splice(0)
      for (const id of group.memberIds) {
        op.stage = `starting: ${id}`
        try {
          await this.deps.rpc('initializeInstance', [id])
          const result = await this.deps.service(id).start(interactive)
          if (result !== true) throw new Error(String(result))
          outcomes.push({ id, status: 'completed', stage: 'start' })
        } catch (error) {
          outcomes.push({ id, status: 'failed', stage: 'start', error: errorText(error) })
        }
      }
      return summarize(outcomes)
    })
  }
  remove(group: ClusterSpec) {
    return this.operate(group.id, 'remove', async (op) => {
      if (group.memberIds.some((id) => this.operations[id]?.busy))
        throw new Error('A member operation is running')
      await this.refresh()
      op.stage = 'stopping'
      const outcomes: ItemOutcome[] = []
      for (const id of [...group.memberIds].reverse()) {
        try {
          if (this.snapshots[id]?.state === 'unknown') throw new Error('Unknown process state')
          const result = await this.deps.service(id).stop()
          if (result !== true) throw new Error(String(result))
          outcomes.push({ id, status: 'completed', stage: 'stop' })
        } catch (error) {
          outcomes.push({ id, status: 'failed', stage: 'stop', error: errorText(error) })
        }
      }
      if (outcomes.some((i) => i.status !== 'completed')) return summarize(outcomes)
      await this.deps.rpc('removeRecords', [group.memberIds])
      const catalog = validateCatalog(await this.deps.rpc('readCatalog', []))
      await this.persist(catalog)
      this.catalog = catalog
      return summarize(outcomes.map((o) => ({ ...o, stage: 'removed-data-retained' })))
    })
  }
  save(input: CreateRequest) {
    return this.operate(input.cluster.id, 'edit', async () => {
      await this.refresh()
      if (input.cluster.memberIds.some((id) => this.snapshots[id]?.state !== 'stopped'))
        throw new Error('Stop every member before editing instance identity')
      const catalog = validateCatalog(await this.deps.rpc('updateInstances', [input]))
      await this.persist(catalog)
      this.catalog = catalog
      return summarize(
        input.instances.map((i) => ({ id: i.id, status: 'completed', stage: 'saved' }))
      )
    })
  }
}
