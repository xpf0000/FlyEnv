import { exec } from 'child-process-promise'
import { existsSync } from 'fs'
import { BaseManager } from './Base'

class Manager extends BaseManager {
  sslDirFixed(sslDir: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      if (existsSync(sslDir)) {
        try {
          const res = await exec(['ls', '-al', sslDir].join(' '))
          if (res.stdout.includes(' root ')) {
            await exec(['rm', '-rf', sslDir].join(' '))
          }
        } catch (e) {}
      }
      resolve(true)
    })
  }
}

export default new Manager()
