import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { CloudflareTunnel } from './CloudflareTunnel'

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

  fetchTunnel(item: CloudflareTunnel) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const model = new CloudflareTunnel()
        Object.assign(model, item)
        await model.fetchTunnel()
        resolve(JSON.parse(JSON.stringify(model)))
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
        await this.saveAppPid(model.pid).catch((e) => {
          console.error('CloudflareTunnelBase save app pid error', e)
        })
        const json = JSON.parse(JSON.stringify(res))
        json['APP-Service-Start-PID'] = model.pid
        resolve(json)
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
