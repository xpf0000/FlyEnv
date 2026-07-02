import IPC from '@/util/IPC'
import { reactiveBind } from '@/util/Index'
import { shell } from '@/util/NodeFn'
import { AsyncComponentShow } from '@/util/AsyncComponent'
import { markRaw, nextTick, Ref } from 'vue'
import XTerm from '@/util/XTerm'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { getHermesInstallCommandLines, resolveHermesInstallPlatform } from './install'
import CommandData from './command.json'

let SkillInspectVM: any

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
  lastActive: string
  src: string
  id: string
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

export type OnlineSkillSource =
  | 'all'
  | 'official'
  | 'skills-sh'
  | 'well-known'
  | 'github'
  | 'clawhub'
  | 'lobehub'

export type SkillTab = 'installed' | OnlineSkillSource

export interface OnlineSkillState {
  skills: BrowseSkillItem[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  loading: boolean
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

  loading: boolean = false

  installedSkillLoading: boolean = false

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
  skillTab: SkillTab = 'installed'
  installedSkills: InstalledSkillItem[] = []
  onlineSkill: Record<OnlineSkillSource, OnlineSkillState> = {
    all: { skills: [], page: 1, pageSize: 20, total: 0, totalPages: 1, loading: false },
    official: { skills: [], page: 1, pageSize: 20, total: 0, totalPages: 1, loading: false },
    'skills-sh': { skills: [], page: 1, pageSize: 20, total: 0, totalPages: 1, loading: false },
    'well-known': { skills: [], page: 1, pageSize: 20, total: 0, totalPages: 1, loading: false },
    github: { skills: [], page: 1, pageSize: 20, total: 0, totalPages: 1, loading: false },
    clawhub: { skills: [], page: 1, pageSize: 20, total: 0, totalPages: 1, loading: false },
    lobehub: { skills: [], page: 1, pageSize: 20, total: 0, totalPages: 1, loading: false }
  }
  skillSearch = ''
  skillInspectCache: Record<string, string> = {}
  skillConfig: { disabled: string[] } = { disabled: [] }

  skillViewTab: 'code' | 'both' | 'preview' = 'both'

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
          MessageSuccess(I18nT('common.gateway.running'))
        } else {
          this.gatewayRunning = false
          MessageError(res?.msg ?? I18nT('common.gateway.startFailed'))
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
    const command = getHermesInstallCommandLines(
      resolveHermesInstallPlatform(
        window.Server.isWindows ? 'win32' : window.Server.isMacOS ? 'darwin' : 'linux'
      ),
      (window.Server.Proxy ?? {}) as Record<string, string>
    )
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

  async installSkill(name: string, domRef: Ref<HTMLElement>) {
    if (this.installing) {
      return
    }
    this.currentAction = 'installSkill'
    this.installEnd = false
    this.installing = true
    await nextTick()

    const execXTerm = new XTerm()
    this.xterm = markRaw(execXTerm)
    await execXTerm.mount(domRef.value)
    const command: string[] = [`hermes skills install ${name}`]
    await execXTerm.send(command, false)
    this.installEnd = true
  }

  refreshSessions() {
    IPC.send('app-fork:hermes', 'listSessions').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.sessions = res?.data ?? []
      }
    })
  }

  async deleteSession(id: string, domRef: Ref<HTMLElement>) {
    if (this.installing) {
      return
    }
    this.currentAction = 'deleteSession'
    this.installEnd = false
    this.installing = true
    await nextTick()

    const execXTerm = new XTerm()
    this.xterm = markRaw(execXTerm)
    await execXTerm.mount(domRef.value)
    const command: string[] = [`hermes sessions delete "${id}"`]
    await execXTerm.send(command, false)
    this.installEnd = true
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
    if (this.installedSkillLoading) {
      return
    }
    this.installedSkillLoading = true
    this.loading = true
    IPC.send('app-fork:hermes', 'listInstalledSkills').then((key: string, res: any) => {
      IPC.off(key)
      this.installedSkillLoading = false
      this.loading = false
      if (res?.code === 0) {
        this.installedSkills = res?.data ?? []
      }
    })
  }

  browseAllSkills() {
    const source = this.skillTab === 'installed' ? 'all' : this.skillTab
    const state = this.onlineSkill[source]
    if (state.loading) {
      return
    }
    this.loading = true
    state.loading = true
    IPC.send('app-fork:hermes', 'browseSkills', state.page, state.pageSize, source).then(
      (key: string, res: any) => {
        IPC.off(key)
        this.loading = false
        state.loading = false
        if (res?.code === 0) {
          state.skills = res?.data?.list ?? []
          state.total = res?.data?.total ?? 0
          state.totalPages = res?.data?.totalPages ?? 1
          state.page = res?.data?.currentPage ?? 1
        }
      }
    )
  }

  searchAllSkills(query: string) {
    const source = this.skillTab === 'installed' ? 'all' : this.skillTab
    const state = this.onlineSkill[source]
    this.loading = true
    IPC.send('app-fork:hermes', 'searchSkills', query, state.pageSize).then(
      (key: string, res: any) => {
        IPC.off(key)
        this.loading = false
        if (res?.code === 0) {
          state.skills = (res?.data ?? []).map((item: SearchSkillItem, index: number) => ({
            num: index + 1,
            name: item.name,
            description: item.description,
            source: item.source,
            trust: item.trust
          }))
          state.total = state.skills.length
          state.totalPages = 1
          state.page = 1
        }
      }
    )
  }

  inspectSkill(identifier: string) {
    const showInspect = (content: string) => {
      if (!SkillInspectVM) {
        import('./SkillInspect.vue').then((res) => {
          SkillInspectVM = res.default
          AsyncComponentShow(SkillInspectVM, { content }).then()
        })
      } else {
        AsyncComponentShow(SkillInspectVM, { content }).then()
      }
    }

    const cached = this.skillInspectCache[identifier]
    if (cached !== undefined) {
      showInspect(cached)
      return
    }

    this.loading = true
    IPC.send('app-fork:hermes', 'inspectSkill', identifier).then((key: string, res: any) => {
      IPC.off(key)
      this.loading = false
      if (res?.code === 0) {
        const data = res?.data ?? ''
        this.skillInspectCache[identifier] = data
        showInspect(data)
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
      if (res?.code === 0) {
        const dir = res?.data
        if (dir) {
          shell.openPath(dir).catch()
        }
      } else {
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
    if (this.currentAction === 'installSkill') {
      this.refreshInstalledSkills()
    }
    if (this.currentAction === 'deleteSession') {
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

export const HermesSetup = reactiveBind(new Hermes())
