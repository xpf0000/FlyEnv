import { join, dirname, basename } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  execPromiseRoot,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  waitTime
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { unlink } from 'fs-extra'
import TaskQueue from '../TaskQueue'

class Memcached extends Base {
  constructor() {
    super()
    this.type = 'memcached'
  }

  init() {
    this.pidPath = join(global.Server.MemcachedDir!, 'memcached.pid')
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      const bin = version.bin
      const pid = join(global.Server.MemcachedDir!, 'memcached.pid')
      const log = join(global.Server.MemcachedDir!, 'memcached.log')

      try {
        if (existsSync(pid)) {
          await unlink(pid)
        }
      } catch (e) {}

      const waitPid = async (time = 0): Promise<boolean> => {
        let res = false
        if (existsSync(pid)) {
          res = true
        } else {
          if (time < 40) {
            await waitTime(500)
            res = res || (await waitPid(time + 1))
          } else {
            res = false
          }
        }
        console.log('waitPid: ', time, res)
        return res
      }

      process.chdir(dirname(bin))

      const command = `start /b ./${basename(bin)} -d -P "${pid}" -vv >> "${log}" 2>&1`

      try {
        const res = await execPromiseRoot(command)
        console.log('start res: ', res)
        on(res.stdout)
        const check = await waitPid()
        if (check) {
          resolve(0)
        } else {
          reject(new Error('Start failed'))
        }
      } catch (e: any) {
        reject(e)
      }
    })
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('memcached')
        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `memcached-${a.version}`, 'memcached.exe')
          const zip = join(global.Server.Cache!, `memcached-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `memcached-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
        })
        resolve(all)
      } catch (e) {
        resolve([])
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      Promise.all([versionLocalFetch(setup?.memcached?.dirs ?? [], 'memcached.exe')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `${basename(item.bin)} -V`
            const reg = /(\s)(\d+(\.\d+){1,4})(.*?)/g
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
export default new Memcached()
