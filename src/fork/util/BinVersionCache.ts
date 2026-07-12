import type { BinVersionFingerprint } from '@shared/BinVersionCache'
import { realpath, stat } from '@shared/fs-extra'
import { isWindows } from '@shared/utils'

export type BinVersionCacheProvider = {
  get(fingerprint: BinVersionFingerprint): Promise<{ hit: boolean; value?: unknown }>
  set(fingerprint: BinVersionFingerprint, value: unknown): void
}

export const normalizeBinVersionPath = (path: string, windows = isWindows()) => {
  const normalized = path.split('\\').join('/')
  return windows ? normalized.toLowerCase() : normalized
}

export const getBinVersionFingerprint = async (
  bin: string
): Promise<BinVersionFingerprint | undefined> => {
  try {
    const realPath = await realpath(bin)
    const info = await stat(realPath)
    if (!info.isFile()) return undefined
    return {
      path: normalizeBinVersionPath(realPath),
      mtimeMs: info.mtimeMs,
      size: info.size
    }
  } catch {
    return undefined
  }
}

export class BinVersionCacheAccess {
  constructor(
    private readonly fingerprint = getBinVersionFingerprint,
    private provider?: BinVersionCacheProvider
  ) {}

  setProvider(provider?: BinVersionCacheProvider) {
    this.provider = provider
  }

  async run<T>(bin: string, loader: () => Promise<T>, isValid: (value: unknown) => value is T) {
    const fingerprint = await this.fingerprint(bin)
    if (!fingerprint || !this.provider) return loader()
    try {
      const cached = await this.provider.get(fingerprint)
      if (cached.hit && isValid(cached.value)) return cached.value
    } catch {}
    const value = await loader()
    if (isValid(value)) this.provider.set(fingerprint, value)
    return value
  }
}

const access = new BinVersionCacheAccess()

export const setBinVersionCacheProvider = (provider?: BinVersionCacheProvider) => {
  access.setProvider(provider)
}

export const withBinVersionCache = <T>(
  bin: string,
  loader: () => Promise<T>,
  isValid: (value: unknown) => value is T
) => access.run(bin, loader, isValid)
