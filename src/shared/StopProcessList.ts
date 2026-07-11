import { appDebugLog, isWindows } from './utils'
import { ProcessListFetch, ProcessSearch, type PItem } from './Process'
import { ProcessPidListByPid, ProcessPidListStrict } from './Process.win'

export type StopProcessListProvider = () => Promise<PItem[]>

export const fetchStopProcessListLocal = (): Promise<PItem[]> =>
  isWindows() ? ProcessPidListStrict() : ProcessListFetch()

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
    if (this.provider) {
      try {
        return await this.provider()
      } catch (error) {
        this.onFallback(error)
      }
    }
    return this.localFetch()
  }

  async search(search: string, caseSensitive = true): Promise<PItem[]> {
    return ProcessSearch(search, caseSensitive, await this.fetch())
  }

  async pidsByPid(pid: string | number): Promise<string[]> {
    return ProcessPidListByPid(pid, await this.fetch())
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
export const StopProcessPidListByPid = (pid: string | number) =>
  stopProcessListAccess.pidsByPid(pid)

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
  return (
    !!message &&
    message.type === 'stop-process-list-response' &&
    typeof message.requestId === 'string' &&
    message.requestId.length > 0
  )
}
