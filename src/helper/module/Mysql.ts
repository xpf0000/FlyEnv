import { BaseManager } from './Base'
import { execPromise } from '../util'

class Manager extends BaseManager {
  macportsDirFixed(
    enDir: string,
    shareDir: string,
    langDir: string,
    langEnDir: string
  ): Promise<boolean> {
    return new Promise(async (resolve) => {
      try {
        await execPromise(`mkdir -p "${enDir}"`)
        await execPromise(`cp -R "${shareDir}/*" "${enDir}"`)
        await execPromise(`mkdir -p "${langDir}"`)
        await execPromise(`cp -R "${langEnDir}" "${langDir}"`)
      } catch {}
      resolve(true)
    })
  }
}

export default new Manager()
