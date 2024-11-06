import { basename, dirname, join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import { versionFilterSame, versionFixed, versionLocalFetch, versionSort } from '../Fn'

class ERLang extends Base {
  constructor() {
    super()
    this.type = 'erlang'
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('erlang')
        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `erlang-${a.version}`, 'bin/erl.exe')
          const zip = join(global.Server.Cache!, `erlang-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `erlang-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.type = 'erlang'
        })
        resolve(all)
      } catch (e) {
        console.log('fetchAllOnLineVersion error: ', e)
        resolve([])
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      Promise.all([versionLocalFetch(setup?.erlang?.dirs ?? [], 'erl.exe')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const v = basename(dirname(dirname(item.bin))).replace('erlang-', '')
            return Promise.resolve({
              error: undefined,
              version: v
            })
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
export default new ERLang()
