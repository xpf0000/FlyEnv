const join = require('path').join
const { spawn } = require('child_process')
const { exec } = require('child-process-promise')
const Utils = require('./Utils.js')
const BaseManager = require('./BaseManager')
const { existsSync, unlinkSync } = require('fs')
class BrewManager extends BaseManager {
  constructor() {
    super()
  }

  #fixEnv() {
    let optdefault = { env: process.env }
    if (!optdefault.env['PATH']) {
      optdefault.env['PATH'] =
        '/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
    } else {
      optdefault.env[
        'PATH'
      ] = `/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:${optdefault.env['PATH']}`
    }
    return optdefault
  }

  async installBrew() {
    console.log('installBrew !!!!!')
    let brew = await this._checkBrew()
    if (brew !== 0) {
      let info = brew ? brew.toString() : '切换失败'
      this._processSend({
        code: 1,
        msg: `${info}<br/>`
      })
    } else {
      if (!global.Server.BrewCellar) {
        let repo = await Utils.execAsync('brew', ['--repo'])
        let cellar = await Utils.execAsync('brew', ['--cellar'])
        repo = repo.trim()
        cellar = cellar.trim()
        global.Server.BrewHome = repo
        global.Server.BrewFormula = join(repo, 'Library/Taps/homebrew/homebrew-core/Formula')
        global.Server.BrewCellar = cellar
        Utils.execAsync('git', [
          'config',
          '--global',
          '--add',
          'safe.directory',
          join(repo, 'Library/Taps/homebrew/homebrew-core')
        ]).then()
        Utils.execAsync('git', [
          'config',
          '--global',
          '--add',
          'safe.directory',
          join(repo, 'Library/Taps/homebrew/homebrew-cask')
        ]).then()
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
  }

  _doInstallOrUnInstall(rb, action) {
    return new Promise((resolve, reject) => {
      const opt = this.#fixEnv()
      const arch = global.Server.isAppleSilicon ? '-arm64' : '-x86_64'
      const name = rb
      const sh = join(global.Server.Static, 'sh/brew-cmd.sh')
      const copyfile = join(global.Server.Cache, 'brew-cmd.sh')
      if (existsSync(copyfile)) {
        unlinkSync(copyfile)
      }
      Utils.readFileAsync(sh)
        .then((content) => {
          return Utils.writeFileAsync(copyfile, content)
        })
        .then(() => {
          Utils.chmod(copyfile, '0777')
          const child = spawn('bash', [copyfile, arch, action, name], opt)
          this._childHandle(child, resolve, reject)
        })
    })
  }

  install(name) {
    this._doInstallOrUnInstall(name, 'install').then(this._thenSuccess).catch(this._catchError)
  }

  uninstall(name) {
    this._doInstallOrUnInstall(name, 'uninstall').then(this._thenSuccess).catch(this._catchError)
  }

  brewinfo(name) {
    let Info = ''
    Utils.execAsync('brew', ['info', name])
      .then((info) => {
        Info = info
        this._processSend({
          code: 200,
          info: info
        })
        console.log('info')
        const reg = new RegExp('(stable )([\\s\\S]*?)( )', 'g')
        let version = ''
        try {
          version = reg.exec(info)[2]
        } catch (e) {}
        const installed = !info.includes('Not installed')
        const obj = {
          version,
          installed,
          name
        }
        this._processSend({
          code: 0,
          msg: 'SUCCESS',
          data: obj
        })
      })
      .catch((err) => {
        this._processSend({
          code: 1,
          msg: err.toString(),
          brewInfo: Info
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

  binVersion(bin, name) {
    let reg = null
    let command = ''
    const handleCatch = (err) => {
      this._processSend({
        code: 1,
        msg: err.stderr
      })
    }
    const handleThen = (res) => {
      const str = res.stdout + res.stderr
      let version = ''
      try {
        version = reg.exec(str)[2].trim()
      } catch (e) {}
      if (version) {
        this._processSend({
          code: 0,
          msg: 'Success',
          version
        })
      } else {
        handleCatch({
          stderr: '获取版本号失败'
        })
      }
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
        command = `${bin} -v`
        break
      case 'mysqld_safe':
        bin = bin.replace('_safe', '')
        reg = new RegExp('(Ver )([\\s\\S]*?)( )', 'g')
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
    }
    console.log('binVersion command: ', command)
    const opt = this.#fixEnv()
    exec(command, opt).then(handleThen).catch(handleCatch)
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
        return Utils.execAsync('bash', [copyfile, srcFlag, global.Server.BrewHome])
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
}
module.exports = BrewManager
