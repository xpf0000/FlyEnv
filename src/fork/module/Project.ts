import { join, dirname, basename } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { md5, spawnPromise, uuid } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { chmod, copyFile, unlink, writeFile } from 'fs-extra'

class Manager extends Base {
  constructor() {
    super()
  }

  createProject(dir: string, php: string, composer: string, framework: string, version: string) {
    return new ForkPromise(async (resolve, reject, on) => {
      const cacheDir = global.Server.Cache
      if (php) {
        php = join(dirname(php), 'php.exe')
      }
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
        await writeFile(join(dir, 'composer.json'), tmpl)

        const command = ['@echo off', 'chcp 65001>nul', `cd /d "${dir}"`]
        if (php && composer) {
          command.push(`"${php}" "${composer}" update`)
        } else if (php) {
          command.push(`"${php}" composer update`)
        } else if (composer) {
          command.push(`php "${composer}" update`)
        } else {
          command.push(`php composer update`)
        }
        const copyfile = join(global.Server.Cache!, `${uuid()}.cmd`)
        console.log('createProject copyfile: ', copyfile)
        await writeFile(copyfile, command.join('\n'))
        const params = [copyfile]
        console.log('params: ', params.join(' '))
        spawnPromise(`${basename(copyfile)}`, [], {
          cwd: global.Server.Cache!
        })
          .on(on)
          .then(resolve)
          .catch(reject)
      } else {
        const names: { [k: string]: string } = {
          laravel: 'laravel/laravel',
          yii2: 'yiisoft/yii2-app-basic',
          thinkphp: 'topthink/think',
          symfony: 'symfony/skeleton',
          codeIgniter: 'codeigniter4/appstarter',
          cakephp: 'cakephp/app',
          slim: 'slim/slim-skeleton'
        }
        const name = names[framework]
        const sh = join(global.Server.Static!, 'sh/project-new.sh')
        const copyfile = join(global.Server.Cache!, 'project-new.sh')
        if (existsSync(copyfile)) {
          await unlink(copyfile)
        }
        await copyFile(sh, copyfile)
        await chmod(copyfile, '0777')
        const params = [copyfile, cacheDir, dir, name, version, binDir]
        console.log('params: ', params.join(' '))
        spawnPromise('zsh', params)
          .on(on)
          .then(async () => {
            if (framework === 'laravel') {
              const envFile = join(dir, '.env')
              if (!existsSync(envFile)) {
                const key = md5(uuid())
                await writeFile(
                  envFile,
                  `APP_DEBUG=true
APP_KEY=${key}`
                )
              }
            }
            resolve(true)
          })
          .catch(reject)
      }
    })
  }
}

export default new Manager()
