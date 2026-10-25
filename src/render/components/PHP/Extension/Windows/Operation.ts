import type { SoftInstalled } from '@shared/app'
import type {
  ExtensionCatalog,
  ExtensionInstallResult,
  ExtensionPackage,
  PhpExtensionProfile
} from '@fork/module/Php.win/WindowsExtensions'

export type ExtensionOperation = {
  type: 'install' | 'disable'
  name: string
  status: 'running' | 'success' | 'warning' | 'error'
  error?: string
}

export type ExtensionEntry = {
  fetching: boolean
  installing: boolean
  profile?: PhpExtensionProfile
  packages: ExtensionPackage[]
  partial: boolean
  lastQuery: string
  log: string
  error: string
  result?: ExtensionInstallResult
  operation?: ExtensionOperation
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
        installing: false,
        packages: [],
        partial: false,
        lastQuery: '',
        log: '',
        error: ''
      })
    )
  }

  load(version: SoftInstalled) {
    const entry = this.entry(version)
    if (!entry.fetching && !entry.installing) this.search(version, entry.lastQuery)
  }

  search(version: SoftInstalled, query: string): Promise<void> {
    const entry = this.entry(version)
    const pending = this.searches.get(version.bin)
    if (entry.installing) return Promise.resolve()
    this.queries.set(version.bin, query)
    entry.lastQuery = query
    if (pending) return pending
    const snapshot = JSON.parse(JSON.stringify(version)) as SoftInstalled
    entry.fetching = true
    entry.error = ''
    const operation = Promise.resolve()
      .then(async () => {
        do {
          query = this.queries.get(snapshot.bin) ?? ''
          try {
            const catalog = await this.dependencies.request<ExtensionCatalog>(
              'windowsExtensionCatalog',
              [snapshot, query]
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
        } while (query !== this.queries.get(snapshot.bin))
      })
      .finally(() => {
        entry.fetching = false
        this.searches.delete(snapshot.bin)
        this.queries.delete(snapshot.bin)
      })
    this.searches.set(snapshot.bin, operation)
    return operation
  }

  async disable(version: SoftInstalled, name: string): Promise<boolean> {
    const entry = this.entry(version)
    if (this.installingBin || entry.fetching) return false
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

  async install(version: SoftInstalled, name: string): Promise<boolean> {
    const entry = this.entry(version)
    if (this.installingBin || entry.fetching) return false
    const snapshot = JSON.parse(JSON.stringify(version)) as SoftInstalled
    this.installingBin = snapshot.bin
    entry.installing = true
    entry.error = ''
    entry.log = ''
    entry.result = undefined
    entry.operation = { type: 'install', name, status: 'running' }
    const operation = entry.operation
    try {
      const result = await this.dependencies.request<ExtensionInstallResult>(
        'windowsExtensionInstall',
        [snapshot, name],
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
