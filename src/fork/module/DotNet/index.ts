import { join, basename } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  binXattrFix,
  brewInfoJson,
  brewSearch,
  mkdirp,
  remove,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  zipUnpack
} from '../../Fn'
import TaskQueue from '../../TaskQueue'
import { isMacOS, isWindows } from '@shared/utils'

import axios from 'axios'

class DotNet extends Base {
  constructor() {
    super()
    this.type = 'dotnet'
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const res = await axios({
          url: 'https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json',
          method: 'get',
          timeout: 30000
        })
        const releasesIndex = res?.data?.['releases-index'] ?? []
        const list: OnlineVersionItem[] = []
        for (const channel of releasesIndex) {
          const version = channel['latest-sdk']
          const mVersion = channel['channel-version']
          if (!version) {
            continue
          }

          let rid = ''
          let ext = ''
          if (isWindows()) {
            rid = 'win-x64'
            ext = 'zip'
          } else if (isMacOS()) {
            rid = global.Server.Arch === 'arm64' ? 'osx-arm64' : 'osx-x64'
            ext = 'tar.gz'
          } else {
            rid = global.Server.Arch === 'arm64' ? 'linux-arm64' : 'linux-x64'
            ext = 'tar.gz'
          }

          const url = `https://builds.dotnet.microsoft.com/dotnet/Sdk/${version}/dotnet-sdk-${version}-${rid}.${ext}`

          list.push({
            version,
            mVersion,
            url
          } as OnlineVersionItem)
        }
        list.sort((a, b) => {
          const av = a.mVersion.split('.').map((v: string) => {
            const n = parseInt(v)
            return isNaN(n) ? 0 : n
          })
          const bv = b.mVersion.split('.').map((v: string) => {
            const n = parseInt(v)
            return isNaN(n) ? 0 : n
          })
          for (let i = 0; i < Math.max(av.length, bv.length); i++) {
            const ai = av[i] ?? 0
            const bi = bv[i] ?? 0
            if (ai !== bi) {
              return bi - ai
            }
          }
          return 0
        })

        list.forEach((a: any) => {
          let dir = ''
          let zip = ''
          a.appDir = join(global.Server.AppDir!, `dotnet`, a.version)
          if (isWindows()) {
            dir = join(a.appDir, 'dotnet.exe')
            zip = join(global.Server.Cache!, `dotnet-${a.version}.zip`)
          } else {
            dir = join(a.appDir, 'dotnet')
            zip = join(global.Server.Cache!, `dotnet-${a.version}.tar.gz`)
          }
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `.NET-${a.version}`
        })
        resolve(list)
      } catch (e) {
        console.log('fetchAllOnlineVersion error: ', e)
        resolve([])
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      const customDirs = [...(setup?.dotnet?.dirs ?? [])]
      if (isWindows()) {
        all = [versionLocalFetch(customDirs, 'dotnet.exe')]
      } else {
        all = [versionLocalFetch(customDirs, 'dotnet', 'dotnet')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" --version`
            const reg = /(.*?)(\d+(\.\d+){1,4})(.*?)/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
          return Promise.all(all)
        })
        .then((list) => {
          list.forEach((v, i) => {
            let { error, version } = v
            if (!version && versions[i]?.path) {
              const pathVersion = basename(versions[i].path)
              if (pathVersion && /^\d+\./.test(pathVersion)) {
                version = pathVersion
                error = undefined
              }
            }
            const num = version
              ? Number(versionFixed(version).split('.').slice(0, 2).join(''))
              : null
            Object.assign(versions[i], {
              version: version,
              num,
              enable: version !== null,
              error
            })
          })
          resolve(versionSort(versions))
        })
        .catch(() => {
          resolve([])
        })
    })
  }

  async _installSoftHandle(row: any): Promise<void> {
    if (isWindows()) {
      await remove(row.appDir)
      await mkdirp(row.appDir)
      await zipUnpack(row.zip, row.appDir)
    } else {
      await super._installSoftHandle(row)
      if (isMacOS()) {
        await binXattrFix(row.bin)
      }
    }
  }

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        let all: Array<string> = []
        const command = 'brew search -q --formula "/^dotnet$"'
        all = await brewSearch(all, command)
        const info = await brewInfoJson(all)
        resolve(info)
      } catch (e) {
        reject(e)
        return
      }
    })
  }

  portinfo() {
    return new ForkPromise(async (resolve) => {
      resolve({})
    })
  }

  getConfigFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    // .NET SDK 是运行时/开发工具包，FlyEnv 仅负责下载安装，不生成服务端配置文件
    return []
  }

  getLogFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    // .NET SDK 没有由本模块管理的运行日志文件
    return []
  }
}

export default new DotNet()
