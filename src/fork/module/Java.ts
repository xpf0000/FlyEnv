import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { ForkPromise } from '@shared/ForkPromise'
import { OnlineVersionItem } from '@shared/app'

class Java extends Base {
  constructor() {
    super()
    this.type = 'java'
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('java')
        all.forEach((a: any) => {
          const dir = join(
            global.Server.AppDir!,
            `${a.type}-${a.version}`,
            'bin/java.exe'
          )
          const zip = join(global.Server.Cache!, `${a.type}-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `${a.type}-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `${a.type}${a.version}`
        })
        resolve(all)
      } catch (e) {
        console.log('Java fetch version e: ', e)
        resolve([])
      }
    })
  }
}
export default new Java()