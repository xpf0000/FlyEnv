const { exec } = require('child-process-promise')
const BaseManager = require('./BaseManager')
const { AppI18n } = require('./lang/index')
const { join } = require('path')
const { existsSync, realpathSync } = require('fs')
const Utils = require('./Utils.js')
class Manager extends BaseManager {
  constructor() {
    super()
  }

  binVersion(bin, name) {
    return new Promise((resolve) => {
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
          reg = new RegExp('("version": ")([\\s\\S]*?)(",)', 'g')
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
      mongodb: 'mongodb-'
    }
    const binNames = {
      apache: 'apachectl',
      nginx: 'nginx',
      php: 'php-fpm',
      mysql: 'mysqld_safe',
      mariadb: 'mariadbd-safe',
      memcached: 'memcached',
      redis: 'redis-server',
      mongodb: 'mongod'
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
        const base = global.Server?.BrewCellar ?? ''
        if (base) {
          Utils.getSubDir(base)
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
        }
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
          list.push(item)
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
    Promise.all(all).then((list) => {
      const versions = {}
      list.forEach((o, i) => {
        versions[flag[i]] = o
      })
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
