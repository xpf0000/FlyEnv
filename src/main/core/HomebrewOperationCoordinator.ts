import { randomUUID, createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { isAbsolute, resolve, sep } from 'node:path'
import type {
  BrewFormulaSnapshot,
  BrewUpgradePreview,
  BrewServiceTarget,
  BrewPackageAction,
  BrewPackageResult
} from '../../fork/module/Brew/UpgradeTypes'

type Dependencies = {
  inspect: (formula: string) => Promise<BrewFormulaSnapshot>
  running: () => BrewServiceTarget[]
  idle: (snapshot: BrewFormulaSnapshot) => Promise<void>
  run: (
    id: string,
    action: BrewPackageAction,
    snapshot: BrewFormulaSnapshot,
    progress: (data: string) => void
  ) => PromiseLike<BrewPackageResult>
}
type Operation = {
  snapshot: BrewFormulaSnapshot
  targets: BrewServiceTarget[]
  phase: 'pending' | 'running' | 'unknown'
  flight?: Promise<BrewPackageResult>
}
const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
const inside = (bin: string, rack: string) => bin === rack || bin.startsWith(rack + sep)

/** Main owns admission and trusted snapshots; no renderer-provided path can grant execution. */
export class HomebrewOperationCoordinator {
  private previews = new Map<string, BrewUpgradePreview>()
  private operations = new Map<string, Operation>()
  private active?: Operation
  constructor(private readonly deps: Dependencies) {}

  private related(
    snapshot: BrewFormulaSnapshot,
    target: unknown,
    module: string
  ): boolean | undefined {
    if (module === 'dns' || module === 'ftp-srv') return false
    const bin = (target as { bin?: unknown })?.bin
    if (typeof bin !== 'string' || !isAbsolute(bin)) return undefined
    let actual: string
    try {
      actual = realpathSync(bin)
    } catch {
      actual = resolve(bin)
      // Missing aliases under this prefix cannot prove an independent installation.
      if (inside(actual, snapshot.identity.prefix) && !inside(actual, snapshot.identity.cellar))
        return undefined
    }
    return snapshot.affectedRacks.some((rack) => inside(actual, rack))
  }
  assertStart(module: string, target: unknown) {
    if (this.active && this.related(this.active.snapshot, target, module) !== false)
      throw new Error(
        'Homebrew is changing this installation; start is blocked until the package operation finishes'
      )
  }
  private targets(snapshot: BrewFormulaSnapshot) {
    return this.deps
      .running()
      .filter((target) => {
        const related = this.related(snapshot, target.item, target.module)
        if (related === undefined)
          throw new Error(`Cannot verify running service installation: ${target.module}`)
        return related
      })
      .sort((a, b) =>
        `${a.module}:${a.item.bin}:${a.item.pid}`.localeCompare(
          `${b.module}:${b.item.bin}:${b.item.pid}`
        )
      )
  }
  assertKnownStarts(snapshot: BrewFormulaSnapshot, starts: { module: string; item: unknown }[]) {
    if (starts.some((start) => this.related(snapshot, start.item, start.module) !== false))
      throw new Error(
        'An earlier service start has an unknown result; verify services before another Homebrew operation'
      )
  }
  stopTarget(module: string, target: { pid?: string; bin?: string }) {
    if (!this.active) return undefined
    const accepted = this.active.targets.find(
      (entry) =>
        entry.module === module && entry.item.pid === target?.pid && entry.item.bin === target?.bin
    )
    if (!accepted) return undefined
    const current = this.deps
      .running()
      .find((entry) => entry.module === module && entry.item.pid === target.pid)
    if (current && current.generation !== accepted.generation)
      throw new Error('Registered service changed; please confirm again')
    return { pid: accepted.item.pid!, bin: accepted.item.bin }
  }
  async prepareUpgrade(module: string, formula: string): Promise<BrewUpgradePreview> {
    if (module !== 'php') throw new Error('Only PHP Homebrew upgrades are supported')
    const snapshot = await this.deps.inspect(formula)
    if (!snapshot.eligible) throw new Error(`Homebrew upgrade unavailable: ${snapshot.reason}`)
    await this.deps.idle(snapshot)
    const preview: BrewUpgradePreview = {
      previewId: randomUUID(),
      module,
      snapshot,
      targets: this.targets(snapshot)
    }
    if (this.previews.size >= 100) this.previews.delete(this.previews.keys().next().value!)
    this.previews.set(preview.previewId, structuredClone(preview))
    return preview
  }
  async beginUpgrade(previewId: string) {
    const preview = this.previews.get(previewId)
    if (!preview) throw new Error('Invalid or expired Homebrew confirmation')
    if (this.active) throw new Error('Homebrew package operation is busy')
    const operation: Operation = {
      snapshot: preview.snapshot,
      targets: preview.targets,
      phase: 'pending'
    }
    this.active = operation // synchronous barrier, before any await
    try {
      await this.deps.idle(preview.snapshot)
      const current = await this.deps.inspect(preview.snapshot.formula)
      const targets = this.targets(current)
      if (
        !current.eligible ||
        current.fingerprint !== preview.snapshot.fingerprint ||
        digest(targets) !== digest(preview.targets)
      )
        throw new Error('Homebrew target or running services changed; please confirm again')
      const operationId = randomUUID()
      this.previews.delete(previewId)
      this.operations.set(operationId, operation)
      return { operationId, targets: structuredClone(targets) }
    } catch (error) {
      if (this.active === operation) this.active = undefined
      throw error
    }
  }
  cancelPending(id: string) {
    const operation = this.operations.get(id)
    if (!operation) throw new Error('Invalid Homebrew operation')
    if (operation.phase !== 'pending' || (operation.flight && this.active === operation))
      throw new Error('Homebrew command is running or its result is unknown')
    if (this.active === operation) this.active = undefined
    this.operations.delete(id)
  }
  execute(id: string, progress: (data: string) => void = () => {}): Promise<BrewPackageResult> {
    const operation = this.operations.get(id)
    if (!operation) return Promise.reject(new Error('Invalid Homebrew operation'))
    if (operation.flight) return operation.flight
    operation.flight = (async () => {
      await this.deps.idle(operation.snapshot)
      if (this.targets(operation.snapshot).length)
        throw new Error('Related Homebrew services are still running')
      const current = await this.deps.inspect(operation.snapshot.formula)
      if (!current.eligible || current.fingerprint !== operation.snapshot.fingerprint)
        throw new Error('Homebrew target changed; please confirm again')
      operation.phase = 'running'
      let result: BrewPackageResult
      try {
        result = await this.deps.run(id, 'upgrade', operation.snapshot, progress)
      } catch (error) {
        result = {
          operationId: id,
          action: 'upgrade',
          outcome: 'unknown',
          logs: '',
          error: String(error)
        }
      }
      if (result.outcome === 'unknown') operation.phase = 'unknown'
      else if (this.active === operation) this.active = undefined
      return result
    })().catch((error) => {
      // No child was submitted on these required precondition failures.
      if (operation.phase === 'pending') {
        if (this.active === operation) this.active = undefined
        return {
          operationId: id,
          action: 'upgrade',
          outcome: 'failed',
          error: String(error),
          logs: ''
        } as BrewPackageResult
      }
      throw error
    })
    return operation.flight
  }

  /** Existing install/uninstall share the same mutation owner; they never impersonate an upgrade token. */
  async mutate(
    action: 'install' | 'uninstall',
    snapshot: BrewFormulaSnapshot,
    progress: (data: string) => void
  ) {
    if (this.active) throw new Error('Homebrew package operation is busy')
    const operation: Operation = { snapshot, targets: [], phase: 'pending' }
    this.active = operation
    const id = randomUUID()
    try {
      await this.deps.idle(snapshot)
      operation.phase = 'running'
      const result = await this.deps.run(id, action, snapshot, progress)
      if (result.outcome === 'unknown') operation.phase = 'unknown'
      else if (this.active === operation) this.active = undefined
      return result
    } catch (error) {
      const submitted = operation.phase !== 'pending'
      if (submitted) operation.phase = 'unknown'
      else if (this.active === operation) this.active = undefined
      return {
        operationId: id,
        action,
        outcome: submitted ? 'unknown' : 'failed',
        logs: '',
        error: String(error)
      } as BrewPackageResult
    }
  }
}
