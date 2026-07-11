import type { PItem } from './Process'

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
