import { I18nT } from '@lang/index'
import { createWriteStream, existsSync, unlinkSync } from 'fs'
import { basename, dirname, join } from 'path'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {AppLog, execPromise, getAllFileAsync, moveChildDirToParent, uuid, waitTime} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { appendFile, copyFile, mkdirp, readFile, remove, writeFile } from 'fs-extra'
import { zipUnPack } from '@shared/file'
import axios from 'axios'
import { ProcessListSearch, ProcessPidList, ProcessPidListByPid } from '../Process'
import TaskQueue from '../TaskQueue'

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
    return fn ? fn.call(this, ...args) : Promise.reject(new Error('No Method'))
  }

  initLocalApp(version: SoftInstalled, flag: string) {
    return new ForkPromise((resolve, reject, on) => {
      console.log('initLocalApp: ', version.bin, global.Server.AppDir)
      if (
        !existsSync(version.bin) &&
        version.bin.includes(join(global.Server.AppDir!, `${flag}-${version.version}`))
      ) {
        const local7ZFile = join(global.Server.Static!, `zip/${flag}-${version.version}.7z`)
        if (existsSync(local7ZFile)) {
          on({
            'APP-On-Log': AppLog(
              'info',
              I18nT('appLog.serviceUseBundle', { service: `${flag}-${version.version}` })
            )
          })
          zipUnPack(
            join(global.Server.Static!, `zip/${flag}-${version.version}.7z`),
            global.Server.AppDir!
          )
            .then(() => {
              on({
                'APP-On-Log': AppLog(
                  'info',
                  I18nT('appLog.bundleUnzipSuccess', { appDir: version.path })
                )
              })
              resolve(true)
            })
            .catch((e) => {
              on({
                'APP-On-Log': AppLog('error', I18nT('appLog.bundleUnzipFail', { error: e }))
              })
              reject(e)
            })
          return
        }
      }
      resolve(true)
    })
  }

  _startServer(version: SoftInstalled): ForkPromise<any> {
    console.log(version)
    return new ForkPromise<any>((resolve) => {
      resolve(true)
    })
  }

  stopService(version: SoftInstalled) {
    return this._stopServer(version)
  }

  startService(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      if (!version?.version) {
        reject(new Error(I18nT('fork.versionNoFound')))
        return
      }
      try {
        await this._stopServer(version).on(on)
        const res = await this._startServer(version).on(on)
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
      const appPidFile = join(global.Server.BaseDir!, `pid/${this.type}.pid`)
      if (existsSync(appPidFile)) {
        const pid = (await readFile(appPidFile, 'utf-8')).trim()
        const pids = await ProcessPidListByPid(pid)
        console.log('_stopServer 0 pid: ', pid, pids)
        if (pids.length > 0) {
          const str = pids.map((s) => `/pid ${s}`).join(' ')
          try {
            await execPromise(`taskkill /f /t ${str}`)
          } catch (e) {}
        }
        on({
          'APP-Service-Stop-Success': true
        })
        TaskQueue.run(remove, appPidFile).then().catch()
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceEnd', { service: this.type }))
        })
        resolve({
          'APP-Service-Stop-PID': pids
        })
        return
      }
      if (version?.pid) {
        const pids = await ProcessPidListByPid(version.pid.trim())
        console.log('_stopServer 1 pid: ', version.pid, pids)
        if (pids.length > 0) {
          const str = pids.map((s) => `/pid ${s}`).join(' ')
          try {
            await execPromise(`taskkill /f /t ${str}`)
          } catch (e) {}
        }
        on({
          'APP-Service-Stop-Success': true
        })
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceEnd', { service: this.type }))
        })
        resolve({
          'APP-Service-Stop-PID': pids
        })
        return
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
      const serverName = dis[this.type]
      const pids = await ProcessListSearch(serverName, false)
      console.log('_stopServer 2 pid: ', serverName, pids)
      const all = pids.filter((item) => item.CommandLine.includes('PhpWebStudy-Data'))
      if (all.length > 0) {
        const str = all.map((s) => `/pid ${s.ProcessId}`).join(' ')
        try {
          await execPromise(`taskkill /f /t ${str}`)
        } catch (e) {}
      }
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceEnd', { service: this.type }))
      })
      resolve({
        'APP-Service-Stop-PID': pids.map((s) => s.ProcessId)
      })
    })
  }

  async waitPidFile(
    pidFile: string,
    errLog?: string,
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
    if (errLog && existsSync(errLog)) {
      const error = await readFile(errLog, 'utf-8')
      if (error.length > 0) {
        return {
          error
        }
      }
    }
    if (existsSync(pidFile)) {
      const pid = (await readFile(pidFile, 'utf-8')).trim()
      return {
        pid
      }
    } else {
      if (time < 20) {
        await waitTime(500)
        res = res || (await this.waitPidFile(pidFile, errLog, time + 1))
      } else {
        res = false
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
    return proxy
  }

  async _fetchOnlineVersion(app: string): Promise<OnlineVersionItem[]> {
    let list: OnlineVersionItem[] = []
    try {
      const res = await axios({
        url: 'https://api.macphpstudy.com/api/version/fetch',
        method: 'post',
        data: {
          app,
          os: 'win',
          arch: 'x86'
        },
        proxy: this.getAxiosProxy()
      })
      list = res?.data?.data ?? []
    } catch (e) {}
    return list
  }

  installSoft(row: any) {
    return new ForkPromise(async (resolve, reject, on) => {
      const service = basename(row.appDir)
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.startInstall', { service }))
      })
      const refresh = () => {
        row.downloaded = existsSync(row.zip)
        row.installed = existsSync(row.bin)
      }

      const handlePython = async () => {
        const tmpDir = join(global.Server.Cache!, `python-${row.version}-tmp`)
        if (existsSync(tmpDir)) {
          await execPromise(`rmdir /S /Q ${tmpDir}`)
        }
        const dark = join(global.Server.Cache!, 'dark/dark.exe')
        const darkDir = join(global.Server.Cache!, 'dark')
        if (!existsSync(dark)) {
          const darkZip = join(global.Server.Static!, 'zip/dark.zip')
          await zipUnPack(darkZip, dirname(dark))
        }
        const pythonSH = join(global.Server.Static!, 'sh/python.ps1')
        let content = await readFile(pythonSH, 'utf-8')
        const TMPL = tmpDir
        const EXE = row.zip
        const APPDIR = row.appDir

        content = content
          .replace(new RegExp(`#DARKDIR#`, 'g'), darkDir)
          .replace(new RegExp(`#TMPL#`, 'g'), TMPL)
          .replace(new RegExp(`#EXE#`, 'g'), EXE)
          .replace(new RegExp(`#APPDIR#`, 'g'), APPDIR)

        let sh = join(global.Server.Cache!, `python-install-${uuid()}.ps1`)
        await writeFile(sh, content)

        process.chdir(global.Server.Cache!)
        try {
          await execPromise(`powershell.exe "${basename(sh)}"`)
        } catch (e) {
          console.log('[python-install][error]: ', e)
          await appendFile(
            join(global.Server.BaseDir!, 'debug.log'),
            `[python][python-install][error]: ${e}\n`
          )
        }
        // await remove(sh)

        const checkState = async (time = 0): Promise<boolean> => {
          let res = false
          const allProcess = await ProcessPidList()
          const find = allProcess.find(
            (p) => p?.CommandLine?.includes('msiexec.exe') && p?.CommandLine?.includes(APPDIR)
          )
          console.log('python checkState find: ', find)
          const bin = row.bin
          if (existsSync(bin) && !find) {
            res = true
          } else {
            if (time < 20) {
              await waitTime(1000)
              res = res || (await checkState(time + 1))
            }
          }
          return res
        }
        const res = await checkState()
        if (res) {
          await waitTime(1000)
          sh = join(global.Server.Cache!, `pip-install-${uuid()}.ps1`)
          let content = await readFile(join(global.Server.Static!, 'sh/pip.ps1'), 'utf-8')
          content = content.replace('#APPDIR#', APPDIR)
          await writeFile(sh, content)
          process.chdir(global.Server.Cache!)
          try {
            await execPromise(`powershell.exe "${basename(sh)}"`)
          } catch (e) {
            await appendFile(
              join(global.Server.BaseDir!, 'debug.log'),
              `[python][pip-install][error]: ${e}\n`
            )
          }
          // await remove(sh)
          await waitTime(1000)
          await remove(tmpDir)
          return
        } else {
          try {
            await waitTime(500)
            await remove(APPDIR)
            await remove(tmpDir)
          } catch (e) {}
        }
        throw new Error('Python Install Fail')
      }

      const handleMemcached = async () => {
        const tmpDir = join(global.Server.Cache!, `memcached-${row.version}-tmp`)
        if (existsSync(tmpDir)) {
          await remove(tmpDir)
        }
        await zipUnPack(row.zip, tmpDir)
        let dir = join(tmpDir, `memcached-${row.version}`, 'libevent-2.1', 'x64')
        if (!existsSync(dir)) {
          dir = join(tmpDir, `memcached-${row.version}`, 'cygwin', 'x64')
        }
        if (existsSync(dir)) {
          const allFile = await getAllFileAsync(dir, false)
          if (!existsSync(row.appDir)) {
            await mkdirp(row.appDir)
          }
          for (const f of allFile) {
            await copyFile(join(dir, f), join(row.appDir, f))
          }
        }
        if (existsSync(tmpDir)) {
          await remove(tmpDir)
        }
      }

      const handleTwoLevDir = async () => {
        await remove(row.appDir)
        await mkdirp(row.appDir)
        await zipUnPack(row.zip, row.appDir)
        await moveChildDirToParent(row.appDir)
      }

      const handleComposer = async () => {
        if (!existsSync(row.appDir)) {
          await mkdirp(row.appDir)
        }
        await copyFile(row.zip, join(row.appDir, 'composer.phar'))
        await writeFile(
          join(row.appDir, 'composer.bat'),
          `@echo off
php "%~dp0composer.phar" %*`
        )
      }

      const doHandleZip = async () => {
        const two = [
          'java',
          'tomcat',
          'golang',
          'maven',
          'rabbitmq',
          'mariadb',
          'ruby',
          'elasticsearch'
        ];
        if (two.includes(row.type)) {
          await handleTwoLevDir()
        } else if (row.type === 'memcached') {
          await handleMemcached()
        } else if (row.type === 'composer') {
          await handleComposer()
        } else if (row.type === 'python') {
          await handlePython()
        } else {
          await zipUnPack(row.zip, row.appDir)
        }
      }

      if (existsSync(row.zip)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.installFromZip', { service }))
        })
        row.progress = 100
        on(row)
        let success = false
        try {
          await doHandleZip()
          success = true
          refresh()
        } catch (e) {
          refresh()
          console.log('ERROR: ', e)
          on({
            'APP-On-Log': AppLog('error', I18nT('appLog.installFromZipFail', { error: e }))
          })
        }
        if (success) {
          row.downState = 'success'
          row.progress = 100
          on(row)
          if (row.installed) {
            on({
              'APP-On-Log': AppLog(
                'info',
                I18nT('appLog.installSuccess', { service, appDir: row.appDir })
              )
            })
          } else {
            on({
              'APP-On-Log': AppLog('error', I18nT('appLog.installFail', { service, error: 'null' }))
            })
          }
          resolve(true)
          return
        }
        unlinkSync(row.zip)
      }

      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.startDown', { service, url: row.url }))
      })

      axios({
        method: 'get',
        url: row.url,
        proxy: this.getAxiosProxy(),
        responseType: 'stream',
        onDownloadProgress: (progress) => {
          if (progress.total) {
            const percent = Math.round((progress.loaded * 100.0) / progress.total)
            row.progress = percent
            on(row)
          }
        }
      })
        .then(function (response) {
          const stream = createWriteStream(row.zip)
          response.data.pipe(stream)
          stream.on('error', (err: any) => {
            on({
              'APP-On-Log': AppLog('error', I18nT('appLog.downFail', { service, error: err }))
            })
            console.log('stream error: ', err)
            row.downState = 'exception'
            try {
              if (existsSync(row.zip)) {
                unlinkSync(row.zip)
              }
            } catch (e) {}
            refresh()
            on(row)
            setTimeout(() => {
              resolve(false)
            }, 1500)
          })
          stream.on('finish', async () => {
            on({
              'APP-On-Log': AppLog('info', I18nT('appLog.downSuccess', { service }))
            })
            row.downState = 'success'
            try {
              if (existsSync(row.zip)) {
                await doHandleZip()
              }
              refresh()
            } catch (e) {
              refresh()
              on({
                'APP-On-Log': AppLog('info', I18nT('appLog.installFail', { service, error: e }))
              })
            }
            on(row)
            if (row.installed) {
              on({
                'APP-On-Log': AppLog(
                  'info',
                  I18nT('appLog.installSuccess', { service, appDir: row.appDir })
                )
              })
            } else {
              on({
                'APP-On-Log': AppLog(
                  'error',
                  I18nT('appLog.installFail', { service, error: 'null' })
                )
              })
            }
            resolve(true)
          })
        })
        .catch((err) => {
          on({
            'APP-On-Log': AppLog('error', I18nT('appLog.downFail', { service, error: err }))
          })
          console.log('down error: ', err)
          row.downState = 'exception'
          try {
            if (existsSync(row.zip)) {
              unlinkSync(row.zip)
            }
          } catch (e) {}
          refresh()
          on(row)
          setTimeout(() => {
            resolve(false)
          }, 1500)
        })
    })
  }
}
