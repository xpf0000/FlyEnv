import { execPromise } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { existsSync } from 'fs'
import type { ModuleExecItem } from '@shared/app'
import { ProcessPidListByPid } from '../Process'
import { customerServiceStartExec } from '../util/Exec'

class ModuleCustomer {
  constructor() {}

  exec(fnName: string, ...args: any) {
    // @ts-ignore
    const fn: (...args: any) => ForkPromise<any> = this?.[fnName] as any
    if (fn) {
      return fn.call(this, ...args)
    }
    return new ForkPromise((resolve, reject) => {
      reject(new Error('No Found Function'))
    })
  }

  stopService(pid: string) {
    return new ForkPromise(async (resolve) => {
      const pids = await ProcessPidListByPid(`${pid}`.trim())

      if (pids.length > 0) {
        const str = pids.map((s) => `/pid ${s}`).join(' ')
        try {
          await execPromise(`taskkill /f /t ${str}`)
        } catch (e) {}
      }

      resolve({
        'APP-Service-Stop-PID': pids
      })
    })
  }
  startService(version: ModuleExecItem) {
    return new ForkPromise(async (resolve, reject) => {
      if (version.commandType === 'file' && !existsSync(version.commandFile)) {
        reject(new Error('Command File Not Exists'))
        return
      }

      try {
        const res = await customerServiceStartExec(version)
        resolve(res)
      } catch (e: any) {
        console.log('-k start err: ', e)
        reject(e)
        return
      }
    })
  }
}
export default new ModuleCustomer()
