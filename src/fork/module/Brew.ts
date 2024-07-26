import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { execPromise, spawnPromise } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { copyFile, unlink, chmod } from 'fs-extra'
import { SoftInstalled } from '@shared/app'
import { I18nT } from '../lang'

class Brew extends Base {
  constructor() {
    super()
  }

  installBrew() {
    return new ForkPromise(async (resolve, reject) => {
      if (!global.Server.BrewCellar) {
        try {
          await execPromise('which brew')
          let res = await execPromise('brew --repo')
          const p = res.stdout
          global.Server.BrewHome = p
          await execPromise(
            `git config --global --add safe.directory ${join(
              p,
              'Library/Taps/homebrew/homebrew-core'
            )}`
          )
          await execPromise(
            `git config --global --add safe.directory ${join(
              p,
              'Library/Taps/homebrew/homebrew-cask'
            )}`
          )
          res = await execPromise('brew --cellar')
          const c = res.stdout
          console.log('brew --cellar: ', c)
          global.Server.BrewCellar = c
          resolve(global.Server)
        } catch (e) {
          reject(e)
        }
      } else {
        resolve(global.Server)
      }
    })
  }

  install(name: string) {
    return this._doInstallOrUnInstallByBrew(name, 'install')
  }

  uninstall(name: string) {
    return this._doInstallOrUnInstallByBrew(name, 'uninstall')
  }

  brewinfo(name: string) {
    return new ForkPromise(async (resolve, reject) => {
      const Info: { [k: string]: any } = {}
      try {
        const findAll = async () => {
          const all: Array<string> = []
          let cammand = ''
          switch (name) {
            case 'php':
              all.push('php')
              cammand = 'brew search -q --formula "/^(php|shivammathur/php/php)@[\\d\\.]+$/"'
              break
            case 'nginx':
              all.push('nginx')
              break
            case 'caddy':
              all.push('caddy')
              break
            case 'pure-ftpd':
              all.push('pure-ftpd')
              break
            case 'apache':
              all.push('httpd')
              break
            case 'memcached':
              all.push('memcached')
              break
            case 'mysql':
              all.push('mysql')
              cammand = 'brew search -q --formula "/mysql@[\\d\\.]+$/"'
              break
            case 'mariadb':
              all.push('mariadb')
              cammand = 'brew search -q --formula "/mariadb@[\\d\\.]+$/"'
              break
            case 'redis':
              all.push('redis')
              cammand = 'brew search -q --formula "/^redis@[\\d\\.]+$/"'
              break
            case 'mongodb':
              cammand =
                'brew search -q --desc --eval-all --formula "High-performance, schema-free, document-oriented database"'
              break
            case 'postgresql':
              cammand = 'brew search -q --formula "/^postgresql@[\\d\\.]+$/"'
              break
          }
          if (cammand) {
            try {
              const res = await execPromise(cammand, {
                env: {
                  HOMEBREW_NO_INSTALL_FROM_API: 1
                }
              })
              let content: any = res.stdout
              console.log('brewinfo content: ', content)
              if (name === 'mongodb') {
                content = content
                  .replace('==> Formulae', '')
                  .replace(
                    new RegExp(
                      ': High-performance, schema-free, document-oriented database \\(Enterprise\\)',
                      'g'
                    ),
                    ''
                  )
                  .replace(
                    new RegExp(': High-performance, schema-free, document-oriented database', 'g'),
                    ''
                  )
              }
              content = content
                .split('\n')
                .map((s: string) => s.trim())
                .filter((s: string) => s && !s.includes(' '))
              all.push(...content)
            } catch (e) {
              throw e
            }
          }
          return all
        }
        const doRun = async () => {
          const all = await findAll()
          const cammand = ['brew', 'info', ...all, '--json', '--formula'].join(' ')
          console.log('brewinfo doRun: ', cammand)
          try {
            const res = await execPromise(cammand, {
              env: {
                HOMEBREW_NO_INSTALL_FROM_API: 1
              }
            })
            const arr = JSON.parse(res.stdout)
            arr.forEach((item: any) => {
              Info[item.full_name] = {
                version: item?.versions?.stable ?? '',
                installed: item?.installed?.length > 0,
                name: item.full_name,
                flag: 'brew'
              }
            })
          } catch (e) {
            throw e
          }
        }
        await doRun()
      } catch (e) {
        reject(e)
        return
      }
      resolve(Info)
    })
  }

  portinfo(flag: string) {
    return new ForkPromise(async (resolve) => {
      const Info: { [k: string]: any } = {}
      let params: string[] = []
      if (flag === 'apache') {
        if (global.Server.SystemPackger === 'apt') {
          params = ['show', 'apache2']
        } else {
          params = ['info', 'httpd']
        }
      } else if (flag === 'nginx') {
        if (global.Server.SystemPackger === 'apt') {
          params = ['show', 'nginx']
        } else {
          params = ['info', 'nginx']
        }
      } else if (flag === 'caddy') {
        if (global.Server.SystemPackger === 'apt') {
          params = ['show', 'caddy']
        } else {
          params = ['info', 'caddy']
        }
      } else if (flag === 'php') {
        if (global.Server.SystemPackger === 'apt') {
          params = ['search', '(FPM-CGI binary)']
        } else {
          params = ['search', `PHP FastCGI Process Manager`]
        }
      } else if (flag === 'mysql') {
        if (global.Server.SystemPackger === 'apt') {
          params = ['show', 'mysql-server']
        } else {
          params = ['info', 'community-mysql-server']
        }
      } else if (flag === 'mariadb') {
        if (global.Server.SystemPackger === 'apt') {
          params = ['show', 'mariadb-server']
        } else {
          params = ['info', 'mariadb-server']
        }
      } else if (flag === 'postgresql') {
        if (global.Server.SystemPackger === 'apt') {
          params = ['show', 'postgresql']
        } else {
          params = ['info', 'postgresql-server']
        }
      } else if (flag === 'memcached') {
        if (global.Server.SystemPackger === 'apt') {
          params = ['show', 'memcached']
        } else {
          params = ['info', 'memcached']
        }
      } else if (flag === 'redis') {
        if (global.Server.SystemPackger === 'apt') {
          params = ['show', 'redis']
        } else {
          params = ['info', 'redis']
        }
      } else if (flag === 'pure-ftpd') {
        if (global.Server.SystemPackger === 'apt') {
          params = ['show', 'pure-ftpd']
        } else {
          params = ['info', 'pure-ftpd']
        }
      }
      const arr: any[] = []
      const info: string = await spawnPromise(global.Server.SystemPackger!, params)
      console.log('info: ', info)
      if (global.Server.SystemPackger === 'apt') {
        if (
          [
            'nginx',
            'caddy',
            'apache',
            'mysql',
            'mariadb',
            'postgresql',
            'memcached',
            'redis',
            'pure-ftpd'
          ].includes(flag)
        ) {
          const reg = /(Package: )(.*?)\n([\s\S]*?)(Version: )(.*?)\n/g
          const vd: { [k: string]: string } = {}
          let r
          while ((r = reg.exec(info)) !== null) {
            vd[r[2]] = r[5]
          }
          for (const packName in vd) {
            let version = vd[packName]
            version = version.split('-').shift() ?? ''
            if (version.includes(':')) {
              version = version
                .split(':')
                .filter((s) => s.includes('.'))
                .shift()!
            }
            if (version.includes('+')) {
              version = version.split('+').shift()!
            }

            let installed = false
            if (flag === 'nginx') {
              installed = existsSync(join('/usr/sbin/', flag))
            } else if (flag === 'caddy') {
              installed = existsSync(join('/usr/bin/', flag))
            } else if (flag === 'apache') {
              installed = existsSync(join('/usr/sbin/', 'apachectl'))
            } else if (flag === 'mysql') {
              installed = existsSync('/usr/sbin/mysqld')
            } else if (flag === 'mariadb') {
              installed = existsSync('/usr/sbin/mariadbd')
            } else if (flag === 'memcached') {
              installed = existsSync(join('/usr/bin', 'memcached'))
            } else if (flag === 'redis') {
              installed = existsSync(join('/usr/bin', `redis-server`))
            } else if (flag === 'pure-ftpd') {
              installed =
                existsSync(join('/usr/bin', 'pure-pw')) ||
                existsSync(join('/usr/sbin', 'pure-ftpd'))
            } else if (flag === 'postgresql') {
              installed = existsSync(join('/usr/bin/pg_ctl'))
            }
            const item = {
              name: flag,
              packName,
              version,
              installed,
              flag: 'port'
            }
            arr.push(item)
          }
        } else if (flag === 'php') {
          const reg = /(php(.*?)-fpm)\/(.*?)(\d+(\.\d+){1,4})([\+-\~])/g
          const vd: { [k: string]: string } = {}
          let r
          while ((r = reg.exec(info)) !== null) {
            vd[r[1]] = r[4]
          }
          for (const packName in vd) {
            const version = vd[packName]
            let installed = false
            const name = packName.split('-').shift()!
            if (name === 'php') {
              const res = await execPromise('apt show php-fpm')
              installed = res?.stdout?.includes('APT-Manual-Installed: yes') ?? false
            } else {
              const num = version.split('.').slice(0, 2).join('.')
              installed = existsSync(join('/usr/sbin/', `php-fpm${num}`))
            }
            const item = {
              name,
              version,
              installed,
              flag: 'port'
            }
            arr.push(item)
          }
        }
      } else {
        if (
          [
            'nginx',
            'caddy',
            'apache',
            'mysql',
            'mariadb',
            'postgresql',
            'memcached',
            'redis',
            'pure-ftpd'
          ].includes(flag)
        ) {
          const reg = /(Name         : )(.*?)\n([\s\S]*?)(Version      : )(.*?)\n/g
          const vd: { [k: string]: string } = {}
          let r
          while ((r = reg.exec(info)) !== null) {
            vd[r[2]] = r[5]
          }
          for (const packName in vd) {
            const version = vd[packName]
            let installed = false
            if (flag === 'nginx') {
              installed = existsSync(join('/usr/sbin/', flag))
            } else if (flag === 'caddy') {
              installed = existsSync(join('/usr/bin/', flag))
            } else if (flag === 'apache') {
              installed = existsSync(join('/usr/sbin/', 'apachectl'))
            } else if (flag === 'mysql') {
              installed = existsSync('/usr/libexec/mysqld')
            } else if (flag === 'mariadb') {
              installed = existsSync('/usr/libexec/mariadbd')
            } else if (flag === 'memcached') {
              installed = existsSync(join('/usr/bin', 'memcached'))
            } else if (flag === 'redis') {
              installed = existsSync(join('/usr/bin', `redis-server`))
            } else if (flag === 'pure-ftpd') {
              installed =
                existsSync(join('/usr/bin', 'pure-pw')) ||
                existsSync(join('/usr/sbin', 'pure-ftpd'))
            } else if (flag === 'postgresql') {
              installed = existsSync(join('/usr/bin/pg_ctl'))
            }
            const item = {
              name: flag,
              packName,
              version,
              installed,
              flag: 'port'
            }
            arr.push(item)
          }
        } else if (flag === 'php') {
          const packs = info
            .split('\n')
            .filter((s) => s.includes('php-fpm.') && s.includes('PHP FastCGI Process Manager'))
            .map((s) => s.split('.').shift()!)
          const res = await execPromise(`dnf info ${packs.join(' ')}`)
          const reg = /(Name         : )(.*?)\n([\s\S]*?)(Version      : )(.*?)\n/g
          const vd: { [k: string]: string } = {}
          let r
          while ((r = reg.exec(res.stdout)) !== null) {
            vd[r[2]] = r[5]
          }
          for (const packName in vd) {
            const version = vd[packName]
            let installed = false
            const name = packName.split('-').shift()!
            if (name === 'php') {
              installed = existsSync(join('/usr/sbin/', `php-fpm`))
            } else {
              const num = version.split('.').slice(0, 2).join('.')
              installed = existsSync(join('/usr/sbin/', `php-fpm${num}`))
            }
            const item = {
              name: flag,
              version,
              installed,
              flag: 'port'
            }
            arr.push(item)
          }
        }
      }

      arr.forEach((item: any) => {
        Info[item.name] = item
      })
      resolve(Info)
    })
  }

  addTap(name: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const stdout = await spawnPromise('brew', ['tap'])
        if (!stdout.includes(name)) {
          await spawnPromise('brew', ['tap', name])
          resolve(2)
        } else {
          resolve(1)
        }
      } catch (e) {
        reject(e)
      }
    })
  }

  initPhpApt() {
    return new ForkPromise(async (resolve, reject) => {
      const sh = join(global.Server.Static!, 'sh/php-apt-init.sh')
      const cp = join(global.Server.Cache!, 'php-apt-init.sh')
      try {
        await copyFile(sh, cp)
        await execPromise(`echo "${global.Server.Password}" | sudo -S chmod 777 ${cp}`)
        const stdout = await spawnPromise('bash', [cp, global.Server.Password!])
        console.log('initPhpApt: ', stdout)
        resolve(true)
      } catch (e) {
        reject(e)
      }
    })
  }

  initPhpDnf() {
    return new ForkPromise(async (resolve, reject) => {
      const sh = join(global.Server.Static!, 'sh/php-dnf-init.sh')
      const cp = join(global.Server.Cache!, 'php-dnf-init.sh')
      try {
        await copyFile(sh, cp)
        await execPromise(`echo "${global.Server.Password}" | sudo -S chmod 777 ${cp}`)
        const stdout = await spawnPromise('bash', [cp, global.Server.Password!])
        console.log('initPhpDnf: ', stdout)
        resolve(true)
      } catch (e) {
        reject(e)
      }
    })
  }

  currentSrc() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const src = await spawnPromise('git', ['remote', '-v'], {
          cwd: global.Server.BrewHome
        })
        let value = 'default'
        if (src.includes('tsinghua.edu.cn')) {
          value = 'tsinghua'
        } else if (src.includes('bfsu.edu.cn')) {
          value = 'bfsu'
        } else if (src.includes('cloud.tencent.com')) {
          value = 'tencent'
        } else if (src.includes('aliyun.com')) {
          value = 'aliyun'
        } else if (src.includes('ustc.edu.cn')) {
          value = 'ustc'
        }
        resolve(value)
      } catch (e) {
        reject(e)
      }
    })
  }

  changeSrc(srcFlag: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const sh = join(global.Server.Static!, 'sh/brew-src.sh')
        const copyfile = join(global.Server.Cache!, 'brew-src.sh')
        if (existsSync(copyfile)) {
          await unlink(copyfile)
        }
        await copyFile(sh, copyfile)
        await chmod(copyfile, '0777')
        await execPromise(`source brew-src.sh ${srcFlag} ${global.Server.BrewHome}`, {
          cwd: global.Server.Cache
        })
        resolve(true)
      } catch (e) {
        reject(e)
      }
    })
  }

  fetchAllPhpExtensions(num: string) {
    return new ForkPromise(async (resolve, reject) => {
      const names: { [k: string]: string } = {
        pecl_http: 'http.so',
        phalcon3: 'phalcon.so',
        phalcon4: 'phalcon.so',
        phalcon5: 'phalcon.so'
      }
      const zend = ['xdebug']
      try {
        const allTap = await execPromise('brew tap')
        if (!allTap.stdout.includes('shivammathur/extensions')) {
          await execPromise('brew tap shivammathur/extensions')
        }
        const cammand = `brew search --formula "/shivammathur\\/extensions\\/[\\s\\S]+${num}$/"`
        let content: any = await execPromise(cammand, {
          env: {
            HOMEBREW_NO_INSTALL_FROM_API: 1
          }
        })
        content = content.stdout
          .split('\n')
          .filter((s: string) => !!s.trim())
          .map((s: string) => {
            const name = s.replace('shivammathur/extensions/', '').replace(`@${num}`, '')
            const res: { [k: string]: any } = {
              name,
              libName: s,
              installed: false,
              status: false,
              soname: names[name] ?? `${name}.so`,
              flag: 'homebrew'
            }
            if (zend.includes(name)) {
              res['extendPre'] = 'zend_extension='
            }
            return res
          })
        resolve(content)
      } catch (err) {
        reject(err)
      }
    })
  }

  fetchAllPhpExtensionsByPort(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject) => {
      if (!version.version) {
        reject(new Error(I18nT('fork.versionNoFound')))
        return
      }
      const names: { [k: string]: string } = {
        pecl_http: 'http.so',
        phalcon3: 'phalcon.so',
        phalcon4: 'phalcon.so',
        phalcon5: 'phalcon.so',
        tideways_xhprof: 'xhprof.so',
        postgresql: 'pgsql.so',
        mysql: 'mysqli.so',
        redis5: 'redis.so',
        redis6: 'redis.so',
        redis7: 'redis.so'
      }
      const zend: Array<string> = ['xdebug']
      try {
        if (version.bin.startsWith('/opt/remi/') || global.Server.SystemPackger === 'dnf') {
          const v = version.version!.split('.').slice(0, 2).join('')
          const command = `dnf search --all "php-pecl-" "module for PHP applications"`
          let res: any = await execPromise(command)
          res = res?.stdout.toString() ?? ''
          res = res.split('\n')

          let arr: any[] = []
          const map = (s: string) => {
            const libName = s.split('.').shift()!
            const name = libName.includes('php-pecl-')
              ? libName.split('php-pecl-').pop()!
              : libName.split('php-').pop()!
            const item: any = {
              name,
              libName,
              installed: false,
              status: false,
              soname: names[name] ?? `${name}.so`,
              flag: 'macports'
            }
            if (zend.includes(name)) {
              item['extendPre'] = 'zend_extension='
            }
            return item
          }
          if (version.bin.startsWith('/opt/remi/')) {
            arr = res
              .filter((s: string) => {
                return (
                  (s.includes('module for PHP applications') && s.startsWith(`php${v}-php-`)) ||
                  s.startsWith(`php${v}-php-pecl-`)
                )
              })
              .map(map)
          } else if (version.bin === '/usr/sbin/php-fpm') {
            arr = res
              .filter((s: string) => {
                return (
                  (s.includes('module for PHP applications') && s.startsWith(`php-`)) ||
                  s.startsWith(`php-pecl-`)
                )
              })
              .map(map)
          }
          resolve(arr)
        } else {
          const numStr = version.phpBin!.split('/').pop()!
          const cammand = `apt search ${numStr}-`
          console.log('cammand: ', cammand)
          let res: any = await execPromise(cammand)
          res = res?.stdout.toString() ?? ''
          const arr = res
            .split('\n')
            .filter((f: string) => {
              return !!f.trim() && f.startsWith(`${numStr}-`)
            })
            .map((m: string) => {
              const a = m.split('/')
              const libName = a.shift() ?? ''
              const name = libName.split('-').pop()!.toLowerCase()
              const item: { [k: string]: any } = {
                name,
                libName,
                installed: false,
                status: false,
                soname: names[name] ?? `${name}.so`,
                flag: 'macports'
              }
              if (zend.includes(name)) {
                item['extendPre'] = 'zend_extension='
              }
              return item
            })
          resolve(arr)
        }
      } catch (err) {
        reject(err)
      }
    })
  }
}

export default new Brew()
