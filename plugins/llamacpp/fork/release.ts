import type { RuntimeAsset, RuntimeBackend, RuntimeHost, RuntimeVariant } from '../shared/types'
import axios from 'axios'
import { getAxiosProxy } from '@fork/util/Axios'

export interface GitHubRelease {
  tag_name: string
  prerelease: boolean
  assets: Array<{
    name: string
    size: number
    browser_download_url: string
    digest?: string | null
  }>
}

const sha256Of = (digest?: string | null): string | undefined => {
  if (!digest) return undefined
  const match = /^sha256:([a-f\d]{64})$/i.exec(digest.trim())
  return match?.[1].toLowerCase()
}

const asAsset = (asset: GitHubRelease['assets'][number]): RuntimeAsset => ({
  assetName: asset.name,
  assetUrl: asset.browser_download_url,
  size: asset.size,
  sha256: sha256Of(asset.digest)
})

export const parseAssetIdentity = (name: string, release: string): Omit<RuntimeVariant, keyof RuntimeAsset | 'companion'> | undefined => {
  const escapedTag = release.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const prefix = new RegExp(`^(?:cudart-)?llama-(?:${escapedTag}-)?bin-`)
  if (!prefix.test(name)) return undefined

  const withoutPrefix = name.replace(prefix, '')
  const suffix = /\.(?:zip|tar\.gz|tgz)$/i
  if (!suffix.test(withoutPrefix)) return undefined
  const target = withoutPrefix.replace(suffix, '')
  let platform: RuntimeHost['platform']
  let arch: RuntimeHost['arch']
  let backend: RuntimeBackend
  let cudaVersion: string | undefined

  if (/^macos-(arm64|x64)$/.test(target)) {
    platform = 'macos'
    arch = target.endsWith('arm64') ? 'arm64' : 'x64'
    backend = 'metal'
  } else if (/^win-(?:cpu|cuda(?:-\d+(?:\.\d+)?)?|vulkan)-(x64|arm64)$/.test(target)) {
    platform = 'windows'
    arch = target.endsWith('arm64') ? 'arm64' : 'x64'
    const backendPart = target.slice(4, target.lastIndexOf('-'))
    if (backendPart === 'cpu') backend = 'cpu'
    else if (backendPart === 'vulkan') backend = 'vulkan'
    else {
      backend = 'cuda'
      cudaVersion = /^cuda-(.+)$/.exec(backendPart)?.[1]
    }
  } else if (/^ubuntu-(?:cpu|cuda(?:-\d+(?:\.\d+)?)?|vulkan)-(x64|arm64)$/.test(target)) {
    platform = 'linux'
    arch = target.endsWith('arm64') ? 'arm64' : 'x64'
    const backendPart = target.slice(7, target.lastIndexOf('-'))
    if (backendPart === 'cpu') backend = 'cpu'
    else if (backendPart === 'vulkan') backend = 'vulkan'
    else {
      backend = 'cuda'
      cudaVersion = /^cuda-(.+)$/.exec(backendPart)?.[1]
    }
  } else if (/^ubuntu-vulkan-(x64|arm64)$/.test(target)) {
    platform = 'linux'
    arch = target.endsWith('arm64') ? 'arm64' : 'x64'
    backend = 'vulkan'
  } else if (/^ubuntu-(x64|arm64)$/.test(target)) {
    platform = 'linux'
    arch = target.endsWith('arm64') ? 'arm64' : 'x64'
    backend = 'cpu'
  } else {
    return undefined
  }

  // The first plugin release intentionally exposes only the variants agreed in the design.
  if (platform === 'windows' && (arch !== 'x64' || backend === 'metal')) return undefined
  if (platform === 'macos' && (arch !== 'arm64' || backend !== 'metal')) return undefined
  if (platform === 'linux' && backend === 'metal') return undefined
  if (platform === 'linux' && arch === 'arm64' && backend === 'cuda') return undefined
  if (backend === 'cuda' && !cudaVersion) return undefined
  return { release, platform, arch, backend, cudaVersion }
}

export const hasMatchingCudaIdentity = (runtimeName: string, companionName: string, release: string): boolean => {
  const runtime = parseAssetIdentity(runtimeName, release)
  const companion = parseAssetIdentity(companionName, release)
  return !!runtime && !!companion && runtime.backend === 'cuda' && companion.backend === 'cuda' &&
    runtime.platform === companion.platform && runtime.arch === companion.arch && runtime.cudaVersion === companion.cudaVersion
}

export const parseReleaseAssets = (release: GitHubRelease, host: RuntimeHost): RuntimeVariant[] => {
  const companions = new Map<string, GitHubRelease['assets'][number]>()
  for (const asset of release.assets) {
    if (!asset.name.startsWith('cudart-')) continue
    const identity = parseAssetIdentity(asset.name, release.tag_name)
    if (identity?.backend === 'cuda') companions.set([identity.platform, identity.arch, identity.backend, identity.cudaVersion].join('|'), asset)
  }
  const variants: RuntimeVariant[] = []
  for (const asset of release.assets) {
    if (asset.name.startsWith('cudart-')) continue
    const identity = parseAssetIdentity(asset.name, release.tag_name)
    if (!identity || identity.platform !== host.platform || identity.arch !== host.arch) continue
    const variant: RuntimeVariant = { ...identity, ...asAsset(asset) }
    if (identity.backend === 'cuda') {
      const companion = companions.get([identity.platform, identity.arch, identity.backend, identity.cudaVersion].join('|'))
      if (!companion) continue
      variant.companion = asAsset(companion)
    }
    variants.push(variant)
  }
  return variants.sort((a, b) => {
    const order: RuntimeBackend[] = ['cpu', 'cuda', 'vulkan', 'metal']
    return order.indexOf(a.backend) - order.indexOf(b.backend) || (a.cudaVersion ?? '').localeCompare(b.cudaVersion ?? '')
  })
}

export const normalizeRuntimeHost = (platform = process.platform, arch = process.arch): RuntimeHost | undefined => {
  const normalizedPlatform = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : platform === 'linux' ? 'linux' : undefined
  const normalizedArch = arch === 'x64' ? 'x64' : arch === 'arm64' ? 'arm64' : undefined
  if (!normalizedPlatform || !normalizedArch) return undefined
  return { platform: normalizedPlatform, arch: normalizedArch }
}

export const fetchRuntimeReleases = async (channel: 'stable' | 'prerelease', host: RuntimeHost): Promise<RuntimeVariant[]> => {
  const variants: RuntimeVariant[] = []
  for (let page = 1; page <= 20; page++) {
    const response = await axios.get<GitHubRelease[]>('https://api.github.com/repos/ggml-org/llama.cpp/releases', {
      params: { per_page: 100, page },
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      timeout: 30_000,
      proxy: getAxiosProxy()
    })
    const releases = response.data
    if (!releases.length) break
    const matching = releases.filter((release) => channel === 'prerelease' ? release.prerelease : !release.prerelease)
    variants.push(...matching.flatMap((release) => parseReleaseAssets(release, host)))
    // GitHub sorts by recency, so stable releases can fall behind many daily prereleases.
    if (channel === 'prerelease' || variants.length) break
  }
  return variants
}
