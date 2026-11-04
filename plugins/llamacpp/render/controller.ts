import {
  ProfilesRepository,
  createModelProfile,
  collectModelReferences,
  readOptionalStorage
} from './profiles'
import { LaunchController, ModuleMutationGate } from './launchController'
import { clone, type LaunchInput } from '../shared/settings'
import type { SoftInstalled } from '@shared/app'
import { MessageError, MessageSuccess } from '@/util/Element'
import { dialog } from '@/util/NodeFn'
import { join } from '@/util/path-browserify'
import { reactiveBind } from '@/util/Index'
import { StorageGetAsync, StorageSetAsync } from '@/util/Storage'
import type {
  HubModel,
  HubModelFile,
  LaunchProfile,
  LocalModel,
  LocalModelFileStatus,
  ModelDirectoryScan,
  RuntimeVariant,
  RuntimeIdentity
} from '../shared/types'
import { runtimeDirectoryName, runtimeIdentityKey } from '../shared/runtime'
import { isGGUFShardPath, isStandaloneGGUFPath } from '../shared/modelFile'
import { escapeNoticeText } from './notice'

export interface OperationState {
  id: string
  targetKey?: string
  targetFile?: HubModelFile
  status: 'starting' | 'running' | 'cancelling' | 'success' | 'failed' | 'cancelled' | 'partial'
  progress?: { downloaded?: number; total?: number; status?: string; asset?: string }
  result?: unknown
  error?: string
}

export interface ModelService {
  run: boolean
  running: boolean
  stop(): Promise<string | boolean>
  start(): Promise<string | boolean>
  restart(): Promise<string | boolean>
}

export interface ModelSwitchOperation {
  targetPath: string
  status: 'starting' | 'stopping' | 'startingService' | 'success' | 'failed'
  error?: string
}

export interface ControllerTransport {
  request<T>(
    method: string,
    args: unknown[],
    onProgress: (data: any) => void,
    sensitive?: boolean
  ): Promise<T>
}

export interface IpcBridge {
  send(
    command: string,
    ...args: unknown[]
  ): { then(callback: (key: string, response: any) => void): void }
  sendSensitive(
    command: string,
    ...args: unknown[]
  ): { then(callback: (key: string, response: any) => void): void }
  off(key: string): void
}

const storageSnapshot = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const ipcArgument = (value: unknown): unknown =>
  value !== null && typeof value === 'object' ? storageSnapshot(value) : value

export const createControllerTransport = (ipc: IpcBridge): ControllerTransport => ({
  request<T>(method: string, args: unknown[], onProgress: (data: any) => void, sensitive = false) {
    return new Promise<T>((resolve, reject) => {
      const cloneableArgs = args.map(ipcArgument)
      const request = sensitive
        ? ipc.sendSensitive('app-fork:llama-cpp', method, ...cloneableArgs)
        : ipc.send('app-fork:llama-cpp', method, ...cloneableArgs)
      request.then((key, response) => {
        if (response?.code === 200) {
          const progress = response?.msg?.['APP-On-Progress']
          if (progress) onProgress(progress)
          return
        }
        ipc.off(key)
        if (response?.code === 0) resolve(response.data as T)
        else reject(new Error(response?.msg ?? 'llama.cpp operation failed'))
      })
    })
  }
})

const productionTransport: ControllerTransport = {
  request<T>(method: string, args: unknown[], onProgress: (data: any) => void, sensitive = false) {
    return import('@/util/IPC')
      .then(({ default: IPC }) =>
        createControllerTransport(IPC).request<T>(method, args, onProgress, sensitive)
      )
      .catch((error) => Promise.reject(error))
  }
}

type RuntimeRefreshTarget = { path: string; installed: boolean }

const refreshInstalledRuntimes = async (target?: RuntimeRefreshTarget) => {
  if (!target?.path) throw new Error('Runtime operation did not return an installed path')
  const { BrewStore } = await import('@/store/brew')
  const module = BrewStore().module('llama-cpp')
  if (module.fetchInstalleding) await module.fetchInstalled(true)
  module.installedFetched = false
  await module.fetchInstalled(true)
  if (!module.installedFetched) throw new Error('Could not refresh installed llama.cpp runtimes')
  if (module.installed.some((item) => item.path === target.path) !== target.installed) {
    throw new Error('Installed llama.cpp runtimes did not reflect the operation')
  }
}

const notifyOperationError = (message: string) => {
  import('@/util/Element')
    .then(({ MessageError }) => MessageError(escapeNoticeText(message)))
    .catch(() => {})
}

const modelsKey = 'flyenv-llama-cpp-models'
type RuntimeChannel = 'stable' | 'prerelease'
type HubCatalog = { pages: Record<string, HubModel[]>; files: Record<string, HubModelFile[]> }
type ModelViewState = {
  activeTab: 'local' | 'library'
  query: string
  page: number
  results: HubModel[]
  files: Record<string, HubModelFile[]>
  expandedRowKeys: string[]
  searching: boolean
  loaded: boolean
  error: string
}

export const modelFileKey = (file: Pick<HubModelFile, 'repoId' | 'revision' | 'path'>) =>
  JSON.stringify([file.repoId, file.revision, file.path])

const isRunnableLocalModel = (model: LocalModel) =>
  !isGGUFShardPath(model.path) &&
  (model.standalone ?? isStandaloneGGUFPath(model.path, model.repoId))

export class LlamaCppController {
  repository = new ProfilesRepository({ get: StorageGetAsync, set: StorageSetAsync })
  mutationGate = new ModuleMutationGate()
  launch = new LaunchController({
    repository: this.repository,
    gate: this.mutationGate,
    input: (key) => this.launchInput(key),
    request: (method, ...args) => this.request(method, ...args),
    withInput: (input, runtime, fn) => this.withLaunchInput(input, runtime, fn),
    notify: (message, error) => {
      if (error) MessageError(escapeNoticeText(message))
      else MessageSuccess(message)
    }
  })
  private launchOverride?: { input: LaunchInput; bin: string }
  get settings() {
    return this.repository.current
  }
  get defaultModelsRoot() {
    const baseDir = typeof window !== 'undefined' ? window.Server?.BaseDir : undefined
    return baseDir ? join(baseDir, 'llama-cpp', 'models') : ''
  }
  get modelsRoot() {
    return this.repository.current?.service?.modelsDirectory || this.defaultModelsRoot
  }
  async withLaunchInput<T>(
    input: LaunchInput,
    runtime: SoftInstalled,
    fn: () => Promise<T>
  ): Promise<T> {
    this.launchOverride = { input: clone(input), bin: runtime.bin }
    try {
      return await fn()
    } finally {
      this.launchOverride = undefined
    }
  }
  launchInput(key = this.settings.selectedModelKey): LaunchInput {
    const model = this.localModels.find((m) => modelFileKey(m) === key)
    if (!model || !key || !this.settings.modelProfiles[key])
      throw Error('Select an installed main model')
    return clone({
      service: this.settings.service,
      profile: this.settings.modelProfiles[key],
      model,
      files: this.localModels
    })
  }
  async ensureModelProfile(key: string) {
    await this.init()
    const model = this.localModels.find((m) => modelFileKey(m) === key)
    if (!model || !isRunnableLocalModel(model)) throw Error('Select an installed main model')
    if (!this.settings.modelProfiles[key])
      await this.repository.commitProfile(createModelProfile(model, this.settings.initialBase), 0)
  }
  async pickReference(role: 'projector' | 'draft' | 'template') {
    const chosen = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        {
          name: role === 'template' ? 'Template' : 'GGUF',
          extensions: role === 'template' ? ['jinja', 'j2', 'txt'] : ['gguf']
        }
      ]
    })
    if (chosen.canceled || !chosen.filePaths?.[0]) return
    const ref = { kind: 'external' as const, path: chosen.filePaths[0], allowUnverified: true }
    const dep = await this.request<any>('inspectModelReference', ref, role, this.modelsRoot)
    return { ...ref, path: dep.path, fingerprint: dep.fingerprint, description: dep.description }
  }
  async chooseModelsDirectory() {
    const chosen = await dialog.showOpenDialog({
      defaultPath: this.modelsRoot || undefined,
      properties: ['openDirectory', 'createDirectory']
    })
    return chosen.canceled ? undefined : chosen.filePaths?.[0]
  }
  runtimeOperations: Record<string, OperationState> = {}
  private runtimeRefresh?: Promise<void>
  modelOperation?: OperationState
  modelSwitchOperation?: ModelSwitchOperation
  error = ''
  profile: LaunchProfile = {
    modelPath: '',
    backend: 'cpu',
    host: '127.0.0.1',
    port: 8080,
    contextSize: 8192,
    threads: 4,
    gpuLayers: 0
  }
  selectedModel?: LocalModel
  private catalogueFiles: LocalModel[] = []
  private modelFileStates: Record<string, LocalModelFileStatus> = {}
  private catalogueFlight?: Promise<void>
  private catalogueWrites: Promise<unknown> = Promise.resolve()
  private scanDeletedPaths?: Set<string>
  private writeCatalogue<T>(work: () => Promise<T>): Promise<T> {
    const request = this.catalogueWrites.catch(() => {}).then(work)
    this.catalogueWrites = request
    return request
  }
  localModelScan?: { status: 'checking' | 'success' | 'partial' | 'failed'; error?: string }
  get localModels() {
    return this.catalogueFiles.filter(
      (m) => this.modelFileStates[m.localPath]?.status === 'available'
    )
  }
  modelView: ModelViewState = {
    activeTab: 'local',
    query: '',
    page: 0,
    results: [],
    files: {},
    expandedRowKeys: [],
    searching: false,
    loaded: false,
    error: ''
  }
  private runtimeVariants: Partial<Record<RuntimeChannel, RuntimeVariant[]>> = {}
  private runtimeRequests: Partial<Record<RuntimeChannel, Promise<RuntimeVariant[]>>> = {}
  private hubCatalog: HubCatalog = { pages: {}, files: {} }
  private hubPageRequests: Partial<Record<string, Promise<HubModel[]>>> = {}
  private hubFileRequests: Partial<Record<string, Promise<HubModelFile[]>>> = {}
  private hubPagesGeneration = 0
  private hubFilesGeneration = 0
  private modelViewGeneration = 0
  private modelLibraryGeneration = 0
  private modelLibraryRequest?: { key: string; promise: Promise<HubModel[]> }
  private modelViewFileRequests: Partial<Record<string, Promise<void>>> = {}
  private initialized = false
  private initRequest?: Promise<void>

  constructor(
    private transport: ControllerTransport = productionTransport,
    private refreshInstalled: (target?: RuntimeRefreshTarget) => Promise<void> = async () => {},
    private reportOperationError: (message: string) => void = () => {}
  ) {}

  async init() {
    if (this.initialized) return
    if (this.initRequest) return this.initRequest
    this.initRequest = (async () => {
      const models = await readOptionalStorage(() => StorageGetAsync<LocalModel[]>(modelsKey))
      this.catalogueFiles = Array.isArray(models)
        ? models.map((model) => ({
            ...model,
            managedRoot: model.managedRoot || this.defaultModelsRoot || undefined
          }))
        : []
      await this.repository.load(this.catalogueFiles)
      await this.scanLocalModels().catch(() => {})
      this.syncProfile()
      this.initialized = true
    })().finally(() => {
      this.initRequest = undefined
    })
    return this.initRequest
  }
  refreshLocalModels() {
    return this.initialized ? this.scanLocalModels() : this.init()
  }
  private scanLocalModels() {
    if (this.catalogueFlight) return this.catalogueFlight
    this.localModelScan = { status: 'checking' }
    const initial = [...this.catalogueFiles]
    const initialByPath = new Map(initial.map((model) => [model.localPath, model]))
    const deletedDuringScan = new Set<string>()
    this.scanDeletedPaths = deletedDuringScan
    let snapshot = initial
    const isCurrent = (model: LocalModel) =>
      this.catalogueFiles.find((item) => item.localPath === model.localPath) === model
    const promise = Promise.resolve()
      .then(async () => {
        const warnings: string[] = []
        let discovered: ModelDirectoryScan = { models: [], skipped: [] }
        try {
          discovered = await this.request<ModelDirectoryScan>(
            'scanModelsDirectory',
            this.modelsRoot
          )
          if (
            !discovered ||
            !Array.isArray(discovered.models) ||
            !Array.isArray(discovered.skipped)
          )
            throw Error('Models directory scan returned an invalid result')
          warnings.push(...discovered.skipped)
        } catch (error) {
          discovered = { models: [], skipped: [] }
          warnings.push(`Models directory discovery failed: ${String(error)}`)
        }
        await this.writeCatalogue(async () => {
          const catalogue = new Map(this.catalogueFiles.map((model) => [model.localPath, model]))
          for (const model of discovered.models) {
            // A completed download/replacement or deletion wins over older discovery results.
            if (deletedDuringScan.has(model.localPath)) continue
            const current = catalogue.get(model.localPath)
            if (current && current !== initialByPath.get(model.localPath)) continue
            catalogue.set(model.localPath, model)
          }
          this.catalogueFiles = [...catalogue.values()]
          snapshot = [...this.catalogueFiles]
          if (discovered.models.length) {
            try {
              await StorageSetAsync(modelsKey, storageSnapshot(this.catalogueFiles))
            } catch (error) {
              warnings.push(`Models found; catalogue registration failed: ${String(error)}`)
            }
          }
        })
        const results = snapshot.length
          ? await this.request<LocalModelFileStatus[]>(
              'inspectLocalModelFiles',
              snapshot.map((m) => m.localPath)
            )
          : []
        if (!Array.isArray(results)) throw Error('Local model file check returned no results')
        const states = new Map(results.map((r) => [r.path, r]))
        for (const model of snapshot) {
          if (!isCurrent(model)) continue
          const result = states.get(model.localPath) ?? {
            path: model.localPath,
            status: 'unverified' as const,
            reason: 'No file check result'
          }
          this.modelFileStates[model.localPath] = result
          if (result.status === 'unverified') warnings.push(`${model.path}: ${result.reason}`)
        }
        this.localModelScan = warnings.length
          ? { status: 'partial', error: warnings.join('\n') }
          : { status: 'success' }
        this.syncProfile()
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        for (const model of snapshot) {
          if (isCurrent(model))
            this.modelFileStates[model.localPath] = {
              path: model.localPath,
              status: 'unverified',
              reason: message
            }
        }
        this.localModelScan = { status: 'failed', error: message }
        this.syncProfile()
        throw error
      })
      .finally(() => {
        if (this.catalogueFlight === promise) {
          this.catalogueFlight = undefined
          this.scanDeletedPaths = undefined
        }
      })
    this.catalogueFlight = promise
    return promise
  }
  syncProfile() {
    const s = this.settings
    this.selectedModel = this.localModels.find((m) => modelFileKey(m) === s.selectedModelKey)
    const p = s.selectedModelKey ? s.modelProfiles[s.selectedModelKey] : undefined
    this.profile = {
      ...this.profile,
      ...s.service,
      ...p?.base,
      modelPath: this.selectedModel?.localPath ?? ''
    }
  }

  request<T>(method: string, ...args: unknown[]) {
    return this.transport.request<T>(method, args, () => {})
  }

  async fetchRuntimeVariants(channel: RuntimeChannel = 'stable', refresh = false) {
    await this.init()
    if (!refresh && this.runtimeVariants[channel]) return this.runtimeVariants[channel]
    if (this.runtimeRequests[channel]) return this.runtimeRequests[channel]
    const request = this.request<RuntimeVariant[]>('fetchRuntimeVariants', channel)
      .then((variants) => {
        this.runtimeVariants[channel] = variants
        return variants
      })
      .finally(() => {
        delete this.runtimeRequests[channel]
      })
    this.runtimeRequests[channel] = request
    return request
  }

  async searchHubModels(query: string, page = 0, refresh = false) {
    await this.init()
    const normalizedQuery = query.trim()
    const key = JSON.stringify([normalizedQuery, page])
    if (!refresh && this.hubCatalog.pages[key]) return this.hubCatalog.pages[key]
    if (this.hubPageRequests[key]) return this.hubPageRequests[key]
    const generation = this.hubPagesGeneration
    const request = this.request<HubModel[]>('searchHubModels', normalizedQuery, page)
      .then((models) => {
        if (refresh) {
          this.hubCatalog.pages = {}
          this.hubCatalog.files = {}
          this.hubPageRequests = {}
          this.hubFileRequests = {}
          this.hubPagesGeneration++
          this.hubFilesGeneration++
        }
        if (refresh || generation === this.hubPagesGeneration) {
          this.hubCatalog.pages[key] = models
        }
        return models
      })
      .finally(() => {
        if (this.hubPageRequests[key] === request) delete this.hubPageRequests[key]
      })
    this.hubPageRequests[key] = request
    return request
  }

  async getHubModelFiles(repoId: string, revision = 'main') {
    await this.init()
    const key = JSON.stringify([repoId, revision])
    if (this.hubCatalog.files[key]) return this.hubCatalog.files[key]
    if (this.hubFileRequests[key]) return this.hubFileRequests[key]
    const generation = this.hubFilesGeneration
    const request = this.request<HubModelFile[]>('getHubModelFiles', repoId, revision)
      .then((files) => {
        if (generation === this.hubFilesGeneration) {
          this.hubCatalog.files[key] = files
        }
        return files
      })
      .finally(() => {
        if (this.hubFileRequests[key] === request) delete this.hubFileRequests[key]
      })
    this.hubFileRequests[key] = request
    return request
  }

  ensureModelLibrary() {
    if (this.modelLibraryRequest) return this.modelLibraryRequest.promise
    if (this.modelView.loaded) return Promise.resolve(this.modelView.results)
    return this.searchModelLibrary(this.modelView.page)
  }

  searchModelLibrary(targetPage = 0, refresh = false) {
    const key = JSON.stringify([this.modelView.query.trim(), targetPage, refresh])
    if (this.modelLibraryRequest?.key === key) return this.modelLibraryRequest.promise
    const generation = ++this.modelLibraryGeneration
    this.modelView.searching = true
    this.modelView.error = ''
    const request = this.searchHubModels(this.modelView.query, targetPage, refresh)
      .then((listed) => {
        if (generation !== this.modelLibraryGeneration) return listed
        this.modelView.results = listed
        this.modelView.page = targetPage
        this.modelView.files = {}
        this.modelView.expandedRowKeys = []
        this.modelViewFileRequests = {}
        this.modelView.loaded = true
        this.modelViewGeneration++
        return listed
      })
      .catch((error) => {
        if (generation !== this.modelLibraryGeneration) return this.modelView.results
        this.modelView.error = error instanceof Error ? error.message : `${error}`
        throw error
      })
      .finally(() => {
        if (generation === this.modelLibraryGeneration) {
          this.modelLibraryRequest = undefined
          this.modelView.searching = false
        }
      })
    this.modelLibraryRequest = { key, promise: request }
    return request
  }

  setExpandedModelRepos(keys: string[]) {
    this.modelView.expandedRowKeys = [...keys]
    const generation = this.modelViewGeneration
    return Promise.all(
      keys.map((key) => {
        const model = this.modelView.results.find((item) => item.id === key)
        if (!model || this.modelView.files[key]) return Promise.resolve()
        if (this.modelViewFileRequests[key]) return this.modelViewFileRequests[key]
        const request = this.getHubModelFiles(model.id)
          .then((listed) => {
            if (generation === this.modelViewGeneration)
              this.modelView.files[key] = listed.map((file) => ({
                ...file,
                license: model.license
              }))
          })
          .catch((error) => {
            if (generation !== this.modelViewGeneration) return
            this.modelView.error = error instanceof Error ? error.message : `${error}`
            throw error
          })
          .finally(() => {
            if (this.modelViewFileRequests[key] === request) delete this.modelViewFileRequests[key]
          })
        this.modelViewFileRequests[key] = request
        return request
      })
    ).then(() => undefined)
  }

  createApiKeyFile(key: string) {
    return this.transport.request<string>('createApiKeyFile', [key], () => {}, true)
  }

  async saveProfile(profile = this.profile) {
    await this.repository.commitService(
      {
        ...this.settings.service,
        host: profile.host,
        port: profile.port,
        apiKeyFile: profile.apiKeyFile
      },
      this.settings.service.revision
    )
    this.syncProfile()
  }
  async selectModel(model: LocalModel) {
    if (!isRunnableLocalModel(model)) throw Error('Select a standalone GGUF model')
    const key = modelFileKey(model)
    if (!this.settings.modelProfiles[key])
      await this.repository.commitProfile(createModelProfile(model, this.settings.initialBase), 0)
    await this.repository.selectModel(key)
    this.syncProfile()
  }
  async startParameters(version: SoftInstalled): Promise<[LaunchInput]> {
    await this.init()
    if (this.mutationGate.blocked) throw Error('Refresh unknown service state before starting')
    if (this.launchOverride) {
      if (this.launchOverride.bin !== version.bin) throw Error('Runtime changed during application')
      return [clone(this.launchOverride.input)]
    }
    if (this.mutationGate.busy) throw Error('Wait for current llama.cpp operation')
    return [this.launchInput()]
  }

  async switchModel(model: LocalModel, service?: ModelService) {
    return this.mutationGate.run('switch', modelFileKey(model), async () => {
      await this.init()
      if (this.selectedModel?.localPath === model.localPath) return
      this.modelSwitchOperation = { targetPath: model.localPath, status: 'starting' }
      const operation = this.modelSwitchOperation
      let stopped = false
      const previous = this.selectedModel
      let oldState: import('../shared/settings').LaunchState | undefined
      try {
        oldState = await this.launch.refreshState()
        if (service?.running) throw Error('Wait for service operation')
        const key = modelFileKey(model)
        if (!this.settings.modelProfiles[key])
          await this.repository.commitProfile(
            createModelProfile(model, this.settings.initialBase),
            0
          )
        const input = this.launchInput(key)
        if (service) {
          const report = await this.request<any>('prepareModelLaunch', input, service)
          if (!report.prepared) throw Error(report.issues.map((i: any) => i.message).join('\n'))
        }
        if (service?.run) {
          operation.status = 'stopping'
          const result = await service.stop()
          if (result !== true) throw Error(String(result))
          stopped = true
        }
        await this.selectModel(model)
        if (stopped && service) {
          operation.status = 'startingService'
          const result = await this.withLaunchInput(
            input,
            service as unknown as SoftInstalled,
            () => service.start()
          )
          if (result !== true) throw Error(String(result))
        }
        operation.status = 'success'
      } catch (e) {
        const messages = [e instanceof Error ? e.message : String(e)]
        const state = await this.launch.refreshState().catch(() => ({ kind: 'unknown' }))
        if (previous) {
          try {
            await this.selectModel(previous)
          } catch (restore) {
            messages.push(String(restore))
          }
        }
        if (stopped && service && state.kind === 'stopped' && oldState?.active) {
          try {
            const result = await this.withLaunchInput(
              oldState.active.launch.resolvedInput,
              service as unknown as SoftInstalled,
              () => service.start()
            )
            if (result !== true) throw Error(String(result))
          } catch (restore) {
            messages.push('Recovery failed: ' + restore)
          }
        }
        operation.status = 'failed'
        operation.error = messages.join('; ')
        this.reportOperationError(operation.error)
        throw Error(operation.error)
      }
    })
  }

  getRuntimeOperation(target: RuntimeIdentity | string) {
    const key =
      typeof target === 'string'
        ? target.replace(/\\/g, '/').split('/').pop()!
        : runtimeDirectoryName(target)
    return this.runtimeOperations[key.toLowerCase()]
  }

  private beginRuntimeOperation(target: RuntimeIdentity | string, id: string) {
    const current = this.getRuntimeOperation(target)
    if (current && !['success', 'failed', 'cancelled'].includes(current.status)) {
      const message = 'An operation for this runtime is already in progress'
      this.reportOperationError(message)
      throw new Error(message)
    }
    const key =
      typeof target === 'string'
        ? target.replace(/\\/g, '/').split('/').pop()!
        : runtimeDirectoryName(target)
    this.runtimeOperations[key.toLowerCase()] = { id, status: 'starting' }
    // Read through reactiveBind's proxy so progress and terminal changes reach the view.
    return this.getRuntimeOperation(target)!
  }

  private refreshRuntime(active: OperationState, target?: RuntimeRefreshTarget) {
    // Downloads run concurrently; list scans run in order so a later completion
    // cannot join an earlier scan that predates its filesystem changes.
    const request = (this.runtimeRefresh ?? Promise.resolve())
      .catch(() => {})
      .then(() => this.refreshInstalled(target))
      .catch((error) => {
        active.error = `Runtime operation completed, but the installed list could not be refreshed: ${error instanceof Error ? error.message : `${error}`}`
        this.error = active.error
        this.reportOperationError(active.error)
      })
    this.runtimeRefresh = request
    return request.finally(() => {
      if (this.runtimeRefresh === request) this.runtimeRefresh = undefined
    })
  }

  async installRuntime(variant: RuntimeVariant) {
    const snapshot = storageSnapshot(variant)
    const active = this.beginRuntimeOperation(snapshot, runtimeIdentityKey(snapshot))
    this.error = ''
    try {
      active.result = await this.transport.request(
        'installRuntimeVariant',
        [snapshot],
        (progress) => {
          active.status = 'running'
          active.progress = progress
        }
      )
      const installedPath = (active.result as { path?: string } | undefined)?.path
      await this.refreshRuntime(
        active,
        installedPath ? { path: installedPath, installed: true } : undefined
      )
      active.status = 'success'
      return active.result
    } catch (error) {
      active.status = 'failed'
      active.error = error instanceof Error ? error.message : `${error}`
      this.error = active.error
      this.reportOperationError(active.error)
      throw error
    }
  }

  removeRuntime(path: string) {
    return this.mutationGate.run('remove-runtime', path, () => this.performRemoveRuntime(path))
  }
  private async performRemoveRuntime(path: string) {
    const active = this.beginRuntimeOperation(path, path)
    this.error = ''
    try {
      active.result = await this.transport.request('removeRuntimeVariant', [path], () => {})
      await this.refreshRuntime(active, { path, installed: false })
      active.status = 'success'
      return active.result
    } catch (error) {
      active.status = 'failed'
      active.error = error instanceof Error ? error.message : `${error}`
      this.error = active.error
      this.reportOperationError(active.error)
      throw error
    }
  }

  downloadModel(file: HubModelFile, operationId?: string) {
    return this.mutationGate.run('download', modelFileKey(file), () =>
      this.performModelDownload(file, operationId)
    )
  }
  private async performModelDownload(
    file: HubModelFile,
    operationId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  ) {
    if (
      this.modelOperation &&
      !['success', 'failed', 'cancelled'].includes(this.modelOperation.status)
    ) {
      throw new Error('A model download is already in progress')
    }
    const operation: OperationState = {
      id: operationId,
      targetKey: modelFileKey(file),
      targetFile: storageSnapshot(file),
      status: 'starting'
    }
    this.modelOperation = operation
    const active = this.modelOperation
    this.error = ''
    try {
      const model = await this.transport.request<LocalModel>(
        'downloadHubModelFile',
        [operationId, file, this.modelsRoot],
        (progress) => {
          if (active.status === 'cancelling') return
          active.status = 'running'
          active.progress = progress
        }
      )
      active.result = model
      return await this.writeCatalogue(async () => {
        const i = this.catalogueFiles.findIndex((item) => item.localPath === model.localPath)
        if (i < 0) this.catalogueFiles.push(model)
        else this.catalogueFiles.splice(i, 1, model)
        this.modelFileStates[model.localPath] = { path: model.localPath, status: 'available' }
        try {
          await StorageSetAsync(modelsKey, storageSnapshot(this.catalogueFiles))
        } catch (error) {
          active.status = 'partial'
          active.error = 'File downloaded; catalogue registration failed: ' + String(error)
          this.error = active.error
          return model
        }
        this.syncProfile()
        active.status = 'success'
        return model
      })
    } catch (error) {
      active.status = active.status === 'cancelling' ? 'cancelled' : 'failed'
      active.error = error instanceof Error ? error.message : `${error}`
      if (active.status === 'failed') this.error = active.error
      throw error
    }
  }

  retryModelRegistration() {
    return this.mutationGate.run('register-download', this.modelOperation?.id ?? '', () =>
      this.registerDownloadedModel()
    )
  }
  private async registerDownloadedModel() {
    const op = this.modelOperation
    if (!op || op.status !== 'partial') return
    try {
      await this.writeCatalogue(() =>
        StorageSetAsync(modelsKey, storageSnapshot(this.catalogueFiles))
      )
      op.status = 'success'
      op.error = undefined
      this.error = ''
    } catch (e) {
      op.error = 'File downloaded; catalogue registration failed: ' + String(e)
      this.error = op.error
      throw e
    }
  }

  async cancelModelDownload(operationId = this.modelOperation?.id) {
    const operation = this.modelOperation
    if (
      !operation ||
      operation.id !== operationId ||
      !['starting', 'running'].includes(operation.status)
    )
      return false
    operation.status = 'cancelling'
    try {
      const accepted = await this.transport.request<boolean>(
        'cancelModelDownload',
        [operation.id],
        () => {}
      )
      if (!accepted) {
        if (operation.status === 'cancelling') operation.status = 'running'
        throw new Error('Model download cancellation was not accepted by the Fork worker')
      }
    } catch (error) {
      if (operation.status === 'cancelling') operation.status = 'running'
      operation.error = error instanceof Error ? error.message : `${error}`
      this.error = operation.error
      throw error
    }
    return true
  }

  private deletedPaths = new Set<string>()
  async deleteModel(model: LocalModel) {
    return this.mutationGate.run('delete', model.localPath, async () => {
      const key = modelFileKey(model)
      if (!this.deletedPaths.has(model.localPath)) {
        const usages = collectModelReferences(this.settings, key, this.catalogueFiles)
        if (usages.length)
          throw Error(
            'Unlink this file from models before deleting: ' +
              usages.map((u) => JSON.parse(u.modelKey)[2]).join(', ')
          )
        await this.request(
          'deleteLocalModel',
          model.localPath,
          model.managedRoot || this.modelsRoot
        )
        this.deletedPaths.add(model.localPath)
        this.scanDeletedPaths?.add(model.localPath)
      }
      try {
        await this.writeCatalogue(async () => {
          const files = this.catalogueFiles.filter((m) => m.localPath !== model.localPath)
          await StorageSetAsync(modelsKey, storageSnapshot(files))
          await this.repository.removeProfile(key)
          this.catalogueFiles = files
          delete this.modelFileStates[model.localPath]
          this.syncProfile()
          this.deletedPaths.delete(model.localPath)
        })
      } catch (e) {
        throw Error('File deleted; retry metadata cleanup: ' + e)
      }
    })
  }

  clearError() {
    this.error = ''
  }
}

export const LlamaCppManager = reactiveBind(
  new LlamaCppController(productionTransport, refreshInstalledRuntimes, notifyOperationError)
)
