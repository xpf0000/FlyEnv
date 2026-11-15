import { randomUUID } from 'node:crypto'
import type { MemoryResult, ProjectRelinkInput, ProjectRelinkReceipt } from '../shared'
import { MemoryEngine } from './MemoryEngine'
import {
  createMemoryBackup,
  recoverMemoryRestore,
  restoreMemoryBackup,
  RestoreFailure,
  type MaintenanceReceipt
} from './memory-backup'

type Operations = { backup: typeof createMemoryBackup; restore: typeof restoreMemoryBackup }
/** One data owner. Normal calls remain concurrent; maintenance is an exclusive barrier. */
export class MemoryWorkspace {
  private engine: MemoryEngine
  private barrier: Promise<void> = Promise.resolve()
  private readonly active = new Set<Promise<unknown>>()
  private readonly receipts = new Map<
    string,
    {
      kind: string
      path: string
      promise: Promise<MemoryResult<MaintenanceReceipt>>
      complete: boolean
    }
  >()
  private closing = false
  private unavailable = false
  private closed?: Promise<void>
  private constructor(
    readonly dataRoot: string,
    private readonly operations: Operations
  ) {
    this.engine = new MemoryEngine(dataRoot)
  }
  static async open(root: string, operations: Partial<Operations> = {}) {
    await recoverMemoryRestore(root)
    return new MemoryWorkspace(root, {
      backup: createMemoryBackup,
      restore: restoreMemoryBackup,
      ...operations
    })
  }
  run<T>(work: (engine: MemoryEngine) => Promise<T>): Promise<T> {
    if (this.closing || this.unavailable)
      return Promise.reject(new Error(this.closing ? 'engine_closed' : 'restore_recovery_required'))
    const task = this.barrier.then(() => {
      if (this.unavailable) throw new Error('restore_recovery_required')
      return work(this.engine)
    })
    this.active.add(task)
    void task.then(
      () => this.active.delete(task),
      () => this.active.delete(task)
    )
    return task
  }
  relinkProject(raw: ProjectRelinkInput): Promise<MemoryResult<ProjectRelinkReceipt>> {
    let input: ProjectRelinkInput
    try {
      input = structuredClone(raw)
    } catch {
      return Promise.resolve({ outcome: 'failed', error_code: 'invalid_input' })
    }
    if (this.closing || this.unavailable)
      return Promise.resolve({
        outcome: 'failed',
        error_code: this.closing ? 'engine_closed' : 'restore_recovery_required'
      })
    const task = Promise.allSettled([this.barrier, ...this.active]).then(() =>
      this.engine.relinkProject(input)
    )
    this.barrier = task.then(
      () => {},
      () => {}
    )
    return task
  }
  private maintain(
    work: () => Promise<MaintenanceReceipt>
  ): Promise<MemoryResult<MaintenanceReceipt>> {
    if (this.closing || this.unavailable)
      return Promise.resolve({
        outcome: 'failed',
        error_code: this.closing ? 'engine_closed' : 'restore_recovery_required'
      })
    const preceding = [this.barrier, ...this.active]
    const task = Promise.allSettled(preceding).then(
      async (): Promise<MemoryResult<MaintenanceReceipt>> => {
        if (this.unavailable) return { outcome: 'failed', error_code: 'restore_recovery_required' }
        await this.engine.close()
        try {
          return { outcome: 'success', data: await work() }
        } catch (error) {
          return {
            outcome: 'failed',
            error_code:
              error instanceof Error && /^(backup_[a-z_]+|restore_[a-z_]+)$/.test(error.message)
                ? error.message
                : 'maintenance_failed',
            ...(error instanceof RestoreFailure && error.receipt
              ? { data: { ...error.receipt, safetyBackupPath: error.receipt.path } }
              : {})
          }
        } finally {
          try {
            await recoverMemoryRestore(this.dataRoot)
            this.engine = new MemoryEngine(this.dataRoot)
          } catch {
            this.unavailable = true
          }
        }
      }
    )
    this.barrier = task.then(
      () => {},
      () => {}
    )
    return task
  }
  private operation(kind: 'backup' | 'restore', path: string, id: string) {
    if (typeof path !== 'string' || typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id))
      return Promise.resolve<MemoryResult<MaintenanceReceipt>>({
        outcome: 'failed',
        error_code: 'invalid_input'
      })
    const existing = this.receipts.get(id)
    if (existing)
      return existing.kind === kind && existing.path === path
        ? existing.promise
        : Promise.resolve<MemoryResult<MaintenanceReceipt>>({
            outcome: 'conflict',
            error_code: 'invalid_input'
          })
    const promise = this.maintain(() =>
      kind === 'backup'
        ? this.operations.backup(this.dataRoot, path)
        : this.operations.restore(this.dataRoot, path)
    )
    const receipt = { kind, path, promise, complete: false }
    this.receipts.set(id, receipt)
    void promise.then(() => {
      receipt.complete = true
      for (const [key, value] of this.receipts)
        if (this.receipts.size > 100 && value.complete) this.receipts.delete(key)
    })
    return promise
  }
  backup(parent: string, id = randomUUID()) {
    return this.operation('backup', parent, id)
  }
  restore(source: string, id = randomUUID()) {
    return this.operation('restore', source, id)
  }
  result(id: string) {
    return (
      this.receipts.get(id)?.promise ??
      Promise.resolve<MemoryResult<MaintenanceReceipt>>({
        outcome: 'unknown',
        error_code: 'maintenance_result_unavailable'
      })
    )
  }
  close() {
    if (!this.closed) {
      this.closing = true
      this.closed = Promise.allSettled([this.barrier, ...this.active]).then(() =>
        this.engine.close()
      )
    }
    return this.closed
  }
}
