import type {
  BrewFormulaSnapshot,
  BrewPackageResult,
  BrewServiceTarget,
  BrewUpgradePreview
} from '../../../../../fork/module/Brew/UpgradeTypes'

type Dependencies = {
  call: (action: string, args: unknown[], progress?: (data: string) => void) => Promise<any>
  stop: (target: BrewServiceTarget) => Promise<string | boolean>
  refresh: (module: string) => Promise<void>
  notify: (result: BrewPackageResult, refreshFailed: boolean) => void
}
export class HomebrewUpgradeController {
  phase = 'idle'
  logs = ''
  error = ''
  refreshFailed = false
  result?: BrewPackageResult
  preview?: BrewUpgradePreview
  catalog: Record<string, BrewFormulaSnapshot> = {}
  private flight?: Promise<BrewPackageResult>
  private prepareFlight?: Promise<BrewUpgradePreview>
  constructor(private readonly deps: Dependencies) {}
  get busy() {
    return ['checking', 'stopping', 'upgrading', 'refreshing', 'unknown'].includes(this.phase)
  }
  append(text: string) {
    this.logs = (this.logs + text).slice(-65536)
  }
  async loadCatalog(formulas: string[]) {
    const rows: BrewFormulaSnapshot[] = await this.deps.call('getUpgradeCatalog', [formulas])
    const next: Record<string, BrewFormulaSnapshot> = {}
    for (const row of rows) next[row.formula] = row
    this.catalog = next
  }
  prepare(formula: string): Promise<BrewUpgradePreview> {
    if (this.prepareFlight) return this.prepareFlight
    if (this.busy) return Promise.reject(new Error('Homebrew operation is busy'))
    this.phase = 'checking'
    this.error = ''
    this.flight = undefined
    this.prepareFlight = this.deps
      .call('prepareUpgrade', ['php', formula])
      .then((preview) => {
        this.preview = preview
        return preview
      })
      .catch((error) => {
        this.error = String(error)
        this.deps.notify(
          { operationId: '', action: 'upgrade', outcome: 'failed', error: this.error, logs: '' },
          false
        )
        throw error
      })
      .finally(() => {
        this.phase = 'idle'
        this.prepareFlight = undefined
      })
    return this.prepareFlight!
  }
  confirm(preview: BrewUpgradePreview): Promise<BrewPackageResult> {
    if (this.flight) return this.flight
    if (this.busy) return Promise.reject(new Error('Homebrew operation is busy'))
    this.phase = 'checking'
    this.logs = ''
    this.error = ''
    this.refreshFailed = false
    let id: string | undefined
    let executing = false
    this.flight = (async () => {
      let result: BrewPackageResult
      try {
        const accepted = await this.deps.call('beginUpgrade', [preview.previewId])
        id = accepted.operationId
        this.phase = 'stopping'
        // Required stops are independent items: finish each, preserve every stopped instance.
        const stops = await Promise.allSettled(
          (accepted.targets as BrewServiceTarget[]).map((target) => this.deps.stop(target))
        )
        const failures = stops.flatMap((r) =>
          r.status === 'rejected' ? [String(r.reason)] : r.value !== true ? [String(r.value)] : []
        )
        if (failures.length) throw new Error(failures.join('\n'))
        this.phase = 'upgrading'
        executing = true
        result = await this.deps.call('executeUpgrade', [id], (data) => this.append(data))
      } catch (error) {
        if (id && !executing) {
          try {
            await this.deps.call('cancelPendingUpgrade', [id])
          } catch (cleanup) {
            this.append(String(cleanup))
          }
        }
        result = {
          operationId: id ?? '',
          action: 'upgrade',
          outcome: executing ? 'unknown' : 'failed',
          error: String(error),
          logs: this.logs
        }
      }
      return this.finish(result, preview.module)
    })()
    return this.flight
  }
  package(row: { name: string; installed: boolean; typeFlag: string }): Promise<BrewPackageResult> {
    if (this.busy) return this.flight ?? Promise.reject(new Error('Homebrew operation is busy'))
    this.phase = 'upgrading'
    this.logs = ''
    this.error = ''
    this.refreshFailed = false
    this.flight = (async () => {
      let result: BrewPackageResult
      const action = row.installed ? 'uninstall' : 'install'
      try {
        result = await this.deps.call('packageOperation', [action, row.name], (data) =>
          this.append(data)
        )
      } catch (error) {
        result = {
          operationId: '',
          action,
          outcome: 'unknown',
          error: String(error),
          logs: this.logs
        }
      }
      return this.finish(result, row.typeFlag)
    })()
    return this.flight
  }
  private async finish(result: BrewPackageResult, module: string) {
    this.result = result
    this.logs = result.logs || this.logs
    this.error = result.error ?? ''
    if (result.outcome === 'succeeded') {
      this.phase = 'refreshing'
      try {
        await this.deps.refresh(module)
      } catch (error) {
        this.refreshFailed = true
        this.append(`\n${String(error)}`)
      }
    }
    this.phase = result.outcome
    try {
      this.deps.notify(result, this.refreshFailed)
    } catch {
      /* presentation is supplementary */
    }
    return result
  }
}
