import { I18nT } from '../lang'
import { existsSync } from 'fs'
import { join } from 'path'
import type { SoftInstalled } from '@shared/app'
import { execPromise, execPromiseRoot, spawnPromise, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, copyFile, unlink, chmod } from 'fs-extra'

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

  _startServer(version: SoftInstalled): ForkPromise<any> {
    console.log(version)
    return new ForkPromise<any>((resolve) => {
      resolve(true)
    })
  }

  _linkVersion(version: SoftInstalled): ForkPromise<any> {
    return new ForkPromise(async (resolve) => {
      resolve(true)
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
        'pure-ftpd': 'pure-ftpd'
      }
      const serverName = dis[this.type]
      const command = `wmic process get commandline,ProcessId | findstr "${serverName}"`
      console.log('_stopServer command: ', command)
      let res: any = null
      try {
        res = await execPromiseRoot(command)
      } catch (e) { }
      const pids = res?.stdout?.trim()?.split('\n') ?? []
      console.log('pids: ', pids)
      const arr: Array<string> = []
      for (const p of pids) {
        if (this.type === 'redis' || global.Server.ForceStart === true) {
          if (
            p.includes('findstr')
          ) {
            continue
          }
          const pid = p.split(' ').filter((s: string) => {
            return !!s.trim()
          }).pop()
          arr.push(pid)
        } else if (p.includes(global.Server.BaseDir!)) {
          const pid = p.split(' ').filter((s: string) => {
            return !!s.trim()
          }).pop()
          arr.push(pid)
        }
      }
      console.log('_stopServer arr: ', arr)
      if (arr.length > 0) {
        for (const pid of arr) {
          try {
            await execPromiseRoot(`wmic process where processid="${pid}" delete`)
          } catch (e) { }
        }
      }
      if (this.type === 'apache') {
        let command = `${version.bin} -k uninstall`
        try {
          await execPromiseRoot(command)
        } catch (e) { }
      }
      await waitTime(300)
      resolve(true)
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
          await execPromise(`echo '${global.Server.Password}' | sudo -S kill ${sign} ${pid}`)
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
          .replace(new RegExp('##PASSWORD##', 'g'), global.Server.Password!)
          .replace(new RegExp('##ARCH##', 'g'), arch)
          .replace(new RegExp('##ACTION##', 'g'), action)
          .replace(new RegExp('##NAME##', 'g'), name)
        await writeFile(copyfile, content)
        await chmod(copyfile, '0777')
      } catch (e) {
        reject(e)
      }
      spawnPromise('zsh', [copyfile]).on(on).then(resolve).catch(reject)
    })
  }
}
