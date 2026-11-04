import { Module } from '@/core/Module/Module'
import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
import type { SoftInstalled } from '@shared/app'
import { join } from '@/util/path-browserify'
import type { MysqlClusterController } from '../controller'
import type { OperationResult } from '../../shared'

type StartupController = Pick<
  MysqlClusterController,
  | 'catalog'
  | 'snapshots'
  | 'operations'
  | 'initialized'
  | 'loadError'
  | 'load'
  | 'refresh'
  | 'runGroup'
> & {
  readonly allBusy?: boolean
  runAll?(action: 'start' | 'stop', interactive?: boolean): Promise<OperationResult>
}

function lifecycleResult(result: OperationResult): string | boolean {
  if (result.status === 'completed') return true
  return (
    result.items
      .filter((item) => item.status !== 'completed')
      .map((item) => `${item.id}: ${item.error || item.status}`)
      .join('\n') || result.status
  )
}

/** A host StartupGroup member represents a complete saved cluster, never an engine install. */
class ClusterStartupTarget {
  readonly typeFlag = 'mysql-cluster'
  readonly num = 0
  readonly source = 'Static'
  private readonly owner!: MysqlClusterStartupModule

  constructor(
    readonly id: string,
    owner: MysqlClusterStartupModule
  ) {
    Object.defineProperty(this, 'owner', { value: owner, enumerable: false })
  }

  private get group() {
    return this.owner.controller.catalog.clusters.find((group) => group.id === this.id)
  }

  get enable() {
    return this.owner.active && !!this.group
  }

  get version() {
    const group = this.group
    if (!group) return this.id
    const versions = [
      ...new Set(
        this.owner.controller.catalog.instances
          .filter((instance) => group.memberIds.includes(instance.id))
          .map((instance) => instance.engine.version)
      )
    ]
    return `${group.name} · MySQL ${versions.join(', ')}`
  }

  // The service adapter compares identity strings; unlike project targets it does
  // not test filesystem existence. This ID path stays stable across group edits.
  get path() {
    return join(this.owner.root, 'mysql-cluster', 'clusters', this.id)
  }

  get bin() {
    return this.path
  }

  get run() {
    // The host has a binary service state. Any-running keeps partially running
    // clusters stoppable. Its runner consequently skips start on a partial group;
    // stopping then starting restores every member. Do not claim fill-up semantics.
    return (
      this.group?.memberIds.some(
        (id) => this.owner.controller.snapshots[id]?.state === 'running'
      ) ?? false
    )
  }

  set run(_value: boolean) {
    // Host MCP synchronizes ordinary installation entries by bin. A cluster's
    // process truth belongs to the plugin controller, not that projection write.
  }

  get pid() {
    return ''
  }

  set pid(_value: string) {
    // A cluster has multiple process IDs, all owned by its real service entries.
  }

  get running() {
    const controller = this.owner.controller
    return (
      !!controller.allBusy ||
      !!controller.operations[this.id]?.busy ||
      (this.group?.memberIds.some((id) => controller.operations[id]?.busy) ?? false)
    )
  }

  toJSON() {
    return {
      typeFlag: this.typeFlag,
      id: this.id,
      version: this.version,
      bin: this.bin,
      path: this.path,
      num: this.num,
      source: this.source,
      enable: this.enable,
      run: this.run,
      running: this.running,
      pid: this.pid
    }
  }

  start(interactive = true) {
    return this.execute('start', interactive)
  }

  stop(interactive = true) {
    return this.execute('stop', interactive)
  }

  private async execute(action: 'start' | 'stop', interactive: boolean): Promise<string | boolean> {
    try {
      if (!this.owner.active || !this.group) throw new Error('Cluster is unavailable')
      if (action === 'start' && !this.owner.visible()) throw new Error('The module is hidden')
      return lifecycleResult(await this.owner.controller.runGroup(this.group, action, interactive))
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }
}

/** Owns only the host projection; actual node lifecycle remains ModuleInstalledItem. */
export class MysqlClusterStartupModule extends Module {
  readonly typeFlag = 'mysql-cluster'
  readonly isService = true
  readonly isPlugin = true
  readonly isOnlyRunOne = false
  active = true
  private targets = new Map<string, ClusterStartupTarget>()
  private fetchFlight?: Promise<boolean>

  readonly controller!: StartupController

  constructor(
    controller: StartupController,
    private readonly dataReady: () => boolean,
    readonly visible: () => boolean,
    readonly root: string
  ) {
    super()
    Object.defineProperty(this, 'controller', { value: controller, enumerable: false })
  }

  private syncTargets() {
    const next = new Map<string, ClusterStartupTarget>()
    for (const group of this.controller.catalog.clusters) {
      next.set(group.id, this.targets.get(group.id) ?? new ClusterStartupTarget(group.id, this))
    }
    this.targets = next
    this.installed.splice(
      0,
      this.installed.length,
      ...([...next.values()] as unknown as ModuleInstalledItem[])
    )
  }

  fetchInstalled(): Promise<boolean> {
    if (!this.active || !this.dataReady()) return Promise.resolve(false)
    if (this.fetchFlight) return this.fetchFlight
    this.fetchInstalleding = true
    this.fetchFlight = Promise.resolve()
      .then(async () => {
        if (this.controller.initialized) await this.controller.refresh()
        else await this.controller.load()
        if (!this.active) return false
        this.syncTargets()
        this.installedFetched = true
        return true
      })
      .catch((error) => {
        // Host candidate discovery scans modules sequentially. A plugin catalog
        // failure invalidates only this projection, preserving sibling services.
        this.installedFetched = false
        this.installed.splice(0)
        this.targets.clear()
        this.controller.loadError = error instanceof Error ? error.message : String(error)
        return false
      })
      .finally(() => {
        this.fetchInstalleding = false
        this.fetchFlight = undefined
      })
    return this.fetchFlight
  }

  async applyInstalledVersions(_installed: SoftInstalled[]) {
    // Host installation notifications are not the cluster catalog. Never invoke
    // generic applyInstalledVersions/resetCurrentVersion or persist shared state.
    if (this.active) this.syncTargets()
  }

  resetCurrentVersion(_autoSave = false) {
    return false
  }

  watchShowHide() {
    // manager.registerLifecycle owns the singleton visibility watcher; the host
    // invokes this hook repeatedly, so it must not create generic Module watchers.
  }

  start(interactive = true) {
    return this.executeAll('start', interactive)
  }

  stop(interactive = true) {
    return this.executeAll('stop', interactive)
  }

  private async executeAll(
    action: 'start' | 'stop',
    interactive: boolean
  ): Promise<string | boolean> {
    try {
      if (!this.active) throw new Error('Cluster module is unavailable')
      if (action === 'start' && !this.visible()) throw new Error('The module is hidden')
      if (!this.controller.runAll) throw new Error('Cluster lifecycle is unavailable')
      return lifecycleResult(await this.controller.runAll(action, interactive))
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  dispose() {
    this.active = false
    this.installed.splice(0)
    this.targets.clear()
  }
}
