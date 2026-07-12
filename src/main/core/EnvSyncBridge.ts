import {
  isEnvSyncGetRequest,
  isEnvSyncInvalidateRequest,
  type EnvSyncResponse,
  type EnvSyncSnapshot
} from '@shared/EnvSyncProtocol'

type EnvSyncSource = {
  get(): Promise<EnvSyncSnapshot>
  invalidate(): Promise<number>
}

export class EnvSyncBridge {
  constructor(private readonly source: EnvSyncSource) {}

  handle(message: unknown, reply: (message: EnvSyncResponse) => void): boolean {
    if (isEnvSyncGetRequest(message)) {
      void this.source
        .get()
        .then((snapshot) => {
          reply({ type: 'env-sync-get-response', requestId: message.requestId, snapshot })
        })
        .catch((error) => {
          reply({
            type: 'env-sync-get-response',
            requestId: message.requestId,
            error: error instanceof Error ? error.message : String(error)
          })
        })
      return true
    }
    if (isEnvSyncInvalidateRequest(message)) {
      void this.source
        .invalidate()
        .then((revision) => {
          reply({
            type: 'env-sync-invalidate-response',
            requestId: message.requestId,
            revision
          })
        })
        .catch((error) => {
          reply({
            type: 'env-sync-invalidate-response',
            requestId: message.requestId,
            error: error instanceof Error ? error.message : String(error)
          })
        })
      return true
    }
    return false
  }
}
