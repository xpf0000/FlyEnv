import { defineStore } from 'pinia'
import { computed, reactive } from 'vue'
import { AppStore } from '@/store/app'
import { BrewStore, type SoftInstalled } from '@/store/brew'
import {
  filterJavaCandidates,
  javaMajorFromVersion,
  resolveNeo4jJavaPolicy,
  type Neo4jJavaCandidate
} from './policy'

export type Neo4jJavaBinding = {
  javaHome: string
  javaMajor: number
}

type State = {
  javaByBin: Record<string, Neo4jJavaBinding>
  hydrated: boolean
}

const state: State = {
  javaByBin: {},
  hydrated: false
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

export const Neo4jStore = defineStore('neo4j', {
  state: (): State => state,
  getters: {
    bindings(state): Record<string, Neo4jJavaBinding> {
      return state.javaByBin
    }
  },
  actions: {
    hydrate() {
      const appStore = AppStore()
      const saved = copyBindings(appStore.config.setup?.neo4jJavaBindings)
      this.javaByBin = reactive(saved)
      this.hydrated = true
      return this.javaByBin
    },

    /** Read persisted state lazily; page entry is not required for service/tray starts. */
    ensureHydrated() {
      if (!this.hydrated) this.hydrate()
      return this.javaByBin
    },

    getBinding(bin: string | undefined | null): Neo4jJavaBinding | undefined {
      this.ensureHydrated()
      // Config can be initialized after tray/module bootstrap. Merge it lazily
      // so an early lookup never permanently hides persisted bindings.
      const saved = copyBindings(AppStore().config.setup?.neo4jJavaBindings)
      Object.assign(this.javaByBin, saved)
      return this.javaByBin[normalizeNeo4jBin(bin)]
    },

    async setBinding(bin: string, binding: Neo4jJavaBinding) {
      const key = normalizeNeo4jBin(bin)
      if (!key) throw new Error('Neo4j installation path is required')
      if (!binding?.javaHome || !Number.isFinite(binding.javaMajor)) {
        throw new Error('A valid Java runtime is required')
      }
      this.ensureHydrated()
      this.javaByBin[key] = reactive({
        javaHome: binding.javaHome,
        javaMajor: Number(binding.javaMajor)
      })
      await this.persist()
      return this.javaByBin[key]
    },

    async removeBinding(bin: string) {
      this.ensureHydrated()
      delete this.javaByBin[normalizeNeo4jBin(bin)]
      await this.persist()
    },

    /** Remove stale paths and initialize new rows with the recommended local JDK. */
    async reconcileBindings(installed: SoftInstalled[]) {
      const neo4jModule = BrewStore().module('neo4j')
      if (!neo4jModule.installedFetched && installed.length === 0) return
      this.ensureHydrated()
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
        this.javaByBin[normalizeNeo4jBin(item.bin)] = reactive({
          javaHome: candidate.path,
          javaMajor
        })
        changed = true
      })
      if (changed) await this.persist()
    },

    javaCandidates(): Neo4jJavaCandidate[] {
      const java = BrewStore().module('java' as any)
      return java.installed.map((item) => ({
        bin: item.bin,
        path: item.path,
        version: item.version,
        num: item.num
      }))
    },

    candidatesForVersion(version: string | null | undefined) {
      return filterJavaCandidates(version, this.javaCandidates())
    },

    policyForVersion(version: string | null | undefined) {
      return resolveNeo4jJavaPolicy(version)
    },

    candidateMajor(candidate: Neo4jJavaCandidate) {
      return candidate.num
        ? Number(String(candidate.num).slice(0, 2))
        : javaMajorFromVersion(candidate.version)
    },

    /** Parameters appended to the existing ModuleInstalledItem startService IPC call. */
    startParams(item: SoftInstalled): [{ javaHome: string; neo4jInstanceDir?: string }] {
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
          neo4jInstanceDir: (item as any).neo4jInstanceDir ?? undefined
        }
      ]
    },

    async persist() {
      const appStore = AppStore()
      appStore.config.setup.neo4jJavaBindings = JSON.parse(JSON.stringify(this.javaByBin))
      await appStore.saveConfig()
    }
  }
})

export const neo4jBindingState = computed(() => Neo4jStore().javaByBin)
