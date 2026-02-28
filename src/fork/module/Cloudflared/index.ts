import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import { isMacOS, isWindows } from '@shared/utils'
import { join } from 'path'
import { existsSync } from 'fs'
import {
  brewInfoJson,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort
} from '../../util/Version'
import TaskQueue from '../../TaskQueue'
import { unpack } from '../../util/Zip'
import { copyFile, mkdirp } from '@shared/fs-extra'
import { dirname } from 'node:path'
import { moveChildDirToParent } from '../../util/Dir'
import { binXattrFix } from '../../Fn'

class Cloudflared extends Base {
  constructor() {
    super()
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('cloudflare-tunnel')
        all.forEach((a: any) => {
          let dir = ''
          let zip = ''
          if (isWindows()) {
            dir = join(global.Server.AppDir!, 'cloudflared', a.version, 'cloudflared.exe')
            zip = join(global.Server.Cache!, `cloudflared-${a.version}.exe`)
            a.appDir = join(global.Server.AppDir!, 'cloudflared', a.version)
          } else if (isMacOS()) {
            dir = join(global.Server.AppDir!, 'cloudflared', a.version, 'cloudflared')
            zip = join(global.Server.Cache!, `cloudflared-${a.version}.tgz`)
            a.appDir = join(global.Server.AppDir!, 'cloudflared', a.version)
          } else {
            dir = join(global.Server.AppDir!, 'cloudflared', a.version, 'cloudflared')
            zip = join(global.Server.Cache!, `cloudflared-${a.version}`)
            a.appDir = join(global.Server.AppDir!, 'cloudflared', a.version)
          }
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `cloudflared-${a.version}`
        })
        resolve(all)
      } catch {
        resolve({})
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [versionLocalFetch(setup?.caddy?.dirs ?? [], 'cloudflared.exe')]
      } else {
        all = [versionLocalFetch(setup?.caddy?.dirs ?? [], 'cloudflared', 'cloudflared')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" --version`
            const reg = /(version )(\d+(\.\d+){1,4})(.*?)/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
          return Promise.all(all)
        })
        .then(async (list) => {
          list.forEach((v, i) => {
            const { error, version } = v
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

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const all = ['cloudflared']
        const info = await brewInfoJson(all)
        resolve(info)
      } catch (e) {
        reject(e)
        return
      }
    })
  }

  async _installSoftHandle(row: any): Promise<void> {
    if (isMacOS()) {
      const dir = row.appDir
      await mkdirp(dir)
      await unpack(row.zip, dir)
      await moveChildDirToParent(dir)
      await binXattrFix(row.bin)
    } else {
      await mkdirp(dirname(row.bin))
      await copyFile(row.zip, row.bin)
    }
  }
}
export default new Cloudflared()
