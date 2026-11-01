import axios from 'axios'
import { getAxiosProxy } from '@fork/util/Axios'

export type SamWafPlatform = 'windows' | 'linux' | 'macos'
export type SamWafArch = 'x64' | 'arm64'

export type SamWafAssetTarget = {
  platform: SamWafPlatform
  arch: SamWafArch
  ext: 'zip' | 'tar.gz'
  executable: string
}

export type SamWafReleaseAsset = {
  name: string
  browser_download_url: string
  digest?: string | null
}

export type SamWafRelease = {
  tag_name: string
  prerelease: boolean
  assets: SamWafReleaseAsset[]
}

export type SamWafOnlineVersion = SamWafAssetTarget & {
  version: string
  url: string
  sha256?: string
}

/** Executable file names inside each archive, keyed by `${platform}/${arch}`. */
export const SAMWAF_EXECUTABLES: Record<string, string> = {
  'windows/x64': 'SamWaf64.exe',
  'linux/x64': 'SamWafLinux64',
  'linux/arm64': 'SamWafLinuxArm64',
  'macos/x64': 'SamWafDarwin64',
  'macos/arm64': 'SamWafDarwinArm64'
}

const OS_NAME: Record<SamWafPlatform, string> = {
  windows: 'Windows',
  linux: 'Linux',
  macos: 'Darwin'
}

export const parseAssetTarget = (name: string): SamWafAssetTarget | undefined => {
  const match = /^SamWaf_(Windows|Linux|Darwin)_(x86_64|arm64)\.v.+\.(zip|tar\.gz)$/.exec(name)
  if (!match) return undefined
  const platform = (
    match[1] === 'Windows' ? 'windows' : match[1] === 'Linux' ? 'linux' : 'macos'
  ) as SamWafPlatform
  const arch = (match[2] === 'x86_64' ? 'x64' : 'arm64') as SamWafArch
  const executable = SAMWAF_EXECUTABLES[`${platform}/${arch}`]
  if (!executable) return undefined
  return { platform, arch, ext: match[3] as 'zip' | 'tar.gz', executable }
}

export const filterStableReleases = (releases: SamWafRelease[]): SamWafRelease[] => {
  return releases.filter((release) => !release.prerelease)
}

export const sha256OfDigest = (digest?: string | null): string | undefined => {
  if (!digest) return undefined
  const match = /^sha256:([a-f\d]{64})$/i.exec(digest.trim())
  return match?.[1].toLowerCase()
}

export const pickAsset = (
  release: SamWafRelease,
  platform: SamWafPlatform,
  arch: SamWafArch
): SamWafOnlineVersion | undefined => {
  for (const asset of release.assets) {
    const target = parseAssetTarget(asset.name)
    if (!target || target.platform !== platform || target.arch !== arch) continue
    return {
      ...target,
      version: release.tag_name,
      url: asset.browser_download_url,
      sha256: sha256OfDigest(asset.digest)
    }
  }
  return undefined
}

/** Numeric sort key: v1.3.24 -> 10324, v1.10.0 -> 11000. Unparseable -> 0. */
export const releaseVersionNum = (tag: string): number => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(tag.trim())
  if (!match) return 0
  return Number(match[1]) * 10000 + Number(match[2]) * 100 + Number(match[3])
}

const RELEASE_APIS = [
  'https://api.github.com/repos/samwafgo/SamWaf/releases',
  'https://gitee.com/api/v5/repos/samwaf/SamWaf/releases'
]

/**
 * Fetch online versions for the current host. GitHub first, Gitee as the CN
 * fallback. A source that errors or yields no host asset falls through to the
 * next; if every source fails the caller gets [] (never throws).
 */
export const fetchOnlineVersions = async (
  platform: SamWafPlatform,
  arch: SamWafArch
): Promise<SamWafOnlineVersion[]> => {
  for (const api of RELEASE_APIS) {
    try {
      const response = await axios.get<SamWafRelease[]>(api, {
        params: { per_page: 20 },
        headers: { Accept: 'application/vnd.github+json' },
        timeout: 15_000,
        proxy: getAxiosProxy()
      })
      const versions = filterStableReleases(response.data)
        .map((release) => pickAsset(release, platform, arch))
        .filter((item): item is SamWafOnlineVersion => !!item)
      if (versions.length > 0) {
        return versions.sort((a, b) => releaseVersionNum(b.version) - releaseVersionNum(a.version))
      }
    } catch (e) {
      console.log('samwaf release fetch failed:', api, e)
    }
  }
  return []
}

export const samWafHostTarget = (
  platform = process.platform,
  arch = process.arch
): { platform: SamWafPlatform; arch: SamWafArch } | undefined => {
  const p =
    platform === 'win32'
      ? 'windows'
      : platform === 'darwin'
        ? 'macos'
        : platform === 'linux'
          ? 'linux'
          : undefined
  const a = arch === 'x64' ? 'x64' : arch === 'arm64' ? 'arm64' : undefined
  if (!p || !a) return undefined
  return { platform: p, arch: a }
}

export const samWafAssetFileName = (version: string, target: SamWafAssetTarget): string => {
  return `SamWaf_${OS_NAME[target.platform]}_${target.arch === 'x64' ? 'x86_64' : 'arm64'}.${version}.${target.ext}`
}
