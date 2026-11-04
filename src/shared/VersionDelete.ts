export const FORCE_DELETE_CONFIRMATION = 'Force Delete'

export type VersionDeleteTarget = {
  path: string
  bin: string
}

export type ManagedVersionDirectory = VersionDeleteTarget & {
  identity: string
}

export type VersionDeleteResponse<T> = { code: 0; data: T } | { code: 1; msg: string }
