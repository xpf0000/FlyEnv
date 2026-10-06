import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from '@fork/module/Base'
import { I18nT } from '@lang/runtime'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  mkdirp,
  moveChildDirToParent,
  remove,
  serviceStartExecCMD,
  versionBinVersion,
  versionDirCache,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  zipUnpack
} from '@fork/Fn'
import { serviceStartSpawn } from '@fork/util/ServiceStart'
import { ForkPromise } from '@shared/ForkPromise'
import TaskQueue from '@fork/TaskQueue'
import { isLinux, isMacOS, isWindows } from '@shared/utils'
import OpenSearchVersionFetch from './version'
import { applyDevMode, fetchDevModeState } from './security'
import { resolveClusterName, resolveConfDir, resolveHome, resolveLogsDir } from './homebrew'

class OpenSearch extends Base {
  constructor() {
    super()
    this.type = 'opensearch'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'opensearch/opensearch.pid')
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `opensearch-${version.version}` })
        )
      })
      const bin = version.bin

      const baseDir = join(global.Server.BaseDir!, 'opensearch')
      await mkdirp(baseDir)

      // Homebrew installs keep the real home under <path>/libexec; the bin
      // wrapper there exports JAVA_HOME itself, so version.bin stays the
      // wrapper and only the env needs the resolved paths.
      const home = resolveHome(version.path)
      const confDir = resolveConfDir(version.path)

      if (isWindows()) {
        const execEnv = `set "OPENSEARCH_HOME=${home}"
set "OPENSEARCH_PATH_CONF=${confDir}"
`
        const execArgs = `-d -p "${this.pidPath}"`

        try {
          const res = await serviceStartExecCMD({
            version,
            pidPath: this.pidPath,
            baseDir,
            bin,
            execArgs,
            execEnv,
            on,
            maxTime: 120,
            timeToWait: 1000
          })
          resolve(res)
        } catch (e: any) {
          console.log('opensearch start err: ', e)
          reject(e)
          return
        }
      } else {
        // Drop `-d` (daemonize): serviceStartSpawn backgrounds the process itself and
        // needs opensearch to stay in the foreground. `-p` still records the pid.
        const execEnv: Record<string, string> = {
          OPENSEARCH_HOME: home,
          OPENSEARCH_PATH_CONF: confDir
        }
        const execArgs = ['-p', this.pidPath]

        try {
          const res = await serviceStartSpawn({
            version,
            pidPath: this.pidPath,
            baseDir,
            bin,
            execArgs,
            execEnv,
            on,
            waitTime: 5000
          })
          resolve(res)
        } catch (e: any) {
          console.log('opensearch start err: ', e)
          reject(e)
          return
        }
      }
    })
  }

  protected _stopSearchName(): string | undefined {
    return 'org.opensearch.bootstrap.OpenSearch'
  }

  protected _stopSignal(): string {
    return '-TERM'
  }

  private _binRelativePath(): string {
    return isWindows() ? 'bin/opensearch.bat' : 'bin/opensearch'
  }

  private async _fetchOnlineList(): Promise<OnlineVersionItem[]> {
    const arch = global.Server.Arch === 'x86_64' ? 'x86' : 'arm'
    if (isWindows()) {
      return await OpenSearchVersionFetch.win()
    } else if (isMacOS()) {
      return await OpenSearchVersionFetch.mac(arch)
    } else if (isLinux()) {
      return await OpenSearchVersionFetch.linux(arch)
    }
    return []
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineList()
        const binRel = this._binRelativePath()
        all.forEach((a: any) => {
          const appDir = join(global.Server.AppDir!, 'opensearch', `v${a.version}`)
          const bin = join(appDir, binRel)
          const zip = join(
            global.Server.Cache!,
            isWindows()
              ? `static-opensearch-${a.version}.zip`
              : `static-opensearch-${a.version}.tar.gz`
          )
          a.appDir = appDir
          a.zip = zip
          a.bin = bin
          a.downloaded = existsSync(zip)
          a.installed = existsSync(bin)
          a.name = `OpenSearch-${a.version}`
        })
        resolve(all)
      } catch {
        resolve([])
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      // versionLocalFetch caches directory listings in the module-level
      // versionDirCache; clear it so versions installed after an earlier scan
      // do not stay invisible until the fork process restarts.
      for (const k in versionDirCache) {
        delete versionDirCache[k]
      }
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [
          versionLocalFetch(setup?.opensearch?.dirs ?? [], 'opensearch.bat', 'opensearch', [
            'bin/opensearch.bat'
          ])
        ]
      } else {
        all = [
          versionLocalFetch(setup?.opensearch?.dirs ?? [], 'opensearch', 'opensearch', [
            'bin/opensearch'
          ])
        ]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" --version`
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
        const all = ['opensearch']
        const info = await brewInfoJson(all)
        resolve(info)
      } catch (e) {
        reject(e)
        return
      }
    })
  }

  getConfigFiles(version?: SoftInstalled): Array<{ name: string; path: string }> {
    if (!version?.path) {
      return []
    }
    const confDir = resolveConfDir(version.path)
    return [
      { name: 'opensearch.yml', path: join(confDir, 'opensearch.yml') },
      { name: 'jvm.options', path: join(confDir, 'jvm.options') },
      { name: 'log4j2.properties', path: join(confDir, 'log4j2.properties') }
    ]
  }

  getLogFiles(version?: SoftInstalled): Array<{ name: string; path: string }> {
    if (!version?.path) {
      return []
    }
    const logDir = resolveLogsDir(version.path)
    const clusterName = resolveClusterName(version.path)
    return [
      { name: `${clusterName}.log`, path: join(logDir, `${clusterName}.log`) },
      { name: `${clusterName}_server.json`, path: join(logDir, `${clusterName}_server.json`) },
      {
        name: `${clusterName}_deprecation.json`,
        path: join(logDir, `${clusterName}_deprecation.json`)
      },
      { name: 'gc.log', path: join(logDir, 'gc.log') }
    ]
  }

  applyDevMode(version: SoftInstalled, enable: boolean) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const file = await applyDevMode(version, enable)
        resolve({ file })
      } catch (e) {
        reject(e)
      }
    })
  }

  fetchDevModeState(version: SoftInstalled) {
    return new ForkPromise(async (resolve) => {
      try {
        resolve(await fetchDevModeState(version))
      } catch {
        resolve(false)
      }
    })
  }
}
export default new OpenSearch()
