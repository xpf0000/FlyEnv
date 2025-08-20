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
  writeFile,
  mkdirp,
  serviceStartExecWin,
  remove,
  zipUnpack,
  moveChildDirToParent,
  brewSearch,
  readFile,
  waitTime
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { I18nT } from '@lang/index'
import TaskQueue from '../../TaskQueue'
import { isWindows } from '@shared/utils'
import { parse as iniParse } from 'ini'

class Typesense extends Base {
  constructor() {
    super()
    this.type = 'typesense'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'typesense/typesense.pid')
  }

  initConfig(): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject, on) => {
      const baseDir = join(global.Server.BaseDir!, 'typesense')
      await mkdirp(baseDir)
      const iniFile = join(baseDir, 'typesense-server.ini')
      console.log('iniFile: ', iniFile)
      if (!existsSync(iniFile)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        const dataDir = join(baseDir, 'data')
        const content = `[server]
api-key = xyz
data-dir = ${dataDir}
api-port = 8108
enable-cors = true
cors-domains = *
`
        await writeFile(iniFile, content)
        const defaultIniFile = join(baseDir, 'typesense-server.ini.default')
        await writeFile(defaultIniFile, content)
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: iniFile }))
        })
      }
      resolve(iniFile)
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `typesense-${version.version}` })
        )
      })

      const iniFile = await this.initConfig().on(on)

      const bin = version.bin
      const baseDir = join(global.Server.BaseDir!, 'typesense')
      await mkdirp(baseDir)

      const execEnv = ``

      const logDir = join(baseDir, 'log')
      if (!existsSync(logDir)) {
        await mkdirp(logDir)
      }

      const dataDirDefault = join(baseDir, 'data')
      const content = await readFile(iniFile, 'utf8')
      const config = iniParse(content)
      const dataDir = config?.server?.['data-dir'] ?? config?.['data-dir'] ?? dataDirDefault
      if (!existsSync(dataDir)) {
        await mkdirp(dataDir)
        await waitTime(600)
      }

      if (isWindows()) {
        const execArgs = `--config=\`"${iniFile}\`" --log-dir=\`"${logDir}\`"`
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
        const execArgs = `--config="${iniFile}" --log-dir="${logDir}"`
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
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('typesense')
        all.forEach((a: any) => {
          let bin = ''
          let zip = ''
          if (isWindows()) {
            bin = join(global.Server.AppDir!, `typesense`, a.version, 'typesense.exe')
            zip = join(global.Server.Cache!, `typesense-${a.version}.zip`)
            a.appDir = join(global.Server.AppDir!, `typesense`, a.version)
          } else {
            bin = join(global.Server.AppDir!, `typesense`, a.version, 'typesense-server')
            zip = join(global.Server.Cache!, `typesense-${a.version}.tar.gz`)
            a.appDir = join(global.Server.AppDir!, `typesense`, a.version)
          }
          a.zip = zip
          a.bin = bin
          a.downloaded = existsSync(zip)
          a.installed = existsSync(bin)
          a.name = `Typesense-${a.version}`
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
        all = [versionLocalFetch(setup?.typesense?.dirs ?? [], 'typesense.exe')]
      } else {
        all = [versionLocalFetch(setup?.typesense?.dirs ?? [], 'typesense-server', 'typesense')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" --version`
            const reg = /(Typesense )(\d+(\.\d+){1,4})(.*?)/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg, true)
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

  async _installSoftHandle(row: any): Promise<void> {
    if (isWindows()) {
      await remove(row.appDir)
      await mkdirp(row.appDir)
      await zipUnpack(row.zip, row.appDir)
      await moveChildDirToParent(row.appDir)
    } else {
      const dir = row.appDir
      await super._installSoftHandle(row)
      await moveChildDirToParent(dir)
    }
  }

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        let all: Array<string> = ['typesense/tap/typesense-server']
        const command =
          'brew search -q --formula "/^(typesense\\/tap\\/typesense-server)@[\\d\\.]+$/"'
        all = await brewSearch(all, command)
        const info = await brewInfoJson(all)
        resolve(info)
      } catch (e) {
        reject(e)
        return
      }
    })
  }
}
export default new Typesense()
