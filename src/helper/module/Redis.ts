import { existsSync } from 'fs'
import { BaseManager } from './Base'
import { execPromise } from '@shared/child-process'

class Manager extends BaseManager {
  logFileFixed(logFile: string, user: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      if (existsSync(logFile)) {
        console.log(`redis logFileFixed: chown ${user} ${logFile}`)
        await execPromise(`chown ${user} ${logFile}`)
      }
      resolve(true)
    })
  }
}

export default new Manager()
