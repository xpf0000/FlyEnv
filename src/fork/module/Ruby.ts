import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { SoftInstalled } from '@shared/app'
import {
  brewInfoJson,
  brewSearch,
  portSearch,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort
} from '../Fn'
import TaskQueue from '../TaskQueue'

class Ruby extends Base {
  constructor() {
    super()
    this.type = 'ruby'
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      const dir = [...(setup?.ruby?.dirs ?? []), '/opt/local/lib']
      Promise.all([versionLocalFetch(dir, 'ruby', 'ruby')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) =>
            TaskQueue.run(versionBinVersion, `${item.bin} -v`, /(ruby )(\d+(\.\d+){1,4})(.*?)/g)
          )
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

  brewinfo() {
    console.log('ruby brewinfo !!!')
    return new ForkPromise(async (resolve, reject) => {
      try {
        let all: Array<string> = ['ruby']
        const cammand = 'brew search -q --formula "/^ruby@[\\d\\.]+$/"'
        console.log('brewinfo cammand: ', cammand)
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
        `^ruby([\\d]+)?$`,
        (f) => {
          return (
            f.includes('lang ruby') &&
            f.includes('Powerful and clean object-oriented scripting language')
          )
        },
        () => {
          return existsSync(join('/opt/local/lib/ruby/bin/erl'))
        }
      )
      resolve(Info)
    })
  }
}
export default new Ruby()
