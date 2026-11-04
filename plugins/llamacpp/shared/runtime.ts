import type { RuntimeIdentity } from './types'
import type { SoftInstalled } from '@shared/app'
import type { RuntimeBackend } from './types'

const isRuntimeBackend = (value: unknown): value is RuntimeBackend =>
  value === 'cpu' || value === 'cuda' || value === 'vulkan' || value === 'metal'

export const runtimeBackend = (runtime?: Pick<SoftInstalled, 'note' | 'flag'>): RuntimeBackend => {
  if (typeof runtime?.note === 'string') {
    try {
      const backend = JSON.parse(runtime.note)?.backend
      if (isRuntimeBackend(backend)) return backend
    } catch {}
  }
  return isRuntimeBackend(runtime?.flag) ? runtime.flag : 'cpu'
}

export const runtimeIdentityKey = (variant: RuntimeIdentity): string =>
  [variant.release, variant.platform, variant.arch, variant.backend, variant.cudaVersion]
    .filter(Boolean)
    .join('|')

export const runtimeDirectoryName = (variant: RuntimeIdentity): string =>
  [
    variant.release,
    variant.platform,
    variant.arch,
    variant.backend,
    variant.backend === 'cuda' && variant.cudaVersion
  ]
    .filter(Boolean)
    .join('-')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
