import type { PItem } from '@shared/Process'

export type StopProcessListCacheEvent =
  | { type: 'hit' }
  | { type: 'join' }
  | { type: 'miss' }
  | { type: 'invalidate'; reason: string }
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
  /** 启动/批量边界递增代次，旧查询完成不能把失效前列表重新写回。 */
  private revision = 0
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

  /**
   * 不在每个 stop 调用中失效，否则并行服务会再次各查一遍。
   * 失效只影响后续读取；已经等待旧查询的请求保留其终态，不强行取消系统查询。
   */
  invalidate(reason: string) {
    this.revision += 1
    this.cache = undefined
    this.inFlight = undefined
    this.onEvent({ type: 'invalidate', reason })
  }

  /** 普通短缓存只合并查询；批量调用取到表后直接作为参数传递，不再登记/释放批次。 */
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
    const revision = this.revision
    const pending: Promise<PItem[]> = Promise.resolve()
      .then(() => this.fetchList())
      .then((list) => {
        // 启动/批量边界可能发生在 CIM 查询期间；只允许当前代次发布结果。
        if (revision === this.revision) {
          this.cache = {
            list,
            expiresAt: this.now() + this.ttlMs
          }
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
        // 旧查询可能晚于新查询完成，不能清空新请求正在共享的 Promise。
        if (this.inFlight === pending) this.inFlight = undefined
      })
    this.inFlight = pending
    return pending
  }
}
