import { StorageGetAsync, StorageSetAsync } from '@/util/Storage'
import { reactiveBind } from '@/util/Index'

const storeKey = 'flyenv-mkcert-store'

class MkCertStore {
  mkcertBin: string = 'mkcert'
  mkcertVersion: string = ''
  caroot: string = ''
  inited: boolean = false

  init() {
    if (this.inited) return
    this.inited = true
    StorageGetAsync<{ mkcertBin?: string; mkcertVersion?: string; caroot?: string }>(storeKey)
      .then((res) => {
        if (res) {
          if (res.mkcertBin) this.mkcertBin = res.mkcertBin
          if (res.mkcertVersion) this.mkcertVersion = res.mkcertVersion
          if (res.caroot) this.caroot = res.caroot
        }
      })
      .catch()
  }

  save() {
    StorageSetAsync(storeKey, {
      mkcertBin: this.mkcertBin,
      mkcertVersion: this.mkcertVersion,
      caroot: this.caroot
    }).catch()
  }
}

export default reactiveBind(new MkCertStore())
