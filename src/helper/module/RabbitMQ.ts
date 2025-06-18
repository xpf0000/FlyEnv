import { BaseManager } from './Base'
import { execPromise } from '@shared/child-process'

class Manager extends BaseManager {
  initPlugin(cwd: string): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      try {
        await execPromise(`./rabbitmq-plugins enable rabbitmq_management`, {
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
