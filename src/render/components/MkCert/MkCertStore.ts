import { StorageGetAsync, StorageSetAsync } from '@/util/Storage'
import { reactiveBind } from '@/util/Index'
import { markRaw, nextTick, Ref } from 'vue'
import XTerm from '@/util/XTerm'

const storeKey = 'flyenv-mkcert-store'

class MkCertStore {
  mkcertBin: string = 'mkcert'
  mkcertVersion: string = ''
  caroot: string = ''
  inited: boolean = false
  installing: boolean = false
  installEnd: boolean = false
  xterm: XTerm | undefined

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

  async installCA(domRef: Ref<HTMLElement>, binPath: string) {
    if (this.installing) return

    this.installEnd = false
    this.installing = true
    await nextTick()

    const execXTerm = new XTerm()
    this.xterm = markRaw(execXTerm)
    await execXTerm.mount(domRef.value)
    const bin = binPath || 'mkcert'
    const commands = [`"${bin}" -install`]
    await execXTerm.send(commands, false)
    this.installEnd = true
  }

  taskConfirm() {
    this.installing = false
    this.installEnd = false
    this.xterm?.destroy()
    delete this.xterm
  }

  taskCancel() {
    this.installing = false
    this.installEnd = false
    this.xterm?.stop()?.then(() => {
      this.xterm?.destroy()
      delete this.xterm
    })
  }

  onMounted(domRef: Ref<HTMLElement | undefined>) {
    if (this.installing && this.xterm && domRef.value) {
      this.xterm.mount(domRef.value).catch()
    }
  }

  onUnmounted() {
    this.xterm?.unmounted?.()
  }
}

export default reactiveBind(new MkCertStore())
