import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  mkdirp,
  moveChildDirToParent,
  remove,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  zipUnpack
} from '../../Fn'
import TaskQueue from '../../TaskQueue'
import { isLinux, isMacOS, isWindows } from '@shared/utils'
import { appDebugLog } from '@shared/utils'
import axios from 'axios'
import * as http from 'http'
import * as https from 'https'

class Flutter extends Base {
  constructor() {
    super()
    this.type = 'flutter'
  }

  private _archiveExt(url: string): string {
    const lower = (url || '').toLowerCase()
    if (lower.endsWith('.tar.xz')) {
      return '.tar.xz'
    }
    if (lower.endsWith('.tar.gz')) {
      return '.tar.gz'
    }
    if (lower.endsWith('.zip')) {
      return '.zip'
    }
    if (isWindows() || isMacOS()) {
      return '.zip'
    }
    return '.tar.xz'
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        let all: OnlineVersionItem[] = await this._fetchOnlineVersion('flutter')
        if (!Array.isArray(all) || all.length === 0) {
          all = await this._fetchFlutterOfficialVersion()
        }
        all.forEach((a: any) => {
          const channelRaw = `${a.channel ?? ''}`.toLowerCase()
          const channel =
            channelRaw === 'stable' || channelRaw === 'beta' || channelRaw === 'dev'
              ? channelRaw
              : this._detectChannelByUrl(a.url)
          const ext = this._archiveExt(a.url)
          const appDir = join(global.Server.AppDir!, `static-flutter-${a.version}`)
          const bin = isWindows()
            ? join(appDir, 'bin', 'flutter.bat')
            : join(appDir, 'bin', 'flutter')
          const zip = join(global.Server.Cache!, `static-flutter-${a.version}${ext}`)

          a.appDir = appDir
          a.zip = zip
          a.bin = bin
          a.downloaded = existsSync(zip)
          a.installed = existsSync(bin)
          a.name = `Flutter-${a.version}`
          a.channel = channel
        })
        resolve(all)
      } catch {
        resolve({})
      }
    })
  }

  private _detectChannelByUrl(url: string): 'stable' | 'beta' | 'dev' {
    const lower = `${url ?? ''}`.toLowerCase()
    if (lower.includes('/beta/')) {
      return 'beta'
    }
    if (lower.includes('/dev/')) {
      return 'dev'
    }
    return 'stable'
  }

  private async _fetchFlutterOfficialVersion(): Promise<OnlineVersionItem[]> {
    try {
      let releaseFile = 'releases_windows.json'
      let platformKeyword = 'windows'
      if (isMacOS()) {
        releaseFile = 'releases_macos.json'
        platformKeyword = 'macos'
      } else if (isLinux()) {
        releaseFile = 'releases_linux.json'
        platformKeyword = 'linux'
      }

      const url = `https://storage.googleapis.com/flutter_infra_release/releases/${releaseFile}`
      const res = await axios({
        url,
        method: 'get',
        timeout: 30000,
        withCredentials: false,
        httpAgent: new http.Agent({ keepAlive: false }),
        httpsAgent: new https.Agent({ keepAlive: false }),
        proxy: this.getAxiosProxy()
      })

      const baseUrl: string = res?.data?.base_url ?? ''
      const releases: any[] = res?.data?.releases ?? []
      if (!baseUrl || !Array.isArray(releases)) {
        return []
      }

      const arch = global.Server.Arch === 'x86_64' ? 'x64' : 'arm64'
      const list = releases
        .filter((item) => {
          if (!item?.version || !item?.archive || !item?.channel) {
            return false
          }
          if (item.channel !== 'stable' && item.channel !== 'beta') {
            return false
          }
          const archive = `${item.archive}`.toLowerCase()
          if (!archive.includes(`/${platformKeyword}/`)) {
            return false
          }

          if (isMacOS()) {
            if (arch === 'arm64') {
              return archive.includes('_arm64_')
            }
            return !archive.includes('_arm64_')
          }

          return true
        })
        .map((item) => {
          return {
            version: item.version,
            mVersion: item.version,
            url: `${baseUrl}/${item.archive}`,
            channel: item.channel
          } as OnlineVersionItem
        })

      return list
    } catch {
      return []
    }
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      const customDirs = setup?.flutter?.dirs ?? []
      appDebugLog('[flutter][allInstalledVersions][customDirs]', JSON.stringify(customDirs)).catch()

      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [
          versionLocalFetch(customDirs, 'flutter.bat', undefined, [
            'flutter.bat',
            'bin/flutter.bat',
            'flutter/bin/flutter.bat'
          ])
        ]
      } else {
        all = [
          versionLocalFetch(customDirs, 'flutter', 'flutter', [
            'flutter',
            'bin/flutter',
            'flutter/bin/flutter'
          ])
        ]
      }

      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          appDebugLog(
            '[flutter][allInstalledVersions][rawCount]',
            `${versions.length}`
          ).catch()
          appDebugLog(
            '[flutter][allInstalledVersions][rawBins]',
            JSON.stringify(versions.map((v) => v.bin))
          ).catch()
          versions = versionFilterSame(versions)
          appDebugLog(
            '[flutter][allInstalledVersions][uniqueCount]',
            `${versions.length}`
          ).catch()
          const all = versions.map((item) => {
            const command = `"${item.bin}" --version`
            const reg = /(Flutter\s+)(\d+(\.\d+){1,4})(.*?)/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
          return Promise.all(all)
        })
        .then((list) => {
          list.forEach((v, i) => {
            const { error, version } = v
            if (!version) {
              appDebugLog(
                '[flutter][allInstalledVersions][parseFailed]',
                JSON.stringify({ bin: versions[i]?.bin, error: error ?? '' })
              ).catch()
            }
            const num = version
              ? Number(versionFixed(version).split('.').slice(0, 2).join(''))
              : null
            Object.assign(versions[i], {
              version,
              num,
              enable: version !== null,
              error
            })
          })
          appDebugLog(
            '[flutter][allInstalledVersions][resolved]',
            JSON.stringify(versions.map((v) => ({ version: v.version, bin: v.bin, path: v.path })))
          ).catch()
          resolve(versionSort(versions))
        })
        .catch(() => {
          appDebugLog('[flutter][allInstalledVersions][catch]', 'version discovery failed').catch()
          resolve([])
        })
    })
  }

  async _installSoftHandle(row: any): Promise<void> {
    if (isWindows()) {
      await remove(row.appDir)
      await mkdirp(row.appDir)
      await zipUnpack(row.zip, row.appDir)
      await moveChildDirToParent(row.appDir)
      return
    }

    const dir = row.appDir
    await super._installSoftHandle(row)
    await moveChildDirToParent(dir)
  }
}

export default new Flutter()
