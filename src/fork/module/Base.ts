import { I18nT } from '@lang/index'
import { createWriteStream, existsSync } from 'fs'
import { basename, dirname, join } from 'path'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import { AppLog, execPromise, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, remove, mkdirp, readdir, copyFile, chmod } from 'fs-extra'
import axios from 'axios'
import * as http from 'http'
import * as https from 'https'
import { ProcessPidsByPid, ProcessSearch } from '@shared/Process'
import Helper from '../Helper'

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
      reject(new Error('No Found Function'))
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
      if (version && version?.bin) {
        try {
          const v = version.bin
            .split(global.Server.BrewCellar + '/')
            .pop()
            ?.split('/')?.[0]
          if (v) {
            const command = `brew unlink ${v} && brew link --overwrite --force ${v}`
            console.log('_linkVersion: ', command)
            execPromise(command, {
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
      if (!existsSync(version?.bin)) {
        reject(new Error(I18nT('fork.binNoFound')))
        return
      }
      if (!version?.version) {
        reject(new Error(I18nT('fork.versionNoFound')))
        return
      }
      try {
        this._linkVersion(version)
      } catch (e) {}
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
        const plist: any = await Helper.send('tools', 'processList')
        const pids = ProcessPidsByPid(pid, plist)
        allPid.push(...pids)
        on({
          'APP-Service-Stop-Success': true
        })
      } else if (version?.pid) {
        const plist: any = await Helper.send('tools', 'processList')
        const pids = ProcessPidsByPid(version.pid.trim(), plist)
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
          redis: 'redis-server',
          mongodb: 'mongod',
          postgresql: 'postgres',
          'pure-ftpd': 'pure-ftpd',
          tomcat: 'org.apache.catalina.startup.Bootstrap',
          rabbitmq: 'rabbit',
          elasticsearch: 'org.elasticsearch.server/org.elasticsearch.bootstrap.Elasticsearch'
        }
        const serverName = dis?.[this.type]
        if (serverName) {
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
        }
      }
      const arr: string[] = Array.from(new Set(allPid))
      if (arr.length > 0) {
        let sig = ''
        switch (this.type) {
          case 'mysql':
          case 'mariadb':
          case 'mongodb':
          case 'tomcat':
          case 'rabbitmq':
          case 'elasticsearch':
            sig = '-TERM'
            break
          default:
            sig = '-INT'
            break
        }
        try {
          await Helper.send('tools', 'kill', sig, arr)
        } catch (e) {}
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
      } catch (e) {
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
      const res = await axios({
        url: 'https://api.one-env.com/api/version/fetch',
        method: 'post',
        data: {
          app,
          os: 'mac',
          arch: global.Server.Arch === 'x86_64' ? 'x86' : 'arm'
        },
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

  installSoft(row: any) {
    return new ForkPromise(async (resolve, reject, on) => {
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
        } catch (e) {}
      }

      const unpack = async () => {
        if (this.type === 'meilisearch') {
          const command = `cd "${dirname(row.bin)}" && ./${basename(row.bin)} --version`
          console.log('command: ', command)
          try {
            await mkdirp(dirname(row.bin))
            await copyFile(row.zip, row.bin)
            await chmod(row.bin, '0777')
            await waitTime(500)
            await execPromise(command)
          } catch (e) {
            console.log('eeeee: ', e)
            await fail()
          }
          return
        }
        try {
          const dir = row.appDir
          await mkdirp(dir)
          await execPromise(`tar -xzf ${row.zip} -C ${dir}`)
          if (
            ['java', 'tomcat', 'golang', 'maven', 'elasticsearch', 'nginx', 'rust'].includes(
              this.type
            )
          ) {
            const subDirs = await readdir(dir)
            const subDir = subDirs.pop()
            if (subDir) {
              await execPromise(`cd ${join(dir, subDir)} && mv ./* ../`)
              await waitTime(300)
              await remove(subDir)
            }
          }
          if (this.type === 'rust') {
            const appBinDir = join(row.appDir, 'bin')
            await mkdirp(appBinDir)
            const subDirs = await readdir(row.appDir)
            for (const d of subDirs) {
              const binDir = join(row.appDir, d, 'bin')
              if (existsSync(binDir)) {
                const binFiles = await readdir(binDir)
                for (const bin of binFiles) {
                  const srcFile = join(binDir, bin)
                  const destFile = join(appBinDir, basename(bin))
                  if (!existsSync(destFile) && existsSync(srcFile)) {
                    try {
                      await execPromise(['ln', '-s', `"${srcFile}"`, `"${destFile}"`].join(' '))
                    } catch (e) {}
                  }
                }
              }
            }
          }
          if (this.type === 'nginx' && existsSync(row.bin)) {
            await Helper.send('mailpit', 'binFixed', row.bin)
          }
        } catch (e) {
          await fail()
          return
        }
        if (this.type === 'mailpit') {
          try {
            await Helper.send('mailpit', 'binFixed', row.bin)
          } catch (e) {}
        }
      }

      if (existsSync(row.zip)) {
        row.progress = 100
        on(row)
        await unpack()
        end()
        return
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
        .then(function (response) {
          const stream = createWriteStream(row.zip)
          response.data.pipe(stream)
          stream.on('error', async (err: any) => {
            console.log('stream error: ', err)
            await fail()
            end()
          })
          stream.on('finish', async () => {
            await unpack()
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
