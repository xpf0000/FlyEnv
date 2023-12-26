const { exec } = require('child-process-promise')
const { AppI18n } = require('./lang/index')
const { I18nT } = require('./lang/index.js')
class Manager {
  constructor() {
    this.watchList
  }

  allVersion(dir) {
    const env = this._fixEnv()
    env.env.NVM_DIR = dir
    exec(
      '[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh";[ -s "$NVM_DIR/bash_completion" ] && \\. "$NVM_DIR/bash_completion";nvm ls-remote',
      env
    )
      .then((res) => {
        let str = res.stdout
        let all = str.match(/\sv\d+(\.\d+){1,4}\s/g).map((v) => {
          return v.trim().replace('v', '')
        })
        this._processSend({
          code: 0,
          msg: 'SUCCESS',
          versions: all.reverse()
        })
      })
      .catch((err) => {
        this._processSend({
          code: 1,
          msg: err
        })
      })
  }

  localVersion(dir) {
    const env = this._fixEnv()
    env.env.NVM_DIR = dir
    exec(
      '[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh";[ -s "$NVM_DIR/bash_completion" ] && \\. "$NVM_DIR/bash_completion";nvm ls',
      env
    )
      .then((res) => {
        let str = res.stdout
        let ls = str.split('default')[0]
        let localVersions = ls.match(/\d+(\.\d+){1,4}/g)
        let reg = /default.*?(\d+(\.\d+){1,4}).*?\(/g
        let current = reg.exec(str)
        if (current.length > 1) {
          current = current[1]
        } else {
          current = ''
        }
        this._processSend({
          code: 0,
          msg: 'SUCCESS',
          versions: localVersions,
          current: current
        })
      })
      .catch((err) => {
        this._processSend({
          code: 1,
          msg: err
        })
      })
  }

  versionChange(dir, select) {
    const env = this._fixEnv()
    env.env.NVM_DIR = dir
    exec(
      `[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh";[ -s "$NVM_DIR/bash_completion" ] && \\. "$NVM_DIR/bash_completion";nvm install v${select};nvm alias default ${select}`,
      env
    )
      .then(this._thenSuccess)
      .catch(this._catchError)
  }

  installNvm() {
    const env = this._fixEnv()
    exec('curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash', env)
      .then(this._thenSuccess)
      .catch(this._catchError)
  }

  nvmDir() {
    const env = this._fixEnv()
    exec(
      '[ -s "$HOME/.bash_profile" ] && source "$HOME/.bash_profile";[ -s "$HOME/.zshrc" ] && source "$HOME/.zshrc";echo $NVM_DIR',
      env
    )
      .then((res) => {
        console.log('$NVM_DIR: ', res.stdout.trim())
        let NVM_DIR = res.stdout.trim()
        // 已安装
        if (NVM_DIR.length > 0) {
          this._processSend({
            code: 0,
            msg: 'SUCCESS',
            NVM_DIR
          })
        } else {
          this._processSend({
            code: 1,
            msg: I18nT('fork.nvmDirNoFound')
          })
        }
      })
      .catch(this._catchError)
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
