const { exec } = require('child-process-promise')
const BaseManager = require('./BaseManager')
class Manager extends BaseManager {
  constructor() {
    super()
  }

  allVersion(dir) {
    exec(
      '[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh";[ -s "$NVM_DIR/bash_completion" ] && \\. "$NVM_DIR/bash_completion";nvm ls-remote',
      {
        env: {
          NVM_DIR: dir
        }
      }
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
    exec(
      '[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh";[ -s "$NVM_DIR/bash_completion" ] && \\. "$NVM_DIR/bash_completion";nvm ls',
      {
        env: {
          NVM_DIR: dir
        }
      }
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
    exec(
      `[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh";[ -s "$NVM_DIR/bash_completion" ] && \\. "$NVM_DIR/bash_completion";nvm install v${select};nvm alias default ${select}`,
      {
        env: {
          NVM_DIR: dir
        }
      }
    )
      .then(this._thenSuccess)
      .catch(this._catchError)
  }

  installNvm() {
    exec('curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.37.2/install.sh | bash')
      .then(this._thenSuccess)
      .catch(this._catchError)
  }

  nvmDir() {
    exec(
      '[ -s "$HOME/.bash_profile" ] && source "$HOME/.bash_profile";[ -s "$HOME/.zshrc" ] && source "$HOME/.zshrc";echo $NVM_DIR'
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
            msg: 'NVM_DIR未找到'
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
  } else {
    manager.exec(args)
  }
})
