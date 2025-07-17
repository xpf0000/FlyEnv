import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  execPromise,
  mkdirp,
  moveChildDirToParent,
  readdir,
  remove,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  waitTime,
  zipUnPack
} from '../../Fn'
import TaskQueue from '../../TaskQueue'
import { isMacOS, isWindows } from '@shared/utils'
import Helper from '../../Helper'

class Bun extends Base {
  constructor() {
    super()
    this.type = 'bun'
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('bun')
        all.forEach((a: any) => {
          let dir = ''
          let zip = ''
          if (isMacOS()) {
            dir = join(global.Server.AppDir!, `bun`, a.version, 'bun')
            zip = join(global.Server.Cache!, `bun-${a.version}.zip`)
          } else if (isWindows()) {
            dir = join(global.Server.AppDir!, `bun`, a.version, 'bun.exe')
            zip = join(global.Server.Cache!, `bun-${a.version}.zip`)
          }
          a.appDir = join(global.Server.AppDir!, 'bun', a.version)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `Bun-${a.version}`
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
      if (isMacOS()) {
        all = [versionLocalFetch(setup?.bun?.dirs ?? [], 'bun', 'bun')]
      } else if (isWindows()) {
        all = [versionLocalFetch(setup?.bun?.dirs ?? [], 'bun.exe')]
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

  async _installSoftHandle(row: any): Promise<void> {
    if (isMacOS()) {
      const dir = row.appDir
      await super._installSoftHandle(row)
      const subDirs = await readdir(dir)
      const subDir = subDirs.pop()
      if (subDir) {
        await execPromise(`cd ${join(dir, subDir)} && mv ./* ../`)
        await waitTime(300)
        await remove(join(dir, subDir))
      }
      await Helper.send('mailpit', 'binFixed', row.bin)
    } else if (isWindows()) {
      await remove(row.appDir)
      await mkdirp(row.appDir)
      await zipUnPack(row.zip, row.appDir)
      await moveChildDirToParent(row.appDir)
    }
  }
}
export default new Bun()
