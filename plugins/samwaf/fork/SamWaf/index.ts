import { createHash } from 'crypto'
import { createReadStream, existsSync } from 'fs'
import { dirname, join } from 'path'
import { Base } from '@fork/module/Base'
import { I18nT } from '@lang/runtime'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  chmod,
  mkdirp,
  readFile,
  readdir,
  remove,
  serviceStartExecCMD,
  versionDirCache,
  versionSort,
  waitTime,
  writeFile,
  zipUnpack
} from '@fork/Fn'
import { serviceStartSpawn } from '@fork/util/ServiceStart'
import { unpack } from '@fork/util/Zip'
import { ForkPromise } from '@shared/ForkPromise'
import { isWindows } from '@shared/utils'
import { ProcessSearch } from '@shared/Process'
import { StopProcessListFetch } from '@shared/StopProcessList'
import { ProcessListSearch } from '@shared/Process.win'
import { SamWafT } from '../lang'
import {
  SAMWAF_EXECUTABLES,
  fetchOnlineVersions,
  releaseVersionNum,
  samWafAssetFileName,
  samWafHostTarget
} from './release'
import { defaultConfigYml, parseAdminPort, parseInitialPassword } from './config'

const STARTUP_CHECK_TIMES = 60

export type SamWafAdminInfo = {
  url: string
  port: number
  initialPassword: string
}

class SamWaf extends Base {
  baseDir: string = ''

  constructor() {
    super()
    this.type = 'samwaf'
  }

  init() {
    this.baseDir = join(global.Server.BaseDir!, 'samwaf')
    this.pidPath = join(this.baseDir, 'samwaf.pid')
    mkdirp(this.baseDir).catch()
  }

  private _appDirOf(version: string): string {
    return join(global.Server.AppDir!, 'samwaf', version)
  }

  private _executable(version: SoftInstalled): string {
    // The archive holds a single top-level binary; version.bin is set at
    // install/scan time and always points at it.
    return version?.bin ?? ''
  }

  private _configPath(version: SoftInstalled): string {
    return join(dirname(this._executable(version)), 'conf', 'config.yml')
  }

  private _logsDir(version: SoftInstalled): string {
    return join(dirname(this._executable(version)), 'logs')
  }

  private startupLogFiles(version: SoftInstalled) {
    const logsDir = this._logsDir(version)
    return [
      { name: 'samwaf-start-out.log', path: join(logsDir, 'samwaf-start-out.log') },
      { name: 'samwaf-start-error.log', path: join(logsDir, 'samwaf-start-error.log') }
    ]
  }

  private async startupDiagnostics(version: SoftInstalled): Promise<string> {
    const messages: string[] = []
    for (const file of this.startupLogFiles(version)) {
      if (!existsSync(file.path)) continue
      try {
        const content = (await readFile(file.path, 'utf-8')).trim()
        if (content) messages.push(`${file.name}:\n${content}`)
      } catch {}
    }
    return messages.join('\n')
  }

  /**
   * Seed conf/config.yml before the first start so the admin panel defaults
   * to loopback-only access. SamWaf fills in every missing key itself.
   */
  initConfig(version: SoftInstalled): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject, on) => {
      const bin = this._executable(version)
      if (!bin || !existsSync(bin)) {
        reject(new Error(I18nT('fork.binNotFound')))
        return
      }
      const configPath = this._configPath(version)
      await mkdirp(dirname(configPath))
      if (!existsSync(configPath)) {
        on({ 'APP-On-Log': AppLog('info', I18nT('appLog.confInit')) })
        await writeFile(configPath, defaultConfigYml())
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: configPath }))
        })
      }
      resolve(configPath)
    })
  }

  private async _adminPort(version: SoftInstalled): Promise<number> {
    try {
      const content = await readFile(this._configPath(version), 'utf-8')
      return parseAdminPort(content)
    } catch {
      return parseAdminPort('')
    }
  }

  /**
   * Readiness = a live process owned by THIS install, found the same way the
   * rest of FlyEnv finds service processes: search by binary name, keep only
   * rows whose command line carries this version's ownership markers (the
   * same `ownedProcessMarkers` Base's stop flow uses, so start/stop agree on
   * what "ours" means). A foreign SamWaf instance — manual start, leftover —
   * lives in another directory, fails the marker check, and can never be
   * mistaken for our start; our own process dying from the port conflict is
   * then reported as the real failure. A process-list query that fails is
   * "unverifiable", never "not running" — retried, and attached to the start
   * failure on timeout.
   */
  private async _ownedProcessPid(version: SoftInstalled): Promise<string> {
    const markers = this.ownedProcessMarkers(version)
    if (isWindows()) {
      const all = await ProcessListSearch('SamWaf64', false)
      const hit = all.find((item) => markers.some((m) => item.COMMAND.includes(m)))
      return hit ? `${hit.PID}` : ''
    }
    const plist = await StopProcessListFetch()
    const hit = ProcessSearch('SamWaf', false, plist).find((p) => {
      return (
        markers.some((m) => p.COMMAND.includes(m)) &&
        !p.COMMAND.includes(' grep ') &&
        !p.COMMAND.includes(' /bin/sh -c')
      )
    })
    return hit?.PID ?? ''
  }

  private async _waitOwnedProcess(
    version: SoftInstalled,
    isAlive: () => boolean
  ): Promise<{ pid: string; error?: unknown }> {
    let lastError: unknown
    for (let time = 0; time < STARTUP_CHECK_TIMES; time++) {
      try {
        const pid = await this._ownedProcessPid(version)
        if (pid) return { pid }
      } catch (e) {
        lastError = e
      }
      if (!isAlive()) return { pid: '', error: lastError }
      await waitTime(500)
    }
    return { pid: '', error: lastError }
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })
      const bin = this._executable(version)
      if (!bin || !existsSync(bin)) {
        reject(new Error(I18nT('fork.binNotFound')))
        return
      }
      try {
        await this.initConfig(version).on(on)
        await mkdirp(this._logsDir(version))
      } catch (e) {
        reject(e)
        return
      }

      for (const file of this.startupLogFiles(version)) {
        try {
          await writeFile(file.path, '')
        } catch {}
      }

      const failStart = async (cause?: unknown) => {
        const diagnostics = await this.startupDiagnostics(version)
        const causeText = cause instanceof Error ? cause.message : `${cause ?? ''}`
        const error = [diagnostics, causeText].filter((item) => item.trim()).join('\n')
        const message = error || I18nT('fork.startFail')
        on({
          'APP-On-Log': AppLog(
            'error',
            I18nT('appLog.execStartCommandFail', {
              error: message,
              service: `${this.type}-${version.version}`
            })
          )
        })
        reject(new Error(message))
      }

      let launcherPid = ''
      const isLauncherAlive = () => {
        const pid = Number(launcherPid)
        if (!pid || Number.isNaN(pid)) return true
        try {
          process.kill(pid, 0)
          return true
        } catch (error: any) {
          return error?.code === 'EPERM'
        }
      }

      if (isWindows()) {
        try {
          await serviceStartExecCMD({
            version,
            pidPath: this.pidPath,
            baseDir: dirname(bin),
            bin,
            execArgs: '',
            execEnv: '',
            on,
            checkPidFile: false
          })
        } catch (e) {
          await failStart(e)
          return
        }
        const ready = await this._waitOwnedProcess(version, isLauncherAlive)
        if (ready.pid) {
          launcherPid = ready.pid
          try {
            await writeFile(this.pidPath, launcherPid)
          } catch {}
          on({
            'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: launcherPid }))
          })
          resolve({ 'APP-Service-Start-PID': launcherPid })
          return
        }
        await failStart(ready.error)
      } else {
        try {
          const started = await serviceStartSpawn({
            version,
            pidPath: this.pidPath,
            baseDir: dirname(bin),
            bin,
            execArgs: [],
            execEnv: {},
            cwd: dirname(bin),
            outFile: this.startupLogFiles(version)[0].path,
            errFile: this.startupLogFiles(version)[1].path,
            on,
            waitTime: 5000
          })
          launcherPid = started['APP-Service-Start-PID']
        } catch (error) {
          await failStart(error)
          return
        }
        // SamWaf runs a supervisor that forks the worker; the spawned pid is
        // the supervisor. Readiness = a live owned process found by name +
        // this version's markers (the same ownership rule Base's stop uses),
        // so a foreign instance occupying the port can never fake success.
        const ready = await this._waitOwnedProcess(version, isLauncherAlive)
        if (ready.pid) {
          on({
            'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: launcherPid }))
          })
          resolve({ 'APP-Service-Start-PID': launcherPid || ready.pid })
        } else {
          await failStart(ready.error)
        }
      }
    })
  }

  /**
   * Stop hooks: Base owns discovery, signaling, exit confirmation and PID
   * cleanup. 'SamWaf' matches every platform binary name (SamWaf64.exe,
   * SamWafLinux64/Arm64, SamWafDarwin64/Arm64); ownership markers restrict
   * matches to this install dir. Go's net/http shuts down cleanly on TERM.
   */
  protected _stopSearchName(): string | undefined {
    return 'SamWaf'
  }

  protected _stopSignal(): string {
    return '-TERM'
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const host = samWafHostTarget()
        if (!host) {
          resolve([])
          return
        }
        const found = await fetchOnlineVersions(host.platform, host.arch)
        const all: OnlineVersionItem[] = found.map((item) => {
          const appDir = this._appDirOf(item.version)
          const bin = join(appDir, item.executable)
          const zip = join(global.Server.Cache!, samWafAssetFileName(item.version, item))
          return {
            version: item.version,
            num: releaseVersionNum(item.version),
            url: item.url,
            zip,
            appDir,
            bin,
            sha256: item.sha256,
            downloaded: existsSync(zip),
            installed: existsSync(bin),
            name: `SamWaf-${item.version}`
          } as OnlineVersionItem
        })
        resolve(all)
      } catch {
        resolve([])
      }
    })
  }

  allInstalledVersions(_setup: any) {
    return new ForkPromise(async (resolve) => {
      // versionDirCache is module-level shared state; clear before scanning so
      // freshly installed versions are visible (same rule as built-in modules).
      for (const k in versionDirCache) {
        delete versionDirCache[k]
      }
      try {
        const host = samWafHostTarget()
        if (!host) {
          resolve([])
          return
        }
        const root = join(global.Server.AppDir!, 'samwaf')
        if (!existsSync(root)) {
          resolve([])
          return
        }
        const executableName = SAMWAF_EXECUTABLES[`${host.platform}/${host.arch}`]
        const versions: any[] = []
        for (const dir of await readdir(root)) {
          const appDir = join(root, dir)
          const bin = join(appDir, executableName)
          if (!existsSync(bin)) continue
          versions.push({
            version: dir,
            num: releaseVersionNum(dir),
            bin,
            path: appDir,
            appDir,
            enable: true,
            error: undefined
          })
        }
        resolve(versionSort(versions))
      } catch {
        resolve([])
      }
    })
  }

  /**
   * Verify the downloaded archive against the sha256 published by the release
   * source before unpacking. A mismatch is a required failure: throw so
   * Base.installSoft removes the partial zip/appDir and reports failure.
   */
  private async _verifyZip(row: any) {
    const expected = `${row?.sha256 ?? ''}`.trim().toLowerCase()
    if (!expected) return
    const actual = await new Promise<string>((resolveHash, rejectHash) => {
      const hash = createHash('sha256')
      createReadStream(row.zip)
        .on('data', (chunk) => hash.update(chunk))
        .on('end', () => resolveHash(hash.digest('hex')))
        .on('error', rejectHash)
    })
    if (actual !== expected) {
      throw new Error(SamWafT('sha256Mismatch'))
    }
  }

  async _installSoftHandle(row: any): Promise<void> {
    await this._verifyZip(row)
    await remove(row.appDir)
    await mkdirp(row.appDir)
    if (isWindows()) {
      await zipUnpack(row.zip, row.appDir)
    } else {
      await unpack(row.zip, row.appDir)
    }
    // The archive holds a single top-level executable; locate it by prefix
    // instead of trusting the expected name, then mark it executable.
    const files = await readdir(row.appDir)
    const executable = files.find((file) => file.startsWith('SamWaf'))
    if (!executable) {
      throw new Error(SamWafT('binNotFoundAfterUnpack'))
    }
    // Point bin at the actually unpacked file so Base's installed check and
    // later starts work even if the upstream name ever deviates from ours.
    row.bin = join(row.appDir, executable)
    if (!isWindows()) {
      await chmod(row.bin, 0o755)
    }
  }

  getConfigFiles(version?: SoftInstalled): Array<{ name: string; path: string }> {
    if (!version?.version) return []
    return [{ name: 'config.yml', path: this._configPath(version) }]
  }

  getLogFiles(version?: SoftInstalled): Array<{ name: string; path: string }> {
    if (!version?.version) return []
    const logsDir = this._logsDir(version)
    return [
      { name: 'log.log', path: join(logsDir, 'log.log') },
      { name: 'supervisor.log', path: join(logsDir, 'supervisor.log') },
      ...(version ? this.startupLogFiles(version) : [])
    ]
  }

  /**
   * Marker recording that the initial password has already been surfaced to
   * the user. Lives in the install dir root, so reinstalling/updating the
   * version (which wipes and recreates the dir) resets it automatically and
   * the dialog correctly reappears for genuinely fresh installs.
   */
  private _initialPasswordMarker(version: SoftInstalled): string {
    return join(dirname(this._executable(version)), '.flyenv-initial-password-shown')
  }

  /**
   * Data for the renderer's "open admin panel" action. Reading the initial
   * password is supplementary: failures only blank the password, never the URL.
   * The password is only returned until it has been shown once — upstream
   * never deletes initial_password.txt, so existence alone cannot mean
   * "fresh install".
   */
  adminInfo(version: SoftInstalled): ForkPromise<SamWafAdminInfo> {
    return new ForkPromise(async (resolve) => {
      const port = await this._adminPort(version)
      let initialPassword = ''
      try {
        if (!existsSync(this._initialPasswordMarker(version))) {
          const content = await readFile(
            join(dirname(this._executable(version)), 'data', 'initial_password.txt'),
            'utf-8'
          )
          initialPassword = parseInitialPassword(content)
        }
      } catch {}
      resolve({ url: `http://127.0.0.1:${port}`, port, initialPassword })
    })
  }

  /** Best-effort marker write after the password dialog has been displayed. */
  markInitialPasswordShown(version: SoftInstalled): ForkPromise<boolean> {
    return new ForkPromise(async (resolve) => {
      try {
        await writeFile(this._initialPasswordMarker(version), `${Date.now()}\n`)
      } catch {}
      resolve(true)
    })
  }
}
export default new SamWaf()
