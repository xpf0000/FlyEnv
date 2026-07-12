import { appDebugLog } from '@shared/utils'
import { fetchEnvSyncLocal, type EnvSyncLocalResult } from './EnvSyncLocal'
import type { EnvSyncSnapshot } from './EnvSyncProtocol'

export { WINDOWS_ENV_SCRIPT } from './EnvSyncLocal'

export type EnvSyncProvider = {
  get(): Promise<EnvSyncSnapshot>
  invalidate(): Promise<number>
}

type CachedSnapshot = {
  snapshot: EnvSyncSnapshot
  source: 'provider' | 'local-primary' | 'local-fallback'
}

type EnvSyncAccessOptions = {
  localFetch?: () => Promise<EnvSyncLocalResult>
  now?: () => number
  localTtlMs?: number
  fallbackTtlMs?: number
}

export class EnvSyncAccess {
  AppEnv: Record<string, string> | undefined
  CMDPath: string | undefined
  PowerShellPath: string | undefined
  SystemPath: string | undefined

  private provider?: EnvSyncProvider
  private cached?: CachedSnapshot
  private inFlight?: Promise<Record<string, string>>
  private invalidateInFlight: Promise<void> = Promise.resolve()
  private minimumRevision = 0
  private readonly localFetch: () => Promise<EnvSyncLocalResult>
  private readonly now: () => number
  private readonly localTtlMs: number
  private readonly fallbackTtlMs: number

  constructor(options: EnvSyncAccessOptions = {}) {
    this.localFetch = options.localFetch ?? fetchEnvSyncLocal
    this.now = options.now ?? Date.now
    this.localTtlMs = options.localTtlMs ?? 300_000
    this.fallbackTtlMs = options.fallbackTtlMs ?? 5_000
  }

  setProvider(provider?: EnvSyncProvider) {
    this.provider = provider
    this.clearLocal()
  }

  clearLocal(revision?: number) {
    if (revision !== undefined && revision < this.minimumRevision) return
    if (revision !== undefined && revision > this.minimumRevision) {
      this.minimumRevision = revision
    }
    this.cached = undefined
    this.AppEnv = undefined
    this.CMDPath = undefined
    this.PowerShellPath = undefined
    this.SystemPath = undefined
  }

  private apply(snapshot: EnvSyncSnapshot) {
    const env = { ...snapshot.env }
    for (const [key, value] of Object.entries(global.Server?.Proxy ?? {})) {
      env[key] = String(value)
    }
    this.AppEnv = env
    this.CMDPath = snapshot.cmdPath
    this.PowerShellPath = snapshot.powerShellPath
    this.SystemPath = snapshot.systemPath
    return env
  }

  private async providerSnapshot(): Promise<EnvSyncSnapshot> {
    const provider = this.provider!
    let snapshot = await provider.get()
    if (snapshot.revision < this.minimumRevision) snapshot = await provider.get()
    if (snapshot.revision < this.minimumRevision) {
      throw new Error(
        `Env sync snapshot revision ${snapshot.revision} is below ${this.minimumRevision}`
      )
    }
    return snapshot
  }

  private async load(): Promise<Record<string, string>> {
    if (this.provider) {
      try {
        const snapshot = await this.providerSnapshot()
        this.cached = { snapshot, source: 'provider' }
        return this.apply(snapshot)
      } catch (error) {
        appDebugLog('[EnvSync][local-fallback]', `${error}`).catch()
      }
    }

    const local = await this.localFetch()
    const fetchedAt = this.now()
    const source = this.provider ? 'local-fallback' : 'local-primary'
    const snapshot: EnvSyncSnapshot = {
      revision: this.minimumRevision,
      ...local,
      fetchedAt,
      expiresAt: fetchedAt + (source === 'local-fallback' ? this.fallbackTtlMs : this.localTtlMs)
    }
    this.cached = { snapshot, source }
    return this.apply(snapshot)
  }

  async sync(): Promise<Record<string, string>> {
    await this.invalidateInFlight
    if (this.AppEnv && !this.cached) return this.AppEnv
    const cached = this.cached
    if (cached && this.now() < cached.snapshot.expiresAt) return this.apply(cached.snapshot)
    if (this.inFlight) return this.inFlight
    const promise = this.load().finally(() => {
      if (this.inFlight === promise) this.inFlight = undefined
    })
    this.inFlight = promise
    return promise
  }

  clean(): Promise<void> {
    this.clearLocal()
    const provider = this.provider
    if (!provider) return Promise.resolve()
    const next = this.invalidateInFlight
      .catch(() => undefined)
      .then(() => provider.invalidate())
      .then((revision) => this.clearLocal(revision))
      .catch((error) => {
        appDebugLog('[EnvSync][invalidate][error]', `${error}`).catch()
      })
    this.invalidateInFlight = next
    return next
  }
}

export default new EnvSyncAccess()
