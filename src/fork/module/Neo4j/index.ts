import { dirname, join, normalize, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { Base } from '../Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  binXattrFix,
  chmod,
  copyFile,
  mkdirp,
  moveChildDirToParent,
  readFile,
  remove,
  spawnPromiseWithEnv,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  writeFile,
  zipUnpack
} from '../../Fn'
import { unpack } from '../../util/Zip'
import { serviceStartSpawn } from '../../util/ServiceStart'
import { ForkPromise } from '@shared/ForkPromise'
import EnvSync from '@shared/EnvSync'
import TaskQueue from '../../TaskQueue'
import { I18nT } from '@lang/runtime'
import { isMacOS, isWindows, waitTime } from '@shared/utils'
import { ProcessKill } from '@shared/Process'
import { StopProcessListFetch } from '@shared/StopProcessList'
import {
  NEO4J_MIN_VERSION,
  isNeo4jSupportedVersion,
  javaMajorFromVersion,
  resolveNeo4jJavaPolicy
} from './policy'
import { neo4jPathEnv, neo4jStartCommand } from './start-command'
import { neo4jStopProcessPids, waitForNeo4jStartupProcess } from './startup'
import {
  NEO4J_DEFAULT_BOLT_PORT,
  NEO4J_DEFAULT_HTTP_PORT,
  NEO4J_DEFAULT_HTTPS_PORT,
  neo4jInstallPaths,
  neo4jInstanceKey,
  parseNeo4jBoltPort,
  parseNeo4jHttpPort,
  parseNeo4jListenPort,
  upsertNeo4jDirectorySettings
} from './contract'
export {
  NEO4J_DEFAULT_BOLT_PORT,
  NEO4J_DEFAULT_HTTP_PORT,
  NEO4J_DEFAULT_HTTPS_PORT,
  neo4jInstallPaths,
  neo4jInstanceKey,
  parseNeo4jBoltPort,
  parseNeo4jHttpPort,
  parseNeo4jListenPort,
  upsertNeo4jDirectorySettings
} from './contract'

export type Neo4jStartParams = {
  javaHome?: string
  neo4jInstanceDir?: string
}

type Neo4jPaths = {
  root: string
  instanceDir: string
  confDir: string
  configFile: string
  dataDir: string
  logsDir: string
  importDir: string
  pluginsDir: string
  pidFile: string
  startOut: string
  startError: string
}

function moduleBaseDir(): string {
  return global.Server?.Neo4jDir ?? join(global.Server?.BaseDir ?? process.cwd(), 'neo4j')
}

function installRoot(version: SoftInstalled): string {
  const candidate = version?.path || dirname(dirname(version?.bin ?? ''))
  return normalize(resolve(candidate || process.cwd())).replace(/[\\/]+$/, '')
}

function pathsForVersion(version: SoftInstalled, requestedInstanceDir?: string): Neo4jPaths {
  const root = installRoot(version)
  const key = neo4jInstanceKey(root)
  const instanceDir = requestedInstanceDir || join(moduleBaseDir(), 'instances', key)
  const confDir = join(instanceDir, 'conf')
  return {
    root,
    instanceDir,
    confDir,
    configFile: join(confDir, 'neo4j.conf'),
    dataDir: join(instanceDir, 'data'),
    logsDir: join(instanceDir, 'logs'),
    importDir: join(instanceDir, 'import'),
    pluginsDir: join(instanceDir, 'plugins'),
    pidFile: join(instanceDir, 'neo4j.pid'),
    startOut: join(instanceDir, 'logs', 'start-out.log'),
    startError: join(instanceDir, 'logs', 'start-error.log')
  }
}

function javaBinForHome(javaHome: string): string {
  return join(javaHome, 'bin', isWindows() ? 'java.exe' : 'java')
}

async function detectJavaMajor(javaBin: string): Promise<number> {
  const result = await spawnPromiseWithEnv(javaBin, ['-version'], {
    cwd: dirname(javaBin),
    shell: false,
    trimOutput: false
  })
  return javaMajorFromVersion(`${result.stdout}\n${result.stderr}`)
}

export async function validateNeo4jJava(
  version: string | null | undefined,
  javaHome: string | null | undefined
): Promise<{ javaHome: string; javaBin: string; javaMajor: number }> {
  const policy = resolveNeo4jJavaPolicy(version)
  if (!isNeo4jSupportedVersion(version)) {
    throw new Error(`Neo4j ${version ?? 'unknown'} is unsupported; minimum is ${NEO4J_MIN_VERSION}`)
  }
  const home = `${javaHome ?? ''}`.trim()
  if (!home) {
    throw new Error(
      `Neo4j ${version} requires a compatible Java runtime (${policy.supportedMajor.join('/')})`
    )
  }
  const javaBin = javaBinForHome(home)
  if (!existsSync(javaBin)) {
    throw new Error(`Java executable not found: ${javaBin}`)
  }
  const javaMajor = await detectJavaMajor(javaBin)
  if (!policy.supportedMajor.includes(javaMajor)) {
    throw new Error(
      `Neo4j ${version} requires Java ${policy.supportedMajor.join(' or ')}, but Java ${javaMajor || 'unknown'} was selected`
    )
  }
  return { javaHome: home, javaBin, javaMajor }
}

async function startupCommandForPid(pid: string): Promise<string> {
  const process = (await StopProcessListFetch()).find((item) => `${item.PID}` === `${pid}`)
  return `${process?.COMMAND ?? ''}`
}

class Neo4j extends Base {
  constructor() {
    super()
    this.type = 'neo4j'
  }

  init() {
    this.pidPath = join(moduleBaseDir(), 'neo4j.pid')
  }

  private paths(version: SoftInstalled, instanceDir?: string): Neo4jPaths {
    return pathsForVersion(version, instanceDir)
  }

  private async initializeInstance(
    version: SoftInstalled,
    instanceDir?: string
  ): Promise<Neo4jPaths> {
    const paths = this.paths(version, instanceDir)
    await Promise.all([
      mkdirp(paths.confDir),
      mkdirp(paths.dataDir),
      mkdirp(paths.logsDir),
      mkdirp(paths.importDir),
      mkdirp(paths.pluginsDir)
    ])

    if (!existsSync(paths.configFile)) {
      const distributionConfig = join(paths.root, 'conf', 'neo4j.conf')
      if (existsSync(distributionConfig)) {
        await copyFile(distributionConfig, paths.configFile)
      } else {
        await writeFile(paths.configFile, '# FlyEnv Neo4j instance configuration\n')
      }
    }

    const existing = await readFile(paths.configFile, 'utf-8')
    const content = upsertNeo4jDirectorySettings(existing, {
      'server.directories.data': paths.dataDir,
      'server.directories.logs': paths.logsDir,
      'server.directories.import': paths.importDir,
      'server.directories.plugins': paths.pluginsDir
    })
    if (content !== existing) await writeFile(paths.configFile, content)
    return paths
  }

  initConfig(version: SoftInstalled, instanceDir?: string): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject, on) => {
      try {
        const paths = await this.initializeInstance(version, instanceDir)
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: paths.configFile }))
        })
        resolve(paths.configFile)
      } catch (error) {
        reject(error)
      }
    })
  }

  private envFor(
    version: SoftInstalled,
    paths: Neo4jPaths,
    javaHome: string,
    currentPath?: string
  ): Record<string, string> {
    return {
      JAVA_HOME: javaHome,
      PATH: neo4jPathEnv(javaHome, version.bin, currentPath, isWindows()),
      NEO4J_CONF: paths.confDir,
      NEO4J_HOME: paths.root,
      NEO4J_PID_FILE: paths.pidFile
    }
  }

  _startServer(version: SoftInstalled, params?: Neo4jStartParams) {
    return new ForkPromise(async (resolve, reject, on) => {
      try {
        on({
          'APP-On-Log': AppLog(
            'info',
            I18nT('appLog.startServiceBegin', { service: `neo4j-${version.version}` })
          )
        })
        const java = await validateNeo4jJava(version.version, params?.javaHome)
        const syncedEnv = await EnvSync.sync()
        const paths = await this.initializeInstance(version, params?.neo4jInstanceDir)

        this.pidPath = paths.pidFile
        const command = neo4jStartCommand(
          version,
          isWindows(),
          existsSync,
          EnvSync.PowerShellPath || 'powershell.exe'
        )
        const res = await serviceStartSpawn({
          version,
          pidPath: paths.pidFile,
          baseDir: paths.instanceDir,
          bin: command.bin,
          execArgs: command.execArgs,
          execEnv: {
            ...this.envFor(version, paths, java.javaHome, syncedEnv.PATH ?? syncedEnv.Path),
            ...(command.execEnv ?? {})
          },
          cwd: paths.root,
          outFile: paths.startOut,
          errFile: paths.startError,
          on,
          sensitive: true,
          detached: false,
          waitTime: 3000
        })
        const startupPid = res['APP-Service-Start-PID']
        const startupCommand = await startupCommandForPid(startupPid)
        if (!startupCommand) {
          throw new Error(`Neo4j startup process ${startupPid} command was not found`)
        }
        await waitForNeo4jStartupProcess({
          startupPid,
          startupCommand,
          installationPath: paths.root,
          configDir: paths.confDir,
          listProcesses: StopProcessListFetch,
          wait: waitTime
        })
        on({
          'APP-On-Log': AppLog('info', `Neo4j ${version.version} process tree is ready`)
        })
        resolve({
          ...res,
          'APP-Service-Start-Item': { ...version }
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  _stopServer(version: SoftInstalled, params?: Neo4jStartParams) {
    return new ForkPromise(async (resolve, _reject, on) => {
      const paths = this.paths(version, params?.neo4jInstanceDir)
      const pidFile = paths.pidFile
      const pid = existsSync(pidFile) ? (await readFile(pidFile, 'utf-8')).trim() : ''
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.stopServiceBegin', { service: `neo4j-${version.version}` })
        )
      })

      const markerPids: string[] = []
      try {
        const list = await StopProcessListFetch()
        markerPids.push(...neo4jStopProcessPids(list, pid, paths.root, paths.confDir))
      } catch {}
      // A stale launcher PID is insufficient. The helper recovers the exact
      // instance Java process by --home-dir and --config-dir when needed.
      const allPids = Array.from(new Set(markerPids.filter(Boolean)))
      if (allPids.length > 0) {
        try {
          await ProcessKill(isWindows() ? '-INT' : '-TERM', allPids)
        } catch {}
      }

      let stopped = allPids.length === 0
      if (allPids.length > 0) {
        for (let i = 0; i < 30; i += 1) {
          const remaining = neo4jStopProcessPids(
            await StopProcessListFetch(),
            pid,
            paths.root,
            paths.confDir
          )
          if (remaining.length === 0) {
            stopped = true
            break
          }
          await waitTime(500)
        }
      }
      if (!stopped) {
        throw new Error(`Neo4j process ${pid} did not exit after stop request`)
      }
      await remove(pidFile).catch(() => {})
      if (this.pidPath === pidFile) this.pidPath = join(moduleBaseDir(), 'neo4j.pid')
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceEnd', { service: 'neo4j' }))
      })
      on({ 'APP-Service-Stop-Success': true })
      resolve({ 'APP-Service-Stop-PID': allPids })
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('neo4j')
        all.forEach((item: any) => {
          const paths = neo4jInstallPaths(global.Server.AppDir!, item.version, isWindows())
          item.appDir = paths.appDir
          item.bin = paths.bin
          item.zip = join(
            global.Server.Cache!,
            `neo4j-${item.version}${isWindows() ? '.zip' : '.tar.gz'}`
          )
          item.downloaded = existsSync(item.zip)
          item.installed = existsSync(item.bin)
          item.name = `Neo4j-${item.version}`
        })
        resolve(all)
      } catch {
        resolve([])
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise(async (resolve) => {
      try {
        const binName = isWindows() ? 'neo4j.bat' : 'neo4j'
        const fetched = await versionLocalFetch(setup?.neo4j?.dirs ?? [], binName, 'neo4j')
        const versions = versionFilterSame(fetched)
        const checks = versions.map((item) => {
          const command = isWindows() ? `call "${item.bin}" version` : `"${item.bin}" version`
          const regex = /(neo4j(?:\s+version)?\s+)(\d+\.\d+\.\d+)/i
          return TaskQueue.run(versionBinVersion, item.bin, command, regex, true)
        })
        const results = await Promise.all(checks)
        results.forEach((result, index) => {
          const item = versions[index]
          const detected = result.version?.trim() || ''
          const supported = isNeo4jSupportedVersion(detected)
          const version = detected || null
          const error = version
            ? supported
              ? result.error
              : `Neo4j ${version} is not supported; minimum version is ${NEO4J_MIN_VERSION}`
            : result.error || 'Unable to detect Neo4j version'
          Object.assign(item, {
            typeFlag: 'neo4j',
            version,
            num: version ? Number(versionFixed(version).split('.').slice(0, 2).join('')) : null,
            enable: Boolean(version && supported),
            error
          })
        })
        resolve(versionSort(versions))
      } catch {
        resolve([])
      }
    })
  }

  async _installSoftHandle(row: any): Promise<void> {
    await remove(row.appDir).catch(() => {})
    await mkdirp(row.appDir)
    if (isWindows()) {
      await zipUnpack(row.zip, row.appDir)
    } else {
      await unpack(row.zip, row.appDir)
    }
    if (!existsSync(row.bin)) {
      await moveChildDirToParent(row.appDir).catch(() => {})
    }
    if (!isWindows() && existsSync(row.bin)) {
      await chmod(row.bin, '0755').catch(() => {})
      if (isMacOS()) await binXattrFix(row.bin).catch(() => {})
    }
  }

  getConfigFiles(version?: SoftInstalled): Array<{ name: string; path: string }> {
    if (!version?.bin) return []
    const paths = this.paths(version)
    return [{ name: 'neo4j.conf', path: paths.configFile }]
  }

  getLogFiles(version?: SoftInstalled): Array<{ name: string; path: string }> {
    if (!version?.bin) return []
    const paths = this.paths(version)
    return [
      { name: 'start-out', path: paths.startOut },
      { name: 'start-error', path: paths.startError },
      { name: 'neo4j.log', path: join(paths.logsDir, 'neo4j.log') },
      { name: 'debug.log', path: join(paths.logsDir, 'debug.log') }
    ]
  }

  portinfo(version?: SoftInstalled) {
    return new ForkPromise(async (resolve) => {
      try {
        const paths = version ? this.paths(version) : undefined
        const content =
          paths && existsSync(paths.configFile) ? await readFile(paths.configFile, 'utf-8') : ''
        resolve({
          http: parseNeo4jHttpPort(content),
          https: parseNeo4jListenPort(
            content,
            'server.https.listen_address',
            NEO4J_DEFAULT_HTTPS_PORT
          ),
          bolt: parseNeo4jBoltPort(content)
        })
      } catch {
        resolve({
          http: NEO4J_DEFAULT_HTTP_PORT,
          https: NEO4J_DEFAULT_HTTPS_PORT,
          bolt: NEO4J_DEFAULT_BOLT_PORT
        })
      }
    })
  }
}

export default new Neo4j()
