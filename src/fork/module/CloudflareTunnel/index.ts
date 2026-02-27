import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { CloudflareTunnel } from './CloudflareTunnel'

class CloudflareTunnelBase extends Base {
  constructor() {
    super()
  }

  fetchAllZone(item: CloudflareTunnel) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const moodel = new CloudflareTunnel()
        Object.assign(moodel, item)
        const list = await moodel.fetchAllZone()
        resolve(list)
      } catch (e) {
        reject(e)
      }
    })
  }
}
export default new CloudflareTunnelBase()
