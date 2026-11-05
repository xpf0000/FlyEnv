import type { SoftInstalled } from '@shared/app'
import type {
  ExtensionCatalog,
  ExtensionInstallResult,
  ExtensionPackage,
  PhpExtensionProfile
} from '@fork/module/Php.win/WindowsExtensions'
import type { ExtensionPreparation } from '@fork/module/Php.win/ExtensionSources'

export type ExtensionOperation = {
  type: 'install' | 'disable'
  name: string
  status: 'running' | 'success' | 'warning' | 'error'
  error?: string
}

export type ExtensionEntry = {
  fetching: boolean
  preparing: boolean
  preparation?: ExtensionPreparation
  installing: boolean
  profile?: PhpExtensionProfile
  packages: ExtensionPackage[]
  partial: boolean
  lastQuery: string
  log: string
  error: string
  result?: ExtensionInstallResult
  operation?: ExtensionOperation
  operationPreparation?: ExtensionPreparation
  operationRelease?: string
}
type Dependencies = {
  request: <T>(method: string, args: unknown[], onProgress?: (text: string) => void) => Promise<T>
  notice: (kind: 'success' | 'warning' | 'error', text: string) => void
  refresh: (version: SoftInstalled) => void
  successMessage: () => string
  disabledMessage?: () => string
}

export class WindowsExtensionController {
  entries: Record<string, ExtensionEntry> = {}
  installingBin = ''
  private searches = new Map<string, Promise<void>>()
  private queries = new Map<string, string>()
  private preparations = new Map<string, Promise<ExtensionPreparation | undefined>>()
  private preparationGeneration = new Map<string, number>()
  private preparationCount = new Map<string, number>()
  private refreshRequests = new Set<string>()

  constructor(private readonly dependencies: Dependencies) {}

  private notice(kind: 'success' | 'warning' | 'error', text: string) {
    try {
      this.dependencies.notice(kind, text)
    } catch {
      /* notices cannot change the operation result */
    }
  }

  entry(version: SoftInstalled): ExtensionEntry {
    return (
      this.entries[version.bin] ??
      (this.entries[version.bin] = {
        fetching: false,
        preparing: false,
        installing: false,
        packages: [],
        partial: false,
        lastQuery: '',
        log: '',
        error: ''
      })
    )
  }

  prepare(
    version: SoftInstalled,
    name: string,
    release?: string
  ): Promise<ExtensionPreparation | undefined> {
    const entry = this.entry(version)
    if (this.installingBin || entry.installing || entry.fetching) return Promise.resolve(undefined)
    const key = `${version.bin}\n${name}\n${release ?? ''}`
    const pending = this.preparations.get(key)
    if (pending) return pending
    const snapshot = JSON.parse(JSON.stringify(version)) as SoftInstalled
    const generation = (this.preparationGeneration.get(version.bin) ?? 0) + 1
    this.preparationGeneration.set(version.bin, generation)
    this.preparationCount.set(version.bin, (this.preparationCount.get(version.bin) ?? 0) + 1)
    entry.preparing = true
    entry.error = ''
    const operation = Promise.resolve()
      .then(() =>
        this.dependencies.request<ExtensionPreparation>(
          'windowsExtensionPrepare',
          release ? [snapshot, name, release] : [snapshot, name]
        )
      )
      .then((result) => {
        if (this.preparationGeneration.get(version.bin) === generation) {
          entry.preparation = result
          entry.profile = result.profile
        }
        return result
      })
      .catch((error: unknown) => {
        if (this.preparationGeneration.get(version.bin) === generation) {
          entry.error = error instanceof Error ? error.message : String(error)
          this.notice('error', entry.error)
        }
        return undefined
      })
      .finally(() => {
        const count = (this.preparationCount.get(version.bin) ?? 1) - 1
        this.preparationCount.set(version.bin, count)
        entry.preparing = count > 0
        this.preparations.delete(key)
      })
    this.preparations.set(key, operation)
    return operation
  }

  load(version: SoftInstalled) {
    const entry = this.entry(version)
    if (!entry.fetching && !entry.installing && !entry.preparing)
      this.search(version, entry.lastQuery)
  }

  search(version: SoftInstalled, query: string, refresh = false): Promise<void> {
    const entry = this.entry(version)
    const pending = this.searches.get(version.bin)
    if (this.installingBin || entry.installing || entry.preparing) return Promise.resolve()
    this.queries.set(version.bin, query)
    entry.lastQuery = query
    if (refresh) this.refreshRequests.add(version.bin)
    if (pending) return pending
    const snapshot = JSON.parse(JSON.stringify(version)) as SoftInstalled
    entry.fetching = true
    entry.error = ''
    const operation = Promise.resolve()
      .then(async () => {
        do {
          query = this.queries.get(snapshot.bin) ?? ''
          try {
            const forceRefresh = this.refreshRequests.delete(snapshot.bin)
            const catalog = await this.dependencies.request<ExtensionCatalog>(
              'windowsExtensionCatalog',
              forceRefresh ? [snapshot, query, true] : [snapshot, query]
            )
            if (query === this.queries.get(snapshot.bin)) {
              entry.profile = catalog.profile
              entry.packages = catalog.packages
              entry.partial = catalog.partial
              entry.error = ''
            }
          } catch (error: unknown) {
            if (query === this.queries.get(snapshot.bin)) {
              entry.error = error instanceof Error ? error.message : String(error)
              this.notice('error', entry.error)
            }
          }
        } while (query !== this.queries.get(snapshot.bin) || this.refreshRequests.has(snapshot.bin))
      })
      .finally(() => {
        entry.fetching = false
        this.searches.delete(snapshot.bin)
        this.queries.delete(snapshot.bin)
        this.refreshRequests.delete(snapshot.bin)
      })
    this.searches.set(snapshot.bin, operation)
    return operation
  }

  async disable(version: SoftInstalled, name: string): Promise<boolean> {
    const entry = this.entry(version)
    if (this.installingBin || entry.fetching || entry.preparing) return false
    const snapshot = JSON.parse(JSON.stringify(version)) as SoftInstalled
    this.installingBin = snapshot.bin
    entry.installing = true
    entry.error = ''
    entry.log = ''
    entry.result = undefined
    entry.operation = { type: 'disable', name, status: 'running' }
    const operation = entry.operation
    try {
      entry.profile = await this.dependencies.request<PhpExtensionProfile>(
        'windowsExtensionDisable',
        [snapshot, name]
      )
      operation.status = 'success'
      this.notice('success', this.dependencies.disabledMessage?.() ?? '')
      try {
        this.dependencies.refresh(snapshot)
      } catch {
        /* a refresh cannot undo the completed configuration change */
      }
      return true
    } catch (error) {
      entry.error = error instanceof Error ? error.message : String(error)
      operation.status = 'error'
      operation.error = entry.error
      this.notice('error', entry.error)
      return false
    } finally {
      entry.installing = false
      this.installingBin = ''
    }
  }

  async install(version: SoftInstalled, name: string, release?: string): Promise<boolean> {
    const entry = this.entry(version)
    if (this.installingBin || entry.fetching || entry.preparing) return false
    const snapshot = JSON.parse(JSON.stringify(version)) as SoftInstalled
    this.installingBin = snapshot.bin
    entry.installing = true
    entry.error = ''
    entry.log = ''
    entry.result = undefined
    entry.operation = { type: 'install', name, status: 'running' }
    entry.operationPreparation =
      entry.preparation?.name === name
        ? { ...entry.preparation, releases: [...entry.preparation.releases] }
        : undefined
    entry.operationRelease = release
    const operation = entry.operation
    try {
      const result = await this.dependencies.request<ExtensionInstallResult>(
        'windowsExtensionInstall',
        release ? [snapshot, name, release] : [snapshot, name],
        (text) => {
          entry.log = (entry.log + text).slice(-64000)
        }
      )
      entry.result = result
      entry.profile = result.profile
      operation.status = result.warning ? 'warning' : 'success'
      this.notice(
        result.warning ? 'warning' : 'success',
        result.warning || this.dependencies.successMessage()
      )
      // Refresh is supplementary: a completed installation must not be replayed.
      try {
        this.dependencies.refresh(snapshot)
      } catch {
        /* the next panel mount will refresh */
      }
      return true
    } catch (error) {
      entry.error = error instanceof Error ? error.message : String(error)
      operation.status = 'error'
      operation.error = entry.error
      this.notice('error', entry.error)
      return false
    } finally {
      entry.installing = false
      this.installingBin = ''
    }
  }
}
