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
import { readFile, writeFile, mkdirp, chmod } from 'fs-extra'
import TaskQueue from '../TaskQueue'
import { EOL } from 'os'

class Manager extends Base {
  constructor() {
    super()
    this.type = 'mongodb'
  }

  init() {
    this.pidPath = join(global.Server.MongoDBDir!, 'mongodb.pid')
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject) => {
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
        conf = conf.replace('##DB-PATH##', `"${dataDir.split('\\').join('/')}"`)
        await writeFile(m, conf)
      }
      const logPath = join(global.Server.MongoDBDir!, `mongodb-${v}.log`)

      const pidPath = join(global.Server.MongoDBDir!, 'mongodb.pid')
      if (existsSync(pidPath)) {
        try {
          await execPromiseRoot(`del -Force "${pidPath}"`)
        } catch (e) {}
      }

      const startLogFile = join(global.Server.MongoDBDir!, `start.log`)
      const startErrLogFile = join(global.Server.MongoDBDir!, `start.error.log`)
      if (existsSync(startErrLogFile)) {
        try {
          await execPromiseRoot(`del -Force "${startErrLogFile}"`)
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
          await execPromiseRoot(`del -Force "${appPidFile}"`)
        } catch (e) {}
      }

      process.chdir(global.Server.MongoDBDir!)
      try {
        await execPromiseRoot(
          `powershell.exe -Command "(Start-Process -FilePath ./${cmdName} -PassThru -WindowStyle Hidden).Id"`
        )
      } catch (e: any) {
        console.log('-k start err: ', e)
        reject(e)
        return
      }
      const res = await this.waitPidFile(pidPath)
      if (res) {
        if (res?.pid) {
          await writeFile(appPidFile, res.pid)
          resolve({
            'APP-Service-Start-PID': res.pid
          })
          return
        }
        reject(new Error(res?.error ?? 'Start Fail'))
        return
      }
      let msg = 'Start Fail'
      if (existsSync(startLogFile)) {
        msg = await readFile(startLogFile, 'utf-8')
      }
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
