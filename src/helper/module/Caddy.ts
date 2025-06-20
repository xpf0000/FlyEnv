import { existsSync } from 'fs'
import { BaseManager } from './Base'
import { execPromise } from '@shared/child-process'

class Manager extends BaseManager {
  sslDirFixed(sslDir: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      if (existsSync(sslDir)) {
        try {
          const res = await execPromise(['ls', '-al', sslDir].join(' '))
          if (res.stdout.includes(' root ')) {
            await execPromise(['rm', '-rf', sslDir].join(' '))
          }
        } catch {}
      }
      resolve(true)
    })
  }
}

export default new Manager()
