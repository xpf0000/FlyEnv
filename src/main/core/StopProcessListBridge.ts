import type { PItem } from '@shared/Process'
import { isStopProcessListRequest, type StopProcessListResponse } from '@shared/StopProcessList'

type StopProcessListSource = {
  get(): Promise<PItem[]>
}

export class StopProcessListBridge {
  constructor(private readonly source: StopProcessListSource) {}

  handle(message: unknown, reply: (message: StopProcessListResponse) => void): boolean {
    if (!isStopProcessListRequest(message)) return false
    void this.source
      .get()
      .then((list) => {
        reply({
          type: 'stop-process-list-response',
          requestId: message.requestId,
          list
        })
      })
      .catch((error) => {
        reply({
          type: 'stop-process-list-response',
          requestId: message.requestId,
          error: error instanceof Error ? error.message : String(error)
        })
      })
    return true
  }
}
