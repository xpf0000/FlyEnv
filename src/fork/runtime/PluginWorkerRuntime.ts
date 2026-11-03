import { DataRootLease, type Lease } from './DataRootLease'
import PluginLoader from '../PluginLoader'
import type { PluginRuntimeDescriptor } from '@shared/plugin/PluginRuntime'

type RuntimeModule = {
  initialize(descriptor: PluginRuntimeDescriptor): Promise<void>
  exec(method: string, ...args: unknown[]): any
  close(): Promise<void>
}
export class PluginWorkerRuntime {
  private state: 'new' | 'starting' | 'ready' | 'closing' | 'closed' = 'new'
  private lease?: Lease
  private target?: RuntimeModule
  private descriptor?: PluginRuntimeDescriptor
  private initializing?: Promise<void>
  private closing?: Promise<void>
  private readonly pending = new Set<Promise<unknown>>()
  private readonly dependencies: {
    acquire(root: string): Promise<Lease>
    load(module: string): Promise<RuntimeModule | undefined>
  }

  constructor(dependencies?: PluginWorkerRuntime['dependencies']) {
    const loader = new PluginLoader()
    this.dependencies = dependencies ?? {
      acquire: (root) => DataRootLease.acquire(root),
      load: (module) => loader.load(module, true)
    }
  }
  initialize(descriptor: PluginRuntimeDescriptor) {
    if (this.state !== 'new') return Promise.reject(new Error('plugin_initialization_failed'))
    this.state = 'starting'
    this.descriptor = { ...descriptor }
    return (this.initializing = (async () => {
      try {
        this.lease = await this.dependencies.acquire(descriptor.dataRoot)
        this.target = await this.dependencies.load(descriptor.moduleId)
        if (
          !this.target ||
          typeof this.target.initialize !== 'function' ||
          typeof this.target.exec !== 'function' ||
          typeof this.target.close !== 'function'
        )
          throw new Error('invalid_runtime')
        await this.target.initialize({ ...descriptor, dataRoot: this.lease.dataRoot })
        if (this.state === 'starting') this.state = 'ready'
      } catch {
        this.state = 'closed'
        try {
          await this.target?.close?.()
        } finally {
          await this.lease?.release()
        }
        throw new Error('plugin_initialization_failed')
      }
    })())
  }
  dispatch(
    module: string,
    method: string,
    args: unknown[],
    on?: (...args: any[]) => void
  ): Promise<any> {
    if (this.state !== 'ready' || module !== this.descriptor?.moduleId)
      return Promise.reject(new Error('plugin_not_ready'))
    if (
      !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(method) ||
      ['constructor', 'prototype', 'init', 'initialize', 'close'].includes(method)
    )
      return Promise.reject(new Error('plugin_invalid_method'))
    const task = (async () => {
      const operation = this.target!.exec(method, ...args)
      if (typeof operation?.on === 'function' && on) operation.on(on)
      return await operation
    })()
    this.pending.add(task)
    void task.finally(() => this.pending.delete(task)).catch(() => {})
    return task
  }
  close() {
    if (this.closing) return this.closing
    const wasClosed = this.state === 'closed'
    this.state = 'closing'
    return (this.closing = (async () => {
      await this.initializing?.catch(() => {})
      await Promise.allSettled([...this.pending])
      if (!wasClosed && this.state !== 'closed') {
        // If close fails, retain the lease until OS exit; no second live owner can open the data.
        await this.target?.close()
        await this.lease?.release()
      }
      this.state = 'closed'
    })())
  }
}
