import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { Base } from '@fork/module/Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import { ForkPromise } from '@shared/ForkPromise'
import { fetchRuntimeReleases, normalizeRuntimeHost } from '../release'
import { installRuntime, removeRuntime, runtimeDirectoryName, runtimePathsForHost, type RuntimeInstallDeps, type RuntimePaths } from '../runtime'
import type { RuntimeHost, RuntimeVariant } from '../../shared/types'

export interface LlamaCppDeps {
  getHost(): RuntimeHost | undefined
  getPaths(): RuntimePaths
  fetchReleases(channel: 'stable' | 'prerelease', host: RuntimeHost): Promise<RuntimeVariant[]>
  install(variant: RuntimeVariant, paths: RuntimePaths): Promise<SoftInstalled>
  remove(path: string, root: string): Promise<void>
  read(path: string): Promise<string>
  list(path: string): Promise<string[]>
  exists(path: string): boolean
}

const productionDeps: LlamaCppDeps = {
  getHost: () => normalizeRuntimeHost(),
  getPaths: () => runtimePathsForHost(global.Server.BaseDir!),
  fetchReleases: fetchRuntimeReleases,
  install: (variant, paths) => installRuntime(variant, paths),
  remove: (path, root) => removeRuntime(path, root),
  read: (path) => readFile(path, 'utf8'),
  list: (path) => readdir(path),
  exists: existsSync
}

export class LlamaCppModule extends Base {
  private deps: LlamaCppDeps

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
          const variant = JSON.parse(await this.deps.read(manifest)) as RuntimeVariant
          const binName = variant.platform === 'windows' ? 'llama-server.exe' : 'llama-server'
          const bin = join(path, binName)
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
      on({ 'APP-On-Progress': { status: 'downloading', asset: variant.assetName } })
      try {
        const installed = await this.deps.install(variant, this.deps.getPaths())
        on({ 'APP-On-Progress': { status: 'installed', version: installed.version } })
        resolve(installed)
      } catch (error) { reject(error) }
    })
  }

  installSoft(row: OnlineVersionItem & { variant?: RuntimeVariant }) {
    if (!row.variant) return new ForkPromise<SoftInstalled>((_, reject) => reject(new Error('Runtime variant metadata is missing')))
    return this.installRuntimeVariant(row.variant)
  }

  removeRuntimeVariant(path: string) {
    return new ForkPromise<boolean>(async (resolve, reject) => {
      try {
        await this.deps.remove(path, this.deps.getPaths().runtimeRoot)
        resolve(true)
      } catch (error) { reject(error) }
    })
  }

  removeRuntime(identity: string) {
    const path = join(this.deps.getPaths().runtimeRoot, runtimeDirectoryName(JSON.parse(identity) as RuntimeVariant))
    return this.removeRuntimeVariant(path)
  }

  _startServer(_version: SoftInstalled) {
    return new ForkPromise((_, reject) => reject(new Error('Select a llama.cpp runtime and model before starting the server')))
  }
}

export const createLlamaCppModule = (deps: LlamaCppDeps = productionDeps) => new LlamaCppModule(deps)
