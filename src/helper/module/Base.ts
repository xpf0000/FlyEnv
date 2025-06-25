import { execPromise } from '@shared/child-process'

export class BaseManager {
  exec(fnName: keyof typeof this, ...args: any) {
    const fn: (...args: any) => Promise<any> = this?.[fnName] as any
    if (fn) {
      return fn.call(this, ...args)
    }
    return new Promise((resolve, reject) => {
      reject(new Error('No Found Function'))
    })
  }
  startService(command: string, options: any = {}): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      try {
        await execPromise(command, options)
      } catch (e) {
        reject(e)
        return
      }
      resolve(true)
    })
  }
}
