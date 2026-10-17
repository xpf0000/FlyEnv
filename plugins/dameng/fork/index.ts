import { Base } from '@fork/module/Base'
import type { SoftInstalled } from '@shared/app'
import { ForkPromise } from '@shared/ForkPromise'
import { serviceStartSpawn } from '@fork/util/ServiceStart'
import { StopProcessListFetch } from '@shared/StopProcessList'
import { ProcessListFetch, ProcessListByExactPid, type PItem } from '@shared/Process'
import { currentServiceStopContext, withServiceStopContext } from '@shared/ServiceStopContext'
import { existsSync, readFileSync, readdirSync, constants as fsConstants } from 'node:fs'
import {
  access,
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  statfs,
  writeFile
} from 'node:fs/promises'
import { join, dirname, resolve, isAbsolute, sep } from 'node:path'
import { arch, freemem } from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import axios from 'axios'
import { DAMENG_PACKAGES, packageById, type DamengPackage } from './catalog'
import {
  assertPlatform,
  assertVendorPath,
  assertDataPath,
  registeredProgramPaths,
  credential,
  dminitControl,
  disqlInput,
  installerXml,
  parseIni,
  validateInit
} from './policy'
import {
  downloadPackage,
  extractPinnedIso,
  readJson,
  runCommand,
  withOperationLock,
  writeJsonAtomic
} from './runtime'
import { linuxInstall, linuxUninstall } from './linux'
import {
  windowsInstall,
  windowsRegisterService,
  windowsServiceStatus,
  windowsStartService,
  windowsStopService,
  windowsUninstall
} from './windows'
import type { DamengInitParams, DamengInstanceInfo, DamengRuntime } from '../shared'

type Manifest = {
  schema: 1
  owner: 'flyenv-dameng'
  installId: string
  version: string
  isoSha256: string
  programDir: string
  dataDir: string
  instance: string
  phase:
    'installing' | 'installed' | 'initializing' | 'initialized' | 'uninstalling' | 'uninstalled'
  port: number
  warning?: string
  requiresInspection?: string
  initializationCompleted?: boolean
  active?: { pid: string; created?: string }
}
type Installed = SoftInstalled & { damengRuntime: DamengRuntime }
type Request = {
  id?: string
  version?: string | null
  bin?: string
  damengRuntime?: Partial<DamengRuntime>
}
const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))
const authenticationError = () =>
  new Error(
    'DM authentication failed for SYSDBA. Enter the current SYSDBA password in Settings (the password set during initialization, unless changed).'
  )
const nativeArchitecture = () =>
  process.platform === 'win32'
    ? (
        process.env.PROCESSOR_ARCHITEW6432 ||
        process.env.PROCESSOR_ARCHITECTURE ||
        arch()
      ).toLowerCase()
    : arch()
const commandHasPath = (command: string, path: string) => {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `(?:^|[\\s"'=])${escaped}(?=$|[\\s"'])`,
    process.platform === 'win32' ? 'i' : ''
  ).test(command)
}

class Dameng extends Base {
  private approvedStopPid?: string
  constructor() {
    super()
    this.type = 'dameng'
  }
  private get root() {
    return join(global.Server.BaseDir!, 'dameng')
  }
  private recordFile(item: DamengPackage) {
    return join(this.root, 'installations', `${item.id}.json`)
  }
  private paths(item: DamengPackage, selectedDirectory?: string) {
    let programDir = selectedDirectory ?? join(global.Server.AppDir!, 'dameng', item.id)
    if (!selectedDirectory) {
      try {
        const record = JSON.parse(readFileSync(this.recordFile(item), 'utf8')) as Manifest
        if (
          record.schema !== 1 ||
          record.owner !== 'flyenv-dameng' ||
          record.installId !== item.id ||
          record.version !== item.version ||
          record.isoSha256 !== item.isoSha256 ||
          typeof record.programDir !== 'string' ||
          !isAbsolute(record.programDir) ||
          record.programDir !== resolve(record.programDir)
        )
          throw new Error('Invalid DM installation location record; files left untouched.')
        programDir = record.programDir
      } catch (error: any) {
        if (error.code !== 'ENOENT') throw error
      }
    }
    const dataDir = join(this.root, 'instances', item.id)
    const instance = `FLYENV${createHash('sha256').update(item.id).digest('hex').slice(0, 8).toUpperCase()}`
    return {
      programDir,
      dataDir,
      instance,
      serviceName: `DmService${instance}`,
      manifest: this.recordFile(item),
      bin: join(programDir, 'bin', process.platform === 'win32' ? 'dmsvc.exe' : 'dmserver'),
      engine: join(programDir, 'bin', process.platform === 'win32' ? 'dmserver.exe' : 'dmserver'),
      ini: join(dataDir, 'DAMENG', 'dm.ini'),
      pid: join(this.root, 'pids', `${item.id}.pid`),
      startOut: join(this.root, 'logs', `${item.id}.log`),
      startErr: join(this.root, 'logs', `${item.id}_error.log`),
      zip: join(global.Server.Cache!, `dameng_${item.id}.zip`)
    }
  }
  init() {
    this.pidPath = join(this.root, 'dameng.pid')
  }
  private async platform() {
    assertPlatform(
      process.platform,
      arch(),
      process.platform === 'linux' ? await readFile('/etc/os-release', 'utf8') : '',
      nativeArchitecture()
    )
  }
  private selected(input: Request): DamengPackage {
    const id = input?.id ?? input?.damengRuntime?.installId
    const item = id
      ? packageById(id)
      : DAMENG_PACKAGES.find((entry) => entry.version === input?.version)
    if (!item || item.platform !== process.platform)
      throw new Error('DM package does not match this platform.')
    if (input.bin && resolve(input.bin) !== resolve(this.paths(item).bin))
      throw new Error('DM executable identity does not match the owned installation.')
    return item
  }
  private async noSymlink(path: string) {
    for (let current = resolve(path); ; current = dirname(current)) {
      try {
        if ((await lstat(current)).isSymbolicLink())
          throw new Error(`DM managed path cannot be a symbolic link: ${current}`)
      } catch (error: any) {
        if (error.code !== 'ENOENT') throw error
      }
      if (dirname(current) === current) break
    }
  }
  private async emptyDestination(directory: string): Promise<boolean> {
    const item = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined
      throw error
    })
    if (!item) return true
    return item.isDirectory() && !item.isSymbolicLink() && !(await readdir(directory)).length
  }
  private async installationDestination(item: DamengPackage, input: unknown) {
    if (typeof input !== 'string' || !isAbsolute(input) || /(^|[\\/])\.\.?([\\/]|$)/.test(input))
      throw new Error('Select an absolute DM installation directory.')
    const programDir = resolve(input)
    assertVendorPath(programDir, process.platform === 'win32')
    const p = this.paths(item, programDir)
    assertDataPath(p.dataDir, process.platform === 'win32')
    const key = (value: string) =>
      process.platform === 'win32' ? resolve(value).toLowerCase() : resolve(value)
    const within = (child: string, parent: string) =>
      key(child) === key(parent) || key(child).startsWith(key(parent).replace(/[\\/]+$/, '') + sep)
    for (const protectedRoot of [this.root, global.Server.Cache!]) {
      if (within(programDir, protectedRoot) || within(protectedRoot, programDir))
        throw new Error(
          'DM installation directory overlaps protected database, record or cache paths.'
        )
    }
    if (within(global.Server.AppDir!, programDir))
      throw new Error('DM installation cannot replace the shared application directory.')
    await this.noSymlink(programDir)
    await this.noSymlink(p.dataDir)
    if (!(await this.emptyDestination(programDir)))
      throw new Error('DM installation directory must be empty. Existing files were retained.')
    if (!existsSync(programDir) && !existsSync(dirname(programDir)))
      throw new Error(
        'Create the installation directory or its immediate parent before downloading.'
      )
    let probeDir = programDir
    while (!existsSync(probeDir)) {
      const parent = dirname(probeDir)
      if (parent === probeDir) throw new Error('DM installation parent is unavailable.')
      probeDir = parent
    }
    const probe = join(probeDir, `.flyenv_dm_probe_${randomUUID()}`)
    try {
      const file = await open(probe, 'wx', 0o600)
      await file.close()
    } finally {
      await rm(probe, { force: true })
    }
    await this.diskSpace(probeDir, 3 * 1024 ** 3)
    return p
  }
  validateInstallPath(row: Request, directory: unknown) {
    return this.fork(async () => {
      await this.platform()
      const p = await this.installationDestination(this.selected(row), directory)
      return { programDir: p.programDir, bin: p.bin }
    })
  }
  private registered(item: DamengPackage, setup: unknown) {
    const target = this.paths(item).programDir
    return registeredProgramPaths(setup, process.platform === 'win32').some((dir) =>
      process.platform === 'win32' ? dir.toLowerCase() === target.toLowerCase() : dir === target
    )
  }
  private async manifest(item: DamengPackage, allowIncomplete = false): Promise<Manifest> {
    const p = this.paths(item)
    await this.noSymlink(p.programDir)
    await this.noSymlink(p.dataDir)
    await this.noSymlink(p.manifest)
    const m = await readJson<Manifest>(p.manifest)
    if (
      m.schema !== 1 ||
      m.owner !== 'flyenv-dameng' ||
      m.installId !== item.id ||
      m.version !== item.version ||
      m.isoSha256 !== item.isoSha256 ||
      m.programDir !== p.programDir ||
      m.dataDir !== p.dataDir ||
      m.instance !== p.instance ||
      ![
        'installing',
        'installed',
        'initializing',
        'initialized',
        'uninstalling',
        'uninstalled'
      ].includes(m.phase)
    )
      throw new Error('Invalid DM installation manifest; instance left untouched.')
    if (!allowIncomplete && !['installed', 'initialized'].includes(m.phase))
      throw new Error(
        `DM previous ${m.phase} outcome requires inspection; automatic replay is disabled.`
      )
    if (!allowIncomplete && m.requiresInspection)
      throw new Error(
        `DAMENG_OUTCOME_UNKNOWN: installation handoff requires inspection: ${m.requiresInspection}`
      )
    return m
  }
  private locked<T>(item: DamengPackage, work: () => Promise<T>) {
    return withOperationLock(join(this.root, 'locks'), item.id, work)
  }
  private fork<T>(work: (on: (event: any) => void) => Promise<T>) {
    return new ForkPromise<T>(async (resolve, reject, on) => {
      try {
        resolve(await work(on))
      } catch (error) {
        reject(error)
      }
    })
  }
  private async enginePresent(item: DamengPackage) {
    const p = this.paths(item),
      suffix = process.platform === 'win32' ? '.exe' : ''
    for (const name of [
      'dmserver',
      'dminit',
      'disql',
      ...(process.platform === 'win32' ? ['dmsvc'] : [])
    ]) {
      const file = join(p.programDir, 'bin', `${name}${suffix}`)
      const observed = await stat(file).catch(() => undefined)
      const normalized = (value: string) =>
        process.platform === 'win32' ? value.toLowerCase() : value
      if (
        !observed?.isFile() ||
        observed.size === 0 ||
        normalized(await realpath(file)) !== normalized(resolve(file))
      )
        return false
    }
    return true
  }
  private async diskSpace(directory: string, required: number) {
    await mkdir(directory, { recursive: true })
    await access(directory, fsConstants.W_OK)
    const fs = await statfs(directory)
    if (fs.bavail * fs.bsize < required)
      throw new Error(`Not enough free disk space for DM: ${directory}`)
  }
  private env(item: DamengPackage) {
    const p = this.paths(item)
    return {
      DM_HOME: p.programDir,
      LD_LIBRARY_PATH: [
        join(p.programDir, 'bin'),
        join(p.programDir, 'lib'),
        process.env.LD_LIBRARY_PATH
      ]
        .filter(Boolean)
        .join(':')
    }
  }
  protected _stopSearchName(): string | undefined {
    // Orphan name search uses substring paths in Base. DM only authorizes its
    // persisted, birth-verified root, so never broaden that set by process name.
    return undefined
  }
  protected async readPidFromFile(file = this.pidPath): Promise<string> {
    const pid = await super.readPidFromFile(file)
    return this.approvedStopPid && pid !== this.approvedStopPid ? '' : pid
  }
  protected ownedProcessMarkers(version: SoftInstalled): string[] {
    return [this.paths(this.selected(version as Request)).ini]
  }
  private async ownedProcesses(item: DamengPackage, manifest: Manifest, list: PItem[]) {
    const p = this.paths(item)
    const active = manifest.active && list.find((row) => row.PID === manifest.active!.pid)
    if (active && !active.COMMAND?.trim())
      throw new Error('DM live process identity is unavailable; PID and instance were retained.')
    const matching = list.filter(
      (row) => commandHasPath(row.COMMAND, p.bin) && commandHasPath(row.COMMAND, p.ini)
    )
    for (const row of matching) {
      if (!manifest.active?.created || !row.CREATED)
        throw new Error('DM live process birth identity is unavailable; instance left untouched.')
      if (
        !manifest.active ||
        row.PID !== manifest.active.pid ||
        (manifest.active.created && row.CREATED !== manifest.active.created)
      ) {
        throw new Error(
          'DM instance is running outside this FlyEnv start; external process left untouched.'
        )
      }
    }
    // A reused PID with a different command is no longer this instance. Never
    // include it in the stop set; its stale owned record can be reconciled.
    return matching
  }
  private async portAvailable(port: number) {
    await new Promise<void>((resolve, reject) => {
      const server = createServer()
      server.once('error', () => reject(new Error(`DM port ${port} is already in use.`)))
      server.listen({ host: '127.0.0.1', port, exclusive: true }, () =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
    })
  }
  private async logFile(item: DamengPackage) {
    const p = this.paths(item)
    for (const dir of [join(p.dataDir, 'log'), join(p.programDir, 'log')]) {
      const files = await readdir(dir).catch(() => [] as string[])
      const names = files
        .filter(
          (name) =>
            name.toLowerCase().startsWith(`dm_${p.instance.toLowerCase()}`) && /\.log$/i.test(name)
        )
        .sort()
        .reverse()
      if (names[0]) return join(dir, names[0])
    }
    if (process.platform === 'win32') {
      const date = new Date(),
        month = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`
      return join(p.programDir, 'log', `dm_${p.instance}_${month}.log`)
    }
    return p.startOut
  }
  private async runtime(item: DamengPackage, m: Manifest): Promise<DamengRuntime> {
    const p = this.paths(item)
    return {
      installId: item.id,
      initialized: m.phase === 'initialized' && existsSync(p.ini),
      initializationCompleted: m.initializationCompleted,
      dataDir: p.dataDir,
      configFile: p.ini,
      logFile: await this.logFile(item),
      serviceName: p.serviceName,
      port: m.port
    }
  }
  fetchAllOnlineVersion(setup?: unknown) {
    return this.fork(async () => {
      await this.platform()
      const list = []
      for (const item of DAMENG_PACKAGES.filter((entry) => entry.platform === process.platform)) {
        let p: ReturnType<Dameng['paths']>
        try {
          p = this.paths(item)
        } catch (error) {
          list.push({
            id: item.id,
            name: item.name,
            version: item.version,
            url: item.url,
            appDir: '',
            bin: '',
            zip: join(global.Server.Cache!, `dameng_${item.id}.zip`),
            typeFlag: this.type,
            downloaded: false,
            installed: false,
            downing: false,
            disabled: true,
            note: String(error)
          })
          continue
        }
        let m: Manifest | undefined
        let invalidRecord = ''
        try {
          m = await this.manifest(item, true)
        } catch (error) {
          /* Invalid manifests never authorize a scan. */
          if (existsSync(this.recordFile(item))) invalidRecord = String(error)
        }
        const complete = !!m && m.phase !== 'uninstalled' && (await this.enginePresent(item))
        const installed = complete && this.registered(item, setup)
        list.push({
          id: item.id,
          name: item.name,
          version: item.version,
          url: item.url,
          appDir: p.programDir,
          bin: p.bin,
          zip: p.zip,
          typeFlag: this.type,
          downloaded: existsSync(p.zip),
          installed,
          registrationPending: complete && !installed,
          downing: false,
          disabled:
            !!invalidRecord ||
            (!!m &&
              (!!m.requiresInspection ||
                !['installed', 'initializing', 'initialized', 'uninstalled'].includes(m.phase))),
          note: invalidRecord || m?.warning || p.programDir
        })
      }
      return list
    })
  }
  allInstalledVersions(setup?: unknown) {
    return this.fork(async () => {
      if (!['win32', 'linux'].includes(process.platform)) return []
      await this.platform()
      const found: Installed[] = []
      for (const item of DAMENG_PACKAGES.filter((entry) => entry.platform === process.platform)) {
        try {
          const m = await this.manifest(item, true),
            p = this.paths(item)
          if (
            m.phase === 'uninstalled' ||
            !this.registered(item, setup) ||
            !(await this.enginePresent(item))
          )
            continue
          found.push({
            typeFlag: this.type,
            version: item.version,
            bin: p.bin,
            path: p.programDir,
            num: Number(item.version.split('.')[1]),
            enable:
              !m.requiresInspection &&
              ['installed', 'initializing', 'initialized'].includes(m.phase),
            run: false,
            running: false,
            note: m.warning,
            damengRuntime: await this.runtime(item, m)
          } as Installed)
        } catch (error) {
          if (existsSync(this.recordFile(item)))
            console.warn('[dameng] skipped installation', item.id, String(error))
        }
      }
      return found
    })
  }
  installSoft(row: Request, directory?: string) {
    return this.fork(async (on) => {
      await this.platform()
      const item = this.selected(row)
      return withOperationLock(join(this.root, 'locks'), 'install', () =>
        this.locked(item, async () => {
          const p = await this.installationDestination(item, directory)
          if (existsSync(p.manifest)) {
            const previous = await this.manifest(item, true)
            if (previous.phase !== 'uninstalled')
              throw new Error(
                'A DM installation record already exists; installation replay is disabled.'
              )
          }
          for (const other of DAMENG_PACKAGES) {
            if (other.id !== item.id && existsSync(this.paths(other).programDir))
              throw new Error(
                'DM multi-version coexistence has not been validated. Keep one owned installation.'
              )
          }
          await this.diskSpace(global.Server.Cache!, item.zipSize + item.isoSize + 3 * 1024 ** 3)
          on({ downState: `Downloading official DM8 package · ${p.programDir}`, progress: 0 })
          await downloadPackage(
            p.zip,
            item.zipSize,
            async () => {
              const response = await axios.get(item.url, {
                responseType: 'stream',
                timeout: 60_000,
                maxRedirects: 3,
                beforeRedirect: (options: any) => {
                  if (
                    options.protocol !== 'https:' ||
                    !/^([a-z0-9-]+\.)*dameng\.com$/i.test(options.hostname)
                  )
                    throw new Error('DM redirect is not an official HTTPS source.')
                }
              })
              return response.data
            },
            (progress) => on({ progress, downState: 'Downloading official DM8 package' })
          )
          const previousManifest = existsSync(p.manifest)
            ? await this.manifest(item, true)
            : undefined
          const work = await mkdtemp(join(global.Server.Cache!, 'dameng_media_'))
          try {
            const iso = join(work, item.isoName)
            on({ downState: 'Verifying official ISO SHA256' })
            await extractPinnedIso(p.zip, iso, item)
            if (!(await this.emptyDestination(p.programDir)))
              throw new Error(
                'DM installation directory changed during download; existing files were retained.'
              )
            const m: Manifest = {
              schema: 1,
              owner: 'flyenv-dameng',
              installId: item.id,
              version: item.version,
              isoSha256: item.isoSha256,
              programDir: p.programDir,
              dataDir: p.dataDir,
              instance: p.instance,
              phase: 'installing',
              port: 5236
            }
            await writeJsonAtomic(p.manifest, m)
            let result: { installed: boolean; warning?: string; handoffError?: string }
            try {
              result =
                process.platform === 'win32'
                  ? await windowsInstall(iso, p.programDir, installerXml(p.programDir))
                  : await linuxInstall(iso, p.programDir, installerXml(p.programDir), (downState) =>
                      on({ downState })
                    )
            } catch (error) {
              // A known refusal/cancel before the installer wrote its directory
              // must remain retryable. Unknown or partial side effects retain the journal.
              if (
                !/DAMENG_OUTCOME_UNKNOWN/.test(String(error)) &&
                (await this.emptyDestination(p.programDir))
              ) {
                if (previousManifest) await writeJsonAtomic(p.manifest, previousManifest)
                else await rm(p.manifest, { force: true })
              }
              throw error
            }
            if (!result.installed || !(await this.enginePresent(item)))
              throw new Error(
                'DAMENG_OUTCOME_UNKNOWN: official installer finished without a complete engine. Files were retained.'
              )
            m.phase = 'installed'
            m.requiresInspection = result.handoffError
            m.warning =
              [result.handoffError, result.warning].filter(Boolean).join('; ') || undefined
            try {
              await writeJsonAtomic(p.manifest, m)
            } catch {
              throw new Error(
                'DAMENG_OUTCOME_UNKNOWN: DM is installed but its manifest could not be finalized. Do not replay installation.'
              )
            }
            on({ downState: 'Installed; initialize the database before starting', progress: 100 })
            return {
              installed: true,
              programDir: p.programDir,
              bin: p.bin,
              installError: result.handoffError,
              warning: result.warning
            }
          } finally {
            await rm(work, { recursive: true, force: true }).catch((error) =>
              console.warn('[dameng] media cleanup failed', String(error))
            )
          }
        })
      )
    })
  }
  initializeDatabase(version: Request, input?: DamengInitParams) {
    return this.fork(async (on) => {
      await this.platform()
      const item = this.selected(version),
        p = this.paths(item)
      return this.locked(item, async () => {
        const m = await this.manifest(item, true)
        if (m.requiresInspection)
          throw new Error(
            `DAMENG_OUTCOME_UNKNOWN: installation handoff requires inspection: ${m.requiresInspection}`
          )
        if (m.phase === 'initialized')
          throw new Error(
            'DM database already exists; immutable initialization will not be repeated.'
          )
        if (!['installed', 'initializing'].includes(m.phase))
          throw new Error(`DM ${m.phase} outcome must be inspected before initialization.`)
        const finishInitialization = async (confirmed = false) => {
          await this.noSymlink(p.ini)
          const ini = parseIni(await readFile(p.ini, 'utf8'))
          if (ini.INSTANCE_NAME !== p.instance || Number(ini.PORT_NUM) !== m.port)
            throw new Error('DM initialization identity did not match its recorded request.')
          const files = await readdir(join(p.dataDir, 'DAMENG'))
          for (const name of ['SYSTEM.DBF', 'MAIN.DBF', 'ROLL.DBF', 'DM.CTL']) {
            const actual = files.find((file) => file.toUpperCase() === name)
            if (!actual)
              throw new Error(
                'DM initialization is incomplete. Existing data was retained; dminit will not be replayed.'
              )
            const file = join(p.dataDir, 'DAMENG', actual)
            await this.noSymlink(file)
            if (!(await stat(file)).size)
              throw new Error(
                'DM initialization produced an empty database file; data was retained.'
              )
          }
          // Do not rewrite the vendor-generated dm.ini: Windows may use a local
          // encoding. Its default event-log directory is covered by installation ACLs.
          if (confirmed) {
            m.initializationCompleted = true
            await writeJsonAtomic(p.manifest, m)
          }
          if (process.platform === 'win32')
            await windowsRegisterService(p.programDir, p.ini, p.serviceName)
          m.phase = 'initialized'
          await writeJsonAtomic(p.manifest, m)
          return { initialized: true, resumed: !confirmed }
        }
        if (m.phase === 'initializing' && existsSync(p.ini)) {
          if (!m.initializationCompleted)
            throw new Error(
              'DM initialization completion was not confirmed; existing files require inspection and will not be replayed.'
            )
          on({
            downState: 'Completing previous database registration; existing files are preserved'
          })
          return finishInitialization()
        }
        if (existsSync(p.dataDir) && (await readdir(p.dataDir)).length)
          throw new Error(
            'DM data directory is not empty. Partial initialization is retained and will not be overwritten.'
          )
        const params = validateInit(input)
        if (freemem() < (params.bufferMB + 512) * 1024 ** 2)
          throw new Error('Not enough available memory for this DM development profile.')
        await this.portAvailable(params.port)
        assertDataPath(p.dataDir, process.platform === 'win32')
        await this.diskSpace(p.dataDir, (params.logSizeMB * 2 + 512) * 1024 ** 2)
        const work = await mkdtemp(join(this.root, 'init_')),
          control = join(work, 'dminit.ini')
        try {
          await chmod(work, 0o700)
          if (process.platform === 'win32') {
            // NTFS does not implement POSIX mode bits. Restrict the private control file before writing secrets.
            await runCommand(
              join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'icacls.exe'),
              [
                work,
                '/inheritance:r',
                '/grant:r',
                `${process.env.USERDOMAIN ? `${process.env.USERDOMAIN}\\` : ''}${process.env.USERNAME}:(OI)(CI)F`,
                '*S-1-5-18:(OI)(CI)F'
              ]
            )
          }
          await writeFile(control, dminitControl(p.dataDir, p.instance, params), {
            mode: 0o600,
            flag: 'wx'
          })
          m.phase = 'initializing'
          m.port = params.port
          await writeJsonAtomic(p.manifest, m)
          on({ downState: 'Initializing DM8 database' })
          await runCommand(
            join(p.programDir, 'bin', process.platform === 'win32' ? 'dminit.exe' : 'dminit'),
            [`CONTROL=${control}`],
            {
              cwd: join(p.programDir, 'bin'),
              env: this.env(item),
              timeoutMs: 10 * 60_000,
              secrets: [params.sysdbaPassword, params.auditorPassword]
            }
          )
          if (!existsSync(p.ini))
            throw new Error('DM initialization did not produce dm.ini; partial files retained.')
          return await finishInitialization(true)
        } finally {
          await rm(work, { recursive: true, force: true }).catch((error) =>
            console.warn('[dameng] secret control cleanup failed', String(error))
          )
        }
      })
    })
  }
  private async connection(item: DamengPackage, m: Manifest, password: string, info = false) {
    const p = this.paths(item)
    const ini = parseIni(await readFile(p.ini, 'utf8')),
      port = Number(ini.PORT_NUM)
    if (ini.INSTANCE_NAME !== p.instance)
      throw new Error('DM configuration instance identity changed.')
    const output = await runCommand(
      join(p.programDir, 'bin', process.platform === 'win32' ? 'disql.exe' : 'disql'),
      ['-S', '-L', '/NOLOG'],
      {
        cwd: join(p.programDir, 'bin'),
        env: this.env(item),
        input: disqlInput(password, port || m.port, info),
        timeoutMs: 12_000,
        secrets: [password]
      }
    ).catch((error) => {
      if (/\[-2501\]/.test(String(error))) throw authenticationError()
      throw error
    })
    if (/\[-2501\]/.test(output)) throw authenticationError()
    if (
      !output.split(/\r?\n/).some((line) => line.trim() === `FLYENV_DM_READY=${p.instance}:OPEN`) ||
      /\[-\d+\]/.test(output)
    )
      throw new Error(
        'DM instance connection is not ready; verify its port, identity and instance log.'
      )
    return output
  }
  startService(version: SoftInstalled, params?: { sysdbaPassword?: string }) {
    return this.fork(async (on) => {
      await this.platform()
      const item = this.selected(version),
        p = this.paths(item)
      return this.locked(item, async () => {
        const m = await this.manifest(item)
        if (m.phase !== 'initialized' || !existsSync(p.ini))
          throw new Error('Initialize the owned DM database before starting it.')
        const password = credential(params?.sysdbaPassword)
        this.pidPath = p.pid
        const list = await StopProcessListFetch()
        if (process.platform === 'win32') {
          const status = await windowsServiceStatus(p.programDir, p.ini, p.serviceName)
          if (status.state !== 'Stopped' && status.state !== 'Missing') {
            const current = list.find((row) => row.PID === status.pid)
            if (
              !m.active ||
              m.active.pid !== status.pid ||
              !m.active.created ||
              current?.CREATED !== m.active.created
            )
              throw new Error(
                'DM service is running outside this FlyEnv start; it will not be taken over.'
              )
            return { 'APP-Service-Start-PID': m.active.pid }
          }
        } else {
          const current = await this.ownedProcesses(item, m, list)
          if (current.length && m.active) return { 'APP-Service-Start-PID': m.active.pid }
        }
        if (m.active) {
          delete m.active
          await writeJsonAtomic(p.manifest, m)
        }
        const ini = parseIni(await readFile(p.ini, 'utf8'))
        await this.portAvailable(Number(ini.PORT_NUM))
        await this.ensureAppPidDirWritable()
        const result: any = await this._startServer(version, { sysdbaPassword: password }).on(on)
        // Match Base: the exact per-instance manifest already owns this PID.
        // Failure of the supplementary shared PID file must not hide a started engine.
        await this.saveAppPid(result['APP-Service-Start-PID']).catch((error) =>
          console.warn('[dameng] shared PID record failed', String(error))
        )
        return result
      })
    })
  }
  _startServer(version: SoftInstalled, params?: { sysdbaPassword?: string }) {
    return this.fork(async (on) => {
      const item = this.selected(version),
        p = this.paths(item),
        m = await this.manifest(item)
      const password = credential(params?.sysdbaPassword)
      this.pidPath = p.pid
      let pid = ''
      try {
        if (process.platform === 'win32')
          pid = (await windowsStartService(p.programDir, p.ini, p.serviceName)).pid
        else {
          await this.noSymlink(p.startOut)
          await this.noSymlink(p.startErr)
          await this.noSymlink(p.pid)
          await mkdir(dirname(p.startOut), { recursive: true })
          await writeFile(p.startOut, '')
          await writeFile(p.startErr, '')
          const result = await serviceStartSpawn({
            version: { ...version, bin: p.bin, path: p.programDir },
            bin: p.bin,
            execArgs: [p.ini, '-noconsole'],
            execEnv: this.env(item),
            cwd: join(p.programDir, 'bin'),
            baseDir: this.root,
            pidPath: p.pid,
            outFile: p.startOut,
            errFile: p.startErr,
            on
          })
          pid = result['APP-Service-Start-PID']
        }
        const observed = (await ProcessListFetch()).find((row) => row.PID === pid)
        if (!observed) throw new Error('DM engine exited before its startup identity was captured.')
        if (!observed.CREATED)
          throw new Error(
            'DAMENG_OUTCOME_UNKNOWN: DM startup process birth identity is unavailable; inspect the retained PID before any retry.'
          )
        m.active = { pid, created: observed.CREATED }
        await writeJsonAtomic(p.manifest, m)
        const deadline = Date.now() + 120_000
        let ready = process.platform === 'win32'
        while (!ready && Date.now() < deadline) {
          const file = await open(p.startOut, 'r')
          try {
            const size = (await file.stat()).size,
              bytes = Buffer.alloc(Math.min(size, 128 * 1024))
            await file.read(bytes, 0, bytes.length, Math.max(0, size - bytes.length))
            ready = bytes.toString().includes('SYSTEM IS READY')
          } finally {
            await file.close()
          }
          if (!ready) {
            if (!(await ProcessListFetch()).some((row) => row.PID === pid))
              throw new Error('DM engine exited during startup.')
            await pause(500)
          }
        }
        if (!ready) throw new Error('DM readiness log timed out.')
        // Service Running can precede SQL readiness; retry transient connection errors with a bounded deadline.
        let last: unknown,
          connected = false
        while (Date.now() < deadline) {
          try {
            await this.connection(item, m, password)
            last = undefined
            connected = true
            break
          } catch (error) {
            last = error
            if (/authentication|口令|密码|\[-2501\]/i.test(String(error))) break
            await pause(500)
          }
        }
        if (!connected) throw last ?? new Error('DM connection readiness timed out.')
        return { 'APP-Service-Start-PID': pid }
      } catch (error) {
        if (pid) {
          try {
            if (!m.active) {
              m.active = { pid }
              await writeJsonAtomic(p.manifest, m)
            }
            await this.stopOwned(item, m, version).on(on)
          } catch (cleanup) {
            throw new Error(
              `${String(error)}; DM startup cleanup failed: ${String(cleanup)}. PID retained.`
            )
          }
        }
        throw error
      }
    })
  }
  private stopOwned(item: DamengPackage, m: Manifest, version: SoftInstalled) {
    return this.fork(async (on) => {
      const p = this.paths(item)
      this.pidPath = p.pid
      const list = await StopProcessListFetch()
      let stopped: any
      if (process.platform === 'win32') {
        const status = await windowsServiceStatus(p.programDir, p.ini, p.serviceName)
        let tree: string[] = []
        if (status.state !== 'Stopped' && status.state !== 'Missing') {
          if (!m.active)
            throw new Error('DM service was started outside FlyEnv; it will not be stopped.')
          const current = list.find((row) => row.PID === status.pid)
          if (
            status.pid !== m.active.pid ||
            !m.active.created ||
            current?.CREATED !== m.active.created
          )
            throw new Error(
              'DM service process birth identity changed; external service left untouched.'
            )
          tree = ProcessListByExactPid(m.active.pid, list).map((row) => row.PID)
          await windowsStopService(p.programDir, p.ini, p.serviceName, m.active.pid)
        } else if (m.active) {
          const current = list.find((row) => row.PID === m.active!.pid)
          if (current) {
            if (!m.active.created || !current.CREATED)
              throw new Error(
                'DAMENG_OUTCOME_UNKNOWN: stopped DM service still has an unverifiable live PID; records were retained.'
              )
            if (current.CREATED === m.active.created)
              tree = ProcessListByExactPid(m.active.pid, list).map((row) => row.PID)
          }
        }
        if (tree.length) {
          try {
            await this.waitWindowsServiceExit(tree, 10_000, list)
          } catch (error) {
            throw new Error(
              `DAMENG_OUTCOME_UNKNOWN: DM service stopped but engine-tree exit could not be confirmed: ${String(error)}`
            )
          }
        }
        if (
          !tree.length &&
          list.some(
            (row) => commandHasPath(row.COMMAND, p.engine) && commandHasPath(row.COMMAND, p.ini)
          )
        )
          throw new Error(
            'DAMENG_OUTCOME_UNKNOWN: DM engine remains after its service root exited; instance records were retained.'
          )
        stopped = { 'APP-Service-Stop-PID': m.active ? [m.active.pid] : [] }
        if (existsSync(p.pid)) await rm(p.pid)
        await this.removeStoppedAppPid(stopped['APP-Service-Stop-PID'])
      } else {
        const roots = await this.ownedProcesses(item, m, list)
        if (!roots.length || !m.active) {
          // Old PID records do not authorize stopping a same-name/suffix-config
          // external process. Base is invoked only with the proven owned root.
          stopped = { 'APP-Service-Stop-PID': m.active ? [m.active.pid] : [] }
        } else {
          this.approvedStopPid = m.active.pid
          try {
            stopped = await withServiceStopContext(
              { processList: list, reason: currentServiceStopContext()?.reason ?? 'stop' },
              () =>
                super
                  ._stopServer({ ...version, bin: p.bin, path: p.programDir, pid: m.active!.pid })
                  .on(on)
            )
          } catch (error) {
            throw new Error(
              `DAMENG_OUTCOME_UNKNOWN: DM process-tree stop could not be confirmed: ${String(error)}. PID retained.`
            )
          } finally {
            this.approvedStopPid = undefined
          }
        }
      }
      delete m.active
      await writeJsonAtomic(p.manifest, m)
      return stopped
    })
  }
  _stopServer(version: SoftInstalled) {
    return this.fork(async (on) => {
      await this.platform()
      const item = this.selected(version)
      return this.locked(item, async () =>
        this.stopOwned(item, await this.manifest(item), version).on(on)
      )
    })
  }
  getInitializationState(version: Request) {
    return this.fork(async () => {
      const item = this.selected(version)
      const m = await this.manifest(item, true)
      if (m.requiresInspection)
        throw new Error(
          `DAMENG_OUTCOME_UNKNOWN: installation requires inspection: ${m.requiresInspection}`
        )
      if (!['installed', 'initializing', 'initialized'].includes(m.phase))
        throw new Error(`DM ${m.phase} outcome must be inspected before starting.`)
      return this.runtime(item, m)
    })
  }
  getInstanceInfo(version: Request, params?: { sysdbaPassword?: string }) {
    return this.fork(async () => {
      const item = this.selected(version),
        m = await this.manifest(item),
        p = this.paths(item)
      const result: DamengInstanceInfo = {
        initialized: m.phase === 'initialized',
        version: item.version,
        configFile: p.ini,
        logFile: await this.logFile(item)
      }
      if (result.initialized && params?.sysdbaPassword) {
        try {
          const output = await this.connection(item, m, credential(params.sysdbaPassword), true)
          result.expiredDate = output.match(/FLYENV_DM_LICENSE=([^\r\n]+)/)?.[1]?.trim()
          result.version =
            output
              .split(/\r?\n/)
              .find((line) => /DM Database Server/i.test(line))
              ?.trim() || item.version
        } catch (error) {
          result.licenseError = String(error)
        }
      } else if (result.initialized)
        result.licenseError =
          'Enter the current SYSDBA password and start the database to query its actual license expiry.'
      return result
    })
  }
  getConfigFiles(version?: SoftInstalled) {
    if (!version) return []
    const p = this.paths(this.selected(version))
    return [{ name: 'dm.ini', path: p.ini }]
  }
  getLogFiles(version?: SoftInstalled) {
    if (!version) return []
    const p = this.paths(this.selected(version))
    const events: { name: string; path: string }[] = []
    for (const directory of [join(p.dataDir, 'log'), join(p.programDir, 'log')]) {
      try {
        const files = readdirSync(directory)
          .filter(
            (name) =>
              name.toLowerCase().startsWith(`dm_${p.instance.toLowerCase()}`) &&
              /\.log$/i.test(name)
          )
          .sort()
          .reverse()
        if (files[0]) events.push({ name: 'event-log', path: join(directory, files[0]) })
      } catch {
        /* Absent log directories do not invalidate other log candidates. */
      }
    }
    return [
      ...events,
      { name: 'startup', path: p.startOut },
      { name: 'startup-errors', path: p.startErr }
    ]
  }
  uninstallSoft(row: Request) {
    return this.fork(async (on) => {
      await this.platform()
      const item = this.selected(row),
        p = this.paths(item)
      return withOperationLock(join(this.root, 'locks'), 'install', () =>
        this.locked(item, async () => {
          const m = await this.manifest(item, true)
          if (m.requiresInspection)
            throw new Error(
              `DAMENG_OUTCOME_UNKNOWN: installation handoff requires inspection: ${m.requiresInspection}`
            )
          if (!['installed', 'initializing', 'initialized'].includes(m.phase))
            throw new Error(`DM ${m.phase} outcome requires inspection before uninstalling.`)
          const commands = await StopProcessListFetch()
          const initBin = join(
            p.programDir,
            'bin',
            process.platform === 'win32' ? 'dminit.exe' : 'dminit'
          )
          if (commands.some((row) => commandHasPath(row.COMMAND, initBin)))
            throw new Error(
              'DM initialization is still running; program and data files were retained.'
            )
          await this.stopOwned(item, m, {
            typeFlag: this.type,
            version: item.version,
            bin: p.bin,
            path: p.programDir
          } as SoftInstalled).on(on)
          const previousPhase = m.phase
          m.phase = 'uninstalling'
          await writeJsonAtomic(p.manifest, m)
          on({ downState: 'Running official DM uninstaller; database files are retained' })
          let result: { uninstalled: boolean; warning?: string }
          try {
            result =
              process.platform === 'win32'
                ? await windowsUninstall(p.programDir)
                : await linuxUninstall(p.programDir)
          } catch (error: any) {
            if (error?.noSideEffects === true && !/DAMENG_OUTCOME_UNKNOWN/.test(String(error))) {
              m.phase = previousPhase
              await writeJsonAtomic(p.manifest, m)
            }
            throw error
          }
          if (!result.uninstalled || existsSync(p.engine))
            throw new Error(
              'DM uninstaller did not confirm program removal. Partial state retained.'
            )
          m.phase = 'uninstalled'
          m.warning = result.warning
          try {
            await writeJsonAtomic(p.manifest, m)
          } catch {
            throw new Error(
              'DAMENG_OUTCOME_UNKNOWN: DM program was removed, but its removal manifest could not be finalized. Data was retained.'
            )
          }
          return result
        })
      )
    })
  }
}

export default new Dameng()
