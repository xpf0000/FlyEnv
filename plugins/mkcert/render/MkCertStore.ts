import { markRaw, nextTick, reactive, Ref } from 'vue'
import XTerm from '@/util/XTerm'
import IPC from '@/util/IPC'
import { AppHost, AppStore } from '@/store/app'
import type { SoftInstalled } from '@shared/app'
import { fs } from '@/util/NodeFn'
import { dirname } from '@/util/path-browserify'
import { handleHost, hostAlias, hostDefaultSSLCert } from '@/util/Host'

export interface MkcertBulkResult {
  hostId: number
  hostName: string
  ok: boolean
  error?: string
}

class MkCertStore {
  caroot: string = ''
  installing: boolean = false
  installEnd: boolean = false
  xterm: XTerm | undefined
  editHost: AppHost | null = null
  bulkResults: MkcertBulkResult[] = []
  bulkTotal: number = 0
  bulkDone: number = 0

  get bulkActive() {
    return this.bulkTotal > 0 && this.bulkResults.length === 0
  }

  async installCA(domRef: Ref<HTMLElement>, binPath: string) {
    if (this.installing) return
    this.editHost = null
    this.bulkResults = []
    this.bulkTotal = 0
    this.bulkDone = 0
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

  private resolveCertKey(host: AppHost) {
    const ssl = hostDefaultSSLCert(host)
    const cert = host.ssl?.cert || ssl.cert
    const key = host.ssl?.key || ssl.key
    return { cert, key }
  }

  private async preparePaths(host: AppHost) {
    const { cert, key } = this.resolveCertKey(host)
    // Drop the previous cert/key before regenerating so mkcert starts clean.
    try {
      await fs.remove(cert)
    } catch {}
    try {
      await fs.remove(key)
    } catch {}
    await fs.mkdirp(dirname(cert))
    if (dirname(key) !== dirname(cert)) {
      await fs.mkdirp(dirname(key))
    }
    return { cert, key }
  }

  private generateCommand(cert: string, key: string, domains: string, binPath: string) {
    const bin = binPath || 'mkcert'
    if (window.Server.isWindows) {
      return `./mkcert.exe -cert-file "${cert}" -key-file "${key}" ${domains}`
    }
    return `"${bin}" -cert-file "${cert}" -key-file "${key}" ${domains}`
  }

  async generateCert(host: AppHost, domRef: Ref<HTMLElement>, binPath: string) {
    if (this.installing) return
    this.editHost = host
    this.bulkResults = []
    this.bulkTotal = 0
    this.bulkDone = 0
    this.installEnd = false
    this.installing = true
    await nextTick()

    const { cert, key } = await this.preparePaths(host)
    const domains = hostAlias(host).join(' ')

    const execXTerm = new XTerm()
    this.xterm = markRaw(execXTerm)
    await execXTerm.mount(domRef.value)
    const commands: string[] = []
    if (window.Server.isWindows) {
      commands.push(`cd "${dirname(binPath || 'mkcert')}"`)
    }
    commands.push(this.generateCommand(cert, key, domains, binPath))
    await execXTerm.send(commands, false)
    this.installEnd = true
  }

  async generateCertsBulk(hosts: AppHost[], domRef: Ref<HTMLElement>, binPath: string) {
    if (this.installing || !hosts.length) return
    this.editHost = null
    this.bulkResults = []
    this.bulkTotal = hosts.length
    this.bulkDone = 0
    this.installEnd = false
    this.installing = true
    await nextTick()

    const execXTerm = new XTerm()
    this.xterm = markRaw(execXTerm)
    await execXTerm.mount(domRef.value)

    const win = window.Server.isWindows
    const results: MkcertBulkResult[] = []
    const commands: string[] = []
    const verify: { host: AppHost; cert: string }[] = []

    if (win) {
      commands.push(`cd "${dirname(binPath || 'mkcert')}"`)
    }

    for (const host of hosts) {
      let cert = ''
      let key = ''
      try {
        const prepared = await this.preparePaths(host)
        cert = prepared.cert
        key = prepared.key
      } catch (e: any) {
        results.push({
          hostId: host.id,
          hostName: host.name,
          ok: false,
          error: `${e?.message ?? e}`
        })
        this.bulkDone++
        continue
      }
      verify.push({ host, cert })
      commands.push(this.generateCommand(cert, key, hostAlias(host).join(' '), binPath))
    }

    if (commands.length) {
      try {
        await execXTerm.send(commands, false)
      } catch {
        // The terminal command may report a non-zero exit if any host failed.
        // Per-host success is verified below instead of aborting the batch.
      }
      for (const item of verify) {
        let ok = false
        try {
          ok = await fs.existsSync(item.cert)
        } catch {
          ok = false
        }
        results.push({ hostId: item.host.id, hostName: item.host.name, ok })
        this.bulkDone++
      }
    }

    this.bulkResults = results
    this.installEnd = true
  }

  taskConfirm() {
    const targets: AppHost[] = []
    if (this.editHost) {
      targets.push(this.editHost)
    } else if (this.bulkResults.length) {
      const appStore = AppStore()
      this.bulkResults
        .filter((r) => r.ok)
        .forEach((r) => {
          const find = appStore.hosts.find((h) => h.id === r.hostId)
          if (find) targets.push(find)
        })
    }
    this.editHost = null

    this.installing = false
    this.installEnd = false
    this.xterm?.destroy()
    delete this.xterm

    this.bulkResults = []
    this.bulkTotal = 0
    this.bulkDone = 0

    this.applySSLTargets(targets).catch()
  }

  private async applySSLTargets(targets: AppHost[]) {
    const appStore = AppStore()
    for (const host of targets) {
      const find = appStore.hosts.find((h) => h.id === host.id)
      if (!find) continue
      if (find.useSSL && find.ssl?.cert && find.ssl?.key) continue
      const old = JSON.parse(JSON.stringify(find))
      find.useSSL = true
      find.ssl = hostDefaultSSLCert(find)
      try {
        await handleHost(JSON.parse(JSON.stringify(find)), 'edit', old)
      } catch {}
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

export default reactive(new MkCertStore())
