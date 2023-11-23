const { exec } = require('child-process-promise')
const BaseManager = require('./BaseManager')
const { AppI18n } = require('./lang/index')
const { join, dirname } = require('path')
const { existsSync, realpathSync } = require('fs')
const Utils = require('./Utils.js')
class Manager extends BaseManager {
  constructor() {
    super()
  }

  binVersion(bin, name) {
    return new Promise((resolve) => {
      if (name === 'pure-ftpd') {
        resolve({
          version: '1.0.51'
        })
        return
      }
      let reg = null
      let command = ''
      const handleCatch = (err) => {
        resolve({
          error: command + '<br/>' + err.toString().trim().replace(new RegExp('\n', 'g'), '<br/>'),
          version: null
        })
      }
      const handleThen = (res) => {
        const str = res.stdout + res.stderr
        let version = ''
        try {
          version = reg.exec(str)[2].trim()
        } catch (e) {}
        version = !isNaN(parseInt(version)) ? version : null
        resolve({
          version
        })
      }
      switch (name) {
        case 'apachectl':
          reg = new RegExp('(Apache/)([\\s\\S]*?)( )', 'g')
          command = `${bin} -v`
          break
        case 'nginx':
          reg = new RegExp('(nginx/)([\\s\\S]*?)(\\n)', 'g')
          command = `${bin} -v`
          break
        case 'php-fpm':
          reg = new RegExp('(PHP )([\\s\\S]*?)( )', 'g')
          command = `${bin} -n -v`
          break
        case 'mysqld_safe':
          bin = bin.replace('_safe', '')
          reg = new RegExp('(Ver )([\\s\\S]*?)( )', 'g')
          command = `${bin} -V`
          break
        case 'mariadbd-safe':
          bin = bin.replace('-safe', '')
          reg = new RegExp('(Ver )([\\s\\S]*?)(-)', 'g')
          command = `${bin} -V`
          break
        case 'memcached':
          reg = new RegExp('(memcached )([\\s\\S]*?)(\\n)', 'g')
          command = `${bin} -V`
          break
        case 'redis-server':
          reg = new RegExp('(server v=)([\\s\\S]*?)( )', 'g')
          command = `${bin} -v`
          break
        case 'mongod':
          reg = new RegExp('(db version v)([\\s\\S]*?)(\\n)', 'g')
          command = `${bin} --version`
          break
      }
      const opt = this._fixEnv()
      exec(command, opt).then(handleThen).catch(handleCatch)
    })
  }

  allInstalledVersions(flag, setup) {
    const searchNames = {
      apache: 'httpd',
      nginx: 'nginx',
      php: 'php',
      mysql: 'mysql',
      mariadb: 'mariadb',
      memcached: 'memcached',
      redis: 'redis',
      mongodb: 'mongodb-',
      'pure-ftpd': 'pure-ftpd'
    }
    const binNames = {
      apache: 'apachectl',
      nginx: 'nginx',
      php: 'php-fpm',
      mysql: 'mysqld_safe',
      mariadb: 'mariadbd-safe',
      memcached: 'memcached',
      redis: 'redis-server',
      mongodb: 'mongod',
      'pure-ftpd': 'pure-ftpd'
    }
    const fetchVersion = (flag) => {
      return new Promise((resolve) => {
        const customDirs = setup?.[flag]?.dirs ?? []
        const binName = binNames[flag]
        const searchName = searchNames[flag]
        const installed = new Set()
        const systemDirs = ['/', '/opt', '/usr']
        const findInstalled = (dir, depth = 0, maxDepth = 2) => {
          let res = false
          let binPath = join(dir, `bin/${binName}`)
          if (existsSync(binPath)) {
            binPath = realpathSync(binPath)
            if (binPath.includes(binName)) {
              return binPath
            }
          }
          binPath = join(dir, `sbin/${binName}`)
          if (existsSync(binPath)) {
            binPath = realpathSync(binPath)
            if (binPath.includes(binName)) {
              return binPath
            }
          }
          if (depth >= maxDepth) {
            return res
          }
          const sub = Utils.getSubDir(dir)
          sub.forEach((s) => {
            res = res || findInstalled(s, depth + 1, maxDepth)
          })
          return res
        }
        systemDirs.forEach((s) => {
          const bin = findInstalled(s, 0, 1)
          if (bin) {
            installed.add(bin)
          }
        })
        const base = ['/usr/local/Cellar', '/opt/homebrew/Cellar']
        base.forEach((b) => {
          Utils.getSubDir(b)
            .filter((f) => {
              return f.includes(searchName)
            })
            .forEach((f) => {
              Utils.getSubDir(f).forEach((s) => {
                const bin = findInstalled(s)
                if (bin) {
                  installed.add(bin)
                }
              })
            })
        })
        customDirs.forEach((s) => {
          const bin = findInstalled(s, 0, 1)
          if (bin) {
            installed.add(bin)
          }
        })
        const count = installed.size
        if (count === 0) {
          resolve([])
          return
        }
        let index = 0
        const list = []
        installed.forEach(async (i) => {
          const path = i.replace(`/sbin/${binName}`, '').replace(`/bin/${binName}`, '')
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
            list.push(item)
          }
          index += 1
          if (index === count) {
            resolve(
              list.sort((a, b) => {
                return b.num - a.num
              })
            )
          }
        })
      })
    }
    const all = flag.map((f) => {
      return fetchVersion(f)
    })
    const findFromMacPorts = async (type) => {
      const list = []
      const base = '/opt/local/'
      if (type === 'php') {
        const fpms = [
          'sbin/php-fpm56',
          'sbin/php-fpm70',
          'sbin/php-fpm71',
          'sbin/php-fpm72',
          'sbin/php-fpm73',
          'sbin/php-fpm74',
          'sbin/php-fpm80',
          'sbin/php-fpm81',
          'sbin/php-fpm82',
          'sbin/php-fpm83'
        ]
        const find = async (fpm) => {
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
            list.push(item)
          }
          return true
        }
        for (const fpm of fpms) {
          await find(fpm)
        }
      } else if (type === 'nginx') {
        const fpms = ['sbin/nginx']
        const find = async (fpm) => {
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
            list.push(item)
          }
          return true
        }
        for (const fpm of fpms) {
          await find(fpm)
        }
      } else if (type === 'apache') {
        const fpms = ['sbin/apachectl']
        const find = async (fpm) => {
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
            list.push(item)
          }
          return true
        }
        for (const fpm of fpms) {
          await find(fpm)
        }
      } else if (type === 'mysql') {
        const fpms = [
          'lib/mysql5/bin/mysqld_safe',
          'lib/mysql8/bin/mysqld_safe',
          'lib/mysql51/bin/mysqld_safe',
          'lib/mysql55/bin/mysqld_safe',
          'lib/mysql56/bin/mysqld_safe',
          'lib/mysql57/bin/mysqld_safe',
          'lib/mysql81/bin/mysqld_safe'
        ]
        const find = async (fpm) => {
          const bin = join(base, fpm)
          if (existsSync(bin)) {
            const { error, version } = await this.binVersion(bin, 'mysqld_safe')
            const num = version ? Number(version.split('.').slice(0, 2).join('')) : null
            const item = {
              version: version,
              bin,
              path: dirname(dirname(bin)),
              num,
              enable: version !== null,
              error,
              run: false,
              running: false,
              flag: 'port'
            }
            list.push(item)
          }
          return true
        }
        for (const fpm of fpms) {
          await find(fpm)
        }
      } else if (type === 'mariadb') {
        const fpms = [
          'lib/mariadb-10.0/bin/mariadbd-safe',
          'lib/mariadb-10.1/bin/mariadbd-safe',
          'lib/mariadb-10.2/bin/mariadbd-safe',
          'lib/mariadb-10.3/bin/mariadbd-safe',
          'lib/mariadb-10.4/bin/mariadbd-safe',
          'lib/mariadb-10.5/bin/mariadbd-safe',
          'lib/mariadb-10.6/bin/mariadbd-safe',
          'lib/mariadb-10.7/bin/mariadbd-safe',
          'lib/mariadb-10.8/bin/mariadbd-safe',
          'lib/mariadb-10.9/bin/mariadbd-safe',
          'lib/mariadb-10.10/bin/mariadbd-safe',
          'lib/mariadb-10.11/bin/mariadbd-safe'
        ]
        const find = async (fpm) => {
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
              running: false,
              flag: 'port'
            }
            list.push(item)
          }
          return true
        }
        for (const fpm of fpms) {
          await find(fpm)
        }
      } else if (type === 'memcached') {
        const fpms = ['bin/memcached']
        const find = async (fpm) => {
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
            list.push(item)
          }
          return true
        }
        for (const fpm of fpms) {
          await find(fpm)
        }
      } else if (type === 'redis') {
        const fpms = ['bin/redis-server']
        const find = async (fpm) => {
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
            list.push(item)
          }
          return true
        }
        for (const fpm of fpms) {
          await find(fpm)
        }
      } else if (type === 'mongodb') {
        const fpms = ['bin/mongod', 'sbin/mongod']
        const find = async (fpm) => {
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
            list.push(item)
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
      const versions = {}
      list.forEach((o, i) => {
        versions[flag[i]] = o
      })
      for (const type of flag) {
        const items = await findFromMacPorts(type)
        versions[type].push(...items)
        const arr = []
        versions[type].forEach((f) => {
          if (!arr.find((a) => f.version === a.version && f.path === a.path && f.bin === a.bin)) {
            arr.push(f)
          }
        })
        versions[type] = arr
        versions[type].sort((a, b) => {
          return b.num - a.num
        })
      }
      this._processSend({
        code: 0,
        msg: 'Success',
        versions
      })
    })
  }
}

let manager = new Manager()
process.on('message', function (args) {
  if (args.Server) {
    global.Server = args.Server
    AppI18n(global.Server.Lang)
  } else {
    manager.exec(args)
  }
})
