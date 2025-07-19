import { basename, dirname, join } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  brewInfoJson,
  brewSearch,
  portSearch,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort
} from '../../Fn'
import TaskQueue from '../../TaskQueue'
import { isMacOS, isWindows } from '@shared/utils'

class Erlang extends Base {
  constructor() {
    super()
    this.type = 'erlang'
  }

  fetchAllOnlineVersion() {
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
          a.name = `Erlang-${a.version}`
        })
        resolve(all)
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
      if (isWindows()) {
        all = [versionLocalFetch(setup?.erlang?.dirs ?? [], 'erl.exe')]
      } else {
        const dir = [...(setup?.erlang?.dirs ?? []), '/opt/local/lib']
        all = [versionLocalFetch(dir, 'erl', 'erlang')]
      }

      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          if (isMacOS()) {
            const all = versions.map((item) =>
              TaskQueue.run(
                versionBinVersion,
                item.bin,
                `${join(dirname(item.bin), 'erl')} -version`,
                /(version )(.*?)$/gm
              )
            )
            return Promise.all(all)
          }
          if (isWindows()) {
            const all = versions.map((item) => {
              const v = basename(dirname(dirname(item.bin))).replace('erlang-', '')
              return Promise.resolve({
                error: undefined,
                version: v
              })
            })
            return Promise.all(all)
          }
          return Promise.resolve([])
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

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        let all: Array<string> = ['erlang']
        const command = 'brew search -q --formula "/^erlang@[\\d\\.]+$/"'
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
        `"^erlang([\\d]+)?$"`,
        (f) => {
          return f.includes('The Erlang Programming Language')
        },
        () => {
          return existsSync(join('/opt/local/lib/erlang/bin/erl'))
        }
      )
      resolve(Info)
    })
  }
}
export default new Erlang()
