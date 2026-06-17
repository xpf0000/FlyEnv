import IPC from '@/util/IPC'
import { reactiveBind } from '@/util/Index'
import { shell } from '@/util/NodeFn'
import { markRaw, nextTick, Ref } from 'vue'
import XTerm from '@/util/XTerm'
import { MessageError, MessageSuccess } from '@/util/Element'
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

export interface SessionItem {
  id: string
  title: string
  workDir: string
  updatedAt: string
}

export interface QuickSettings {
  default_permission_mode: string
  default_thinking: boolean
  default_plan_mode: boolean
  telemetry: boolean
}

class Kimi {
  xterm: XTerm | undefined
  installing = false
  installEnd = false
  installed = false
  version = ''
  loading = false

  configPaths: Record<string, string> = {}
  sessions: SessionItem[] = []

  commandData: CommandDataType = CommandData as CommandDataType
  currentAction = ''

  confTab = ''
  logTab = ''

  quickSettings: QuickSettings = {
    default_permission_mode: 'manual',
    default_thinking: false,
    default_plan_mode: false,
    telemetry: true
  }

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
    const actions: string[] = ['install']
    this.commandData.categories.forEach((category) => {
      category.commands.forEach((cmd) => {
        if (cmd.needRefresh) {
          actions.push(cmd.label)
        }
      })
    })
    return actions
  }

  private checkInstalled() {
    return new Promise((resolve) => {
      IPC.send('app-fork:kimi', 'checkInstalled').then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          this.installed = res?.data?.installed ?? false
          this.version = res?.data?.version ?? ''
        }
        resolve(true)
      })
    })
  }

  private getConfigPath() {
    return new Promise((resolve) => {
      IPC.send('app-fork:kimi', 'getConfigPath').then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          this.configPaths = res?.data ?? {}
        }
        resolve(true)
      })
    })
  }

  init() {
    this.loading = true
    Promise.all([this.checkInstalled(), this.getConfigPath(), this.getQuickSettings()]).then(() => {
      this.loading = false
    })
  }

  openURL(flag: 'home' | 'docs') {
    if (flag === 'home') {
      shell.openExternal('https://github.com/MoonshotAI/kimi-code').catch()
    } else if (flag === 'docs') {
      shell.openExternal('https://www.kimi.com/code/docs/en/').catch()
    }
  }

  async installKimi(domRef: Ref<HTMLElement>) {
    if (this.installing) {
      return
    }
    this.currentAction = 'install'
    this.installEnd = false
    this.installing = true
    await nextTick()

    const execXTerm = new XTerm()
    this.xterm = markRaw(execXTerm)
    await execXTerm.mount(domRef.value)
    const command: string[] = []
    if (window.Server.Proxy) {
      for (const k in window.Server.Proxy) {
        const v = window.Server.Proxy[k]
        command.push(`export ${k}="${v}"`)
      }
    }
    if (window.Server.isWindows) {
      command.push('irm https://code.kimi.com/kimi-code/install.ps1 | iex')
    } else {
      command.push('curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash')
    }
    await execXTerm.send(command, false)
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

  getLogFiles(): Promise<Array<{ name: string; path: string }>> {
    return new Promise((resolve) => {
      IPC.send('app-fork:kimi', 'getLogFiles').then((key: string, res: any) => {
        IPC.off(key)
        resolve(res?.data ?? [])
      })
    })
  }

  getLogs(type: string): Promise<string> {
    return new Promise((resolve) => {
      IPC.send('app-fork:kimi', 'getLogs', type).then((key: string, res: any) => {
        IPC.off(key)
        resolve(res?.data ?? '')
      })
    })
  }

  refreshSessions() {
    IPC.send('app-fork:kimi', 'listSessions').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.sessions = res?.data ?? []
      }
    })
  }

  deleteSession(sessionId: string) {
    return new Promise((resolve) => {
      IPC.send('app-fork:kimi', 'deleteSession', sessionId).then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          MessageSuccess(I18nT('kimi.sessionDeleted'))
          this.refreshSessions()
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        resolve(true)
      })
    })
  }

  async resumeSession(sessionId: string, domRef: Ref<HTMLElement>) {
    if (this.installing) {
      return
    }
    this.currentAction = 'resumeSession'
    this.installEnd = false
    this.installing = true
    await nextTick()

    const execXTerm = new XTerm()
    this.xterm = markRaw(execXTerm)
    await execXTerm.mount(domRef.value)
    const command: string[] = [`kimi --session "${sessionId}"`]
    await execXTerm.send(command, false)
    this.installEnd = true
  }

  async exportSession(sessionId: string, domRef: Ref<HTMLElement>) {
    if (this.installing) {
      return
    }
    this.currentAction = 'exportSession'
    this.installEnd = false
    this.installing = true
    await nextTick()

    const execXTerm = new XTerm()
    this.xterm = markRaw(execXTerm)
    await execXTerm.mount(domRef.value)
    const command: string[] = [`kimi export "${sessionId}"`]
    await execXTerm.send(command, false)
    this.installEnd = true
  }

  getQuickSettings() {
    return new Promise((resolve) => {
      IPC.send('app-fork:kimi', 'getQuickSettings').then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          this.quickSettings = res?.data ?? this.quickSettings
        }
        resolve(true)
      })
    })
  }

  setQuickSettings() {
    return new Promise((resolve) => {
      IPC.send('app-fork:kimi', 'setQuickSettings', this.quickSettings).then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          MessageSuccess(I18nT('kimi.quickSettingsSaved'))
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        resolve(true)
      })
    })
  }

  taskConfirm() {
    this.installing = false
    this.installEnd = false
    this.xterm?.destroy()
    delete this.xterm
    if (this.needRefreshActions.includes(this.currentAction)) {
      this.init()
    }
    if (this.currentAction === 'deleteSession' || this.currentAction === 'exportSession') {
      this.refreshSessions()
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
  }
}

export const KimiSetup = reactiveBind(new Kimi())
