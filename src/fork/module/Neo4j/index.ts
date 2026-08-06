import { dirname, join, normalize, resolve, sep } from 'node:path'
import { existsSync } from 'node:fs'
import axios from 'axios'
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
import TaskQueue from '../../TaskQueue'
import { I18nT } from '@lang/runtime'
import { isMacOS, isWindows } from '@shared/utils'
import { ProcessKill, ProcessListFetch, ProcessOwnedPidsByPid } from '@shared/Process'
import { StopProcessListFetch } from '@shared/StopProcessList'
import {
  NEO4J_MIN_VERSION,
  isNeo4jSupportedVersion,
  javaMajorFromVersion,
  resolveNeo4jJavaPolicy
} from './policy'
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
  /** Optional one-time password supplied by the renderer controller. Never logged. */
  password?: string
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
  const instanceDir =
    requestedInstanceDir || version?.neo4jInstanceDir || join(moduleBaseDir(), 'instances', key)
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

async function isPidAlive(pid: string): Promise<boolean> {
  if (!pid) return false
  try {
    const list = await ProcessListFetch()
    return list.some((item) => `${item.PID}` === `${pid}`)
  } catch {
    return false
  }
}

async function waitForHttp(port: number, maxAttempts = 60): Promise<void> {
  let lastError: unknown
  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      const response = await axios.get(`http://127.0.0.1:${port}/`, {
        timeout: 1000,
        validateStatus: () => true,
        proxy: false
      })
      if (response.status >= 100 && response.status < 500) return
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500))
  }
  throw new Error(`Neo4j HTTP health check failed on port ${port}: ${lastError ?? 'timeout'}`)
}

export async function checkNeo4jHealth(
  configFile: string
): Promise<{ httpPort: number; boltPort: number }> {
  const content = existsSync(configFile) ? await readFile(configFile, 'utf-8') : ''
  const httpPort = parseNeo4jHttpPort(content)
  const boltPort = parseNeo4jBoltPort(content)
  await waitForHttp(httpPort)
  return { httpPort, boltPort }
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
    javaHome: string
  ): Record<string, string> {
    const currentPath = process.env.PATH ?? ''
    const javaBinDir = join(javaHome, 'bin')
    return {
      JAVA_HOME: javaHome,
      PATH: `${javaBinDir}${sep}${dirname(version.bin)}${sep}${currentPath}`,
      NEO4J_CONF: paths.confDir,
      NEO4J_HOME: paths.root,
      NEO4J_PID_FILE: paths.pidFile
    }
  }

  private async setInitialPassword(
    version: SoftInstalled,
    paths: Neo4jPaths,
    javaHome: string,
    password: string | undefined
  ) {
    if (!password || existsSync(join(paths.dataDir, 'databases'))) return
    const adminBin = join(dirname(version.bin), isWindows() ? 'neo4j-admin.bat' : 'neo4j-admin')
    if (!existsSync(adminBin)) return
    // Password is intentionally never passed to logs or ForkPromise progress events.
    // Neo4j 5's command accepts the password as a positional argument. The
    // process is short-lived and its output is intentionally not forwarded to
    // FlyEnv logs; therefore the secret never enters command history or a log
    // event (service start diagnostics are also redacted).
    await spawnPromiseWithEnv(adminBin, ['dbms', 'set-initial-password', password], {
      cwd: paths.root,
      env: this.envFor(version, paths, javaHome),
      shell: isWindows(),
      windowsHide: true
    })
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
        const java = await validateNeo4jJava(version.version, params?.javaHome ?? version.javaHome)
        const paths = await this.initializeInstance(
          version,
          params?.neo4jInstanceDir ?? version.neo4jInstanceDir
        )
        await this.setInitialPassword(version, paths, java.javaHome, params?.password)

        this.pidPath = paths.pidFile
        const res = await serviceStartSpawn({
          version,
          pidPath: paths.pidFile,
          baseDir: paths.instanceDir,
          bin: version.bin,
          execArgs: ['console'],
          execEnv: this.envFor(version, paths, java.javaHome),
          cwd: paths.root,
          outFile: paths.startOut,
          errFile: paths.startError,
          on,
          sensitive: true,
          waitTime: 3000
        })
        const ports = await checkNeo4jHealth(paths.configFile)
        on({
          'APP-On-Log': AppLog(
            'info',
            `Neo4j ${version.version} is ready on HTTP ${ports.httpPort} / Bolt ${ports.boltPort}`
          )
        })
        resolve({
          ...res,
          'APP-Service-Start-Item': {
            ...version,
            javaHome: java.javaHome,
            javaMajor: java.javaMajor,
            neo4jInstanceDir: paths.instanceDir
          }
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  _stopServer(version: SoftInstalled, params?: Neo4jStartParams) {
    return new ForkPromise(async (resolve, _reject, on) => {
      const paths = this.paths(version, params?.neo4jInstanceDir ?? version.neo4jInstanceDir)
      const pidFile = paths.pidFile
      const pid = existsSync(pidFile) ? (await readFile(pidFile, 'utf-8')).trim() : ''
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.stopServiceBegin', { service: `neo4j-${version.version}` })
        )
      })

      let stoppedGracefully = false
      const javaHome = params?.javaHome ?? version.javaHome
      try {
        if (javaHome && existsSync(javaBinForHome(javaHome))) {
          const env = this.envFor(version, paths, javaHome)
          await spawnPromiseWithEnv(version.bin, ['stop'], {
            cwd: paths.root,
            env,
            shell: isWindows(),
            windowsHide: true
          })
          stoppedGracefully = true
        }
      } catch {
        stoppedGracefully = false
      }

      if (stoppedGracefully && pid) {
        for (let i = 0; i < 20; i += 1) {
          if (!(await isPidAlive(pid))) break
          await new Promise((resolveWait) => setTimeout(resolveWait, 500))
        }
        if (await isPidAlive(pid)) stoppedGracefully = false
      }

      const markerPids: string[] = []
      if (!stoppedGracefully && pid) {
        try {
          const list = await StopProcessListFetch()
          markerPids.push(
            ...ProcessOwnedPidsByPid(pid, list, [version.bin, paths.root, paths.instanceDir])
          )
        } catch {}
      }
      // Never kill a PID solely because a stale pid file contains its number. The
      // process list helper verifies that the command still belongs to this
      // installation before returning it.
      const allPids = Array.from(new Set(markerPids.filter(Boolean)))
      if (!stoppedGracefully && allPids.length > 0) {
        try {
          await ProcessKill(isWindows() ? '-INT' : '-TERM', allPids)
        } catch {}
      }

      if (allPids.includes(pid)) {
        for (let i = 0; i < 30; i += 1) {
          if (!(await isPidAlive(pid))) break
          await new Promise((resolveWait) => setTimeout(resolveWait, 500))
        }
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
            error,
            neo4jNeedsPassword: Boolean(
              version && supported && !existsSync(join(pathsForVersion(item).dataDir, 'databases'))
            )
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
