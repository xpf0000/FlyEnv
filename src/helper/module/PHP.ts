import { BaseManager } from './Base'
import { dirname } from 'node:path'
import { execPromise, mkdirp } from '../util'

class Manager extends BaseManager {
  iniFileFixed(baseIni: string, ini: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      await mkdirp(dirname(baseIni))
      await execPromise(`cp -f "${ini}" "${baseIni}"`)
      await execPromise(`chmod 755 "${baseIni}"`)
      resolve(true)
    })
  }

  iniDefaultFileFixed(iniDefault: string, ini: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      await execPromise(`cp -f "${ini}" "${iniDefault}"`)
      resolve(true)
    })
  }
}

export default new Manager()
