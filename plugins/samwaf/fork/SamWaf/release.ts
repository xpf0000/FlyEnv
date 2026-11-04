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
  // Gitee marks beta builds with prerelease=false, so the flag alone is not
  // enough: any semver prerelease suffix (-beta, -rc, ...) is also unstable.
  return releases.filter(
    (release) => !release.prerelease && /^v?\d+\.\d+\.\d+$/.test(release.tag_name.trim())
  )
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

/**
 * Upstream ships a `SamWaf_<ver>_checksums.txt` asset per release. Lines look
 * like `<sha256>  SamWaf_Linux_arm64 v1.3.24.tar.gz` — note the SPACE before
 * the version where the asset name has a DOT. Keys are normalized to the real
 * asset file names.
 */
export const parseChecksums = (content: string): Record<string, string> => {
  const map: Record<string, string> = {}
  for (const line of (content ?? '').split('\n')) {
    const match = /^([a-fA-F\d]{64})\s+(\S.*)$/.exec(line.trim())
    if (!match) continue
    const name = match[2].trim().replace(/ (v?\d+\.\d+\.\d+\S*)$/, '.$1')
    map[name] = match[1].toLowerCase()
  }
  return map
}

const RELEASE_APIS = [
  'https://api.github.com/repos/samwafgo/SamWaf/releases',
  'https://gitee.com/api/v5/repos/samwaf/SamWaf/releases'
]

/**
 * Fill sha256 for versions whose source release carries no asset digest
 * (Gitee) from the release's `*_checksums.txt` asset. Supplementary action:
 * any failure leaves sha256 undefined and the installer skips verification.
 */
const fillMissingSha256 = async (
  stable: SamWafRelease[],
  picked: SamWafOnlineVersion[]
): Promise<void> => {
  await Promise.all(
    picked.map(async (item) => {
      if (item.sha256) return
      const release = stable.find((r) => r.tag_name === item.version)
      const checksumAsset = release?.assets.find((a) => a.name.endsWith('_checksums.txt'))
      if (!checksumAsset) return
      try {
        const response = await axios.get<string>(checksumAsset.browser_download_url, {
          timeout: 15_000,
          responseType: 'text',
          proxy: getAxiosProxy()
        })
        const map = parseChecksums(`${response.data}`)
        const sha256 = map[samWafAssetFileName(item.version, item)]
        if (sha256) item.sha256 = sha256
      } catch (e) {
        console.log('samwaf checksums fetch failed:', checksumAsset.browser_download_url, e)
      }
    })
  )
}

/**
 * Fetch online versions for the current host. GitHub first, Gitee as the CN
 * fallback. A source that errors or yields no host asset falls through to the
 * next; if every source fails the caller gets [] (never throws).
 * `direction=desc` is required by Gitee (ascending default); GitHub ignores
 * the unknown parameter and stays newest-first.
 */
export const fetchOnlineVersions = async (
  platform: SamWafPlatform,
  arch: SamWafArch
): Promise<SamWafOnlineVersion[]> => {
  for (const api of RELEASE_APIS) {
    try {
      const response = await axios.get<SamWafRelease[]>(api, {
        params: { per_page: 20, direction: 'desc' },
        headers: { Accept: 'application/vnd.github+json' },
        timeout: 15_000,
        proxy: getAxiosProxy()
      })
      const stable = filterStableReleases(response.data)
      const versions = stable
        .map((release) => pickAsset(release, platform, arch))
        .filter((item): item is SamWafOnlineVersion => !!item)
      if (versions.length > 0) {
        await fillMissingSha256(stable, versions)
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
