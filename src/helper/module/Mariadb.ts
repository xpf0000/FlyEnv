import { exec } from 'child-process-promise'
import { BaseManager } from './Base'

class Manager extends BaseManager {
  macportsDirFixed(enDir: string, shareDir: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      try {
        await exec(`mkdir -p ${enDir}`)
        await exec(`cp -R ${shareDir} ${enDir}`)
      } catch (e) {}
      resolve(true)
    })
  }
}

export default new Manager()
