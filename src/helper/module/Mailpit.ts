import { existsSync } from 'node:fs'
import { BaseManager } from './Base'
import { execPromise } from '../util'

class Manager extends BaseManager {
  binFixed(bin: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      if (existsSync(bin)) {
        try {
          await execPromise(`xattr -dr "com.apple.quarantine" "${bin}"`)
        } catch {}
      }
      resolve(true)
    })
  }
}

export default new Manager()
