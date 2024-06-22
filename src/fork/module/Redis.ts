import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { SoftInstalled } from '@shared/app'
import { execPromiseRoot, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, mkdirp, chmod, unlink } from 'fs-extra'
import { zipUnPack } from '@shared/file'
import axios from 'axios'
import { compareVersions } from 'compare-versions'

class Redis extends Base {
  constructor() {
    super()
    this.type = 'redis'
  }

  init() {
    this.pidPath = join(global.Server.RedisDir!, 'redis.pid')
  }

  #initLocalApp(version: SoftInstalled) {
    return new Promise((resolve, reject) => {
      console.log('initLocalApp: ', version.bin, global.Server.AppDir)
      if (!existsSync(version.bin) && version.bin.includes(join(global.Server.AppDir!, `redis-${version.version}`))) {
        zipUnPack(join(global.Server.Static!, `zip/redis-${version.version}.7z`), global.Server.AppDir!)
          .then(resolve)
          .catch((err: any) => {
            console.log('initLocalApp err: ', err)
            reject(err)
          })
        return
      }
      resolve(true)
    })
  }

  initConf(version: SoftInstalled) {
    return new ForkPromise((resolve) => {
      this._initConf(version).then(resolve)
    })
  }
  _initConf(version: SoftInstalled): ForkPromise<string> {
    return new ForkPromise(async (resolve) => {
      const v = version?.version?.split('.')?.[0] ?? ''
      let confFile = join(global.Server.RedisDir!, `redis-${v}.conf`)
      if (!existsSync(confFile)) {
        const tmplFile = join(global.Server.Static!, 'tmpl/redis.conf')
        const dbDir = join(global.Server.RedisDir!, `db-${v}`)
        await mkdirp(dbDir)
        chmod(dbDir, '0755')
        let content = await readFile(tmplFile, 'utf-8')
        content = content
          .replace(/#PID_PATH#/g, join(global.Server.RedisDir!, 'redis.pid').split('\\').join('/'))
          .replace(/#LOG_PATH#/g, join(global.Server.RedisDir!, `redis-${v}.log`).split('\\').join('/'))
          .replace(/#DB_PATH#/g, dbDir.split('\\').join('/'))
        await writeFile(confFile, content)
        const defaultFile = join(global.Server.RedisDir!, `redis-${v}-default.conf`)
        await writeFile(defaultFile, content)
      }
      resolve(confFile)
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      await this.#initLocalApp(version)
      await this._initConf(version)

      const v = version?.version?.split('.')?.[0] ?? ''
      const bin = version.bin

      try {
        if (existsSync(this.pidPath)) {
          await unlink(this.pidPath)
        }
      } catch (e) { }

      const waitPid = async (time = 0): Promise<boolean> => {
        let res = false
        if (existsSync(this.pidPath)) {
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

      try {
        process.chdir(global.Server.RedisDir!);
        console.log(`新的工作目录: ${process.cwd()}`);
      } catch (err) {
        console.error(`改变工作目录失败: ${err}`);
      }

      const command = `start /b ${bin} redis-${v}.conf`
      console.log('command: ', command)

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
          'https://api.github.com/repos/redis-windows/redis-windows/tags?page=1&per_page=1000',
        ]
        const fetchVersions = async (url: string) => {
          const all: any = []
          const res = await axios({
            url,
            method: 'get'
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
            const u = `https://github.com/redis-windows/redis-windows/releases/download/${version}/Redis-${version}-Windows-x64-msys2.zip`
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
        list.filter((l: any) => compareVersions(l.version, '5.0.0') > 0).forEach((l: any) => {
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
          const dir = join(global.Server.AppDir!, `redis-${a.version}`, `Redis-${a.version}-Windows-x64-msys2`, 'redis-server.exe')
          const zip = join(global.Server.Cache!, `redis-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `redis-${a.version}`)
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
export default new Redis()
