export type InstallationSource = 'Static' | 'Homebrew' | 'Macports'
export interface InstallationRow {
  source: InstallationSource
  name: string
  version?: string
  installed: boolean
  [key: string]: any
}
export interface InstallationDependencies {
  list(source: InstallationSource): Promise<InstallationRow[]>
  installed(): Promise<void>
  guard(row: InstallationRow): Promise<boolean>
  confirm(row: InstallationRow): Promise<boolean>
  install(row: InstallationRow, progress: (value: any) => void): Promise<unknown>
  remove(row: InstallationRow): Promise<unknown>
  cancel(): Promise<unknown>
  cleanup(): Promise<unknown>
  notify(type: 'success' | 'error', message: string): void
  admission?(busy: boolean): void
}
export class InstallationsController {
  versions: Partial<Record<InstallationSource, InstallationRow[]>> = {}
  fetching: Partial<Record<InstallationSource, boolean>> = {}
  sourceErrors: Partial<Record<InstallationSource, string>> = {}
  busy = false
  current?: InstallationRow
  progress = 0
  error = ''
  warning = ''
  private flight?: Promise<boolean>
  private key = ''
  cancelled = false
  output = ''
  private cancellation?: Promise<unknown>
  private loads = new Map<InstallationSource, Promise<InstallationRow[]>>()
  constructor(readonly deps: InstallationDependencies) {}
  load(source: InstallationSource, refresh = false): Promise<InstallationRow[]> {
    const existing = this.loads.get(source)
    if (existing) return existing
    if (!refresh && this.versions[source]) return Promise.resolve(this.versions[source]!)
    this.fetching[source] = true
    this.sourceErrors[source] = ''
    const result = Promise.resolve()
      .then(() => this.deps.list(source))
      .then((rows) => (this.versions[source] = rows))
      .catch((error) => {
        this.sourceErrors[source] = String(error.message ?? error)
        return this.versions[source] ?? []
      })
      .finally(() => {
        this.fetching[source] = false
        this.loads.delete(source)
      })
    this.loads.set(source, result)
    return result
  }
  act(input: InstallationRow): Promise<boolean> {
    const key = JSON.stringify([input.source, input.name, input.bin, input.installed])
    if (this.flight) return this.key === key ? this.flight : Promise.resolve(false)
    const row: InstallationRow = JSON.parse(JSON.stringify(input))
    this.key = key
    this.busy = true
    this.current = row
    this.progress = 0
    this.error = ''
    this.warning = ''
    this.output = ''
    this.cancelled = false
    this.deps.admission?.(true)
    let mutated = false
    this.flight = Promise.resolve()
      .then(async () => {
        if (row.conflictingFormula)
          throw new Error('The installed Homebrew formula conflicts with this package')
        if (row.installed) {
          if (!(await this.deps.confirm(row)) || this.cancelled) return false
          if (!(await this.deps.guard(row)) || this.cancelled) return false
          mutated = true
          await this.deps.remove(row)
        } else {
          mutated = true
          await this.deps.install(row, (value) => {
            if (Number.isFinite(value?.progress)) this.progress = value.progress
          })
        }
        if (this.cancelled) {
          this.warning = 'Operation cancelled; inspect the refreshed installation state'
          return false
        }
        this.notice('success', 'completed')
        return true
      })
      .catch((error) => {
        this.error = String(error.message ?? error)
        this.notice('error', this.error)
        return false
      })
      .finally(async () => {
        try {
          await this.deps.cleanup()
        } catch (error: any) {
          this.warning = String(error.message ?? error)
        }
        if (mutated) {
          try {
            await this.deps.installed()
            await this.load(row.source, true)
          } catch (error: any) {
            this.warning = String(error.message ?? error)
          }
        }
        this.busy = false
        this.flight = undefined
        this.key = ''
        this.deps.admission?.(false)
      })
    return this.flight
  }
  cancel(): Promise<unknown> {
    if (!this.busy || this.current?.source === 'Static') return Promise.resolve(false)
    if (this.cancellation) return this.cancellation
    this.cancelled = true
    this.cancellation = Promise.resolve()
      .then(() => this.deps.cancel())
      .catch((error) => {
        this.error = String(error.message ?? error)
        this.notice('error', this.error)
      })
      .finally(() => (this.cancellation = undefined))
    return this.cancellation
  }
  private notice(type: 'success' | 'error', message: string) {
    try {
      this.deps.notify(type, message)
    } catch {
      /* supplementary */
    }
  }
}
export function requireStaticInstallationSuccess(response: {
  code: number
  data?: unknown
  msg?: string
}): void {
  if (response.code !== 0 || response.data !== true)
    throw new Error(response.msg || 'MySQL installation failed; inspect downloaded files and retry')
}
