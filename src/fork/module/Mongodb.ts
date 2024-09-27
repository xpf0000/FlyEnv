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
import { readFile, writeFile, mkdirp, chmod, unlink } from 'fs-extra'
import TaskQueue from '../TaskQueue'

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
      } catch (e) {}

      const waitPid = async (time = 0): Promise<boolean> => {
        let res = false
        if (existsSync(this.pidPath)) {
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
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('mongodb')
        all.forEach((a: any) => {
          const dir = join(
            global.Server.AppDir!,
            `mongodb-${a.version}`,
            `mongodb-win32-x86_64-windows-${a.version}`,
            'bin/mongod.exe'
          )
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

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      Promise.all([versionLocalFetch(setup?.mongodb?.dirs ?? [], 'mongod.exe')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `${basename(item.bin)} --version`
            const reg = /(v)(\d+(\.\d+){1,4})(.*?)/g
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
export default new Manager()
