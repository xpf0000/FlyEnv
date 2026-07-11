import type { PItem } from '@shared/Process'

export type StopProcessListCacheEvent =
  | { type: 'hit' }
  | { type: 'join' }
  | { type: 'miss' }
  | { type: 'fetch-success'; durationMs: number; processCount: number }
  | { type: 'fetch-error'; durationMs: number; error: string }

type StopProcessListCacheOptions = {
  ttlMs?: number
  now?: () => number
  onEvent?: (event: StopProcessListCacheEvent) => void
}

export class StopProcessListCache {
  private cache?: { list: PItem[]; expiresAt: number }
  private inFlight?: Promise<PItem[]>
  private readonly ttlMs: number
  private readonly now: () => number
  private readonly onEvent: (event: StopProcessListCacheEvent) => void

  constructor(
    private readonly fetchList: () => Promise<PItem[]>,
    options: StopProcessListCacheOptions = {}
  ) {
    this.ttlMs = options.ttlMs ?? 350
    this.now = options.now ?? (() => performance.now())
    this.onEvent = options.onEvent ?? (() => {})
  }

  get(): Promise<PItem[]> {
    const cached = this.cache
    if (cached && this.now() < cached.expiresAt) {
      this.onEvent({ type: 'hit' })
      return Promise.resolve(cached.list)
    }
    if (this.inFlight) {
      this.onEvent({ type: 'join' })
      return this.inFlight
    }

    this.onEvent({ type: 'miss' })
    const startedAt = this.now()
    this.inFlight = Promise.resolve()
      .then(() => this.fetchList())
      .then((list) => {
        this.cache = {
          list,
          expiresAt: this.now() + this.ttlMs
        }
        this.onEvent({
          type: 'fetch-success',
          durationMs: this.now() - startedAt,
          processCount: list.length
        })
        return list
      })
      .catch((error) => {
        this.onEvent({
          type: 'fetch-error',
          durationMs: this.now() - startedAt,
          error: error instanceof Error ? error.message : String(error)
        })
        throw error
      })
      .finally(() => {
        this.inFlight = undefined
      })
    return this.inFlight
  }
}
