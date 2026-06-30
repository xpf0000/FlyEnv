import { reactiveBind } from '@/util/Index'
import { markRaw, nextTick, Ref } from 'vue'
import XTerm from '@/util/XTerm'
import IPC from '@/util/IPC'
import { AppHost, AppStore } from '@/store/app'
import type { SoftInstalled } from '@shared/app'
import { fs } from '@/util/NodeFn'
import { dirname } from '@/util/path-browserify'
import { handleHost, hostAlias, hostDefaultSSLCert } from '@/util/Host'
import localForage from 'localforage'

const MKCERT_STORE_KEY = 'flyenv-mkcert-store'

class MkCertStore {
  mkcertBin: string = 'mkcert'
  mkcertVersion: string = ''
  caroot: string = ''
  inited: boolean = false
  installing: boolean = false
  installEnd: boolean = false
  xterm: XTerm | undefined
  editHost?: AppHost | null

  async installCA(domRef: Ref<HTMLElement>, binPath: string) {
    if (this.installing) return
    this.editHost = null
    this.installEnd = false
    this.installing = true
    await nextTick()

    const execXTerm = new XTerm()
    this.xterm = markRaw(execXTerm)
    await execXTerm.mount(domRef.value)
    const bin = binPath || 'mkcert'
    let commands: string[] = []
    if (window.Server.isWindows) {
      commands = [`cd "${dirname(bin)}"`, `./mkcert.exe -install`]
    } else {
      commands = [`"${bin}" -install`]
    }
    await execXTerm.send(commands, false)
    this.installEnd = true
  }

  async generateCert(host: AppHost, domRef: Ref<HTMLElement>, binPath: string) {
    if (this.installing) return
    this.editHost = host
    const ssl = hostDefaultSSLCert(host)
    const cert = host.ssl.cert || ssl.cert
    const key = host.ssl.key || ssl.key

    this.installEnd = false
    this.installing = true
    await nextTick()

    await fs.mkdirp(dirname(cert))
    const domains = hostAlias(host).join(' ')

    const execXTerm = new XTerm()
    this.xterm = markRaw(execXTerm)
    await execXTerm.mount(domRef.value)
    const bin = binPath || 'mkcert'
    let commands: string[] = []
    if (window.Server.isWindows) {
      commands = [
        `cd "${dirname(bin)}"`,
        `./mkcert.exe -cert-file "${cert}" -key-file "${key}" ${domains}`
      ]
    } else {
      commands = [`"${bin}" -cert-file "${cert}" -key-file "${key}" ${domains}`]
    }
    await execXTerm.send(commands, false)
    this.installEnd = true
  }

  taskConfirm() {
    this.installing = false
    this.installEnd = false
    this.xterm?.destroy()
    delete this.xterm

    if (this.editHost) {
      if (!this.editHost.useSSL || !this.editHost?.ssl?.cert || !this.editHost?.ssl?.key) {
        const appStore = AppStore()
        const find = appStore.hosts.find((h) => h.id === this.editHost?.id)
        if (find) {
          const old = JSON.parse(JSON.stringify(find))
          find.useSSL = true
          find.ssl = hostDefaultSSLCert(find)
          handleHost(JSON.parse(JSON.stringify(find)), 'edit', old).catch()
        }
      }
    }
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

  save() {
    return localForage.setItem(
      MKCERT_STORE_KEY,
      JSON.parse(
        JSON.stringify({
          mkcertBin: this.mkcertBin,
          mkcertVersion: this.mkcertVersion,
          caroot: this.caroot
        })
      )
    )
  }

  fetchCARoot(version?: SoftInstalled) {
    if (this.caroot || !version) {
      return
    }
    IPC.send('app-fork:mkcert', 'getCAROOT', { mkcertBin: version.bin }).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          this.caroot = res.data?.caroot ?? ''
        }
      }
    )
  }
}

export default reactiveBind(new MkCertStore())
