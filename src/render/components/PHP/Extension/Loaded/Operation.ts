import type { SoftInstalled } from '@shared/app'
import type { LoadedPhpExtension } from '@fork/module/Php/LoadedExtensions'

export class LoadedExtensionsController {
  list: Partial<Record<string, LoadedPhpExtension[]>> = {}
  fetching: Partial<Record<string, boolean>> = {}
  errors: Partial<Record<string, string>> = {}
  private pending = new Map<string, Promise<void>>()

  constructor(private readonly read: (version: SoftInstalled) => Promise<LoadedPhpExtension[]>) {}

  load(version: SoftInstalled, refresh = false): Promise<void> {
    const key = version.bin
    const pending = this.pending.get(key)
    if (pending) return pending
    if (!refresh && this.list[key]) return Promise.resolve()
    const snapshot = JSON.parse(JSON.stringify(version)) as SoftInstalled
    this.fetching[key] = true
    delete this.errors[key]
    const operation = Promise.resolve()
      .then(() => this.read(snapshot))
      .then((rows) => {
        this.list[key] = rows
      })
      .catch((error: unknown) => {
        this.errors[key] = error instanceof Error ? error.message : String(error)
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
