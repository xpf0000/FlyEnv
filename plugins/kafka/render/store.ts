import { BrewStore, type SoftInstalled } from '@/store/brew'
import { reactiveBind } from '@/util/Index'
import { StorageGetAsync, StorageSetAsync } from '@/util/Storage'
import { effectScope, watch, type EffectScope } from 'vue'
import {
  filterKafkaJavaCandidates,
  kafkaJavaCandidateMajor,
  kafkaMinJavaMajor,
  type KafkaJavaCandidate
} from './policy'
import { KafkaT } from './lang'

const storageKey = 'flyenv-kafka-java-bindings'

export type KafkaJavaBinding = {
  javaHome: string
  javaMajor: number
}

/** Keep a binding stable when the same installation is represented with different separators. */
export const normalizeKafkaBin = (bin: string | undefined | null) => {
  const value = `${bin ?? ''}`.trim().replaceAll('\\', '/')
  return value.replace(/\/+/g, '/').replace(/\/$/, '')
}

const copyBindings = (value: unknown): Record<string, KafkaJavaBinding> => {
  if (!value || typeof value !== 'object') return {}
  const result: Record<string, KafkaJavaBinding> = {}
  Object.entries(value as Record<string, unknown>).forEach(([bin, binding]) => {
    if (!binding || typeof binding !== 'object') return
    const item = binding as Partial<KafkaJavaBinding>
    if (typeof item.javaHome !== 'string' || !item.javaHome.trim()) return
    const javaMajor = Number(item.javaMajor)
    if (!Number.isFinite(javaMajor) || javaMajor <= 0) return
    result[normalizeKafkaBin(bin)] = {
      javaHome: item.javaHome,
      javaMajor
    }
  })
  return result
}

/**
 * Owns Kafka-to-Java bindings outside AppStore config. The singleton survives
 * page re-entry while the reactive wrapper keeps the Java select rows current.
 */
export class KafkaJavaBindingManager {
  javaByBin: Record<string, KafkaJavaBinding> = {}
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
      this.initPromise = StorageGetAsync<Record<string, KafkaJavaBinding>>(storageKey)
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

  getBinding(bin: string | undefined | null): KafkaJavaBinding | undefined {
    // This method is called while rendering each service-table row. Keep it
    // strictly read-only; initialization belongs to setup/actions, never render.
    return this.javaByBin[normalizeKafkaBin(bin)]
  }

  async setBinding(bin: string, binding: KafkaJavaBinding) {
    const key = normalizeKafkaBin(bin)
    if (!key) throw new Error(KafkaT('installationPathRequired'))
    if (!binding?.javaHome || !Number.isFinite(binding.javaMajor)) {
      throw new Error(KafkaT('javaRuntimeRequired'))
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
      delete this.javaByBin[normalizeKafkaBin(bin)]
      await this.persist()
    })
  }

  watchInstalledVersions() {
    if (this.installedVersionsWatching) return
    this.installedVersionsWatching = true
    const kafkaModule = BrewStore().module('kafka')
    const javaModule = BrewStore().module('java')
    // The Java module page may never have been opened, so its installed list
    // can be empty even though JDKs are installed. Pull it on demand; the
    // watch below reconciles bindings once the fetch lands.
    if (!javaModule.installedFetched) {
      javaModule
        .fetchInstalled()
        .catch((error) => console.error('Kafka Java candidates fetch failed', error))
    }
    this.installedVersionsScope = effectScope(true)
    this.installedVersionsScope.run(() => {
      watch(
        () => ({
          kafkaFetched: kafkaModule.installedFetched,
          kafka: kafkaModule.installed.map((item) => [item.bin, item.path, item.version]),
          java: javaModule.installed.map((item) => [item.bin, item.path, item.version, item.num])
        }),
        () => {
          if (!kafkaModule.installedFetched) return
          this.reconcileBindings(kafkaModule.installed).catch((error) =>
            console.error('Kafka Java binding reconciliation failed', error)
          )
        },
        { immediate: true }
      )
    })
  }

  stopInstalledVersionsWatch() {
    this.installedVersionsScope?.stop()
    this.installedVersionsScope = undefined
    this.installedVersionsWatching = false
  }

  /** Remove stale paths and initialize new rows with the recommended local JDK. */
  async reconcileBindings(installed: SoftInstalled[]) {
    const kafkaModule = BrewStore().module('kafka')
    if (!kafkaModule.installedFetched && installed.length === 0) return
    await this.init()
    return this.enqueueMutation(async () => {
      const bins = new Set(installed.map((item) => normalizeKafkaBin(item.bin)).filter(Boolean))
      let changed = false
      Object.keys(this.javaByBin).forEach((bin) => {
        if (!bins.has(bin)) {
          delete this.javaByBin[bin]
          changed = true
        }
      })

      const candidates = this.candidates()
      installed.forEach((item) => {
        if (!item.version || this.getBinding(item.bin)) return
        const candidate = candidates[0]
        if (!candidate) return
        const javaMajor = kafkaJavaCandidateMajor(candidate)
        if (!javaMajor) return
        this.javaByBin[normalizeKafkaBin(item.bin)] = {
          javaHome: candidate.path,
          javaMajor
        }
        changed = true
      })
      if (changed) await this.persist()
    })
  }

  /** All installed JDK runtimes that can run Kafka (Java 17+), newest first. */
  candidates(): KafkaJavaCandidate[] {
    const java = BrewStore().module('java')
    return filterKafkaJavaCandidates(java.installed)
  }

  /** Parameters appended to the existing ModuleInstalledItem startService IPC call. */
  async startParams(item: SoftInstalled): Promise<[{ javaHome: string }]> {
    await this.init()
    const binding = this.getBinding(item.bin)
    if (!binding) {
      throw new Error(KafkaT('bindJavaFirst'))
    }
    if (binding.javaMajor < kafkaMinJavaMajor) {
      throw new Error(
        KafkaT('javaMajorUnsupported', { min: kafkaMinJavaMajor, major: binding.javaMajor })
      )
    }
    return [{ javaHome: binding.javaHome }]
  }

  /** Keep stopping available after a Java binding is removed or becomes invalid. */
  async stopParams(item: SoftInstalled): Promise<[{ javaHome?: string }]> {
    await this.init()
    return [{ javaHome: this.getBinding(item.bin)?.javaHome }]
  }

  async persist() {
    await StorageSetAsync(storageKey, JSON.parse(JSON.stringify(this.javaByBin)))
  }
}

export const KafkaManager = reactiveBind(new KafkaJavaBindingManager())
