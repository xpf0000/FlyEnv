import { BrewStore, type SoftInstalled } from '@/store/brew'
import { reactiveBind } from '@/util/Index'
import { dirname, join, normalize, resolve } from '@/util/path-browserify'
import { StorageGetAsync, StorageSetAsync } from '@/util/Storage'
import { SHA256 } from 'crypto-js'
import { effectScope, watch, type EffectScope } from 'vue'
import {
  filterJavaCandidates,
  javaMajorFromVersion,
  resolveNeo4jJavaPolicy,
  sortJavaCandidatesByVersion,
  type Neo4jJavaCandidate
} from './policy'

const storageKey = 'flyenv-neo4j-java-bindings'

export type Neo4jJavaBinding = {
  javaHome: string
  javaMajor: number
}

/** Keep a binding stable when the same installation is represented with different separators. */
export const normalizeNeo4jBin = (bin: string | undefined | null) => {
  const value = `${bin ?? ''}`.trim().replaceAll('\\', '/')
  return value.replace(/\/+/g, '/').replace(/\/$/, '')
}

const copyBindings = (value: unknown): Record<string, Neo4jJavaBinding> => {
  if (!value || typeof value !== 'object') return {}
  const result: Record<string, Neo4jJavaBinding> = {}
  Object.entries(value as Record<string, unknown>).forEach(([bin, binding]) => {
    if (!binding || typeof binding !== 'object') return
    const item = binding as Partial<Neo4jJavaBinding>
    if (typeof item.javaHome !== 'string' || !item.javaHome.trim()) return
    const javaMajor = Number(item.javaMajor)
    if (!Number.isFinite(javaMajor) || javaMajor <= 0) return
    result[normalizeNeo4jBin(bin)] = {
      javaHome: item.javaHome,
      javaMajor
    }
  })
  return result
}

/**
 * Owns Neo4j-to-Java bindings outside AppStore config.  The singleton survives
 * page re-entry while the reactive wrapper keeps the Java select rows current.
 */
export class Neo4jJavaBindingManager {
  javaByBin: Record<string, Neo4jJavaBinding> = {}
  inited = false
  private initPromise?: Promise<void>
  private mutationQueue: Promise<void> = Promise.resolve()
  private installedVersionsWatching = false
  private installedVersionsScope?: EffectScope

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(operation, operation)
    this.mutationQueue = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  async init() {
    if (this.inited) return
    if (!this.initPromise) {
      this.initPromise = StorageGetAsync<Record<string, Neo4jJavaBinding>>(storageKey)
        .then((saved) => {
          Object.assign(this.javaByBin, copyBindings(saved))
        })
        .catch(() => undefined)
        .finally(() => {
          this.inited = true
        })
    }
    await this.initPromise
  }

  getBinding(bin: string | undefined | null): Neo4jJavaBinding | undefined {
    // This method is called while rendering each service-table row. Keep it
    // strictly read-only; initialization belongs to setup/actions, never render.
    return this.javaByBin[normalizeNeo4jBin(bin)]
  }

  async setBinding(bin: string, binding: Neo4jJavaBinding) {
    const key = normalizeNeo4jBin(bin)
    if (!key) throw new Error('Neo4j installation path is required')
    if (!binding?.javaHome || !Number.isFinite(binding.javaMajor)) {
      throw new Error('A valid Java runtime is required')
    }
    await this.init()
    return this.enqueueMutation(async () => {
      this.javaByBin[key] = {
        javaHome: binding.javaHome,
        javaMajor: Number(binding.javaMajor)
      }
      await this.persist()
      return this.javaByBin[key]
    })
  }

  async removeBinding(bin: string) {
    await this.init()
    return this.enqueueMutation(async () => {
      delete this.javaByBin[normalizeNeo4jBin(bin)]
      await this.persist()
    })
  }

  watchInstalledVersions() {
    if (this.installedVersionsWatching) return
    this.installedVersionsWatching = true
    const neo4jModule = BrewStore().module('neo4j')
    const javaModule = BrewStore().module('java' as any)
    this.installedVersionsScope = effectScope(true)
    this.installedVersionsScope.run(() => {
      watch(
        () => ({
          neo4jFetched: neo4jModule.installedFetched,
          neo4j: neo4jModule.installed.map((item) => [item.bin, item.path, item.version]),
          java: javaModule.installed.map((item) => [item.bin, item.path, item.version, item.num])
        }),
        () => {
          if (!neo4jModule.installedFetched) return
          this.reconcileBindings(neo4jModule.installed).catch((error) =>
            console.error('Neo4j Java binding reconciliation failed', error)
          )
        },
        { immediate: true }
      )
    })
  }

  /** Remove stale paths and initialize new rows with the recommended local JDK. */
  async reconcileBindings(installed: SoftInstalled[]) {
    const neo4jModule = BrewStore().module('neo4j')
    if (!neo4jModule.installedFetched && installed.length === 0) return
    await this.init()
    return this.enqueueMutation(async () => {
      const bins = new Set(installed.map((item) => normalizeNeo4jBin(item.bin)).filter(Boolean))
      let changed = false
      Object.keys(this.javaByBin).forEach((bin) => {
        if (!bins.has(bin)) {
          delete this.javaByBin[bin]
          changed = true
        }
      })

      const javaCandidates = this.javaCandidates()
      installed.forEach((item) => {
        if (!item.version || this.getBinding(item.bin)) return
        const candidate = filterJavaCandidates(item.version, javaCandidates)[0]
        if (!candidate) return
        const javaMajor = this.candidateMajor(candidate)
        if (!javaMajor) return
        this.javaByBin[normalizeNeo4jBin(item.bin)] = {
          javaHome: candidate.path,
          javaMajor
        }
        changed = true
      })
      if (changed) await this.persist()
    })
  }

  javaCandidates(): Neo4jJavaCandidate[] {
    const java = BrewStore().module('java' as any)
    return java.installed.map((item) => ({
      bin: item.bin,
      path: item.path,
      version: item.version,
      num: item.num
    }))
  }

  candidatesForVersion(version: string | null | undefined) {
    return sortJavaCandidatesByVersion(filterJavaCandidates(version, this.javaCandidates()))
  }

  policyForVersion(version: string | null | undefined) {
    return resolveNeo4jJavaPolicy(version)
  }

  candidateMajor(candidate: Neo4jJavaCandidate) {
    return candidate.num
      ? Number(String(candidate.num).slice(0, 2))
      : javaMajorFromVersion(candidate.version)
  }

  /** Derive the same per-installation directory as the Neo4j fork runtime. */
  instanceDirFor(item: Pick<SoftInstalled, 'bin' | 'path'>): string {
    const installationPath = item.path || dirname(dirname(item.bin || ''))
    let canonical = normalize(resolve(installationPath)).replace(/[\\/]+$/, '')
    if (window.Server.isWindows) canonical = canonical.replaceAll('/', '\\')
    const key = SHA256(canonical).toString().slice(0, 16)
    const moduleDir = window.Server.Neo4jDir ?? join(window.Server.BaseDir!, 'neo4j')
    return join(moduleDir, 'instances', key)
  }

  /** Parameters appended to the existing ModuleInstalledItem startService IPC call. */
  async startParams(
    item: SoftInstalled
  ): Promise<[{ javaHome: string; neo4jInstanceDir: string }]> {
    await this.init()
    const binding = this.getBinding(item.bin)
    if (!binding) throw new Error('Select a compatible Java runtime before starting Neo4j')
    const policy = resolveNeo4jJavaPolicy(item.version)
    if (!policy.supportedMajor.includes(binding.javaMajor)) {
      throw new Error(
        `Java ${binding.javaMajor} is not compatible with Neo4j ${item.version ?? ''}`
      )
    }
    return [
      {
        javaHome: binding.javaHome,
        neo4jInstanceDir: this.instanceDirFor(item)
      }
    ]
  }

  /** Keep stopping available after a Java binding is removed or becomes invalid. */
  async stopParams(
    item: SoftInstalled
  ): Promise<[{ javaHome?: string; neo4jInstanceDir: string }]> {
    await this.init()
    return [
      {
        javaHome: this.getBinding(item.bin)?.javaHome,
        neo4jInstanceDir: this.instanceDirFor(item)
      }
    ]
  }

  async persist() {
    await StorageSetAsync(storageKey, JSON.parse(JSON.stringify(this.javaByBin)))
  }
}

export const Neo4jManager = reactiveBind(new Neo4jJavaBindingManager())
