import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Base } from '@fork/module/Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import { ForkPromise } from '@shared/ForkPromise'
import { fetchRuntimeReleases, normalizeRuntimeHost } from '../release'
import { installRuntime, removeRuntime, runtimeDirectoryName, runtimePathsForHost, type RuntimePaths } from '../runtime'
import type { RuntimeHost, RuntimeVariant } from '../../shared/types'
import { deleteLocalModel as deleteLocalModelImpl, downloadHubModelFile as downloadHubModelFileImpl, getHubModelFiles as getHubModelFilesImpl, searchHubModels as searchHubModelsImpl } from '../models'
import type { HubModelFile } from '../../shared/types'
import axios from 'axios'
import { serviceStartSpawn } from '@fork/util/ServiceStart'
import { AppLog } from '@fork/Fn'
import { StopProcessListFetch } from '@shared/StopProcessList'
import type { PItem } from '@shared/Process'
import { assertInvocationSupported, buildServerInvocation, createApiKeyFile, formatUrlHost, readServerHelp, validateApiKeyFile, validateLaunchProfile, validateManagedModelPath, variantFromInstalled, waitForServerHealth, waitForServerStopped } from '../config'
import type { LaunchProfile, LocalModel } from '../../shared/types'

export interface LlamaCppDeps {
  getHost(): RuntimeHost | undefined
  getPaths(): RuntimePaths
  fetchReleases(channel: 'stable' | 'prerelease', host: RuntimeHost): Promise<RuntimeVariant[]>
  install(variant: RuntimeVariant, paths: RuntimePaths, progress?: (assetName: string, downloaded: number, total?: number) => void): Promise<SoftInstalled>
  remove(path: string, root: string): Promise<void>
  read(path: string): Promise<string>
  list(path: string): Promise<string[]>
  exists(path: string): boolean
}

const productionDeps: LlamaCppDeps = {
  getHost: () => normalizeRuntimeHost(),
  getPaths: () => runtimePathsForHost(global.Server.BaseDir!),
  fetchReleases: fetchRuntimeReleases,
  install: (variant, paths, progress) => installRuntime(variant, paths, undefined, progress),
  remove: (path, root) => removeRuntime(path, root),
  read: (path) => readFile(path, 'utf8'),
  list: (path) => readdir(path),
  exists: existsSync
}

export const isManagedModelActive = (processes: PItem[], baseDir: string, target: string, pid = '') => {
  const managedRoot = join(baseDir, 'llama-cpp').replace(/\\/g, '/').toLowerCase()
  const modelRoot = join(baseDir, 'llama-cpp', 'models').replace(/\\/g, '/').toLowerCase()
  const targetPath = target.replace(/\\/g, '/').toLowerCase()
  return processes.some((process) => {
    const command = process.COMMAND.replace(/\\/g, '/').toLowerCase()
    if (!/(?:^|\/)llama-server(?:\.exe)?(?:["'\s]|$)/.test(command)) return false
    if (!command.includes(`${managedRoot}/`) && (!pid || process.PID !== pid)) return false
    if (command.includes(targetPath)) return true
    // A different managed GGUF is visible in argv; permit deleting this inactive model.
    // If the process list truncated argv, keep deletion blocked rather than guessing.
    return !command.includes(`${modelRoot}/`) || !command.includes('.gguf')
  })
}

export class LlamaCppModule extends Base {
  private deps: LlamaCppDeps
  private modelDownloads = new Map<string, AbortController>()
  private activeRuntime?: SoftInstalled
  private runtimeMutationInProgress = false
  private serverStarting = false

  constructor(deps: LlamaCppDeps = productionDeps) {
    super()
    this.type = 'llama-cpp'
    this.deps = deps
  }

  fetchRuntimeVariants(channel: 'stable' | 'prerelease' = 'stable') {
    return new ForkPromise<RuntimeVariant[]>(async (resolve, reject) => {
      const host = this.deps.getHost()
      if (!host) return reject(new Error('Unsupported operating system or architecture'))
      try { resolve(await this.deps.fetchReleases(channel, host)) } catch (error) { reject(error) }
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise<OnlineVersionItem[]>(async (resolve, reject) => {
      const host = this.deps.getHost()
      if (!host) return reject(new Error('Unsupported operating system or architecture'))
      try {
        const variants = await this.deps.fetchReleases('stable', host)
        resolve(variants.map((variant) => ({
          url: variant.assetUrl,
          version: variant.release,
          mVersion: `${variant.platform}|${variant.arch}|${variant.backend}|${variant.cudaVersion ?? ''}`,
          variant
        } as OnlineVersionItem)))
      } catch (error) { reject(error) }
    })
  }

  allInstalledVersions(_setup: unknown) {
    return new ForkPromise<SoftInstalled[]>(async (resolve, reject) => {
      const { runtimeRoot } = this.deps.getPaths()
      try {
        if (!this.deps.exists(runtimeRoot)) return resolve([])
        const dirs = await this.deps.list(runtimeRoot)
        const installed: SoftInstalled[] = []
        for (const dir of dirs) {
          const path = join(runtimeRoot, dir)
          const manifest = join(path, 'flyenv-runtime.json')
          if (!this.deps.exists(manifest)) continue
          const variant = JSON.parse(await this.deps.read(manifest)) as RuntimeVariant & { executable?: string }
          const binName = variant.platform === 'windows' ? 'llama-server.exe' : 'llama-server'
          const bin = join(path, variant.executable ?? binName)
          installed.push({
            typeFlag: 'llama-cpp' as SoftInstalled['typeFlag'], version: variant.release, bin, path,
            num: null, enable: true, run: false, running: false, flag: variant.backend,
            note: JSON.stringify({ platform: variant.platform, arch: variant.arch, backend: variant.backend, cudaVersion: variant.cudaVersion })
          })
        }
        resolve(installed)
      } catch (error) { reject(error) }
    })
  }

  installRuntimeVariant(variant: RuntimeVariant) {
    return new ForkPromise<SoftInstalled>(async (resolve, reject, on) => {
      if (this.runtimeMutationInProgress || this.serverStarting) return reject(new Error('A llama.cpp runtime or server operation is already in progress'))
      this.runtimeMutationInProgress = true
      try {
        const targetPath = join(this.deps.getPaths().runtimeRoot, runtimeDirectoryName(variant))
        await this.stopActiveRuntimeForPath(targetPath, on)
        on({ 'APP-On-Progress': { status: 'downloading', asset: variant.assetName } })
        const installed = await this.deps.install(variant, this.deps.getPaths(), (asset, downloaded, total) => {
          on({ 'APP-On-Progress': { status: 'downloading', asset, downloaded, total } })
        })
        on({ 'APP-On-Progress': { status: 'installed', version: installed.version } })
        resolve(installed)
      } catch (error) { reject(error) }
      finally { this.runtimeMutationInProgress = false }
    })
  }

  installSoft(row: OnlineVersionItem & { variant?: RuntimeVariant }) {
    if (!row.variant) return new ForkPromise<SoftInstalled>((_, reject) => reject(new Error('Runtime variant metadata is missing')))
    return this.installRuntimeVariant(row.variant)
  }

  removeRuntimeVariant(path: string) {
    return new ForkPromise<boolean>(async (resolve, reject) => {
      if (this.runtimeMutationInProgress || this.serverStarting) return reject(new Error('A llama.cpp runtime or server operation is already in progress'))
      this.runtimeMutationInProgress = true
      try {
        await this.stopActiveRuntimeForPath(path)
        await this.deps.remove(path, this.deps.getPaths().runtimeRoot)
        resolve(true)
      } catch (error) { reject(error) }
      finally { this.runtimeMutationInProgress = false }
    })
  }

  removeRuntime(identity: string) {
    const path = join(this.deps.getPaths().runtimeRoot, runtimeDirectoryName(JSON.parse(identity) as RuntimeVariant))
    return this.removeRuntimeVariant(path)
  }

  searchHubModels(query: string, page = 0) {
    return new ForkPromise(async (resolve, reject) => {
      try { resolve(await searchHubModelsImpl(query, page)) } catch (error) { reject(error) }
    })
  }

  getHubModelFiles(repoId: string, revision = 'main') {
    return new ForkPromise(async (resolve, reject) => {
      try { resolve(await getHubModelFilesImpl(repoId, revision)) } catch (error) { reject(error) }
    })
  }

  downloadHubModelFile(operationId: string, file: HubModelFile) {
    return new ForkPromise(async (resolve, reject, on) => {
      if (this.modelDownloads.has(operationId)) return reject(new Error('A model download with this operation ID is already active'))
      const controller = new AbortController()
      this.modelDownloads.set(operationId, controller)
      const modelsRoot = join(global.Server.BaseDir!, 'llama-cpp', 'models')
      try {
        const model = await downloadHubModelFileImpl(operationId, file, modelsRoot, controller.signal, (progress) => {
          on({ 'APP-On-Progress': { operationId, ...progress } })
        })
        resolve(model)
      } catch (error) { reject(error) }
      finally { this.modelDownloads.delete(operationId) }
    })
  }

  cancelModelDownload(operationId: string) {
    return new ForkPromise<boolean>((resolve) => {
      const controller = this.modelDownloads.get(operationId)
      if (!controller) return resolve(false)
      controller.abort()
      resolve(true)
    })
  }

  deleteLocalModel(path: string) {
    return new ForkPromise<boolean>(async (resolve, reject) => {
      try {
        if (this.serverStarting) throw new Error('Cannot delete a model while llama.cpp is starting')
        const baseDir = global.Server.BaseDir!
        const pid = await this.readPidFromFile(join(baseDir, 'llama-cpp', 'llama-server.pid'))
        if (isManagedModelActive(await StopProcessListFetch(), baseDir, path, pid)) {
          throw new Error('Stop the active server before deleting a model')
        }
        await deleteLocalModelImpl(path, join(baseDir, 'llama-cpp', 'models'), undefined)
        resolve(true)
      } catch (error) { reject(error) }
    })
  }

  createApiKeyFile(key: string) {
    return new ForkPromise<string>(async (resolve, reject) => {
      try { resolve(await createApiKeyFile(key, join(global.Server.BaseDir!, 'llama-cpp', 'secrets'))) } catch (error) { reject(error) }
    })
  }

  getLogFiles(version?: SoftInstalled) {
    const base = join(global.Server.BaseDir!, 'llama-cpp', 'logs')
    const id = `${this.type}-${version?.version ?? 'server'}`.split(' ').join('')
    return [
      { name: 'stdout', path: join(base, `${id}-start-out.log`) },
      { name: 'stderr', path: join(base, `${id}-start-error.log`) }
    ]
  }

  protected _stopSearchName() {
    return 'llama-server'
  }

  _stopServer(version: SoftInstalled, ...args: unknown[]) {
    this.pidPath = join(global.Server.BaseDir!, 'llama-cpp', 'llama-server.pid')
    const stopping = super._stopServer(version, ...args)
    return new ForkPromise(async (resolve, reject, on) => {
      try {
        const result = await stopping.on((data) => {
          if ('APP-Service-Stop-Success' in data) return
          on(data)
        })
        const stoppedPids = (result?.['APP-Service-Stop-PID'] ?? []).map((pid: string | number) => `${pid}`)
        await waitForServerStopped(stoppedPids, async () => (await StopProcessListFetch()).map((process) => `${process.PID}`), this.pidPath)
        this.activeRuntime = undefined
        on({ 'APP-Service-Stop-Success': true })
        resolve(result)
      } catch (error) { reject(error) }
    })
  }

  _startServer(version: SoftInstalled, profile: LaunchProfile, model: LocalModel) {
    return new ForkPromise(async (resolve, reject, on) => {
      if (this.runtimeMutationInProgress || this.serverStarting) return reject(new Error('A llama.cpp runtime operation is already in progress'))
      this.serverStarting = true
      try {
        const validated = validateLaunchProfile(profile, variantFromInstalled(version))
        if (validated.apiKeyFile) await validateApiKeyFile(validated.apiKeyFile)
        const modelRoot = join(global.Server.BaseDir!, 'llama-cpp', 'models')
        const managedModelPath = await validateManagedModelPath(model.localPath, modelRoot)
        const managedModel = { ...model, localPath: managedModelPath }
        const managedProfile = { ...validated, modelPath: managedModelPath }
        const invocation = buildServerInvocation(managedProfile, version, managedModel)
        assertInvocationSupported(await readServerHelp(invocation.bin), invocation.args)
        const serviceRoot = join(global.Server.BaseDir!, 'llama-cpp')
        const logDir = join(serviceRoot, 'logs')
        this.pidPath = join(serviceRoot, 'llama-server.pid')
        const apiKey = managedProfile.apiKeyFile ? (await readFile(managedProfile.apiKeyFile, 'utf8')).trim() : ''
        const startResult = await serviceStartSpawn({
          version,
          pidPath: this.pidPath,
          baseDir: logDir,
          bin: invocation.bin,
          execArgs: invocation.args,
          execEnv: invocation.env,
          cwd: invocation.cwd,
          on,
          sensitive: true
        })
        try {
          await waitForServerHealth(async () => {
            const response = await axios.get(`http://${formatUrlHost(managedProfile.host)}:${managedProfile.port}/health`, {
              timeout: 1_500,
              headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined
            })
            return response.status >= 200 && response.status < 300
          }, async () => {
            await this._stopServer(version).on(on)
          })
          this.activeRuntime = version
        } catch (error) {
          on({ 'APP-On-Log': AppLog('error', `llama-server failed its health check; cleanup was attempted (${error instanceof Error ? error.message : `${error}`})`) })
          throw error
        }
        resolve({ ...startResult, endpoint: `http://${formatUrlHost(managedProfile.host)}:${managedProfile.port}/v1`, model: model.repoId })
      } catch (error) { reject(error) }
      finally { this.serverStarting = false }
    })
  }

  private async stopActiveRuntimeForPath(path: string, on?: (data: Record<string, unknown>) => void) {
    if (!this.activeRuntime || resolve(this.activeRuntime.path) !== resolve(path)) return
    await this._stopServer(this.activeRuntime).on(on ?? (() => {}))
  }
}

export const createLlamaCppModule = (deps: LlamaCppDeps = productionDeps) => new LlamaCppModule(deps)
