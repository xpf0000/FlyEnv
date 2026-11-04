import { appDebugLog } from '@shared/utils'
import { logWindowsPath } from './WindowsPathDiagnostics'
import { timeOperation } from './OperationTiming'
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
  private generation = 0
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
    this.generation += 1
    this.cached = undefined
    this.inFlight = undefined
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

  private async load(generation: number): Promise<Record<string, string>> {
    if (this.provider) {
      try {
        const snapshot = await timeOperation('env-sync.provider-snapshot', () =>
          this.providerSnapshot()
        )
        if (this.generation !== generation) return this.sync()
        this.cached = { snapshot, source: 'provider' }
        return this.apply(snapshot)
      } catch (error) {
        if (this.generation !== generation) return this.sync()
        appDebugLog('[EnvSync][local-fallback]', `${error}`).catch()
        logWindowsPath('env-sync.local-fallback')
      }
    }

    const local = await timeOperation('env-sync.local-fetch', () => this.localFetch())
    if (this.generation !== generation) return this.sync()
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
    // 写入成功方只调用 clean，不必主动同步或等待失效回执；真正读取环境时在此
    // 等待已登记的失效，避免 clean 尚未完成就从共享 provider 取回旧快照。
    await this.invalidateInFlight
    if (this.AppEnv && !this.cached) {
      logWindowsPath('env-sync.injected-cache-hit')
      return this.AppEnv
    }
    const cached = this.cached
    // 只观察实际缓存决策；日志失败不撤销缓存，也不增加 provider/PowerShell 查询。
    if (cached && this.now() < cached.snapshot.expiresAt) {
      logWindowsPath('env-sync.cache-hit', {
        source: cached.source,
        revision: cached.snapshot.revision
      })
      return this.apply(cached.snapshot)
    }
    if (this.inFlight) {
      logWindowsPath('env-sync.join-in-flight')
      return this.inFlight
    }
    logWindowsPath('env-sync.cache-miss', { provider: Boolean(this.provider) })
    const generation = this.generation
    const promise = this.load(generation).finally(() => {
      if (this.inFlight === promise) this.inFlight = undefined
    })
    this.inFlight = promise
    return promise
  }

  clean(): Promise<void> {
    // 本地失效同步完成；共享失效沿既有队列发出并立即登记屏障。
    // 调用方可不 await 返回值，后续 sync 仍会等待本次共享失效，不会跳过清缓存。
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
