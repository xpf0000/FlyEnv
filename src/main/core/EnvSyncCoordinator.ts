import type { EnvSyncSnapshot } from '@shared/EnvSyncProtocol'
import type { EnvSyncLocalResult } from '@shared/EnvSyncLocal'

export type EnvSyncCoordinatorEvent =
  | { type: 'hit'; revision: number }
  | { type: 'join'; revision: number }
  | { type: 'miss'; revision: number }
  | { type: 'fetch-success'; revision: number; durationMs: number; envCount: number }
  | { type: 'fetch-error'; revision: number; durationMs: number; error: string }
  | { type: 'invalidate'; revision: number }

type EnvSyncCoordinatorOptions = {
  ttlMs?: number
  now?: () => number
  onEvent?: (event: EnvSyncCoordinatorEvent) => void
}

type InFlight = {
  revision: number
  promise: Promise<EnvSyncSnapshot>
}

export class EnvSyncCoordinator {
  private snapshot?: EnvSyncSnapshot
  private inFlight?: InFlight
  private revision = 0
  private readonly listeners = new Set<(revision: number) => void>()
  private readonly ttlMs: number
  private readonly now: () => number
  private readonly onEvent: (event: EnvSyncCoordinatorEvent) => void

  constructor(
    private readonly fetchLocal: () => Promise<EnvSyncLocalResult>,
    options: EnvSyncCoordinatorOptions = {}
  ) {
    this.ttlMs = options.ttlMs ?? 300_000
    this.now = options.now ?? Date.now
    this.onEvent = options.onEvent ?? (() => {})
  }

  subscribe(listener: (revision: number) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  get(): Promise<EnvSyncSnapshot> {
    const cached = this.snapshot
    if (cached && this.now() < cached.expiresAt) {
      this.onEvent({ type: 'hit', revision: cached.revision })
      return Promise.resolve(cached)
    }
    const active = this.inFlight
    if (active && active.revision === this.revision) {
      this.onEvent({ type: 'join', revision: this.revision })
      return active.promise
    }

    const revision = this.revision
    const startedAt = this.now()
    this.onEvent({ type: 'miss', revision })
    const promise = Promise.resolve()
      .then(() => this.fetchLocal())
      .then((local) => {
        if (this.revision !== revision) return this.get()
        const fetchedAt = this.now()
        const snapshot: EnvSyncSnapshot = {
          revision,
          ...local,
          fetchedAt,
          expiresAt: fetchedAt + this.ttlMs
        }
        this.snapshot = snapshot
        this.onEvent({
          type: 'fetch-success',
          revision,
          durationMs: this.now() - startedAt,
          envCount: Object.keys(snapshot.env).length
        })
        return snapshot
      })
      .catch((error) => {
        this.onEvent({
          type: 'fetch-error',
          revision,
          durationMs: this.now() - startedAt,
          error: error instanceof Error ? error.message : String(error)
        })
        throw error
      })
      .finally(() => {
        if (this.inFlight?.promise === promise) this.inFlight = undefined
      })

    this.inFlight = { revision, promise }
    return promise
  }

  async invalidate(): Promise<number> {
    this.revision += 1
    this.snapshot = undefined
    this.onEvent({ type: 'invalidate', revision: this.revision })
    for (const listener of this.listeners) {
      try {
        listener(this.revision)
      } catch {}
    }
    return this.revision
  }
}
