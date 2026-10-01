import { reactiveBind } from '@/util/Index'
import { StorageGetAsync, StorageRemoveAsync, StorageSetAsync } from '@/util/Storage'
import type {
  HubModel,
  HubModelFile,
  LaunchProfile,
  LocalModel,
  RuntimeVariant
} from '../shared/types'
import { runtimeIdentityKey } from '../shared/runtime'
import { escapeNoticeText } from './notice'

export interface OperationState {
  id: string
  targetKey?: string
  targetFile?: HubModelFile
  status: 'starting' | 'running' | 'cancelling' | 'success' | 'failed' | 'cancelled'
  progress?: { downloaded?: number; total?: number; status?: string; asset?: string }
  result?: unknown
  error?: string
}

export interface ModelService {
  run: boolean
  running: boolean
  stop(): Promise<string | boolean>
  start(): Promise<string | boolean>
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
  module.installedFetched = false
  await module.fetchInstalled(true)
  if (!module.installedFetched) throw new Error('Could not refresh installed llama.cpp runtimes')
  if (module.installed.some((item) => item.path === target.path) !== target.installed) {
    throw new Error('Installed llama.cpp runtimes did not reflect the operation')
  }
}

const notifySwitchError = (message: string) => {
  import('@/util/Element')
    .then(({ MessageError }) => MessageError(escapeNoticeText(message)))
    .catch(() => {})
}

const settingsKey = 'flyenv-llama-cpp-settings'
const modelsKey = 'flyenv-llama-cpp-models'
const runtimeVariantsKey = 'flyenv-llama-cpp-runtime-variants'
const hubCatalogKey = 'flyenv-llama-cpp-hub-catalog'
type RuntimeChannel = 'stable' | 'prerelease'
type HubCatalog = { pages: Record<string, HubModel[]>; files: Record<string, HubModelFile[]> }

export const modelFileKey = (file: Pick<HubModelFile, 'repoId' | 'revision' | 'path'>) =>
  JSON.stringify([file.repoId, file.revision, file.path])

export class LlamaCppController {
  runtimeOperation?: OperationState
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
  localModels: LocalModel[] = []
  private runtimeVariants: Partial<Record<RuntimeChannel, RuntimeVariant[]>> = {}
  private runtimeRequests: Partial<Record<RuntimeChannel, Promise<RuntimeVariant[]>>> = {}
  private hubCatalog: HubCatalog = { pages: {}, files: {} }
  private hubPageRequests: Partial<Record<string, Promise<HubModel[]>>> = {}
  private hubFileRequests: Partial<Record<string, Promise<HubModelFile[]>>> = {}
  private hubPagesGeneration = 0
  private hubFilesGeneration = 0
  private initialized = false
  private initRequest?: Promise<void>

  constructor(
    private transport: ControllerTransport = productionTransport,
    private refreshInstalled: (target?: RuntimeRefreshTarget) => Promise<void> = async () => {},
    private reportSwitchError: (message: string) => void = () => {}
  ) {}

  async init() {
    if (this.initialized) return
    if (this.initRequest) return this.initRequest
    this.initRequest = (async () => {
      const saved = await StorageGetAsync<{ profile?: LaunchProfile; selectedModel?: LocalModel }>(
        settingsKey
      ).catch(() => undefined)
      const models = await StorageGetAsync<LocalModel[]>(modelsKey).catch(() => undefined)
      await Promise.allSettled([
        StorageRemoveAsync(runtimeVariantsKey),
        StorageRemoveAsync(hubCatalogKey)
      ])
      if (saved?.profile) this.profile = { ...this.profile, ...saved.profile }
      if (saved?.selectedModel) this.selectedModel = saved.selectedModel
      this.localModels = Array.isArray(models) ? models : []
      this.initialized = true
    })().finally(() => {
      this.initRequest = undefined
    })
    return this.initRequest
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

  createApiKeyFile(key: string) {
    return this.transport.request<string>('createApiKeyFile', [key], () => {}, true)
  }

  async saveProfile(profile = this.profile) {
    this.profile = { ...profile }
    await StorageSetAsync(
      settingsKey,
      storageSnapshot({ profile: this.profile, selectedModel: this.selectedModel })
    )
  }

  async selectModel(model: LocalModel) {
    this.selectedModel = model
    this.profile.modelPath = model.localPath
    await StorageSetAsync(
      settingsKey,
      storageSnapshot({ profile: this.profile, selectedModel: model })
    )
  }

  async startParameters(backend: string): Promise<[LaunchProfile, LocalModel]> {
    await this.init()
    const model = this.selectedModel
    if (!model) throw new Error('Select a local GGUF model before starting llama.cpp')
    this.profile.modelPath = model.localPath
    this.profile.backend = backend as LaunchProfile['backend']
    await this.saveProfile()
    return storageSnapshot([this.profile, model])
  }

  async switchModel(model: LocalModel, service?: ModelService) {
    if (
      this.modelSwitchOperation &&
      !['success', 'failed'].includes(this.modelSwitchOperation.status)
    ) {
      const message = 'A model switch is already in progress'
      this.reportSwitchError(message)
      throw new Error(message)
    }
    const operation: ModelSwitchOperation = { targetPath: model.localPath, status: 'starting' }
    this.modelSwitchOperation = operation
    const active = this.modelSwitchOperation
    let previous: LocalModel | undefined
    let stopped = false
    try {
      await this.init()
      previous = this.selectedModel
      if (!this.localModels.some((item) => item.localPath === model.localPath)) {
        throw new Error('The selected model is no longer installed')
      }
      if (this.selectedModel?.localPath === model.localPath) {
        active.status = 'success'
        return
      }
      if (service?.running) throw new Error('Wait for the current service operation to finish')
      const wasRunning = service?.run === true
      if (wasRunning) {
        active.status = 'stopping'
        const result = await service.stop()
        if (result !== true)
          throw new Error(typeof result === 'string' ? result : 'Could not stop llama.cpp')
        stopped = true
      }
      await this.selectModel(model)
      if (wasRunning) {
        active.status = 'startingService'
        const result = await service.start()
        if (result !== true)
          throw new Error(typeof result === 'string' ? result : 'Could not restart llama.cpp')
      }
      active.status = 'success'
    } catch (error) {
      const recoveryErrors: string[] = []
      if (this.selectedModel?.localPath === model.localPath) {
        try {
          if (previous) await this.selectModel(previous)
          else {
            this.selectedModel = undefined
            this.profile.modelPath = ''
            await this.saveProfile()
          }
        } catch (restoreError) {
          recoveryErrors.push(`Could not restore model selection: ${restoreError}`)
        }
      }
      if (stopped && service && !service.run && previous) {
        try {
          const result = await service.start()
          if (result !== true)
            throw new Error(
              typeof result === 'string' ? result : 'Could not restart the previous model'
            )
        } catch (restoreError) {
          recoveryErrors.push(`Could not restart the previous model: ${restoreError}`)
        }
      }
      const message = [error instanceof Error ? error.message : `${error}`, ...recoveryErrors].join(
        '; '
      )
      active.status = 'failed'
      active.error = message
      this.error = message
      this.reportSwitchError(message)
      throw new Error(message)
    }
  }

  async installRuntime(variant: RuntimeVariant) {
    const id = runtimeIdentityKey(variant)
    if (
      this.runtimeOperation &&
      !['success', 'failed', 'cancelled'].includes(this.runtimeOperation.status)
    ) {
      throw new Error('A runtime installation is already in progress')
    }
    const operation: OperationState = { id, status: 'starting' }
    this.runtimeOperation = operation
    // Read through reactiveBind's proxy so progress and terminal changes reach the view.
    const active = this.runtimeOperation
    this.error = ''
    try {
      active.result = await this.transport.request(
        'installRuntimeVariant',
        [variant],
        (progress) => {
          active.status = 'running'
          active.progress = progress
        }
      )
      const installedPath = (active.result as { path?: string } | undefined)?.path
      await this.refreshInstalled(
        installedPath ? { path: installedPath, installed: true } : undefined
      )
      active.status = 'success'
      return active.result
    } catch (error) {
      active.status = 'failed'
      active.error = error instanceof Error ? error.message : `${error}`
      this.error = active.error
      throw error
    }
  }

  async removeRuntime(path: string) {
    if (
      this.runtimeOperation &&
      !['success', 'failed', 'cancelled'].includes(this.runtimeOperation.status)
    ) {
      throw new Error('A runtime operation is already in progress')
    }
    const operation: OperationState = { id: path, status: 'starting' }
    this.runtimeOperation = operation
    const active = this.runtimeOperation
    this.error = ''
    try {
      active.result = await this.transport.request('removeRuntimeVariant', [path], () => {})
      await this.refreshInstalled({ path, installed: false })
      active.status = 'success'
      return active.result
    } catch (error) {
      active.status = 'failed'
      active.error = error instanceof Error ? error.message : `${error}`
      this.error = active.error
      throw error
    }
  }

  async downloadModel(
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
        [operationId, file],
        (progress) => {
          if (active.status === 'cancelling') return
          active.status = 'running'
          active.progress = progress
        }
      )
      active.result = model
      if (!this.localModels.some((item) => item.localPath === model.localPath))
        this.localModels.push(model)
      await StorageSetAsync(modelsKey, storageSnapshot(this.localModels))
      if (!this.selectedModel) await this.selectModel(model)
      active.status = 'success'
      return model
    } catch (error) {
      active.status = active.status === 'cancelling' ? 'cancelled' : 'failed'
      active.error = error instanceof Error ? error.message : `${error}`
      if (active.status === 'failed') this.error = active.error
      throw error
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
      await this.transport.request<boolean>('cancelModelDownload', [operation.id], () => {})
    } catch (error) {
      operation.status = 'failed'
      operation.error = error instanceof Error ? error.message : `${error}`
      this.error = operation.error
      throw error
    }
    return true
  }

  async deleteModel(model: LocalModel) {
    await this.transport.request('deleteLocalModel', [model.localPath], () => {})
    this.localModels = this.localModels.filter((item) => item.localPath !== model.localPath)
    await StorageSetAsync(modelsKey, storageSnapshot(this.localModels))
    if (this.selectedModel?.localPath === model.localPath) {
      this.selectedModel = this.localModels[0]
      this.profile.modelPath = this.selectedModel?.localPath ?? ''
      await StorageSetAsync(
        settingsKey,
        storageSnapshot({ profile: this.profile, selectedModel: this.selectedModel })
      )
    }
  }

  clearError() {
    this.error = ''
  }
}

export const LlamaCppManager = reactiveBind(
  new LlamaCppController(productionTransport, refreshInstalledRuntimes, notifySwitchError)
)
