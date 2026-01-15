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
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  zipUnpack
} from '../../Fn'
import TaskQueue from '../../TaskQueue'
import { isWindows } from '@shared/utils'

class Java extends Base {
  constructor() {
    super()
    this.type = 'java'
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('java')
        all.forEach((a: any) => {
          let dir = ''
          let zip = ''
          const type = a?.type ?? 'Java'
          if (isWindows()) {
            dir = join(global.Server.AppDir!, `${type}-${a.version}`, 'bin/java.exe')
            zip = join(global.Server.Cache!, `${type}-${a.version}.zip`)
            a.appDir = join(global.Server.AppDir!, `${type}-${a.version}`)
          } else {
            dir = join(
              global.Server.AppDir!,
              `static-${type}-${a.version}`,
              'Contents/Home/bin/java'
            )
            zip = join(global.Server.Cache!, `static-${type}-${a.version}.tar.gz`)
            a.appDir = join(global.Server.AppDir!, `static-${type}-${a.version}`)
          }
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `${type}-${a.version}`
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
        all = [versionLocalFetch(setup?.java?.dirs ?? [], 'java.exe')]
      } else {
        all = [
          versionLocalFetch(
            [...(setup?.java?.dirs ?? []), '/Library/Java/JavaVirtualMachines'],
            'java',
            'jdk',
            ['Contents/Home/bin/java']
          )
        ]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" -version`
            const reg = /(")(\d+([\\.|\d]+){1,4})(["_])/g
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
    if (isWindows()) {
      await remove(row.appDir)
      await mkdirp(row.appDir)
      await zipUnpack(row.zip, row.appDir)
      await moveChildDirToParent(row.appDir)
    } else {
      const dir = row.appDir
      await super._installSoftHandle(row)
      await moveChildDirToParent(dir)
    }
  }

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        let all: Array<string> = []
        const command = 'brew search -q --formula "/^(jdk|openjdk)((@[\\d\\.]+)?)$/"'
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
        `"^((open)?)jdk([\\d\\.]*)$"`,
        (f) => {
          return f.includes('Oracle Java SE Development Kit ') || f.includes('OpenJDK ')
        },
        (name) => {
          return existsSync(
            join('/Library/Java/JavaVirtualMachines', name, 'Contents/Home/bin/java')
          )
        }
      )
      resolve(Info)
    })
  }
}
export default new Java()
