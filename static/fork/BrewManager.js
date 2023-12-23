const join = require('path').join
const { execSync } = require('child_process')
const { exec } = require('child-process-promise')
const Utils = require('./Utils.js')
const BaseManager = require('./BaseManager')
const { existsSync, unlinkSync } = require('fs')
const { I18nT } = require('./lang/index.js')
class BrewManager extends BaseManager {
  constructor() {
    super()
  }

  async installBrew() {
    if (!global.Server.BrewCellar) {
      Utils.execAsync('which', ['brew'])
        .then(() => {
          Utils.execAsync('brew', ['--repo'])
            .then((p) => {
              global.Server.BrewHome = p
              Utils.execAsync('git', [
                'config',
                '--global',
                '--add',
                'safe.directory',
                join(p, 'Library/Taps/homebrew/homebrew-core')
              ]).then()
              Utils.execAsync('git', [
                'config',
                '--global',
                '--add',
                'safe.directory',
                join(p, 'Library/Taps/homebrew/homebrew-cask')
              ]).then()
              return Utils.execAsync('brew', ['--cellar'])
            })
            .then((c) => {
              console.log('brew --cellar: ', c)
              global.Server.BrewCellar = c
              process.send({
                command: 'application:global-server-updata',
                key: 'application:global-server-updata',
                info: global.Server
              })
              this._processSend({
                code: 0,
                msg: 'SUCCESS',
                data: global.Server
              })
            })
        })
        .catch(() => {
          this._processSend({
            code: 1,
            msg: I18nT('fork.brewNoFound')
          })
        })
    } else {
      process.send({
        command: 'application:global-server-updata',
        key: 'application:global-server-updata',
        info: global.Server
      })
      this._processSend({
        code: 0,
        msg: 'SUCCESS',
        data: global.Server
      })
    }
  }

  install(name) {
    this._doInstallOrUnInstallByBrew(name, 'install')
      .then(this._thenSuccess)
      .catch(this._catchError)
  }

  uninstall(name) {
    this._doInstallOrUnInstallByBrew(name, 'uninstall')
      .then(this._thenSuccess)
      .catch(this._catchError)
  }

  brewinfo(name) {
    const Info = {}
    const findAll = () => {
      const all = []
      let cammand = ''
      switch (name) {
        case 'php':
          all.push('php')
          cammand = 'brew search --formula "/php@[\\d\\.]+$/"'
          break
        case 'nginx':
          all.push('nginx')
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
          cammand = 'brew search --formula "/mysql@[\\d\\.]+$/"'
          break
        case 'mariadb':
          all.push('mariadb')
          cammand = 'brew search --formula "/mariadb@[\\d\\.]+$/"'
          break
        case 'redis':
          all.push('redis')
          cammand = 'brew search --formula "/^redis@[\\d\\.]+$/"'
          break
        case 'mongodb':
          cammand =
            'brew search --desc --eval-all --formula "High-performance, schema-free, document-oriented database"'
          break
        case 'postgresql':
          cammand = 'brew search --formula "/^postgresql@[\\d\\.]+$/"'
          break
      }
      if (cammand) {
        try {
          let content = execSync(cammand, {
            env: {
              HOMEBREW_NO_INSTALL_FROM_API: 1,
              ...Utils.fixEnv()
            }
          }).toString()
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
            .filter((s) => !!s.trim())
            .map((s) => s.trim())
          all.push(...content)
        } catch (e) {}
      }
      return all
    }
    const doRun = () => {
      const all = findAll()
      const cammand = ['brew', 'info', ...all, '--json', '--formula'].join(' ')
      try {
        const info = execSync(cammand, {
          env: {
            HOMEBREW_NO_INSTALL_FROM_API: 1,
            ...Utils.fixEnv()
          }
        }).toString()
        const arr = JSON.parse(info)
        arr.forEach((item) => {
          Info[item.full_name] = {
            version: item?.versions?.stable ?? '',
            installed: item?.installed?.length > 0,
            name: item.full_name,
            flag: 'brew'
          }
        })
      } catch (e) {}
      this._processSend({
        code: 0,
        msg: 'SUCCESS',
        data: Info
      })
    }
    doRun()
  }

  portinfo(flag) {
    const Info = {}
    let reg = `^${flag}\\d*$`
    if (flag === 'mariadb') {
      reg = '^mariadb-([\\d\\.]*)\\d$'
    }
    Utils.execAsync('port', ['search', '--name', '--line', '--regex', reg])
      .then((info) => {
        console.log('portinfo: ', info)
        info = info ?? ''
        let arr = []
        try {
          arr = info
            .split('\n')
            .filter((f) => {
              if (flag === 'php') {
                return f.includes('lang www') && f.includes('PHP: Hypertext Preprocessor')
              }
              if (flag === 'nginx') {
                return f.includes('High-performance HTTP(S) server')
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
            .map((m) => {
              const a = m.split('\t').filter((f) => f.trim().length > 0)
              const name = a.shift()
              const version = a.shift()
              let installed = false
              if (flag === 'php') {
                installed = existsSync(join('/opt/local/bin/', name))
              } else if (flag === 'nginx') {
                installed = existsSync(join('/opt/local/sbin/', name))
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
        } catch (e) {}
        arr.forEach((item) => {
          Info[item.name] = item
        })
        this._processSend({
          code: 0,
          msg: 'SUCCESS',
          data: Info
        })
      })
      .catch((err) => {
        this._processSend({
          code: 1,
          msg: err.toString()
        })
      })
  }

  addTap(name) {
    Utils.execAsync('brew', ['tap'])
      .then((stdout) => {
        if (stdout.includes(name)) {
          return null
        } else {
          return Utils.execAsync('brew', ['tap', name])
        }
      })
      .then(() => {
        this._processSend({
          code: 0,
          msg: `Brew install tap ${name} SUCCESS`
        })
      })
      .catch((err) => {
        this._processSend({
          code: 1,
          msg: err.toString()
        })
      })
  }

  currentSrc() {
    Utils.execAsync('git', ['remote', '-v'], {
      cwd: global.Server.BrewHome
    })
      .then((src) => {
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
        this._processSend({
          code: 0,
          msg: 'SUCCESS',
          data: value
        })
      })
      .catch((err) => {
        console.log('brew currentSrc err: ', err)
        this._processSend({
          code: 1,
          msg: err.toString()
        })
      })
  }

  changeSrc(srcFlag) {
    const sh = join(global.Server.Static, 'sh/brew-src.sh')
    const copyfile = join(global.Server.Cache, 'brew-src.sh')
    if (existsSync(copyfile)) {
      unlinkSync(copyfile)
    }
    Utils.readFileAsync(sh)
      .then((content) => {
        return Utils.writeFileAsync(copyfile, content)
      })
      .then(() => {
        Utils.chmod(copyfile, '0777')
        return exec(`source brew-src.sh ${srcFlag} ${global.Server.BrewHome}`, {
          env: Utils.fixEnv(),
          cwd: global.Server.Cache
        })
      })
      .then(() => {
        this._processSend({
          code: 0,
          msg: 'SUCCESS'
        })
      })
      .catch((err) => {
        console.log('brew changeSrc err: ', err)
        this._processSend({
          code: 1,
          msg: err.toString()
        })
      })
  }

  async fetchAllPhpExtensions(num) {
    const names = {
      pecl_http: 'http.so',
      phalcon3: 'phalcon.so',
      phalcon4: 'phalcon.so',
      phalcon5: 'phalcon.so'
    }
    const zend = ['xdebug']
    try {
      const allTap = await Utils.execAsync('brew', ['tap'])
      if (!allTap.includes('shivammathur/extensions')) {
        await Utils.execAsync('brew', ['tap', 'shivammathur/extensions'])
      }
      const cammand = `brew search --formula "/shivammathur\\/extensions\\/[\\s\\S]+${num}$/"`
      let content = execSync(cammand, {
        env: {
          HOMEBREW_NO_INSTALL_FROM_API: 1,
          ...Utils.fixEnv()
        }
      }).toString()
      content = content
        .split('\n')
        .filter((s) => !!s.trim())
        .map((s) => {
          const name = s.replace('shivammathur/extensions/', '').replace(`@${num}`, '')
          const res = {
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
      this._processSend({
        code: 0,
        data: content
      })
    } catch (err) {
      this._processSend({
        code: 1,
        msg: err.toString()
      })
    }
  }

  async fetchAllPhpExtensionsByPort(num) {
    const names = {
      pecl_http: 'http.so',
      phalcon3: 'phalcon.so',
      phalcon4: 'phalcon.so',
      phalcon5: 'phalcon.so',
      tideways_xhprof: 'xhprof.so',
      postgresql: 'pgsql.so',
      mysql: 'mysqli.so'
    }
    const zend = ['xdebug']
    try {
      const numStr = `${num}`.split('.').join('')
      const cammand = `port search --name --line php${numStr}-`
      console.log('cammand: ', cammand)
      let res = await exec(cammand, this._fixEnv())
      res = res.stdout.toString()
      const arr = res
        .split('\n')
        .filter((f) => {
          return !!f.trim() && !f.includes('lang www')
        })
        .map((m) => {
          const a = m.split('\t').filter((f) => f.trim().length > 0)
          const libName = a.shift()
          const name = libName.replace(`php${numStr}-`, '').toLowerCase()
          const item = {
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
      this._processSend({
        code: 0,
        data: arr
      })
    } catch (err) {
      this._processSend({
        code: 1,
        msg: err.toString()
      })
    }
  }
}
module.exports = BrewManager
