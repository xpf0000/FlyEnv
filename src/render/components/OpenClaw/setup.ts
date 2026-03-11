import IPC from '@/util/IPC'
import { reactiveBind } from '@/util/Index'
import { shell } from '@/util/NodeFn'
import { markRaw, nextTick, Ref } from 'vue'
import XTerm from '@/util/XTerm'
import { MessageError } from '@/util/Element'
import { I18nT } from '@lang/index'

class OpenClaw {
  xterm: XTerm | undefined
  installing = false
  installEnd = false
  installed: boolean = false
  version: string = ''
  gatewayInstalled: boolean = false
  gatewayRunning: boolean = false
  loading: boolean = true
  gatewayStatus: string = ''
  dashboard = ''

  constructor() {}

  private checkInstalled() {
    return new Promise((resolve) => {
      IPC.send('app-fork:openclaw', 'checkInstalled').then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          this.installed = res?.data?.installed ?? false
          this.version = res?.data?.version ?? ''
        }
        resolve(true)
      })
    })
  }

  private getGatewayStatus() {
    return new Promise((resolve) => {
      IPC.send('app-fork:openclaw', 'getGatewayStatus').then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          this.gatewayInstalled = res?.data?.isInstalled ?? false
          this.gatewayRunning = res?.data?.isRunning ?? false
          this.dashboard = res?.data?.dashboard ?? ''
        }
        resolve(true)
      })
    })
  }

  init() {
    this.loading = true
    Promise.all([this.checkInstalled(), this.getGatewayStatus()]).then(() => {
      this.loading = false
    })
  }

  installGateway() {
    IPC.send('app-fork:openclaw', 'installGateway').then((key: string) => {
      IPC.off(key)
      Promise.all([this.checkInstalled(), this.getGatewayStatus()]).then(() => {
        this.loading = false
      })
    })
  }

  startGateway(): Promise<boolean> {
    return new Promise((resolve) => {
      this.loading = true
      IPC.send('app-fork:openclaw', 'startGateway').then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          this.gatewayRunning = true
        } else {
          this.gatewayRunning = false
          MessageError(res?.msg ?? I18nT('openclaw.startGatewayFail'))
        }
        this.loading = false
        resolve(true)
      })
    })
  }

  stopGateway(): Promise<boolean> {
    return new Promise((resolve) => {
      this.loading = true
      IPC.send('app-fork:openclaw', 'stopGateway').then((key: string) => {
        IPC.off(key)
        this.gatewayRunning = false
        this.loading = false
        resolve(true)
      })
    })
  }

  openURL(flag: 'home' | 'dashboard') {
    if (flag === 'home') {
      shell.openExternal('https://docs.openclaw.ai/').catch()
      return
    }
    shell.openExternal(this.dashboard).catch()
  }

  async installOpenClaw(domRef: Ref<HTMLElement>) {
    if (this.installing) {
      return
    }
    this.installEnd = false
    this.installing = true
    await nextTick()

    const execXTerm = new XTerm()
    this.xterm = markRaw(execXTerm)
    await execXTerm.mount(domRef.value)
    const command: string[] = []
    if (window.Server.isWindows) {
      if (window.Server.Proxy) {
        for (const k in window.Server.Proxy) {
          const v = window.Server.Proxy[k]
          command.push(`$env:${k}="${v}"`)
        }
      }
      command.push('iwr -useb https://openclaw.ai/install.ps1 | iex')
    } else {
      if (window.Server.Proxy) {
        for (const k in window.Server.Proxy) {
          const v = window.Server.Proxy[k]
          command.push(`export ${k}="${v}"`)
        }
      }
      command.push('curl -fsSL https://openclaw.ai/install.sh | bash')
    }
    await execXTerm.send(command, false)
    this.installEnd = true
  }

  taskConfirm() {
    this.installing = false
    this.installEnd = false
    this.xterm?.destroy()
    delete this.xterm
    this.init()
  }
  taskCancel() {
    this.installing = false
    this.installEnd = false
    this.xterm?.stop()?.then(() => {
      this.xterm?.destroy()
      delete this.xterm
    })
  }
}

export const OpenClawSetup = reactiveBind(new OpenClaw())
