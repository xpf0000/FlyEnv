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
