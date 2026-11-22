import type { GitHubReleases, GitHubReleasesAssetsItem } from '@fork/util/OnlineVersionFetch/base'

export const releaseRepo = 'xpf0000/ntp-server'
const releaseDownload = `https://github.com/${releaseRepo}/releases/download`
export const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/

interface ReleaseTarget {
  archive: string
  executable: string
}

type NtpGitHubRelease = Pick<GitHubReleases, 'tag_name'> & {
  draft?: boolean
  prerelease?: boolean
  assets: (GitHubReleasesAssetsItem & { state?: string; digest?: string | null })[]
}

export interface NtpRelease {
  version: string
  url: string
  sha256: string
}

export function releaseTarget(platform: string, arch: string): ReleaseTarget | undefined {
  if (!['win32', 'darwin', 'linux'].includes(platform) || !['x64', 'arm64'].includes(arch)) return
  const os = platform === 'win32' ? 'windows' : platform
  const name = `ntp-server-${os}-${arch === 'x64' ? 'amd64' : arch}`
  return {
    archive: `${name}.zip`,
    executable: name + (platform === 'win32' ? '.exe' : '')
  }
}

export function releaseAssetUrl(tag: string, target: ReleaseTarget) {
  return `${releaseDownload}/${tag}/${target.archive}`
}

export function selectRelease(
  release: NtpGitHubRelease,
  target: ReleaseTarget
): NtpRelease | undefined {
  if (release?.draft || release?.prerelease || typeof release?.tag_name !== 'string') return
  const tag = release.tag_name
  const version = tag.replace(/^v/, '')
  if (!versionPattern.test(version) || !Array.isArray(release.assets)) return
  const url = releaseAssetUrl(tag, target)
  const asset = release.assets.find(
    (item) =>
      item?.name === target.archive &&
      item.state === 'uploaded' &&
      item.browser_download_url === url
  )
  const sha256 = /^sha256:([0-9a-f]{64})$/i.exec(asset?.digest ?? '')?.[1]
  if (sha256) return { version, url, sha256: sha256.toLowerCase() }
  return undefined
}
