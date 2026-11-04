import {
  preparePackageCommand,
  prepareHomebrewInstall,
  cleanupPackageCommand,
  removeStaticPackage
} from './packages'
import { Base } from '@fork/module/Base'
import { ForkPromise } from '@shared/ForkPromise'
import { StopProcessListFetch, fetchStopProcessListLocal } from '@shared/StopProcessList'
import { join } from 'node:path'
import type { SoftInstalled } from '@shared/app'
import type { Credential, CreateRequest, EventSink } from '../shared'
import { InstanceCatalog } from './catalog'
import { MariadbInstanceRuntime } from './runtime'
import { InstanceStopAdapter } from './service'
import { initializeInstance } from './initialize'
import { ReplicationService } from './replication'
import type { Credentials } from '../shared'
import { readFile } from 'node:fs/promises'
import { writeAtomic } from './io'
import { validateConfigEdit } from './config'
import { listDatabases, mutateDatabase, createDatabase, backupDatabase, readLog } from './manage'
import type { DatabaseInput } from './manage'
import { validateCreateRequest } from '../policy'
import { MariadbClusterDbGate } from './dbgate'

export class MariadbClusterModule extends Base {
  private catalogValue?: InstanceCatalog
  private runtimeValue?: MariadbInstanceRuntime
  private replicationValue?: ReplicationService
  private dbGateValue?: MariadbClusterDbGate
  constructor() {
    super()
    this.type = 'mariadb-cluster'
  }
  get catalog() {
    return (this.catalogValue ??= new InstanceCatalog(
      join(global.Server.MariaDBDir!, 'mariadb-cluster'),
      process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux'
    ))
  }
  get runtime() {
    return (this.runtimeValue ??= new MariadbInstanceRuntime(this.catalog, {
      list: StopProcessListFetch,
      stop: async (spec, pid) => {
        const res: any = await new InstanceStopAdapter(this.catalog, spec).stopService({
          ...this.runtime.descriptor(spec),
          pid
        })
        return res['APP-Service-Stop-PID'] ?? []
      }
    }))
  }
  private get dbGate() {
    return (this.dbGateValue ??= new MariadbClusterDbGate(global.Server.BaseDir!, {
      // Companion lifetime observes what remains NOW, not a batch's original
      // stop-candidate table. Actual MariaDB termination keeps that original contract.
      listInstances: async () => this.runtime.listInstances(await fetchStopProcessListLocal()),
      stop: (id, pid) => this.runtime.stop(id, pid)
    }))
  }
  openDbGate(node: SoftInstalled) {
    return this.dbGate.open(node)
  }
  companionStopArgs(command: string, pid: string, _args: any[]): any[] | undefined {
    if (command === 'openDbGate') return [this.dbGate.descriptor(pid), { dbGateOnly: true }]
    return undefined
  }
  get replication() {
    return (this.replicationValue ??= new ReplicationService(this.catalog))
  }
  replicationStatus(id: string, credential: Credential) {
    return this.request(async () => {
      const { cluster } = await this.catalog.instance(id)
      return cluster.mode === 'replication'
        ? this.replication.status(id, credential)
        : { state: 'online', role: 'STANDALONE', lag: null }
    })
  }
  configureReplication(groupId: string, credentials: Credentials) {
    return this.request(async (emit) => {
      const group = (await this.catalog.read()).clusters.find((g) => g.id === groupId)
      if (!group || group.mode !== 'replication') throw new Error('Unknown replication group')
      return this.replication.configure(group, credentials, emit)
    })
  }
  request<T>(task: (emit: EventSink) => Promise<T>) {
    return new ForkPromise<T>(async (resolve, reject, on) => {
      try {
        resolve(await task((event) => on({ 'APP-Mariadb-Cluster-Progress': event })))
      } catch (error) {
        reject(error)
      }
    })
  }
  preparePackageCommand(source: string, name: string, installed: boolean) {
    return this.request(() =>
      preparePackageCommand(this.catalog.root, source, name, installed, {
        staticDir: global.Server.Static!,
        arm: process.arch === 'arm64'
      })
    )
  }
  prepareHomebrewInstall(language: string) {
    return this.request(() =>
      prepareHomebrewInstall(this.catalog.root, global.Server.Static!, language)
    )
  }
  cleanupPackageCommand(token: string) {
    return this.request(() => cleanupPackageCommand(this.catalog.root, token))
  }
  removeStaticPackage(target: string) {
    return this.request(() =>
      removeStaticPackage(this.catalog, target, global.Server.AppDir!, StopProcessListFetch, () =>
        this.runtime.listInstances()
      )
    )
  }
  readCatalog() {
    return this.request(() => this.catalog.read())
  }
  removeRecords(ids: string[]) {
    return this.request(async () => {
      await this.catalog.removeRecords(ids, async () => {
        const snapshots = await this.runtime.listInstances()
        if (
          ids.some(
            (id) => !snapshots.some((s) => s.id === id && ['stopped', 'missing'].includes(s.state))
          )
        )
          throw new Error('Confirm every member is stopped before removal')
      })
      return true
    })
  }
  updateInstances(input: CreateRequest) {
    return this.request(async () => {
      validateCreateRequest(input, this.catalog.platform)
      return this.catalog.update(input, async () => {
        const snapshots = await this.runtime.listInstances()
        if (
          input.instances.some(
            (i) => !snapshots.some((s) => s.id === i.id && s.state === 'stopped')
          )
        )
          throw new Error('Stop all members before editing')
      })
    })
  }

  readConfig(id: string) {
    return this.request(async () => {
      await this.catalog.instance(id)
      return readFile(this.catalog.paths(id).config, 'utf8')
    })
  }
  instanceFiles(id: string) {
    return this.request(async () => {
      await this.catalog.instance(id)
      const paths = this.catalog.paths(id)
      return {
        config: paths.config,
        errorLog: paths.error,
        slowLog: paths.slow,
        root: this.catalog.root
      }
    })
  }
  saveConfig(id: string, text: string) {
    return this.request(() =>
      this.catalog.operations.run(id, 'save-config', async () => {
        const { spec } = await this.catalog.instance(id)
        const file = this.catalog.paths(id).config
        validateConfigEdit(spec, text, await readFile(file, 'utf8'))
        await writeAtomic(file, text)
        return true
      })
    )
  }
  readLog(id: string, kind: 'error' | 'slow') {
    return this.request(() => readLog(this.catalog, id, kind))
  }
  getDatabasesWithUsers(id: string, credential: Credential) {
    return this.request(() => listDatabases(this.catalog, id, credential))
  }
  addDatabase(id: string, credential: Credential, input: DatabaseInput) {
    return this.request(() =>
      mutateDatabase(this.catalog, id, credential, (s) => createDatabase(s, input))
    )
  }
  passwordChange(id: string, credential: Credential, user: string, host: string, password: string) {
    return this.request(async () => {
      if (!user || !host || !password || /[\0\r\n]/.test(user + host))
        throw new Error('Invalid user credentials')
      return mutateDatabase(this.catalog, id, credential, async (s) => {
        await s.query('ALTER USER ?@? IDENTIFIED BY ?', [user, host, password])
        return true
      })
    })
  }
  backupDatabase(id: string, credential: Credential, databases: string[], destination: string) {
    return this.request((emit) =>
      backupDatabase(this.catalog, id, credential, databases, destination, emit)
    )
  }
  prepareInstances(request: CreateRequest) {
    return this.request(() => this.catalog.prepare(request))
  }
  initializeInstance(id: string) {
    return this.request((emit) => initializeInstance(this.catalog, id, emit))
  }
  listInstances() {
    return this.request(() => this.runtime.listInstances())
  }
  // Host scans must not treat instance descriptors as a selectable installation.
  allInstalledVersions() {
    return this.request(async () => [])
  }
  instanceDescriptors() {
    return this.request(async () =>
      (await this.catalog.read()).instances.map((i) => this.runtime.descriptor(i))
    )
  }
  startService(item: SoftInstalled, context: { id: string; credential?: Credential }) {
    return this.request(async (emit) => {
      const { spec } = await this.catalog.instance(context.id)
      if (item.bin !== this.catalog.paths(context.id).config)
        throw new Error('Instance identity mismatch')
      const result = await this.runtime.start(context.id, context.credential, emit)
      const version = { ...result.descriptor, pid: result.pid }
      return {
        'APP-Service-Start-PID': result.pid,
        'APP-Service-Start-Item': version,
        'APP-Service-Stop-Args': [version, { id: spec.id }]
      }
    })
  }
  stopService(item: SoftInstalled, context?: any) {
    return this.request(async () => {
      if (context?.dbGateOnly) {
        if (item.bin !== this.dbGate.descriptor().bin)
          throw new Error('Unknown DbGate companion identity')
        return { 'APP-Service-Stop-PID': await this.dbGate.stop(item.pid) }
      }
      const c = await this.catalog.read()
      const spec = c.instances.find((i) => this.catalog.paths(i.id).config === item.bin)
      if (!spec || (context?.id && context.id !== spec.id))
        throw new Error('Unknown instance identity')
      return { 'APP-Service-Stop-PID': await this.dbGate.stopInstance(spec.id, item.pid) }
    })
  }
}
export default new MariadbClusterModule()
