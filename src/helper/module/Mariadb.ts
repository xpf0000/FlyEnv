import { BaseManager } from './Base'
import { execPromise } from '@shared/child-process'

class Manager extends BaseManager {
  macportsDirFixed(enDir: string, shareDir: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      try {
        await execPromise(`mkdir -p ${enDir}`)
        await execPromise(`cp -R ${shareDir} ${enDir}`)
      } catch {}
      resolve(true)
    })
  }
}

export default new Manager()
