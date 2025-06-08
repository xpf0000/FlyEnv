import { join, dirname, basename } from 'path'
import { Base } from './Base'
import { AppLog, md5, moveDirToDir, spawnPromise, uuid, remove, writeFile } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import PHPManager from './Php'
import { I18nT } from '@lang/index'
import { existsSync } from 'fs'
class Manager extends Base {
  constructor() {
    super()
  }

  createProject(dir: string, php: string, composer: string, framework: string, version: string) {
    return new ForkPromise(async (resolve, reject, on) => {
      if (php) {
        php = join(dirname(php), 'php.exe')
        await PHPManager.getIniPath({ path: dirname(php) } as any)
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

        on({
          'APP-On-Log': AppLog(
            'info',
            I18nT('appLog.newProjectBegin', { command: `\n${command.join('\n')}` })
          )
        })

        const copyfile = join(window.Server.Cache!, `${uuid()}.cmd`)
        console.log('createProject copyfile: ', copyfile)
        await writeFile(copyfile, command.join('\n'))
        const params = [copyfile]
        console.log('params: ', params.join(' '))
        spawnPromise(`${basename(copyfile)}`, [], {
          cwd: window.Server.Cache!
        })
          .on(on)
          .then(() => {
            on({
              'APP-On-Log': AppLog('info', I18nT('appLog.newProjectSuccess', { dir }))
            })
            resolve(true)
          })
          .catch((e) => {
            on({
              'APP-On-Log': AppLog('error', I18nT('appLog.newProjectFail'))
            })
            reject(e)
          })
          .finally(() => {
            remove(copyfile).then().catch()
          })
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

        const command = ['@echo off', 'chcp 65001>nul', `cd /d "${dir}"`]
        if (php && composer) {
          command.push(
            `"${php}" "${composer}" create-project --prefer-dist "${name}" "flyenv-create-project" "${version}"`
          )
        } else if (php) {
          command.push(
            `"${php}" composer create-project --prefer-dist "${name}" "flyenv-create-project" "${version}"`
          )
        } else if (composer) {
          command.push(
            `php "${composer}" create-project --prefer-dist "${name}" "flyenv-create-project" "${version}"`
          )
        } else {
          command.push(
            `php composer create-project --prefer-dist "${name}" "flyenv-create-project" "${version}"`
          )
        }

        on({
          'APP-On-Log': AppLog(
            'info',
            I18nT('appLog.newProjectBegin', { command: `\n${command.join('\n')}` })
          )
        })

        const copyfile = join(window.Server.Cache!, `${uuid()}.cmd`)
        console.log('createProject copyfile: ', copyfile)
        await writeFile(copyfile, command.join('\n'))
        const params = [copyfile]
        console.log('params: ', params.join(' '))
        spawnPromise(`${basename(copyfile)}`, [], {
          cwd: window.Server.Cache!
        })
          .on(on)
          .then(async () => {
            const pdir = join(dir, 'flyenv-create-project')
            await moveDirToDir(pdir, dir)
            await remove(pdir)
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
            on({
              'APP-On-Log': AppLog('info', I18nT('appLog.newProjectSuccess', { dir }))
            })
            resolve(true)
          })
          .catch((e) => {
            on({
              'APP-On-Log': AppLog('error', I18nT('appLog.newProjectFail'))
            })
            reject(e)
          })
          .finally(() => {
            remove(copyfile).then().catch()
          })
      }
    })
  }

  handleProjectDir(dir: string, framework: string) {
    return new ForkPromise(async (resolve, reject) => {
      const pdir = join(dir, 'flyenv-create-project')
      if (!existsSync(pdir)) {
        return reject(new Error(I18nT('appLog.newProjectFail')))
      }
      try {
        await moveDirToDir(pdir, dir)
        await remove(pdir)
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
      } catch (e) {
        return reject(e)
      }
      resolve(true)
    })
  }
}

export default new Manager()
