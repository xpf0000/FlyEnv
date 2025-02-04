import { exec } from 'child-process-promise'
import { existsSync } from 'fs'
import { BaseManager } from './Base'

class Manager extends BaseManager {
  logFileFixed(logFile: string, user: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      if (existsSync(logFile)) {
        console.log(`redis logFileFixed: chown ${user} ${logFile}`)
        await exec(`chown ${user} ${logFile}`)
      }
      resolve(true)
    })
  }
}

export default new Manager()
