import { join } from 'node:path'
import { Base } from '../Base'
import { md5, moveDirToDir, uuid, remove, writeFile } from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { I18nT } from '@lang/index'
import { existsSync } from 'node:fs'

class Manager extends Base {
  constructor() {
    super()
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
