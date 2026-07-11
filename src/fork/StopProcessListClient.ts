import { randomUUID } from 'node:crypto'
import type { PItem } from '@shared/Process'
import { isStopProcessListResponse, type StopProcessListRequest } from '@shared/StopProcessList'

type TimeoutToken = ReturnType<typeof setTimeout> | number
type StopProcessListClientOptions = {
  timeoutMs?: number
  requestId?: () => string
  scheduleTimeout?: (handler: () => void, timeoutMs: number) => TimeoutToken
  cancelTimeout?: (token: TimeoutToken) => void
}

type PendingRequest = {
  resolve: (list: PItem[]) => void
  reject: (error: Error) => void
  timeout: TimeoutToken
}

export class StopProcessListClient {
  private readonly pending = new Map<string, PendingRequest>()
  private readonly timeoutMs: number
  private readonly requestId: () => string
  private readonly scheduleTimeout: (handler: () => void, timeoutMs: number) => TimeoutToken
  private readonly cancelTimeout: (token: TimeoutToken) => void

  constructor(
    private readonly send: (message: StopProcessListRequest) => void,
    options: StopProcessListClientOptions = {}
  ) {
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.requestId = options.requestId ?? randomUUID
    this.scheduleTimeout = options.scheduleTimeout ?? setTimeout
    this.cancelTimeout = options.cancelTimeout ?? clearTimeout
  }

  request(): Promise<PItem[]> {
    const requestId = this.requestId()
    return new Promise<PItem[]>((resolve, reject) => {
      const timeout = this.scheduleTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error('Stop process list request timed out after ' + this.timeoutMs + 'ms'))
      }, this.timeoutMs)
      this.pending.set(requestId, { resolve, reject, timeout })
      try {
        this.send({ type: 'stop-process-list-request', requestId })
      } catch (error) {
        this.pending.delete(requestId)
        this.cancelTimeout(timeout)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  handleMessage(message: unknown): boolean {
    if (!isStopProcessListResponse(message)) return false
    const pending = this.pending.get(message.requestId)
    if (!pending) return true
    this.pending.delete(message.requestId)
    this.cancelTimeout(pending.timeout)
    if (message.error) {
      pending.reject(new Error(message.error))
    } else {
      pending.resolve(message.list ?? [])
    }
    return true
  }
}
