import { I18nT } from '../lang'
import { existsSync, readFileSync, unlinkSync, writeFileSync, copyFileSync } from 'fs'
import { execSync } from 'child_process'
import { join } from 'path'
import type { SoftInstalled } from '@shared/app'
import { chmod, execPromise, fixEnv, spawnPromise } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'

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

  _linkVersion(version: SoftInstalled): ForkPromise<true | string> {
    return new ForkPromise((resolve) => {
      if (version && version?.bin) {
        try {
          const v = version.bin
            .split(global.Server.BrewCellar + '/')
            .pop()
            ?.split('/')?.[0]
          if (v) {
            const opt = {
              env: fixEnv()
            }
            opt.env.HOMEBREW_NO_INSTALL_FROM_API = 1
            const command = `brew unlink ${v} && brew link --overwrite --force ${v}`
            execSync(command, opt)
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
    return new ForkPromise((resolve, reject, on) => {
      if (!existsSync(version?.bin)) {
        reject(new Error(I18nT('fork.binNoFound')))
        return
      }
      if (!version?.version) {
        reject(new Error(I18nT('fork.versionNoFound')))
        return
      }
      this._stopServer(version)
        .then(() => {
          return this._startServer(version).on(on)
        })
        .then(() => {
          return this._linkVersion(version)
        })
        .then(() => {
          resolve(true)
        })
        .catch((code: Error) => {
          const info = code ? code.toString() : I18nT('fork.switchFail')
          reject(new Error(info))
        })
    })
  }

  stopService(version: SoftInstalled) {
    return new ForkPromise((resolve, reject) => {
      this._stopServer(version)
        .then((res) => {
          resolve(res)
        })
        .catch((err) => {
          reject(err)
        })
    })
  }

  reloadService(version: SoftInstalled) {
    return new ForkPromise((resolve, reject) => {
      this._reloadServer(version)
        .then((res) => {
          resolve(res)
        })
        .catch((err) => {
          reject(err)
        })
    })
  }

  startService(version: SoftInstalled) {
    return new ForkPromise((resolve, reject, on) => {
      if (!existsSync(version?.bin)) {
        reject(new Error(I18nT('fork.binNoFound')))
        return
      }
      if (!version?.version) {
        reject(new Error(I18nT('fork.versionNoFound')))
        return
      }
      this._stopServer(version)
        .then(() => {
          return this._startServer(version).on(on)
        })
        .then((res) => {
          resolve(res)
        })
        .catch((err) => {
          reject(err)
        })
    })
  }

  _stopServer(version: SoftInstalled) {
    console.log(version)
    return new ForkPromise((resolve) => {
      /**
       * 检测pid文件是否删除, 作为服务正常停止的依据
       * @param time
       */
      const checkPid = (time = 0) => {
        /**
         * mongodb 不会自动删除pid文件 直接返回成功
         */
        if (this.type === 'mongodb') {
          setTimeout(() => {
            resolve(0)
          }, 1000)
          return
        }
        if (!existsSync(this.pidPath)) {
          resolve(0)
        } else {
          if (time < 20) {
            setTimeout(() => {
              checkPid(time + 1)
            }, 500)
          } else {
            console.log('服务停止可能失败, 未检测到pid文件被删除', this.type, this.pidPath)
            unlinkSync(this.pidPath)
            resolve(0)
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
      execPromise(command)
        .then((res) => {
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
            return execPromise(`echo '${global.Server.Password}' | sudo -S kill ${sig} ${pids}`)
          }
          return Promise.resolve({ stdout: '', stderr: '' })
        })
        .then(() => {
          checkPid()
        })
        .catch(() => {
          checkPid()
        })
    })
  }

  _reloadServer(version: SoftInstalled) {
    console.log(version)
    return new ForkPromise((resolve, reject) => {
      console.log('this.pidPath: ', this.pidPath)
      if (existsSync(this.pidPath)) {
        const pid = readFileSync(this.pidPath, 'utf-8')
        const sign =
          this.type === 'apache' || this.type === 'mysql' || this.type === 'nginx'
            ? '-HUP'
            : '-USR2'
        execPromise(`echo '${global.Server.Password}' | sudo -S kill ${sign} ${pid}`)
          .then(() => {
            setTimeout(() => {
              resolve(0)
            }, 1000)
          })
          .catch((err) => {
            reject(err)
          })
      } else {
        reject(new Error(I18nT('fork.serviceNoRun')))
      }
    })
  }

  _doInstallOrUnInstallByBrew(rb: string, action: string) {
    const arch = global.Server.isAppleSilicon ? '-arm64' : '-x86_64'
    const name = rb
    const sh = join(global.Server.Static!, 'sh/brew-cmd.sh')
    const copyfile = join(global.Server.Cache!, 'brew-cmd.sh')
    if (existsSync(copyfile)) {
      unlinkSync(copyfile)
    }
    copyFileSync(sh, copyfile)
    chmod(copyfile, '0777')
    return spawnPromise('zsh', [copyfile, arch, action, name])
  }

  _doInstallOrUnInstallByPort(name: string, action: string) {
    const arch = global.Server.isAppleSilicon ? '-arm64' : '-x86_64'
    const sh = join(global.Server.Static!, 'sh/port-cmd.sh')
    const copyfile = join(global.Server.Cache!, 'port-cmd.sh')
    if (existsSync(copyfile)) {
      unlinkSync(copyfile)
    }
    let content = readFileSync(sh, 'utf-8').toString()
    content = content
      .replace(new RegExp('##PASSWORD##', 'g'), global.Server.Password!)
      .replace(new RegExp('##ARCH##', 'g'), arch)
      .replace(new RegExp('##ACTION##', 'g'), action)
      .replace(new RegExp('##NAME##', 'g'), name)
    writeFileSync(copyfile, content)
    chmod(copyfile, '0777')
    return spawnPromise('zsh', [copyfile])
  }
}
