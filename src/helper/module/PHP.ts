import { exec } from 'child-process-promise'
import { BaseManager } from './Base'

class Manager extends BaseManager {
  iniFileFixed(baseIni: string, ini: string): Promise<boolean> {
    return new Promise(async (resolve) => {
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
