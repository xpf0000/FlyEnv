import { basename, dirname, join } from 'path'
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
  versionSort,
  waitTime
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, remove, mkdirp } from 'fs-extra'
import { I18nT } from '../lang'
import TaskQueue from '../TaskQueue'
import {EOL} from "os";

class Elasticsearch extends Base {
  constructor() {
    super()
    this.type = 'elasticsearch'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'elasticsearch/elasticsearch.pid')
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `elasticsearch-${version.version}` })
        )
      })
      const bin = version.bin
      if (existsSync(this.pidPath)) {
        try {
          await remove(this.pidPath)
        } catch (e) {}
      }

      const checkPid = async (time = 0) => {
        console.log('checkPid: ', time)
        if (existsSync(this.pidPath)) {
          const pid = await readFile(this.pidPath, 'utf-8')
          on({
            'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: pid.trim() }))
          })
          await writeFile(appPidFile, pid.trim())
          resolve({
            'APP-Service-Start-PID': pid.trim()
          })
        } else {
          if (time < 120) {
            await waitTime(1000)
            await checkPid(time + 1)
          } else {
            on({
              'APP-On-Log': AppLog(
                'error',
                I18nT('appLog.startServiceFail', {
                  error: I18nT('fork.startFail'),
                  service: `elasticsearch-${version.version}`
                })
              )
            })
            reject(new Error(I18nT('fork.startFail')))
          }
        }
      }

      const startLogFile = join(global.Server.BaseDir!, `elasticsearch/start.log`)
      if (existsSync(startLogFile)) {
        try {
          await remove(startLogFile)
        } catch (e) {}
      }
      const commands: string[] = [
        '@echo off',
        'chcp 65001>nul',
        `set "ES_HOME=${version.path}"`,
        `set "ES_PATH_CONF=${join(version.path, 'config')}"`,
        `cd /d "${dirname(bin)}"`,
        `start /B ./${basename(bin)} -d -p "${this.pidPath}" > "${startLogFile}" 2>&1 &`
      ]

      const command = commands.join(EOL)
      console.log('command: ', command)

      const cmdName = `start.cmd`
      const sh = join(global.Server.BaseDir!, `elasticsearch/${cmdName}`)
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
      process.chdir(join(global.Server.BaseDir!, `elasticsearch`))
      try {
        await execPromise(
          `powershell.exe -Command "(Start-Process -FilePath ./${cmdName} -PassThru -WindowStyle Hidden).Id"`
        )
      } catch (e) {
        on({
          'APP-On-Log': AppLog(
            'error',
            I18nT('appLog.execStartCommandFail', {
              error: e,
              service: `elasticsearch-${version.version}`
            })
          )
        })
        console.log('start e: ', e)
        reject(e)
        return
      }
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommandSuccess'))
      })
      on({
        'APP-Service-Start-Success': true
      })
      await checkPid()
    })
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('elasticsearch')
        all.forEach((a: any) => {
          const dir = join(
            global.Server.AppDir!,
            'elasticsearch',
            `v${a.version}`,
            'bin/elasticsearch.bat'
          )
          const zip = join(global.Server.Cache!, `elasticsearch-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, 'elasticsearch', `v${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
        })
        resolve(all)
      } catch (e) {
        resolve({})
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      Promise.all([
        versionLocalFetch(setup?.elasticsearch?.dirs ?? [], 'elasticsearch.bat')
      ])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `${basename(item.bin)} --version`
            const reg = /(Version: )(\d+(\.\d+){1,4})(.*?)/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
          if (all.length === 0) {
            return Promise.resolve([])
          }
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
export default new Elasticsearch()
