import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { SoftInstalled } from '@shared/app'
import { spawnPromise } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { chmod, copyFile, unlink, writeFile } from 'fs-extra'

class Manager extends Base {
  constructor() {
    super()
  }

  createProject(dir: string, phpDir: string, framework: string, version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      const phpBinDir = join(phpDir, 'bin')
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
        const sh = join(global.Server.Static!, 'sh/project-new-wordpress.sh')
        const copyfile = join(global.Server.Cache!, 'project-new-wordpress.sh')
        if (existsSync(copyfile)) {
          await unlink(copyfile)
        }
        await writeFile(join(dir, 'composer.json'), tmpl)
        await copyFile(sh, copyfile)
        await chmod(copyfile, '0777')
        const params = [copyfile, cacheDir, dir, phpBinDir]
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
        const params = [copyfile, cacheDir, dir, name, version, phpBinDir]
        console.log('params: ', params.join(' '))
        spawnPromise('zsh', params).on(on).then(resolve).catch(reject)
      }
    })
  }
}

export default new Manager()
