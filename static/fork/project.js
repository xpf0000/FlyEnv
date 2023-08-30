const BaseManager = require('./BaseManager')
const { AppI18n } = require('./lang/index')
const { join } = require('path')
const { existsSync, unlinkSync } = require('fs')
const Utils = require('./Utils.js')
const { spawn } = require('child_process')
class Manager extends BaseManager {
  constructor() {
    super()
  }

  createProject(dir, framework, version) {
    const optdefault = { env: process.env }
    if (!optdefault.env['PATH']) {
      optdefault.env[
        'PATH'
      ] = `${version.path}bin/:/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`
    } else {
      optdefault.env[
        'PATH'
      ] = `${version.path}bin/:/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:${optdefault.env['PATH']}`
    }
    if (global.Server.Proxy) {
      for (const k in global.Server.Proxy) {
        optdefault.env[k] = global.Server.Proxy[k]
      }
    }

    const cacheDir = global.Server.Cache

    if (framework === 'wordpress') {
      const tmpl = `{
  "require": {
    "johnpbloch/wordpress": "${version}"
  },
  "config": {
    "allow-plugins": {
      "johnpbloch/wordpress-core-installer": true
    }
  }
}
`
      const sh = join(global.Server.Static, 'sh/project-new-wordpress.sh')
      const copyfile = join(global.Server.Cache, 'project-new-wordpress.sh')
      if (existsSync(copyfile)) {
        unlinkSync(copyfile)
      }
      Utils.writeFileAsync(join(dir, 'composer.json'), tmpl)
        .then(() => {
          return Utils.readFileAsync(sh)
        })
        .then((content) => {
          return Utils.writeFileAsync(copyfile, content)
        })
        .then(() => {
          const params = [copyfile, cacheDir, dir]
          console.log('params: ', params.join(' '))
          const child = spawn('zsh', params, optdefault)
          this._childHandle(
            child,
            () => {
              this._thenSuccess()
            },
            (err) => {
              this._catchError(err)
            }
          )
        })
        .catch((err) => {
          this._catchError(err)
        })
    } else {
      const names = {
        laravel: 'laravel/laravel',
        yii2: 'yiisoft/yii2-app-basic',
        thinkphp: 'topthink/think',
        symfony: 'symfony/skeleton',
        codeIgniter: 'codeigniter4/appstarter',
        cakephp: 'cakephp/app',
        slim: 'slim/slim-skeleton'
      }
      const name = names[framework]
      const sh = join(global.Server.Static, 'sh/project-new.sh')
      const copyfile = join(global.Server.Cache, 'project-new.sh')
      if (existsSync(copyfile)) {
        unlinkSync(copyfile)
      }
      Utils.readFileAsync(sh)
        .then((content) => {
          return Utils.writeFileAsync(copyfile, content)
        })
        .then(() => {
          const params = [copyfile, cacheDir, dir, name, version]
          console.log('params: ', params.join(' '))
          const child = spawn('zsh', params, optdefault)
          this._childHandle(
            child,
            () => {
              this._thenSuccess()
            },
            (err) => {
              this._catchError(err)
            }
          )
        })
        .catch((err) => {
          this._catchError(err)
        })
    }
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
