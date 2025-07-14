import { existsSync } from 'node:fs'
import { BaseManager } from './Base'
import { execPromise, isMacOS } from '../util'

class Manager extends BaseManager {
  binFixed(bin: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      if (isMacOS()) {
        if (existsSync(bin)) {
          try {
            await execPromise(`xattr -dr "com.apple.quarantine" "${bin}"`)
          } catch {}
        }
      }
      resolve(true)
    })
  }
}

export default new Manager()
