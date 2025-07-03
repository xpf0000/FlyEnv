import { I18nT } from '@lang/index'
import { createWriteStream, existsSync } from 'fs'
import { dirname, join } from 'path'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  execPromise,
  execPromiseWithEnv,
  waitTime,
  readFile,
  writeFile,
  remove,
  mkdirp,
  zipUnPack
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import axios from 'axios'
import * as http from 'http'
import * as https from 'https'
import { ProcessPidsByPid, ProcessSearch } from '@shared/Process'
import Helper from '../Helper'
import { isMacOS, isWindows } from '@shared/utils'
import { ProcessListSearch, ProcessPidListByPid } from '@shared/Process.win'

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

  stopService(version: SoftInstalled) {
    return this._stopServer(version)
  }

  startService(version: SoftInstalled, ...args: any) {
    return new ForkPromise(async (resolve, reject, on) => {
      if (!isWindows() && !existsSync(version?.bin) && version.typeFlag !== 'ftp-srv') {
        reject(new Error(I18nT('fork.binNoFound')))
        return
      }
      if (!version?.version) {
        reject(new Error(I18nT('fork.versionNoFound')))
        return
      }
      try {
        this._linkVersion(version)
      } catch {}
      try {
        await this._stopServer(version).on(on)
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

  _stopServer(version: SoftInstalled) {
    console.log(version)
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceBegin', { service: this.type }))
      })
      const allPid: string[] = []
      const appPidFile = join(global.Server.BaseDir!, `pid/${this.type}.pid`)
      if (existsSync(appPidFile)) {
        const pid = (await readFile(appPidFile, 'utf-8')).trim()
        allPid.push(pid)
        let pids: string[] = []
        if (isMacOS()) {
          const plist: any = await Helper.send('tools', 'processList')
          pids = ProcessPidsByPid(pid, plist)
        } else if (isWindows()) {
          pids = (await ProcessPidListByPid(pid)).map((n) => `${n}`)
        }
        console.log('_stopServer appPidFile pids: ', pids)
        allPid.push(...pids)
        on({
          'APP-Service-Stop-Success': true
        })
      } else if (version?.pid) {
        allPid.push(version.pid)
        let pids: string[] = []
        if (isMacOS()) {
          const plist: any = await Helper.send('tools', 'processList')
          pids = ProcessPidsByPid(version.pid.trim(), plist)
        } else if (isWindows()) {
          pids = (await ProcessPidListByPid(`${version.pid}`.trim())).map((n) => `${n}`)
        }
        console.log('_stopServer version?.pid pids: ', pids)
        allPid.push(...pids)
        on({
          'APP-Service-Stop-Success': true
        })
      } else {
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
          if (isMacOS()) {
            const plist: any = await Helper.send('tools', 'processList')
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
          } else if (isWindows()) {
            const pids = await ProcessListSearch(serverName, false)
            const all = pids
              .filter((item) => item.COMMAND.includes('PhpWebStudy-Data'))
              .map((m) => `${m.PID}`)
            allPid.push(...all)
          }
        }

        console.log('_stopServer searchName pids: ', serverName, [...allPid])
      }
      const arr: string[] = Array.from(new Set(allPid))
      if (isMacOS()) {
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
      } else if (isWindows()) {
        if (arr.length > 0) {
          const str = arr.map((s) => `/pid ${s}`).join(' ')
          try {
            await execPromise(`taskkill /f /t ${str}`)
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
      await zipUnPack(row.zip, row.appDir)
    } else if (isMacOS()) {
      const dir = row.appDir
      await mkdirp(dir)
      await execPromise(`tar -xzf ${row.zip} -C ${dir}`)
    }
  }

  installSoft(row: any) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.startInstall', { service: row?.name ?? '' }))
      })
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
