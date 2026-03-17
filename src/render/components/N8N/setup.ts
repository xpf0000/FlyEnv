import IPC from '@/util/IPC'
import { reactiveBind } from '@/util/Index'
import { markRaw, nextTick, Ref } from 'vue'
import XTerm from '@/util/XTerm'
import { BrewStore } from '@/store/brew'

class N8NManager {
  fetching = false
  installing = false
  installEnd = false
  versions: Array<{ version: string; mVersion: string; url: string; installed: boolean }> = []
  xterm: XTerm | undefined

  constructor() {}

  private checkInstalledVersions(): Promise<boolean> {
    return new Promise((resolve) => {
      const brewStore = BrewStore()
      const mod = brewStore.module('n8n')
      if (!mod.installedFetched) {
        mod.fetchInstalled().then(() => {
          this.updateInstalledState()
          resolve(true)
        })
      } else {
        this.updateInstalledState()
        resolve(true)
      }
    })
  }

  private updateInstalledState() {
    const brewStore = BrewStore()
    const installed = brewStore.module('n8n').installed
    this.versions = this.versions.map((v) => ({
      ...v,
      installed: installed.some((i: any) => i.version === v.version)
    }))
  }

  reinit() {
    this.versions.splice(0)
    this.fetching = false
    this.doFetch().catch()
  }

  init() {
    this.doFetch().catch()
  }

  async doFetch() {
    if (this.fetching || this.versions.length > 0) return
    this.fetching = true

    await this.checkInstalledVersions()

    IPC.send('app-fork:n8n', 'fetchAllOnlineVersion').then((key: string, res: any) => {
      IPC.off(key)
      const online: any[] = res?.data ?? []
      const brewStore = BrewStore()
      const installed = brewStore.module('n8n').installed
      this.versions = online.map((v) => ({
        ...v,
        installed: installed.some((i) => i.version === v.version)
      }))
      this.fetching = false
    })
  }

  async doAction(version: string, installed: boolean, domRef: Ref<HTMLElement>) {
    if (this.installing) return

    const action = installed ? 'uninstall' : 'install'
    const commands: string[] = []

    if (window.Server.isWindows) {
      if (window.Server.Proxy) {
        for (const k in window.Server.Proxy) {
          commands.push(`$env:${k}="${(window.Server.Proxy as any)[k]}"`)
        }
      }
      commands.push(`npm ${action} -g n8n@${version}`)
    } else {
      if (window.Server.Proxy) {
        for (const k in window.Server.Proxy) {
          commands.push(`export ${k}="${(window.Server.Proxy as any)[k]}"`)
        }
      }
      commands.push(`npm ${action} -g n8n@${version}`)
    }

    this.installEnd = false
    this.installing = true
    await nextTick()

    const execXTerm = new XTerm()
    this.xterm = markRaw(execXTerm)
    await execXTerm.mount(domRef.value)
    await execXTerm.send(commands, false)
    this.installEnd = true
  }

  onConfirm() {
    this.installing = false
    this.installEnd = false
    this.xterm?.destroy()
    delete this.xterm

    // Refresh installed versions
    const brewStore = BrewStore()
    const mod = brewStore.module('n8n')
    mod.installedFetched = false
    mod.fetchInstalled().then(() => {
      this.updateInstalledState()
    })
  }

  onCancel() {
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

export const N8NManagerSetup = reactiveBind(new N8NManager())
