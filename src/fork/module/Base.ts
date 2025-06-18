import { I18nT } from '@lang/index'
import { createWriteStream, existsSync } from 'fs'
import { basename, dirname, join } from 'path'
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
  readdir,
  copyFile,
  chmod,
  zipUnPack,
  uuid,
  getAllFileAsync,
  moveChildDirToParent,
  spawnPromise
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import axios from 'axios'
import * as http from 'http'
import * as https from 'https'
import { ProcessPidsByPid, ProcessSearch } from '@shared/Process'
import Helper from '../Helper'
import { appDebugLog, isMacOS, isWindows } from '@shared/utils'
import { ProcessListSearch, ProcessPidListByPid, ProcessPidList } from '@shared/Process.win'

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
      if (isWindows()) {
        resolve(true)
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
        let pids: string[] = []
        if (isMacOS()) {
          const plist: any = await Helper.send('tools', 'processList')
          pids = ProcessPidsByPid(pid, plist)
        } else if (isWindows()) {
          pids = (await ProcessPidListByPid(pid)).map((n) => `${n}`)
        }
        allPid.push(...pids)
        on({
          'APP-Service-Stop-Success': true
        })
      } else if (version?.pid) {
        const plist: any = await Helper.send('tools', 'processList')
        let pids: string[] = []
        if (isMacOS()) {
          pids = ProcessPidsByPid(version.pid.trim(), plist)
        } else if (isWindows()) {
          pids = (await ProcessPidListByPid(`${version.pid}`.trim())).map((n) => `${n}`)
        }
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
              .filter((item) => item.CommandLine.includes('PhpWebStudy-Data'))
              .map((m) => `${m.ProcessId}`)
            allPid.push(...all)
          }
        }
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

  /**
   * Windows Only
   * @param version
   * @param flag
   */
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
    console.log('row: ', row)
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

      const unpack = async () => {
        if (this.type === 'meilisearch') {
          const command = `cd "${dirname(row.bin)}" && ./${basename(row.bin)} --version`
          console.log('command: ', command)
          await mkdirp(dirname(row.bin))
          await copyFile(row.zip, row.bin)
          await chmod(row.bin, '0777')
          await waitTime(500)
          await execPromise(command)
          return
        }
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
                  } catch {}
                }
              }
            }
          }
        }
        if (this.type === 'nginx' && existsSync(row.bin)) {
          await Helper.send('mailpit', 'binFixed', row.bin)
        }
        if (this.type === 'mailpit') {
          await Helper.send('mailpit', 'binFixed', row.bin)
        }
      }

      const handleWin = async () => {
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
            await execPromise(
              `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath '${sh}'; & '${sh}'"`
            )
          } catch (e: any) {
            console.log('[python-install][error]: ', e)
            await appDebugLog('[python][python-install][error]', e.toString())
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
              await execPromise(
                `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath '${sh}'; & '${sh}'"`
              )
            } catch (e: any) {
              await appDebugLog('[python][pip-install][error]', e.toString())
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
            } catch {}
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

        const handleMongoDB = async () => {
          await handleTwoLevDir()
          await waitTime(1000)
          // @ts-ignore
          await this.initMongosh()
        }

        const handleMeilisearch = async () => {
          await waitTime(500)
          await mkdirp(dirname(row.bin))
          try {
            await copyFile(row.zip, row.bin)
            await waitTime(500)
            await spawnPromise(basename(row.bin), ['--version'], {
              shell: false,
              cwd: dirname(row.bin)
            })
          } catch (e: any) {
            if (existsSync(row.bin)) {
              await remove(row.bin)
            }
            await appDebugLog('[handleMeilisearch][error]', e.toString())
            throw e
          }
        }

        const handleRust = async () => {
          await remove(row.appDir)
          await mkdirp(row.appDir)
          const cacheDir = join(global.Server.Cache!, uuid())
          await mkdirp(cacheDir)
          await zipUnPack(row.zip, cacheDir)
          const files = await readdir(cacheDir)
          const find = files.find((f) => f.includes('.tar'))
          if (!find) {
            throw new Error('UnZIP failed')
          }
          await zipUnPack(join(cacheDir, find), row.appDir)
          await moveChildDirToParent(row.appDir)
          await remove(cacheDir)
        }

        const two = [
          'java',
          'tomcat',
          'golang',
          'maven',
          'rabbitmq',
          'mariadb',
          'ruby',
          'elasticsearch'
        ]
        if (two.includes(row.type)) {
          await handleTwoLevDir()
        } else if (row.type === 'memcached') {
          await handleMemcached()
        } else if (row.type === 'composer') {
          await handleComposer()
        } else if (row.type === 'python') {
          await handlePython()
        } else if (row.type === 'mongodb') {
          await handleMongoDB()
        } else if (row.type === 'meilisearch') {
          await handleMeilisearch()
        } else if (row.type === 'rust') {
          await handleRust()
        } else {
          await zipUnPack(row.zip, row.appDir)
        }
      }

      if (existsSync(row.zip)) {
        row.progress = 100
        on(row)
        let success = false
        try {
          if (isMacOS()) {
            await unpack()
          } else if (isWindows()) {
            await handleWin()
          }
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
        .then(function (response) {
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
                if (isMacOS()) {
                  await unpack()
                } else if (isWindows()) {
                  await handleWin()
                }
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
