import type { RuntimeIdentity } from './types'

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
