import { join, dirname, basename } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  execPromise,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, mkdirp, chmod, remove } from 'fs-extra'
import TaskQueue from '../TaskQueue'
import { EOL } from 'os'
import { I18nT } from '../lang'

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

      const pidPath = join(global.Server.MongoDBDir!, 'mongodb.pid')
      if (existsSync(pidPath)) {
        try {
          await remove(pidPath)
        } catch (e) {}
      }

      const startLogFile = join(global.Server.MongoDBDir!, `start.log`)
      const startErrLogFile = join(global.Server.MongoDBDir!, `start.error.log`)
      if (existsSync(startErrLogFile)) {
        try {
          await remove(startErrLogFile)
        } catch (e) {}
      }

      const commands: string[] = [
        '@echo off',
        'chcp 65001>nul',
        `cd /d "${dirname(bin)}"`,
        `start /B ./${basename(bin)} --config "${m}" --logpath "${logPath}" --pidfilepath "${pidPath}" > "${startLogFile}" 2>"${startErrLogFile}"`
      ]

      const command = commands.join(EOL)
      console.log('command: ', command)

      const cmdName = `start.cmd`
      const sh = join(global.Server.MongoDBDir!, cmdName)
      await writeFile(sh, command)

      const appPidFile = join(global.Server.BaseDir!, `pid/${this.type}.pid`)
      await mkdirp(dirname(appPidFile))
      if (existsSync(appPidFile)) {
        try {
          await remove(appPidFile)
        } catch (e) {}
      }

      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommand'))
      })
      process.chdir(global.Server.MongoDBDir!)
      try {
        await execPromise(
          `powershell.exe -Command "(Start-Process -FilePath ./${cmdName} -PassThru -WindowStyle Hidden).Id"`
        )
      } catch (e: any) {
        on({
          'APP-On-Log': AppLog(
            'error',
            I18nT('appLog.execStartCommandFail', {
              error: e,
              service: `${this.type}-${version.version}`
            })
          )
        })
        console.log('-k start err: ', e)
        reject(e)
        return
      }
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommandSuccess'))
      })
      on({
        'APP-Service-Start-Success': true
      })
      const res = await this.waitPidFile(pidPath)
      if (res) {
        if (res?.pid) {
          on({
            'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: res.pid }))
          })
          await writeFile(appPidFile, res.pid)
          resolve({
            'APP-Service-Start-PID': res.pid
          })
          return
        }
        on({
          'APP-On-Log': AppLog(
            'error',
            I18nT('appLog.startServiceFail', {
              error: res?.error ?? 'Start Fail',
              service: `${this.type}-${version.version}`
            })
          )
        })
        reject(new Error(res?.error ?? 'Start Fail'))
        return
      }
      let msg = 'Start Fail'
      if (existsSync(startErrLogFile)) {
        msg = await readFile(startErrLogFile, 'utf-8')
      }
      on({
        'APP-On-Log': AppLog(
          'error',
          I18nT('appLog.startServiceFail', {
            error: msg,
            service: `${this.type}-${version.version}`
          })
        )
      })
      reject(new Error(msg || 'Start Fail'))
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
