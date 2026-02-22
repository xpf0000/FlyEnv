import { dirname, join } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import { I18nT } from '@lang/index'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  brewSearch,
  portSearch,
  serviceStartExec,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  readFile,
  writeFile,
  mkdirp,
  chmod,
  execPromise,
  copyFile,
  serviceStartExecCMD
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import TaskQueue from '../../TaskQueue'
import { isWindows, pathFixedToUnix } from '@shared/utils'
import { ProcessListSearch } from '@shared/Process.win'

class Redis extends Base {
  constructor() {
    super()
    this.type = 'redis'
  }

  init() {
    this.pidPath = join(global.Server.RedisDir!, 'redis.pid')
  }

  initConf(version: SoftInstalled) {
    return new ForkPromise((resolve, reject) => {
      if (!existsSync(version?.bin)) {
        reject(new Error(I18nT('fork.binNotFound')))
        return
      }
      if (!version?.version) {
        reject(new Error(I18nT('fork.versionNotFound')))
        return
      }
      this._initConf(version).then(resolve)
    })
  }
  _initConf(version: SoftInstalled): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject, on) => {
      const v = version?.version?.split('.')?.[0] ?? ''
      const confFile = join(global.Server.RedisDir!, `redis-${v}.conf`)
      if (!existsSync(confFile)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        const tmplFile = join(global.Server.Static!, 'tmpl/redis.conf')
        const dbDir = join(global.Server.RedisDir!, `db-${v}`)
        await mkdirp(dbDir)
        chmod(dbDir, '0755')
        let content = await readFile(tmplFile, 'utf-8')
        content = content
          .replace(/#PID_PATH#/g, pathFixedToUnix(join(global.Server.RedisDir!, 'redis.pid')))
          .replace(/#LOG_PATH#/g, pathFixedToUnix(join(global.Server.RedisDir!, `redis-${v}.log`)))
          .replace(/#DB_PATH#/g, pathFixedToUnix(dbDir))
        await writeFile(confFile, content)
        const defaultFile = join(global.Server.RedisDir!, `redis-${v}-default.conf`)
        await writeFile(defaultFile, content)
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: confFile }))
        })
      }
      resolve(confFile)
    })
  }

  _stopServer(version: SoftInstalled): ForkPromise<{ 'APP-Service-Stop-PID': string[] }> {
    if (!isWindows()) {
      return super._stopServer(version) as any
    }
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceBegin', { service: this.type }))
      })
      const v = version?.version?.split('.')?.[0] ?? ''
      const appConfName = `pws-app-redis-${v}.conf`
      const all = await ProcessListSearch(appConfName, false)
      const arr: Array<string> = []
      all.forEach((item) => {
        arr.push(item.PID)
      })
      console.log('php arr: ', arr)
      if (arr.length > 0) {
        const str = arr.map((s) => `/pid ${s}`).join(' ')
        try {
          await execPromise(`taskkill /f /t ${str}`)
        } catch {}
      }
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceEnd', { service: this.type }))
      })
      resolve({
        'APP-Service-Stop-PID': arr
      })
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })
      const confFile = await this._initConf(version)

      const bin = version.bin
      const baseDir = global.Server.RedisDir!
      await mkdirp(baseDir)
      const execEnv = ''

      if (isWindows()) {
        const v = version?.version?.split('.')?.[0] ?? ''
        const confName = `redis-${v}.conf`
        const conf = join(global.Server.RedisDir!, confName)
        const appConfName = `pws-app-redis-${v}.conf`
        const runConf = join(dirname(bin), appConfName)
        await copyFile(conf, runConf)

        const execArgs = `"${appConfName}"`

        try {
          const res = await serviceStartExecCMD({
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
      } else {
        const execArgs = `"${confFile}"`
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
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('redis')
        all.forEach((a: any) => {
          const dir = join(
            global.Server.AppDir!,
            `redis-${a.version}`,
            `Redis-${a.version}-Windows-x64-msys2`,
            'redis-server.exe'
          )
          const zip = join(global.Server.Cache!, `redis-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `redis-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `Redis-${a.version}`
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
        all = [versionLocalFetch(setup?.redis?.dirs ?? [], 'redis-server.exe')]
      } else {
        all = [versionLocalFetch(setup?.redis?.dirs ?? [], 'redis-server', 'redis')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" -v`
            const reg = /([=\s])(\d+(\.\d+){1,4})(.*?)/g
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

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        let all: Array<string> = ['redis']
        const command = 'brew search -q --formula "/^redis@[\\d\\.]+$/"'
        all = await brewSearch(all, command)
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
        `"^redis\\d*$"`,
        (f) => {
          return f.includes('Redis is an open source, advanced key-value store.')
        },
        (name) => {
          return existsSync(join('/opt/local/bin', `${name}-server`))
        }
      )
      resolve(Info)
    })
  }
}
export default new Redis()
