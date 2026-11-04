import { validateProfileInput, validateServiceInput } from '../shared/validation'
import type { RuntimeCapabilities, DeviceInfo } from '../shared/launchOptions'
import { tokenizeExtraArgs } from '../shared/extraArguments'
import {
  clone,
  type LaunchInput,
  type LaunchReport,
  type LaunchState,
  type ModelProfile,
  type ServiceSettings
} from '../shared/settings'
import type { ProfilesRepository } from './profiles'
export class ModuleMutationGate {
  busy?: { kind: string; key: string; promise: Promise<any> }
  blocked = false
  run<T>(kind: string, key: string, work: () => Promise<T>): Promise<T> {
    if (this.blocked)
      return Promise.reject(
        Error('Process state is unknown; refresh status or stop the service first')
      )
    if (this.busy)
      return this.busy.kind === kind && this.busy.key === key
        ? this.busy.promise
        : Promise.reject(Error('Wait for the current llama.cpp operation'))
    const promise = Promise.resolve()
      .then(work)
      .finally(() => {
        if (this.busy?.promise === promise) this.busy = undefined
      })
    this.busy = { kind, key, promise }
    return promise
  }
}
interface Service {
  run: boolean
  running: boolean
  start(): Promise<boolean | string>
  stop(): Promise<boolean | string>
  restart(): Promise<boolean | string>
}
interface Dependencies {
  repository: ProfilesRepository
  gate: ModuleMutationGate
  input(key?: string): LaunchInput
  request(method: string, ...args: any[]): Promise<any>
  withInput<T>(input: LaunchInput, runtime: any, fn: () => Promise<T>): Promise<T>
  notify(message: string, error: boolean): void
}
export class LaunchController {
  previewOperation?: {
    requestKey: string
    status: 'checking' | 'ready' | 'invalid' | 'failed'
    report?: LaunchReport
    error?: string
  }
  applyOperation?: {
    status: string
    modelKey: string
    saved: boolean
    applied: boolean
    error?: string
  }
  state: LaunchState = { kind: 'unknown' }
  runtimeCapabilities?: {
    bin: string
    caps?: RuntimeCapabilities
    devices?: DeviceInfo[]
    deviceError?: string
    error?: string
  }
  private capabilityGeneration = 0
  async detectRuntime(runtime: any) {
    const n = ++this.capabilityGeneration
    try {
      const caps = await this.deps.request('getRuntimeCapabilities', runtime)
      if (n === this.capabilityGeneration) this.runtimeCapabilities = { bin: runtime.bin, caps }
      if (caps.byAlias['--list-devices']) {
        try {
          const devices = await this.deps.request('getRuntimeDevices', clone(runtime))
          if (n === this.capabilityGeneration)
            this.runtimeCapabilities = { bin: runtime.bin, caps, devices }
        } catch (e) {
          if (n === this.capabilityGeneration)
            this.runtimeCapabilities = { bin: runtime.bin, caps, deviceError: String(e) }
        }
      }
      return caps
    } catch (e) {
      if (n === this.capabilityGeneration)
        this.runtimeCapabilities = { bin: runtime.bin, error: String(e) }
      return undefined
    }
  }
  private statusGeneration = 0
  private generation = 0
  private previewFlight?: { key: string; promise: Promise<LaunchReport> }
  constructor(private deps: Dependencies) {}
  preview(input: LaunchInput, runtime: any) {
    const snapshot = clone(input)
    const key = JSON.stringify([snapshot, runtime])
    if (this.previewFlight?.key === key) return this.previewFlight.promise
    const generation = ++this.generation
    this.previewOperation = { requestKey: key, status: 'checking' }
    const promise = this.deps
      .request('prepareModelLaunch', snapshot, clone(runtime))
      .then((report: LaunchReport) => {
        if (generation === this.generation)
          this.previewOperation = {
            requestKey: key,
            status: report.prepared ? 'ready' : 'invalid',
            report
          }
        return report
      })
      .catch((e) => {
        if (generation === this.generation)
          this.previewOperation = { requestKey: key, status: 'failed', error: String(e) }
        throw e
      })
      .finally(() => {
        if (this.previewFlight?.promise === promise) this.previewFlight = undefined
      })
    this.previewFlight = { key, promise }
    return promise
  }
  async refreshState() {
    const n = ++this.statusGeneration
    try {
      const state = await this.deps.request('getLaunchState')
      if (n === this.statusGeneration) {
        this.state = state
        this.deps.gate.blocked = state.kind === 'unknown'
      }
      return state
    } catch (e) {
      if (n === this.statusGeneration) {
        this.state = { kind: 'unknown' }
        this.deps.gate.blocked = true
      }
      throw e
    }
  }
  async saveModel(profile: ModelProfile, expected = profile.revision) {
    tokenizeExtraArgs(profile.extraArgsText)
    const issues = validateProfileInput(profile)
    if (issues.length) throw Error(issues.map((i) => i.message).join('\n'))
    if (this.deps.gate.busy) throw Error('Wait for current operation')
    await this.deps.repository.commitProfile(clone(profile), expected)
    this.deps.notify('Settings saved', false)
  }
  async saveService(service: ServiceSettings, expected = service.revision) {
    const issues = validateServiceInput(service)
    if (issues.length) throw Error(issues.map((i) => i.message).join('\n'))
    if (this.deps.gate.busy) throw Error('Wait for current operation')
    await this.deps.repository.commitService(clone(service), expected)
    this.deps.notify('Settings saved', false)
  }
  applyModel(profile: ModelProfile, runtime: any, service: Service) {
    const input = clone(this.deps.input(profile.modelKey))
    input.profile = clone(profile)
    return this.apply(input, runtime, service, () =>
      this.deps.repository.commitProfile(input.profile, input.profile.revision)
    )
  }
  applyService(settings: ServiceSettings, runtime: any, service: Service) {
    const input = clone(this.deps.input())
    input.service = clone(settings)
    return this.apply(input, runtime, service, () =>
      this.deps.repository.commitService(input.service, input.service.revision)
    )
  }
  private apply(input: LaunchInput, runtime: any, service: Service, save: () => Promise<unknown>) {
    return this.deps.gate.run('apply', JSON.stringify([input, runtime]), async () => {
      this.applyOperation = {
        status: 'preflight',
        modelKey: input.profile.modelKey,
        saved: false,
        applied: false,
        error: undefined as string | undefined
      }
      const op = this.applyOperation
      try {
        const issues = [
          ...validateProfileInput(input.profile),
          ...validateServiceInput(input.service)
        ]
        if (issues.length) throw Error(issues.map((i) => i.message).join('\n'))
        if (service.running) throw Error('Wait for service operation')
        if (input.profile.modelKey !== this.deps.repository.current.selectedModelKey)
          throw Error('Select this model as service model before applying')
        const report: LaunchReport = await this.deps.request(
          'prepareModelLaunch',
          clone(input),
          clone(runtime)
        )
        if (!report.prepared) throw Error(report.issues.map((x) => x.message).join('\n'))
        op.status = 'saving'
        await save()
        input.service.revision = this.deps.repository.current.service.revision
        input.profile.revision =
          this.deps.repository.current.modelProfiles[input.profile.modelKey].revision
        op.saved = true
        op.status = service.run ? 'restarting' : 'starting'
        const result = await this.deps.withInput(clone(input), runtime, () =>
          service.run ? service.restart() : service.start()
        )
        if (result !== true)
          throw Error(typeof result === 'string' ? result : 'Service operation failed')
        op.applied = true
        op.status = 'success'
        this.deps.notify('Settings applied', false)
        return { ...op }
      } catch (e) {
        op.error = e instanceof Error ? e.message : String(e)
        op.status = op.saved ? 'partial' : 'failed'
        await this.refreshState().catch(() => {
          op.status = 'unknown'
        })
        this.deps.notify((op.saved ? 'Settings saved; application failed: ' : '') + op.error, true)
        if (!op.saved) throw e
        return { ...op }
      }
    })
  }
  restoreLastSuccess(runtime: any, service: Service) {
    return this.deps.gate.run('restore', runtime.bin, async () => {
      try {
        await this.refreshState()
        if (this.state.kind !== 'stopped' || !this.state.lastSuccess)
          throw Error('Stop the service and confirm its state before restoring')
        const old = this.state.lastSuccess
        if (old.launch.bin !== runtime.bin)
          throw Error('Select the runtime used by the last successful launch')
        const report: LaunchReport = await this.deps.request(
          'prepareModelLaunch',
          old.launch.resolvedInput,
          runtime
        )
        if (!report.prepared) throw Error(report.issues.map((x) => x.message).join('\n'))
        const result = await this.deps.withInput(old.launch.resolvedInput, runtime, () =>
          service.start()
        )
        if (result !== true) throw Error(String(result))
        return true
      } catch (e) {
        this.deps.notify(String(e), true)
        throw e
      }
    })
  }
}
