import IPC from '@/util/IPC'
import { reactiveBind, waitTime } from '@/util/Index'
import { shell } from '@/util/NodeFn'
import { markRaw, nextTick, Ref } from 'vue'
import XTerm from '@/util/XTerm'
import { MessageError } from '@/util/Element'
import { I18nT } from '@lang/index'
import CommandData from './command.json'

export interface CommandItem {
  label: string
  descriptionKey: string
  needInput: boolean
  needRefresh?: boolean
}

export interface CommandCategory {
  nameKey: string
  commands: CommandItem[]
}

export interface CommandDataType {
  categories: CommandCategory[]
}

class OpenClaw {
  xterm: XTerm | undefined
  installing = false
  installEnd = false
  installed: boolean = false
  version: string = ''
  gatewayInstalling = false
  gatewayInstalled: boolean = false
  gatewayRunning: boolean = false
  loading: boolean = true
  gatewayStatus: string = ''
  dashboard = ''
  commandData: CommandDataType = CommandData as CommandDataType

  get actions(): string[] {
    const actions: string[] = []
    this.commandData.categories.forEach((category) => {
      category.commands.forEach((cmd) => {
        actions.push(cmd.label)
      })
    })
    return actions
  }

  get needRefreshActions(): string[] {
    const actions: string[] = ['openclaw install']
    this.commandData.categories.forEach((category) => {
      category.commands.forEach((cmd) => {
        if (cmd.needRefresh) {
          actions.push(cmd.label)
        }
      })
    })
    return actions
  }

  currentAction: string = ''
  configFile = ''

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
          this.configFile = res?.data?.configFile ?? ''
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

  async installGateway(domRef: Ref<HTMLElement>) {
    if (this.installing) {
      return
    }
    this.currentAction = 'openclaw gateway install'
    this.installEnd = false
    this.installing = true
    await nextTick()

    const execXTerm = new XTerm()
    this.xterm = markRaw(execXTerm)
    await execXTerm.mount(domRef.value)
    const command: string[] = []
    if (window.Server.isMacOS) {
      command.push('sudo openclaw gateway install --force')
    } else {
      command.push('openclaw gateway install --force')
    }

    if (window.Server.isLinux) {
      command.push('systemctl --user daemon-reload')
      command.push('systemctl --user enable openclaw-gateway.service')
      command.push('systemctl --user start openclaw-gateway.service')
      command.push('echo "openclaw gateway install end"')
    } else if (window.Server.isMacOS) {
      command.push('launchctl bootstrap gui/$UID ~/Library/LaunchAgents/ai.openclaw.gateway.plist')
    }

    command.push('openclaw gateway status --deep')

    await execXTerm.send(command, false)
    this.installEnd = true
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
    this.currentAction = 'openclaw install'
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
    await waitTime(1000)
    this.installEnd = true
  }

  async doAction(item: CommandItem, domRef: Ref<HTMLElement>) {
    if (this.installing) {
      return
    }
    this.currentAction = item.label
    this.installEnd = false
    this.installing = true
    await nextTick()

    const execXTerm = new XTerm()
    this.xterm = markRaw(execXTerm)
    await execXTerm.mount(domRef.value)
    if (item.needInput) {
      execXTerm.writeToNodePty(item.label + ' ')
    } else {
      const command: string[] = [item.label]
      await execXTerm.send(command, false)
      this.installEnd = true
    }
  }

  taskConfirm() {
    this.installing = false
    this.installEnd = false
    this.xterm?.destroy()
    delete this.xterm
    if (this.needRefreshActions.includes(this.currentAction)) {
      this.init()
    }
    this.currentAction = ''
  }
  taskCancel() {
    this.installing = false
    this.installEnd = false
    this.xterm?.stop()?.then(() => {
      this.xterm?.destroy()
      delete this.xterm
    })
    this.currentAction = ''
  }
}

export const OpenClawSetup = reactiveBind(new OpenClaw())
