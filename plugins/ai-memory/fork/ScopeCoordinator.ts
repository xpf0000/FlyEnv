import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { ResolvedScope } from '../shared'
import { MemoryFault } from '../core/validation'

export type ScopeUncertainty = {
  id: string
  operation: 'store' | 'update' | 'forget'
  request_id: string
  request_digest: string
}
type State = {
  scope: ResolvedScope
  epoch: string
  revision: number
  references: number
  queued: number
  active: number
  tail: Promise<void>
  unknown?: ScopeUncertainty
}
export class ScopeLease {
  private active = true
  constructor(
    private readonly state: State,
    private readonly keep: () => () => void
  ) {}
  get scope() {
    this.assertActive()
    return this.state.scope
  }
  get generation() {
    this.assertActive()
    return `${this.state.epoch}:${this.state.revision}`
  }
  get unknown() {
    this.assertActive()
    return this.state.unknown ? { ...this.state.unknown } : undefined
  }
  assertActive() {
    if (!this.active) throw new MemoryFault('scope_lease_expired')
  }
  retain() {
    this.assertActive()
    return this.keep()
  }
  publishChange() {
    this.assertActive()
    this.state.revision++
  }
  markUnknown(value: ScopeUncertainty) {
    this.assertActive()
    this.state.unknown = { ...value }
    this.publishChange()
  }
  clearUnknown() {
    this.assertActive()
    this.state.unknown = undefined
    this.publishChange()
  }
  finish() {
    this.active = false
  }
}

/** Queue identity survives cache eviction and uncertain commits. Helpers consume one active lease. */
export class ScopeCoordinator {
  private readonly states = new Map<string, State>()
  private readonly context = new AsyncLocalStorage<Set<string>>()
  private closing = false
  get size() {
    return this.states.size
  }
  private state(scope: ResolvedScope) {
    let state = this.states.get(scope.key)
    if (state) {
      if (state.scope.directory !== scope.directory || state.scope.projectId !== scope.projectId)
        throw new MemoryFault('scope_identity_mismatch')
    } else {
      if (this.closing) throw new MemoryFault('scope_coordinator_closed')
      state = {
        scope: Object.freeze({ ...scope }),
        epoch: randomUUID(),
        revision: 0,
        references: 0,
        queued: 0,
        active: 0,
        tail: Promise.resolve()
      }
      this.states.set(scope.key, state)
    }
    return state
  }
  private reclaim(state: State) {
    if (
      !state.references &&
      !state.queued &&
      !state.active &&
      !state.unknown &&
      this.states.get(state.scope.key) === state
    )
      this.states.delete(state.scope.key)
  }
  retain(scope: ResolvedScope): () => void {
    const state = this.state(scope)
    state.references++
    let released = false
    return () => {
      if (released) return
      released = true
      state.references--
      this.reclaim(state)
    }
  }
  isIdle(key: string) {
    const state = this.states.get(key)
    return !state || (!state.active && !state.queued && !state.unknown)
  }
  run<T>(scope: ResolvedScope, work: (lease: ScopeLease) => Promise<T> | T): Promise<T> {
    if (this.closing) return Promise.reject(new MemoryFault('scope_coordinator_closed'))
    const parent = this.context.getStore()
    if (parent?.has(scope.key)) return Promise.reject(new MemoryFault('nested_scope_operation'))
    const state = this.state(scope)
    state.queued++
    const task = state.tail.then(() =>
      this.context.run(new Set([...(parent ?? []), scope.key]), async () => {
        state.queued--
        state.active++
        const lease = new ScopeLease(state, () => this.retain(state.scope))
        try {
          return await work(lease)
        } finally {
          lease.finish()
          state.active--
          this.reclaim(state)
        }
      })
    )
    state.tail = task.then(
      () => {},
      () => {}
    )
    return task
  }
  async close() {
    this.closing = true
    await Promise.all([...this.states.values()].map((state) => state.tail))
  }
}
