import { join, dirname, basename } from 'path'
import { existsSync, realpathSync, statSync } from 'fs'
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
      if (name === 'composer') {
        if (bin.includes(global.Server.AppDir!)) {
          const version = basename(dirname(bin)).replace('composer-', '')
          resolve({
            version
          })
        }
        return
      }
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
          version = reg?.exec(str)?.[2]?.trim() ?? ''
          reg!.lastIndex = 0
        } catch (e) {}
        version = !isNaN(parseInt(version)) ? version : null
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
          command = `${bin} -v`
          reg = /(Apache\/)(\d+(\.\d+){1,4})( )/g
          break
        case 'nginx':
          command = `${bin} -v`
          reg = /(\/)(\d+(\.\d+){1,4})(.*?)/g
          break
        case 'caddy':
          command = `${bin} version`
          reg = /(v)(\d+(\.\d+){1,4})(.*?)/g
          break
        case 'php-fpm':
          command = `${bin} -n -v`
          reg = /(\s)(\d+(\.\d+){1,4})([-\s])/g
          break
        case 'mysqld_safe':
          bin = bin.replace('_safe', '')
          command = `${bin} -V`
          reg = /(Ver )(\d+(\.\d+){1,4})( )/g
          break
        case 'mariadbd-safe':
          bin = bin.replace('-safe', '')
          command = `${bin} -V`
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
          command = `${bin} --version`
          reg = /(v)(\d+(\.\d+){1,4})(.*?)/g
          break
        case 'pg_ctl':
          command = `${bin} --version`
          reg = /(\s)(\d+(\.\d+){1,4})(.*?)/g
          break
        case 'java':
          command = `${bin} -version`
          reg = /(")(\d+([\.|\d]+){1,4})(["_])/g
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
        postgresql: 'postgresql',
        java: 'jdk'
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
        postgresql: 'pg_ctl',
        composer: 'composer',
        java: 'java'
      }
      const fetchVersion = async (flag: string) => {
        return new ForkPromise(async (resolve) => {
          const customDirs = setup?.[flag]?.dirs ?? []
          const binName = binNames[flag]
          const searchName = searchNames[flag]
          const installed: Set<string> = new Set()
          let systemDirs = ['/', '/opt', '/usr', global.Server.AppDir!, ...customDirs]

          if (flag === 'composer') {
            systemDirs = [global.Server.AppDir!]
          } else if (flag === 'java') {
            systemDirs.push('/Library/Java/JavaVirtualMachines')
          }

          const realDirDict: { [k: string]: string } = {}
          const findInstalled = async (dir: string, depth = 0, maxDepth = 2) => {
            if (!existsSync(dir)) {
              return
            }
            dir = realpathSync(dir)
            const checkBin = (binPath: string) => {
              if (existsSync(binPath)) {
                console.log('binPath: ', binPath)
                binPath = realpathSync(binPath)
                if (!existsSync(binPath)) {
                  return false
                }
                if (!statSync(binPath).isFile()) {
                  return false
                }
                console.log('binPath realpathSync: ', binPath)
                if (flag === 'mysql' && binPath.includes('mariadb')) {
                  return false
                }
                return binPath
              }
              return false
            }
            console.log('findInstalled dir: ', dir)
            let binPath = checkBin(join(dir, `${binName}`))
            if (binPath) {
              realDirDict[binPath] = join(dir, `${binName}`)
              installed.add(binPath)
              return
            }
            binPath = checkBin(join(dir, `bin/${binName}`))
            if (binPath) {
              realDirDict[binPath] = join(dir, `bin/${binName}`)
              installed.add(binPath)
              return
            }
            binPath = checkBin(join(dir, `sbin/${binName}`))
            if (binPath) {
              realDirDict[binPath] = join(dir, `sbin/${binName}`)
              installed.add(binPath)
              return
            }
            if (flag === 'java') {
              binPath = checkBin(join(dir, `Contents/Home/bin/java`))
              if (binPath) {
                realDirDict[binPath] = join(dir, `Contents/Home/bin/java`)
                installed.add(binPath)
                return
              }
            }
            if (depth >= maxDepth) {
              return
            }
            const sub = await getSubDirAsync(dir)
            console.log('sub: ', sub)
            for (const s of sub) {
              await findInstalled(s, depth + 1, maxDepth)
            }
          }

          for (const s of systemDirs) {
            await findInstalled(s, 0, 1)
          }

          const base = ['/usr/local/Cellar', '/opt/homebrew/Cellar']
          for (const b of base) {
            const subDir = await getSubDirAsync(b)
            const subDirFilter = subDir.filter((f) => {
              return f.includes(searchName)
            })
            for (const f of subDirFilter) {
              const subDir1 = await getSubDirAsync(f)
              for (const s of subDir1) {
                await findInstalled(s)
              }
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
            let path = flag === 'java' ? i : realDirDict[i]
            if (path.includes('/sbin/') || path.includes('/bin/')) {
              path = path
                .replace(`/sbin/`, '/##SPLIT##/')
                .replace(`/bin/`, '/##SPLIT##/')
                .split('/##SPLIT##/')
                .shift()!
            } else {
              path = dirname(path)
            }
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
        const base = '/opt/local/'
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
                phpBin: `/opt/local/bin/php${v}`,
                phpConfig: `/opt/local/bin/php-config${v}`,
                phpize: `/opt/local/bin/phpize${v}`
              }
              list.push(item as any)
            }
            return true
          }
          for (const fpm of fpms) {
            await find(fpm)
          }
        } else if (type === 'nginx') {
          const fpms = ['sbin/nginx']
          const find = async (fpm: string) => {
            const bin = join(base, fpm)
            if (existsSync(bin)) {
              const { error, version } = await this.binVersion(bin, 'nginx')
              const num = version ? Number(version.split('.').slice(0, 2).join('')) : null
              const item = {
                version: version,
                bin,
                path: base,
                num,
                enable: version !== null,
                error,
                run: false,
                running: false
              }
              list.push(item as any)
            }
            return true
          }
          for (const fpm of fpms) {
            await find(fpm)
          }
        } else if (type === 'caddy') {
          const fpms = ['bin/caddy']
          const find = async (fpm: string) => {
            const bin = join(base, fpm)
            if (existsSync(bin)) {
              const { error, version } = await this.binVersion(bin, 'caddy')
              const num = version ? Number(version.split('.').slice(0, 2).join('')) : null
              const item = {
                version: version,
                bin,
                path: base,
                num,
                enable: version !== null,
                error,
                run: false,
                running: false
              }
              list.push(item as any)
            }
            return true
          }
          for (const fpm of fpms) {
            await find(fpm)
          }
        } else if (type === 'apache') {
          const fpms = ['sbin/apachectl']
          const find = async (fpm: string) => {
            const bin = join(base, fpm)
            if (existsSync(bin)) {
              const { error, version } = await this.binVersion(bin, 'apachectl')
              const num = version ? Number(version.split('.').slice(0, 2).join('')) : null
              const item = {
                version: version,
                bin,
                path: base,
                num,
                enable: version !== null,
                error,
                run: false,
                running: false
              }
              list.push(item as any)
            }
            return true
          }
          for (const fpm of fpms) {
            await find(fpm)
          }
        } else if (type === 'mysql') {
          const allLibFile = await getSubDirAsync(join(base, 'lib'), false)
          const fpms = allLibFile
            .filter((f) => f.startsWith('mysql'))
            .map((f) => `lib/${f}/bin/mysqld_safe`)
          const find = async (fpm: string) => {
            const bin = join(base, fpm)
            if (existsSync(bin)) {
              const { error, version } = await this.binVersion(bin, 'mysqld_safe')
              const num = version ? Number(version.split('.').slice(0, 2).join('')) : null
              const item = {
                version: version,
                bin,
                path: dirname(dirname(bin)) + '/',
                num,
                enable: version !== null,
                error,
                run: false,
                running: false
              }
              list.push(item as any)
            }
            return true
          }
          for (const fpm of fpms) {
            await find(fpm)
          }
        } else if (type === 'mariadb') {
          const allLibFile = await getSubDirAsync(join(base, 'lib'), false)
          const fpms = allLibFile
            .filter((f) => f.startsWith('mariadb'))
            .map((f) => `lib/${f}/bin/mariadbd-safe`)
          const find = async (fpm: string) => {
            const bin = join(base, fpm)
            if (existsSync(bin)) {
              const { error, version } = await this.binVersion(bin, 'mariadbd-safe')
              const num = version ? Number(version.split('.').slice(0, 2).join('')) : null
              const item = {
                version: version,
                bin,
                path: dirname(dirname(bin)),
                num,
                enable: version !== null,
                error,
                run: false,
                running: false
              }
              list.push(item as any)
            }
            return true
          }
          for (const fpm of fpms) {
            await find(fpm)
          }
        } else if (type === 'memcached') {
          const fpms = ['bin/memcached']
          const find = async (fpm: string) => {
            const bin = join(base, fpm)
            if (existsSync(bin)) {
              const { error, version } = await this.binVersion(bin, 'memcached')
              const num = version ? Number(version.split('.').slice(0, 2).join('')) : null
              const item = {
                version: version,
                bin,
                path: base,
                num,
                enable: version !== null,
                error,
                run: false,
                running: false
              }
              list.push(item as any)
            }
            return true
          }
          for (const fpm of fpms) {
            await find(fpm)
          }
        } else if (type === 'redis') {
          const fpms = ['bin/redis-server']
          const find = async (fpm: string) => {
            const bin = join(base, fpm)
            if (existsSync(bin)) {
              const { error, version } = await this.binVersion(bin, 'redis-server')
              const num = version ? Number(version.split('.').slice(0, 2).join('')) : null
              const item = {
                version: version,
                bin,
                path: base,
                num,
                enable: version !== null,
                error,
                run: false,
                running: false
              }
              list.push(item as any)
            }
            return true
          }
          for (const fpm of fpms) {
            await find(fpm)
          }
        } else if (type === 'mongodb') {
          const fpms = ['bin/mongod', 'sbin/mongod']
          const find = async (fpm: string) => {
            const bin = join(base, fpm)
            if (existsSync(bin)) {
              const { error, version } = await this.binVersion(bin, 'mongod')
              const num = version ? Number(version.split('.').slice(0, 2).join('')) : null
              const item = {
                version: version,
                bin,
                path: base,
                num,
                enable: version !== null,
                error,
                run: false,
                running: false
              }
              list.push(item as any)
            }
            return true
          }
          for (const fpm of fpms) {
            await find(fpm)
          }
        } else if (type === 'postgresql') {
          const allLibFile = await getSubDirAsync(join(base, 'lib'), false)
          const fpms = allLibFile
            .filter((f) => f.startsWith('postgresql1'))
            .map((f) => `lib/${f}/bin/pg_ctl`)

          const find = async (fpm: string) => {
            const bin = join(base, fpm)
            if (existsSync(bin)) {
              const { error, version } = await this.binVersion(bin, 'pg_ctl')
              const num = version ? Number(version.split('.').slice(0, 2).join('')) : null
              const item = {
                version: version,
                bin,
                path: dirname(dirname(bin)) + '/',
                num,
                enable: version !== null,
                error,
                run: false,
                running: false
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
