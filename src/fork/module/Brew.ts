import { join } from 'path'
import { existsSync, createWriteStream, unlinkSync } from 'fs'
import { Base } from './Base'
import { execPromise, spawnPromise, getAllFileAsync } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { copyFile, unlink, chmod, remove, mkdirp, writeFile } from 'fs-extra'
import axios from 'axios'
import { zipUnPack } from '@shared/file'

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
      try {
        let reg = `^${flag}\\d*$`
        if (flag === 'mariadb') {
          reg = '^mariadb-([\\d\\.]*)\\d$'
        }
        let arr = []
        const info = await spawnPromise('port', ['search', '--name', '--line', '--regex', reg])
        arr = info
          .split('\n')
          .filter((f: string) => {
            if (flag === 'php') {
              return f.includes('lang www') && f.includes('PHP: Hypertext Preprocessor')
            }
            if (flag === 'nginx') {
              return f.includes('High-performance HTTP(S) server')
            }
            if (flag === 'caddy') {
              return (
                f.includes('www') &&
                f.includes('Fast, multi-platform web server with automatic HTTPS')
              )
            }
            if (flag === 'apache') {
              return f.includes('The extremely popular second version of the Apache http server')
            }
            if (flag === 'mysql') {
              return f.includes('Multithreaded SQL database server')
            }
            if (flag === 'mariadb') {
              return f.includes('Multithreaded SQL database server')
            }
            if (flag === 'memcached') {
              return f.includes('A high performance, distributed memory object caching system.')
            }
            if (flag === 'redis') {
              return f.includes('Redis is an open source, advanced key-value store.')
            }
            if (flag === 'mongodb') {
              return f.includes('high-performance, schema-free, document-oriented')
            }
            if (flag === 'postgresql') {
              return f.includes('The most advanced open-source database available anywhere.')
            }
            return true
          })
          .map((m: string) => {
            const a = m.split('\t').filter((f) => f.trim().length > 0)
            const name = a.shift() ?? ''
            const version = a.shift() ?? ''
            let installed = false
            if (flag === 'php') {
              installed = existsSync(join('/opt/local/bin/', name))
            } else if (flag === 'nginx') {
              installed = existsSync(join('/opt/local/sbin/', name))
            } else if (flag === 'caddy') {
              installed = existsSync(join('/opt/local/bin/', name))
            } else if (flag === 'apache') {
              installed = existsSync(join('/opt/local/sbin/', 'apachectl'))
            } else if (flag === 'mysql') {
              installed = existsSync(join('/opt/local/lib', name, 'bin/mysqld_safe'))
            } else if (flag === 'mariadb') {
              installed = existsSync(join('/opt/local/lib', name, 'bin/mariadbd-safe'))
            } else if (flag === 'memcached') {
              installed = existsSync(join('/opt/local/bin', name))
            } else if (flag === 'redis') {
              installed = existsSync(join('/opt/local/bin', `${name}-server`))
            } else if (flag === 'mongodb') {
              installed =
                existsSync(join('/opt/local/bin', 'mongod')) ||
                existsSync(join('/opt/local/sbin', 'mongod'))
            } else if (flag === 'pure-ftpd') {
              installed =
                existsSync(join('/opt/local/bin', 'pure-pw')) ||
                existsSync(join('/opt/local/sbin', 'pure-ftpd'))
            } else if (flag === 'postgresql') {
              installed = existsSync(join('/opt/local/lib', name, 'bin/pg_ctl'))
            }
            return {
              name,
              version,
              installed,
              flag: 'port'
            }
          })
        arr.forEach((item: any) => {
          Info[item.name] = item
        })
      } catch (e) { }
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

  fetchAllPhpExtensionsByPort(num: string) {
    return new ForkPromise(async (resolve, reject) => {
      const names: { [k: string]: string } = {
        pecl_http: 'http.so',
        phalcon3: 'phalcon.so',
        phalcon4: 'phalcon.so',
        phalcon5: 'phalcon.so',
        tideways_xhprof: 'xhprof.so',
        postgresql: 'pgsql.so',
        mysql: 'mysqli.so'
      }
      const zend: Array<string> = ['xdebug']
      try {
        const numStr = `${num}`.split('.').join('')
        const cammand = `port search --name --line php${numStr}-`
        console.log('cammand: ', cammand)
        let res: any = await execPromise(cammand)
        res = res?.stdout.toString() ?? ''
        const arr = res
          .split('\n')
          .filter((f: string) => {
            return !!f.trim() && !f.includes('lang www')
          })
          .map((m: string) => {
            const a = m.split('\t').filter((f) => f.trim().length > 0)
            const libName = a.shift() ?? ''
            const name = libName.replace(`php${numStr}-`, '').toLowerCase()
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
      } catch (err) {
        reject(err)
      }
    })
  }

  installSoft(row: any) {
    return new ForkPromise(async (resolve, reject, on) => {
      const refresh = () => {
        row.downloaded = existsSync(row.zip)
        row.installed = existsSync(row.bin)
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
      const handleComposer = async () => {
        if (!existsSync(row.appDir)) {
          await mkdirp(row.appDir)
        }
        await copyFile(row.zip, join(row.appDir, 'composer.phar'))
        await writeFile(join(row.appDir, 'composer.bat'), `@echo off
php "%~dp0composer.phar" %*`)
      }
      if (existsSync(row.zip)) {
        let success = false
        try {
          if (row.type === 'memcached') {
            await handleMemcached()
          } else if (row.type === 'composer') {
            await handleComposer()
          } else {
            await zipUnPack(row.zip, row.appDir)
          }
          success = true
        } catch (e) { }
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
      axios({
        method: 'get',
        url: row.url,
        proxy,
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
            } catch (e) { }
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
                } else {
                  await zipUnPack(row.zip, row.appDir)
                }
              }
            } catch (e) { }
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
          } catch (e) { }
          refresh()
          on(row)
          setTimeout(() => {
            resolve(false)
          }, 1500)
        })
    })
  }
}

export default new Brew()
