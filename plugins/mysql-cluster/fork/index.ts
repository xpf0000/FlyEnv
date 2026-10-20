import { Base } from '@fork/module/Base'
import { ForkPromise } from '@shared/ForkPromise'
import { StopProcessListFetch } from '@shared/StopProcessList'
import { join } from 'node:path'
import type { SoftInstalled } from '@shared/app'
import type { Credential, CreateRequest, EventSink } from '../shared'
import { InstanceCatalog } from './catalog'
import { MysqlInstanceRuntime } from './runtime'
import { InstanceStopAdapter } from './service'
import { initializeInstance } from './initialize'
import { ReplicationService } from './replication'
import type { Credentials } from '../shared'
import { GroupReplicationService } from './groupReplication'
import { readFile } from 'node:fs/promises'
import { writeAtomic } from './io'
import { validateConfigEdit, renderConfig } from './config'
import { listDatabases, mutateDatabase, createDatabase, backupDatabase, readLog } from './manage'
import type { DatabaseInput } from './manage'
import { validateCreateRequest } from '../policy'

export class MysqlClusterModule extends Base {
  private catalogValue?: InstanceCatalog
  private runtimeValue?: MysqlInstanceRuntime
  private replicationValue?: ReplicationService
  private groupValue?: GroupReplicationService
  constructor() { super(); this.type = 'mysql-cluster' }
  get catalog() {
    return this.catalogValue ??= new InstanceCatalog(join(global.Server.MysqlDir!, 'mysql-cluster'), process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux')
  }
  get runtime() {
    return this.runtimeValue ??= new MysqlInstanceRuntime(this.catalog, {
      list: StopProcessListFetch,
      stop: async (spec, pid) => {
        const res: any = await new InstanceStopAdapter(this.catalog, spec).stopService({ ...this.runtime.descriptor(spec), pid })
        return res['APP-Service-Stop-PID'] ?? []
      }
    })
  }
  get replication() { return this.replicationValue ??= new ReplicationService(this.catalog) }
  get groupReplication() { return this.groupValue ??= new GroupReplicationService(this.catalog) }
  configureGroupReplication(groupId: string, credentials: Credentials) {
    return this.request(async emit => {
      const group = (await this.catalog.read()).clusters.find(g => g.id === groupId)
      if (!group || group.mode !== 'group-replication') throw new Error('Unknown GR group')
      return this.groupReplication.configure(group, credentials, emit)
    })
  }
  replicationStatus(id: string, credential: Credential) {
    return this.request(async () => {
      const { cluster } = await this.catalog.instance(id)
      return cluster.mode === 'group-replication' ? this.groupReplication.status(id, credential)
        : cluster.mode === 'replication' ? this.replication.status(id, credential)
        : { state: 'online', role: 'STANDALONE', lag: null }
    })
  }
  configureReplication(groupId: string, credentials: Credentials) {
    return this.request(async emit => {
      const group = (await this.catalog.read()).clusters.find(g => g.id === groupId)
      if (!group || group.mode !== 'replication') throw new Error('Unknown replication group')
      return this.replication.configure(group, credentials, emit)
    })
  }
  request<T>(task: (emit: EventSink) => Promise<T>) {
    return new ForkPromise<T>(async (resolve, reject, on) => {
      try { resolve(await task(event => on({ 'APP-Mysql-Cluster-Progress': event }))) }
      catch (error) { reject(error) }
    })
  }
  readCatalog() { return this.request(() => this.catalog.read()) }
  removeRecords(ids: string[]) {
    return this.request(async () => {
      const snapshots = await this.runtime.listInstances()
      if (ids.some(id => !snapshots.some(s => s.id === id && ['stopped', 'missing'].includes(s.state)))) throw new Error('Confirm every member is stopped before removal')
      await this.catalog.removeRecords(ids)
      return true
    })
  }
  updateInstances(input: CreateRequest) {
    return this.request(async () => {
      validateCreateRequest(input, this.catalog.platform)
      const snapshots = await this.runtime.listInstances()
      if (input.instances.some(i => !snapshots.some(s => s.id === i.id && s.state === 'stopped'))) throw new Error('Stop all members before editing')
      return this.catalog.exclusive(async () => {
        const c = await this.catalog.read(), group = c.clusters.find(g => g.id === input.cluster.id)
        if (!group || group.mode !== input.cluster.mode || JSON.stringify(group.memberIds) !== JSON.stringify(input.cluster.memberIds)) throw new Error('Cannot change existing topology')
        for (const item of input.instances) {
          const old = c.instances.find(i => i.id === item.id)
          if (!old || old.engine.bin !== item.engine.bin || old.engine.version !== item.engine.version || old.dataDir !== item.dataDir || old.serverId !== item.serverId) throw new Error('Existing data directory, engine and server identity cannot change')
          Object.assign(old, { name: item.name, port: item.port, socket: item.socket, groupPort: item.groupPort })
        }
        group.name = input.cluster.name
        // Reuse complete-catalog validation, including conflicts with other groups.
        const ports = c.instances.flatMap(i => [i.port, i.groupPort].filter(Boolean))
        if (new Set(ports).size !== ports.length) throw new Error('Port conflicts with another instance')
        for (const item of input.instances) {
          const paths = this.catalog.paths(item.id)
          const current = await readFile(paths.config, 'utf8')
          const generated = renderConfig(item, group.mode, paths, this.catalog.platform)
          // Keep optional user settings; replace only managed identity lines.
          const keys = new Set(generated.split('\n').filter(l => l.includes('=')).map(l => l.split('=')[0]))
          const extra = current.split('\n').filter(l => l.includes('=') && !keys.has(l.split('=')[0].trim()))
          await writeAtomic(paths.config, generated + extra.join('\n') + '\n')
        }
        await this.catalog.write(c)
        return c
      })
    })
  }
  readConfig(id: string) { return this.request(async () => { await this.catalog.instance(id); return readFile(this.catalog.paths(id).config, 'utf8') }) }
  saveConfig(id: string, text: string) {
    return this.request(async () => { const { spec } = await this.catalog.instance(id); const file = this.catalog.paths(id).config; validateConfigEdit(spec, text, await readFile(file, 'utf8')); await writeAtomic(file, text); return true })
  }
  readLog(id: string, kind: 'error' | 'slow') { return this.request(() => readLog(this.catalog, id, kind)) }
  getDatabasesWithUsers(id: string, credential: Credential) { return this.request(() => listDatabases(this.catalog, id, credential)) }
  addDatabase(id: string, credential: Credential, input: DatabaseInput) { return this.request(() => mutateDatabase(this.catalog, id, credential, s => createDatabase(s, input))) }
  passwordChange(id: string, credential: Credential, user: string, host: string, password: string) {
    return this.request(async () => {
      if (!user || !host || !password || /[\0\r\n]/.test(user + host)) throw new Error('Invalid user credentials')
      return mutateDatabase(this.catalog, id, credential, async s => { await s.query('ALTER USER ?@? IDENTIFIED BY ?', [user, host, password]); return true })
    })
  }
  backupDatabase(id: string, credential: Credential, databases: string[], destination: string) { return this.request(emit => backupDatabase(this.catalog, id, credential, databases, destination, emit)) }
  prepareInstances(request: CreateRequest) { return this.request(() => this.catalog.prepare(request)) }
  initializeInstance(id: string) { return this.request(emit => initializeInstance(this.catalog, id, emit)) }
  listInstances() { return this.request(() => this.runtime.listInstances()) }
  allInstalledVersions() { return this.request(async () => (await this.catalog.read()).instances.map(i => this.runtime.descriptor(i))) }
  startService(item: SoftInstalled, context: { id: string; credential?: Credential }) {
    return this.request(async emit => {
      const { spec } = await this.catalog.instance(context.id)
      if (item.bin !== this.catalog.paths(context.id).config) throw new Error('Instance identity mismatch')
      const result = await this.runtime.start(context.id, context.credential, emit)
      const version = { ...result.descriptor, pid: result.pid }
      return { 'APP-Service-Start-PID': result.pid, 'APP-Service-Start-Item': version, 'APP-Service-Stop-Args': [version, { id: spec.id }] }
    })
  }
  stopService(item: SoftInstalled, context?: any) {
    return this.request(async () => {
      const c = await this.catalog.read()
      const spec = c.instances.find(i => this.catalog.paths(i.id).config === item.bin)
      if (!spec || (context?.id && context.id !== spec.id)) throw new Error('Unknown instance identity')
      return { 'APP-Service-Stop-PID': await this.runtime.stop(spec.id, item.pid) }
    })
  }
}
export default new MysqlClusterModule()
