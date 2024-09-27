import { basename, join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { ForkPromise } from '@shared/ForkPromise'
import { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort
} from '../Fn'
import TaskQueue from '../TaskQueue'

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
          const dir = join(global.Server.AppDir!, `${a.type}-${a.version}`, 'bin/java.exe')
          const zip = join(global.Server.Cache!, `${a.type}-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `${a.type}-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `${a.type}${a.version}`
        })
        resolve(all)
      } catch (e) {
        console.log('Java fetch version e: ', e)
        resolve([])
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      Promise.all([versionLocalFetch(setup?.java?.dirs ?? [], 'java.exe')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `${basename(item.bin)} -version`
            const reg = /(")(\d+([\.|\d]+){1,4})(["_])/g
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
}
export default new Java()
