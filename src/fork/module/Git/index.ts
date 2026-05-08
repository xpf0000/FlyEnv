import { existsSync, readdirSync, realpathSync } from 'fs'
import { dirname, join } from 'path'
import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  execPromiseWithEnv,
  mkdirp,
  remove,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  zipUnpack
} from '../../Fn'
import axios from 'axios'
import TaskQueue from '../../TaskQueue'
import { isLinux, isMacOS, isWindows } from '@shared/utils'

type GitCheckItem = {
  label: string
  ok: boolean
  value: string
  message: string
}

type PortableGitRelease = {
  version: string
  tag: string
  assetName: string
}

const versionReg = /(git version\s+)(\d+(\.\d+){1,4})(.*?)/g
const fallbackVersions = ['2.51.1', '2.50.1', '2.49.1', '2.48.1']
const releaseVersionReg = /^v(\d+(?:\.\d+){1,4})\.windows\.\d+$/
const gitReleaseApiUrl = 'https://api.github.com/repos/git-for-windows/git/releases?per_page=50'

class Git extends Base {
  constructor() {
    super()
    this.type = 'git'
  }

  private executableName() {
    return isWindows() ? 'git.exe' : 'git'
  }

  private managedGitDir() {
    return join(global.Server.AppDir!, 'git')
  }

  private appGitBin(version = 'current') {
    if (isWindows()) {
      return join(this.managedGitDir(), version, 'cmd', 'git.exe')
    }
    return join(this.managedGitDir(), version, 'bin', 'git')
  }

  private appGitBins() {
    const base = this.managedGitDir()
    const bins = [this.appGitBin('current')]
    if (!existsSync(base)) {
      return bins
    }
    try {
      readdirSync(base, { withFileTypes: true })
        .filter((item) => item.isDirectory())
        .forEach((item) => {
          bins.push(this.appGitBin(item.name))
          if (isWindows()) {
            bins.push(join(base, item.name, 'bin', 'git.exe'))
          }
        })
    } catch {}
    return Array.from(new Set(bins))
  }

  private pathForEnv(bin: string) {
    if (isWindows()) {
      return dirname(bin)
    }
    return dirname(dirname(bin))
  }

  private portableGitUrl(release: PortableGitRelease | string) {
    if (typeof release !== 'string') {
      return `https://github.com/git-for-windows/git/releases/download/${release.tag}/${release.assetName}`
    }
    const arch = this.portableGitArch()
    return `https://github.com/git-for-windows/git/releases/download/v${release}.windows.1/PortableGit-${release}-${arch}.7z.exe`
  }

  private portableGitArch() {
    return process.arch === 'arm64' ? 'arm64' : '64-bit'
  }

  private portableGitAssetName(version: string) {
    return `PortableGit-${version}-${this.portableGitArch()}.7z.exe`
  }

  private fallbackPortableGitReleases(): PortableGitRelease[] {
    return fallbackVersions.map((version) => ({
      version,
      tag: `v${version}.windows.1`,
      assetName: this.portableGitAssetName(version)
    }))
  }

  private async fetchPortableGitReleases() {
    try {
      const res = await axios({
        url: gitReleaseApiUrl,
        method: 'get',
        timeout: 30000,
        proxy: this.getAxiosProxy(),
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'FlyEnv'
        }
      })
      const releases: PortableGitRelease[] = []
      for (const item of res?.data ?? []) {
        const tag = `${item?.tag_name ?? ''}`
        const version = tag.match(releaseVersionReg)?.[1]
        if (!version) {
          continue
        }
        const assetName = (item?.assets ?? [])
          .map((asset: any) => `${asset?.name ?? ''}`)
          .find((name: string) => name === this.portableGitAssetName(version))
        if (assetName) {
          releases.push({ version, tag, assetName })
        }
      }
      const unique = new Map<string, PortableGitRelease>()
      releases.forEach((release) => {
        if (!unique.has(release.version)) {
          unique.set(release.version, release)
        }
      })
      const list = Array.from(unique.values()).slice(0, 12)
      if (list.length > 0) {
        return list
      }
      console.log('fetchPortableGitReleases empty response: ', res?.data)
      return this.fallbackPortableGitReleases()
    } catch (e) {
      console.log('fetchPortableGitReleases error: ', e)
      return this.fallbackPortableGitReleases()
    }
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      if (!isWindows()) {
        resolve([])
        return
      }
      const releases = await this.fetchPortableGitReleases()
      const all: OnlineVersionItem[] = releases.map((release) => {
        const { version } = release
        const appDir = join(this.managedGitDir(), version)
        const zip = join(global.Server.Cache!, release.assetName)
        const bin = join(appDir, 'cmd', 'git.exe')
        return {
          url: this.portableGitUrl(release),
          version,
          mVersion: version,
          appDir,
          zip,
          bin,
          downloaded: existsSync(zip),
          installed: existsSync(bin),
          name: `PortableGit-${version}`
        } as OnlineVersionItem
      })
      resolve(all)
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      const customDirs = [...(setup?.git?.dirs ?? [])]
      this.appGitBins().forEach((bin) => {
        if (existsSync(bin)) {
          customDirs.push(dirname(realpathSync(bin)))
        }
      })
      const all = [
        isWindows()
          ? versionLocalFetch(customDirs, 'git.exe', undefined, [
              'cmd/git.exe',
              'bin/git.exe',
              'mingw64/bin/git.exe',
              'mingw32/bin/git.exe'
            ])
          : versionLocalFetch(customDirs, 'git', 'git')
      ]
      Promise.all(all)
        .then(async (list) => {
          let versions: SoftInstalled[] = versionFilterSame(list.flat())
          const tasks = versions.map((item) => {
            const command = `"${item.bin}" --version`
            return TaskQueue.run(versionBinVersion, item.bin, command, versionReg)
          })
          const result = await Promise.all(tasks)
          result.forEach((v, i) => {
            const { error, version } = v
            const num = version
              ? Number(versionFixed(version).split('.').slice(0, 2).join(''))
              : null
            Object.assign(versions[i], {
              version,
              num,
              enable: version !== null,
              error,
              path: this.pathForEnv(versions[i].bin)
            })
          })
          versions = versionSort(versions)
          resolve(versions)
        })
        .catch(() => {
          resolve([])
        })
    })
  }

  async _installSoftHandle(row: any): Promise<void> {
    if (!isWindows()) {
      await super._installSoftHandle(row)
      return
    }
    await remove(row.appDir)
    await mkdirp(row.appDir)
    await zipUnpack(row.zip, row.appDir)
  }

  check() {
    return new ForkPromise(async (resolve) => {
      const items: GitCheckItem[] = []
      const system = await this.checkCommand('git', 'System PATH Git')
      items.push(system)

      const appBins = this.appGitBins()
      const appBin = appBins.find((bin) => existsSync(bin))
      if (appBin) {
        items.push(await this.checkCommand(appBin, 'FlyEnv Managed Git'))
      } else {
        items.push({
          label: 'FlyEnv Managed Git',
          ok: false,
          value: this.managedGitDir(),
          message: 'Not installed'
        })
      }
      items.push(await this.checkCommand('ssh', 'SSH', '-V'))
      items.push(await this.checkCommand('git-lfs', 'Git LFS'))

      resolve({
        platform: isWindows()
          ? 'Windows'
          : isMacOS()
            ? 'macOS'
            : isLinux()
              ? 'Linux'
              : process.platform,
        arch: process.arch,
        dataRoot: dirname(global.Server.AppDir!),
        appDir: this.managedGitDir(),
        executableName: this.executableName(),
        recommended: this.recommendedInstall(),
        items
      })
    })
  }

  private recommendedInstall() {
    if (isWindows()) {
      const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
      return `Use the Version Manager tab to install PortableGit for Windows ${arch}.`
    }
    if (isMacOS()) {
      return 'Use Homebrew, Xcode Command Line Tools, or the official Git installer.'
    }
    return 'Use your Linux distribution package manager, such as apt, dnf, yum, pacman, or zypper.'
  }

  private async checkCommand(
    command: string,
    label: string,
    versionArg = '--version'
  ): Promise<GitCheckItem> {
    const isPath = command.includes('/') || command.includes('\\')
    if (isPath && !existsSync(command)) {
      return {
        label,
        ok: false,
        value: command,
        message: 'Not found'
      }
    }
    try {
      const res = await execPromiseWithEnv(`"${command}" ${versionArg}`, {
        windowsHide: true,
        cwd: isPath ? dirname(command) : undefined
      })
      return {
        label,
        ok: true,
        value: command,
        message: `${res.stdout ?? res.stderr ?? ''}`.trim()
      }
    } catch (e: any) {
      return {
        label,
        ok: false,
        value: command,
        message: e?.message ?? 'Check failed'
      }
    }
  }
}

export default new Git()
