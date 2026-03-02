import { CloudflareTunnel } from '@/core/CloudflareTunnel/CloudflareTunnel'
import { StorageGetAsync, StorageSetAsync } from '@/util/Storage'
import { reactiveBind } from '@/util/Index'

const storeKey = 'flyenv-cloudflare-tunnel-store'

class CloudflareTunnelStore {
  items: CloudflareTunnel[] = []
  inited: boolean = false

  init() {
    if (this.inited) return
    this.inited = true
    StorageGetAsync<CloudflareTunnel[]>(storeKey)
      .then((res: CloudflareTunnel[]) => {
        if (res) {
          console.log('CloudflareTunnelStore init res:', res)
          for (const item of res) {
            const obj = reactiveBind(new CloudflareTunnel(item))
            this.items.push(obj)
          }
        }
      })
      .catch()
  }

  save() {
    StorageSetAsync(storeKey, JSON.parse(JSON.stringify(this.items))).catch()
  }
}

export default reactiveBind(new CloudflareTunnelStore())
