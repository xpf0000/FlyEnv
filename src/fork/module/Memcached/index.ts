import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import { I18nT } from '@lang/index'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  copyFile,
  getAllFileAsync,
  mkdirp,
  portSearch,
  remove,
  serviceStartExec,
  serviceStartExecWin,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  zipUnpack
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import TaskQueue from '../../TaskQueue'
import { isWindows } from '@shared/utils'
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
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })
      const bin = version.bin
      const baseDir = global.Server.MemcachedDir!
      const execEnv = ''

      if (isWindows()) {
        const execArgs = `-d -P \`"${this.pidPath}\`"`

        try {
          const res = await serviceStartExecWin({
            version,
            pidPath: this.pidPath,
            baseDir,
            bin,
            execArgs,
            execEnv,
            on,
            checkPidFile: false
          })
          resolve(res)
        } catch (e: any) {
          console.log('-k start err: ', e)
          reject(e)
          return
        }
      } else {
        const execArgs = `-d -P "${this.pidPath}" -vv`

        try {
          const res = await serviceStartExec({
            version,
            pidPath: this.pidPath,
            baseDir,
            bin,
            execArgs,
            execEnv,
            on
          })
          resolve(res)
        } catch (e: any) {
          console.log('-k start err: ', e)
          reject(e)
          return
        }
      }
    })
  }

  fetchAllOnlineVersion() {
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
          a.name = `Memcached-${a.version}`
        })
        resolve(all)
      } catch {
        resolve([])
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [versionLocalFetch(setup?.memcached?.dirs ?? [], 'memcached.exe')]
      } else {
        all = [versionLocalFetch(setup?.memcached?.dirs ?? [], 'memcached', 'memcached')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" -V`
            const reg = /(\s)(\d+(\.\d+){1,4})(.*?)/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
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

  async _installSoftHandle(row: any): Promise<void> {
    if (isWindows()) {
      const tmpDir = join(global.Server.Cache!, `memcached-${row.version}-tmp`)
      if (existsSync(tmpDir)) {
        await remove(tmpDir)
      }
      await zipUnpack(row.zip, tmpDir)
      let dir = join(tmpDir, `memcached-${row.version}`, 'libevent-2.1', 'x64')
      if (!existsSync(dir)) {
        dir = join(tmpDir, `memcached-${row.version}`, 'cygwin', 'x64')
      }
      if (existsSync(dir)) {
        const allFile = await getAllFileAsync(dir, false)
        if (!existsSync(row.appDir)) {
          await mkdirp(row.appDir)
        }
        for (const f of allFile) {
          await copyFile(join(dir, f), join(row.appDir, f))
        }
      }
      if (existsSync(tmpDir)) {
        await remove(tmpDir)
      }
    }
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
        `"^memcached\\d*$"`,
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
