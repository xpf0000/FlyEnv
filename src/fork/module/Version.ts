import { join, basename } from 'path'
import { existsSync, realpathSync } from 'fs'
import { Base } from './Base'
import type { SoftInstalled } from '@shared/app'
import { execPromise, getAllFile, getSubDirAsync } from '../Fn'
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
          version = reg?.exec(str)?.[2]?.trim() ?? ''
          reg!.lastIndex = 0
        } catch (e) { }
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
        case 'httpd.exe':
          command = `${bin} -v`
          reg = /(Apache\/)(\d+(\.\d+){1,4})( )/g
          break
        case 'nginx.exe':
          command = `${bin} -v`
          reg = /(\/)(\d+(\.\d+){1,4})(.*?)/g
          break
        case 'caddy.exe':
          command = `${bin} -v`
          reg = /(v)(\d+(\.\d+){1,4})(.*?)/g
          break
        case 'php-cgi.exe':
          command = `${bin} -n -v`
          reg = /(PHP )(\d+(\.\d+){1,4})( )/g
          break
        case 'mysqld.exe':
          command = `${bin} -V`
          reg = /(Ver )(\d+(\.\d+){1,4})( )/g
          break
        case 'mariadbd.exe':
          command = `${bin} -V`
          reg = /(Ver )(\d+(\.\d+){1,4})([-\s])/g
          break
        case 'memcached.exe':
          command = `${bin} -V`
          reg = /(\s)(\d+(\.\d+){1,4})(.*?)/g
          break
        case 'redis-server.exe':
          command = `${bin} -v`
          reg = /([=\s])(\d+(\.\d+){1,4})(.*?)/g
          break
        case 'mongod.exe':
          command = `${bin} --version`
          reg = /(v)(\d+(\.\d+){1,4})(.*?)/g
          break
        case 'pg_ctl.exe':
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
      const binNames: { [k: string]: string } = {
        apache: 'httpd.exe',
        nginx: 'nginx.exe',
        caddy: 'caddy.exe',
        php: 'php-cgi.exe',
        mysql: 'mysqld.exe',
        mariadb: 'mariadbd.exe',
        memcached: 'memcached.exe',
        redis: 'redis-server.exe',
        mongodb: 'mongod.exe',
        'pure-ftpd': 'pure-ftpd',
        postgresql: 'pg_ctl.exe'
      }
      const fetchVersion = async (flag: string) => {
        return new ForkPromise(async (resolve) => {
          const customDirs = setup?.[flag]?.dirs ?? []
          const binName = binNames[flag]
          const installed: Array<{
            bin: string
            path: string
          }> = []

          const findInstalled = async (dir: string, depth = 0, maxDepth = 2) => {
            let res: {
              bin: string
              path: string
            } | false = false
            let binPath = join(dir, binName)
            if (existsSync(binPath)) {
              binPath = realpathSync(binPath)
              if (binPath.includes(binName)) {
                return {
                  bin: binPath,
                  path: dir
                }
              }
            }
            binPath = join(dir, `bin`, binName)
            if (existsSync(binPath)) {
              binPath = realpathSync(binPath)
              if (binPath.includes(binName)) {
                return {
                  bin: binPath,
                  path: dir
                }
              }
            }
            binPath = join(dir, `sbin`, binName)
            if (existsSync(binPath)) {
              binPath = realpathSync(binPath)
              if (binPath.includes(binName)) {
                return {
                  bin: binPath,
                  path: dir
                }
              }
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

          const base = global.Server.AppDir!
          const subDir = await getSubDirAsync(base)
          const subDirFilter = subDir.filter((f) => {
            return basename(f).startsWith(flag)
          })
          for (const f of subDirFilter) {
            const bin = await findInstalled(f)
            if (bin) {
              installed.push(bin)
            }
          }

          for (const s of customDirs) {
            const bin = await findInstalled(s, 0, 1)
            if (bin && !installed.find(i => i.bin === bin.bin)) {
              installed.push(bin)
            }
          }
          const count = installed.length
          if (count === 0) {
            resolve([])
            return
          }
          console.log('installed: ', installed)

          let index = 0
          const list: Array<SoftInstalled> = []

          for (const i of installed) {
            const { error, version } = await this.binVersion(i.bin, binName)
            console.log('error version: ', error, version, i)
            const num = version ? Number(version.split('.').slice(0, 2).join('')) : null
            const item = {
              version: version,
              bin: i.bin,
              path: i.path,
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
      Promise.all(all).then(async (list) => {
        console.log('AAAAAAA: ', JSON.parse(JSON.stringify(list)))
        const versions: { [k: string]: Array<SoftInstalled> } = {}
        list.forEach((o, i) => {
          versions[flag[i]] = o as any
        })

        const allZip = getAllFile(join(global.Server.Static!, 'zip'), false)
        console.log('allZip: ', allZip)
        const appDict: { [k: string]: string } = {
          apache: 'bin/httpd.exe',
          nginx: 'nginx.exe',
          mysql: 'bin/mysqld.exe',
          php: 'php-cgi.exe',
          caddy: 'caddy.exe',
          redis: 'redis-server.exe',
          memcached: 'memcached.exe',
          mongodb: 'bin/mongod.exe',
          postgresql: 'bin/pg_ctl.exe',
          mariadb: 'bin/mariadbd.exe'
        }

        for (const type of flag) {
          const varr = allZip.filter(z => z.startsWith(`${type}-`) && z.endsWith('.7z')).map(z => z.replace(`${type}-`, '').replace('.7z', ''))
          varr.forEach(v => {
            const num = Number(v.split('.').slice(0, 2).join(''))
            versions[type].push({
              version: v,
              bin: join(global.Server.AppDir!, `${type}-${v}`, appDict[type]),
              path: join(global.Server.AppDir!, `${type}-${v}`),
              num: num,
              enable: true,
              error: undefined,
              run: false,
              running: false
            })
          })
        }
        if (flag.includes('pure-ftpd')) {
          versions['pure-ftpd'] = [
            {
              version: '1.0',
              bin: '',
              path: '',
              num: 1,
              enable: true,
              error: undefined,
              run: false,
              running: false
            }
          ]
        }
        
        for (const type of flag) {
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
