import { exec } from 'child-process-promise'
import { BaseManager } from './Base'

class Manager extends BaseManager {
  initPlugin(cwd: string): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      try {
        await exec(`./rabbitmq-plugins enable rabbitmq_management`, {
          cwd
        })
      } catch (e) {
        reject(e)
        return
      }
      resolve(true)
    })
  }
}

export default new Manager()
