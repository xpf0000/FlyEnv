import { appDebugLog, isWindows } from './utils'
import { ProcessListFetch, ProcessSearch, type PItem } from './Process'
import { ProcessPidListByPid, ProcessPidListStrict } from './Process.win'
import { currentServiceStopContext } from './ServiceStopContext'

export type StopProcessListProvider = () => Promise<PItem[]>

/** A fresh local fallback used when the main-owned process-list request is unavailable. */
export const fetchStopProcessListLocal = (): Promise<PItem[]> =>
  isWindows() ? ProcessPidListStrict() : ProcessListFetch()

/**
 * 批量停止直接使用 stopService 参数中的完整表，不发送任何取表 IPC。
 * 单独停止未传表时才使用 main 短 TTL/in-flight 查询；通道失败可重新本地查询。
 * 初始表仅用于目标发现，真正的退出确认仍使用 fetchStopProcessListLocal 读新表。
 */
export class StopProcessListAccess {
  private provider?: StopProcessListProvider

  constructor(
    private readonly localFetch: () => Promise<PItem[]>,
    private readonly onFallback: (error: unknown) => void = (error) => {
      appDebugLog('[StopProcessList][local-fallback]', `${error}`).catch()
    }
  ) {}

  setProvider(provider?: StopProcessListProvider) {
    this.provider = provider
  }

  async fetch(): Promise<PItem[]> {
    const supplied = currentServiceStopContext()?.processList
    // 空数组也是有效首表，必须先于 provider 返回；慢加载/缓存失效不更换本轮列表。
    if (supplied !== undefined) return supplied
    if (this.provider) {
      try {
        return await this.provider()
      } catch (error) {
        // The local attempt is a new read, not a cached/empty substitute. If it also
        // fails, let the stop operation fail while retaining the service registration.
        this.onFallback(error)
      }
    }
    return this.localFetch()
  }

  async search(search: string, caseSensitive = true): Promise<PItem[]> {
    return ProcessSearch(search, caseSensitive, await this.fetch())
  }

  async pidsByPid(pid: string | number, list?: PItem[]): Promise<string[]> {
    // 归属确认与子孙收集共用一份列表，避免重复查询和两个采样时点的树不一致。
    return ProcessPidListByPid(pid, list ?? (await this.fetch()))
  }
}

const stopProcessListAccess = new StopProcessListAccess(fetchStopProcessListLocal)

export const setStopProcessListProvider = (provider?: StopProcessListProvider) => {
  stopProcessListAccess.setProvider(provider)
}

export const StopProcessListFetch = () => stopProcessListAccess.fetch()
export const StopProcessPidList = StopProcessListFetch
export const StopProcessListSearch = (search: string, caseSensitive = true) =>
  stopProcessListAccess.search(search, caseSensitive)
export const StopProcessPidListByPid = (pid: string | number, list?: PItem[]) =>
  stopProcessListAccess.pidsByPid(pid, list)

export type StopProcessListRequest = {
  type: 'stop-process-list-request'
  requestId: string
}

export type StopProcessListResponse = {
  type: 'stop-process-list-response'
  requestId: string
  list?: PItem[]
  error?: string
}

export const isStopProcessListRequest = (value: unknown): value is StopProcessListRequest => {
  const message = value as Partial<StopProcessListRequest> | null
  return (
    !!message &&
    message.type === 'stop-process-list-request' &&
    typeof message.requestId === 'string' &&
    message.requestId.length > 0
  )
}

export const isStopProcessListResponse = (value: unknown): value is StopProcessListResponse => {
  const message = value as Partial<StopProcessListResponse> | null
  if (
    !message ||
    message.type !== 'stop-process-list-response' ||
    typeof message.requestId !== 'string' ||
    message.requestId.length === 0
  ) {
    return false
  }

  // Bridge 成功必须显式返回数组；缺少列表不能被 Client 当成空进程表，
  // 否则查询失败会被服务停止逻辑误判为“目标已退出”。失败响应则只带错误。
  if (typeof message.error === 'string' && message.error.length > 0) {
    return message.list === undefined
  }
  if (!Array.isArray(message.list) || message.error !== undefined) return false
  return message.list.every((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false
    const process = item as Partial<PItem>
    return (
      typeof process.PID === 'string' &&
      /^\d+$/.test(process.PID) &&
      typeof process.PPID === 'string' &&
      /^\d+$/.test(process.PPID) &&
      typeof process.USER === 'string' &&
      typeof process.COMMAND === 'string' &&
      (process.CREATED === undefined ||
        (typeof process.CREATED === 'string' &&
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(process.CREATED) &&
          Number.isFinite(Date.parse(process.CREATED)))) &&
      (process.EXECUTABLE === undefined || typeof process.EXECUTABLE === 'string')
    )
  })
}
