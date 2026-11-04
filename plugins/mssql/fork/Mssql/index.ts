import { basename, dirname, join, win32 } from 'path'
import { createReadStream, existsSync } from 'fs'
import { arch, totalmem } from 'node:os'
import { stat } from 'node:fs/promises'
import { gunzipSync } from 'zlib'
import { createHash, randomUUID } from 'crypto'
import axios from 'axios'
import * as http from 'http'
import * as https from 'https'
import { Base } from '@fork/module/Base'
import { I18nT } from '@lang/runtime'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  chmod,
  execPromiseWithEnv,
  mkdirp,
  readFile,
  readdir,
  rename,
  zipUnpack,
  remove,
  versionDirCache,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  waitTime,
  writeFile
} from '@fork/Fn'
import { serviceStartSpawn } from '@fork/util/ServiceStart'
import { ForkPromise } from '@shared/ForkPromise'
import { decodeTextFile } from './TextFile'
import {
  canRepairWindowsPermissions,
  windowsGrantAccessBody,
  windowsServiceAccessCheckScript
} from './Permissions'
import { compareVersions } from '@shared/compare-versions'
import { isLinux, isWindows } from '@shared/utils'
import { MssqlT } from '../lang'
import {
  resolveWindowsPowerShellPath,
  resolveWindowsSystemExecutable,
  windowsSystemRoot
} from '@shared/WindowsSystemPaths'
import {
  windowsConfigurationManagerPath,
  windowsConfigurationManagerScript,
  windowsElevationScript,
  windowsInstallBody,
  windowsServiceControlBody
} from './windows'
import {
  downloadMssqlFile,
  spawnMssqlCommand,
  windowsLaunchScript,
  windowsMediaDownloadArgs,
  windowsSetupArgs,
  linuxMssqlLayout,
  linuxMssqlLaunch,
  waitForMssqlReady
} from './runtime'
import {
  MSSQL_WINDOWS_INSTALLERS,
  debDownloadUrl,
  isScAccessDenied,
  isStrongSaPassword,
  mssqlMajorOfVersion,
  parseOsRelease,
  parsePackagesIndex,
  parseRegInstanceNames,
  parseRegInstanceSetup,
  parseScQueryEx,
  ubuntuMssqlRepoCandidates,
  windowsInstanceFromSetup,
  windowsInstallerMatchesInstance,
  windowsErrorLogFromParameters,
  windowsServiceName
} from './version'

const MSSQL_STARTUP_CHECK_TIMES = 120
const MSSQL_WINDOWS_SERVICE_WAIT_TIMES = 60
const MSSQL_DEFAULT_PORT = 1433

export type MssqlStartParams = {
  saPassword?: string
  port?: number
}

type MssqlRuntimeManifest = {
  version: string
  majorVersion: string
  edition: string
  packageFile: string
  url?: string
}

const parseNote = (note: any): Record<string, any> => {
  if (!note) return {}
  if (typeof note === 'object') return note
  try {
    return JSON.parse(note)
  } catch {
    return {}
  }
}

class Mssql extends Base {
  baseDir: string = ''
  private operationTails = new Map<string, Promise<unknown>>()
  constructor() {
    super()
    this.type = 'mssql'
  }

  init() {
    this.baseDir = join(global.Server.BaseDir!, 'mssql')
    this.pidPath = join(this.baseDir, 'mssql.pid')
  }

  openConfigurationManager(version: Pick<SoftInstalled, 'version'>) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        if (!isWindows()) throw new Error(MssqlT('configurationManagerWindowsOnly'))
        const consoleFile = windowsConfigurationManagerPath(
          version.version ?? '',
          windowsSystemRoot()
        )
        if (!existsSync(consoleFile) || !(await stat(consoleFile)).isFile()) {
          throw new Error(MssqlT('configurationManagerNotFound', { path: consoleFile }))
        }
        await spawnMssqlCommand(
          resolveWindowsPowerShellPath(),
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            windowsConfigurationManagerScript(
              resolveWindowsSystemExecutable('mmc.exe'),
              consoleFile
            )
          ],
          60000
        )
        resolve(true)
      } catch (error) {
        reject(error)
      }
    })
  }

  private queued<T>(
    item: { bin?: string; version?: string | null },
    work: () => PromiseLike<T>
  ): ForkPromise<T> {
    const key = item.bin || item.version || ''
    return new ForkPromise((resolve, reject, on) => {
      const previous = this.operationTails.get(key) ?? Promise.resolve()
      const running = previous
        .catch(() => undefined)
        .then(() => {
          const result = work() as ForkPromise<T>
          result?.on?.(on)
          return result
        })
      const tail = running.then(
        () => undefined,
        () => undefined
      )
      this.operationTails.set(key, tail)
      void tail.then(() => {
        if (this.operationTails.get(key) === tail) this.operationTails.delete(key)
      })
      running.then(resolve, reject)
    })
  }

  private assertNativeArchitecture() {
    if (arch() !== 'x64') throw new Error(MssqlT('unsupportedArchitecture'))
  }

  _linkVersion(_version: SoftInstalled) {
    return new ForkPromise((resolve) => resolve(true))
  }

  startService(version: SoftInstalled, ...args: any[]) {
    return this.queued(version, () => {
      this.assertNativeArchitecture()
      if (!isWindows()) return super.startService(version, ...args)
      // SCM service discovery only finds installations. A running external
      // service must not be stopped or adopted by the start command.
      return new ForkPromise(async (resolve, reject, on) => {
        try {
          await mkdirp(this.baseDir)
          await this.ensureAppPidDirWritable()
          const result = await this._startWindowsService(version).on(on)
          await this.saveAppPid(result['APP-Service-Start-PID']).catch(() => {})
          resolve(result)
        } catch (error) {
          reject(error)
        }
      })
    })
  }

  stopService(version: SoftInstalled, ...args: any[]) {
    return this.queued(version, () => super.stopService(version, ...args))
  }

  private _linuxBinOf(appDir: string): string {
    return join(appDir, 'opt/mssql/bin/sqlservr')
  }

  private _dataDirOf(version: SoftInstalled): string {
    return join(this.baseDir, `data-${mssqlMajorOfVersion(version?.version ?? '')}`)
  }

  /**
   * Startup/shutdown logs of the spawned foreground sqlservr (Linux). The
   * engine's own errorlog lives under the data directory (see getLogFiles).
   */
  private startupLogFiles(version: SoftInstalled) {
    const versionStr = `${version?.version ?? ''}`.trim().split(' ').join('')
    return [
      {
        name: `${this.type}-${versionStr}-start-out.log`,
        path: join(this.baseDir, `${this.type}-${versionStr}-start-out.log`)
      },
      {
        name: `${this.type}-${versionStr}-start-error.log`,
        path: join(this.baseDir, `${this.type}-${versionStr}-start-error.log`)
      }
    ]
  }

  private async startupDiagnostics(version: SoftInstalled): Promise<string> {
    const messages: string[] = []
    for (const file of this.startupLogFiles(version)) {
      if (!existsSync(file.path)) continue
      try {
        const content = (await readFile(file.path, 'utf-8')).trim()
        if (content) messages.push(content.split('\n').slice(-40).join('\n'))
      } catch {}
    }
    return messages.join('\n')
  }

  /* ------------------------------ online list ------------------------------ */

  private async _windowsOnlineRows(): Promise<OnlineVersionItem[]> {
    const installed = (await this._installedWindows({})).map((row: any) => ({
      version: row.version,
      instanceName: row.instanceName,
      edition: row.mssqlRuntime?.edition
    }))
    return MSSQL_WINDOWS_INSTALLERS.map((item) => {
      const zip = join(global.Server.Cache!, item.fileName)
      return {
        version: `${item.version}-${item.edition.toLowerCase()}`,
        mVersion: item.version,
        name: `SQL Server ${item.version} ${item.edition}`,
        url: item.url,
        appDir: '',
        zip,
        bin: '',
        downloaded: existsSync(zip),
        installed: installed.some((instance) => windowsInstallerMatchesInstance(item, instance)),
        note: JSON.stringify({
          edition: item.edition,
          licenseNote: item.licenseNote,
          installerKind: item.installerKind
        })
      } as unknown as OnlineVersionItem
    })
  }

  private async _linuxOnlineRows(): Promise<OnlineVersionItem[]> {
    this.assertNativeArchitecture()
    const osRelease = await readFile('/etc/os-release', 'utf-8').catch(() => '')
    const repos = ubuntuMssqlRepoCandidates(parseOsRelease(osRelease))
    if (repos.length === 0) {
      throw new Error(MssqlT('distroUnsupported'))
    }
    const rows: OnlineVersionItem[] = []
    const failures: string[] = []
    for (const repo of repos) {
      // Each repository is an independent item: a missing/failed index only
      // drops that major, the other repo still lists its versions.
      let entries
      try {
        const res = await axios({
          url: repo.packagesUrl,
          method: 'get',
          responseType: 'arraybuffer',
          timeout: 30000,
          withCredentials: false,
          httpAgent: new http.Agent({ keepAlive: false }),
          httpsAgent: new https.Agent({ keepAlive: false }),
          proxy: this.getAxiosProxy()
        })
        const text = gunzipSync(Buffer.from(res.data)).toString('utf-8')
        entries = parsePackagesIndex(text)
      } catch (e: any) {
        const message = MssqlT('repoProbeFailed', { error: e?.message ?? `${e}` })
        console.warn(`[mssql] ${message}`)
        failures.push(message)
        continue
      }
      for (const entry of entries) {
        if (entry.packageName !== 'mssql-server') continue
        const appDir = join(global.Server.AppDir!, 'mssql', entry.version)
        const bin = this._linuxBinOf(appDir)
        const zip = join(global.Server.Cache!, `mssql-server-${entry.version}.deb`)
        rows.push({
          version: entry.version,
          mVersion: repo.major,
          name: `SQL Server ${repo.major} Express (${entry.version})`,
          url: debDownloadUrl(repo.repoBase, entry.filename),
          appDir,
          zip,
          bin,
          downloaded: existsSync(zip),
          installed: existsSync(bin),
          note: JSON.stringify({
            major: repo.major,
            edition: 'Express',
            sha256: entry.sha256,
            size: entry.size
          })
        } as unknown as OnlineVersionItem)
      }
    }
    if (!rows.length && failures.length === repos.length) throw new Error(failures.join('\n'))
    rows.sort((a, b) => compareVersions(b.version, a.version))
    return rows
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        this.assertNativeArchitecture()
        if (isWindows()) {
          resolve(await this._windowsOnlineRows())
        } else if (isLinux()) {
          resolve(await this._linuxOnlineRows())
        } else {
          resolve([])
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /* -------------------------------- install -------------------------------- */

  private async _download(row: any, on: (...args: any) => void): Promise<void> {
    if (!existsSync(row.zip)) {
      await downloadMssqlFile(row.zip, () =>
        axios({
          method: 'get',
          url: row.url,
          proxy: this.getAxiosProxy(),
          responseType: 'stream',
          timeout: 120000,
          httpAgent: new http.Agent({ keepAlive: false }),
          httpsAgent: new https.Agent({ keepAlive: false }),
          onDownloadProgress: (progress) => {
            if (progress.total) {
              row.progress = Math.round((progress.loaded * 100) / progress.total)
              on(row)
            }
          }
        })
      )
    }
    row.downloaded = true
    row.progress = 100
    on(row)
  }

  private async _runWindowsProgram(file: string, args: string[], wait: boolean) {
    try {
      await spawnMssqlCommand(
        resolveWindowsPowerShellPath(),
        ['-NoProfile', '-NonInteractive', '-Command', windowsLaunchScript(file, args, wait)],
        wait ? 40 * 60 * 1000 : 60000
      )
    } catch (error: any) {
      if (error?.message === 'SQL Server external command timed out') {
        throw new Error(
          'SQL Server launcher timed out; external process result is unknown. Refresh and check the installer before retrying.'
        )
      }
      throw error
    }
  }

  private async _runWindowsElevated(body: string): Promise<{
    ok: boolean
    installed: boolean
    error?: string
    permissionError?: string
    rebootRequired?: boolean
  }> {
    const dir = join(global.Server.Cache!, 'mssql-operations')
    await mkdirp(dir)
    const resultFile = join(dir, `${randomUUID()}.json`)
    const powershell = resolveWindowsPowerShellPath()
    try {
      const output = await spawnMssqlCommand(powershell, [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        windowsElevationScript(body, resultFile, powershell)
      ])
      const result = JSON.parse(output.trim())
      if (typeof result.ok !== 'boolean' || typeof result.installed !== 'boolean') {
        throw new Error('[MSSQL_OUTCOME_UNKNOWN]')
      }
      return result
    } catch (error: any) {
      if (
        error instanceof SyntaxError ||
        /timed out|without a result|MSSQL_OUTCOME_UNKNOWN/i.test(`${error?.message ?? error}`)
      ) {
        throw new Error(`[MSSQL_OUTCOME_UNKNOWN] ${MssqlT('windowsOperationUnknown')}`)
      }
      throw error
    } finally {
      await remove(resultFile).catch((error) =>
        console.warn('[mssql] operation result cleanup failed', error)
      )
    }
  }

  private async _findMediaFiles(dir: string, match: RegExp, depth = 0): Promise<string[]> {
    const found: string[] = []
    for (const name of await readdir(dir)) {
      const file = join(dir, name)
      const info = await stat(file)
      if (info.isFile() && match.test(name)) found.push(file)
      else if (info.isDirectory() && depth < 4)
        found.push(...(await this._findMediaFiles(file, match, depth + 1)))
    }
    return found
  }

  private async _prepareWindowsMedia(row: any, on: (...args: any) => void): Promise<string> {
    const catalog = MSSQL_WINDOWS_INSTALLERS.find(
      (item) =>
        item.url === row.url && `${item.version}-${item.edition.toLowerCase()}` === row.version
    )
    if (!catalog) throw new Error(MssqlT('mediaInvalid'))
    const root = join(global.Server.Cache!, 'mssql-media', row.version)
    const readyFile = join(root, 'flyenv-media.json')
    if (existsSync(readyFile)) {
      const ready = JSON.parse(await readFile(readyFile, 'utf8'))
      if (
        ready.version === row.version &&
        ready.setup === 'media/setup.exe' &&
        existsSync(join(root, ready.setup))
      ) {
        return join(root, ready.setup)
      }
    }
    await mkdirp(root)
    const download = join(root, 'download')
    await mkdirp(download)
    on({ stage: 'media-download' })
    await this._runWindowsProgram(
      row.zip,
      windowsMediaDownloadArgs(catalog.edition, download),
      true
    )
    const archives = await this._findMediaFiles(
      download,
      catalog.edition === 'Developer' ? /\.iso$/i : /^SQLEXPR.*\.exe$/i
    )
    if (archives.length !== 1) throw new Error(MssqlT('mediaInvalid'))
    const media = join(root, 'media')
    // Only this plugin's cache directory is removed. No installed files/data are touched.
    await remove(media)
    await mkdirp(media)
    on({ stage: 'media-extract' })
    if (catalog.edition === 'Express') {
      // SQLEXPR is a multi-CAB self-extractor. Generic 7zip extracts only the
      // first CAB (AUTORUN.INF); use Microsoft's extraction-only command.
      await this._runWindowsProgram(archives[0], ['/q', `/x:${media}`], true)
    } else {
      await zipUnpack(archives[0], media)
    }
    const setup = join(media, 'setup.exe')
    if (!existsSync(setup)) throw new Error(MssqlT('mediaInvalid'))
    await writeFile(readyFile, JSON.stringify({ version: row.version, setup: 'media/setup.exe' }))
    return setup
  }

  /**
   * Unpack a deb into targetDir. Prefers `dpkg -x`; falls back to `ar x` +
   * `tar -xf data.tar.*` (a deb is an ar archive), which also works on hosts
   * without dpkg.
   */
  private async _unpackDeb(deb: string, targetDir: string) {
    try {
      await execPromiseWithEnv(`dpkg -x "${deb}" "${targetDir}"`)
      return
    } catch {}
    const tmp = join(targetDir, '.deb-unpack-tmp')
    await remove(tmp).catch(() => {})
    await mkdirp(tmp)
    try {
      await execPromiseWithEnv(`ar x "${deb}"`, { cwd: tmp })
      const members = await readdir(tmp)
      const dataTar = members.find((f) => /^data\.tar(\.(gz|xz|zst|bz2|lzma))?$/.test(f))
      if (!dataTar) {
        throw new Error('data.tar.* not found in deb archive')
      }
      await execPromiseWithEnv(`tar -xf "${join(tmp, dataTar)}" -C "${targetDir}"`)
    } catch (e: any) {
      throw new Error(MssqlT('debUnpackFailed', { error: e?.message ?? `${e}` }))
    } finally {
      await remove(tmp).catch(() => {})
    }
  }

  private async _verifyDebChecksum(row: any) {
    const sha256 = parseNote(row?.note)?.sha256
    if (!sha256 || !/^[a-f0-9]{64}$/i.test(sha256)) throw new Error(MssqlT('checksumMissing'))
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(row.zip)) hash.update(chunk)
    const digest = hash.digest('hex')
    if (digest !== sha256) {
      if (row.zip === join(global.Server.Cache!, `mssql-server-${row.version}.deb`)) {
        await remove(row.zip)
      }
      throw new Error(
        MssqlT('debUnpackFailed', { error: `SHA256 mismatch: ${digest} != ${sha256}` })
      )
    }
  }

  async _installSoftHandle(row: any): Promise<void> {
    // Linux-only path (Windows installSoft never unpacks). Extract the deb
    // into appDir and record the runtime manifest used by scans and starts.
    await this._verifyDebChecksum(row)
    const dir = row.appDir
    await mkdirp(dir)
    await this._unpackDeb(row.zip, dir)
    const bin = this._linuxBinOf(dir)
    if (!existsSync(bin)) {
      throw new Error(MssqlT('debContentInvalid'))
    }
    await chmod(bin, '0755')
    const note = parseNote(row?.note)
    const manifest: MssqlRuntimeManifest = {
      version: row.version,
      majorVersion: row.mVersion ?? mssqlMajorOfVersion(row.version),
      edition: note?.edition ?? 'Express',
      packageFile: basename(row.zip),
      url: row.url
    }
    await writeFile(join(dir, 'flyenv-runtime.json'), JSON.stringify(manifest, null, 2))
  }

  private _ownedInstallDir(row: any): string {
    const version = `${row?.version ?? ''}`
    const expected = join(global.Server.AppDir!, 'mssql', version)
    if (
      !/^\d[\w.-]*$/.test(version) ||
      row.appDir !== expected ||
      row.bin !== this._linuxBinOf(expected)
    ) {
      throw new Error(MssqlT('ownedInstallRequired'))
    }
    return expected
  }

  installSoft(row: any) {
    const request = JSON.parse(JSON.stringify(row))
    return this.queued(
      request,
      () =>
        new ForkPromise(async (resolve, reject, on) => {
          let staging = ''
          try {
            this.assertNativeArchitecture()
            if (totalmem() < 2 * 1024 ** 3) throw new Error(MssqlT('memoryNotice'))
            on({
              'APP-On-Log': AppLog(
                'info',
                I18nT('appLog.startInstall', { service: request.name ?? '' })
              )
            })
            if (isWindows()) {
              await this._download(request, on)
              const setup = await this._prepareWindowsMedia(request, on)
              on({ stage: 'setup-launch' })
              const service = windowsServiceName(`FLYENV${request.version.split('-')[0]}`)
              const result = await this._runWindowsElevated(
                windowsInstallBody(
                  setup,
                  windowsSetupArgs(request.version, global.Server.AppDir!, global.Server.BaseDir!),
                  service,
                  windowsGrantAccessBody(service, global.Server.AppDir!, global.Server.BaseDir!)
                )
              )
              if (!result.ok && !result.installed) {
                throw new Error(result.error || MssqlT('operationFailed'))
              }
              resolve({
                installed: true,
                installError: !result.ok
                  ? MssqlT('windowsInstallHandoffFailed', { error: result.error ?? '' })
                  : result.rebootRequired
                    ? MssqlT('windowsRestartRequired')
                    : undefined
              })
              return
            }
            if (!isLinux()) throw new Error(MssqlT('distroUnsupported'))
            const dir = this._ownedInstallDir(request)
            if (existsSync(dir)) {
              // Never erase an existing installation based on a stale renderer row.
              throw new Error(MssqlT('installDirectoryExists'))
            }
            await this._download(request, on)
            await mkdirp(dirname(dir))
            staging = join(dirname(dir), `.install-${randomUUID()}`)
            await this._installSoftHandle({ ...request, appDir: staging })
            await rename(staging, dir)
            staging = ''
            on({ ...request, installed: true, downState: 'success', progress: 100 })
            resolve(true)
          } catch (error) {
            if (staging)
              await remove(staging).catch((cleanupError) =>
                console.warn('[mssql] staging cleanup failed', cleanupError)
              )
            reject(error)
          }
        })
    )
  }

  uninstallSoft(row: any) {
    const request = JSON.parse(JSON.stringify(row))
    return this.queued(
      request,
      () =>
        new ForkPromise(async (resolve, reject, on) => {
          try {
            this.assertNativeArchitecture()
            if (!isLinux()) throw new Error(MssqlT('ownedInstallRequired'))
            const dir = this._ownedInstallDir(request)
            const manifest = JSON.parse(await readFile(join(dir, 'flyenv-runtime.json'), 'utf8'))
            if (manifest.version !== request.version)
              throw new Error(MssqlT('ownedInstallRequired'))
            // Fork admission serializes deletion with starts and the existing stop
            // owner proves the process tree is gone before its files are removed.
            await this._stopServer({ ...request, path: dir }).on(on)
            await remove(dir)
            resolve(true)
          } catch (error) {
            reject(error)
          }
        })
    )
  }

  /* ---------------------------- installed versions --------------------------- */

  private async _installedWindows(setup: any): Promise<SoftInstalled[]> {
    const found: SoftInstalled[] = []
    let instanceNames: ReturnType<typeof parseRegInstanceNames> = []
    try {
      const res = await execPromiseWithEnv(
        'reg query "HKLM\\SOFTWARE\\Microsoft\\Microsoft SQL Server\\Instance Names\\SQL"',
        { windowsHide: true }
      )
      instanceNames = parseRegInstanceNames(res.stdout)
    } catch (error: any) {
      const output = `${error?.stdout ?? ''} ${error?.stderr ?? ''} ${error?.message ?? error}`
      if (!/unable to find|cannot find|找不到|无法找到/i.test(output)) throw error
    }
    for (const inst of instanceNames) {
      // A broken instance entry must not abort the whole scan: skip it with a
      // log line and continue with the remaining instances.
      try {
        const res = await execPromiseWithEnv(
          `reg query "HKLM\\SOFTWARE\\Microsoft\\Microsoft SQL Server\\${inst.instanceId}\\Setup"`,
          { windowsHide: true }
        )
        const parsed = parseRegInstanceSetup(res.stdout)
        const scanned = windowsInstanceFromSetup(inst, parsed, existsSync)
        if (!scanned) {
          console.warn(
            `[mssql] ${MssqlT('instanceScanItemSkipped', { instance: inst.name, error: 'missing Version or sqlservr.exe' })}`
          )
          continue
        }
        const logFiles = await this.listLogFiles({
          version: scanned.version,
          instanceId: scanned.instanceId,
          mssqlRuntime: { sqlDataRoot: scanned.sqlDataRoot }
        } as unknown as SoftInstalled)
        const num = Number(versionFixed(scanned.version).split('.').slice(0, 2).join(''))
        found.push({
          typeFlag: this.type,
          version: scanned.version,
          bin: scanned.bin,
          path: dirname(dirname(parsed.sqlBinRoot)),
          num,
          enable: true,
          run: false,
          running: false,
          instanceName: scanned.name,
          instanceId: scanned.instanceId,
          serviceName: scanned.serviceName,
          mssqlRuntime: {
            edition: scanned.edition,
            instanceName: scanned.name,
            instanceId: scanned.instanceId,
            sqlDataRoot: scanned.sqlDataRoot,
            errorLogFile: logFiles.find((file) => file.name === 'errorlog')?.path ?? ''
          }
        } as unknown as SoftInstalled)
      } catch (e: any) {
        console.warn(
          `[mssql] ${MssqlT('instanceScanItemSkipped', { instance: inst.name, error: e?.message ?? `${e}` })}`
        )
        continue
      }
    }
    // Merge user-configured custom directories (setup.mssql.dirs).
    try {
      const local = await versionLocalFetch(setup?.mssql?.dirs ?? [], 'sqlservr.exe')
      for (const item of local) {
        if (!found.some((f) => f.bin === item.bin)) {
          found.push(item)
        }
      }
    } catch (e) {
      console.warn('[mssql] custom dir scan failed', e)
    }
    return found
  }

  private async _installedLinux(): Promise<SoftInstalled[]> {
    const found: SoftInstalled[] = []
    const root = join(global.Server.AppDir!, 'mssql')
    if (!existsSync(root)) return found
    const dirs = await readdir(root).catch(() => [] as string[])
    for (const dir of dirs) {
      if (dir.startsWith('.')) continue
      const path = join(root, dir)
      const manifestFile = join(path, 'flyenv-runtime.json')
      if (!existsSync(manifestFile)) continue
      try {
        const manifest = JSON.parse(await readFile(manifestFile, 'utf-8')) as MssqlRuntimeManifest
        const bin = this._linuxBinOf(path)
        if (!existsSync(bin)) continue
        const version = manifest.version ?? dir
        found.push({
          typeFlag: this.type,
          version,
          bin,
          path,
          num: version ? Number(versionFixed(version).split('.').slice(0, 2).join('')) : null,
          enable: true,
          run: false,
          running: false,
          mssqlRuntime: {
            edition: manifest.edition ?? 'Express',
            majorVersion: manifest.majorVersion ?? mssqlMajorOfVersion(version)
          }
        } as unknown as SoftInstalled)
      } catch (e: any) {
        console.warn(
          `[mssql] ${MssqlT('manifestInvalid', { dir: path, error: e?.message ?? `${e}` })}`
        )
        continue
      }
    }
    return found
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise(async (resolve, reject) => {
      // versionLocalFetch caches directory listings in the module-level
      // versionDirCache. Without clearing it, versions installed after an
      // earlier scan stay invisible until the fork process restarts (the
      // built-in Version module clears it the same way on every call).
      for (const k in versionDirCache) {
        delete versionDirCache[k]
      }
      try {
        let versions: SoftInstalled[] = []
        if (isWindows()) {
          versions = await this._installedWindows(setup)
        } else if (isLinux()) {
          versions = await this._installedLinux()
        }
        resolve(versionSort(versionFilterSame(versions)))
      } catch (error) {
        reject(error)
      }
    })
  }

  /* ------------------------------ start / stop ------------------------------ */

  protected _stopSearchName(): string | undefined {
    return 'sqlservr'
  }

  protected _stopSignal(): string {
    return '-TERM'
  }

  private async _scQuery(service: string): Promise<{ state: string; pid: number }> {
    const res = await execPromiseWithEnv(`sc.exe queryex "${service}"`, { windowsHide: true })
    return parseScQueryEx(res.stdout)
  }

  private _serviceNameOf(version: any): string {
    return `${version?.serviceName ?? windowsServiceName(version?.instanceName ?? '')}`
  }

  private async _scControl(version: SoftInstalled, action: 'start' | 'stop'): Promise<string> {
    const service = this._serviceNameOf(version)
    if (!service) {
      throw new Error(MssqlT('serviceNameUnknown'))
    }
    try {
      return (await execPromiseWithEnv(`sc.exe ${action} "${service}"`, { windowsHide: true }))
        .stdout
    } catch (e: any) {
      const output = `${e?.stdout ?? ''}\n${e?.stderr ?? ''}\n${e?.message ?? e}`
      if (isScAccessDenied(output)) {
        try {
          const result = await this._runWindowsElevated(
            windowsServiceControlBody(
              service,
              action,
              `${version.pid ?? ''}`,
              canRepairWindowsPermissions(version as any)
                ? windowsGrantAccessBody(service, global.Server.AppDir!, global.Server.BaseDir!)
                : ''
            )
          )
          if (!result.ok) throw new Error(result.error || MssqlT('operationFailed'))
          if (result.permissionError)
            console.warn(
              '[mssql] service controlled; access repair incomplete',
              result.permissionError
            )
          return ''
        } catch (error: any) {
          throw new Error(
            MssqlT(action === 'start' ? 'windowsServiceStartFailed' : 'windowsServiceStopFailed', {
              service,
              error: error?.message ?? `${error}`
            })
          )
        }
      }
      throw new Error(
        action === 'start'
          ? MssqlT('windowsServiceStartFailed', { service, error: output.trim() })
          : MssqlT('windowsServiceStopFailed', { service, error: output.trim() })
      )
    }
  }

  private async _waitWindowsServiceState(
    service: string,
    wanted: 'RUNNING' | 'STOPPED'
  ): Promise<{ state: string; pid: number }> {
    for (let time = 0; time < MSSQL_WINDOWS_SERVICE_WAIT_TIMES; time++) {
      const { state, pid } = await this._scQuery(service)
      if (!state) throw new Error(MssqlT('windowsServiceUnknown'))
      if (state === wanted) return { state, pid }
      await waitTime(1000)
    }
    throw new Error(MssqlT('windowsServiceTimeout', { service, state: wanted }))
  }

  private _startWindowsService(version: SoftInstalled) {
    return new ForkPromise<{ 'APP-Service-Start-PID': string }>(async (resolve, reject, on) => {
      const service = this._serviceNameOf(version)
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })
      try {
        const current = await this._scQuery(service)
        if (!current.state) throw new Error(MssqlT('windowsServiceUnknown'))
        if (current.state !== 'STOPPED') throw new Error(MssqlT('windowsServiceAlreadyRunning'))
        await this._scControl(version, 'start')
        const { pid } = await this._waitWindowsServiceState(service, 'RUNNING')
        if (!pid) throw new Error(MssqlT('windowsServiceUnknown'))

        on({ 'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: `${pid}` })) })
        resolve({ 'APP-Service-Start-PID': `${pid || '-1'}` })
      } catch (e) {
        reject(e)
      }
    })
  }

  private _stopWindowsService(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      const service = this._serviceNameOf(version)
      on({ 'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceBegin', { service: this.type })) })
      try {
        if (!service) throw new Error(MssqlT('serviceNameUnknown'))
        const pid = `${version.pid ?? ''}`
        if (!/^[1-9]\d*$/.test(pid)) {
          resolve({ 'APP-Service-Stop-PID': [] })
          return
        }
        const current = await this._scQuery(service)
        if (!current.state) throw new Error(MssqlT('windowsServiceUnknown'))
        if (current.state !== 'STOPPED') {
          if (`${current.pid}` !== pid) throw new Error(MssqlT('windowsServiceNotOwned'))
          if (current.state !== 'STOP_PENDING') await this._scControl(version, 'stop')
          await this._waitWindowsServiceState(service, 'STOPPED')
        }
        on({ 'APP-Service-Stop-Success': true })
        on({ 'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceEnd', { service: this.type })) })
        resolve({ 'APP-Service-Stop-PID': pid ? [pid] : [] })
      } catch (e) {
        reject(e)
      }
    })
  }

  _startServer(version: SoftInstalled, params?: MssqlStartParams) {
    if (isWindows()) {
      return this._startWindowsService(version)
    }
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })
      if (!existsSync(version?.bin)) {
        reject(new Error(I18nT('fork.binNotFound')))
        return
      }
      const dataDir = this._dataDirOf(version)
      const layout = linuxMssqlLayout(dataDir)
      let runtime: MssqlRuntimeManifest
      try {
        this.assertNativeArchitecture()
        if (!existsSync('/usr/bin/bwrap')) throw new Error(MssqlT('bubblewrapRequired'))
        if (totalmem() < 2 * 1024 ** 3) throw new Error(MssqlT('memoryNotice'))
        runtime = JSON.parse(await readFile(join(version.path, 'flyenv-runtime.json'), 'utf8'))
        if (runtime.version !== version.version) throw new Error(MssqlT('ownedInstallRequired'))
        const port = Number(params?.port ?? MSSQL_DEFAULT_PORT)
        if (!Number.isInteger(port) || port < 1 || port > 65535)
          throw new Error(MssqlT('invalidPort'))
        if (
          !existsSync(layout.masterDataFile) &&
          (!params?.saPassword || !isStrongSaPassword(params.saPassword))
        )
          throw new Error(MssqlT('saPasswordRequired'))
        for (const dir of [
          layout.root,
          layout.dataDir,
          layout.logDir,
          layout.backupDir,
          layout.systemDir
        ])
          await mkdirp(dir)
        for (const file of this.startupLogFiles(version)) await writeFile(file.path, '')
      } catch (error) {
        reject(error)
        return
      }
      const launch = linuxMssqlLaunch(
        version.bin,
        layout,
        Number(params?.port ?? MSSQL_DEFAULT_PORT),
        runtime.edition
      )
      const execEnv = launch.env
      if (params?.saPassword) execEnv.MSSQL_SA_PASSWORD = params.saPassword
      // Read readiness from the fresh launch output, preserving historical engine logs.

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
      try {
        const started = await serviceStartSpawn({
          version,
          pidPath: this.pidPath,
          baseDir: this.baseDir,
          bin: launch.bin,
          execArgs: launch.args,
          execEnv,
          cwd: dataDir,
          outFile: this.startupLogFiles(version)[0].path,
          errFile: this.startupLogFiles(version)[1].path,
          on,
          waitTime: 5000,
          // The env carries the sa password on first init; keep it out of the
          // startup diagnostic log.
          sensitive: true
        })
        launcherPid = started['APP-Service-Start-PID']
      } catch (error) {
        await failStart(error)
        return
      }
      const isAlive = () => {
        const pid = Number(launcherPid)
        if (!Number.isSafeInteger(pid) || pid <= 0) return false
        try {
          process.kill(pid, 0)
          return true
        } catch (error: any) {
          return error?.code === 'EPERM'
        }
      }
      try {
        await waitForMssqlReady({
          alive: isAlive,
          ready: async () => {
            const output = await readFile(this.startupLogFiles(version)[0].path, 'utf8').catch(
              () => ''
            )
            return /SQL Server is now ready for client connections/i.test(output)
          },
          wait: () => waitTime(500),
          attempts: MSSQL_STARTUP_CHECK_TIMES
        })
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: launcherPid }))
        })
        resolve({ 'APP-Service-Start-PID': launcherPid })
      } catch (error) {
        try {
          await super._stopServer({ ...version, pid: launcherPid }).on(on)
        } catch (cleanupError: any) {
          await failStart(new Error(`${error}\n${cleanupError?.message ?? cleanupError}`))
          return
        }
        await failStart(error)
      }
    })
  }

  _stopServer(version: SoftInstalled): ForkPromise<any> {
    if (isWindows()) {
      return this._stopWindowsService(version)
    }
    return super._stopServer(version)
  }

  /* ------------------------------ files ------------------------------ */

  getConfigFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    return []
  }

  getLogFiles(version?: SoftInstalled): Array<{ name: string; path: string }> {
    if (!version?.version) return []
    if (isWindows()) {
      const runtime = (version as any).mssqlRuntime
      const path =
        runtime?.errorLogFile ||
        (runtime?.sqlDataRoot ? win32.join(runtime.sqlDataRoot, 'Log', 'ERRORLOG') : '')
      return path ? [{ name: 'errorlog', path }] : []
    }
    const dataDir = this._dataDirOf(version)
    return [
      { name: 'errorlog', path: join(dataDir, 'log', 'errorlog') },
      ...this.startupLogFiles(version)
    ]
  }

  checkServicePermissions(version: SoftInstalled): ForkPromise<boolean> {
    return new ForkPromise<boolean>(async (resolve) => {
      if (!isWindows() || !canRepairWindowsPermissions(version as any)) {
        throw new Error(MssqlT('ownedInstallRequired'))
      }
      const output = await spawnMssqlCommand(
        resolveWindowsPowerShellPath(),
        [
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
          Buffer.from(
            windowsServiceAccessCheckScript(this._serviceNameOf(version)),
            'utf16le'
          ).toString('base64')
        ],
        60_000
      )
      const result = output.trim()
      if (!['true', 'false'].includes(result)) throw new Error(MssqlT('operationFailed'))
      resolve(result === 'true')
    })
  }

  repairPermissions(version: SoftInstalled): ForkPromise<boolean> {
    const request = JSON.parse(JSON.stringify(version))
    return this.queued(
      request,
      () =>
        new ForkPromise(async (resolve) => {
          if (!isWindows() || !canRepairWindowsPermissions(request)) {
            throw new Error(MssqlT('ownedInstallRequired'))
          }
          const result = await this._runWindowsElevated(
            windowsGrantAccessBody(
              this._serviceNameOf(request),
              global.Server.AppDir!,
              global.Server.BaseDir!
            )
          )
          if (!result.ok) throw new Error(result.error || MssqlT('operationFailed'))
          resolve(true)
        })
    )
  }

  readLogFile(version: SoftInstalled): ForkPromise<string> {
    return new ForkPromise(async (resolve) => {
      const file = this.getLogFiles(version).find((file) => file.name === 'errorlog')
      if (!file?.path) throw new Error(I18nT('base.logFileNotFound'))
      try {
        resolve(decodeTextFile(await readFile(file.path)))
      } catch (error: any) {
        if (isWindows() && ['EPERM', 'EACCES'].includes(error?.code)) {
          throw new Error(
            `[MSSQL_PERMISSION_REQUIRED] ${MssqlT('logAccessDenied', { path: file.path })}`
          )
        }
        throw error
      }
    })
  }

  listLogFiles(
    version?: SoftInstalled
  ): ForkPromise<Array<{ name: string; path: string; exists: boolean }>> {
    if (!isWindows()) return super.listLogFiles(version)
    return new ForkPromise(async (resolve) => {
      const files = this.getLogFiles(version)
      const instanceId = (version as any)?.instanceId ?? (version as any)?.mssqlRuntime?.instanceId
      if (instanceId && /^[^"\\/\r\n]+$/.test(instanceId)) {
        try {
          const result = await execPromiseWithEnv(
            `reg query "HKLM\\SOFTWARE\\Microsoft\\Microsoft SQL Server\\${instanceId}\\MSSQLServer\\Parameters" /reg:64`,
            { windowsHide: true }
          )
          const path = windowsErrorLogFromParameters(result.stdout)
          if (path) {
            const existing = files.find((file) => file.name === 'errorlog')
            if (existing) existing.path = path
            else files.unshift({ name: 'errorlog', path })
          }
        } catch (error) {
          console.warn('[mssql] error log startup parameter lookup failed', error)
        }
      }
      resolve(files.map((file) => ({ ...file, exists: existsSync(file.path) })))
    })
  }
}
export default new Mssql()
