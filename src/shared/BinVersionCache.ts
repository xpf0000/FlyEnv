export type BinVersionFingerprint = {
  path: string
  mtimeMs: number
  size: number
}

export type BinVersionCacheEntry = {
  mtimeMs: number
  size: number
  value: unknown
}

export type BinVersionCacheFile = {
  schemaVersion: 1
  entries: Record<string, BinVersionCacheEntry>
}

export type BinVersionCacheGet = {
  type: 'bin-version-cache-get'
  requestId: string
  fingerprint: BinVersionFingerprint
}

export type BinVersionCacheGetResponse = {
  type: 'bin-version-cache-get-response'
  requestId: string
  hit: boolean
  value?: unknown
}

export type BinVersionCacheSet = {
  type: 'bin-version-cache-set'
  fingerprint: BinVersionFingerprint
  value: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

export const isBinVersionFingerprint = (value: unknown): value is BinVersionFingerprint => {
  if (!isRecord(value)) return false
  return (
    typeof value.path === 'string' &&
    value.path.length > 0 &&
    typeof value.mtimeMs === 'number' &&
    Number.isFinite(value.mtimeMs) &&
    typeof value.size === 'number' &&
    Number.isFinite(value.size) &&
    value.size >= 0
  )
}

export const isBinVersionCacheEntry = (value: unknown): value is BinVersionCacheEntry => {
  if (!isRecord(value)) return false
  return (
    typeof value.mtimeMs === 'number' &&
    Number.isFinite(value.mtimeMs) &&
    typeof value.size === 'number' &&
    Number.isFinite(value.size) &&
    value.size >= 0 &&
    Object.prototype.hasOwnProperty.call(value, 'value')
  )
}

export const isBinVersionCacheFile = (value: unknown): value is BinVersionCacheFile => {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.entries)) return false
  return Object.values(value.entries).every(isBinVersionCacheEntry)
}

export const isBinVersionCacheGet = (value: unknown): value is BinVersionCacheGet => {
  if (!isRecord(value)) return false
  return (
    value.type === 'bin-version-cache-get' &&
    typeof value.requestId === 'string' &&
    value.requestId.length > 0 &&
    isBinVersionFingerprint(value.fingerprint)
  )
}

export const isBinVersionCacheGetResponse = (
  value: unknown
): value is BinVersionCacheGetResponse => {
  if (!isRecord(value)) return false
  return (
    value.type === 'bin-version-cache-get-response' &&
    typeof value.requestId === 'string' &&
    value.requestId.length > 0 &&
    typeof value.hit === 'boolean'
  )
}

export const isBinVersionCacheSet = (value: unknown): value is BinVersionCacheSet => {
  if (!isRecord(value)) return false
  return (
    value.type === 'bin-version-cache-set' &&
    isBinVersionFingerprint(value.fingerprint) &&
    Object.prototype.hasOwnProperty.call(value, 'value')
  )
}
