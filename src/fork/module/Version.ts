import { join } from 'path'
import { existsSync, realpathSync } from 'fs'
import { Base } from './Base'
import type { SoftInstalled } from '@shared/app'
import { execPromise, getAllFileAsync, getSubDirAsync } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { compareVersions } from 'compare-versions'

class Manager extends Base {
  constructor() {
    super()
  }

  binVersion(
    bin: string,
    name: string
  ): ForkPromise<{
    version?: string | null
    error?: string
  }> {
    return new ForkPromise(async (resolve) => {
      if (name === 'pure-ftpd') {
        resolve({
          version: '1.0'
        })
        return
      }
      let reg: RegExp | null = null
      let command = ''
      const handleCatch = (err: any) => {
        resolve({
          error: command + '<br/>' + err.toString().trim().replace(new RegExp('\n', 'g'), '<br/>'),
          version: null
        })
      }
      const handleThen = (res: any) => {
        const str = res.stdout + res.stderr
        let version: string | null = ''
        try {
          version = reg?.exec(str)?.[2]?.trim() ?? str?.trim() ?? ''
          reg && (reg!.lastIndex = 0)
        } catch (e) {}
        version = !isNaN(parseInt(version!)) ? version : null
        const regx = /^\d[\d\.]*\d$/g
        if (version && !regx.test(version)) {
          version = null
        }
        resolve({
          version
        })
      }
      reg = /\d+(\.\d+){1,4}/g
      switch (name) {
        case 'apachectl':
          command = `echo "${global.Server.Password}" | sudo -S ${bin} -v`
          reg = /(Apache\/)(\d+(\.\d+){1,4})( )/g
          break
        case 'nginx':
          command = `${bin} -v`
          reg = /(\/)(\d+(\.\d+){1,4})(.*?)/g
          break
        case 'caddy':
          command = `${bin} version`
          reg = /([v]?)(\d+(\.\d+){1,4})(.*?)/g
          break
        case 'php-fpm':
          command = `${bin} -n -v`
          reg = /(\s)(\d+(\.\d+){1,4})([-\s])/g
          break
        case 'mysqld_safe':
          console.log('bin: ', bin)
          if (bin === '/usr/bin/mysqld_safe') {
            bin = '/usr/sbin/mysqld'
          } else {
            bin = bin.replace('_safe', '')
          }
          command = `echo "${global.Server.Password}" | sudo -S ${bin} -V`
          console.log('command: ', command)
          reg = /(Ver )(\d+(\.\d+){1,4})([\s-]?)/g
          break
        case 'mariadbd-safe':
          if (bin === '/usr/bin/mariadbd-safe') {
            bin = '/usr/sbin/mariadbd'
          } else {
            bin = bin.replace('-safe', '')
          }
          command = `echo "${global.Server.Password}" | sudo -S ${bin} -V`
          reg = /(Ver )(\d+(\.\d+){1,4})([-\s])/g
          break
        case 'memcached':
          command = `${bin} -V`
          reg = /(\s)(\d+(\.\d+){1,4})(.*?)/g
          break
        case 'redis-server':
          command = `${bin} -v`
          reg = /([=\s])(\d+(\.\d+){1,4})(.*?)/g
          break
        case 'mongod':
          command = `echo "${global.Server.Password}" | sudo -S ${bin} --version`
          reg = /(v)(\d+(\.\d+){1,4})(.*?)/g
          break
        case 'pg_ctl':
          command = `${bin} --version`
          reg = /(\s)(\d+(\.\d+){1,4})(.*?)/g
          break
      }
      try {
        const res = await execPromise(command)
        handleThen(res)
      } catch (e) {
        handleCatch(e)
      }
    })
  }

  allInstalledVersions(flag: Array<string>, setup: any) {
    return new ForkPromise((resolve) => {
      const searchNames: { [k: string]: string } = {
        apache: 'httpd',
        nginx: 'nginx',
        caddy: 'caddy',
        php: 'php',
        mysql: 'mysql',
        mariadb: 'mariadb',
        memcached: 'memcached',
        redis: 'redis',
        mongodb: 'mongodb-',
        'pure-ftpd': 'pure-ftpd',
        postgresql: 'postgresql'
      }
      const binNames: { [k: string]: string } = {
        apache: 'apachectl',
        nginx: 'nginx',
        caddy: 'caddy',
        php: 'php-fpm',
        mysql: 'mysqld_safe',
        mariadb: 'mariadbd-safe',
        memcached: 'memcached',
        redis: 'redis-server',
        mongodb: 'mongod',
        'pure-ftpd': 'pure-ftpd',
        postgresql: 'pg_ctl'
      }
      const fetchVersion = async (flag: string) => {
        return new ForkPromise(async (resolve) => {
          const customDirs = setup?.[flag]?.dirs ?? []
          const binName = binNames[flag]
          const searchName = searchNames[flag]
          const installed: Set<string> = new Set()
          const systemDirs = [
            '/',
            '/opt',
            '/usr',
            '/lib/postgresql',
            '/opt/remi/',
            global.Server.AppDir!
          ]

          const findInstalled = async (dir: string, depth = 0, maxDepth = 2) => {
            if (!existsSync(dir)) {
              return false
            }
            let res: string | false = false
            let binPath = join(dir, `bin/${binName}`)
            if (existsSync(binPath)) {
              binPath = realpathSync(binPath)
              if (flag === 'mysql' && binPath.includes('mariadb')) {
                return false
              }
              if (binPath === '/usr/bin/redis-check-rdb') {
                binPath = '/usr/bin/redis-server'
              }
              return binPath
            }
            binPath = join(dir, `sbin/${binName}`)
            if (existsSync(binPath)) {
              binPath = realpathSync(binPath)
              return binPath
            }
            if (depth >= maxDepth) {
              return res
            }
            const sub = await getSubDirAsync(dir)
            for (const s of sub) {
              const sres: any = await findInstalled(s, depth + 1, maxDepth)
              res = res || sres
            }
            return res
          }

          for (const s of systemDirs) {
            let max = 1
            if (s === '/opt/remi/') {
              max = 2
            }
            const bin = await findInstalled(s, 0, max)
            if (bin) {
              installed.add(bin)
            }
          }

          console.log('installed: ', [...installed])

          const base = ['/home/linuxbrew/.linuxbrew/Cellar']
          for (const b of base) {
            const subDir = await getSubDirAsync(b)
            const subDirFilter = subDir.filter((f) => {
              return f.includes(searchName)
            })
            for (const f of subDirFilter) {
              const subDir1 = await getSubDirAsync(f)
              for (const s of subDir1) {
                const bin = await findInstalled(s)
                if (bin) {
                  installed.add(bin)
                }
              }
            }
          }
          for (const s of customDirs) {
            const bin = await findInstalled(s, 0, 1)
            if (bin) {
              installed.add(bin)
            }
          }
          const count = installed.size
          if (count === 0) {
            resolve([])
            return
          }
          let index = 0
          const list: Array<SoftInstalled> = []
          const installedList: Array<string> = Array.from(installed)
          for (const i of installedList) {
            const path = i
              .replace(`/sbin/`, '/##SPLIT##/')
              .replace(`/bin/`, '/##SPLIT##/')
              .split('/##SPLIT##/')
              .shift()
            const { error, version } = await this.binVersion(i, binName)
            const num = version ? Number(version.split('.').slice(0, 2).join('')) : null
            const item = {
              version: version,
              bin: i,
              path: `${path}/`,
              num,
              enable: version !== null,
              error,
              run: false,
              running: false
            }
            if (
              !list.find(
                (f) => f.version === item.version && f.path === item.path && f.bin === item.bin
              )
            ) {
              list.push(item as any)
            }
            index += 1
            if (index === count) {
              const regx = /^\d[\d\.]*\d$/g
              resolve(
                list.sort((a, b) => {
                  regx.lastIndex = 0
                  const bv = regx.test(b?.version ?? 'a') ? b.version! : '0'
                  regx.lastIndex = 0
                  const av = regx.test(a?.version ?? 'a') ? a.version! : '0'
                  return compareVersions(bv, av)
                })
              )
            }
          }
        })
      }
      const all = flag.map((f) => {
        return fetchVersion(f)
      })
      const findFromMacPorts = async (type: string) => {
        const list: Array<SoftInstalled> = []
        const base = '/usr/'
        if (type === 'php') {
          const allSbinFile = await getAllFileAsync(join(base, 'sbin'), false)
          const fpms = allSbinFile.filter((f) => f.startsWith('php-fpm')).map((f) => `sbin/${f}`)
          const find = async (fpm: string) => {
            const bin = join(base, fpm)
            if (existsSync(bin)) {
              const { error, version } = await this.binVersion(bin, 'php-fpm')
              const num = version ? Number(version.split('.').slice(0, 2).join('')) : null
              const v = fpm.replace('sbin/php-fpm', '')
              const item = {
                version: version,
                bin,
                path: base,
                num,
                enable: version !== null,
                error,
                run: false,
                running: false,
                phpBin: `/usr/bin/php${v}`,
                phpConfig: `/usr/bin/php-config${v}`,
                phpize: `/usr/bin/phpize${v}`
              }
              list.push(item as any)
            }
            return true
          }
          for (const fpm of fpms) {
            await find(fpm)
          }
        }
        list.forEach((item) => {
          item.flag = 'macports'
        })
        return list
      }
      Promise.all(all).then(async (list) => {
        const versions: { [k: string]: Array<SoftInstalled> } = {}
        list.forEach((o, i) => {
          versions[flag[i]] = o as any
        })

        for (const type of flag) {
          const items = await findFromMacPorts(type)
          versions[type].push(...items)
          const arr: Array<SoftInstalled> = []
          versions[type].forEach((f) => {
            if (!arr.find((a) => f.version === a.version && f.path === a.path && f.bin === a.bin)) {
              arr.push(f)
            }
          })
          versions[type] = arr
          const regx = /^\d[\d\.]*\d$/g
          versions[type].sort((a, b) => {
            regx.lastIndex = 0
            const bv = regx.test(b?.version ?? 'a') ? b.version! : '0'
            regx.lastIndex = 0
            const av = regx.test(a?.version ?? 'a') ? a.version! : '0'
            return compareVersions(bv, av)
          })
        }
        resolve(versions)
      })
    })
  }
}

export default new Manager()
