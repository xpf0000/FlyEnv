import { reactiveBind } from '@/util/Index'
import { StorageGetAsync, StorageSetAsync } from '@/util/Storage'
import type { HubModel, HubModelFile, LaunchProfile, LocalModel, RuntimeVariant } from '../shared/types'
import { runtimeIdentityKey } from '../shared/runtime'

export interface OperationState {
  id: string
  status: 'starting' | 'running' | 'cancelling' | 'success' | 'failed' | 'cancelled'
  progress?: { downloaded?: number; total?: number; status?: string; asset?: string }
  result?: unknown
  error?: string
}

export interface ControllerTransport {
  request<T>(method: string, args: unknown[], onProgress: (data: any) => void, sensitive?: boolean): Promise<T>
}

export interface IpcBridge {
  send(command: string, ...args: unknown[]): { then(callback: (key: string, response: any) => void): void }
  sendSensitive(command: string, ...args: unknown[]): { then(callback: (key: string, response: any) => void): void }
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
    return import('@/util/IPC').then(({ default: IPC }) => createControllerTransport(IPC).request<T>(method, args, onProgress, sensitive))
      .catch((error) => Promise.reject(error))
  }
}

const settingsKey = 'flyenv-llama-cpp-settings'
const modelsKey = 'flyenv-llama-cpp-models'
const runtimeVariantsKey = 'flyenv-llama-cpp-runtime-variants'
type RuntimeChannel = 'stable' | 'prerelease'

export class LlamaCppController {
  runtimeOperation?: OperationState
  modelOperation?: OperationState
  error = ''
  profile: LaunchProfile = {
    modelPath: '', backend: 'cpu', host: '127.0.0.1', port: 8080, contextSize: 8192, threads: 4, gpuLayers: 0
  }
  selectedModel?: LocalModel
  localModels: LocalModel[] = []
  private runtimeVariants: Partial<Record<RuntimeChannel, RuntimeVariant[]>> = {}
  private runtimeRequests: Partial<Record<RuntimeChannel, Promise<RuntimeVariant[]>>> = {}
  private initialized = false

  constructor(private transport: ControllerTransport = productionTransport) {}

  async init() {
    if (this.initialized) return
    const saved = await StorageGetAsync<{ profile?: LaunchProfile; selectedModel?: LocalModel }>(settingsKey).catch(() => undefined)
    const models = await StorageGetAsync<LocalModel[]>(modelsKey).catch(() => undefined)
    const cachedVariants = await StorageGetAsync<Partial<Record<RuntimeChannel, RuntimeVariant[]>>>(runtimeVariantsKey).catch(() => undefined)
    if (saved?.profile) this.profile = { ...this.profile, ...saved.profile }
    if (saved?.selectedModel) this.selectedModel = saved.selectedModel
    this.localModels = Array.isArray(models) ? models : []
    if (cachedVariants) {
      for (const channel of ['stable', 'prerelease'] as const) {
        if (Array.isArray(cachedVariants[channel])) this.runtimeVariants[channel] = cachedVariants[channel]
      }
    }
    this.initialized = true
  }

  request<T>(method: string, ...args: unknown[]) {
    return this.transport.request<T>(method, args, () => {})
  }

  async fetchRuntimeVariants(channel: RuntimeChannel = 'stable', refresh = false) {
    await this.init()
    if (!refresh && this.runtimeVariants[channel]) return this.runtimeVariants[channel]
    if (this.runtimeRequests[channel]) return this.runtimeRequests[channel]
    const request = this.request<RuntimeVariant[]>('fetchRuntimeVariants', channel)
      .then(async (variants) => {
        this.runtimeVariants[channel] = variants
        await StorageSetAsync(runtimeVariantsKey, storageSnapshot(this.runtimeVariants)).catch(() => {})
        return variants
      })
      .finally(() => { delete this.runtimeRequests[channel] })
    this.runtimeRequests[channel] = request
    return request
  }

  searchHubModels(query: string, page = 0) {
    return this.request<HubModel[]>('searchHubModels', query, page)
  }

  getHubModelFiles(repoId: string, revision = 'main') {
    return this.request<HubModelFile[]>('getHubModelFiles', repoId, revision)
  }

  createApiKeyFile(key: string) {
    return this.transport.request<string>('createApiKeyFile', [key], () => {}, true)
  }

  async saveProfile(profile = this.profile) {
    this.profile = { ...profile }
    await StorageSetAsync(settingsKey, storageSnapshot({ profile: this.profile, selectedModel: this.selectedModel }))
  }

  async selectModel(model: LocalModel) {
    this.selectedModel = model
    this.profile.modelPath = model.localPath
    await StorageSetAsync(settingsKey, storageSnapshot({ profile: this.profile, selectedModel: model }))
  }

  async installRuntime(variant: RuntimeVariant) {
    const id = runtimeIdentityKey(variant)
    if (this.runtimeOperation && !['success', 'failed', 'cancelled'].includes(this.runtimeOperation.status)) {
      throw new Error('A runtime installation is already in progress')
    }
    const operation: OperationState = { id, status: 'starting' }
    this.runtimeOperation = operation
    this.error = ''
    try {
      operation.result = await this.transport.request('installRuntimeVariant', [variant], (progress) => {
        operation.status = 'running'
        operation.progress = progress
      })
      operation.status = 'success'
      return operation.result
    } catch (error) {
      operation.status = 'failed'
      operation.error = error instanceof Error ? error.message : `${error}`
      this.error = operation.error
      throw error
    }
  }

  async removeRuntime(path: string) {
    if (this.runtimeOperation && !['success', 'failed', 'cancelled'].includes(this.runtimeOperation.status)) {
      throw new Error('A runtime operation is already in progress')
    }
    const operation: OperationState = { id: path, status: 'starting' }
    this.runtimeOperation = operation
    this.error = ''
    try {
      operation.result = await this.transport.request('removeRuntimeVariant', [path], () => {})
      operation.status = 'success'
      return operation.result
    } catch (error) {
      operation.status = 'failed'
      operation.error = error instanceof Error ? error.message : `${error}`
      this.error = operation.error
      throw error
    }
  }

  async downloadModel(file: HubModelFile, operationId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`) {
    if (this.modelOperation && !['success', 'failed', 'cancelled'].includes(this.modelOperation.status)) {
      throw new Error('A model download is already in progress')
    }
    const operation: OperationState = { id: operationId, status: 'starting' }
    this.modelOperation = operation
    this.error = ''
    try {
      const model = await this.transport.request<LocalModel>('downloadHubModelFile', [operationId, file], (progress) => {
        operation.status = 'running'
        operation.progress = progress
      })
      operation.result = model
      operation.status = 'success'
      if (!this.localModels.some((item) => item.localPath === model.localPath)) this.localModels.push(model)
      await StorageSetAsync(modelsKey, storageSnapshot(this.localModels))
      return model
    } catch (error) {
      operation.status = operation.status === 'cancelling' ? 'cancelled' : 'failed'
      operation.error = error instanceof Error ? error.message : `${error}`
      if (operation.status === 'failed') this.error = operation.error
      throw error
    }
  }

  async cancelModelDownload(operationId = this.modelOperation?.id) {
    const operation = this.modelOperation
    if (!operation || operation.id !== operationId || !['starting', 'running'].includes(operation.status)) return false
    operation.status = 'cancelling'
    try { await this.transport.request<boolean>('cancelModelDownload', [operation.id], () => {}) } catch (error) {
      operation.status = 'failed'
      operation.error = error instanceof Error ? error.message : `${error}`
      this.error = operation.error
      throw error
    }
    return true
  }

  async deleteModel(model: LocalModel) {
    if (this.selectedModel?.localPath === model.localPath) throw new Error('Stop the server and select another model before deleting this model')
    await this.transport.request('deleteLocalModel', [model.localPath, this.selectedModel?.localPath], () => {})
    this.localModels = this.localModels.filter((item) => item.localPath !== model.localPath)
    await StorageSetAsync(modelsKey, storageSnapshot(this.localModels))
  }

  clearError() { this.error = '' }
}

export const LlamaCppManager = reactiveBind(new LlamaCppController())
