import { join, basename, dirname } from 'path'
import { createWriteStream, existsSync } from 'fs'
import { Base } from './Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  moveChildDirToParent,
  serviceStartExecCMD,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, mkdirp, chmod, remove } from 'fs-extra'
import TaskQueue from '../TaskQueue'
import { I18nT } from '@lang/index'
import { zipUnPack } from '@shared/file'
import axios from 'axios'
import { spawn } from 'child-process-promise'

class Manager extends Base {
  mongoshVersion = '2.5.0'
  constructor() {
    super()
    this.type = 'mongodb'
  }

  init() {
    this.pidPath = join(global.Server.MongoDBDir!, 'mongodb.pid')
  }

  _stopServer(version: SoftInstalled): ForkPromise<{ 'APP-Service-Stop-PID': number[] }> {
    return new ForkPromise(async (resolve, reject, on) => {
      try {
        await this.initMongosh()
      } catch (e) {}
      const mongosh = join(global.Server.AppDir!, 'mongosh', this.mongoshVersion, 'bin/mongosh.exe')
      if (existsSync(mongosh)) {
        try {
          await spawn('mongosh.exe', ['--eval', `"db.shutdownServer()"`], {
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
        conf = conf.replace('##DB-PATH##', `"${dataDir.split('\\').join('/')}"`)
        await writeFile(m, conf)
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: m }))
        })
      }
      const logPath = join(global.Server.MongoDBDir!, `mongodb-${v}.log`)

      const execArgs = `--config "${m}" --logpath "${logPath}" --pidfilepath "${this.pidPath}"`

      try {
        const res = await serviceStartExecCMD(
          version,
          this.pidPath,
          global.Server.MongoDBDir!,
          bin,
          execArgs,
          '',
          on
        )
        resolve(res)
      } catch (e: any) {
        console.log('-k start err: ', e)
        reject(e)
        return
      }
    })
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
          } catch (e) {
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
      } catch (error) {
        resolve(false)
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
