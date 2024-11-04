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
  versionSort
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile } from 'fs-extra'
import TaskQueue from '../TaskQueue'
import { EOL } from 'os'

class Memcached extends Base {
  constructor() {
    super()
    this.type = 'memcached'
  }

  init() {
    this.pidPath = join(global.Server.MemcachedDir!, 'memcached.pid')
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject) => {
      const bin = version.bin
      const pid = join(global.Server.MemcachedDir!, 'memcached.pid')
      const log = join(global.Server.MemcachedDir!, 'memcached.log')

      if (existsSync(pid)) {
        try {
          await execPromiseRoot(`del -Force "${pid}"`)
        } catch (e) {}
      }

      const commands: string[] = [
        '@echo off',
        'chcp 65001>nul',
        `cd /d "${dirname(bin)}"`,
        `start /B ./${basename(bin)} -d -P "${pid}" -vv >> "${log}" 2>&1 &`
      ]

      const command = commands.join(EOL)
      console.log('command: ', command)

      const cmdName = `start.cmd`
      const sh = join(global.Server.MemcachedDir!, cmdName)
      await writeFile(sh, command)

      process.chdir(global.Server.MemcachedDir!)
      try {
        const res = await execPromiseRoot(
          `powershell.exe -Command "(Start-Process -FilePath ./${cmdName} -PassThru -WindowStyle Hidden).Id"`
        )
        console.log('pid res.stdout: ', res.stdout)
      } catch (e: any) {
        console.log('-k start err: ', e)
        reject(e)
        return
      }
      const res = await this.waitPidFile(pid)
      if (res) {
        if (res?.pid) {
          resolve(true)
          return
        }
        reject(new Error(res?.error ?? 'Start Fail'))
        return
      }
      let msg = 'Start Fail'
      if (existsSync(log)) {
        msg = await readFile(log, 'utf-8')
      }
      reject(new Error(msg))
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
