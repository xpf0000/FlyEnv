import type { SoftInstalled } from '@shared/app'
import type { LoadedPhpExtension } from '@fork/module/Php/LoadedExtensions'

export class LoadedExtensionsController {
  list: Partial<Record<string, LoadedPhpExtension[]>> = {}
  fetching: Partial<Record<string, boolean>> = {}
  errors: Partial<Record<string, string>> = {}
  private pending = new Map<string, Promise<void>>()
  private refreshes = new Set<string>()

  constructor(private readonly read: (version: SoftInstalled) => Promise<LoadedPhpExtension[]>) {}

  load(version: SoftInstalled, refresh = false): Promise<void> {
    const key = version.bin
    const pending = this.pending.get(key)
    if (pending) {
      if (refresh) this.refreshes.add(key)
      return pending
    }
    if (!refresh && this.list[key]) return Promise.resolve()
    const snapshot = JSON.parse(JSON.stringify(version)) as SoftInstalled
    this.fetching[key] = true
    delete this.errors[key]
    const operation = Promise.resolve()
      .then(async () => {
        do {
          this.refreshes.delete(key)
          try {
            const rows = await this.read(snapshot)
            if (!this.refreshes.has(key)) {
              this.list[key] = rows
              delete this.errors[key]
            }
          } catch (error: unknown) {
            if (!this.refreshes.has(key))
              this.errors[key] = error instanceof Error ? error.message : String(error)
          }
        } while (this.refreshes.has(key))
      })
      .finally(() => {
        delete this.fetching[key]
        this.pending.delete(key)
      })
    this.pending.set(key, operation)
    return operation
  }

  reFetch(version: SoftInstalled): Promise<void> {
    return this.load(version, true)
  }
}
