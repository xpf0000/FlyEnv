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
  readFile,
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
import { isLinux, isMacOS, isWindows, waitTime } from '@shared/utils'
import { encodePowerShellCommand } from '@shared/PowerShellCommand'
import { resolveWindowsPowerShellPath } from '@shared/WindowsSystemPaths'
import { ProcessListByExactPid, type PItem } from '@shared/Process'
import { fetchStopProcessListLocal } from '@shared/StopProcessList'
import { stopWindowsServiceProcesses } from '@shared/ServiceStop'
import OpenSearchVersionFetch from './version'
import { applyDevMode, fetchDevModeState } from './security'
import { resolveClusterName, resolveConfDir, resolveHome, resolveLogsDir } from './homebrew'
import dashboards, { isOpenSearchDashboardsItem } from './dashboards'
import { OpenSearchT } from '../lang'
import {
  isOpenSearchServer,
  startupLogReader,
  waitForOpenSearchStartup,
  type OpenSearchStartupState
} from './startup'
import { configureLocalTLS, isTLSConfiguring, type LocalTLSInput } from './tls'

class OpenSearch extends Base {
  private starting = false
  constructor() {
    super()
    this.type = 'opensearch'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'opensearch/opensearch.pid')
  }

  prepareDashboards(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      try {
        const generation = await dashboards.prepare(version, on)
        resolve({ prepared: true, generation })
      } catch (error) {
        reject(error)
      }
    })
  }

  openDashboards(version: SoftInstalled, generation?: string) {
    return new ForkPromise(async (resolve, reject, on) => {
      try {
        const result = await dashboards.open(version, on, generation)
        const item = { ...result['APP-Service-Start-Item'], pid: result['APP-Service-Start-PID'] }
        resolve({
          ...result,
          'APP-Service-Start-Item': item,
          'APP-Service-Stop-Args': [item, { dashboardsOnly: true }],
          'APP-Service-Stop-Companion': true
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  _stopServer(version: SoftInstalled, ...args: any[]) {
    return new ForkPromise(async (resolve, reject, on) => {
      try {
        if (args[0]?.dashboardsOnly) {
          if (!isOpenSearchDashboardsItem(version)) {
            throw new Error(OpenSearchT('dashboardsInstanceInvalid'))
          }
          const pids = await dashboards.stopInstance(version)
          on({ 'APP-Service-Stop-Success': true })
          resolve({ 'APP-Service-Stop-PID': pids })
          return
        }
        // Parent and companion cleanup are independent required operations.
        // Hold the success event until both finish, even if Base emits it earlier.
        const results = await Promise.allSettled([
          super._stopServer(version, ...args).on((event: any) => {
            if (!('APP-Service-Stop-Success' in event)) on(event)
          }),
          dashboards.stopAll()
        ])
        const stopped = new Set<string>()
        const failures: string[] = []
        const parent = results[0]
        if (parent.status === 'fulfilled') {
          for (const pid of parent.value?.['APP-Service-Stop-PID'] ?? []) stopped.add(`${pid}`)
        } else failures.push(`OpenSearch: ${String(parent.reason)}`)
        const panel = results[1]
        if (panel.status === 'fulfilled') {
          for (const pid of panel.value) stopped.add(`${pid}`)
        } else failures.push(`Dashboards: ${String(panel.reason)}`)
        if (failures.length) {
          const message = OpenSearchT('dashboardsPartialStop', {
            pids: [...stopped].join(', ') || '-',
            error: failures.join('; ')
          })
          on({ 'APP-On-Log': AppLog('error', message) })
          reject(new Error(message))
          return
        }
        on({ 'APP-Service-Stop-Success': true })
        resolve({ 'APP-Service-Stop-PID': [...stopped] })
      } catch (error) {
        reject(error)
      }
    })
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

      const versionText = version.version?.trim() ?? ''
      const output = join(baseDir, `opensearch-${versionText}-start-out.log`)
      const errorLog = join(baseDir, `opensearch-${versionText}-start-error.log`)
      const state: OpenSearchStartupState = { list: [] }
      let launcherPid = ''
      try {
        if (isTLSConfiguring(version.path)) throw new Error(OpenSearchT('tlsBusy'))
        this.starting = true
        await remove(this.pidPath)
        const readLogs = await startupLogReader([
          output,
          errorLog,
          join(resolveLogsDir(version.path), `${resolveClusterName(version.path)}.log`)
        ])
        const execEnv: Record<string, string> = {
          OPENSEARCH_HOME: home,
          OPENSEARCH_PATH_CONF: confDir
        }
        const windows = isWindows()
        if (windows) {
          execEnv.FLYENV_OPENSEARCH_BIN = bin
          execEnv.FLYENV_OPENSEARCH_PID = this.pidPath
        }
        const started = await serviceStartSpawn({
          version,
          baseDir,
          bin: windows ? resolveWindowsPowerShellPath() : bin,
          execArgs: windows
            ? [
                '-NoProfile',
                '-NonInteractive',
                '-WindowStyle',
                'Hidden',
                '-EncodedCommand',
                encodePowerShellCommand(
                  '& $env:FLYENV_OPENSEARCH_BIN -s -p $env:FLYENV_OPENSEARCH_PID; exit $LASTEXITCODE'
                )
              ]
            : ['-p', this.pidPath],
          execEnv,
          cwd: home,
          outFile: output,
          errFile: errorLog,
          detached: !windows,
          sensitive: true,
          on: (event: any) => {
            if (!event?.['APP-Service-Start-Success']) on(event)
          },
          waitTime: 500
        })
        launcherPid = started['APP-Service-Start-PID']
        const pid = await waitForOpenSearchStartup({
          launcherPid,
          home,
          conf: confDir,
          state,
          readLogs,
          readPid: async () => {
            try {
              return (await readFile(this.pidPath, 'utf8')).trim()
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
              throw error
            }
          },
          listProcesses: fetchStopProcessListLocal,
          wait: () => waitTime(500)
        })
        on({ 'APP-Service-Start-Success': true })
        resolve({ 'APP-Service-Start-PID': pid })
      } catch (error) {
        try {
          const pids = launcherPid
            ? ProcessListByExactPid(launcherPid, state.list).map((item) => item.PID)
            : []
          if (state.list.length) {
            let finalList = state.list
            if (pids.length) {
              finalList = isWindows()
                ? await stopWindowsServiceProcesses(pids, state.list, { confirmExit: true })
                : await this.stopUnixServicePids('-TERM', pids, pids, 10_000, state.list)
            }
            await this.cleanupStoppedServicePidFiles(
              [...pids, state.serverPid ?? ''].filter(Boolean),
              finalList
            )
          }
        } catch (cleanupError) {
          reject(
            new Error(
              `${String(error)}\nOpenSearch startup cleanup failed: ${String(cleanupError)}`
            )
          )
          return
        }
        reject(error)
      } finally {
        this.starting = false
      }
    })
  }

  protected _stopSearchName(): string | undefined {
    return 'org.opensearch.bootstrap.OpenSearch'
  }

  protected stopWindowsServiceProcesses(pids: string[], list: PItem[]): Promise<PItem[]> {
    return stopWindowsServiceProcesses(pids, list, { confirmExit: true })
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
        if (isTLSConfiguring(version.path)) throw new Error(OpenSearchT('tlsBusy'))
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

  configureLocalTLS(version: SoftInstalled, input: LocalTLSInput) {
    return new ForkPromise(async (resolve, reject, on) => {
      try {
        resolve(
          await configureLocalTLS(version.path, input, async () => {
            if (this.starting) throw new Error(OpenSearchT('tlsStopFirst'))
            const list = await fetchStopProcessListLocal()
            if (
              list.some((process) =>
                isOpenSearchServer(process, resolveHome(version.path), resolveConfDir(version.path))
              )
            ) {
              throw new Error(OpenSearchT('tlsStopFirst'))
            }
            on({ 'APP-On-Progress': { stage: 'certificates' } })
          })
        )
      } catch (error) {
        reject(error)
      }
    })
  }
}
export default new OpenSearch()
