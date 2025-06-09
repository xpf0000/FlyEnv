import { dirname, join } from 'path'
import { existsSync, readdirSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '@lang/index'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  execPromise,
  serviceStartExecCMD,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  waitTime,
  mkdirp,
  readdir,
  readFile,
  remove,
  writeFile
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import TaskQueue from '../TaskQueue'
import { ProcessListSearch } from '../Process'

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
    return new ForkPromise((resolve, reject, on) => {
      if (!existsSync(version?.bin)) {
        reject(new Error(I18nT('fork.binNoFound')))
        return
      }
      if (!version?.version) {
        reject(new Error(I18nT('fork.versionNoFound')))
        return
      }
      this._initConf(version).on(on).then(resolve)
    })
  }

  _initPlugin(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.initPlugin', { command: `rabbitmq-plugins.bat enable rabbitmq_management` })
        )
      })
      process.chdir(dirname(version.bin))
      try {
        const res = await execPromise(`rabbitmq-plugins.bat enable rabbitmq_management`)
        console.log('rabbitmq _initPlugin: ', res)
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.initPluginSuccess'))
        })
      } catch (e: any) {
        on({
          'APP-On-Log': AppLog('error', I18nT('appLog.initPluginFail', { error: e }))
        })
      }
      resolve(true)
    })
  }

  _initConf(version: SoftInstalled): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject, on) => {
      const v = version?.version?.split('.')?.[0] ?? ''
      const confFile = join(this.baseDir, `rabbitmq-${v}.bat`)
      const logDir = join(this.baseDir, `log-${v}`)
      await mkdirp(logDir)
      if (!existsSync(confFile)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        await this._initPlugin(version).on(on)
        const pluginsDir = join(version.path, 'plugins')
        const mnesiaBaseDir = join(this.baseDir, `mnesia-${v}`)
        const content = `set "NODE_IP_ADDRESS=127.0.0.1"
set "NODENAME=rabbit@localhost"
set "RABBITMQ_LOG_BASE=${logDir}"
set "MNESIA_BASE=${mnesiaBaseDir}"
set "PLUGINS_DIR=${pluginsDir}"`
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

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.erlangEnvInit'))
      })
      await this._initEPMD()
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.erlangEnvInitEnd'))
      })
      const confFile = await this._initConf(version).on(on)
      const v = version?.version?.split('.')?.[0] ?? ''
      const mnesiaBaseDir = join(this.baseDir, `mnesia-${v}`)
      await mkdirp(mnesiaBaseDir)

      try {
        const all = readdirSync(mnesiaBaseDir)
        const pid = all.find((p) => p.endsWith('.pid'))
        if (pid) {
          await remove(join(mnesiaBaseDir, pid))
        }
      } catch {}

      const checkpid = async (time = 0) => {
        const all = readdirSync(mnesiaBaseDir)
        const pidFile = all.find((p) => p.endsWith('.pid'))
        if (pidFile) {
          const pid = (await readFile(join(mnesiaBaseDir, pidFile), 'utf-8')).trim()
          await writeFile(this.pidPath, `${pid}`)
          on({
            'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: pid }))
          })
          resolve({
            'APP-Service-Start-PID': pid
          })
        } else {
          if (time < 20) {
            await waitTime(500)
            await checkpid(time + 1)
          } else {
            const msg = I18nT('fork.startFail')
            on({
              'APP-On-Log': AppLog(
                'error',
                I18nT('appLog.startServiceFail', {
                  error: msg,
                  service: `${this.type}-${version.version}`
                })
              )
            })
            reject(new Error(msg))
          }
        }
      }

      const bin = version.bin
      const baseDir = this.baseDir
      await mkdirp(baseDir)
      const execEnv = `set "RABBITMQ_CONF_ENV_FILE=${confFile}"`
      const execArgs = `-detached`

      try {
        await serviceStartExecCMD(
          version,
          this.pidPath,
          baseDir,
          bin,
          execArgs,
          execEnv,
          on,
          20,
          500,
          false
        )
      } catch (e: any) {
        console.log('-k start err: ', e)
        reject(e)
        return
      }
      await checkpid()
    })
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('rabbitmq')
        all.forEach((a: any) => {
          const dir = join(
            global.Server.AppDir!,
            `rabbitmq-${a.version}`,
            'sbin/rabbitmq-server.bat'
          )
          const zip = join(global.Server.Cache!, `rabbitmq-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `rabbitmq-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
        })
        resolve(all)
      } catch {
        resolve({})
      }
    })
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

  allInstalledVersions(setup: any) {
    return new ForkPromise(async (resolve) => {
      await this._initEPMD()
      let versions: SoftInstalled[] = []
      Promise.all([versionLocalFetch(setup?.rabbitmq?.dirs ?? [], 'rabbitmq-server.bat')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const pids = await ProcessListSearch('epmd.exe', false)
          const all = versions.map((item) => {
            if (pids.length === 0) {
              return Promise.resolve({
                error: I18nT('fork.noEPMD'),
                version: undefined
              })
            }
            const command = `rabbitmqctl.bat version`
            const reg = /(.*?)(\d+(\.\d+){1,4})(.*?)/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
          return Promise.all(all)
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
}
export default new RabbitMQ()
