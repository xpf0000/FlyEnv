import type { LocalModel, RuntimeBackend } from './types'
export type ModelKey = string
export interface FileFingerprint {
  sha256?: string
  size: number
  mtimeMs?: number
  resolvedRevision?: string
}
export type ModelFileRef =
  | { kind: 'managed'; fileKey: ModelKey; fingerprint?: FileFingerprint }
  | { kind: 'external'; path: string; fingerprint?: FileFingerprint; allowUnverified?: boolean }
export interface ServiceSettings {
  host: string
  port: number
  apiKeyFile?: string
  revision: number
}
export interface BaseSettings {
  contextSize?: number
  threads?: number
  threadsBatch?: number
  batchSize?: number
  ubatchSize?: number
  parallel?: number
  alias?: string
}
export interface BackendSettings {
  gpuLayers?: number | 'auto' | 'all'
  gpuDevice?: string
  splitMode?: string
  tensorSplit?: number[]
  mainGpu?: number
  projectorOffload?: boolean
  projectorDevice?: string
  draftGpuLayers?: number | 'auto' | 'all'
  draftDevice?: string
}
export interface ModelProfile {
  modelKey: ModelKey
  fingerprint?: FileFingerprint
  revision: number
  base: BaseSettings
  multimodal: {
    mode: 'unset' | 'text' | 'projector'
    projector?: ModelFileRef
    imageMinTokens?: number
    imageMaxTokens?: number
    batchMaxTokens?: number
  }
  performance: {
    flashAttention?: 'auto' | 'on' | 'off'
    cacheTypeK?: string
    cacheTypeV?: string
    kvOffload?: boolean
    loadMode?: string
    continuousBatching?: boolean
    contextShift?: boolean
  }
  chat: {
    reasoning?: 'auto' | 'on' | 'off'
    reasoningBudget?: number
    reasoningEffort?: string
    reasoningFormat?: string
    jinja?: boolean
    template:
      { kind: 'model' } | { kind: 'builtin'; name: string } | { kind: 'file'; file: ModelFileRef }
    templateKwargs?: Record<string, unknown>
  }
  speculation:
    | { mode: 'default' | 'none' }
    | {
        mode: 'draft'
        file: ModelFileRef
        maxTokens?: number
        minTokens?: number
        threads?: number
      }
    | { mode: 'mtp'; maxTokens?: number; minTokens?: number }
    | { mode: 'ngram'; size?: number }
  sampling: {
    temperature?: number
    topP?: number
    topK?: number
    minP?: number
    repeatPenalty?: number
    presencePenalty?: number
    frequencyPenalty?: number
    seed?: number
    maxTokens?: number
  }
  extraArgsText: string
  backendOverrides: Partial<Record<RuntimeBackend, BackendSettings>>
}
export interface LlamaCppSettingsV2 {
  schemaVersion: 2
  revision: number
  service: ServiceSettings
  selectedModelKey?: ModelKey
  initialBase: BaseSettings
  modelProfiles: Record<ModelKey, ModelProfile>
}
export interface LaunchInput {
  service: ServiceSettings
  profile: ModelProfile
  model: LocalModel
  files: LocalModel[]
}
export interface ValidationIssue {
  code: string
  field?: string
  severity: 'input' | 'blocking' | 'unverified' | 'info'
  message: string
}
export interface ResolvedDependency {
  path: string
  role: 'main' | 'projector' | 'draft' | 'template'
  fingerprint: FileFingerprint
  description?: import('./modelFile').GGUFDescription
}
export interface PreparedLaunch {
  bin: string
  args: string[]
  environmentSources?: Record<string, string>
  env: Record<string, string>
  cwd: string
  runtimeKey: string
  requestKey: string
  dependencies: ResolvedDependency[]
  resolvedInput: LaunchInput
  display: string
}
export interface LaunchReport {
  requestKey: string
  issues: ValidationIssue[]
  prepared?: PreparedLaunch
}
export interface RuntimeObservation {
  modalities?: string[]
  templateCaps?: Record<string, unknown>
  reason?: string
}
export interface ActiveLaunchSnapshot {
  launch: PreparedLaunch
  pid: string
  startedAt: number
  observation: RuntimeObservation
}
export interface LaunchState {
  kind: 'stopped' | 'running-known' | 'running-unknown' | 'unknown'
  active?: ActiveLaunchSnapshot
  lastSuccess?: ActiveLaunchSnapshot
}
export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const stable = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([, x]) => x !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, stable(x)])
        )
      : v
export const launchConfigKey = (input: LaunchInput, runtimeKey: string): string => {
  const p = clone(input.profile)
  const service = clone(input.service)
  delete (p as any).revision
  delete (service as any).revision
  const backend = JSON.parse(runtimeKey).backend as RuntimeBackend
  p.backendOverrides = { [backend]: p.backendOverrides[backend] }
  if (p.multimodal.mode !== 'projector') delete p.multimodal.projector
  return JSON.stringify(stable({ service, profile: p, model: input.model.localPath, runtimeKey }))
}
