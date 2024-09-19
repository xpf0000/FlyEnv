import { join, dirname, basename } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import { execPromiseRoot, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, mkdirp, chmod, unlink, copyFile } from 'fs-extra'

class Redis extends Base {
  constructor() {
    super()
    this.type = 'redis'
  }

  init() {
    this.pidPath = join(global.Server.RedisDir!, 'redis.pid')
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
      await this.initLocalApp(version, 'redis')
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

      const confName = `redis-${v}.conf`
      const conf = join(global.Server.RedisDir!, confName)
      await copyFile(conf, join(dirname(bin), confName))
      process.chdir(dirname(bin));
      const command = `start /b ./${basename(bin)} ${confName}`
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
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('redis')
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
