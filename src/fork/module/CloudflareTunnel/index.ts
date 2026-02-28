import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { CloudflareTunnel } from './CloudflareTunnel'
import { dirname, join } from 'path'
import { mkdirp } from '@shared/fs-extra'
import { writeFile } from '../../Fn'

class CloudflareTunnelBase extends Base {
  constructor() {
    super()
    this.type = 'cloudflare-tunnel'
  }

  fetchAllZone(item: CloudflareTunnel) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const model = new CloudflareTunnel()
        Object.assign(model, item)
        const list = await model.fetchAllZone()
        resolve(list)
      } catch (e) {
        reject(e)
      }
    })
  }

  start(item: CloudflareTunnel) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const model = new CloudflareTunnel()
        Object.assign(model, item)
        const res = await model.start()
        const appPidFile = join(global.Server.BaseDir!, `pid/${this.type}.pid`)
        await mkdirp(dirname(appPidFile))
        await writeFile(appPidFile, model.pid)
        resolve(res)
      } catch (e) {
        reject(e)
      }
    })
  }

  stop(item: CloudflareTunnel) {
    return new ForkPromise(async (resolve) => {
      try {
        const model = new CloudflareTunnel()
        Object.assign(model, item)
        await model.stop()
      } catch (e) {
        console.log('CloudflareTunnelBase stop error', e)
      }
      resolve(true)
    })
  }
}
export default new CloudflareTunnelBase()
