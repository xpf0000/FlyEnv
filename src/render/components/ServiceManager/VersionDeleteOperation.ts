import {
  FORCE_DELETE_CONFIRMATION,
  type ManagedVersionDirectory,
  type VersionDeleteTarget
} from '@shared/VersionDelete'
import type { AllAppModule } from '@/core/type'

export type VersionDeleteRequest = VersionDeleteTarget & { typeFlag: AllAppModule; version: string }

type Dependencies = {
  inspect: (target: VersionDeleteTarget) => Promise<ManagedVersionDirectory | undefined>
  remove: (target: ManagedVersionDirectory, confirmation: string) => Promise<void>
  stop: (target: VersionDeleteRequest) => Promise<string | boolean>
  committed: (target: VersionDeleteRequest) => void
  refresh: (target: VersionDeleteRequest) => Promise<void>
  error: (message: string) => void
  refreshError: (error: unknown) => void
}

export class VersionDeleteOperation {
  private operations = new Map<string, Promise<boolean>>()

  constructor(private deps: Dependencies) {}

  async inspect(target: VersionDeleteTarget) {
    try {
      return await this.deps.inspect({ ...target })
    } catch {
      return undefined
    }
  }

  isDeleting(path: string) {
    return this.operations.has(path)
  }

  remove(
    request: VersionDeleteRequest,
    directory: ManagedVersionDirectory,
    confirmation: string,
    onDone: () => void
  ): Promise<boolean> {
    if (confirmation !== FORCE_DELETE_CONFIRMATION) return Promise.resolve(false)
    const snapshot = { ...request }
    const expected = { ...directory }
    let operation = this.operations.get(expected.path)
    if (!operation) {
      operation = Promise.resolve()
        .then(async () => {
          // Check before stopping, then check again in main immediately before removal.
          const current = await this.inspect(snapshot)
          if (!current || current.identity !== expected.identity) {
            throw new Error('The version directory changed or is not managed by FlyEnv')
          }
          const stopped = await this.deps.stop(snapshot)
          if (stopped !== true) throw new Error(String(stopped))
          await this.deps.remove(expected, confirmation)
          // Deletion has completed. Refresh/metadata failures cannot undo it or authorize a replay.
          let supplementaryFailure: unknown
          try {
            this.deps.committed(snapshot)
          } catch (error) {
            supplementaryFailure = error
          }
          try {
            await this.deps.refresh(snapshot)
          } catch (error) {
            supplementaryFailure ??= error
          }
          if (supplementaryFailure) this.deps.refreshError(supplementaryFailure)
          return true
        })
        .catch((error: unknown) => {
          this.deps.error(error instanceof Error ? error.message : String(error))
          return false
        })
        .finally(() => this.operations.delete(expected.path))
      this.operations.set(expected.path, operation)
    }
    return operation.finally(() => {
      try {
        onDone()
      } catch (error) {
        console.error('Version deletion completion callback failed', error)
      }
    })
  }
}
