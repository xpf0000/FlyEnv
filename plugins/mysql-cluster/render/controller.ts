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
  start(): Promise<string | boolean>
  stop(): Promise<string | boolean>
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
  private loadFlight?: Promise<void>
  private refreshFlight?: Promise<void>
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
  async persist(catalog = this.catalog) {
    await this.serializeWrite(() =>
      this.deps.write({ schemaVersion: 1, catalog, preferences: this.preferences })
    )
  }
  refresh(): Promise<void> {
    if (this.blocked) return Promise.reject(new Error(this.loadError))
    if (this.refreshFlight) return this.refreshFlight
    this.refreshing = true
    this.refreshFlight = (async () => {
      const catalog = validateCatalog(await this.deps.rpc('readCatalog', []))
      await this.deps.installed()
      const values: InstanceSnapshot[] = await this.deps.rpc('listInstances', [])
      this.catalog = catalog
      for (const snapshot of values) {
        const group = this.groupFor(snapshot.id)
        if (
          snapshot.state === 'running' &&
          this.credentials[snapshot.id] &&
          group?.mode !== 'standalone'
        ) {
          try {
            snapshot.replication = await this.deps.rpc('replicationStatus', [
              snapshot.id,
              this.credentials[snapshot.id]
            ])
            snapshot.role = snapshot.replication!.role
          } catch (error) {
            snapshot.replication = {
              state: 'unknown',
              role: 'UNKNOWN',
              lag: null,
              error: errorText(error)
            }
          }
        }
        this.snapshots[snapshot.id] = snapshot
        const item = this.deps.service(snapshot.id)
        if (!item.running) {
          item.run = snapshot.state === 'running'
          item.pid = snapshot.pid ?? ''
        }
      }
    })().finally(() => {
      this.refreshFlight = undefined
      this.refreshing = false
    })
    return this.refreshFlight
  }
  groupFor(id: string): ClusterSpec | undefined {
    return this.catalog.clusters.find((g) => g.memberIds.includes(id))
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
        op.busy = false
        this.flights.delete(key)
        try {
          await this.refresh()
        } catch (error) {
          this.loadError = errorText(error)
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
          await this.deps.write({ schemaVersion: 1, catalog: this.catalog, preferences: next })
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
      [group.id, this.credentials],
      (event) => {
        op.stage = `${event.stage}${event.instanceId ? ': ' + event.instanceId : ''}`
      }
    ) as Promise<OperationResult>
  }
  runInstance(id: string, action: 'start' | 'stop' | 'restart') {
    let group = this.groupFor(id)
    if (group && this.operations[group.id]?.busy)
      return Promise.resolve(
        summarize([{ id, status: 'failed', stage: 'busy', error: 'Cluster operation is running' }])
      )
    return this.operate(id, action, async (op) => {
      group = this.groupFor(id)
      if (action !== 'stop' && group && group.mode !== 'standalone')
        this.requireGroupCredentials(group)
      await this.refresh()
      if (this.snapshots[id]?.state === 'unknown') throw new Error('Cannot verify instance state')
      if (action !== 'stop') await this.deps.rpc('initializeInstance', [id])
      const result = await this.deps.service(id)[action]()
      if (result !== true) throw new Error(String(result))
      if (action !== 'stop' && group?.mode !== 'standalone' && group)
        return this.configureStartedGroup(group, op, [{ id, status: 'completed', stage: action }])
      return summarize([{ id, status: 'completed', stage: action }])
    })
  }
  runGroup(group: ClusterSpec, action: 'start' | 'stop' | 'restart') {
    return this.operate(group.id, action, async (op) => {
      if (action !== 'stop' && group.mode !== 'standalone') this.requireGroupCredentials(group)
      if (group.memberIds.some((id) => this.operations[id]?.busy))
        throw new Error('A member operation is running')
      await this.refresh()
      const outcomes: ItemOutcome[] = []
      if (action !== 'start') {
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
        if (action === 'stop' || outcomes.some((i) => i.status !== 'completed'))
          return summarize(outcomes)
      }
      outcomes.splice(0)
      for (const id of group.memberIds) {
        op.stage = `starting: ${id}`
        try {
          await this.deps.rpc('initializeInstance', [id])
          const result = await this.deps.service(id).start()
          if (result !== true) throw new Error(String(result))
          outcomes.push({ id, status: 'completed', stage: 'start' })
        } catch (error) {
          outcomes.push({ id, status: 'failed', stage: 'start', error: errorText(error) })
        }
      }
      if (outcomes.some((i) => i.status !== 'completed') || group.mode === 'standalone')
        return summarize(outcomes)
      return this.configureStartedGroup(group, op, outcomes)
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
