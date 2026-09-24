import { dirname, join } from 'path'
import { existsSync } from 'fs'
import { createConnection } from 'net'
import { Base } from '@fork/module/Base'
import { I18nT } from '@lang/runtime'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  execPromiseWithEnv,
  mkdirp,
  moveChildDirToParent,
  readdir,
  readFile,
  remove,
  serviceStartExecCMD,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  waitTime,
  writeFile,
  zipUnpack
} from '@fork/Fn'
import { serviceStartSpawn } from '@fork/util/ServiceStart'
import { ForkPromise } from '@shared/ForkPromise'
import TaskQueue from '@fork/TaskQueue'
import EnvSync from '@shared/EnvSync'
import { isLinux, isMacOS, isWindows, pathFixedToUnix } from '@shared/utils'
import { ProcessListSearch } from '@shared/Process.win'
import { validateKafkaJava, KAFKA_MIN_JAVA_MAJOR } from './policy'
import { KafkaT } from '../lang'
import KafkaVersionFetch from './version'

const KAFKA_STARTUP_CHECK_TIMES = 60
const KAFKA_VERSION_COMMAND_TIMEOUT_MS = 60_000
const KAFKA_TOPIC_COMMAND_TIMEOUT_MS = 60_000
const KAFKA_DEFAULT_BOOTSTRAP_SERVER = '127.0.0.1:9092'

export type KafkaStartParams = {
  javaHome?: string
}

class Kafka extends Base {
  baseDir: string = ''

  constructor() {
    super()
    this.type = 'kafka'
  }

  init() {
    this.baseDir = join(global.Server.BaseDir!, 'kafka')
    this.pidPath = join(this.baseDir, 'kafka.pid')
    mkdirp(this.baseDir).catch()
  }

  private _instanceDir(version: SoftInstalled): string {
    return join(this.baseDir, `kafka-${version?.version ?? ''}`.split(' ').join(''))
  }

  private _instancePaths(version: SoftInstalled) {
    const instanceDir = this._instanceDir(version)
    const configDir = join(instanceDir, 'config')
    const dataDir = join(instanceDir, 'data')
    const logsDir = join(instanceDir, 'logs')
    return {
      instanceDir,
      configDir,
      dataDir,
      logsDir,
      serverProperties: join(configDir, 'server.properties'),
      serverDefaultProperties: join(configDir, 'server-default.properties')
    }
  }

  private startupLogFiles(version: SoftInstalled) {
    const versionStr = version?.version?.trim() ?? ''
    const instanceDir = this._instanceDir(version)
    return [
      {
        name: `${this.type}-${versionStr}-start-out.log`,
        path: join(instanceDir, `${this.type}-${versionStr}-start-out.log`.split(' ').join(''))
      },
      {
        name: `${this.type}-${versionStr}-start-error.log`,
        path: join(instanceDir, `${this.type}-${versionStr}-start-error.log`.split(' ').join(''))
      }
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

  private _serverPropertiesContent(dataDir: string): string {
    return `process.roles=broker,controller
node.id=1
controller.quorum.voters=1@127.0.0.1:9093
listeners=PLAINTEXT://127.0.0.1:9092,CONTROLLER://127.0.0.1:9093
advertised.listeners=PLAINTEXT://127.0.0.1:9092
controller.listener.names=CONTROLLER
log.dirs=${pathFixedToUnix(dataDir)}
offsets.topic.replication.factor=1
transaction.state.log.replication.factor=1
transaction.state.log.min.isr=1
`
  }

  initConfig(version: SoftInstalled): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject, on) => {
      if (!existsSync(version?.bin)) {
        reject(new Error(I18nT('fork.binNotFound')))
        return
      }
      if (!version?.version) {
        reject(new Error(I18nT('fork.versionNotFound')))
        return
      }
      const paths = this._instancePaths(version)
      await mkdirp(paths.configDir)
      const content = this._serverPropertiesContent(paths.dataDir)
      if (!existsSync(paths.serverProperties)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        await writeFile(paths.serverProperties, content)
        on({
          'APP-On-Log': AppLog(
            'info',
            I18nT('appLog.confInitSuccess', { file: paths.serverProperties })
          )
        })
      }
      await writeFile(paths.serverDefaultProperties, content)
      resolve(paths.serverProperties)
    })
  }

  private _storageBin(version: SoftInstalled): string {
    if (isWindows()) {
      return join(version.path, 'bin/windows/kafka-storage.bat')
    }
    return join(version.path, 'bin/kafka-storage.sh')
  }

  private async _javaEnv(javaHome: string): Promise<Record<string, string>> {
    const env = await EnvSync.sync().catch(() => process.env as Record<string, string>)
    const currentPath = env?.PATH ?? env?.Path ?? process.env.PATH ?? ''
    const sep = isWindows() ? ';' : ':'
    return {
      JAVA_HOME: javaHome,
      PATH: [join(javaHome, 'bin'), currentPath].filter(Boolean).join(sep)
    }
  }

  private async _initKRaft(version: SoftInstalled, javaHome: string) {
    const paths = this._instancePaths(version)
    if (existsSync(join(paths.dataDir, 'meta.properties'))) {
      return
    }
    const storageBin = this._storageBin(version)
    const env = await this._javaEnv(javaHome)
    const opt = {
      cwd: version.path,
      env,
      timeout: KAFKA_VERSION_COMMAND_TIMEOUT_MS
    }
    let uuid = ''
    try {
      const res = await execPromiseWithEnv(`"${storageBin}" random-uuid`, opt)
      uuid =
        res.stdout
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
          .pop() ?? ''
    } catch (e: any) {
      throw new Error(KafkaT('kraftUuidFailed', { error: e?.stderr ?? e?.message ?? e }))
    }
    if (!uuid) {
      throw new Error(KafkaT('kraftUuidEmpty'))
    }
    try {
      // Static quorum: controller.quorum.voters is set in server.properties, so
      // `format` must run WITHOUT --standalone/--initial-controllers (Kafka rejects
      // combining them: "You cannot specify controller.quorum.voters and format
      // the node with --initial-controllers or --standalone").
      await execPromiseWithEnv(
        `"${storageBin}" format -t ${uuid} -c "${paths.serverProperties}"`,
        opt
      )
    } catch (e: any) {
      throw new Error(KafkaT('kraftFormatFailed', { error: e?.stderr ?? e?.message ?? e }))
    }
  }

  _startServer(version: SoftInstalled, params?: KafkaStartParams) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })
      let java: { javaHome: string; javaBin: string; javaMajor: number }
      try {
        java = await validateKafkaJava(params?.javaHome)
      } catch (e) {
        reject(e)
        return
      }
      const paths = this._instancePaths(version)
      try {
        await this._fixRunClassBat(version.bin)
        await this.initConfig(version).on(on)
        await mkdirp(paths.dataDir)
        await mkdirp(paths.logsDir)
        await this._initKRaft(version, java.javaHome)
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
        const execEnv = [
          `set "JAVA_HOME=${java.javaHome}"`,
          `set "PATH=${join(java.javaHome, 'bin')};%PATH%"`,
          `set "LOG_DIR=${paths.logsDir}"`,
          `set "KAFKA_HEAP_OPTS=-Xmx1G -Xms1G"`
        ].join('\n')
        try {
          await serviceStartExecCMD({
            version,
            pidPath: this.pidPath,
            baseDir: paths.instanceDir,
            bin: join(version.path, 'bin/windows/kafka-server-start.bat'),
            execArgs: `"${paths.serverProperties}"`,
            execEnv,
            on,
            checkPidFile: false
          })
        } catch (e: any) {
          console.log('kafka start err: ', e)
          reject(e)
          return
        }
        const checkpid = async (time = 0): Promise<void> => {
          let pids: string[] = []
          try {
            const all = await ProcessListSearch('kafka.Kafka', false)
            pids = all
              .filter((item) => item.COMMAND.includes(version.path))
              .map((item) => `${item.PID}`)
          } catch {}
          if (pids.length > 0) {
            const pid = pids[0]
            try {
              await writeFile(this.pidPath, pid)
            } catch {}
            on({
              'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid }))
            })
            resolve({
              'APP-Service-Start-PID': pid
            })
          } else if (time < KAFKA_STARTUP_CHECK_TIMES) {
            await waitTime(500)
            await checkpid(time + 1)
          } else {
            await failStart()
          }
        }
        await checkpid()
      } else {
        const execEnv: Record<string, string> = {
          JAVA_HOME: java.javaHome,
          PATH: (await this._javaEnv(java.javaHome)).PATH!,
          LOG_DIR: paths.logsDir,
          KAFKA_HEAP_OPTS: '-Xmx1G -Xms1G'
        }
        try {
          const started = await serviceStartSpawn({
            version,
            pidPath: this.pidPath,
            baseDir: paths.instanceDir,
            bin: join(version.path, 'bin/kafka-server-start.sh'),
            execArgs: [paths.serverProperties],
            execEnv,
            cwd: version.path,
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
        // kafka-server-start.sh execs the JVM, so the spawned pid is the broker
        // process itself. Poll the pid file and fail fast if the JVM dies during
        // broker boot (KRaft/controller errors land in the startup error log).
        const checkpid = async (time = 0): Promise<void> => {
          let pid = ''
          try {
            if (existsSync(this.pidPath)) {
              pid = (await readFile(this.pidPath, 'utf-8')).trim()
            }
          } catch {}
          pid = pid || launcherPid
          if (pid && isLauncherAlive()) {
            on({
              'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid }))
            })
            resolve({
              'APP-Service-Start-PID': pid
            })
          } else if (time < KAFKA_STARTUP_CHECK_TIMES) {
            await waitTime(500)
            await checkpid(time + 1)
          } else {
            await failStart()
          }
        }
        await checkpid()
      }
    })
  }

  /**
   * Kafka stop hooks: the plugin bundles Base from src, whose `_stopServer`
   * name-search map and signal switch know nothing about 'kafka'. Base's
   * `_stopServer` reuses these hooks for pid discovery and the kill signal;
   * Kafka only supplies its JVM process name and -TERM (unix) preference.
   */
  protected _stopSearchName(): string | undefined {
    return 'kafka.Kafka'
  }

  protected _stopSignal(): string {
    return '-TERM'
  }

  private _binRelativePath(): string {
    return isWindows() ? 'bin/windows/kafka-server-start.bat' : 'bin/kafka-server-start.sh'
  }

  private _appDirOf(version: string): string {
    return join(global.Server.AppDir!, 'kafka', version)
  }

  private _legacyAppDirOf(version: string): string {
    return join(global.Server.AppDir!, `static-kafka-${version}`)
  }

  private async _fetchOnlineList(): Promise<OnlineVersionItem[]> {
    const arch = global.Server.Arch === 'x86_64' ? 'x86' : 'arm'
    if (isWindows()) {
      return await KafkaVersionFetch.win()
    } else if (isMacOS()) {
      return await KafkaVersionFetch.mac(arch)
    } else if (isLinux()) {
      return await KafkaVersionFetch.linux(arch)
    }
    return []
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        let all: OnlineVersionItem[] = await this._fetchOnlineList()
        if (all.length === 0) {
          // The Apache CDN/archive check chain can silently fail on a cold
          // network (every error degrades to an empty list). Retry once so the
          // first page visit does not end up with an empty version table.
          await waitTime(1500)
          all = await this._fetchOnlineList()
        }
        const binRel = this._binRelativePath()
        all.forEach((a: any) => {
          const appDir = this._appDirOf(a.version)
          const legacyAppDir = this._legacyAppDirOf(a.version)
          const bin = join(appDir, binRel)
          const legacyBin = join(legacyAppDir, binRel)
          const zip = join(global.Server.Cache!, `kafka_2.13-${a.version}.tgz`)
          a.appDir = existsSync(legacyBin) && !existsSync(bin) ? legacyAppDir : appDir
          a.zip = zip
          a.bin = existsSync(legacyBin) && !existsSync(bin) ? legacyBin : bin
          a.downloaded = existsSync(zip)
          a.installed = existsSync(bin) || existsSync(legacyBin)
          a.name = `Kafka-${a.version}`
        })
        resolve(all)
      } catch {
        resolve([])
      }
    })
  }

  /**
   * Kafka's bin/windows/kafka-run-class.bat builds CLASSPATH by concatenating
   * every jar in libs/ one by one. Under deep install dirs the `set` command
   * line grows past cmd.exe's 8191-char limit ("The input line is too long"),
   * which breaks both service startup and every CLI wrapper. Replacing the
   * per-jar loop with a single `libs\*` wildcard entry keeps the line short;
   * the JVM expands wildcard classpaths natively. Idempotent.
   */
  private async _fixRunClassBat(bin: string) {
    if (!isWindows() || !bin) {
      return
    }
    const root = dirname(dirname(dirname(bin)))
    const file = join(root, 'bin/windows/kafka-run-class.bat')
    if (!existsSync(file)) {
      return
    }
    try {
      const content = await readFile(file, 'utf-8')
      if (content.includes('call :concat "%BASE_DIR%\\libs\\*"')) {
        return
      }
      const fixed = content.replace(
        /for %%i in \("%BASE_DIR%\\libs\\\*"\) do \(\r?\n\s*call :concat "%%i"\r?\n\)/,
        'call :concat "%BASE_DIR%\\libs\\*"'
      )
      if (fixed !== content) {
        await writeFile(file, fixed)
      }
    } catch {}
  }

  /**
   * Read the Kafka version from the libs/ jar names (kafka_2.13-X.Y.Z.jar /
   * kafka-clients-X.Y.Z.jar). This avoids spawning `kafka-topics.bat
   * --version`, which starts a JVM per version and, on Windows, can fail
   * outright when the install path is deep (cmd 8191-char line limit).
   */
  private async _versionFromLibs(bin: string): Promise<string> {
    if (!bin) {
      return ''
    }
    // Windows: <root>/bin/windows/kafka-server-start.bat; unix: <root>/bin/kafka-server-start.sh
    const root = isWindows() ? dirname(dirname(dirname(bin))) : dirname(dirname(bin))
    const libsDir = join(root, 'libs')
    if (!existsSync(libsDir)) {
      return ''
    }
    try {
      const files = await readdir(libsDir)
      const patterns = [
        /^kafka-clients-(\d+(\.\d+){1,3})\.jar$/,
        /^kafka_2\.\d+-(\d+(\.\d+){1,3})\.jar$/
      ]
      for (const file of files) {
        for (const pattern of patterns) {
          const match = file.match(pattern)
          if (match?.[1]) {
            return match[1]
          }
        }
      }
    } catch {}
    return ''
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise(async (resolve) => {
      try {
        const binName = isWindows() ? 'kafka-server-start.bat' : 'kafka-server-start'
        const binPaths = isWindows()
          ? ['bin/windows/kafka-server-start.bat']
          : ['bin/kafka-server-start.sh']
        const fetched = await versionLocalFetch(
          setup?.kafka?.dirs ?? [],
          binName,
          'kafka',
          binPaths
        )
        const versions = versionFilterSame(fetched)
        const checks = versions.map(async (item) => {
          const jarVersion = await this._versionFromLibs(item.bin)
          if (jarVersion) {
            return { version: jarVersion, error: undefined }
          }
          // Fall back to the CLI for installs without a libs dir (e.g. custom
          // layouts). Patch kafka-run-class.bat first or the command fails on
          // deep Windows paths.
          await this._fixRunClassBat(item.bin)
          const topicsBin = isWindows()
            ? join(dirname(item.bin), 'kafka-topics.bat')
            : join(dirname(item.bin), 'kafka-topics.sh')
          const command = `"${topicsBin}" --version`
          const reg = /(.*?)(\d+(\.\d+){1,3})(.*?)/g
          return await TaskQueue.run(
            versionBinVersion,
            item.bin,
            command,
            reg,
            false,
            KAFKA_VERSION_COMMAND_TIMEOUT_MS
          )
        })
        const results = await Promise.all(checks)
        results.forEach((result, index) => {
          const { error, version } = result
          const num = version ? Number(versionFixed(version).split('.').slice(0, 2).join('')) : null
          Object.assign(versions[index], {
            version,
            num,
            enable: !!version,
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

  getConfigFiles(version?: SoftInstalled): Array<{ name: string; path: string }> {
    if (!version?.version) return []
    const paths = this._instancePaths(version)
    return [
      { name: 'server.properties', path: paths.serverProperties },
      { name: 'server-default.properties', path: paths.serverDefaultProperties }
    ]
  }

  getLogFiles(version?: SoftInstalled): Array<{ name: string; path: string }> {
    if (!version?.version) return []
    const paths = this._instancePaths(version)
    return [
      ...(version ? this.startupLogFiles(version) : []),
      { name: 'server.log', path: join(paths.logsDir, 'server.log') },
      { name: 'controller.log', path: join(paths.logsDir, 'controller.log') },
      { name: 'state-change.log', path: join(paths.logsDir, 'state-change.log') },
      { name: 'log-cleaner.log', path: join(paths.logsDir, 'log-cleaner.log') },
      { name: 'kafkaServer-gc.log', path: join(paths.logsDir, 'kafkaServer-gc.log') }
    ]
  }

  private _topicsBin(version: SoftInstalled): string {
    if (isWindows()) {
      return join(version.path, 'bin/windows/kafka-topics.bat')
    }
    return join(version.path, 'bin/kafka-topics.sh')
  }

  private async _bootstrapServer(version: SoftInstalled): Promise<string> {
    try {
      const paths = this._instancePaths(version)
      if (existsSync(paths.serverProperties)) {
        const content = await readFile(paths.serverProperties, 'utf-8')
        const line = content
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l.startsWith('advertised.listeners='))
        const match = line?.match(/PLAINTEXT:\/\/([^,\s]+)/)
        if (match?.[1]) {
          return match[1]
        }
      }
    } catch {}
    return KAFKA_DEFAULT_BOOTSTRAP_SERVER
  }

  /**
   * Fail fast with a clear message when the broker is not listening. Without
   * this, kafka-topics.sh retries until the exec timeout and rejects with a
   * wall of AdminClient NetworkClient WARN lines.
   */
  private async _ensureBrokerReachable(server: string) {
    const sep = server.lastIndexOf(':')
    let host = sep > 0 ? server.slice(0, sep) : ''
    const port = Number(server.slice(sep + 1))
    if (!host) host = '127.0.0.1'
    if (!Number.isInteger(port) || port <= 0) {
      throw new Error(KafkaT('brokerUnavailable', { server }))
    }
    await new Promise<void>((resolve, reject) => {
      const socket = createConnection({ host, port })
      const fail = () => {
        socket.destroy()
        reject(new Error(KafkaT('brokerUnavailable', { server })))
      }
      socket.setTimeout(3000)
      socket.once('connect', () => {
        socket.end()
        resolve()
      })
      socket.once('timeout', fail)
      socket.once('error', fail)
    })
  }

  private async _topicsExec(version: SoftInstalled, javaHome: string, args: string) {
    const home = `${javaHome ?? ''}`.trim()
    if (!home) {
      throw new Error(KafkaT('javaBindRequired', { min: KAFKA_MIN_JAVA_MAJOR }))
    }
    const topicsBin = this._topicsBin(version)
    if (!existsSync(topicsBin)) {
      throw new Error(I18nT('fork.binNotFound'))
    }
    await this._fixRunClassBat(version.bin)
    const env = await this._javaEnv(home)
    try {
      return await execPromiseWithEnv(`"${topicsBin}" ${args}`, {
        cwd: version.path,
        env,
        timeout: KAFKA_TOPIC_COMMAND_TIMEOUT_MS
      })
    } catch (e: any) {
      throw new Error(e?.stderr ?? e?.message ?? `${e}`)
    }
  }

  fetchTopics(version: SoftInstalled, javaHome: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const server = await this._bootstrapServer(version)
        await this._ensureBrokerReachable(server)
        const res = await this._topicsExec(version, javaHome, `--bootstrap-server ${server} --list`)
        const topics = res.stdout
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b))
        resolve(topics)
      } catch (e) {
        reject(e)
      }
    })
  }

  createTopic(version: SoftInstalled, javaHome: string, name: string, partitions: number) {
    return new ForkPromise(async (resolve, reject) => {
      const topic = `${name ?? ''}`.trim()
      if (!/^[a-zA-Z0-9._-]{1,200}$/.test(topic)) {
        reject(new Error(KafkaT('invalidTopicName', { topic })))
        return
      }
      const num = Number(partitions)
      if (!Number.isInteger(num) || num < 1 || num > 100) {
        reject(new Error(KafkaT('invalidTopicPartitions', { partitions })))
        return
      }
      try {
        const server = await this._bootstrapServer(version)
        await this._ensureBrokerReachable(server)
        await this._topicsExec(
          version,
          javaHome,
          `--bootstrap-server ${server} --create --topic "${topic}" --partitions ${num} --replication-factor 1`
        )
        resolve(true)
      } catch (e) {
        reject(e)
      }
    })
  }

  deleteTopic(version: SoftInstalled, javaHome: string, name: string) {
    return new ForkPromise(async (resolve, reject) => {
      const topic = `${name ?? ''}`.trim()
      if (!/^[a-zA-Z0-9._-]{1,200}$/.test(topic)) {
        reject(new Error(KafkaT('invalidTopicName', { topic })))
        return
      }
      try {
        const server = await this._bootstrapServer(version)
        await this._ensureBrokerReachable(server)
        await this._topicsExec(
          version,
          javaHome,
          `--bootstrap-server ${server} --delete --topic "${topic}"`
        )
        resolve(true)
      } catch (e) {
        reject(e)
      }
    })
  }
}
export default new Kafka()
