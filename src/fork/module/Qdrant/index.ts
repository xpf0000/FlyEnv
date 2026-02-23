import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { Base } from '../Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  serviceStartExec,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  mkdirp,
  serviceStartExecWin,
  copyFile,
  binXattrFix
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import TaskQueue from '../../TaskQueue'
import { I18nT } from '@lang/index'
import { isMacOS, isWindows } from '@shared/utils'

class Qdrant extends Base {
  constructor() {
    super()
    this.type = 'qdrant'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'qdrant/qdrant.pid')
  }

  initConfig(version: SoftInstalled): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject, on) => {
      const configDir = join(dirname(version.bin), '/config')
      await mkdirp(configDir)
      const iniFile = join(configDir, 'config.yaml')
      const defaultFile = join(configDir, 'config.default.yaml')
      const tmplFile = join(global.Server.Static!, 'tmpl/qdrant-config.yaml')
      if (!existsSync(defaultFile)) {
        await copyFile(tmplFile, defaultFile)
      }
      if (!existsSync(iniFile)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        await copyFile(tmplFile, iniFile)
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
          I18nT('appLog.startServiceBegin', { service: `qdrant-${version.version}` })
        )
      })
      const bin = version.bin
      await this.initConfig(version).on(on)

      const baseDir = join(global.Server.BaseDir!, `qdrant`)
      await mkdirp(baseDir)

      if (isWindows()) {
        try {
          const res = await serviceStartExecWin({
            version,
            pidPath: this.pidPath,
            baseDir,
            bin,
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
        try {
          const res = await serviceStartExec({
            version,
            pidPath: this.pidPath,
            baseDir,
            bin,
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
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('qdrant')
        all.forEach((a: any) => {
          let dir = ''
          let zip = ''
          if (isWindows()) {
            dir = join(global.Server.AppDir!, `qdrant`, a.version, 'qdrant.exe')
            zip = join(global.Server.Cache!, `qdrant-${a.version}.zip`)
            a.appDir = join(global.Server.AppDir!, `qdrant`, a.version)
          } else {
            dir = join(global.Server.AppDir!, `qdrant`, a.version, 'qdrant')
            zip = join(global.Server.Cache!, `qdrant-${a.version}.tar.gz`)
            a.appDir = join(global.Server.AppDir!, `qdrant`, a.version)
          }

          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `Qdrant-${a.version}`
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
        all = [versionLocalFetch(setup?.qdrant?.dirs ?? [], 'qdrant.exe')]
      } else {
        all = [versionLocalFetch(setup?.qdrant?.dirs ?? [], 'qdrant', 'qdrant')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) =>
            TaskQueue.run(
              versionBinVersion,
              item.bin,
              `"${item.bin}" --version`,
              /(qdrant )(\d+(\.\d+){1,4})(.*?)/g
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
      await binXattrFix(row.bin)
    }
  }

  brewinfo() {
    return new ForkPromise(async (resolve) => {
      resolve({})
    })
  }

  portinfo() {
    return new ForkPromise(async (resolve) => {
      resolve({})
    })
  }
}
export default new Qdrant()
