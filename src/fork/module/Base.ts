import { I18nT } from '../lang'
import { createWriteStream, existsSync, unlinkSync } from 'fs'
import { dirname, join } from 'path'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import { execPromiseRoot, getAllFileAsync, uuid, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { copyFile, mkdirp, readdir, readFile, remove, writeFile } from 'fs-extra'
import { zipUnPack } from '@shared/file'
import axios from 'axios'

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
        await this._startServer(version).on(on)
        resolve(true)
      } catch (e) {
        reject(e)
      }
    })
  }

  _stopServer(version: SoftInstalled) {
    console.log(version)
    return new ForkPromise(async (resolve) => {
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
        tomcat: 'org.apache.catalina.startup.Bootstrap'
      }
      const serverName = dis[this.type]
      const command = `wmic process get commandline,ProcessId | findstr "${serverName}"`
      console.log('_stopServer command: ', command)
      let res: any = null
      try {
        res = await execPromiseRoot(command)
      } catch (e) {}
      const pids = res?.stdout?.trim()?.split('\n') ?? []
      console.log('pids: ', pids)
      const arr: Array<string> = []
      for (const p of pids) {
        if (this.type === 'redis' || global.Server.ForceStart === true) {
          if (p.includes('findstr')) {
            continue
          }
          const pid = p
            .split(' ')
            .filter((s: string) => {
              return !!s.trim()
            })
            .pop()
          arr.push(pid)
        } else if (p.includes('PhpWebStudy-Data')) {
          const pid = p
            .split(' ')
            .filter((s: string) => {
              return !!s.trim()
            })
            .pop()
          arr.push(pid)
        }
      }
      console.log('_stopServer arr: ', arr)
      if (arr.length > 0) {
        const str = arr.map((s) => `/pid ${s}`).join(' ')
        await execPromiseRoot(`taskkill /f /t ${str}`)
        // for (const pid of arr) {
        //   try {
        //     await execPromiseRoot(`wmic process where processid="${pid}" delete`)
        //   } catch (e) { }
        // }
      }
      if (this.type === 'apache') {
        const command = `${version.bin} -k uninstall`
        try {
          await execPromiseRoot(command)
        } catch (e) {}
      }
      await waitTime(300)
      resolve(true)
    })
  }

  async waitPidFile(file: string, time = 0): Promise<boolean> {
    let res = false
    if (existsSync(file)) {
      res = true
    } else {
      if (time < 20) {
        await waitTime(500)
        res = res || (await this.waitPidFile(file, time + 1))
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

        let sh = join(global.Server.Cache!, `${uuid()}.ps1`)
        await writeFile(sh, content)

        process.chdir(global.Server.Cache!)
        await execPromiseRoot(`powershell.exe ${sh}`)
        await remove(sh)

        sh = join(global.Server.Cache!, `${uuid()}.ps1`)
        await copyFile(join(global.Server.Static!, 'sh/pip.ps1'), sh)
        process.chdir(row.appDir)
        await execPromiseRoot(`powershell.exe ${sh}`)
        await remove(sh)
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
