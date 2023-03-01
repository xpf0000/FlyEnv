const join = require('path').join
const { spawn } = require('child_process')
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
              global.Server.BrewFormula = join(p, 'Library/Taps/homebrew/homebrew-core/Formula')
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

  _doInstallOrUnInstall(rb, action) {
    return new Promise((resolve, reject) => {
      const opt = this._fixEnv()
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
    Utils.execAsync('brew', ['info', name, '--json'])
      .then((info) => {
        try {
          Info = JSON.parse(info)[0]
        } catch (e) {
          Info = {}
        }
        const obj = {
          version: Info?.versions?.stable ?? '',
          installed: Info?.installed?.length > 0,
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
