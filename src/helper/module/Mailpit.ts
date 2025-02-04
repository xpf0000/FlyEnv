import { exec } from 'child-process-promise'
import { existsSync } from 'fs'
import { BaseManager } from './Base'

class Manager extends BaseManager {
  binFixed(bin: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      if (existsSync(bin)) {
        try {
          await exec(`xattr -dr "com.apple.quarantine" "${bin}"`)
        } catch (e) {}
      }
      resolve(true)
    })
  }
}

export default new Manager()
