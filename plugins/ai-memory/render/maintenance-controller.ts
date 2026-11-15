import type {
  MemoryResult,
  ProjectRecoveryReport,
  MemoryProjectInfo,
  ProjectRelinkInput,
  ProjectPathConflict,
  ProjectRelinkReceipt
} from '../shared'
import type { MaintenanceReceipt } from '../fork/memory-backup'
export type MaintenanceKind = 'backup' | 'restore'
export type ProjectConflictChoice = 'merge' | 'reselect' | 'cancel'
export type MaintenanceDeps = {
  id(): string
  choose(kind: MaintenanceKind): Promise<string | undefined>
  confirmRestore(path: string): Promise<boolean>
  maintain(
    kind: MaintenanceKind,
    path: string,
    id: string
  ): Promise<MemoryResult<MaintenanceReceipt>>
  status(id: string): Promise<MemoryResult<MaintenanceReceipt>>
  inspect(): Promise<MemoryResult<ProjectRecoveryReport>>
  projects(fresh?: boolean): Promise<MemoryResult<MemoryProjectInfo[]>>
  selectedProjectPath(): string | undefined
  chooseProject(project: MemoryProjectInfo): Promise<string | undefined>
  confirmRelink(project: MemoryProjectInfo, path: string): Promise<boolean>
  relink(input: ProjectRelinkInput): Promise<MemoryResult<ProjectRelinkReceipt>>
  afterRelink(receipt: ProjectRelinkReceipt): Promise<void>
  runtime(): Promise<MemoryResult<{ dataRoot: string }>>
  openPath(path: string): Promise<void>
  afterRestore(): Promise<void>
  notify(type: 'success' | 'error', key: string): void
}
type Operation = {
  kind: MaintenanceKind
  id: string
  path?: string
  stage: 'selecting' | 'confirming' | 'running' | 'complete'
  result?: MemoryResult<MaintenanceReceipt>
}
type RelinkOperation = {
  project: MemoryProjectInfo
  input?: ProjectRelinkInput
  stage: 'selecting' | 'confirming' | 'conflict' | 'running' | 'complete'
  conflict?: ProjectPathConflict
  result?: MemoryResult<ProjectRelinkReceipt>
}
export class MemoryMaintenanceController {
  projectsResult?: MemoryResult<MemoryProjectInfo[]>
  relinkOperation?: RelinkOperation
  private relinkFlight?: Promise<void>
  private conflictDecision?: (choice: ProjectConflictChoice) => void
  operation?: Operation
  lastBackup?: MaintenanceReceipt
  lastRestore?: MaintenanceReceipt
  inspection?: MemoryResult<ProjectRecoveryReport>
  runtimeResult?: MemoryResult<{ dataRoot: string }>
  checking = false
  opening: Record<string, boolean> = {}
  directoryError?: string
  private flight?: Promise<void>
  private refreshFlight?: Promise<void>
  private statusFlight?: Promise<void>
  private directoryFlights = new Map<string, Promise<void>>()
  constructor(private readonly deps: MaintenanceDeps) {}
  get busy() {
    return (
      (!!this.operation && this.operation.stage !== 'complete') ||
      (!!this.relinkOperation && this.relinkOperation.stage !== 'complete')
    )
  }
  get blocked() {
    return (
      this.busy ||
      this.operation?.result?.outcome === 'unknown' ||
      this.relinkOperation?.result?.outcome === 'unknown'
    )
  }
  private notify(type: 'success' | 'error', key: string) {
    try {
      this.deps.notify(type, key)
    } catch {
      /* supplementary */
    }
  }
  refresh(fresh = false): Promise<void> {
    if (this.refreshFlight)
      return fresh ? this.refreshFlight.then(() => this.refresh(true)) : this.refreshFlight
    this.checking = true
    this.refreshFlight = Promise.all([
      this.deps
        .projects(fresh)
        .catch(() => ({ outcome: 'failed' as const, error_code: 'project_list_unavailable' }))
        .then((value) => {
          this.projectsResult = value
        }),
      this.deps
        .inspect()
        .catch(() => ({ outcome: 'failed' as const, error_code: 'maintenance_check_failed' }))
        .then((value) => {
          this.inspection = value
        }),
      this.deps
        .runtime()
        .catch(() => ({ outcome: 'failed' as const, error_code: 'directory_unavailable' }))
        .then((value) => {
          this.runtimeResult = value
        })
    ])
      .then(() => {})
      .finally(() => {
        this.checking = false
        this.refreshFlight = undefined
      })
    return this.refreshFlight
  }
  backup() {
    return this.start('backup')
  }
  restore() {
    return this.start('restore')
  }
  private start(kind: MaintenanceKind): Promise<void> {
    if (this.flight) return this.flight
    if (this.blocked) return Promise.resolve()
    this.operation = { kind, id: this.deps.id(), stage: 'selecting' }
    const operation = this.operation
    this.flight = (async () => {
      let sent = false
      try {
        const path = await this.deps.choose(kind)
        if (!path) {
          this.operation = undefined
          return
        }
        operation.path = path
        if (kind === 'restore') {
          operation.stage = 'confirming'
          if (!(await this.deps.confirmRestore(path))) {
            this.operation = undefined
            return
          }
        }
        operation.stage = 'running'
        sent = true
        await this.finish(operation, await this.deps.maintain(kind, path, operation.id))
      } catch (error) {
        await this.finish(operation, {
          outcome:
            sent && error instanceof Error && error.message === 'operation_unknown'
              ? 'unknown'
              : 'failed',
          error_code:
            sent && error instanceof Error && error.message === 'operation_unknown'
              ? 'maintenance_unknown'
              : 'maintenance_failed'
        })
      }
    })().finally(() => {
      this.flight = undefined
    })
    return this.flight
  }
  private async finish(operation: Operation, result: MemoryResult<MaintenanceReceipt>) {
    operation.result = result
    if (result.outcome === 'success' && result.data) {
      if (operation.kind === 'backup') this.lastBackup = result.data
      else {
        this.lastRestore = result.data
        await this.deps.afterRestore().catch(() => {
          result.data!.warnings = [...(result.data!.warnings ?? []), 'maintenance_refresh_warning']
        })
        await this.refresh(true)
        if (this.projectsResult?.outcome !== 'success')
          result.data.warnings = [...(result.data.warnings ?? []), 'maintenance_refresh_warning']
      }
      this.notify(
        'success',
        operation.kind === 'backup' ? 'maintenanceBackupDone' : 'maintenanceRestoreDone'
      )
    } else if (result.outcome !== 'unknown')
      this.notify('error', result.error_code ?? 'maintenance_failed')
    operation.stage = 'complete'
  }
  private async selectRelinkTarget(operation: RelinkOperation) {
    operation.stage = 'selecting'
    const path = await this.deps.chooseProject(operation.project)
    if (!path) return false
    operation.stage = 'confirming'
    if (!(await this.deps.confirmRelink(operation.project, path))) return false
    const selectedPath = this.deps.selectedProjectPath()
    operation.input = {
      projectId: operation.project.projectId,
      expectedPath: operation.project.project_path,
      newPath: path,
      ...(selectedPath ? { selectedPath } : {})
    }
    return true
  }
  relinkProject(project: MemoryProjectInfo): Promise<void> {
    if (this.relinkFlight) return this.relinkFlight
    if (this.blocked) return Promise.resolve()
    this.relinkOperation = { project: { ...project }, stage: 'selecting' }
    const operation = this.relinkOperation
    this.relinkFlight = (async () => {
      try {
        if (!(await this.selectRelinkTarget(operation))) {
          this.relinkOperation = undefined
          return
        }
        await this.executeRelink(operation)
      } catch {
        this.failRelink(operation)
      }
    })().finally(() => {
      this.relinkFlight = undefined
    })
    return this.relinkFlight
  }
  private failRelink(operation: RelinkOperation) {
    operation.result = { outcome: 'failed', error_code: 'project_relink_failed' }
    operation.stage = 'complete'
  }
  resolveProjectConflict(choice: ProjectConflictChoice) {
    if (this.relinkOperation?.stage !== 'conflict' || !this.conflictDecision) return
    const resolve = this.conflictDecision
    this.conflictDecision = undefined
    resolve(choice)
  }
  private async executeRelink(operation: RelinkOperation) {
    let result: MemoryResult<ProjectRelinkReceipt>
    while (true) {
      operation.stage = 'running'
      try {
        result = await this.deps.relink({ ...operation.input! })
      } catch (error) {
        result = {
          outcome:
            error instanceof Error && error.message === 'operation_unknown' ? 'unknown' : 'failed',
          error_code:
            error instanceof Error && error.message === 'operation_unknown'
              ? 'project_relink_unknown'
              : 'project_relink_failed'
        }
      }
      if (result.outcome !== 'conflict' || !result.project_conflict) break
      operation.conflict = { ...result.project_conflict }
      operation.stage = 'conflict'
      const choice = await new Promise<ProjectConflictChoice>((resolve) => {
        this.conflictDecision = resolve
      })
      const conflict = operation.conflict
      operation.conflict = undefined
      if (choice === 'cancel') {
        this.relinkOperation = undefined
        return
      }
      if (choice === 'reselect') {
        if (!(await this.selectRelinkTarget(operation))) {
          this.relinkOperation = undefined
          return
        }
      } else
        operation.input = {
          ...operation.input!,
          mergeWith: conflict.projectId,
          mergeRevision: conflict.revision
        }
    }
    operation.result = result
    if (result.outcome === 'success' && result.data) {
      await this.deps.afterRelink(result.data).catch(() => {
        result.warnings = [{ code: 'project_relink_refresh_warning' }]
      })
      await this.refresh(true)
      if (this.projectsResult?.outcome !== 'success')
        result.warnings = [...(result.warnings ?? []), { code: 'project_relink_refresh_warning' }]
      this.notify('success', result.data.merged ? 'projectMergeDone' : 'projectRelinkDone')
    } else if (result.outcome !== 'unknown')
      this.notify('error', result.error_code ?? 'project_relink_failed')
    operation.stage = 'complete'
  }
  retryRelink(): Promise<void> {
    if (this.relinkFlight) return this.relinkFlight
    const operation = this.relinkOperation
    if (!operation?.input || operation.result?.outcome !== 'unknown') return Promise.resolve()
    this.relinkFlight = this.executeRelink(operation)
      .catch(() => this.failRelink(operation))
      .finally(() => {
        this.relinkFlight = undefined
      })
    return this.relinkFlight
  }
  checkOperation() {
    if (this.statusFlight) return this.statusFlight
    const operation = this.operation
    if (!operation || operation.result?.outcome !== 'unknown') return Promise.resolve()
    this.statusFlight = this.deps
      .status(operation.id)
      .then((result) => this.finish(operation, result))
      .catch(() => {})
      .finally(() => {
        this.statusFlight = undefined
      })
    return this.statusFlight
  }
  openDirectory(path?: string): Promise<void> {
    if (!path) return Promise.resolve()
    const existing = this.directoryFlights.get(path)
    if (existing) return existing
    this.opening[path] = true
    this.directoryError = undefined
    const flight = this.deps
      .openPath(path)
      .catch(() => {
        this.directoryError = 'directory_unavailable'
        this.notify('error', 'directory_unavailable')
      })
      .finally(() => {
        this.opening[path] = false
        this.directoryFlights.delete(path)
      })
    this.directoryFlights.set(path, flight)
    return flight
  }
}
