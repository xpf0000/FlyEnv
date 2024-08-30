import { join, dirname, basename } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { SoftInstalled } from '@shared/app'
import { execPromiseRoot, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, mkdirp, chmod, unlink } from 'fs-extra'
import axios from 'axios'
import { compareVersions } from 'compare-versions'

class Manager extends Base {
  constructor() {
    super()
    this.type = 'mongodb'
  }

  init() {
    this.pidPath = join(global.Server.MongoDBDir!, 'mongodb.pid')
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      const bin = version.bin
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MongoDBDir!, `mongodb-${v}.conf`)
      const dataDir = join(global.Server.MongoDBDir!, `data-${v}`)
      if (!existsSync(dataDir)) {
        await mkdirp(dataDir)
        await chmod(dataDir, '0777')
      }
      if (!existsSync(m)) {
        const tmpl = join(global.Server.Static!, 'tmpl/mongodb.conf')
        let conf = await readFile(tmpl, 'utf-8')
        conf = conf.replace('##DB-PATH##', dataDir)
        await writeFile(m, conf)
      }
      const logPath = join(global.Server.MongoDBDir!, `mongodb-${v}.log`)

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

      process.chdir(dirname(bin));
      const command = `start /b ./${basename(bin)} --config "${m}" --logpath "${logPath}" --pidfilepath "${this.pidPath}"`

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
          'https://www.mongodb.com/try/download/community',
          // href="/redis-windows/redis-windows/releases/tag/7.2.5"
        ]
        const fetchVersions = async (url: string) => {
          const all: any = []
          const res = await axios({
            url,
            method: 'get'
          })
          const html = res.data
          const reg = />([\d]+)\.([\d]+)\.([\d]+)(.*?)([\s<]+)/g
          let r
          while ((r = reg.exec(html)) !== null) {
            const version = r[0].replace('>', '').replace('<', '').trim()
            const mv = version.split('.').slice(0, 2).join('.')
            const u = `https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-${version}.zip`
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
          }
          return all
        }
        const all: any = []
        const res = await Promise.all(urls.map((u) => fetchVersions(u)))
        const list = res.flat()
        list.filter((l: any) => compareVersions(l.version, '1.12.0') > 0).forEach((l: any) => {
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
          const dir = join(global.Server.AppDir!, `mongodb-${a.version}`, `mongodb-win32-x86_64-windows-${a.version}`, 'bin/mongod.exe')
          const zip = join(global.Server.Cache!, `mongodb-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `mongodb-${a.version}`)
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
export default new Manager()
