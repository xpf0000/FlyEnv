import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { SoftInstalled } from '@shared/app'
import {
  brewInfoJson,
  execPromise,
  portSearch,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  waitTime
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { mkdirp, unlink } from 'fs-extra'
import TaskQueue from '../TaskQueue'
class Memcached extends Base {
  constructor() {
    super()
    this.type = 'memcached'
  }

  init() {
    this.pidPath = join(global.Server.MemcachedDir!, 'logs/memcached.pid')
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      const bin = version.bin
      const common = join(global.Server.MemcachedDir!, 'logs')
      const pid = join(common, 'memcached.pid')
      const log = join(common, 'memcached.log')
      const command = `${bin} -d -P ${pid} -vv >> ${log} 2>&1`
      try {
        if (existsSync(pid)) {
          await unlink(pid)
        }
      } catch (e) {}
      try {
        await mkdirp(common)
        const res = await execPromise(command)
        on(res.stdout)
        await waitTime(600)
        if (existsSync(pid)) {
          resolve(0)
        } else {
          reject(new Error(I18nT('fork.startFail')))
        }
      } catch (e: any) {
        reject(e)
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      Promise.all([versionLocalFetch(setup?.memcached?.dirs ?? [], 'memcached', 'memcached')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `${item.bin} -V`
            const reg = /(\s)(\d+(\.\d+){1,4})(.*?)/g
            return TaskQueue.run(versionBinVersion, command, reg)
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
        const all: Array<string> = ['memcached']
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
        `^memcached\\d*$`,
        (f) => {
          return f.includes('A high performance, distributed memory object caching system.')
        },
        (name) => {
          return existsSync(join('/opt/local/bin', name))
        }
      )
      resolve(Info)
    })
  }
}
export default new Memcached()
