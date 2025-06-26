import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { Base } from './Base'
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
  versionMacportsFetch,
  versionSort,
  readFile,
  writeFile,
  mkdirp,
  chmod,
  remove,
  zipUnPack,
  moveChildDirToParent,
  createWriteStream,
  serviceStartExecCMD,
  waitTime
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import TaskQueue from '../TaskQueue'
import axios from 'axios'
import { isMacOS, isWindows, pathFixedToUnix } from '@shared/utils'
import { spawnPromise } from '@shared/child-process'

class Manager extends Base {
  mongoshVersion = '2.5.2'

  constructor() {
    super()
    this.type = 'mongodb'
  }

  init() {
    this.pidPath = join(global.Server.MongoDBDir!, 'mongodb.pid')
  }

  initMongosh() {
    return new ForkPromise(async (resolve) => {
      const version = this.mongoshVersion
      const mongosh = join(global.Server.AppDir!, 'mongosh', version, 'bin/mongosh.exe')
      if (existsSync(mongosh)) {
        return resolve(true)
      }
      const appDir = join(global.Server.AppDir!, 'mongosh', version)
      const url = `https://downloads.mongodb.com/compass/mongosh-${version}-win32-x64.zip`
      const zip = join(global.Server.Cache!, `mongosh-${version}.zip`)
      const doInstall = async () => {
        if (existsSync(zip)) {
          try {
            await remove(appDir)
            await mkdirp(appDir)
            await zipUnPack(zip, appDir)
            await moveChildDirToParent(appDir)
            return existsSync(mongosh)
          } catch {
            await remove(zip)
          }
        }
        return false
      }

      const installRes = await doInstall()
      if (installRes) {
        return resolve(true)
      }

      try {
        const response = await axios({
          method: 'get',
          url: url,
          responseType: 'stream'
        })

        const writer = createWriteStream(zip)
        response.data.pipe(writer)
        writer.on('finish', async () => {
          const installRes = await doInstall()
          if (installRes) {
            return resolve(true)
          }
          return resolve(false)
        })
        writer.on('error', () => {
          resolve(false)
        })
      } catch {
        resolve(false)
      }
    })
  }

  _stopServer(version: SoftInstalled): ForkPromise<{ 'APP-Service-Stop-PID': number[] }> {
    if (!isWindows()) {
      return super._stopServer(version) as any
    }
    return new ForkPromise(async (resolve, reject, on) => {
      try {
        await this.initMongosh()
      } catch {}
      const mongosh = join(global.Server.AppDir!, 'mongosh', this.mongoshVersion, 'bin/mongosh.exe')
      if (existsSync(mongosh)) {
        try {
          await spawnPromise('mongosh.exe', ['--eval', `"db.shutdownServer()"`], {
            cwd: dirname(mongosh),
            shell: false
          })
        } catch (e) {
          console.log('mongosh shutdown error: ', e)
        }
        const pids = new Set<string>()
        const appPidFile = join(global.Server.BaseDir!, `pid/${this.type}.pid`)
        if (existsSync(appPidFile)) {
          const pid = (await readFile(appPidFile, 'utf-8')).trim()
          pids.add(pid)
          TaskQueue.run(remove, appPidFile).then().catch()
        }
        if (version?.pid) {
          pids.add(`${version.pid}`)
        }
        on({
          'APP-Service-Stop-Success': true
        })
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceEnd', { service: this.type }))
        })
        return resolve({
          'APP-Service-Stop-PID': [...pids].map((p) => Number(p))
        })
      }
      super._stopServer(version).on(on).then(resolve).catch(reject)
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
      const bin = version.bin
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MongoDBDir!, `mongodb-${v}.conf`)
      const dataDir = join(global.Server.MongoDBDir!, `data-${v}`)
      if (!existsSync(dataDir)) {
        await mkdirp(dataDir)
        await chmod(dataDir, '0777')
      }
      if (!existsSync(m)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        const tmpl = join(global.Server.Static!, 'tmpl/mongodb.conf')
        let conf = await readFile(tmpl, 'utf-8')
        conf = conf.replace('##DB-PATH##', pathFixedToUnix(dataDir))
        await writeFile(m, conf)
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: m }))
        })
      }
      const logPath = join(global.Server.MongoDBDir!, `mongodb-${v}.log`)

      const baseDir = global.Server.MongoDBDir!
      const execEnv = ''
      if (isMacOS()) {
        const execArgs = `--config "${m}" --logpath "${logPath}" --pidfilepath "${this.pidPath}" --fork`
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
      } else if (isWindows()) {
        const execArgs = `--config "${m}" --logpath "${logPath}" --pidfilepath "${this.pidPath}"`

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
      }
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('mongodb')
        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `mongodb-${a.version}`, 'bin/mongod.exe')
          const zip = join(global.Server.Cache!, `mongodb-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `mongodb-${a.version}`)
          a.zip = zip
          a.bin = dir

          const dirOld = join(
            global.Server.AppDir!,
            `mongodb-${a.version}`,
            `mongodb-win32-x86_64-windows-${a.version}`,
            'bin/mongod.exe'
          )

          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir) || existsSync(dirOld)
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
      if (isMacOS()) {
        all = [
          versionLocalFetch(setup?.mongodb?.dirs ?? [], 'mongod', 'mongodb-'),
          versionMacportsFetch(['bin/mongod', 'sbin/mongod'])
        ]
      } else if (isWindows()) {
        all = [versionLocalFetch(setup?.mongodb?.dirs ?? [], 'mongod.exe')]
      }

      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" --version`
            const reg = /(v)(\d+(\.\d+){1,4})(.*?)/g
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
      await remove(row.appDir)
      await mkdirp(row.appDir)
      await zipUnPack(row.zip, row.appDir)
      await moveChildDirToParent(row.appDir)
      await waitTime(1000)
      await this.initMongosh()
    }
  }

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        let all: Array<string> = []
        const cammand =
          'brew search -q --desc --eval-all --formula "High-performance, schema-free, document-oriented database"'
        all = await brewSearch(all, cammand, (content) => {
          content = content
            .replace('==> Formulae', '')
            .replace(
              new RegExp(
                ': High-performance, schema-free, document-oriented database \\(Enterprise\\)',
                'g'
              ),
              ''
            )
            .replace(
              new RegExp(': High-performance, schema-free, document-oriented database', 'g'),
              ''
            )
          return content
        })
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
        `^mongodb\\d*$`,
        (f) => {
          return f.includes('high-performance, schema-free, document-oriented')
        },
        () => {
          return (
            existsSync(join('/opt/local/bin', 'mongod')) ||
            existsSync(join('/opt/local/sbin', 'mongod'))
          )
        }
      )
      resolve(Info)
    })
  }
}
export default new Manager()
