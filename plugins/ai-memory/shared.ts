export const MEMORY_TYPES = [
  'preference',
  'fact',
  'event',
  'procedure',
  'project_state',
  'decision',
  'observation',
  'note'
] as const
export type MemoryType = (typeof MEMORY_TYPES)[number]
export type ScopeRef = { scope: 'global' } | { scope: 'project'; project_path: string }
export type ResolvedScope = { key: string; directory: string; projectId?: string }
export type MemorySource = {
  kind: 'user_statement' | 'tool_result' | 'document' | 'agent_inference'
  agent: string
  description: string
  uri?: string
  session_id?: string
}
export type MemoryDraft = {
  type: MemoryType
  topic: string
  title: string
  summary: string
  tags: string[]
  content: string
  source: MemorySource
  status?: 'active' | 'archived'
  pinned?: boolean
  expires_at?: string | null
  occurred_at?: string | null
}
export type SearchInput = ScopeRef & {
  queries?: string[]
  type?: MemoryType
  topic?: string
  tags?: string[]
  include_global?: boolean
  status?: 'active' | 'archived'
  include_expired?: boolean
  limit?: number
  cursor?: string
}
export type MemoryInputs = {
  search: SearchInput
  get: ScopeRef & { id: string; revision?: number }
  store: ScopeRef & MemoryDraft & { request_id: string; create_project?: boolean }
  update: ScopeRef & {
    id: string
    expected_revision: number
    changes: Partial<MemoryDraft>
    reason: string
    request_id: string
  }
  forget: ScopeRef & { id: string; expected_revision: number; request_id: string }
}
export type MemoryMethod = keyof MemoryInputs
export type RequestReceipt = {
  operation: 'store' | 'update'
  request_id: string
  request_digest: string
  result_revision: number
}
export type MemorySnapshot = Omit<MemoryDraft, 'content'> & {
  id: string
  revision: number
  created_at: string
  updated_at: string
  change_reason: string
  status: 'active' | 'archived'
  pinned: boolean
  body_ref: string
  body_sha256: string
  body_bytes: number
  receipt: RequestReceipt
}
export type MemoryRecord = { schema_version: 1; current: MemorySnapshot; history: MemorySnapshot[] }
export type MemoryTombstone = {
  schema_version: 1
  id: string
  deleted_revision: number
  operation: 'forget'
  request_id: string
  request_digest: string
  cleanup_state: 'pending' | 'complete'
  outcome: 'partial' | 'success'
}
export type SearchHit = Pick<
  MemorySnapshot,
  | 'id'
  | 'revision'
  | 'type'
  | 'topic'
  | 'title'
  | 'summary'
  | 'tags'
  | 'created_at'
  | 'updated_at'
  | 'status'
  | 'pinned'
  | 'expires_at'
  | 'occurred_at'
> & {
  scope: 'project' | 'global'
  projectId?: string
  expired?: boolean
  source?: MemorySource
  metadata_omitted?: ('source' | 'summary' | 'tags' | 'topic')[]
}
export type ProjectCandidate = { name: string; project_path: string }
export type SearchPage = {
  results: SearchHit[]
  truncated: boolean
  next_cursor?: string
  project_candidates?: ProjectCandidate[]
  unregistered?: boolean
}
export type MemoryView = Omit<
  MemorySnapshot,
  'body_ref' | 'body_sha256' | 'body_bytes' | 'receipt'
> & { content: string }
export type MutationReceipt = { id: string; revision: number }
export type MemoryOutputs = {
  search: SearchPage
  get: MemoryView
  store: MutationReceipt
  update: MutationReceipt
  forget: MutationReceipt & { cleanup_state: 'pending' | 'complete' }
}
export type MemoryWarning = { code: string; id?: string }
export type MemoryOutcome =
  'success' | 'partial' | 'failed' | 'conflict' | 'unknown' | 'deleted' | 'already_deleted' | 'busy'
export type MemoryResult<T> = {
  outcome: MemoryOutcome
  data?: T
  id?: string
  revision?: number
  warnings?: MemoryWarning[]
  error_code?: string
  project_candidates?: ProjectCandidate[]
}
export interface MemoryAPI {
  call<M extends MemoryMethod>(
    method: M,
    input: MemoryInputs[M]
  ): Promise<MemoryResult<MemoryOutputs[M]>>
}
export type ScopeBudgets = {
  recordBytes: number
  scopeReadBytes: number
  cacheBytes: number
  readConcurrency: number
  responseBytes: number
}

export type MemoryProjectInfo = {
  projectId: string
  name: string
  project_path: string
  path_status: 'available' | 'missing' | 'unavailable'
}
export type ProjectMappingInspection = {
  status: 'valid' | 'missing' | 'invalid'
  revision?: number
  projectIds?: string[]
  error_code?: string
}
export type ProjectRecoveryReport = {
  primary: ProjectMappingInspection
  previous: ProjectMappingInspection
  projectDirectoryIds: string[]
  unmappedProjectIds: string[]
  unmappedAfterPreviousRestore: string[]
  warnings: MemoryWarning[]
}

export type MemoryAdminInput<M extends MemoryMethod> = Omit<
  MemoryInputs[M],
  'scope' | 'project_path'
>
export interface MemoryAdminAPI {
  listProjects(): Promise<MemoryResult<MemoryProjectInfo[]>>
  inspectRecovery(): Promise<MemoryResult<ProjectRecoveryReport>>
  callForProject<M extends MemoryMethod>(
    projectId: string,
    method: M,
    input: MemoryAdminInput<M>
  ): Promise<MemoryResult<MemoryOutputs[M]>>
}
