import { I18nT } from '@lang/index'
import { createWriteStream, existsSync } from 'fs'
import { dirname, join } from 'path'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  execPromiseWithEnv,
  waitTime,
  readFile,
  writeFile,
  remove,
  mkdirp,
  zipUnpack
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import axios from 'axios'
import * as http from 'http'
import * as https from 'https'
import { type PItem, ProcessSearch } from '@shared/Process'
import Helper from '../../Helper'
import { isLinux, isMacOS, isWindows } from '@shared/utils'
import { unpack } from '../../util/Zip'
import { ProcessPidList } from '@shared/Process.win'

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
            execPromiseWithEnv(command, {
              env: {
                HOMEBREW_NO_INSTALL_FROM_API: 1
              }
            })
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

  stopService(version: SoftInstalled, ...args: any) {
    return this._stopServer(version, ...args)
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
      try {
        await this._stopServer(version, ...args).on(on)
        const res = await this._startServer(version, ...args).on(on)
        if (res?.['APP-Service-Start-PID']) {
          const pid = res['APP-Service-Start-PID']
          const appPidFile = join(global.Server.BaseDir!, `pid/${this.type}.pid`)
          await mkdirp(dirname(appPidFile))
          await writeFile(appPidFile, pid.trim())
        }
        resolve(res)
      } catch (e) {
        reject(e)
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

      if (isWindows()) {
        plist = await ProcessPidList()
      } else {
        plist = (await Helper.send('tools', 'processList')) as any
      }
      on({
        'APP-Service-Stop-Success': true
      })
      const appPidFile = join(global.Server.BaseDir!, `pid/${this.type}.pid`)
      if (existsSync(appPidFile)) {
        const pid = (await readFile(appPidFile, 'utf-8')).trim()
        allPid.push(pid)
        const list = ProcessSearch(pid, false, plist).map((p) => p.PID)
        allPid.push(...list)
      }
      if (version?.pid) {
        allPid.push(version.pid)
        const list = ProcessSearch(version.pid, false, plist).map((p) => p.PID)
        allPid.push(...list)
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
        ollama: 'ollama'
      }
      const serverName = dis?.[this.type]
      if (serverName) {
        if (isWindows()) {
          const all = ProcessSearch(serverName, false, plist)
            .filter((item) => item.COMMAND.includes('PhpWebStudy-Data'))
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
            await Helper.send('tools', 'kill', '-INT', arr)
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
              sig = '-TERM'
              break
            default:
              sig = '-INT'
              break
          }
          try {
            await Helper.send('tools', 'kill', sig, arr)
          } catch {}
        }
      }
      if (existsSync(appPidFile)) {
        await remove(appPidFile)
      }
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
    const proxyUrl =
      Object.values(global?.Server?.Proxy ?? {})?.find((s: string) => s.includes('://')) ?? ''
    let proxy: any = {}
    if (proxyUrl) {
      try {
        const u = new URL(proxyUrl)
        proxy.protocol = u.protocol.replace(':', '')
        proxy.host = u.hostname
        proxy.port = u.port
      } catch {
        proxy = undefined
      }
    } else {
      proxy = undefined
    }
    console.log('getAxiosProxy: ', proxy)
    return proxy
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
