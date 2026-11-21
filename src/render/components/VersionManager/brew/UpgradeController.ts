import type {
  BrewFormulaSnapshot,
  BrewPackageResult,
  BrewPackageProgress,
  BrewServiceTarget,
  BrewUpgradePreview,
  BrewUpgradeCatalog
} from '@fork/module/Brew/UpgradeTypes'

type Dependencies = {
  call: (
    action: string,
    args: unknown[],
    progress?: (data: BrewPackageProgress) => void
  ) => Promise<any>
  terminal?: {
    open: () => void
    attach: (key: string, onData: (data: string) => void) => void
    stop: () => Promise<unknown> | undefined
    end: () => void
    close: () => void
  }
  stop: (target: BrewServiceTarget) => Promise<string | boolean>
  refresh: (module: string) => Promise<void>
  notify: (result: BrewPackageResult, refreshFailed: boolean) => void
}
type PackageOptions = {
  terminalView?: 'extensions'
  afterPackage?: (result: BrewPackageResult) => Promise<void>
}
export class HomebrewUpgradeController {
  phase = 'idle'
  logs = ''
  error = ''
  refreshFailed = false
  terminalView?: 'versions' | 'extensions'
  terminalId?: string
  cancelRequested = false
  result?: BrewPackageResult
  preview?: BrewUpgradePreview
  catalogs: Record<string, { rows: Record<string, BrewFormulaSnapshot>; error: string }> = {}
  private catalogSequence = new Map<string, number>()
  private requestKey?: string
  private flight?: Promise<BrewPackageResult>
  private prepareFlight?: Promise<BrewUpgradePreview>
  private preparing?: string
  constructor(private readonly deps: Dependencies) {}
  get busy() {
    return ['checking', 'stopping', 'upgrading', 'refreshing', 'unknown'].includes(this.phase)
  }
  get terminalFinished() {
    return this.result?.outcome === this.phase
  }
  dismissTerminal() {
    if (!this.terminalFinished) return
    this.terminalView = undefined
    this.deps.terminal?.close()
  }
  get terminalCanCancel() {
    return (
      !!this.terminalView &&
      (this.phase === 'checking' ||
        this.phase === 'stopping' ||
        (this.phase === 'upgrading' && !!this.terminalId))
    )
  }
  cancelTerminal() {
    if (!this.terminalCanCancel || this.cancelRequested) return
    this.cancelRequested = true
    if (this.terminalId) void this.deps.terminal?.stop()
  }
  private packageProgress(data: BrewPackageProgress) {
    if (typeof data === 'string') this.append(data)
    else {
      this.terminalId = data.terminalId
      this.deps.terminal?.attach(data.terminalId, (output) => this.append(output))
      if (this.cancelRequested) void this.deps.terminal?.stop()
    }
  }
  append(text: string) {
    this.logs = (this.logs + text).slice(-65536)
  }
  async loadCatalog(formulas: string[], module = 'php', installedOnly = false) {
    const sequence = (this.catalogSequence.get(module) ?? 0) + 1
    this.catalogSequence.set(module, sequence)
    let result: BrewUpgradeCatalog
    try {
      result = formulas.length
        ? await this.deps.call('getUpgradeCatalog', installedOnly ? [formulas, true] : [formulas])
        : { rows: [], failures: [] }
    } catch (error) {
      if (sequence === this.catalogSequence.get(module))
        this.catalogs[module] = { rows: {}, error: String(error) }
      throw error
    }
    const error = result.failures.map(({ formula, error }) => `${formula}: ${error}`).join('\n')
    if (sequence === this.catalogSequence.get(module))
      this.catalogs[module] = {
        rows: Object.fromEntries(result.rows.map((row) => [row.formula, row])),
        error
      }
    // Superseded requests cannot change current state, but still report their own failure.
    if (error) throw new Error(error)
  }
  prepare(formula: string, module = 'php'): Promise<BrewUpgradePreview> {
    const key = JSON.stringify([module, formula])
    if (this.prepareFlight && this.preparing === key) return this.prepareFlight
    if (this.busy) return Promise.reject(new Error('Homebrew operation is busy'))
    this.phase = 'checking'
    this.error = ''
    this.flight = undefined
    this.requestKey = undefined
    this.preparing = key
    this.prepareFlight = this.deps
      .call('prepareUpgrade', [module, formula])
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
        this.preparing = undefined
        this.prepareFlight = undefined
      })
    return this.prepareFlight!
  }
  confirm(preview: BrewUpgradePreview, options: PackageOptions = {}): Promise<BrewPackageResult> {
    if (this.flight && this.requestKey === preview.previewId) return this.flight
    if (this.busy) return Promise.reject(new Error('Homebrew operation is busy'))
    try {
      this.deps.terminal?.open()
    } catch (error) {
      return Promise.reject(error)
    }
    this.result = undefined
    this.phase = 'checking'
    this.terminalView = options.terminalView ?? 'versions'
    this.cancelRequested = false
    this.logs = ''
    this.error = ''
    this.refreshFailed = false
    this.requestKey = preview.previewId
    let id: string | undefined
    let executing = false
    const canceled = new Error('Homebrew operation canceled')
    this.flight = (async () => {
      let result: BrewPackageResult
      try {
        const accepted = await this.deps.call('beginUpgrade', [preview.previewId])
        id = accepted.operationId
        if (this.cancelRequested) throw canceled
        this.phase = 'stopping'
        // Required stops are independent items: finish each, preserve every stopped instance.
        const stops = await Promise.allSettled(
          (accepted.targets as BrewServiceTarget[]).map((target) => this.deps.stop(target))
        )
        const failures = stops.flatMap((r) =>
          r.status === 'rejected' ? [String(r.reason)] : r.value !== true ? [String(r.value)] : []
        )
        if (failures.length) throw new Error(failures.join('\n'))
        if (this.cancelRequested) throw canceled
        this.phase = 'upgrading'
        executing = true
        result = await this.deps.call('executeUpgrade', [id], this.packageProgress.bind(this))
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
          ...(error === canceled ? { canceled: true } : {}),
          error: String(error),
          logs: this.logs
        }
      }
      return this.finish(await this.postprocess(result, options.afterPackage), preview.module)
    })()
    return this.flight
  }
  package(
    row: { name: string; installed: boolean; typeFlag: string },
    options: PackageOptions = {}
  ): Promise<BrewPackageResult> {
    const key = JSON.stringify([row.typeFlag, row.name, row.installed])
    if (this.busy)
      return this.requestKey === key && this.flight
        ? this.flight
        : Promise.reject(new Error('Homebrew operation is busy'))
    try {
      this.deps.terminal?.open()
    } catch (error) {
      return Promise.reject(error)
    }
    this.requestKey = key
    this.result = undefined
    this.phase = 'upgrading'
    this.terminalView = options.terminalView ?? 'versions'
    this.cancelRequested = false
    this.logs = ''
    this.error = ''
    this.refreshFailed = false
    this.flight = (async () => {
      let result: BrewPackageResult
      const action = row.installed ? 'uninstall' : 'install'
      try {
        result = await this.deps.call(
          'packageOperation',
          [action, row.name],
          this.packageProgress.bind(this)
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
      return this.finish(await this.postprocess(result, options.afterPackage), row.typeFlag)
    })()
    return this.flight
  }
  private async postprocess(result: BrewPackageResult, callback: PackageOptions['afterPackage']) {
    this.terminalId = undefined
    this.deps.terminal?.end()
    if (result.outcome !== 'succeeded' || !callback) return result
    this.phase = 'refreshing'
    try {
      await callback(result)
      return result
    } catch (error) {
      return { ...result, postprocessError: String(error) }
    }
  }
  private async finish(result: BrewPackageResult, module: string) {
    this.terminalId = undefined
    this.cancelRequested = false
    this.result = result
    if (result.logs) this.logs = result.logs
    this.error = result.postprocessError ?? result.error ?? ''
    if (
      result.outcome === 'succeeded' ||
      (result.outcome === 'failed' && result.code !== undefined)
    ) {
      this.phase = 'refreshing'
      try {
        await this.deps.refresh(module)
      } catch (error) {
        this.refreshFailed = true
        this.append(`\n${String(error)}`)
      }
    }
    this.phase = result.outcome
    if (result.canceled && !this.refreshFailed) {
      this.dismissTerminal()
      return result
    }
    try {
      this.deps.notify(result, this.refreshFailed)
    } catch {
      /* presentation is supplementary */
    }
    return result
  }
}
