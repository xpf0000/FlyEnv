import { tokenizeExtraArgs } from '../shared/extraArguments'
import { isStandaloneGGUFPath, modelFileKey } from '../shared/modelFile'
import type { LocalModel, RuntimeBackend } from '../shared/types'
import {
  clone,
  type BaseSettings,
  type LlamaCppSettingsV2,
  type ModelProfile,
  type ServiceSettings,
  type FileFingerprint
} from '../shared/settings'
export const SETTINGS_KEY = 'flyenv-llama-cpp-settings-v2'
export const readOptionalStorage = async <T>(read: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await read()
  } catch (error) {
    if (error instanceof Error && (error.message === 'no found' || error.message === 'expire'))
      return undefined
    throw error
  }
}
interface Storage {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<unknown>
}
export const fingerprint = (m: LocalModel): FileFingerprint => ({
  size: m.size,
  sha256: m.sha256,
  ...(m.mtimeMs === undefined ? {} : { mtimeMs: m.mtimeMs })
})
export const createModelProfile = (m: LocalModel, base: BaseSettings): ModelProfile => ({
  modelKey: modelFileKey(m),
  fingerprint: fingerprint(m),
  revision: 0,
  base: clone(base),
  multimodal: { mode: 'unset' },
  performance: {},
  chat: { template: { kind: 'model' } },
  speculation: { mode: 'default' },
  sampling: {},
  extraArgsText: '',
  backendOverrides: {
    cpu: { gpuLayers: 0 },
    cuda: { gpuLayers: 0 },
    vulkan: { gpuLayers: 0 },
    metal: { gpuLayers: 0 }
  }
})
export const migrateSettings = (legacy: unknown, files: LocalModel[]): LlamaCppSettingsV2 => {
  const old = legacy as { profile?: Record<string, any>; selectedModel?: LocalModel } | undefined
  const p = old?.profile ?? {}
  const base = { contextSize: p.contextSize ?? 8192, threads: p.threads ?? 4 }
  const profiles: Record<string, ModelProfile> = {}
  for (const m of files.filter((m) => m.standalone ?? isStandaloneGGUFPath(m.path, m.repoId))) {
    const v = createModelProfile(m, base)
    const b = (p.backend ?? 'cpu') as RuntimeBackend
    v.backendOverrides[b] = {
      gpuLayers: b === 'cpu' ? 0 : (p.gpuLayers ?? 0),
      gpuDevice: b === 'cpu' ? undefined : p.gpuDevice
    }
    profiles[v.modelKey] = v
  }
  const selected = old?.selectedModel ? modelFileKey(old.selectedModel) : undefined
  return {
    schemaVersion: 2,
    revision: 0,
    service: {
      host: p.host ?? '127.0.0.1',
      port: p.port ?? 8080,
      apiKeyFile: p.apiKeyFile,
      revision: 0
    },
    initialBase: base,
    modelProfiles: profiles,
    selectedModelKey: selected && profiles[selected] ? selected : Object.keys(profiles)[0]
  }
}
export class ProfilesRepository {
  current!: LlamaCppSettingsV2
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private storage: Storage) {}
  async load(files: LocalModel[]) {
    const v = await readOptionalStorage(() => this.storage.get(SETTINGS_KEY))
    if (v !== undefined && v !== null) {
      const s = v as LlamaCppSettingsV2
      if (s.schemaVersion !== 2 || !s.service || !s.modelProfiles || !Number.isInteger(s.revision))
        throw Error('Invalid llama.cpp V2 settings; original data retained')
      this.current = clone(s)
    } else {
      const legacy = await readOptionalStorage(() => this.storage.get('flyenv-llama-cpp-settings'))
      const s = migrateSettings(legacy, files)
      await this.storage.set(SETTINGS_KEY, clone(s))
      this.current = s
    }
    return this.current
  }
  private update(change: (s: LlamaCppSettingsV2) => void) {
    const work = this.queue
      .catch(() => {})
      .then(async () => {
        const next = clone(this.current)
        change(next)
        next.revision++
        await this.storage.set(SETTINGS_KEY, clone(next))
        this.current = next
        return next
      })
    this.queue = work
    return work
  }
  commitProfile(p: ModelProfile, expectedRevision: number) {
    return this.update((s) => {
      const old = s.modelProfiles[p.modelKey]
      if (old && old.revision !== expectedRevision)
        throw Error('Stale model draft; reload before saving')
      s.modelProfiles[p.modelKey] = { ...clone(p), revision: (old?.revision ?? 0) + 1 }
    })
  }
  commitService(v: ServiceSettings, expectedRevision: number) {
    return this.update((s) => {
      if (s.service.revision !== expectedRevision) throw Error('Stale service draft')
      s.service = { ...clone(v), revision: expectedRevision + 1 }
    })
  }
  selectModel(key: string) {
    return this.update((s) => {
      if (!s.modelProfiles[key]) throw Error('Unknown model')
      s.selectedModelKey = key
    })
  }
  removeProfile(key: string) {
    return this.update((s) => {
      delete s.modelProfiles[key]
      if (s.selectedModelKey === key) s.selectedModelKey = Object.keys(s.modelProfiles)[0]
    })
  }
  acknowledgeReplacement(key: string, value: FileFingerprint, revision: number) {
    return this.commitProfile({ ...this.current.modelProfiles[key], fingerprint: value }, revision)
  }
}

export const collectModelReferences = (
  settings: LlamaCppSettingsV2,
  fileKey: string,
  files: LocalModel[]
) =>
  Object.values(settings.modelProfiles)
    .filter((p) => {
      const refs = [
        p.multimodal.mode === 'projector' ? p.multimodal.projector : undefined,
        p.chat.template.kind === 'file' ? p.chat.template.file : undefined,
        p.speculation.mode === 'draft' ? p.speculation.file : undefined
      ]
      const file = files.find((m) => modelFileKey(m) === fileKey)
      const tokens = tokenizeExtraArgs(p.extraArgsText)
      const extraUsed =
        !!file &&
        tokens.some((t, i) =>
          /^(--mmproj|-mm|--spec-draft-model|--model-draft|-md|--chat-template-file)$/.test(t.value)
            ? tokens[i + 1]?.value === file.localPath
            : /^(?:--mmproj|--spec-draft-model|--model-draft|--chat-template-file)=/.test(
                t.value
              ) && t.value.slice(t.value.indexOf('=') + 1) === file.localPath
        )
      return (
        extraUsed ||
        refs.some((ref) =>
          ref?.kind === 'managed'
            ? ref.fileKey === fileKey
            : ref?.kind === 'external' &&
              !!file &&
              ref.path.replace(/\\/g, '/') === file.localPath.replace(/\\/g, '/')
        )
      )
    })
    .map((p) => ({ modelKey: p.modelKey }))
