import { join, dirname, basename } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { SoftInstalled } from '@shared/app'
import { execPromiseRoot, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { unlink } from 'fs-extra'
import axios from 'axios'
import { compareVersions } from 'compare-versions'

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
      } catch (e) { }

      const waitPid = async (time = 0): Promise<boolean> => {
        let res = false
        if (existsSync(pid)) {
          res = true
        } else {
          if (time < 40) {
            await waitTime(500)
            res = res || await waitPid(time + 1)
          } else {
            res = false
          }
        }
        console.log('waitPid: ', time, res)
        return res
      }

      process.chdir(dirname(bin));

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
        const urls = [
          'https://api.github.com/repos/nono303/memcached/tags?page=1&per_page=1000',
        ]
        const fetchVersions = async (url: string) => {
          const all: any = []
          const res = await axios({
            url,
            method: 'get',
            proxy: this.getAxiosProxy()
          })
          const html = res.data
          let arr: any[] = []
          try {
            if (typeof html === 'string') {
              arr = JSON.parse(html)
            } else {
              arr = html
            }
          } catch (e) { }
          arr.forEach((a) => {
            const version = a.name
            const mv = version.split('.').slice(0, 2).join('.')
            const u = `https://github.com/nono303/memcached/archive/${version}.zip`
            const item = {
              url: u,
              version,
              mVersion: mv
            }
            const find = all.find((f: any) => f.mVersion === item.mVersion)
            if (!find) {
              all.push(item)
            } else {
              if (compareVersions(item.version, find.version) > 0) {
                const index = all.indexOf(find)
                all.splice(index, 1, item)
              }
            }
          })
          return all
        }
        const all: any = []
        const res = await Promise.all(urls.map((u) => fetchVersions(u)))
        const list = res.flat()
        list.forEach((l: any) => {
          const find = all.find((f: any) => f.mVersion === l.mVersion)
          if (!find) {
            all.push(l)
          } else {
            if (compareVersions(l.version, find.version) > 0) {
              const index = all.indexOf(find)
              all.splice(index, 1, l)
            }
          }
        })

        all.sort((a: any, b: any) => {
          return compareVersions(b.version, a.version)
        })

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
}
export default new Memcached()
