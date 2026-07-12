import { randomUUID } from 'node:crypto'
import {
  isEnvSyncGetResponse,
  isEnvSyncInvalidateResponse,
  isEnvSyncInvalidated,
  type EnvSyncRequest,
  type EnvSyncSnapshot
} from '@shared/EnvSyncProtocol'

type TimerToken = ReturnType<typeof setTimeout> | number
type Pending<T> = {
  resolve: (value: T) => void
  reject: (error: Error) => void
  timeout: TimerToken
}

type EnvSyncClientOptions = {
  timeoutMs?: number
  requestId?: () => string
  scheduleTimeout?: (handler: () => void, delayMs: number) => TimerToken
  cancelTimeout?: (token: TimerToken) => void
}

export class EnvSyncClient {
  private readonly getPending = new Map<string, Pending<EnvSyncSnapshot>>()
  private readonly invalidatePending = new Map<string, Pending<number>>()
  private readonly timeoutMs: number
  private readonly requestId: () => string
  private readonly scheduleTimeout: (handler: () => void, delayMs: number) => TimerToken
  private readonly cancelTimeout: (token: TimerToken) => void

  constructor(
    private readonly send: (message: EnvSyncRequest) => void,
    private readonly onInvalidated: (revision: number) => void,
    options: EnvSyncClientOptions = {}
  ) {
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.requestId = options.requestId ?? randomUUID
    this.scheduleTimeout = options.scheduleTimeout ?? setTimeout
    this.cancelTimeout = options.cancelTimeout ?? clearTimeout
  }

  private request<T>(pending: Map<string, Pending<T>>, message: EnvSyncRequest): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = this.scheduleTimeout(() => {
        pending.delete(message.requestId)
        reject(new Error(`Env sync request timed out after ${this.timeoutMs}ms`))
      }, this.timeoutMs)
      pending.set(message.requestId, { resolve, reject, timeout })
      try {
        this.send(message)
      } catch (error) {
        pending.delete(message.requestId)
        this.cancelTimeout(timeout)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  get() {
    const requestId = this.requestId()
    return this.request(this.getPending, { type: 'env-sync-get', requestId })
  }

  invalidate() {
    const requestId = this.requestId()
    return this.request(this.invalidatePending, { type: 'env-sync-invalidate', requestId })
  }

  handleMessage(message: unknown): boolean {
    if (isEnvSyncInvalidated(message)) {
      this.onInvalidated(message.revision)
      return true
    }
    if (isEnvSyncGetResponse(message)) {
      const pending = this.getPending.get(message.requestId)
      if (!pending) return true
      this.getPending.delete(message.requestId)
      this.cancelTimeout(pending.timeout)
      if (message.error || !message.snapshot) {
        pending.reject(new Error(message.error || 'Env sync response has no snapshot'))
      } else {
        pending.resolve(message.snapshot)
      }
      return true
    }
    if (isEnvSyncInvalidateResponse(message)) {
      const pending = this.invalidatePending.get(message.requestId)
      if (!pending) return true
      this.invalidatePending.delete(message.requestId)
      this.cancelTimeout(pending.timeout)
      if (message.error || message.revision === undefined) {
        pending.reject(new Error(message.error || 'Env sync response has no revision'))
      } else {
        pending.resolve(message.revision)
      }
      return true
    }
    return false
  }
}
