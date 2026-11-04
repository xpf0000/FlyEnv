import { mkdir, realpath } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { ForkPromise } from '@shared/ForkPromise'
import type { ForkPluginSnapshot, PluginRuntimeDescriptor } from '@shared/plugin/PluginRuntime'

export interface PluginWorker {
  actualExit: Promise<void>
  initializePlugin(descriptor: PluginRuntimeDescriptor): Promise<void>
  send(...args: any[]): ForkPromise<any>
  closeAndWait(): Promise<void>
}
type Owner = {
  descriptor: PluginRuntimeDescriptor
  worker: PluginWorker
  state: 'starting' | 'ready' | 'stopping'
  ready: Promise<void>
  closing?: Promise<void>
}

/** One owner per canonical data root. Installation/worker generations are dispatch guards only. */
export class PluginWorkerRegistry {
  private readonly owners = new Map<string, Owner>()
  private readonly opening = new Map<string, Promise<Owner>>()
  private readonly gates = new Map<string, string>()
  private closing = false

  constructor(
    private readonly snapshot: () => ForkPluginSnapshot,
    private readonly create: () => PluginWorker
  ) {}

  isDedicated(module: string) {
    return this.snapshot()[module]?.runtime?.mode === 'dedicated'
  }
  workers() {
    return [...this.owners.values()].map((owner) => owner.worker)
  }
  beginShutdown() {
    this.closing = true
  }

  private current(module: string) {
    const info = this.snapshot()[module]
    if (!info?.runtime || !info.dataRoot || !info.installGeneration)
      throw new Error('plugin_unavailable')
    if (this.closing || this.gates.get(module) === info.installGeneration)
      throw new Error('plugin_closed_or_stopping')
    return info
  }

  private owner(module: string): Promise<Owner> {
    let info: ReturnType<PluginWorkerRegistry['current']>
    try {
      info = this.current(module)
    } catch (error) {
      return Promise.reject(error)
    }
    const key = `${module}:${info.installGeneration}`
    const pending = this.opening.get(key)
    if (pending) return pending
    const opening = (async () => {
      await mkdir(info.dataRoot!, { recursive: true, mode: 0o700 })
      const dataRoot = await realpath(info.dataRoot!)
      if (this.current(module).installGeneration !== info.installGeneration)
        throw new Error('plugin_stale_generation')
      let owner = this.owners.get(dataRoot)
      if (owner) {
        if (owner.state === 'stopping') throw new Error('plugin_owner_stopping')
        if (
          owner.descriptor.moduleId !== module ||
          owner.descriptor.installGeneration !== info.installGeneration
        )
          throw new Error('plugin_owner_busy')
      } else {
        const descriptor = {
          pluginId: info.id,
          moduleId: module,
          dataRoot,
          installGeneration: info.installGeneration!,
          workerGeneration: randomUUID()
        }
        const worker = this.create()
        owner = { descriptor, worker, state: 'starting', ready: Promise.resolve() }
        this.owners.set(dataRoot, owner)
        const created = owner
        void worker.actualExit.then(() => {
          created.state = 'stopping'
          if (this.owners.get(dataRoot) === created) this.owners.delete(dataRoot)
        })
        owner.ready = worker.initializePlugin(descriptor).then(
          () => {
            if (created.state !== 'stopping') created.state = 'ready'
          },
          async () => {
            // Failed startup may still own resources. No replacement until confirmed exit.
            await this.stop(created)
            throw new Error('plugin_initialization_failed')
          }
        )
      }
      await owner.ready
      if (owner.state !== 'ready') throw new Error('plugin_owner_stopping')
      if (this.current(module).installGeneration !== info.installGeneration)
        throw new Error('plugin_stale_generation')
      return owner
    })()
    this.opening.set(key, opening)
    void opening
      .finally(() => {
        if (this.opening.get(key) === opening) this.opening.delete(key)
      })
      .catch(() => {})
    return opening
  }

  async capture(module: string): Promise<PluginRuntimeDescriptor> {
    return { ...(await this.owner(module)).descriptor }
  }

  dispatch(
    module: string,
    method: string,
    args: unknown[],
    expected?: PluginRuntimeDescriptor,
    assertCurrent?: () => void
  ) {
    return new ForkPromise<any>(async (resolve, reject, on) => {
      const owner = await this.owner(module)
      if (
        expected &&
        (expected.installGeneration !== owner.descriptor.installGeneration ||
          expected.workerGeneration !== owner.descriptor.workerGeneration ||
          expected.pluginId !== owner.descriptor.pluginId)
      ) {
        reject(new Error('plugin_stale_generation'))
        return
      }
      // No await between the final gate and the actual dispatch.
      this.current(module)
      if (owner.state !== 'ready') throw new Error('plugin_owner_stopping')
      assertCurrent?.()
      owner.worker
        .send(module, method, ...args)
        .on(on)
        .then(resolve, reject)
    })
  }

  private stop(owner: Owner) {
    owner.state = 'stopping'
    return (owner.closing ??= owner.worker.closeAndWait())
  }

  async close(module: string) {
    const info = this.snapshot()[module]
    if (info?.installGeneration) this.gates.set(module, info.installGeneration)
    // Closing the gate precedes any asynchronous path resolution or initialization.
    const stops = [...this.owners.values()]
      .filter((owner) => owner.descriptor.moduleId === module)
      .map((owner) => this.stop(owner))
    const openings = [...this.opening.entries()]
      .filter(([key]) => key.startsWith(`${module}:`))
      .map(([, task]) => task.catch(() => undefined))
    const results = await Promise.allSettled([...stops, ...openings])
    const failed = results.find((result) => result.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
  }

  /** Re-enable lazy dispatch only after an aborted change has restored its old installation. */
  async reopen(module: string) {
    if (this.closing) throw new Error('plugin_closed_or_stopping')
    const generation = this.gates.get(module)
    if (!generation) return
    if (this.snapshot()[module]?.installGeneration !== generation)
      throw new Error('plugin_stale_generation')
    if (
      [...this.owners.values()].some((owner) => owner.descriptor.moduleId === module) ||
      [...this.opening.keys()].some((key) => key.startsWith(`${module}:`))
    )
      throw new Error('plugin_owner_stopping')
    this.gates.delete(module)
  }

  async closeAll() {
    this.beginShutdown()
    const modules = new Set([
      ...Object.keys(this.snapshot()),
      ...[...this.owners.values()].map((owner) => owner.descriptor.moduleId)
    ])
    const results = await Promise.allSettled([...modules].map((module) => this.close(module)))
    if (results.some((result) => result.status === 'rejected'))
      throw new Error('plugin_exit_timeout')
  }
}
