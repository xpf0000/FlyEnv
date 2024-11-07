import { I18nT } from '../lang'
import { createWriteStream, existsSync, unlinkSync } from 'fs'
import { dirname, join } from 'path'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import { execPromiseRoot, getAllFileAsync, uuid, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { appendFile, copyFile, mkdirp, readdir, readFile, remove, writeFile } from 'fs-extra'
import { zipUnPack } from '@shared/file'
import axios from 'axios'
import { ProcessListSearch, ProcessPidList, ProcessPidListByPid } from '../Process'

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
    return fn.call(this, ...args)
  }

  initLocalApp(version: SoftInstalled, flag: string) {
    return new ForkPromise((resolve, reject) => {
      console.log('initLocalApp: ', version.bin, global.Server.AppDir)
      if (
        !existsSync(version.bin) &&
        version.bin.includes(join(global.Server.AppDir!, `${flag}-${version.version}`))
      ) {
        const local7ZFile = join(global.Server.Static!, `zip/${flag}-${version.version}.7z`)
        if (existsSync(local7ZFile)) {
          zipUnPack(
            join(global.Server.Static!, `zip/${flag}-${version.version}.7z`),
            global.Server.AppDir!
          )
            .then(resolve)
            .catch(reject)
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
        await this._stopServer(version)
        const res = await this._startServer(version).on(on)
        resolve(res)
      } catch (e) {
        reject(e)
      }
    })
  }

  _stopServer(version: SoftInstalled) {
    console.log(version)
    return new ForkPromise(async (resolve) => {
      const appPidFile = join(global.Server.BaseDir!, `pid/${this.type}.pid`)
      if (existsSync(appPidFile)) {
        const pid = (await readFile(appPidFile, 'utf-8')).trim()
        const pids = await ProcessPidListByPid(pid)
        console.log('_stopServer 0 pid: ', pid, pids)
        if (pids.length > 0) {
          const str = pids.map((s) => `/pid ${s}`).join(' ')
          try {
            await execPromiseRoot(`taskkill /f /t ${str}`)
          } catch (e) {}
        }
        try {
          await execPromiseRoot(`del -Force "${appPidFile}"`)
        } catch (e) {}
        if (this.type === 'apache') {
          const command = `${version.bin} -k uninstall`
          try {
            await execPromiseRoot(command)
          } catch (e) {}
        }
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
            await execPromiseRoot(`taskkill /f /t ${str}`)
          } catch (e) {}
        }
        if (this.type === 'apache') {
          const command = `${version.bin} -k uninstall`
          try {
            await execPromiseRoot(command)
          } catch (e) {}
        }
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
        rabbitmq: 'rabbit'
      }
      const serverName = dis[this.type]
      const pids = await ProcessListSearch(serverName, false)
      console.log('_stopServer 2 pid: ', serverName, pids)
      const all = pids.filter((item) => item.CommandLine.includes('PhpWebStudy-Data'))
      if (all.length > 0) {
        const str = all.map((s) => `/pid ${s.ProcessId}`).join(' ')
        try {
          await execPromiseRoot(`taskkill /f /t ${str}`)
        } catch (e) {}
      }
      if (this.type === 'apache') {
        const command = `${version.bin} -k uninstall`
        try {
          await execPromiseRoot(command)
        } catch (e) {}
      }
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
      const refresh = () => {
        row.downloaded = existsSync(row.zip)
        row.installed = existsSync(row.bin)
      }

      const handlePython = async () => {
        const tmpDir = join(global.Server.Cache!, `python-${row.version}-tmp`)
        if (existsSync(tmpDir)) {
          await execPromiseRoot(`rmdir /S /Q ${tmpDir}`)
        }
        const dark = join(global.Server.Cache!, 'dark/dark.exe')
        if (!existsSync(dark)) {
          const darkZip = join(global.Server.Static!, 'zip/dark.zip')
          await zipUnPack(darkZip, dirname(dark))
        }
        const pythonSH = join(global.Server.Static!, 'sh/python.ps1')
        let content = await readFile(pythonSH, 'utf-8')
        const DARK = dark
        const TMPL = tmpDir
        const EXE = row.zip
        const APPDIR = row.appDir

        content = content
          .replace(new RegExp(`#DARK#`, 'g'), DARK)
          .replace(new RegExp(`#TMPL#`, 'g'), TMPL)
          .replace(new RegExp(`#EXE#`, 'g'), EXE)
          .replace(new RegExp(`#APPDIR#`, 'g'), APPDIR)

        let sh = join(global.Server.Cache!, `python-install-${uuid()}.ps1`)
        await writeFile(sh, content)

        process.chdir(global.Server.Cache!)
        await execPromiseRoot(`powershell.exe ${sh}`)
        await remove(sh)

        const checkState = async (time = 0): Promise<boolean> => {
          let res = false
          const allProcess = await ProcessPidList()
          const find = allProcess.find(
            (p) => p.CommandLine.includes('msiexec.exe') && p.CommandLine.includes(APPDIR)
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
          await waitTime(500)
          await remove(tmpDir)
          await waitTime(500)
          sh = join(global.Server.Cache!, `pip-install-${uuid()}.ps1`)
          await copyFile(join(global.Server.Static!, 'sh/pip.ps1'), sh)
          process.chdir(APPDIR)
          try {
            await execPromiseRoot(`powershell.exe ${sh}`)
          } catch (e) {
            await appendFile(
              join(global.Server.BaseDir!, 'debug.log'),
              `[python][pip-install][error]: ${e}\n`
            )
          }
          await remove(sh)
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

      const handleTwoLevDir = async (flag: string) => {
        const tmpDir = join(global.Server.Cache!, `${flag}-${row.version}-tmp`)
        if (existsSync(tmpDir)) {
          await remove(tmpDir)
        }
        await zipUnPack(row.zip, tmpDir)
        const sub = await readdir(tmpDir)
        const subDir = join(tmpDir, sub.pop()!)
        const allFile = await getAllFileAsync(subDir, false)
        console.log('handleTwoLevDir: ', sub, subDir, allFile)
        if (!existsSync(row.appDir)) {
          await mkdirp(row.appDir)
        }
        for (const f of allFile) {
          const destFile = join(row.appDir, f)
          await mkdirp(dirname(destFile))
          await copyFile(join(subDir, f), destFile)
        }
        if (existsSync(tmpDir)) {
          await remove(tmpDir)
        }
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

      if (existsSync(row.zip)) {
        let success = false
        try {
          if (row.type === 'memcached') {
            await handleMemcached()
          } else if (row.type === 'composer') {
            await handleComposer()
          } else if (row.type === 'java') {
            await handleTwoLevDir('java')
          } else if (row.type === 'tomcat') {
            await handleTwoLevDir('tomcat')
          } else if (row.type === 'golang') {
            await handleTwoLevDir('golang')
          } else if (row.type === 'maven') {
            await handleTwoLevDir('maven')
          } else if (row.type === 'rabbitmq') {
            await handleTwoLevDir('rabbitmq')
          } else if (row.type === 'python') {
            await handlePython()
          } else {
            await zipUnPack(row.zip, row.appDir)
          }
          success = true
        } catch (e) {
          console.log('ERROR: ', e)
        }
        if (success) {
          refresh()
          row.downState = 'success'
          row.progress = 100
          on(row)
          resolve(true)
          return
        }
        unlinkSync(row.zip)
      }

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
            row.downState = 'success'
            try {
              if (existsSync(row.zip)) {
                if (row.type === 'memcached') {
                  await handleMemcached()
                } else if (row.type === 'composer') {
                  await handleComposer()
                } else if (row.type === 'java') {
                  await handleTwoLevDir('java')
                } else if (row.type === 'tomcat') {
                  await handleTwoLevDir('tomcat')
                } else if (row.type === 'golang') {
                  await handleTwoLevDir('golang')
                } else if (row.type === 'maven') {
                  await handleTwoLevDir('maven')
                } else if (row.type === 'rabbitmq') {
                  await handleTwoLevDir('rabbitmq')
                } else if (row.type === 'python') {
                  await handlePython()
                } else {
                  await zipUnPack(row.zip, row.appDir)
                }
              }
            } catch (e) {}
            refresh()
            on(row)
            resolve(true)
          })
        })
        .catch((err) => {
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
