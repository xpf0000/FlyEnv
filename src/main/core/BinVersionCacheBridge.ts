import {
  isBinVersionCacheGet,
  isBinVersionCacheSet,
  type BinVersionCacheGetResponse,
  type BinVersionFingerprint
} from '@shared/BinVersionCache'

type BinVersionCacheStoreSource = {
  get(fingerprint: BinVersionFingerprint): Promise<{ hit: boolean; value?: unknown }>
  set(fingerprint: BinVersionFingerprint, value: unknown): Promise<boolean>
}

export class BinVersionCacheBridge {
  constructor(private readonly source: BinVersionCacheStoreSource) {}

  handle(message: unknown, reply: (message: BinVersionCacheGetResponse) => void): boolean {
    if (isBinVersionCacheGet(message)) {
      void this.source
        .get(message.fingerprint)
        .then((result) => {
          reply({
            type: 'bin-version-cache-get-response',
            requestId: message.requestId,
            ...result
          })
        })
        .catch(() => {
          reply({
            type: 'bin-version-cache-get-response',
            requestId: message.requestId,
            hit: false
          })
        })
      return true
    }
    if (isBinVersionCacheSet(message)) {
      void this.source.set(message.fingerprint, message.value)
      return true
    }
    return false
  }
}
