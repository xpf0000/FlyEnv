import { I18nT } from '../lang'
import { createWriteStream, existsSync } from 'fs'
import { dirname, join } from 'path'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import { execPromise, spawnPromise, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, copyFile, unlink, chmod, remove, mkdirp, readdir } from 'fs-extra'
import { execPromiseRoot } from '@shared/Exec'
import axios from 'axios'
import * as http from 'http'
import * as https from 'https'
import { ProcessListSearch, ProcessPidListByPid } from '@shared/Process'

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

  _startServer(version: SoftInstalled): ForkPromise<any> {
    console.log(version)
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
        resolve(I18nT('fork.needSelectVersion'))
      }
    })
  }

  doLinkVersion(version: SoftInstalled) {
    return new ForkPromise((resolve, reject) => {
      this._linkVersion(version).then((res) => {
        if (res === true) {
          resolve(true)
        } else {
          reject(new Error(res))
        }
      })
    })
  }

  switchVersion(version: SoftInstalled) {
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
        await this._stopServer(version)
        await this._startServer(version).on(on)
        resolve(true)
      } catch (e) {
        reject(e)
      }
    })
  }

  stopService(version: SoftInstalled) {
    return this._stopServer(version)
  }

  reloadService(version: SoftInstalled) {
    return this._reloadServer(version)
  }

  startService(version: SoftInstalled) {
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
        await this._stopServer(version)
        const res = await this._startServer(version).on(on)
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
    return new ForkPromise(async (resolve) => {
      const allPid: string[] = []
      const appPidFile = join(global.Server.BaseDir!, `pid/${this.type}.pid`)
      if (existsSync(appPidFile)) {
        const pid = (await readFile(appPidFile, 'utf-8')).trim()
        const pids = await ProcessPidListByPid(pid)
        allPid.push(...pids)
      } else if (version?.pid) {
        const pids = await ProcessPidListByPid(version.pid.trim())
        allPid.push(...pids)
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
          rabbitmq: 'rabbit'
        }
        const serverName = dis?.[this.type]
        if (serverName) {
          const pids = (await ProcessListSearch(serverName, false))
            .filter((p) => {
              return (
                p.COMMAND.includes(global.Server.BaseDir!) &&
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
            sig = '-TERM'
            break
          default:
            sig = '-INT'
            break
        }
        try {
          await execPromiseRoot([`kill`, sig, ...arr])
        } catch (e) {}
      }
      await waitTime(300)
      if (this.type === 'tomcat' && arr.length > 0) {
        await waitTime(5000)
      }
      if (existsSync(appPidFile)) {
        await remove(appPidFile)
      }
      resolve({
        'APP-Service-Stop-PID': arr
      })
    })
  }

  _reloadServer(version: SoftInstalled) {
    console.log(version)
    return new ForkPromise(async (resolve, reject) => {
      if (existsSync(this.pidPath)) {
        try {
          const pid = await readFile(this.pidPath, 'utf-8')
          const sign =
            this.type === 'apache' ||
            this.type === 'mysql' ||
            this.type === 'nginx' ||
            this.type === 'mariadb'
              ? '-HUP'
              : '-USR2'
          await execPromiseRoot([`kill`, sign, pid])
          await waitTime(1000)
          resolve(0)
        } catch (e) {
          reject(e)
        }
      } else {
        reject(new Error(I18nT('fork.serviceNoRun')))
      }
    })
  }

  _doInstallOrUnInstallByBrew(rb: string, action: string) {
    return new ForkPromise<any>(async (resolve, reject, on) => {
      const arch = global.Server.isAppleSilicon ? '-arm64' : '-x86_64'
      const name = rb
      const sh = join(global.Server.Static!, 'sh/brew-cmd.sh')
      const copyfile = join(global.Server.Cache!, 'brew-cmd.sh')
      try {
        if (existsSync(copyfile)) {
          await unlink(copyfile)
        }
        await copyFile(sh, copyfile)
        await chmod(copyfile, '0777')
      } catch (e) {
        reject(e)
        return
      }
      spawnPromise('zsh', [copyfile, arch, action, name]).on(on).then(resolve).catch(reject)
    })
  }

  _doInstallOrUnInstallByPort(name: string, action: string) {
    return new ForkPromise(async (resolve, reject, on) => {
      const arch = global.Server.isAppleSilicon ? '-arm64' : '-x86_64'
      const sh = join(global.Server.Static!, 'sh/port-cmd.sh')
      const copyfile = join(global.Server.Cache!, 'port-cmd.sh')
      try {
        if (existsSync(copyfile)) {
          await unlink(copyfile)
        }
        let content = await readFile(sh, 'utf-8')
        content = content
          .trim()
          .replace(new RegExp('##ARCH##', 'g'), arch)
          .replace(new RegExp('##ACTION##', 'g'), action)
          .replace(new RegExp('##NAME##', 'g'), name)
        await writeFile(copyfile, content)
        await chmod(copyfile, '0777')
      } catch (e) {
        reject(e)
      }
      execPromiseRoot([copyfile]).on(on).then(resolve).catch(reject)
    })
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
        try {
          const dir = row.appDir
          await mkdirp(dir)
          await execPromise(`tar -xzf ${row.zip} -C ${dir}`)
          if (['java', 'tomcat', 'golang', 'maven'].includes(this.type)) {
            const subDirs = await readdir(dir)
            const subDir = subDirs.pop()
            if (subDir) {
              await execPromise(`cd ${join(dir, subDir)} && mv ./* ../`)
            }
          }
        } catch (e) {
          await fail()
          return
        }
        if (this.type === 'mailpit') {
          try {
            await execPromiseRoot(['xattr', '-dr', 'com.apple.quarantine', row.bin])
          } catch (e) {}
        }
      }

      if (existsSync(row.zip)) {
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
