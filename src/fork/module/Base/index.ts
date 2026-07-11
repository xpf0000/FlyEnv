import { I18nT } from '@lang/index'
import { createWriteStream, existsSync } from 'fs'
import { join } from 'path'
import { userInfo } from 'os'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  execPromiseWithEnv,
  waitTime,
  readFile,
  writeFile,
  remove,
  mkdirp,
  zipUnpack,
  chmod
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import axios from 'axios'
import * as http from 'http'
import * as https from 'https'
import { type PItem, ProcessKill, ProcessOwnedPidsByPid, ProcessSearch } from '@shared/Process'
import { isLinux, isMacOS, isWindows } from '@shared/utils'
import { unpack } from '../../util/Zip'
import { StopProcessListFetch } from '@shared/StopProcessList'
import { getAxiosProxy } from '../../util/Axios'
import Helper from '../../Helper'

export class Base {
  type: string
  pidPath: string
  constructor() {
    this.type = ''
    this.pidPath = ''
  }

  exec(fnName: string, ...args: any) {
    // @ts-ignore
    const fn: (...args: any) => ForkPromise<any> = this?.[fnName] as any
    if (fn) {
      return fn.call(this, ...args)
    }
    return new ForkPromise((resolve, reject) => {
      reject(new Error(`No Found Function: ${fnName}`))
    })
  }

  _startServer(version: SoftInstalled, ...args: any): ForkPromise<any> {
    console.log(version)
    console.log(args)
    return new ForkPromise<any>((resolve) => {
      resolve(true)
    })
  }

  _linkVersion(version: SoftInstalled): ForkPromise<any> {
    return new ForkPromise(async (resolve) => {
      if (isWindows()) {
        resolve(true)
        return
      }
      if (version && version?.bin) {
        try {
          const v = version.bin
            .split(global.Server.BrewCellar + '/')
            .pop()
            ?.split('/')?.[0]
          if (v) {
            const command = `brew unlink ${v} && brew link --overwrite --force ${v}`
            console.log('_linkVersion: ', command)
            execPromiseWithEnv(command)
              .then(() => {})
              .catch(() => {})
            resolve(true)
          } else {
            resolve(I18nT('fork.versionError'))
          }
        } catch (e: any) {
          resolve(e.toString())
        }
      } else {
        resolve(I18nT('base.needSelectVersion'))
      }
    })
  }

  protected appPidFile() {
    return join(global.Server.BaseDir!, `pid/${this.type}.pid`)
  }

  /**
   * 配置文件清单。各服务模块覆写自己的（部分服务按版本，故接收 version）。
   * 返回 [] 表示该模块不支持/无配置文件。name 是人类可读标识（如 'main' / 'error'）。
   * 只返回 name + path，不返回内容——FlyEnv 是本地工具，AI 代理自行读文件。
   */
  getConfigFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    return []
  }

  /** 日志文件清单。各服务模块覆写自己的。 */
  getLogFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    return []
  }

  /** fork 可调：返回配置文件清单（存在性标记），供 MCP read_config 用 */
  listConfigFiles(
    version?: SoftInstalled
  ): ForkPromise<Array<{ name: string; path: string; exists: boolean }>> {
    return new ForkPromise((resolve) => {
      resolve(this.getConfigFiles(version).map((f) => ({ ...f, exists: existsSync(f.path) })))
    })
  }

  /** fork 可调：返回日志文件清单（存在性标记），供 MCP read_log 用 */
  listLogFiles(
    version?: SoftInstalled
  ): ForkPromise<Array<{ name: string; path: string; exists: boolean }>> {
    return new ForkPromise((resolve) => {
      resolve(this.getLogFiles(version).map((f) => ({ ...f, exists: existsSync(f.path) })))
    })
  }

  stopService(version: SoftInstalled, ...args: any) {
    return this._stopServer(version, ...args)
  }

  protected async ensureAppPidDirWritable() {
    const pidDir = join(global.Server.BaseDir!, 'pid')
    const probeFile = join(
      pidDir,
      `.flyenv-write-test-${this.type}-${process.pid}-${Date.now()}.tmp`
    )
    let lastError: any

    const verifyWritable = async () => {
      await mkdirp(pidDir)
      await writeFile(probeFile, '')
      await remove(probeFile).catch(() => {})
    }

    try {
      await verifyWritable()
      return
    } catch (e) {
      lastError = e
    }

    await remove(probeFile).catch(() => {})

    try {
      if (existsSync(pidDir)) {
        await chmod(pidDir, '0755')
      }
      await verifyWritable()
      return
    } catch (e) {
      lastError = e
    }

    await remove(probeFile).catch(() => {})

    if (!isWindows()) {
      try {
        const uinfo = userInfo()
        await Helper.send('redis', 'logFileFixed', pidDir, `${uinfo.uid}:${uinfo.gid}`)
        await chmod(pidDir, '0755').catch(() => {})
        await verifyWritable()
        return
      } catch (e) {
        lastError = e
      }
    }

    await remove(probeFile).catch(() => {})

    try {
      await Helper.send('tools', 'rm', pidDir)
      await verifyWritable()
      return
    } catch (e) {
      lastError = e
    }

    await remove(probeFile).catch(() => {})
    const error = lastError instanceof Error ? lastError.message : `${lastError}`
    throw new Error(`PID directory is not writable: ${pidDir}. ${error}`)
  }

  /** 读取模块自己的 pid 文件，只取首行根 PID，兼容 postmaster.pid 这类多行状态文件。 */
  protected async readPidFromFile(pidFile = this.pidPath): Promise<string> {
    if (!pidFile || !existsSync(pidFile)) {
      return ''
    }
    const content = (await readFile(pidFile, 'utf-8')).trim()
    if (!content) {
      return ''
    }
    return (
      content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean) ?? ''
    )
  }

  protected async saveAppPid(pid: string | number) {
    const appPidFile = this.appPidFile()
    await this.ensureAppPidDirWritable()
    await remove(appPidFile).catch(() => {})
    await writeFile(appPidFile, `${pid}`.trim())
    await chmod(appPidFile, '0755').catch(() => {})
  }

  /** 生成用于校验 PID 归属的路径标记，只有命令行仍命中这些标记时才允许按 PID 回收。 */
  protected ownedProcessMarkers(version: SoftInstalled): string[] {
    return Array.from(
      new Set(
        [version?.bin, version?.path, global.Server.BaseDir, global.Server.AppDir].filter(
          (item): item is string => !!item?.trim()
        )
      )
    )
  }

  startService(version: SoftInstalled, ...args: any) {
    return new ForkPromise(async (resolve, reject, on) => {
      if (!isWindows() && !existsSync(version?.bin) && version.typeFlag !== 'ftp-srv') {
        reject(new Error(I18nT('fork.binNotFound')))
        return
      }
      if (!version?.version) {
        reject(new Error(I18nT('fork.versionNotFound')))
        return
      }
      try {
        this._linkVersion(version)
      } catch {}
      let res: any
      try {
        await this._stopServer(version, ...args).on(on)
        await this.ensureAppPidDirWritable()
        res = await this._startServer(version, ...args).on(on)
        resolve(res)
      } catch (e) {
        console.error('startService error: ', e)
        return reject(e)
      }

      try {
        if (res?.['APP-Service-Start-PID']) {
          const pid = res['APP-Service-Start-PID']
          await this.saveAppPid(pid)
        }
      } catch (e) {
        console.error('save app pid error: ', e)
      }
    })
  }

  _stopServer(version: SoftInstalled, ...args: any) {
    console.log(version)
    console.log(args)
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceBegin', { service: this.type }))
      })
      let plist: PItem[] = []
      const allPid: string[] = []
      try {
        plist = await StopProcessListFetch()
      } catch (e) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.processListFail'))
        })
        reject(e)
      }
      on({
        'APP-Service-Stop-Success': true
      })
      const appPidFile = this.appPidFile()
      const ownedMarkers = this.ownedProcessMarkers(version)
      try {
        const appPid = await this.readPidFromFile(appPidFile)
        if (appPid) {
          allPid.push(...ProcessOwnedPidsByPid(appPid, plist, ownedMarkers))
        }
      } catch {}
      try {
        const pid = await this.readPidFromFile()
        if (pid) {
          allPid.push(...ProcessOwnedPidsByPid(pid, plist, ownedMarkers))
        }
      } catch {}
      if (version?.pid) {
        allPid.push(...ProcessOwnedPidsByPid(version.pid, plist, ownedMarkers))
      }
      const dis: { [k: string]: string } = {
        caddy: 'caddy',
        nginx: 'nginx',
        apache: 'httpd',
        mysql: 'mysqld',
        mariadb: 'mariadbd',
        memcached: 'memcached',
        mongodb: 'mongod',
        postgresql: 'postgres',
        'pure-ftpd': 'pure-ftpd',
        tomcat: 'org.apache.catalina.startup.Bootstrap',
        rabbitmq: 'rabbit',
        elasticsearch: 'org.elasticsearch.server/org.elasticsearch.bootstrap.Elasticsearch',
        ollama: 'ollama',
        cliproxyapi: 'cli-proxy-api',
        rnacos: 'rnacos',
        frankenphp: 'frankenphp',
        roadrunner: 'rr',
        'swoole-cli': 'swoole-cli',
        numa: 'numa'
      }
      const serverName = dis?.[this.type]
      if (serverName) {
        if (isWindows()) {
          const all = ProcessSearch(serverName, false, plist)
            .filter(
              (item) =>
                item.COMMAND.includes('PhpWebStudy-Data') || item.COMMAND.includes('FlyEnv-Data')
            )
            .map((m) => `${m.PID}`)
          allPid.push(...all)
        } else {
          const pids = ProcessSearch(serverName, false, plist)
            .filter((p) => {
              return (
                (p.COMMAND.includes(global.Server.BaseDir!) ||
                  p.COMMAND.includes(global.Server.AppDir!)) &&
                !p.COMMAND.includes(' grep ') &&
                !p.COMMAND.includes(' /bin/sh -c') &&
                !p.COMMAND.includes('/Contents/MacOS/') &&
                !p.COMMAND.startsWith('/bin/bash ') &&
                !p.COMMAND.includes('brew.rb ') &&
                !p.COMMAND.includes(' install ') &&
                !p.COMMAND.includes(' uninstall ') &&
                !p.COMMAND.includes(' link ') &&
                !p.COMMAND.includes(' unlink ')
              )
            })
            .map((p) => p.PID)
          allPid.push(...pids)
        }
      }
      console.log('_stopServer searchName pids: ', serverName, [...allPid])

      const arr: string[] = Array.from(new Set(allPid))
      if (isWindows()) {
        if (arr.length > 0) {
          try {
            await ProcessKill('-INT', arr)
          } catch {}
        }
      } else {
        if (arr.length > 0) {
          let sig = ''
          switch (this.type) {
            case 'mysql':
            case 'mariadb':
            case 'mongodb':
            case 'tomcat':
            case 'rabbitmq':
            case 'elasticsearch':
            case 'etcd':
            case 'numa':
              sig = '-TERM'
              break
            default:
              sig = '-INT'
              break
          }
          try {
            await ProcessKill(sig, arr)
          } catch {}
        }
      }
      try {
        if (existsSync(appPidFile)) {
          await remove(appPidFile)
        }
      } catch {}
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceEnd', { service: this.type }))
      })
      resolve({
        'APP-Service-Stop-PID': arr
      })
    })
  }

  async waitPidFile(
    pidFile: string,
    errLog?: string,
    maxTime = 20,
    time = 0
  ): Promise<
    | {
        pid?: string
        error?: string
      }
    | false
  > {
    let res:
      | {
          pid?: string
          error?: string
        }
      | false = false
    if (existsSync(pidFile)) {
      const pid = (await readFile(pidFile, 'utf-8')).trim()
      return {
        pid
      }
    } else {
      if (time < maxTime) {
        await waitTime(500)
        res = res || (await this.waitPidFile(pidFile, errLog, maxTime, time + 1))
      } else {
        let error = ''
        if (errLog && existsSync(errLog)) {
          error = (await readFile(errLog, 'utf-8')).trim()
        }
        if (error.length > 0) {
          res = {
            error
          }
        } else {
          res = false
        }
      }
    }
    console.log('waitPid: ', time, res)
    return res
  }

  getAxiosProxy() {
    return getAxiosProxy()
  }

  async _fetchOnlineVersion(app: string): Promise<OnlineVersionItem[]> {
    let list: OnlineVersionItem[] = []
    try {
      let data: any = {}
      if (isMacOS()) {
        data = {
          app,
          os: 'mac',
          arch: global.Server.Arch === 'x86_64' ? 'x86' : 'arm'
        }
      } else if (isWindows()) {
        data = {
          app,
          os: 'win',
          arch: 'x86'
        }
      } else if (isLinux()) {
        data = {
          app,
          os: 'linux',
          arch: global.Server.Arch === 'x86_64' ? 'x86' : 'arm'
        }
      }
      const res = await axios({
        url: 'https://api.one-env.com/api/version/fetch',
        method: 'post',
        data,
        timeout: 30000,
        withCredentials: false,
        httpAgent: new http.Agent({ keepAlive: false }),
        httpsAgent: new https.Agent({ keepAlive: false }),
        proxy: this.getAxiosProxy()
      })
      list = res?.data?.data ?? []
    } catch (e) {
      console.log('_fetchOnlineVersion: err', e)
    }
    return list
  }

  async _installSoftHandle(row: any) {
    if (isWindows()) {
      await zipUnpack(row.zip, row.appDir)
    } else {
      const dir = row.appDir
      await mkdirp(dir)
      await unpack(row.zip, dir)
    }
  }

  installSoft(row: any) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.startInstall', { service: row?.name ?? '' }))
      })
      try {
        await mkdirp(global.Server.Cache!)
        await mkdirp(global.Server.AppDir!)
      } catch {}

      const refresh = () => {
        row.downloaded = existsSync(row.zip)
        row.installed = existsSync(row.bin)
      }
      const end = () => {
        refresh()
        if (row.installed) {
          row.downState = 'success'
          row.progress = 100
          on(row)
          resolve(true)
        } else {
          row.downState = 'exception'
          on(row)
          resolve(false)
        }
      }

      const fail = async () => {
        try {
          await remove(row.zip)
          await remove(row.appDir)
        } catch {}
      }

      if (existsSync(row.zip)) {
        row.progress = 100
        on(row)
        let success = false
        try {
          await this._installSoftHandle(row)
          success = true
          refresh()
        } catch {
          refresh()
        }
        if (success) {
          row.downState = 'success'
          row.progress = 100
          resolve(true)
          return
        }
        await fail()
      }

      axios({
        method: 'get',
        url: row.url,
        proxy: this.getAxiosProxy(),
        responseType: 'stream',
        onDownloadProgress: (progress) => {
          if (progress.total) {
            row.progress = Math.round((progress.loaded * 100.0) / progress.total)
            on(row)
          }
        }
      })
        .then((response) => {
          const stream = createWriteStream(row.zip)
          response.data.pipe(stream)
          stream.on('error', async (err: any) => {
            console.log('stream error: ', err)
            await fail()
            end()
          })
          stream.on('finish', async () => {
            row.downState = 'success'
            try {
              if (existsSync(row.zip)) {
                await this._installSoftHandle(row)
              }
              refresh()
            } catch {
              refresh()
            }
            on(row)
            end()
          })
        })
        .catch(async (err) => {
          console.log('down error: ', err)
          await fail()
          end()
        })
    })
  }
}
