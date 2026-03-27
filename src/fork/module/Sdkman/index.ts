import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { sdkmanJavaSearch, sdkmanMavenSearch } from '../../Fn'

class Sdkman extends Base {
  constructor() {
    super()
  }

  /**
   * Get SDKMAN init command prefix
   * All sdk commands require sourcing sdkman-init.sh first
   */
  private _initPrefix(): string {
    const sdkmanHome = global.Server.SdkmanHome ?? join(global.Server.UserHome!, '.sdkman')
    return `source "${join(sdkmanHome, 'bin/sdkman-init.sh')}"`
  }

  /**
   * List available Java versions from SDKMAN
   */
  listJava() {
    return new ForkPromise(async (resolve) => {
      try {
        const info = await sdkmanJavaSearch(this._initPrefix())
        resolve(info)
      } catch (e) {
        console.log('sdkman listJava err: ', e)
        resolve([])
      }
    })
  }

  /**
   * List available Maven versions from SDKMAN
   */
  listMaven() {
    return new ForkPromise(async (resolve) => {
      try {
        const info = await sdkmanMavenSearch(this._initPrefix())
        resolve(info)
      } catch (e) {
        console.log('sdkman listMaven err: ', e)
        resolve([])
      }
    })
  }
}

export default new Sdkman()
