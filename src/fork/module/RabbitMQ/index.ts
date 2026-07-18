import { dirname, join } from 'path'
import { existsSync, readdirSync, realpathSync } from 'fs'
import { Base } from '../Base'
import { I18nT } from '@lang/runtime'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  brewSearch,
  portSearch,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  waitTime,
  writeFile,
  mkdirp,
  unlink,
  readFile,
  execPromise,
  serviceStartExecCMD,
  readdir,
  remove,
  zipUnpack,
  moveChildDirToParent
} from '../../Fn'
import { serviceStartSpawn } from '../../util/ServiceStart'
import { ForkPromise } from '@shared/ForkPromise'
import TaskQueue from '../../TaskQueue'
import Helper from '../../Helper'
import { isWindows, pathFixedToUnix } from '@shared/utils'
import { ProcessListSearch } from '@shared/Process.win'
import type { PItem } from '@shared/Process'
import EnvSync from '@shared/EnvSync'
class RabbitMQ extends Base {
  baseDir: string = ''

  constructor() {
    super()
    this.type = 'rabbitmq'
  }

  init() {
    this.baseDir = join(global.Server.BaseDir!, 'rabbitmq')
    this.pidPath = join(this.baseDir, 'rabbitmq.pid')
  }

  async _resolveErlangHome() {
    const env = await EnvSync.sync().catch(() => process.env)
    const envHome = `${env?.ERLANG_HOME ?? env?.Erlang_Home ?? ''}`.trim()
    if (envHome && existsSync(envHome)) {
      return envHome
    }
    const appDir = global.Server.AppDir
    if (!appDir || !existsSync(appDir)) {
      return ''
    }
    try {
      const dirs = (await readdir(appDir))
        .filter((dir) => /^erlang-/i.test(dir))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      for (const dir of dirs) {
        const erlangHome = join(appDir, dir)
        if (existsSync(join(erlangHome, 'bin/erl.exe'))) {
          return erlangHome
        }
      }
    } catch {}
    return ''
  }

  initConfig(version: SoftInstalled) {
    return new ForkPromise((resolve, reject) => {
      if (!existsSync(version?.bin)) {
        reject(new Error(I18nT('fork.binNotFound')))
        return
      }
      if (!version?.version) {
        reject(new Error(I18nT('fork.versionNotFound')))
        return
      }
      this._initConf(version).then(resolve)
    })
  }
  _initConf(version: SoftInstalled): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject, on) => {
      const v = version?.version?.split('.')?.[0] ?? ''
      let confFile = ''
      if (isWindows()) {
        confFile = join(this.baseDir, `rabbitmq-${v}.bat`)
      } else {
        confFile = join(this.baseDir, `rabbitmq-${v}.conf`)
      }
      const logDir = join(this.baseDir, `log-${v}`)
      await mkdirp(logDir)
      if (!existsSync(confFile)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        const pluginsDir = join(version.path, 'plugins')
        const mnesiaBaseDir = join(this.baseDir, `mnesia-${v}`)
        // Enable the management UI (port 15672) via an enabled_plugins file referenced
        // by RABBITMQ_ENABLED_PLUGINS_FILE (sourced from the conf env file at boot).
        // This is escript-free, unlike `rabbitmq-plugins enable`, which needs erl on
        // PATH and a writable HOME and fails under the Helper on some setups.
        const enabledPluginsFile = join(this.baseDir, `enabled_plugins-${v}`)
        await writeFile(enabledPluginsFile, '[rabbitmq_management].')
        let content = ''
        if (isWindows()) {
          content = `set "NODE_IP_ADDRESS=127.0.0.1"
set "NODENAME=rabbit@localhost"
set "RABBITMQ_LOG_BASE=${logDir}"
set "MNESIA_BASE=${mnesiaBaseDir}"
set "RABBITMQ_ENABLED_PLUGINS_FILE=${enabledPluginsFile}"
set "PLUGINS_DIR=${pluginsDir}"`
        } else {
          content = `NODE_IP_ADDRESS=127.0.0.1
NODENAME=rabbit@localhost
RABBITMQ_LOG_BASE=${pathFixedToUnix(logDir)}
MNESIA_BASE=${pathFixedToUnix(mnesiaBaseDir)}
RABBITMQ_ENABLED_PLUGINS_FILE="${pathFixedToUnix(enabledPluginsFile)}"
PLUGINS_DIR="${pathFixedToUnix(pluginsDir)}"`
        }
        await writeFile(confFile, content)
        const defaultFile = join(this.baseDir, `rabbitmq-${v}-default.conf`)
        await writeFile(defaultFile, content)
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: confFile }))
        })
      }
      resolve(confFile)
    })
  }

  async _initPlugin(version: SoftInstalled) {
    try {
      const baseDir = dirname(version.bin)
      if (isWindows()) {
        process.chdir(baseDir)
        await execPromise(`rabbitmq-plugins.bat enable rabbitmq_management`, {
          cwd: baseDir
        })
      } else {
        await Helper.send('rabbitmq', 'initPlugin', baseDir)
      }
    } catch (e: any) {
      console.log('_initPlugin err: ', e)
    }
  }

  async _initEPMD() {
    let pids: PItem[] | undefined
    try {
      pids = await ProcessListSearch('epmd.exe', false)
    } catch {}
    if (pids && pids.length > 0) {
      return
    }
    const str = await this._resolveErlangHome()
    console.log('ERLANG_HOME: ', str)
    if (!str || !existsSync(str)) {
      return
    }
    const dirs = await readdir(str)
    for (const dir of dirs) {
      const bin = join(str, dir, 'bin/epmd.exe')
      console.log('epmd.exe: ', bin)
      if (existsSync(bin)) {
        console.log('epmd.exe existsSync: ', bin)
        process.chdir(dirname(bin))
        try {
          await EnvSync.sync()
          await execPromise(`start /B ./epmd.exe > NUL 2>&1`, {
            cwd: dirname(bin),
            shell: EnvSync.CMDPath || 'cmd.exe'
          })
        } catch (e: any) {
          console.log('epmd.exe start error: ', e)
        }
        break
      }
    }
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })
      if (isWindows()) {
        try {
          await this._initEPMD()
        } catch {}
      }
      const confFile = await this._initConf(version).on(on)
      const v = version?.version?.split('.')?.[0] ?? ''
      const mnesiaBaseDir = join(this.baseDir, `mnesia-${v}`)
      await mkdirp(mnesiaBaseDir)
      const checkpid = async (time = 0) => {
        // RabbitMQ self-daemonizes through Erlang/epmd: the launcher exits once the
        // broker is up while beam.smp keeps running. In `-detached` mode the broker
        // writes <NODENAME>.pid (e.g. rabbit@localhost.pid) into MNESIA_BASE with its
        // real PID — wait for it to confirm a successful start.
        const all = readdirSync(mnesiaBaseDir)
        const pidFileName = all.find((p) => p.endsWith('.pid'))
        const pid = pidFileName
          ? (await readFile(join(mnesiaBaseDir, pidFileName), 'utf-8')).trim()
          : ''
        if (pid) {
          on({
            'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid }))
          })
          resolve({
            'APP-Service-Start-PID': pid
          })
        } else {
          if (time < 60) {
            await waitTime(500)
            await checkpid(time + 1)
          } else {
            on({
              'APP-On-Log': AppLog(
                'error',
                I18nT('appLog.execStartCommandFail', {
                  error: I18nT('fork.startFail'),
                  service: `${this.type}-${version.version}`
                })
              )
            })
            reject(new Error(I18nT('fork.startFail')))
          }
        }
      }
      try {
        const all = readdirSync(mnesiaBaseDir)
        const pid = all.find((p) => p.endsWith('.pid'))
        if (pid) {
          await unlink(join(mnesiaBaseDir, pid))
        }
      } catch {}

      const bin = version.bin
      const baseDir = this.baseDir
      if (isWindows()) {
        const execArgs = `-detached`
        const erlangHome = await this._resolveErlangHome()
        const execEnv = [
          `set "RABBITMQ_CONF_ENV_FILE=${confFile}"`,
          erlangHome ? `set "ERLANG_HOME=${erlangHome}"` : '',
          erlangHome ? `set "PATH=${join(erlangHome, 'bin')};%PATH%"` : ''
        ]
          .filter(Boolean)
          .join('\n')
        try {
          await serviceStartExecCMD({
            version,
            pidPath: this.pidPath,
            baseDir,
            bin,
            execArgs,
            execEnv,
            on,
            checkPidFile: false
          })
        } catch (e: any) {
          console.log('-k start err: ', e)
          reject(e)
          return
        }
      } else {
        // RabbitMQ's Erlang/epmd architecture decouples the broker from the launcher:
        // the `rabbitmq-server` wrapper process exits once the broker is up, while the
        // beam.smp keeps running under epmd. serviceStartSpawn would treat that launcher
        // exit as a startup failure, so we DON'T trust its result — checkpid() (polling
        // the broker's .pid in mnesiaBaseDir) is the source of truth. We pass `-detached`
        // so the broker fully self-daemonizes; no start script is landed to disk.
        const execEnv: Record<string, string> = {
          RABBITMQ_CONF_ENV_FILE: confFile
        }
        try {
          await serviceStartSpawn({
            version,
            pidPath: this.pidPath,
            baseDir,
            bin,
            execArgs: ['-detached'],
            execEnv,
            on,
            waitTime: 1000
          })
        } catch {
          // Expected: the detached launcher exits immediately. The broker keeps booting;
          // checkpid() below confirms it actually came up (or times out → real failure).
        }
      }
      await checkpid()
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('rabbitmq')
        all.forEach((a: any) => {
          let dir = ''
          let zip = ''
          if (isWindows()) {
            dir = join(global.Server.AppDir!, `rabbitmq-${a.version}`, 'sbin/rabbitmq-server.bat')
            zip = join(global.Server.Cache!, `rabbitmq-${a.version}.zip`)
            a.appDir = join(global.Server.AppDir!, `rabbitmq-${a.version}`)
          } else {
            dir = join(
              global.Server.AppDir!,
              `static-rabbitmq-${a.version}`,
              'sbin/rabbitmq-server'
            )
            zip = join(global.Server.Cache!, `static-rabbitmq-${a.version}.tar.xz`)
            a.appDir = join(global.Server.AppDir!, `static-rabbitmq-${a.version}`)
          }
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `RabbitMQ-${a.version}`
        })
        resolve(all)
      } catch {
        resolve({})
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise(async (resolve) => {
      if (isWindows()) {
        try {
          await this._initEPMD()
        } catch {}
      }
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [versionLocalFetch(setup?.rabbitmq?.dirs ?? [], 'rabbitmq-server.bat')]
      } else {
        all = [versionLocalFetch(setup?.rabbitmq?.dirs ?? [], 'rabbitmq-server', 'rabbitmq')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          if (isWindows()) {
            let pids: PItem[] = []
            try {
              pids = await ProcessListSearch('epmd.exe', false)
            } catch {}
            const all = versions.map((item) => {
              if (pids.length === 0) {
                return Promise.resolve({
                  error: I18nT('fork.noEPMD'),
                  version: undefined
                })
              }
              const bin = join(dirname(item.bin), 'rabbitmqctl.bat')
              const command = `"${bin}" version`
              const reg = /(.*?)(\d+(\.\d+){1,4})(.*?)/g
              return TaskQueue.run(versionBinVersion, bin, command, reg)
            })
            return Promise.all(all)
          } else {
            if (existsSync('/opt/local/lib/rabbitmq/bin/rabbitmq-server')) {
              const bin = realpathSync('/opt/local/lib/rabbitmq/bin/rabbitmq-server')
              versions.push({
                bin: bin,
                path: dirname(dirname(bin)),
                run: false,
                running: false
              } as any)
            }

            versions = versions.filter((v) => existsSync(join(v.path, 'plugins')))

            const all = versions.map((item) => {
              const bin = join(dirname(item.bin), 'rabbitmqctl')
              const command = `"${bin}" version`
              const reg = /(.*?)(\d+(\.\d+){1,4})(.*?)/g
              return TaskQueue.run(versionBinVersion, bin, command, reg)
            })
            return Promise.all(all)
          }
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
              enable: !!version,
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
    if (isWindows()) {
      await remove(row.appDir)
      await mkdirp(row.appDir)
      await zipUnpack(row.zip, row.appDir)
      await moveChildDirToParent(row.appDir)
    }
  }

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        let all: Array<string> = ['rabbitmq']
        const command = 'brew search -q --formula "/^rabbitmq$/"'
        all = await brewSearch(all, command)
        const info = await brewInfoJson(all)
        resolve(info)
      } catch (e) {
        reject(e)
        return
      }
    })
  }

  portinfo() {
    return new ForkPromise(async (resolve) => {
      const Info: { [k: string]: any } = await portSearch(
        `"^rabbitmq-server\\d*$"`,
        (f) => {
          return f.includes('The RabbitMQ AMQP Server')
        },
        () => {
          return existsSync('/opt/local/sbin/rabbitmq-server')
        }
      )
      resolve(Info)
    })
  }

  getConfigFiles(version?: SoftInstalled): Array<{ name: string; path: string }> {
    const v = version?.version?.split('.')?.[0] ?? ''
    if (!v) return []
    const confExt = isWindows() ? 'bat' : 'conf'
    return [
      { name: `rabbitmq-${v}.${confExt}`, path: join(this.baseDir, `rabbitmq-${v}.${confExt}`) },
      {
        name: `rabbitmq-${v}-default.conf`,
        path: join(this.baseDir, `rabbitmq-${v}-default.conf`)
      },
      { name: `enabled_plugins-${v}`, path: join(this.baseDir, `enabled_plugins-${v}`) }
    ]
  }

  getLogFiles(version?: SoftInstalled): Array<{ name: string; path: string }> {
    const v = version?.version?.split('.')?.[0] ?? ''
    if (!v) return []
    const logDir = join(this.baseDir, `log-${v}`)
    return [
      {
        name: 'rabbit@localhost.log',
        path: join(logDir, 'rabbit@localhost.log')
      }
    ]
  }
}
export default new RabbitMQ()
