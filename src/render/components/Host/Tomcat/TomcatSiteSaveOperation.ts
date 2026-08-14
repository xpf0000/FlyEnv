import type { AppHost, SoftInstalled } from '@shared/app'

export type TomcatSaveRequest = {
  host: AppHost
  old?: AppHost
  flag: 'add' | 'edit' | 'del'
  version?: SoftInstalled
  catalinaBase?: string
  wasRunning: boolean
}

export type TomcatSaveResult = { host: AppHost[] }

export type TomcatSiteSavePhase = 'idle' | 'saving' | 'restarting' | 'failed' | 'savedWithWarning'

type OperationDependencies = {
  persist: (request: TomcatSaveRequest) => Promise<TomcatSaveResult>
  applyHosts: (hosts: AppHost[]) => void
  writeHosts: () => Promise<unknown>
  restart: (request: TomcatSaveRequest) => Promise<string | boolean>
}

export class TomcatSiteSaveOperation {
  saving = false
  phase: TomcatSiteSavePhase = 'idle'
  private flight: Promise<boolean> | undefined
  error: Error | undefined

  constructor(private readonly dependencies: OperationDependencies) {}

  save(request: TomcatSaveRequest): Promise<boolean> {
    if (this.flight || this.saving) {
      return Promise.resolve(false)
    }
    this.saving = true
    this.phase = 'saving'
    this.error = undefined
    const flight = this.doSave(request).finally(() => {
      if (this.flight === flight) {
        this.flight = undefined
        this.saving = false
      }
    })
    this.flight = flight
    return flight
  }

  private async doSave(request: TomcatSaveRequest): Promise<boolean> {
    try {
      const result = await this.dependencies.persist(request)
      this.dependencies.applyHosts(result.host)
      try {
        await this.dependencies.writeHosts()
      } catch (error) {
        this.phase = 'savedWithWarning'
        this.error = error instanceof Error ? error : new Error(`${error}`)
        return true
      }
      if (request.wasRunning) {
        this.phase = 'restarting'
        const restarted = await this.dependencies.restart(request)
        if (typeof restarted === 'string') {
          this.phase = 'savedWithWarning'
          this.error = new Error(restarted)
          return true
        }
      }
      this.phase = 'idle'
      return true
    } catch (error) {
      this.phase = 'failed'
      this.error = error instanceof Error ? error : new Error(`${error}`)
      return false
    }
  }
}
