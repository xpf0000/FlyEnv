import { I18nT } from '../lang'
import { existsSync } from 'fs'
import { join } from 'path'
import type { SoftInstalled } from '@shared/app'
import { execPromise, spawnPromise, waitTime } from '../Fn'
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
      if (version && version?.bin) {
        try {
          const v = version.bin
            .split(global.Server.BrewCellar + '/')
            .pop()
            ?.split('/')?.[0]
          if (v) {
            const command = `brew unlink ${v} && brew link --overwrite --force ${v}`
            await execPromise(command, {
              env: {
                HOMEBREW_NO_INSTALL_FROM_API: 1
              }
            })
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
        await this._stopServer(version)
        await this._startServer(version).on(on)
        await this._linkVersion(version)
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
    return new ForkPromise(async (resolve, reject) => {
      /**
       * 检测pid文件是否删除, 作为服务正常停止的依据
       * @param time
       */
      const checkPid = async (time = 0) => {
        /**
         * mongodb 不会自动删除pid文件 直接返回成功
         */
        if (this.type === 'mongodb') {
          await waitTime(1000)
          resolve(0)
          return
        }
        if (!existsSync(this.pidPath)) {
          resolve(0)
        } else {
          if (time < 20) {
            await waitTime(500)
            await checkPid(time + 1)
          } else {
            console.log('服务停止可能失败, 未检测到pid文件被删除', this.type, this.pidPath)
            try {
              await unlink(this.pidPath)
            } catch (e) {}
            resolve(true)
          }
        }
      }

      const dis: { [k: string]: string } = {
        php: 'php-fpm',
        nginx: 'nginx',
        apache: 'httpd',
        mysql: 'mysqld',
        mariadb: 'mariadbd',
        memcached: 'memcached',
        redis: 'redis-server',
        mongodb: 'mongod'
      }
      const serverName = dis[this.type]
      const command = `ps aux | grep '${serverName}' | awk '{print $2,$11,$12}'`
      console.log('_stopServer command: ', command)
      try {
        const res = await execPromise(command)
        const pids = res?.stdout?.trim()?.split('\n') ?? []
        const arr: Array<string> = []
        for (const p of pids) {
          if (
            p.indexOf(' grep ') >= 0 ||
            p.indexOf(' /bin/sh -c') >= 0 ||
            p.indexOf('/Contents/MacOS/') >= 0
          ) {
            continue
          }
          arr.push(p.split(' ')[0])
        }
        if (arr.length > 0) {
          const pids = arr.join(' ')
          let sig = ''
          switch (this.type) {
            case 'mysql':
            case 'mariadb':
            case 'mongodb':
              sig = '-TERM'
              break
            default:
              sig = '-INT'
              break
          }
          await execPromise(`echo '${global.Server.Password}' | sudo -S kill ${sig} ${pids}`)
        }
        checkPid()
      } catch (e) {
        reject(e)
      }
    })
  }

  _reloadServer(version: SoftInstalled) {
    console.log(version)
    return new ForkPromise(async (resolve, reject) => {
      console.log('this.pidPath: ', this.pidPath)
      if (existsSync(this.pidPath)) {
        try {
          const pid = await readFile(this.pidPath, 'utf-8')
          const sign =
            this.type === 'apache' || this.type === 'mysql' || this.type === 'nginx'
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
