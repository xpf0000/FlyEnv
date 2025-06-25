import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  brewInfoJson,
  brewSearch,
  execPromise,
  mkdirp,
  moveChildDirToParent,
  portSearch,
  readdir,
  remove,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  waitTime,
  zipUnPack
} from '../Fn'
import TaskQueue from '../TaskQueue'
import { isMacOS, isWindows } from '@shared/utils'

class Java extends Base {
  constructor() {
    super()
    this.type = 'java'
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('java')
        all.forEach((a: any) => {
          let dir = ''
          let zip = ''
          if (isMacOS()) {
            dir = join(
              global.Server.AppDir!,
              `static-${a.type}-${a.version}`,
              'Contents/Home/bin/java'
            )
            zip = join(global.Server.Cache!, `static-${a.type}-${a.version}.tar.gz`)
            a.appDir = join(global.Server.AppDir!, `static-${a.type}-${a.version}`)
          } else if (isWindows()) {
            dir = join(global.Server.AppDir!, `${a.type}-${a.version}`, 'bin/java.exe')
            zip = join(global.Server.Cache!, `${a.type}-${a.version}.zip`)
            a.appDir = join(global.Server.AppDir!, `${a.type}-${a.version}`)
          }
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `${a.type}-${a.version}`
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
        all = [
          versionLocalFetch(
            [...(setup?.java?.dirs ?? []), '/Library/Java/JavaVirtualMachines'],
            'java',
            'jdk',
            ['Contents/Home/bin/java']
          )
        ]
      } else if (isWindows()) {
        all = [versionLocalFetch(setup?.java?.dirs ?? [], 'java.exe')]
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
    } else if (isWindows()) {
      await remove(row.appDir)
      await mkdirp(row.appDir)
      await zipUnPack(row.zip, row.appDir)
      await moveChildDirToParent(row.appDir)
    }
  }

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        let all: Array<string> = []
        const cammand = 'brew search -q --formula "/^(jdk|openjdk)((@[\\d\\.]+)?)$/"'
        all = await brewSearch(all, cammand)
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
        `^((open)?)jdk([\\d\\.]*)$`,
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
