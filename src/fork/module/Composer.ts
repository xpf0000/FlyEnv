import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { ForkPromise } from '@shared/ForkPromise'
import { OnlineVersionItem, SoftInstalled } from '@shared/app'
import { versionFilterSame, versionFixed, versionLocalFetch, versionSort } from '../Fn'
import TaskQueue from '../TaskQueue'
import { readFile } from 'fs-extra'

class Composer extends Base {
  constructor() {
    super()
    this.type = 'composer'
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('composer')
        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `composer-${a.version}`, 'composer.phar')
          const zip = join(global.Server.Cache!, `composer-${a.version}.phar`)
          a.appDir = join(global.Server.AppDir!, `composer-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.type = 'composer'
        })
        resolve(all)
      } catch (e) {
        resolve([])
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      const binVersion = (bin: string): Promise<{ version?: string; error?: string }> => {
        return new Promise(async (resolve) => {
          const reg = /(public const VERSION = ')(\d+(\.\d+){1,4})(';)/g
          const handleCatch = (err: any) => {
            resolve({
              error: '<br/>' + err.toString().trim().replace(new RegExp('\n', 'g'), '<br/>'),
              version: undefined
            })
          }
          const handleThen = (res: any) => {
            const str = res.stdout + res.stderr
            let version: string | undefined = ''
            try {
              version = reg?.exec(str)?.[2]?.trim()
              reg!.lastIndex = 0
            } catch (e) {}
            resolve({
              version
            })
          }
          try {
            const res = await readFile(bin, 'utf-8')
            handleThen({
              stdout: res,
              stderr: ''
            })
          } catch (e) {
            handleCatch(e)
          }
        })
      }
      let versions: SoftInstalled[] = []
      Promise.all([versionLocalFetch(setup?.composer?.dirs ?? [], 'composer.phar')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            return TaskQueue.run(binVersion, item.bin)
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
export default new Composer()
