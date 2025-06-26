import { dirname, join } from 'path'
import { existsSync, readdirSync, realpathSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '@lang/index'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  brewSearch,
  portSearch,
  serviceStartExec,
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
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import TaskQueue from '../TaskQueue'
import Helper from '../Helper'
import { isMacOS, isWindows, pathFixedToUnix } from '@shared/utils'
import { ProcessListSearch } from '@shared/Process.win'
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
      const confFile = join(this.baseDir, `rabbitmq-${v}.conf`)
      const logDir = join(this.baseDir, `log-${v}`)
      await mkdirp(logDir)
      if (!existsSync(confFile)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        await this._initPlugin(version)
        const pluginsDir = join(version.path, 'plugins')
        const mnesiaBaseDir = join(this.baseDir, `mnesia-${v}`)
        const content = `NODE_IP_ADDRESS=127.0.0.1
NODENAME=rabbit@localhost
RABBITMQ_LOG_BASE=${pathFixedToUnix(logDir)}
MNESIA_BASE=${pathFixedToUnix(mnesiaBaseDir)}
PLUGINS_DIR="${pathFixedToUnix(pluginsDir)}"`
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
      if (isMacOS()) {
        await Helper.send('rabbitmq', 'initPlugin', baseDir)
      } else if (isWindows()) {
        process.chdir(baseDir)
        await execPromise(`rabbitmq-plugins.bat enable rabbitmq_management`, {
          cwd: baseDir
        })
      }
    } catch (e: any) {
      console.log('_initPlugin err: ', e)
    }
  }

  async _initEPMD() {
    const pids = await ProcessListSearch('epmd.exe', false)
    if (pids.length > 0) {
      return
    }
    let str = ''
    try {
      const stdout = (
        await execPromise(
          'Write-Host "##FlyEnv-ERLANG_HOME$($env:ERLANG_HOME)FlyEnv-ERLANG_HOME##"',
          {
            shell: 'powershell.exe'
          }
        )
      ).stdout.trim()
      const regex = /FlyEnv-ERLANG_HOME(.*?)FlyEnv-ERLANG_HOME/g
      const match = regex.exec(stdout)
      if (match) {
        str = match[1] // 捕获组 (\d+) 的内容
      }
    } catch (e: any) {
      console.log('set ERLANG_HOME error: ', e)
    }
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
          await execPromise(`start /B ./epmd.exe > NUL 2>&1`, {
            cwd: dirname(bin),
            shell: 'cmd.exe'
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
        await this._initEPMD()
      }
      const confFile = await this._initConf(version).on(on)
      const v = version?.version?.split('.')?.[0] ?? ''
      const mnesiaBaseDir = join(this.baseDir, `mnesia-${v}`)
      await mkdirp(mnesiaBaseDir)
      const checkpid = async (time = 0) => {
        const all = readdirSync(mnesiaBaseDir)
        const pidFile = all.find((p) => p.endsWith('.pid'))
        if (pidFile) {
          const pid = (await readFile(join(mnesiaBaseDir, pidFile), 'utf-8')).trim()
          on({
            'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid }))
          })
          resolve({
            'APP-Service-Start-PID': pid
          })
        } else {
          if (time < 20) {
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
      const execArgs = `-detached`
      if (isMacOS()) {
        const execEnv = `export RABBITMQ_CONF_ENV_FILE="${confFile}"`
        try {
          await serviceStartExec({
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
      } else if (isWindows()) {
        const execEnv = `set "RABBITMQ_CONF_ENV_FILE=${confFile}"`
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
          if (isMacOS()) {
            dir = join(
              global.Server.AppDir!,
              `static-rabbitmq-${a.version}`,
              'sbin/rabbitmq-server'
            )
            zip = join(global.Server.Cache!, `static-rabbitmq-${a.version}.tar.xz`)
            a.appDir = join(global.Server.AppDir!, `static-rabbitmq-${a.version}`)
          } else if (isWindows()) {
            dir = join(global.Server.AppDir!, `rabbitmq-${a.version}`, 'sbin/rabbitmq-server.bat')
            zip = join(global.Server.Cache!, `rabbitmq-${a.version}.zip`)
            a.appDir = join(global.Server.AppDir!, `rabbitmq-${a.version}`)
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
        await this._initEPMD()
      }
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isMacOS()) {
        all = [versionLocalFetch(setup?.rabbitmq?.dirs ?? [], 'rabbitmq-server', 'rabbitmq')]
      } else if (isWindows()) {
        all = [versionLocalFetch(setup?.rabbitmq?.dirs ?? [], 'rabbitmq-server.bat')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          if (isWindows()) {
            const pids = await ProcessListSearch('epmd.exe', false)
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
              return TaskQueue.run(versionBinVersion, item.bin, command, reg)
            })
            return Promise.all(all)
          } else if (isMacOS()) {
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
              return TaskQueue.run(versionBinVersion, item.bin, command, reg)
            })
            return Promise.all(all)
          }
          return Promise.resolve([])
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
        `^rabbitmq-server\\d*$`,
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
}
export default new RabbitMQ()
