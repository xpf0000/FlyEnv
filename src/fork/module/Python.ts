import { dirname, join } from 'path'
import { existsSync, realpathSync } from 'fs'
import { Base } from './Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { SoftInstalled } from '@shared/app'
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

class Python extends Base {
  constructor() {
    super()
    this.type = 'python'
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
          '/opt/local/Library/Frameworks/Python.framework/Versions'
        ]

        const findInstalled = async (dir: string, depth = 0, maxDepth = 2) => {
          if (!existsSync(dir)) {
            return
          }
          dir = realpathSync(dir)
          console.log('findInstalled dir: ', dir)
          let binPath = versionCheckBin(join(dir, `bin/${binName}`))
          if (binPath) {
            installed.add(binPath)
            return
          }
          binPath = versionCheckBin(join(dir, `sbin/${binName}`))
          if (binPath) {
            installed.add(binPath)
            return
          }
          binPath = versionCheckBin(join(dir, `libexec/bin/python`))
          if (binPath) {
            installed.add(binPath)
            return
          }
          binPath = versionCheckBin(join(dir, `bin/python3`))
          if (binPath) {
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
      Promise.all([versionLocalFetch(setup?.python?.dirs ?? [], 'python', 'python')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) =>
            TaskQueue.run(versionBinVersion, `${item.bin} --version`, /(Python )(.*?)(\n)/g)
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
        const cammand = 'brew search -q --formula "/^python[@\\d\\.]+?$/"'
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
        `^python\\d*$`,
        (f) => {
          return f.includes('An interpreted, object-oriented programming language')
        },
        (name, version) => {
          const v = version?.split('.')?.slice(0, 2)?.join('.') ?? ''
          const dir = `/opt/local/Library/Frameworks/Python.framework/Versions/${v}/Python`
          return existsSync(dir)
        }
      )
      resolve(Info)
    })
  }
}
export default new Python()
