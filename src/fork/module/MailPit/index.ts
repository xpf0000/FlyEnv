import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  serviceStartExec,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  readFile,
  writeFile,
  mkdirp,
  serviceStartExecWin
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import TaskQueue from '../../TaskQueue'
import { I18nT } from '@lang/index'
import { EOL } from 'os'
import { isMacOS, isWindows, pathFixedToUnix } from '@shared/utils'
import Helper from '../../Helper'

class MailPit extends Base {
  constructor() {
    super()
    this.type = 'mailpit'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'mailpit/mailpit.pid')
  }

  initConfig(): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject, on) => {
      const baseDir = join(global.Server.BaseDir!, 'mailpit')
      if (!existsSync(baseDir)) {
        await mkdirp(baseDir)
      }
      const iniFile = join(baseDir, 'mailpit.conf')
      if (!existsSync(iniFile)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        const tmplFile = join(global.Server.Static!, 'tmpl/mailpit.conf')
        let content = await readFile(tmplFile, 'utf-8')
        const logFile = join(baseDir, 'mailpit.log')
        content = content.replace('##LOG_FILE##', pathFixedToUnix(logFile))
        await writeFile(iniFile, content)
        const defaultIniFile = join(baseDir, 'mailpit.conf.default')
        await writeFile(defaultIniFile, content)
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: iniFile }))
        })
      }
      resolve(iniFile)
    })
  }

  fetchLogPath() {
    return new ForkPromise(async (resolve) => {
      const baseDir = join(global.Server.BaseDir!, 'mailpit')
      const iniFile = join(baseDir, 'mailpit.conf')
      if (!existsSync(iniFile)) {
        resolve('')
        return
      }
      const content = await readFile(iniFile, 'utf-8')
      const logStr = content.split('\n').find((s) => s.includes('MP_LOG_FILE'))
      if (!logStr) {
        resolve('')
        return
      }
      const file = logStr.trim().split('=').pop()
      resolve(file ?? '')
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `mailpit-${version.version}` })
        )
      })
      const bin = version.bin
      const iniFile = await this.initConfig().on(on)

      const getConfEnv = async () => {
        const content = await readFile(iniFile, 'utf-8')
        const arr = content
          .split('\n')
          .filter((s) => {
            const str = s.trim()
            return !!str && str.startsWith('MP_')
          })
          .map((s) => s.trim())
        const dict: Record<string, string> = {}
        arr.forEach((a) => {
          const item = a.split('=')
          const k = item.shift()
          const v = item.join('=')
          if (k) {
            dict[k] = v
          }
        })
        return dict
      }

      const opt = await getConfEnv()

      const baseDir = join(global.Server.BaseDir!, `mailpit`)
      await mkdirp(baseDir)

      if (isWindows()) {
        const envs: string[] = []
        for (const k in opt) {
          const v = opt[k]
          envs.push(`$env:${k}="${v}"`)
        }
        envs.push('')

        const execEnv = envs.join(EOL)
        const execArgs = ` `

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
        const envs: string[] = []
        for (const k in opt) {
          const v = opt[k]
          envs.push(`export ${k}="${v}"`)
        }
        envs.push('')

        const execEnv = envs.join(EOL)
        const execArgs = ``

        try {
          const res = await serviceStartExec({
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
      }
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('mailpit')
        all.forEach((a: any) => {
          let dir = ''
          let zip = ''
          if (isWindows()) {
            dir = join(global.Server.AppDir!, `mailpit-${a.version}`, 'mailpit.exe')
            zip = join(global.Server.Cache!, `mailpit-${a.version}.zip`)
            a.appDir = join(global.Server.AppDir!, `mailpit-${a.version}`)
          } else {
            dir = join(global.Server.AppDir!, `static-mailpit-${a.version}`, 'mailpit')
            zip = join(global.Server.Cache!, `static-mailpit-${a.version}.tar.gz`)
            a.appDir = join(global.Server.AppDir!, `static-mailpit-${a.version}`)
          }

          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `Mailpit-${a.version}`
        })
        resolve(all)
      } catch {
        resolve({})
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [versionLocalFetch(setup?.mailpit?.dirs ?? [], 'mailpit.exe')]
      } else {
        all = [versionLocalFetch(setup?.mailpit?.dirs ?? [], 'mailpit', 'mailpit')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) =>
            TaskQueue.run(
              versionBinVersion,
              item.bin,
              `"${item.bin}" version`,
              /(v)(\d+(\.\d+){1,4})( )/g
            )
          )
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
    await super._installSoftHandle(row)
    if (isMacOS()) {
      await Helper.send('mailpit', 'binFixed', row.bin)
    }
  }

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const all = ['mailpit']
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
      resolve({})
    })
  }
}
export default new MailPit()
