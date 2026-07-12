import {
  isBinVersionCacheFile,
  type BinVersionCacheEntry,
  type BinVersionCacheFile,
  type BinVersionFingerprint
} from '@shared/BinVersionCache'

export type BinVersionCachePersistence = {
  load(): unknown | Promise<unknown>
  save(value: BinVersionCacheFile): void | Promise<void>
}

export type BinVersionCacheStoreEvent =
  | { type: 'load-success'; entryCount: number }
  | { type: 'load-error'; error: string }
  | { type: 'hit' }
  | { type: 'miss' }
  | { type: 'set' }
  | { type: 'save-success'; entryCount: number }
  | { type: 'save-error'; error: string }

type TimerToken = ReturnType<typeof setTimeout> | number

type BinVersionCacheStoreOptions = {
  debounceMs?: number
  schedule?: (handler: () => void, delayMs: number) => TimerToken
  cancel?: (token: TimerToken) => void
  onEvent?: (event: BinVersionCacheStoreEvent) => void
}

export class BinVersionCacheStore {
  readonly ready: Promise<void>
  private readonly entries = new Map<string, BinVersionCacheEntry>()
  private readonly debounceMs: number
  private readonly schedule: (handler: () => void, delayMs: number) => TimerToken
  private readonly cancel: (token: TimerToken) => void
  private readonly onEvent: (event: BinVersionCacheStoreEvent) => void
  private saveTimer?: TimerToken
  private saveInFlight?: Promise<void>
  private dirty = false
  private revision = 0

  constructor(
    private readonly persistence: BinVersionCachePersistence,
    options: BinVersionCacheStoreOptions = {}
  ) {
    this.debounceMs = options.debounceMs ?? 2_000
    this.schedule = options.schedule ?? setTimeout
    this.cancel = options.cancel ?? clearTimeout
    this.onEvent = options.onEvent ?? (() => {})
    this.ready = this.load()
  }

  private emit(event: BinVersionCacheStoreEvent) {
    this.onEvent(event)
  }

  private async load() {
    try {
      const value = await this.persistence.load()
      if (isBinVersionCacheFile(value)) {
        for (const [path, entry] of Object.entries(value.entries)) {
          this.entries.set(path, entry)
        }
      }
      this.emit({ type: 'load-success', entryCount: this.entries.size })
    } catch (error) {
      this.emit({
        type: 'load-error',
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  async get(fingerprint: BinVersionFingerprint): Promise<{ hit: boolean; value?: unknown }> {
    await this.ready
    const entry = this.entries.get(fingerprint.path)
    if (entry && entry.mtimeMs === fingerprint.mtimeMs && entry.size === fingerprint.size) {
      this.emit({ type: 'hit' })
      return { hit: true, value: entry.value }
    }
    this.emit({ type: 'miss' })
    return { hit: false }
  }

  async set(fingerprint: BinVersionFingerprint, value: unknown): Promise<boolean> {
    await this.ready
    try {
      if (JSON.stringify(value) === undefined) return false
    } catch {
      return false
    }
    this.entries.set(fingerprint.path, {
      mtimeMs: fingerprint.mtimeMs,
      size: fingerprint.size,
      value
    })
    this.revision += 1
    this.dirty = true
    this.emit({ type: 'set' })
    this.scheduleSave()
    return true
  }

  private scheduleSave() {
    if (this.saveTimer !== undefined) this.cancel(this.saveTimer)
    this.saveTimer = this.schedule(() => {
      this.saveTimer = undefined
      void this.flush()
    }, this.debounceMs)
  }

  private snapshot(): BinVersionCacheFile {
    return {
      schemaVersion: 1,
      entries: Object.fromEntries(this.entries)
    }
  }

  async flush(): Promise<void> {
    await this.ready
    while (true) {
      if (this.saveTimer !== undefined) {
        this.cancel(this.saveTimer)
        this.saveTimer = undefined
      }
      if (this.saveInFlight) {
        await this.saveInFlight
        continue
      }
      if (!this.dirty) return

      const revision = this.revision
      const snapshot = this.snapshot()
      this.saveInFlight = Promise.resolve()
        .then(() => this.persistence.save(snapshot))
        .then(() => {
          if (this.revision === revision) this.dirty = false
          this.emit({ type: 'save-success', entryCount: this.entries.size })
        })
        .catch((error) => {
          this.emit({
            type: 'save-error',
            error: error instanceof Error ? error.message : String(error)
          })
        })
        .finally(() => {
          this.saveInFlight = undefined
        })
      await this.saveInFlight
      if (this.dirty && this.revision === revision) return
    }
  }
}
