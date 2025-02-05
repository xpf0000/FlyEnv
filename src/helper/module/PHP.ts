import { exec } from 'child-process-promise'
import { BaseManager } from './Base'
import { mkdirp } from 'fs-extra'
import { dirname } from 'path'

class Manager extends BaseManager {
  iniFileFixed(baseIni: string, ini: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      await mkdirp(dirname(baseIni))
      await exec(`cp -f "${ini}" "${baseIni}"`)
      await exec(`chmod 755 "${baseIni}"`)
      resolve(true)
    })
  }

  iniDefaultFileFixed(iniDefault: string, ini: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      await exec(`cp -f "${ini}" "${iniDefault}"`)
      resolve(true)
    })
  }
}

export default new Manager()
