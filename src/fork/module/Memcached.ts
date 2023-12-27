import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { SoftInstalled } from '@shared/app'
import { execPromise, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { mkdirp } from 'fs-extra'
class Memcached extends Base {
  constructor() {
    super()
    this.type = 'memcached'
  }

  init() {
    this.pidPath = join(global.Server.MemcachedDir!, 'logs/memcached.pid')
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      const bin = version.bin
      const common = join(global.Server.MemcachedDir!, 'logs')
      const pid = join(common, 'memcached.pid')
      const log = join(common, 'memcached.log')
      const command = `${bin} -d -P ${pid} -vv >> ${log} 2>&1`
      try {
        await mkdirp(common)
        const res = await execPromise(command)
        on(res.stdout)
        await waitTime(600)
        if (existsSync(pid)) {
          resolve(0)
        } else {
          reject(new Error(I18nT('fork.startFail')))
        }
      } catch (e: any) {
        reject(e)
      }
    })
  }
}
export default new Memcached()
