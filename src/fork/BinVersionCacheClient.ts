import { randomUUID } from 'node:crypto'
import {
  isBinVersionCacheGetResponse,
  type BinVersionCacheGet,
  type BinVersionCacheGetResponse,
  type BinVersionCacheSet,
  type BinVersionFingerprint
} from '@shared/BinVersionCache'

type TimerToken = ReturnType<typeof setTimeout> | number

type PendingRequest = {
  resolve: (value: BinVersionCacheGetResponse) => void
  reject: (error: Error) => void
  timeout: TimerToken
}

type BinVersionCacheClientOptions = {
  timeoutMs?: number
  requestId?: () => string
  scheduleTimeout?: (handler: () => void, delayMs: number) => TimerToken
  cancelTimeout?: (token: TimerToken) => void
}

export class BinVersionCacheClient {
  private readonly pending = new Map<string, PendingRequest>()
  private readonly timeoutMs: number
  private readonly requestId: () => string
  private readonly scheduleTimeout: (handler: () => void, delayMs: number) => TimerToken
  private readonly cancelTimeout: (token: TimerToken) => void

  constructor(
    private readonly send: (message: BinVersionCacheGet | BinVersionCacheSet) => void,
    options: BinVersionCacheClientOptions = {}
  ) {
    this.timeoutMs = options.timeoutMs ?? 2_000
    this.requestId = options.requestId ?? randomUUID
    this.scheduleTimeout = options.scheduleTimeout ?? setTimeout
    this.cancelTimeout = options.cancelTimeout ?? clearTimeout
  }

  get(fingerprint: BinVersionFingerprint): Promise<BinVersionCacheGetResponse> {
    const requestId = this.requestId()
    return new Promise((resolve, reject) => {
      const timeout = this.scheduleTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error(`Bin version cache request timed out after ${this.timeoutMs}ms`))
      }, this.timeoutMs)
      this.pending.set(requestId, { resolve, reject, timeout })
      try {
        this.send({ type: 'bin-version-cache-get', requestId, fingerprint })
      } catch (error) {
        this.pending.delete(requestId)
        this.cancelTimeout(timeout)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  set(fingerprint: BinVersionFingerprint, value: unknown) {
    try {
      this.send({ type: 'bin-version-cache-set', fingerprint, value })
    } catch {}
  }

  handleMessage(message: unknown): boolean {
    if (!isBinVersionCacheGetResponse(message)) return false
    const pending = this.pending.get(message.requestId)
    if (!pending) return true
    this.pending.delete(message.requestId)
    this.cancelTimeout(pending.timeout)
    pending.resolve(message)
    return true
  }
}
