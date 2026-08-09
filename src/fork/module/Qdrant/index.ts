import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { Base } from '../Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  mkdirp,
  copyFile,
  binXattrFix,
  downloadFile,
  zipUnpack,
  rename,
  remove
} from '../../Fn'
import { serviceStartSpawn } from '../../util/ServiceStart'
import { ForkPromise } from '@shared/ForkPromise'
import TaskQueue from '../../TaskQueue'
import { I18nT } from '@lang/runtime'
import { isMacOS, isWindows } from '@shared/utils'

export const QDRANT_WEB_UI_VERSION = 'v0.2.13'

export function qdrantWebUiDir(bin: string): string {
  return join(dirname(bin), 'static')
}

export function qdrantWebUiEnvironment(bin: string): Record<string, string> {
  return {
    QDRANT__SERVICE__STATIC_CONTENT_DIR: qdrantWebUiDir(bin)
  }
}

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

      try {
        await this.ensureWebUi(bin, version.version)
      } catch (e) {
        console.log('qdrant web ui repair error: ', e)
        on({
          'APP-On-Log': AppLog(
            'error',
            `Qdrant Web UI is unavailable: ${e instanceof Error ? e.message : `${e}`}`
          )
        })
      }

      const baseDir = join(global.Server.BaseDir!, `qdrant`)
      await mkdirp(baseDir)

      try {
        const res = await serviceStartSpawn({
          version,
          pidPath: this.pidPath,
          baseDir,
          bin,
          execEnv: qdrantWebUiEnvironment(bin),
          on
        })
        resolve(res)
      } catch (e: any) {
        console.log('-k start err: ', e)
        reject(e)
        return
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
    try {
      await this.ensureWebUi(row.bin, row.version, row.appDir)
    } catch (e) {
      console.log('qdrant web ui install error: ', e)
    }
  }

  private async ensureWebUi(bin: string, version?: string | null, appDir?: string): Promise<void> {
    const root = appDir ?? dirname(bin)
    const staticDir = qdrantWebUiDir(bin)
    if (existsSync(join(staticDir, 'index.html'))) return

    const webUiUrl = `https://github.com/qdrant/qdrant-web-ui/releases/download/${QDRANT_WEB_UI_VERSION}/dist-qdrant.zip`
    const webUiZip = join(global.Server.Cache!, `qdrant-web-ui-${QDRANT_WEB_UI_VERSION}.zip`)
    const extractDir = join(
      global.Server.Cache!,
      `qdrant-web-ui-${version?.trim() || 'latest'}-extract`
    )
    if (!existsSync(webUiZip)) {
      await downloadFile(webUiUrl, webUiZip)
    }
    if (!existsSync(webUiZip)) {
      throw new Error(`Qdrant Web UI archive was not downloaded: ${webUiZip}`)
    }

    await remove(extractDir).catch(() => {})
    await mkdirp(extractDir)
    try {
      await zipUnpack(webUiZip, extractDir)
      const distDir = join(extractDir, 'dist')
      if (!existsSync(join(distDir, 'index.html'))) {
        throw new Error('Qdrant Web UI archive does not contain dist/index.html')
      }
      await remove(staticDir).catch(() => {})
      await mkdirp(root)
      await rename(distDir, staticDir)
    } finally {
      await remove(extractDir).catch(() => {})
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

  getConfigFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    if (!_version?.bin) {
      return []
    }
    const configDir = join(dirname(_version.bin), 'config')
    return [
      { name: 'config.yaml', path: join(configDir, 'config.yaml') },
      { name: 'config.default.yaml', path: join(configDir, 'config.default.yaml') }
    ]
  }

  getLogFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    if (!_version?.version) {
      return []
    }
    const baseDir = join(global.Server.BaseDir!, 'qdrant')
    const versionStr = `qdrant-${_version.version.trim()}-start`.split(' ').join('')
    return [
      { name: 'start-out.log', path: join(baseDir, `${versionStr}-out.log`) },
      { name: 'start-error.log', path: join(baseDir, `${versionStr}-error.log`) }
    ]
  }
}
export default new Qdrant()
