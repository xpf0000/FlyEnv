import { dirname, join } from 'path'
import { existsSync, realpathSync } from 'fs'
import { Base } from './Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  brewInfoJson,
  brewSearch,
  getSubDirAsync,
  portSearch,
  versionBinVersion,
  versionCheckBin,
  versionFilterSame,
  versionFixed,
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
        const dict: any = {}
        all.forEach((a: any) => {
          const dir = join(
            global.Server.AppDir!,
            `static-${a.type}-${a.version}`,
            'Contents/Home/bin/java'
          )
          const zip = join(global.Server.Cache!, `static-${a.type}-${a.version}.tar.gz`)
          a.appDir = join(global.Server.AppDir!, `static-${a.type}-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          dict[`${a.type}-${a.version}`] = a
        })
        resolve(dict)
      } catch (e) {
        resolve({})
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      const versionLocalFetch = async (
        customDirs: string[],
        binName: string,
        searchName: string
      ): Promise<Array<SoftInstalled>> => {
        const installed: Set<string> = new Set()
        const systemDirs = [
          '/',
          '/opt',
          '/usr',
          global.Server.AppDir!,
          ...customDirs,
          '/Library/Java/JavaVirtualMachines'
        ]

        const realDirDict: { [k: string]: string } = {}
        const findInstalled = async (dir: string, depth = 0, maxDepth = 2) => {
          if (!existsSync(dir)) {
            return
          }
          dir = realpathSync(dir)
          console.log('findInstalled dir: ', dir)
          let binPath = versionCheckBin(join(dir, `${binName}`))
          if (binPath) {
            realDirDict[binPath] = join(dir, `${binName}`)
            installed.add(binPath)
            return
          }
          binPath = versionCheckBin(join(dir, `bin/${binName}`))
          if (binPath) {
            realDirDict[binPath] = join(dir, `bin/${binName}`)
            installed.add(binPath)
            return
          }
          binPath = versionCheckBin(join(dir, `sbin/${binName}`))
          if (binPath) {
            realDirDict[binPath] = join(dir, `sbin/${binName}`)
            installed.add(binPath)
            return
          }
          binPath = versionCheckBin(join(dir, `Contents/Home/bin/java`))
          if (binPath) {
            realDirDict[binPath] = join(dir, `Contents/Home/bin/java`)
            installed.add(binPath)
            return
          }
          if (depth >= maxDepth) {
            return
          }
          const sub = await getSubDirAsync(dir)
          console.log('sub: ', sub)
          for (const s of sub) {
            await findInstalled(s, depth + 1, maxDepth)
          }
        }

        for (const s of systemDirs) {
          await findInstalled(s, 0, 1)
        }

        const base = ['/usr/local/Cellar', '/opt/homebrew/Cellar']
        for (const b of base) {
          const subDir = await getSubDirAsync(b)
          const subDirFilter = subDir.filter((f) => {
            return f.includes(searchName)
          })
          for (const f of subDirFilter) {
            const subDir1 = await getSubDirAsync(f)
            for (const s of subDir1) {
              await findInstalled(s)
            }
          }
        }
        const count = installed.size
        if (count === 0) {
          return []
        }

        const list: Array<SoftInstalled> = []
        const installedList: Array<string> = Array.from(installed)
        for (const i of installedList) {
          let path = i
          if (path.includes('/sbin/') || path.includes('/bin/')) {
            path = path
              .replace(`/sbin/`, '/##SPLIT##/')
              .replace(`/bin/`, '/##SPLIT##/')
              .split('/##SPLIT##/')
              .shift()!
          } else {
            path = dirname(path)
          }
          const item = {
            bin: i,
            path: `${path}/`,
            run: false,
            running: false
          }
          if (!list.find((f) => f.path === item.path && f.bin === item.bin)) {
            list.push(item as any)
          }
        }
        return list
      }
      let versions: SoftInstalled[] = []
      Promise.all([versionLocalFetch(setup?.java?.dirs ?? [], 'java', 'jdk')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) =>
            TaskQueue.run(
              versionBinVersion,
              `${item.bin} -version`,
              /(")(\d+([\.|\d]+){1,4})(["_])/g
            )
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
