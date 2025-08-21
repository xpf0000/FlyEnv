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
import Helper from '../../Helper'

class Gradle extends Base {
  constructor() {
    super()
    this.type = 'gradle'
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('gradle')
        all.forEach((a: any) => {
          let dir = ''
          let zip = ''
          if (isWindows()) {
            dir = join(global.Server.AppDir!, `gradle`, a.version, 'bin/gradle.bat')
            zip = join(global.Server.Cache!, `gradle-${a.version}.zip`)
          } else {
            dir = join(global.Server.AppDir!, `gradle`, a.version, 'bin/gradle')
            zip = join(global.Server.Cache!, `gradle-${a.version}.zip`)
          }
          a.appDir = join(global.Server.AppDir!, 'gradle', a.version)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `Gradle-${a.version}`
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
        all = [versionLocalFetch(setup?.gradle?.dirs ?? [], 'gradle.bat')]
      } else {
        all = [versionLocalFetch(setup?.gradle?.dirs ?? [], 'gradle', 'gradle')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" --version`
            const reg = /(Gradle )(\d+(\.\d+){1,4})(.*?)/g
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
      try {
        await Helper.send('mailpit', 'binFixed', row.bin)
      } catch {}
    }
  }

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        let all: Array<string> = []
        const command = 'brew search -q --formula "/^gradle$/"'
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
        `"^gradle$"`,
        (f) => {
          return f.includes('An open-source build system that is based on the Groovy language')
        },
        () => {
          return existsSync(join('/opt/local/bin/gradle'))
        }
      )
      resolve(Info)
    })
  }
}
export default new Gradle()
