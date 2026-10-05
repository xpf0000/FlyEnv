import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
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
  versionMacportsFetch,
  versionSort,
  readFile,
  writeFile,
  mkdirp,
  chmod,
  remove,
  zipUnpack,
  moveChildDirToParent,
  createWriteStream,
  waitTime
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import TaskQueue from '../../TaskQueue'
import axios from 'axios'
import YAML from 'yamljs'
import { appDebugLog, isWindows, pathFixedToUnix } from '@shared/utils'
import { spawnPromise } from '@shared/child-process'
import { serviceStartSpawn } from '../../util/ServiceStart'
import { DbGateRuntime, type DbGateOpenResult } from '../DbGate'
import { fetchLoopbackListeningPids } from '@shared/Process.win'

class Manager extends Base {
  mongoshVersion = '2.5.2'
  private _dbGateRuntime?: DbGateRuntime

  constructor() {
    super()
    this.type = 'mongodb'
  }

  private get dbGateRuntime() {
    if (!this._dbGateRuntime) {
      this._dbGateRuntime = new DbGateRuntime(global.Server.BaseDir!)
    }
    return this._dbGateRuntime
  }

  init() {
    this.pidPath = join(global.Server.MongoDBDir!, 'mongodb.pid')
  }

  getConfigFiles(version?: SoftInstalled) {
    const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
    if (!v) return []
    return [{ name: 'main', path: join(global.Server.MongoDBDir!, `mongodb-${v}.conf`) }]
  }

  getLogFiles(version?: SoftInstalled) {
    const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
    if (!v) return []
    const dbGate = this.dbGateRuntime.paths
    return [
      { name: 'log', path: join(global.Server.MongoDBDir!, `mongodb-${v}.log`) },
      { name: 'dbgate-start-out', path: dbGate.startOut },
      { name: 'dbgate-start-error', path: dbGate.startError },
      { name: 'dbgate', path: join(dbGate.log, 'dbgate.log') }
    ]
  }

  initMongosh() {
    return new ForkPromise(async (resolve) => {
      const version = this.mongoshVersion
      const mongosh = join(global.Server.AppDir!, 'mongosh', version, 'bin/mongosh.exe')
      if (existsSync(mongosh)) {
        return resolve(true)
      }
      const appDir = join(global.Server.AppDir!, 'mongosh', version)
      const url = `https://downloads.mongodb.com/compass/mongosh-${version}-win32-x64.zip`
      const zip = join(global.Server.Cache!, `mongosh-${version}.zip`)
      const doInstall = async () => {
        if (existsSync(zip)) {
          try {
            await remove(appDir)
            await mkdirp(appDir)
            await zipUnpack(zip, appDir)
            await moveChildDirToParent(appDir)
            return existsSync(mongosh)
          } catch {
            await remove(zip)
          }
        }
        return false
      }

      const installRes = await doInstall()
      if (installRes) {
        return resolve(true)
      }

      try {
        const response = await axios({
          method: 'get',
          url: url,
          responseType: 'stream'
        })

        const writer = createWriteStream(zip)
        response.data.pipe(writer)
        writer.on('finish', async () => {
          const installRes = await doInstall()
          if (installRes) {
            return resolve(true)
          }
          return resolve(false)
        })
        writer.on('error', () => {
          resolve(false)
        })
      } catch {
        resolve(false)
      }
    })
  }

  openDbGate(node: SoftInstalled): ForkPromise<DbGateOpenResult> {
    return new ForkPromise((resolve, reject, on) => {
      if (!node?.bin) {
        reject(new Error(I18nT('base.needSelectVersion')))
        return
      }
      this.dbGateRuntime.open(node, on).then(resolve).catch(reject)
    })
  }

  /** 面板可以单独打开；它只关闭 DbGate，不能把 Node 版本传给 mongod 的停止策略。 */
  companionStopArgs(command: string, pid: string, args: any[]): any[] | undefined {
    if (command === 'openDbGate') return [{ ...args[0], pid }, { dbGateOnly: true }]
  }

  _stopServer(
    version: SoftInstalled,
    options?: { dbGateOnly?: boolean }
  ): ForkPromise<{ 'APP-Service-Stop-PID': number[] }> {
    return new ForkPromise(async (resolve, reject, on) => {
      // DbGate 属于模块停止的一部分，失败不能伪装为整个服务已停止。
      // 独立面板的登记 PID 仅供其 runtime 恢复；常规数据库停止不能传 mongod PID。
      const dbGatePids = await this.dbGateRuntime.stop(
        options?.dbGateOnly ? version.pid : undefined
      )
      if (options?.dbGateOnly) {
        resolve({ 'APP-Service-Stop-PID': dbGatePids.map(Number) })
        return
      }
      const mergePids = (result: { 'APP-Service-Stop-PID'?: Array<string | number> }) => {
        result['APP-Service-Stop-PID'] = Array.from(
          new Set([...(result['APP-Service-Stop-PID'] ?? []), ...dbGatePids])
        )
        resolve(result as { 'APP-Service-Stop-PID': number[] })
      }

      if (!isWindows()) {
        super._stopServer(version).on(on).then(mergePids).catch(reject)
        return
      }
      on({ 'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceBegin', { service: this.type })) })
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const configFile = join(global.Server.MongoDBDir!, `mongodb-${v}.conf`)
      const targets = await this.windowsServiceTargets(version, [configFile])
      let finalList = targets.list
      const mongosh = join(global.Server.AppDir!, 'mongosh', this.mongoshVersion, 'bin/mongosh.exe')
      if (targets.pids.length) {
        if (existsSync(mongosh)) {
          // 停止时不下载软件。读当前配置的端口，并验证监听者属于本次服务目标，
          // 避免固定 27017 意外关闭另一个 MongoDB。认证/TLS 自定义配置失败会保留错误。
          const config = YAML.parse(await readFile(configFile, 'utf8'))
          // 缺少显式端口时保留 MongoDB 官方默认 27017；进程归属仍由本实例标记确认。
          const port = Number(config?.net?.port ?? 27017)
          if (!Number.isInteger(port) || port < 1 || port > 65535)
            throw new Error('Invalid MongoDB port')
          const owners = await fetchLoopbackListeningPids(`${port}`)
          // 多监听者时必须全部属于已确认目标；仅其中一个属于 FlyEnv 不能证明
          // 本次连接会落到它，禁止向共享该端口的其他实例发送 shutdownServer。
          if (!owners.length || owners.some((pid) => !targets.pids.includes(pid))) {
            throw new Error('MongoDB listening port does not belong to this service instance')
          }
          let shutdownError: unknown
          try {
            // 绝对程序路径及参数数组支持中文/空格；连接只指向已经核对的本地端口。
            // MongoDB 关闭会断开客户端连接，最终以真实进程消失判断成功。
            await spawnPromise(
              mongosh,
              [
                `mongodb://127.0.0.1:${port}/admin?directConnection=true&serverSelectionTimeoutMS=3000`,
                '--quiet',
                '--eval',
                'db.getSiblingDB("admin").shutdownServer()'
              ],
              { cwd: dirname(mongosh), shell: false, timeout: 30_000, windowsHide: true }
            )
          } catch (error) {
            shutdownError = error
          }
          try {
            finalList = await this.waitWindowsServiceExit(targets.pids, 10_000, targets.list)
          } catch (error) {
            // 不记录完整数据库连接/命令；失败到达统一 stopService 终态并保留登记。
            await appDebugLog(
              '[MongoDB][stop][incomplete]',
              'Database shutdown did not complete'
            ).catch(() => {})
            throw shutdownError ?? error
          }
        } else {
          // 缺少 mongosh 时交给 Base 统一树停止与等待，传入首次归属快照及 CREATED 身份。
          finalList = await this.stopWindowsServiceProcesses(targets.pids, targets.list)
        }
      }
      if (targets.pids.some((pid) => finalList.some(({ PID }) => PID === pid))) {
        throw new Error('MongoDB is still running after the stop request')
      }
      // 空目标沿用首次发现快照；公共清理只删候选已退出且文件值仍匹配的 PID。
      await this.cleanupStoppedServicePidFiles(
        [...targets.candidates, ...targets.pids, `${version.pid ?? ''}`].filter(Boolean),
        finalList
      )
      on({ 'APP-Service-Stop-Success': true })
      on({ 'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceEnd', { service: this.type })) })
      mergePids({ 'APP-Service-Stop-PID': targets.pids })
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
      const bin = version.bin
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MongoDBDir!, `mongodb-${v}.conf`)
      const dataDir = join(global.Server.MongoDBDir!, `data-${v}`)
      if (!existsSync(dataDir)) {
        await mkdirp(dataDir)
        await chmod(dataDir, '0777')
      }
      if (!existsSync(m)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        const tmpl = join(global.Server.Static!, 'tmpl/mongodb.conf')
        let conf = await readFile(tmpl, 'utf-8')
        conf = conf.replace('##DB-PATH##', pathFixedToUnix(dataDir))
        await writeFile(m, conf)
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: m }))
        })
      }
      const logPath = join(global.Server.MongoDBDir!, `mongodb-${v}.log`)

      const baseDir = global.Server.MongoDBDir!
      const execArgs = ['--config', m, '--logpath', logPath, '--pidfilepath', this.pidPath]
      try {
        const res = await serviceStartSpawn({
          version,
          pidPath: this.pidPath,
          baseDir,
          bin,
          execArgs,
          on,
          waitTime: 2000
        })
        resolve(res)
      } catch (e: any) {
        console.log('-k start err: ', e)
        reject(e)
        return
      }
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('mongodb')
        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `mongodb-${a.version}`, 'bin/mongod.exe')
          const zip = join(global.Server.Cache!, `mongodb-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `mongodb-${a.version}`)
          a.zip = zip
          a.bin = dir

          const dirOld = join(
            global.Server.AppDir!,
            `mongodb-${a.version}`,
            `mongodb-win32-x86_64-windows-${a.version}`,
            'bin/mongod.exe'
          )

          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir) || existsSync(dirOld)
          a.name = `MongoDB-${a.version}`
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
        all = [versionLocalFetch(setup?.mongodb?.dirs ?? [], 'mongod.exe')]
      } else {
        all = [
          versionLocalFetch(setup?.mongodb?.dirs ?? [], 'mongod', 'mongodb-'),
          versionMacportsFetch(['bin/mongod', 'sbin/mongod'])
        ]
      }

      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" --version`
            const reg = /(v)(\d+(\.\d+){1,4})(.*?)/g
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

  async _installSoftHandle(row: any): Promise<void> {
    if (isWindows()) {
      await remove(row.appDir)
      await mkdirp(row.appDir)
      await zipUnpack(row.zip, row.appDir)
      await moveChildDirToParent(row.appDir)
      await waitTime(1000)
      await this.initMongosh()
    }
  }

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        let all: Array<string> = []
        const command = 'brew search -q --formula "/mongodb-(community|enterprise)(@[\\d\\.]+)?$/"'
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
        `"^mongodb\\d*$"`,
        (f) => {
          return f.includes('high-performance, schema-free, document-oriented')
        },
        () => {
          return (
            existsSync(join('/opt/local/bin', 'mongod')) ||
            existsSync(join('/opt/local/sbin', 'mongod'))
          )
        }
      )
      resolve(Info)
    })
  }
}
export default new Manager()
