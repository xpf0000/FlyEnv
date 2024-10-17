import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  brewInfoJson,
  portSearch,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort
} from '../Fn'
import TaskQueue from '../TaskQueue'

class Maven extends Base {
  constructor() {
    super()
    this.type = 'maven'
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('maven')
        const dict: any = {}
        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `maven-${a.version}`, 'bin/mvn')
          const zip = join(global.Server.Cache!, `maven-${a.version}.tar.gz`)
          a.appDir = join(global.Server.AppDir!, `maven-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.type = 'maven'
          dict[`maven-${a.version}`] = a
        })
        resolve(dict)
      } catch (e) {
        console.log('fetchAllOnLineVersion error: ', e)
        resolve([])
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      const dirs = setup?.maven?.dirs ?? []
      Promise.all([versionLocalFetch([...dirs, '/opt/local/share/java/'], 'mvn', 'maven')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const reg = /(Apache Maven )(.*?)( )/g
          const all = versions.map((item) => {
            return TaskQueue.run(versionBinVersion, `${item.bin} --version`, reg)
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

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const all = ['maven']
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
        `^maven\\d*$`,
        (f) => {
          return f.toLowerCase().includes('a java-based build and project management environment.')
        },
        (name) => {
          return existsSync(`/opt/local/share/java/${name}/bin/mvn`)
        }
      )
      resolve(Info)
    })
  }
}
export default new Maven()
