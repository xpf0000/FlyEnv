export type Platform = 'macOS' | 'Windows' | 'Linux'
export type ClusterMode = 'standalone' | 'replication' | 'group-replication'
export type InstanceId = string
export interface EngineRef {
  version: string
  path: string
  bin: string
  source: 'Static' | 'Homebrew' | 'Macports'
  name?: string
  installationBin?: string
}
export interface InstanceSpec {
  id: InstanceId
  name: string
  engine: EngineRef
  port: number
  socket: string
  dataDir: string
  serverId: number
  groupId?: string
  groupPort?: number
}
export interface ClusterSpec {
  id: string
  name: string
  mode: ClusterMode
  memberIds: InstanceId[]
  groupUuid?: string
}
export interface SavedCatalog {
  schemaVersion: 1
  instances: InstanceSpec[]
  clusters: ClusterSpec[]
}
export interface Credential {
  user: string
  password: string
}
export type Credentials = Record<InstanceId, Credential>
export interface CreateRequest {
  cluster: ClusterSpec
  instances: InstanceSpec[]
  credentials: Credentials
}
export interface ReplicationStatus {
  state: 'online' | 'recovering' | 'error' | 'unknown'
  role: 'PRIMARY' | 'SECONDARY' | 'SOURCE' | 'REPLICA' | 'STANDALONE' | 'UNKNOWN'
  lag: number | null
  error?: string
  sourcePort?: number
}
export interface InstanceSnapshot {
  id: string
  state: 'stopped' | 'running' | 'unknown' | 'missing'
  pid?: string
  role?: ReplicationStatus['role']
  replication?: ReplicationStatus
  error?: string
}
export interface OperationEvent {
  operationId: string
  instanceId?: string
  stage: string
  message?: string
}
export type EventSink = (event: OperationEvent) => void
export interface ItemOutcome {
  id: string
  status: 'completed' | 'failed' | 'skipped' | 'unknown'
  stage: string
  error?: string
}
export interface OperationResult {
  status: ItemOutcome['status'] | 'partial'
  items: ItemOutcome[]
}
export const emptyCatalog = (): SavedCatalog => ({ schemaVersion: 1, instances: [], clusters: [] })
export const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
export const summarize = (items: ItemOutcome[]): OperationResult => ({
  status: items.every((i) => i.status === 'completed')
    ? 'completed'
    : items.some((i) => i.status === 'completed')
      ? 'partial'
      : items.some((i) => i.status === 'unknown')
        ? 'unknown'
        : 'failed',
  items
})
