import { BaseManager } from './Base'
import { mkdirp } from '../util'
import { dirname } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

class Manager extends BaseManager {
  iniFileFixed(baseIni: string, ini: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      await mkdirp(dirname(baseIni))
      await execAsync(`cp -f "${ini}" "${baseIni}"`)
      await execAsync(`chmod 755 "${baseIni}"`)
      resolve(true)
    })
  }

  iniDefaultFileFixed(iniDefault: string, ini: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      await execAsync(`cp -f "${ini}" "${iniDefault}"`)
      resolve(true)
    })
  }
}

export default new Manager()
