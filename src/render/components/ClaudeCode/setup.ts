import IPC from '@/util/IPC'
import { reactiveBind } from '@/util/Index'
import { shell, clipboard } from '@/util/NodeFn'
import { markRaw, nextTick, Ref } from 'vue'
import XTerm from '@/util/XTerm'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { buildInstallProxyEnvCommands, type InstallProxyPlatform } from '@shared/installProxyEnv'
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
  lastPrompt: string
  workDir: string
  updatedAt: string
}

export interface SessionGroup {
  workDir: string
  sessions: SessionItem[]
}

export interface PluginItem {
  pluginId: string
  name: string
  description: string
  marketplaceName: string
  installCount: number
  installed: boolean
  enabled: boolean
}

export interface MarketplaceItem {
  name: string
  source: string
}

export interface McpItem {
  name: string
  type: string
  commandOrUrl: string
  scope: string
}

class ClaudeCode {
  xterm: XTerm | undefined
  installing = false
  installEnd = false
  installed = false
  version = ''
  loading = false

  configPaths: Record<string, string> = {}
  sessions: SessionItem[] = []

  plugins: PluginItem[] = []
  pluginsLoading = false
  pluginTab: 'installed' | 'available' = 'installed'
  marketplaces: MarketplaceItem[] = []

  mcpServers: McpItem[] = []
  mcpLoading = false

  commandData: CommandDataType = CommandData as CommandDataType
  currentAction = ''

  confTab = ''

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
      IPC.send('app-fork:claudeCode', 'checkInstalled').then((key: string, res: any) => {
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
      IPC.send('app-fork:claudeCode', 'getConfigPath').then((key: string, res: any) => {
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
    Promise.all([this.checkInstalled(), this.getConfigPath()]).then(() => {
      this.loading = false
    })
  }

  openURL(flag: 'home' | 'docs') {
    if (flag === 'home') {
      shell.openExternal('https://github.com/anthropics/claude-code').catch()
    } else if (flag === 'docs') {
      shell.openExternal('https://docs.claude.com/en/docs/claude-code/overview').catch()
    }
  }

  async installClaudeCode(domRef: Ref<HTMLElement>) {
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
    const installPlatform: InstallProxyPlatform = window.Server.isWindows
      ? 'windows'
      : window.Server.isMacOS
        ? 'macos'
        : 'linux'
    const command = buildInstallProxyEnvCommands(
      installPlatform,
      (window.Server.Proxy ?? {}) as Record<string, string>
    )
    if (window.Server.isWindows) {
      command.push('irm https://claude.ai/install.ps1 | iex')
    } else {
      command.push('curl -fsSL https://claude.ai/install.sh | bash')
    }
    await execXTerm.send(command, false)
    this.installEnd = true
  }

  doAction(item: CommandItem) {
    clipboard.writeText(item.label).then(() => {
      MessageSuccess(I18nT('base.copySuccess'))
    })
  }

  // ========== Sessions ==========

  refreshSessions() {
    IPC.send('app-fork:claudeCode', 'listSessions').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.sessions = res?.data ?? []
      }
    })
  }

  deleteSession(sessionId: string) {
    return new Promise((resolve) => {
      IPC.send('app-fork:claudeCode', 'deleteSession', sessionId).then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          MessageSuccess(I18nT('claudeCode.sessionDeleted'))
          this.refreshSessions()
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        resolve(true)
      })
    })
  }

  resumeSession(sessionId: string, workDir: string) {
    return new Promise((resolve) => {
      IPC.send('app-fork:claudeCode', 'runInTerminal', workDir, sessionId).then(
        (key: string, res: any) => {
          IPC.off(key)
          if (res?.code === 0) {
            MessageSuccess(I18nT('claudeCode.sessionResumed'))
          } else {
            MessageError(res?.msg ?? I18nT('base.fail'))
          }
          resolve(true)
        }
      )
    })
  }

  get sessionGroups(): SessionGroup[] {
    const groupMap: Record<string, SessionItem[]> = {}
    this.sessions.forEach((session) => {
      const dir = session.workDir || 'Unknown'
      if (!groupMap[dir]) {
        groupMap[dir] = []
      }
      groupMap[dir].push(session)
    })
    return Object.entries(groupMap).map(([workDir, sessions]) => ({
      workDir,
      sessions
    }))
  }

  // ========== Plugins ==========

  refreshPlugins() {
    this.pluginsLoading = true
    IPC.send('app-fork:claudeCode', 'listPlugins').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.plugins = res?.data ?? []
      }
      this.pluginsLoading = false
    })
    IPC.send('app-fork:claudeCode', 'listMarketplaces').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.marketplaces = res?.data ?? []
      }
    })
  }

  get installedPlugins(): PluginItem[] {
    return this.plugins.filter((p) => p.installed)
  }

  get availablePlugins(): PluginItem[] {
    return this.plugins.filter((p) => !p.installed)
  }

  async installPlugin(pluginId: string, domRef: Ref<HTMLElement>) {
    if (this.installing) {
      return
    }
    this.currentAction = 'installPlugin'
    this.installEnd = false
    this.installing = true
    await nextTick()

    const execXTerm = new XTerm()
    this.xterm = markRaw(execXTerm)
    await execXTerm.mount(domRef.value)
    const command: string[] = [`claude plugin install ${pluginId}`]
    await execXTerm.send(command, false)
    this.installEnd = true
  }

  enablePlugin(pluginId: string) {
    return new Promise((resolve) => {
      IPC.send('app-fork:claudeCode', 'enablePlugin', pluginId).then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          MessageSuccess(I18nT('claudeCode.pluginEnabled'))
          this.refreshPlugins()
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        resolve(true)
      })
    })
  }

  disablePlugin(pluginId: string) {
    return new Promise((resolve) => {
      IPC.send('app-fork:claudeCode', 'disablePlugin', pluginId).then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          MessageSuccess(I18nT('claudeCode.pluginDisabled'))
          this.refreshPlugins()
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        resolve(true)
      })
    })
  }

  uninstallPlugin(pluginId: string) {
    return new Promise((resolve) => {
      IPC.send('app-fork:claudeCode', 'uninstallPlugin', pluginId).then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          MessageSuccess(I18nT('claudeCode.pluginUninstalled'))
          this.refreshPlugins()
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        resolve(true)
      })
    })
  }

  addMarketplace(source: string) {
    return new Promise((resolve) => {
      IPC.send('app-fork:claudeCode', 'addMarketplace', source).then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          MessageSuccess(I18nT('base.success'))
          this.refreshPlugins()
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        resolve(true)
      })
    })
  }

  removeMarketplace(name: string) {
    return new Promise((resolve) => {
      IPC.send('app-fork:claudeCode', 'removeMarketplace', name).then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          MessageSuccess(I18nT('base.success'))
          this.refreshPlugins()
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        resolve(true)
      })
    })
  }

  // ========== MCP ==========

  refreshMcp() {
    this.mcpLoading = true
    IPC.send('app-fork:claudeCode', 'listMcp').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.mcpServers = res?.data ?? []
      }
      this.mcpLoading = false
    })
  }

  addMcp(name: string, type: string, commandOrUrl: string) {
    return new Promise((resolve) => {
      IPC.send('app-fork:claudeCode', 'addMcp', name, type, commandOrUrl).then(
        (key: string, res: any) => {
          IPC.off(key)
          if (res?.code === 0) {
            MessageSuccess(I18nT('base.success'))
            this.refreshMcp()
          } else {
            MessageError(res?.msg ?? I18nT('base.fail'))
          }
          resolve(res?.code === 0)
        }
      )
    })
  }

  removeMcp(name: string) {
    return new Promise((resolve) => {
      IPC.send('app-fork:claudeCode', 'removeMcp', name).then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          MessageSuccess(I18nT('base.success'))
          this.refreshMcp()
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
    if (this.currentAction === 'installPlugin') {
      this.pluginTab = 'installed'
      this.refreshPlugins()
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

export const ClaudeCodeSetup = reactiveBind(new ClaudeCode())
