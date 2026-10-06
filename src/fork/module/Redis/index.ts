import { dirname, join } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import { I18nT } from '@lang/runtime'
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
  readFile,
  writeFile,
  mkdirp,
  chmod,
  copyFile,
  waitTime
} from '../../Fn'
import { serviceStartSpawn } from '../../util/ServiceStart'
import { ForkPromise } from '@shared/ForkPromise'
import TaskQueue from '../../TaskQueue'
import { isWindows, pathFixedToUnix } from '@shared/utils'
import { ProcessListSearch } from '@shared/Process.win'
import { RedisCommanderRuntime, type RedisCommanderOpenResult } from './RedisCommander'

class Redis extends Base {
  private _redisCommanderRuntime?: RedisCommanderRuntime

  constructor() {
    super()
    this.type = 'redis'
  }

  private get redisCommanderRuntime() {
    if (!this._redisCommanderRuntime) {
      this._redisCommanderRuntime = new RedisCommanderRuntime(global.Server.BaseDir!)
    }
    return this._redisCommanderRuntime
  }

  init() {
    this.pidPath = join(global.Server.RedisDir!, 'redis.pid')
  }

  getConfigFiles(version?: SoftInstalled) {
    const v = version?.version?.split('.')?.[0] ?? ''
    if (!v) return []
    return [{ name: 'main', path: join(global.Server.RedisDir!, `redis-${v}.conf`) }]
  }

  getLogFiles(version?: SoftInstalled) {
    const v = version?.version?.split('.')?.[0] ?? ''
    if (!v) return []
    const redisCommander = this.redisCommanderRuntime.paths
    return [
      { name: 'log', path: join(global.Server.RedisDir!, `redis-${v}.log`) },
      { name: 'redis-commander-start-out', path: redisCommander.startOut },
      { name: 'redis-commander-start-error', path: redisCommander.startError }
    ]
  }

  openRedisCommander(
    node: SoftInstalled,
    redis: SoftInstalled
  ): ForkPromise<RedisCommanderOpenResult> {
    return new ForkPromise((resolve, reject, on) => {
      this.redisCommanderRuntime.open(node, redis, on).then(resolve).catch(reject)
    })
  }

  initConf(version: SoftInstalled) {
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
      const confFile = join(global.Server.RedisDir!, `redis-${v}.conf`)
      if (!existsSync(confFile)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        const tmplFile = join(global.Server.Static!, 'tmpl/redis.conf')
        const dbDir = join(global.Server.RedisDir!, `db-${v}`)
        await mkdirp(dbDir)
        try {
          await chmod(dbDir, '0755')
        } catch {}
        let content = await readFile(tmplFile, 'utf-8')
        content = content
          .replace(/#PID_PATH#/g, pathFixedToUnix(join(global.Server.RedisDir!, 'redis.pid')))
          .replace(/#LOG_PATH#/g, pathFixedToUnix(join(global.Server.RedisDir!, `redis-${v}.log`)))
          .replace(/#DB_PATH#/g, pathFixedToUnix(dbDir))
        await writeFile(confFile, content)
        const defaultFile = join(global.Server.RedisDir!, `redis-${v}-default.conf`)
        await writeFile(defaultFile, content)
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: confFile }))
        })
      }
      resolve(confFile)
    })
  }

  /** Commander 独立登记时只回收面板，不能用其 Node bin 去停止 Redis。 */
  companionStopArgs(command: string, pid: string, args: any[]): any[] | undefined {
    if (command === 'openRedisCommander') return [{ ...args[0], pid }, { commanderOnly: true }]
  }

  _stopServer(
    version: SoftInstalled,
    options?: { commanderOnly?: boolean }
  ): ForkPromise<{ 'APP-Service-Stop-PID': string[] }> {
    return new ForkPromise(async (resolve, reject, on) => {
      // companion 失败必须随模块停止返回失败；退出与界面不能各自吞掉这项清理。
      const redisCommanderPids = await this.redisCommanderRuntime.stop()
      if (options?.commanderOnly) {
        resolve({ 'APP-Service-Stop-PID': redisCommanderPids })
        return
      }
      const mergePids = (result: { 'APP-Service-Stop-PID'?: Array<string | number> }) => {
        result['APP-Service-Stop-PID'] = Array.from(
          new Set([...(result['APP-Service-Stop-PID'] ?? []), ...redisCommanderPids])
        )
        resolve(result as { 'APP-Service-Stop-PID': string[] })
      }

      if (!isWindows()) {
        super._stopServer(version).on(on).then(mergePids).catch(reject)
        return
      }

      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceBegin', { service: this.type }))
      })
      // 与 Base/PHP 共用权限树停止；相对配置路径的根由实际可执行路径确认。
      // 不再通过 PATH 拼 taskkill 或吞取消/执行失败，确认真实退出才报告成功。
      const modulePidBefore = existsSync(this.pidPath) ? await this.readPidFromFile() : ''
      const targets = await this.windowsServiceTargets(version)
      const arr = targets.pids
      // 原树退出确认和文件清理复用共享的最终列表，避免同一停止再开 CIM。
      const finalList = await this.stopWindowsServiceProcesses(arr, targets.list)
      await this.cleanupStoppedServicePidFiles(
        [...arr, ...targets.candidates, modulePidBefore],
        finalList
      )
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceEnd', { service: this.type }))
      })
      mergePids({
        'APP-Service-Stop-PID': arr
      })
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
      const confFile = await this._initConf(version)

      const bin = version.bin
      const baseDir = global.Server.RedisDir!
      await mkdirp(baseDir)
      const execEnv = ''

      if (isWindows()) {
        const v = version?.version?.split('.')?.[0] ?? ''
        const confName = `redis-${v}.conf`
        const conf = join(global.Server.RedisDir!, confName)
        const appConfName = `pws-app-redis-${v}.conf`
        const runConf = join(dirname(bin), appConfName)
        await copyFile(conf, runConf)

        const execArgs = [appConfName]

        try {
          const res = await serviceStartSpawn({
            version,
            pidPath: this.pidPath,
            baseDir,
            bin,
            execArgs,
            on
          })
          resolve(res)
        } catch (e: any) {
          console.log('-k start err: ', e)
          // daemonize yes 时 redis 自后台化、初始进程秒退, serviceStartSpawn 会误判失败.
          // 回退: 按命令行特征 (含 appConfName) 查找真实运行的 redis 进程确认是否启动成功.
          // 不依赖 pidfile 的 PID —— msys2 版 redis daemonize 会多次 fork, pidfile 记录的 PID
          // 可能是已退出的中间进程, 与最终工作进程不一致 (与 _stopServer 用同样的查找方式).
          let started = false
          let realPid = ''
          for (let i = 0; i < 10; i++) {
            const list = await ProcessListSearch(appConfName, false)
            if (list.length > 0) {
              started = true
              realPid = list[0].PID
              break
            }
            await waitTime(500)
          }
          if (started) {
            resolve({ 'APP-Service-Start-PID': realPid })
            return
          }
          reject(e)
          return
        }
      } else {
        const execArgs = `"${confFile}"`
        try {
          const res = await serviceStartExec({
            version,
            pidPath: this.pidPath,
            baseDir,
            bin,
            execArgs,
            execEnv,
            on
          })
          resolve(res)
        } catch (e: any) {
          console.log('-k start err: ', e)
          reject(e)
          return
        }
      }
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('redis')
        all.forEach((a: any) => {
          const dir = join(
            global.Server.AppDir!,
            `redis-${a.version}`,
            `Redis-${a.version}-Windows-x64-msys2`,
            'redis-server.exe'
          )
          const zip = join(global.Server.Cache!, `redis-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `redis-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `Redis-${a.version}`
        })
        resolve(all)
      } catch {
        resolve([])
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [versionLocalFetch(setup?.redis?.dirs ?? [], 'redis-server.exe')]
      } else {
        all = [versionLocalFetch(setup?.redis?.dirs ?? [], 'redis-server', 'redis')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" -v`
            const reg = /([=\s])(\d+(\.\d+){1,4})(.*?)/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
          return Promise.all(all)
        })
        .then(async (list) => {
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

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        let all: Array<string> = ['redis']
        const command = 'brew search -q --formula "/^redis@[\\d\\.]+$/"'
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
        `"^redis\\d*$"`,
        (f) => {
          return f.includes('Redis is an open source, advanced key-value store.')
        },
        (name) => {
          return existsSync(join('/opt/local/bin', `${name}-server`))
        }
      )
      resolve(Info)
    })
  }
}
export default new Redis()
