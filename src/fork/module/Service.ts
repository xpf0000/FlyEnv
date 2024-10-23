import { Base } from './Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { AppHost } from '@shared/app'
import type { ServiceItem } from './service/ServiceItem'
import { ServiceItemJavaSpring } from './service/ServiceItemJavaSpring'
import { ServiceItemJavaTomcat } from './service/ServiceItemJavaTomcat'
import { ServiceItemNode } from './service/ServiceItemNode'

class Service extends Base {
  all: Record<string, ServiceItem> = {}
  start(host: AppHost) {
    return new ForkPromise(async (resolve, reject) => {
      if (this.all[`${host.id}`]) {
        const task = this.all[`${host.id}`]
        await task.stop()
      }
      if (host.type === 'java') {
        if (host?.subType === 'springboot') {
          const item = new ServiceItemJavaSpring()
          item.id = `${host.id}`
          item.watchDir = host.root
          item.start(host).then(resolve).catch(reject)
          this.all[`${host.id}`] = item
        } else {
          const item = new ServiceItemJavaTomcat()
          item.id = `${host.id}`
          item.watchDir = host.root
          item.start(host).then(resolve).catch(reject)
          this.all[`${host.id}`] = item
        }
      } else if (host.type === 'node') {
        const item = new ServiceItemNode()
        item.id = `${host.id}`
        item.watchDir = host.root
        item.start(host).then(resolve).catch(reject)
        this.all[`${host.id}`] = item
      }
    })
  }
  stop(host: AppHost) {
    return new ForkPromise(async (resolve, reject) => {
      const task = this.all[`${host.id}`]
      if (task) {
        task
          .stop(true)
          .then(resolve)
          .catch(reject)
          .finally(() => {
            delete this.all?.[`${host.id}`]
          })
      } else {
        reject(new Error('No Task'))
      }
    })
  }
}

export default new Service()
