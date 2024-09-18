import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { OnlineVersionItem } from '@shared/app'

class Java extends Base {
  constructor() {
    super()
    this.type = 'java'
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('java')
        const dict: any = {}
        all.forEach((a: any) => {
          const dir = join(
            global.Server.AppDir!,
            `static-${a.type}-${a.version}`,
            'Contents/Home/bin/java'
          )
          const zip = join(global.Server.Cache!, `static-${a.type}-${a.version}.tar.gz`)
          a.appDir = join(global.Server.AppDir!, `static-${a.type}-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          dict[`${a.type}-${a.version}`] = a
        })
        resolve(dict)
      } catch (e) {
        resolve({})
      }
    })
  }
}
export default new Java()
