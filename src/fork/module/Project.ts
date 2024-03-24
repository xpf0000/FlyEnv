import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { SoftInstalled } from '@shared/app'
import { execPromise, md5, spawnPromise, uuid } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { chmod, copyFile, mkdirp, remove, unlink, writeFile } from 'fs-extra'

class Manager extends Base {
  constructor() {
    super()
  }

  createProject(dir: string, phpBin: string, framework: string, version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      const cacheDir = global.Server.Cache
      const binDir = join(global.Server.Cache!, 'bin')
      await mkdirp(binDir)
      const binPhp = join(binDir, 'php')
      if (existsSync(binPhp)) {
        await remove(binPhp)
      }
      const command = `echo '${global.Server.Password}' | sudo -S ln -s ${phpBin} ${binPhp}`
      try {
        await execPromise(command)
      } catch (e) {}
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
        const sh = join(global.Server.Static!, 'sh/project-new-wordpress.sh')
        const copyfile = join(global.Server.Cache!, 'project-new-wordpress.sh')
        if (existsSync(copyfile)) {
          await unlink(copyfile)
        }
        await writeFile(join(dir, 'composer.json'), tmpl)
        await copyFile(sh, copyfile)
        await chmod(copyfile, '0777')
        const params = [copyfile, cacheDir, dir, binDir]
        console.log('params: ', params.join(' '))
        spawnPromise('zsh', params).on(on).then(resolve).catch(reject)
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
