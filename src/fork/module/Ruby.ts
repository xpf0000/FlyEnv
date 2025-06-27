import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
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
  zipUnPack
} from '../Fn'
import TaskQueue from '../TaskQueue'
import { isMacOS, isWindows } from '@shared/utils'

class Ruby extends Base {
  constructor() {
    super()
    this.type = 'ruby'
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('ruby')
        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, 'ruby', `v${a.version}`, 'bin/ruby.exe')
          const zip = join(global.Server.Cache!, `ruby-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, 'ruby', `v${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `Ruby-${a.version}`
        })
        resolve(all)
      } catch {
        resolve([])
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isMacOS()) {
        const dir = [...(setup?.ruby?.dirs ?? []), '/opt/local/lib']
        all = [versionLocalFetch(dir, 'ruby', 'ruby')]
      } else if (isWindows()) {
        const dir = [...(setup?.ruby?.dirs ?? [])]
        all = [versionLocalFetch(dir, 'ruby.exe')]
      }

      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" -v`
            const reg = /(ruby )(\d+(\.\d+){1,4})(.*?)/g
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
      await super._installSoftHandle(row)
    } else if (isWindows()) {
      await remove(row.appDir)
      await mkdirp(row.appDir)
      await zipUnPack(row.zip, row.appDir)
      await moveChildDirToParent(row.appDir)
    }
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
        `"^ruby([\\d]+)?$"`,
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
