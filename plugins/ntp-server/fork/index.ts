import axios from 'axios'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Base } from '@fork/module/Base'
import { OnlineVersionFetchBase } from '@fork/util/OnlineVersionFetch/base'
import { serviceStartSpawn } from '@fork/util/ServiceStart'
import { versionCheckBin } from '@fork/util/Version'
import { zipUnpack } from '@fork/util/Zip'
import { AppI18n } from '@lang/runtime'
import { ForkPromise } from '@shared/ForkPromise'
import type { SoftInstalled } from '@shared/app'
import { compareVersions } from '@shared/compare-versions'
import {
  configName,
  defaultSettings,
  errorLogName,
  ntpModuleId,
  parseConfig,
  serviceLogName,
  settingsFromConfig,
  updateConfig
} from '../config'
import type { ConfigSnapshot } from '../config'
import { createT } from '../lang'
import {
  releaseAssetUrl,
  releaseRepo,
  releaseTarget,
  selectRelease,
  versionPattern
} from './release'
import type { NtpRelease } from './release'

const t = createT(() => AppI18n?.()?.global?.locale ?? 'en')
const missingFile = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT'
const target = releaseTarget(process.platform, process.arch)

class NtpServer extends Base {
  private installing = new Set<string>()
  private releases: NtpRelease[] = []
  private releaseRequest?: Promise<NtpRelease[]>

  constructor() {
    super()
    this.type = ntpModuleId
  }

  private get dataDir() {
    return join(global.Server.BaseDir!, ntpModuleId)
  }

  private get configPath() {
    return join(this.dataDir, configName)
  }

  private get appDir() {
    return join(global.Server.AppDir!, ntpModuleId)
  }

  private versionPaths(version: string, host: NonNullable<typeof target>) {
    const appDir = join(this.appDir, version)
    return { appDir, bin: join(appDir, host.executable) }
  }

  private releaseRow(release: NtpRelease, host: NonNullable<typeof target>) {
    const paths = this.versionPaths(release.version, host)
    const zip = join(global.Server.Cache!, `${release.version}-${host.archive}`)
    return {
      ...release,
      ...paths,
      ...host,
      zip,
      mVersion: release.version.split('.').slice(0, 2).join('.'),
      typeFlag: ntpModuleId,
      name: `NTP Server ${release.version}`,
      downloaded: existsSync(zip),
      installed: !!versionCheckBin(paths.bin)
    }
  }

  private async fetchReleases() {
    if (!target) return []
    if (this.releaseRequest) return this.releaseRequest
    const host = target
    const verified = new Map<string, NtpRelease>()
    this.releaseRequest = new OnlineVersionFetchBase()
      .fetchFromGitHubReleases(
        releaseRepo,
        (release) => {
          const asset = selectRelease(release, host)
          if (!asset) return ''
          verified.set(asset.url, asset)
          return asset.version
        },
        3,
        (release) => releaseAssetUrl(release.tag_name, host),
        ''
      )
      .then((rows) => {
        this.releases = rows.flatMap((row) => {
          const release = verified.get(row.url)
          return release ? [release] : []
        })
        return this.releases
      })
      .finally(() => {
        this.releaseRequest = undefined
      })
    return this.releaseRequest
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      if (!target) return resolve([])
      const host = target
      const releases = await this.fetchReleases()
      resolve(releases.map((release) => this.releaseRow(release, host)))
    })
  }

  private installedVersion(version: unknown) {
    if (!target || typeof version !== 'string' || !versionPattern.test(version)) return
    const paths = this.versionPaths(version, target)
    if (!versionCheckBin(paths.bin)) return
    return { ...paths, version, path: paths.appDir, enable: true }
  }

  private async installedVersions() {
    if (!target) return []
    const dirs = await readdir(this.appDir, { withFileTypes: true }).catch((error: unknown) => {
      if (missingFile(error)) return []
      throw error
    })
    return dirs
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const installed = this.installedVersion(entry.name)
        return installed ? [installed] : []
      })
      .sort((a, b) => compareVersions(b.version, a.version))
  }

  allInstalledVersions(_setup: unknown) {
    return new ForkPromise(async (resolve) => resolve(await this.installedVersions()))
  }

  installSoft(request?: { version?: unknown }) {
    return new ForkPromise<boolean>(async (resolve, reject, on) => {
      const version = request?.version
      let locked = false
      let row: ReturnType<NtpServer['releaseRow']> | undefined
      try {
        if (!target) throw new Error(t('unsupportedPlatform'))
        if (typeof version !== 'string' || !versionPattern.test(version)) {
          throw new Error(t('releaseUnavailable'))
        }
        if (this.installedVersion(version)) return resolve(true)
        if (this.installing.has(version)) throw new Error(t('installInProgress'))
        this.installing.add(version)
        locked = true
        const release =
          this.releases.find((item) => item.version === version) ??
          (await this.fetchReleases()).find((item) => item.version === version)
        if (!release) throw new Error(t('releaseUnavailable'))
        const selected = this.releaseRow(release, target)
        row = selected
        await this.installRelease(selected, (progress) => on({ ...selected, progress }))
        on({ ...selected, installed: true, downloaded: true, progress: 100, downState: 'success' })
        resolve(true)
      } catch (error) {
        on({
          ...row,
          ...(row ? { downloaded: existsSync(row.zip) } : {}),
          downing: false,
          downState: 'exception'
        })
        reject(error)
      } finally {
        if (locked && typeof version === 'string') this.installing.delete(version)
      }
    })
  }

  private async installRelease(
    row: NonNullable<ReturnType<NtpServer['releaseRow']>>,
    progress: (percent: number) => void
  ) {
    const verify = (archive: Buffer) =>
      createHash('sha256').update(archive).digest('hex') === row.sha256
    let archive: Buffer | undefined = await readFile(row.zip).catch((error: unknown) => {
      if (!missingFile(error)) throw error
      return undefined
    })
    if (!archive || !verify(archive)) {
      const response = await axios.get<Buffer>(row.url, {
        responseType: 'arraybuffer',
        timeout: 120_000,
        maxContentLength: 32 * 1024 * 1024,
        proxy: this.getAxiosProxy(),
        onDownloadProgress: ({ total, loaded }) => {
          if (total) progress(Math.min(99, Math.round((loaded / total) * 100)))
        }
      })
      archive = response.data
      if (!verify(archive)) throw new Error(t('checksumMismatch'))
    }
    await mkdir(dirname(row.appDir), { recursive: true })
    const stage = await mkdtemp(join(dirname(row.appDir), '.install-'))
    try {
      const zip = join(stage, row.archive)
      const payload = join(stage, 'payload')
      await writeFile(zip, archive)
      await mkdir(payload)
      await zipUnpack(zip, payload)
      const bin = join(payload, row.executable)
      if (!existsSync(bin) || !(await stat(bin)).isFile()) throw new Error(t('binaryMissing'))
      if (process.platform !== 'win32') await chmod(bin, 0o755)
      await mkdir(dirname(row.zip), { recursive: true })
      await writeFile(row.zip, archive)
      // An interrupted or removed version can leave its directory empty.
      await rename(payload, row.appDir)
    } finally {
      await rm(stage, { recursive: true, force: true }).catch((error) => console.warn(error))
    }
  }

  getSettings() {
    return new ForkPromise<ConfigSnapshot>(async (resolve) => {
      const content = await readFile(this.configPath, 'utf8')
      resolve({
        settings: settingsFromConfig(parseConfig(content)),
        path: this.configPath,
        exists: true
      })
    })
  }

  initConfig() {
    return new ForkPromise<string>(async (resolve) => {
      if (!existsSync(this.configPath)) {
        await mkdir(this.dataDir, { recursive: true })
        const stage = await mkdtemp(join(this.dataDir, '.config-'))
        try {
          const file = join(stage, configName)
          const config = updateConfig({}, defaultSettings())
          await writeFile(file, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
          // Initialization can race a service start or another open config page.
          await link(file, this.configPath).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== 'EEXIST') throw error
          })
        } finally {
          await rm(stage, { recursive: true, force: true }).catch((error) => console.warn(error))
        }
      }
      resolve(this.configPath)
    })
  }

  getConfigFiles() {
    return [{ name: configName, path: this.configPath }]
  }

  getLogFiles() {
    return [serviceLogName, errorLogName].map((name) => ({ name, path: join(this.dataDir, name) }))
  }

  _linkVersion() {
    return new ForkPromise<boolean>((resolve) => resolve(true))
  }

  protected _stopSearchName() {
    return ntpModuleId
  }

  protected ownedProcessMarkers() {
    return [this.configPath]
  }

  protected windowsServiceTargets(version: SoftInstalled) {
    return super.windowsServiceTargets(version, [this.configPath], ({ COMMAND }) =>
      COMMAND.toLowerCase().includes(this.configPath.toLowerCase())
    )
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      const installed = this.installedVersion(version.version)
      if (!installed || version.bin !== installed.bin) throw new Error(t('binaryMissing'))
      await this.initConfig()
      const outFile = join(this.dataDir, serviceLogName)
      const offset = await stat(outFile).then(
        ({ size }) => size,
        (error: unknown) => {
          if (!missingFile(error)) throw error
          return 0
        }
      )
      try {
        resolve(
          await serviceStartSpawn({
            version,
            baseDir: this.dataDir,
            bin: installed.bin,
            execArgs: ['-config', this.configPath],
            outFile,
            errFile: join(this.dataDir, errorLogName),
            on
          })
        )
      } catch (error) {
        const output = await this.startupOutput(outFile, offset).catch(() => '')
        const message = error instanceof Error ? error.message : String(error)
        reject(output ? new Error(`${message}\n${output}`) : error)
      }
    })
  }

  private async startupOutput(file: string, offset: number) {
    const handle = await open(file, 'r')
    try {
      const buffer = Buffer.alloc(8192)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset)
      return buffer.subarray(0, bytesRead).toString('utf8').trim()
    } finally {
      await handle.close()
    }
  }
}

export default new NtpServer()
