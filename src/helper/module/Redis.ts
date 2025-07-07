import { existsSync } from 'node:fs'
import { BaseManager } from './Base'
import { execPromise } from '../util'

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
