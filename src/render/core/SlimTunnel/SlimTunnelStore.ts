import { SlimTunnel } from '@/core/SlimTunnel/SlimTunnel'
import { StorageGetAsync, StorageSetAsync } from '@/util/Storage'
import { reactiveBind } from '@/util/Index'

const storeKey = 'flyenv-slim-tunnel-store'

type StoreData = {
  slimBin: string
  items: SlimTunnel[]
}

class SlimTunnelStore {
  slimBin: string = 'slim'
  slimVersion: string = ''
  items: SlimTunnel[] = []
  inited: boolean = false

  init() {
    if (this.inited) return
    this.inited = true
    StorageGetAsync<StoreData>(storeKey)
      .then((res: StoreData) => {
        if (res) {
          if (res.slimBin) this.slimBin = res.slimBin
          for (const item of res.items ?? []) {
            this.items.push(reactiveBind(new SlimTunnel(item)))
          }
        }
      })
      .catch()
  }

  save() {
    StorageSetAsync(storeKey, { slimBin: this.slimBin, items: JSON.parse(JSON.stringify(this.items)) }).catch()
  }
}

export default reactiveBind(new SlimTunnelStore())
