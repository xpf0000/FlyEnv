import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { ForkPromise } from '@shared/ForkPromise'
import { OnlineVersionItem } from '@shared/app'

class Composer extends Base {
  constructor() {
    super()
    this.type = 'composer'
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('composer')
        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `composer-${a.version}`, 'composer.phar')
          const zip = join(global.Server.Cache!, `composer-${a.version}.phar`)
          a.appDir = join(global.Server.AppDir!, `composer-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.type = 'composer'
        })
        resolve(all)
      } catch (e) {
        resolve([])
      }
    })
  }

}
export default new Composer()
