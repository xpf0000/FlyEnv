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

export interface ProviderItem {
  name: string
  baseUrl: string
}

export interface SessionItem {
  name: string
}

export interface InstalledSkillItem {
  name: string
  category: string
  source: string
  trust: string
  isBuiltin: boolean
  isHub: boolean
  isLocal: boolean
  enabled: boolean
}

export interface BrowseSkillItem {
  num: number
  name: string
  description: string
  source: string
  trust: string
}

export interface SearchSkillItem {
  name: string
  description: string
  source: string
  trust: string
  identifier: string
}

class Hermes {
  xterm: XTerm | undefined
  installing = false
  installEnd = false
  installed: boolean = false
  version: string = ''
  gatewayRunning: boolean = false
  loading: boolean = true
  gatewayStatus: string = ''
  configPaths: Record<string, string> = {}
  skills: string[] = []
  sessions: SessionItem[] = []
  providers: ProviderItem[] = [
    { name: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
    { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
    { name: 'Anthropic', baseUrl: 'https://api.anthropic.com' }
  ]
  currentProvider = ''
  chatQuery = ''
  commandData: CommandDataType = CommandData as CommandDataType
  currentAction: string = ''

  confTab: string = ''
  logTab: string = ''

  // Skills tab
  skillTab: 'installed' | 'all' = 'installed'
  installedSkills: InstalledSkillItem[] = []
  allSkills: BrowseSkillItem[] = []
  skillSearch = ''
  skillPage = 1
  skillPageSize = 20
  skillTotal = 0
  skillTotalPages = 1
  skillInspectContent = ''
  skillInspectVisible = false
  skillConfig: { disabled: string[] } = { disabled: [] }

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

  constructor() {}

  private checkInstalled() {
    return new Promise((resolve) => {
      IPC.send('app-fork:hermes', 'checkInstalled').then((key: string, res: any) => {
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
      IPC.send('app-fork:hermes', 'getGatewayStatus').then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          this.gatewayRunning = res?.data?.isRunning ?? false
        }
        resolve(true)
      })
    })
  }

  private getConfigPath() {
    return new Promise((resolve) => {
      IPC.send('app-fork:hermes', 'getConfigPath').then((key: string, res: any) => {
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
    Promise.all([this.checkInstalled(), this.getGatewayStatus(), this.getConfigPath()]).then(() => {
      this.loading = false
    })
  }

  startGateway(): Promise<boolean> {
    return new Promise((resolve) => {
      this.loading = true
      IPC.send('app-fork:hermes', 'startGateway').then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          this.gatewayRunning = true
          MessageSuccess(I18nT('hermes.gatewayRunning'))
        } else {
          this.gatewayRunning = false
          MessageError(res?.msg ?? I18nT('hermes.startGatewayFail'))
        }
        this.loading = false
        resolve(true)
      })
    })
  }

  stopGateway(): Promise<boolean> {
    return new Promise((resolve) => {
      this.loading = true
      IPC.send('app-fork:hermes', 'stopGateway').then((key: string) => {
        IPC.off(key)
        this.gatewayRunning = false
        this.loading = false
        resolve(true)
      })
    })
  }

  openURL(flag: 'home') {
    if (flag === 'home') {
      shell.openExternal('https://hermes-agent.nousresearch.com/').catch()
    }
  }

  async installHermes(domRef: Ref<HTMLElement>) {
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
    command.push('curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash')
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

  refreshSkills() {
    IPC.send('app-fork:hermes', 'listSkills').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.skills = res?.data ?? []
      }
    })
  }

  installSkill(name: string) {
    this.loading = true
    IPC.send('app-fork:hermes', 'installSkill', name).then((key: string, res: any) => {
      IPC.off(key)
      this.loading = false
      if (res?.code === 0) {
        MessageSuccess(I18nT('hermes.skillInstallSuccess'))
        this.refreshSkills()
      } else {
        MessageError(res?.msg ?? I18nT('hermes.skillInstallFail'))
      }
    })
  }

  refreshSessions() {
    IPC.send('app-fork:hermes', 'listSessions').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.sessions = res?.data ?? []
      }
    })
  }

  getLogFiles(): Promise<Array<{ name: string; path: string }>> {
    return new Promise((resolve) => {
      IPC.send('app-fork:hermes', 'getLogFiles').then((key: string, res: any) => {
        IPC.off(key)
        resolve(res?.data ?? [])
      })
    })
  }

  getLogs(type: string, lines = 100): Promise<string> {
    return new Promise((resolve) => {
      IPC.send('app-fork:hermes', 'getLogs', type, lines).then((key: string, res: any) => {
        IPC.off(key)
        resolve(res?.data ?? '')
      })
    })
  }

  // ========== Skills Management ==========

  refreshInstalledSkills() {
    this.loading = true
    IPC.send('app-fork:hermes', 'listInstalledSkills').then((key: string, res: any) => {
      IPC.off(key)
      this.loading = false
      if (res?.code === 0) {
        this.installedSkills = res?.data ?? []
      }
    })
  }

  browseAllSkills() {
    this.loading = true
    IPC.send('app-fork:hermes', 'browseSkills', this.skillPage, this.skillPageSize).then(
      (key: string, res: any) => {
        IPC.off(key)
        this.loading = false
        if (res?.code === 0) {
          this.allSkills = res?.data?.list ?? []
          this.skillTotal = res?.data?.total ?? 0
          this.skillTotalPages = res?.data?.totalPages ?? 1
          this.skillPage = res?.data?.currentPage ?? 1
        }
      }
    )
  }

  searchAllSkills(query: string) {
    this.loading = true
    IPC.send('app-fork:hermes', 'searchSkills', query, this.skillPageSize).then(
      (key: string, res: any) => {
        IPC.off(key)
        this.loading = false
        if (res?.code === 0) {
          this.allSkills = (res?.data ?? []).map((item: SearchSkillItem, index: number) => ({
            num: index + 1,
            name: item.name,
            description: item.description,
            source: item.source,
            trust: item.trust
          }))
          this.skillTotal = this.allSkills.length
          this.skillTotalPages = 1
          this.skillPage = 1
        }
      }
    )
  }

  inspectSkill(identifier: string) {
    this.loading = true
    IPC.send('app-fork:hermes', 'inspectSkill', identifier).then((key: string, res: any) => {
      IPC.off(key)
      this.loading = false
      if (res?.code === 0) {
        this.skillInspectContent = res?.data ?? ''
        this.skillInspectVisible = true
      }
    })
  }

  updateSkill(name?: string) {
    this.loading = true
    IPC.send('app-fork:hermes', 'updateSkill', name).then((key: string, res: any) => {
      IPC.off(key)
      this.loading = false
      if (res?.code === 0) {
        MessageSuccess(I18nT('hermes.skillUpdateSuccess'))
        this.refreshInstalledSkills()
      } else {
        MessageError(res?.msg ?? I18nT('hermes.skillUpdateFail'))
      }
    })
  }

  uninstallSkill(name: string) {
    this.loading = true
    IPC.send('app-fork:hermes', 'uninstallSkill', name).then((key: string, res: any) => {
      IPC.off(key)
      this.loading = false
      if (res?.code === 0) {
        MessageSuccess(I18nT('hermes.skillUninstallSuccess'))
        this.refreshInstalledSkills()
      } else {
        MessageError(res?.msg ?? I18nT('hermes.skillUninstallFail'))
      }
    })
  }

  resetSkill(name: string, restore = false) {
    this.loading = true
    IPC.send('app-fork:hermes', 'resetSkill', name, restore).then((key: string, res: any) => {
      IPC.off(key)
      this.loading = false
      if (res?.code === 0) {
        MessageSuccess(I18nT('hermes.skillResetSuccess'))
        this.refreshInstalledSkills()
      } else {
        MessageError(res?.msg ?? I18nT('hermes.skillResetFail'))
      }
    })
  }

  toggleSkillEnabled(name: string, enabled: boolean) {
    const disabled = new Set(this.skillConfig.disabled)
    if (enabled) {
      disabled.delete(name)
    } else {
      disabled.add(name)
    }
    this.skillConfig.disabled = Array.from(disabled)
    IPC.send(
      'app-fork:hermes',
      'setSkillConfig',
      JSON.parse(JSON.stringify(this.skillConfig.disabled))
    ).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        const item = this.installedSkills.find((s) => s.name === name)
        if (item) {
          item.enabled = enabled
        }
        MessageSuccess(
          enabled ? I18nT('hermes.skillEnabledSuccess') : I18nT('hermes.skillDisabledSuccess')
        )
      } else {
        MessageError(res?.msg ?? I18nT('base.fail'))
      }
    })
  }

  openSkillsDir() {
    IPC.send('app-fork:hermes', 'openSkillsDir').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code !== 0) {
        MessageError(res?.msg ?? I18nT('base.fail'))
      }
    })
  }

  openSkillsDocs() {
    shell.openExternal('https://hermes-agent.nousresearch.com/docs/skills').catch()
  }

  fetchSkillConfig() {
    IPC.send('app-fork:hermes', 'getSkillConfig').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.skillConfig = res?.data ?? { disabled: [] }
      }
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

export const HermesSetup = reactiveBind(new Hermes())
