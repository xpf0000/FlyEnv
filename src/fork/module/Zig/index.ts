import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  brewInfoJson,
  brewSearch,
  mkdirp,
  moveChildDirToParent,
  portSearch,
  remove,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  zipUnpack
} from '../../Fn'
import TaskQueue from '../../TaskQueue'
import { isMacOS, isWindows } from '@shared/utils'
import Helper from '../../Helper'
import { versionBinVersionOutput } from '../../util/Version'

class Zig extends Base {
  constructor() {
    super()
    this.type = 'zig'
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('zig')
        all.forEach((a: any) => {
          let dir = ''
          let zip = ''
          if (isWindows()) {
            dir = join(global.Server.AppDir!, `zig`, a.version, 'zig.exe')
            zip = join(global.Server.Cache!, `zig-${a.version}.zip`)
          } else {
            dir = join(global.Server.AppDir!, `zig`, a.version, 'zig')
            zip = join(global.Server.Cache!, `zig-${a.version}.tar.xz`)
          }
          a.appDir = join(global.Server.AppDir!, 'zig', a.version)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `Zig-${a.version}`
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
        all = [versionLocalFetch(setup?.zig?.dirs ?? [], 'zig.exe')]
      } else {
        all = [versionLocalFetch(setup?.zig?.dirs ?? [], 'zig', 'zig')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" version`
            return TaskQueue.run(versionBinVersionOutput, item.bin, command)
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
    if (isWindows()) {
      await remove(row.appDir)
      await mkdirp(row.appDir)
      await zipUnpack(row.zip, row.appDir)
      await moveChildDirToParent(row.appDir)
    } else {
      const dir = row.appDir
      await super._installSoftHandle(row)
      await moveChildDirToParent(dir)
      if (isMacOS()) {
        try {
          await Helper.send('mailpit', 'binFixed', row.bin)
        } catch {}
      }
    }
  }

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        let all: Array<string> = ['zig']
        const command = 'brew search -q --formula "/^zig@[\\d\\.]+$/"'
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
      const Info: { [k: string]: any } = await portSearch(
        `"^zig$"`,
        (f) => {
          return f.includes('Zig programming language')
        },
        () => {
          return existsSync(join('/opt/local/bin/zig'))
        }
      )
      resolve(Info)
    })
  }
}
export default new Zig()
