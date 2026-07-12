export type EnvSyncSnapshot = {
  revision: number
  env: Record<string, string>
  cmdPath?: string
  powerShellPath?: string
  systemPath?: string
  fetchedAt: number
  expiresAt: number
}

export type EnvSyncGetRequest = {
  type: 'env-sync-get'
  requestId: string
}

export type EnvSyncGetResponse = {
  type: 'env-sync-get-response'
  requestId: string
  snapshot?: EnvSyncSnapshot
  error?: string
}

export type EnvSyncInvalidateRequest = {
  type: 'env-sync-invalidate'
  requestId: string
}

export type EnvSyncInvalidateResponse = {
  type: 'env-sync-invalidate-response'
  requestId: string
  revision?: number
  error?: string
}

export type EnvSyncInvalidated = {
  type: 'env-sync-invalidated'
  revision: number
}

export type EnvSyncRequest = EnvSyncGetRequest | EnvSyncInvalidateRequest
export type EnvSyncResponse = EnvSyncGetResponse | EnvSyncInvalidateResponse

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0

const isRevision = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const hasOptionalString = (value: Record<string, unknown>, key: string) =>
  value[key] === undefined || typeof value[key] === 'string'

export const isEnvSyncSnapshot = (value: unknown): value is EnvSyncSnapshot => {
  if (!isObject(value) || !isRevision(value.revision) || !isObject(value.env)) return false
  if (!Object.values(value.env).every((item) => typeof item === 'string')) return false
  return (
    isFiniteNumber(value.fetchedAt) &&
    isFiniteNumber(value.expiresAt) &&
    value.expiresAt >= value.fetchedAt &&
    hasOptionalString(value, 'cmdPath') &&
    hasOptionalString(value, 'powerShellPath') &&
    hasOptionalString(value, 'systemPath')
  )
}

export const isEnvSyncGetRequest = (value: unknown): value is EnvSyncGetRequest =>
  isObject(value) && value.type === 'env-sync-get' && isNonEmptyString(value.requestId)

export const isEnvSyncGetResponse = (value: unknown): value is EnvSyncGetResponse =>
  isObject(value) &&
  value.type === 'env-sync-get-response' &&
  isNonEmptyString(value.requestId) &&
  (value.snapshot === undefined || isEnvSyncSnapshot(value.snapshot)) &&
  (value.error === undefined || typeof value.error === 'string')

export const isEnvSyncInvalidateRequest = (value: unknown): value is EnvSyncInvalidateRequest =>
  isObject(value) && value.type === 'env-sync-invalidate' && isNonEmptyString(value.requestId)

export const isEnvSyncInvalidateResponse = (value: unknown): value is EnvSyncInvalidateResponse =>
  isObject(value) &&
  value.type === 'env-sync-invalidate-response' &&
  isNonEmptyString(value.requestId) &&
  (value.revision === undefined || isRevision(value.revision)) &&
  (value.error === undefined || typeof value.error === 'string')

export const isEnvSyncInvalidated = (value: unknown): value is EnvSyncInvalidated =>
  isObject(value) && value.type === 'env-sync-invalidated' && isRevision(value.revision)
