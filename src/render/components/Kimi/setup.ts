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

export interface McpItem {
  name: string
  type: string
  commandOrUrl: string
  scope: string
}

class Kimi {
  xterm: XTerm | undefined
  installing = false
  installEnd = false
  installed = false
  version = ''
  loading = false
  deletingSessions = false
  openingSessionDirs = new Set<string>()

  configPaths: Record<string, string> = {}
  sessions: SessionItem[] = []
  mcpServers: McpItem[] = []
  mcpLoading = false

  commandData: CommandDataType = CommandData as CommandDataType
  currentAction = ''

  confTab = ''
  logTab = ''

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
    Promise.all([this.checkInstalled(), this.getConfigPath()]).then(() => {
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
      command.push('irm https://code.kimi.com/kimi-code/install.ps1 | iex')
    } else {
      command.push('curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash')
    }
    await execXTerm.send(command, false)
    this.installEnd = true
  }

  doAction(item: CommandItem) {
    clipboard.writeText(item.label).then(() => {
      MessageSuccess(I18nT('base.copySuccess'))
    })
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
          MessageSuccess(I18nT('common.session.deleted'))
          this.refreshSessions()
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        resolve(true)
      })
    })
  }

  deleteSessions(sessionIds: string[]): Promise<string[]> {
    const ids = [...new Set(sessionIds)]
    if (!ids.length || this.deletingSessions) {
      return Promise.resolve([])
    }

    this.deletingSessions = true
    return new Promise((resolve) => {
      IPC.send('app-fork:kimi', 'deleteSessions', ids).then((key: string, res: any) => {
        IPC.off(key)
        this.deletingSessions = false
        if (res?.code !== 0) {
          MessageError(res?.msg ?? I18nT('base.fail'))
          resolve([])
          return
        }

        const deletedIds = Array.isArray(res?.data?.deletedIds) ? res.data.deletedIds : []
        const failedIds = Array.isArray(res?.data?.failedIds) ? res.data.failedIds : []
        if (deletedIds.length) {
          MessageSuccess(I18nT('common.session.deleted'))
          this.refreshSessions()
        }
        if (failedIds.length) {
          MessageError(I18nT('base.fail'))
        }
        resolve(deletedIds)
      })
    })
  }

  startSessionInTerminal(workDir: string): Promise<boolean> {
    if (this.openingSessionDirs.has(workDir)) {
      return Promise.resolve(false)
    }

    this.openingSessionDirs.add(workDir)
    return new Promise((resolve) => {
      IPC.send('app-fork:kimi', 'runInTerminal', workDir).then((key: string, res: any) => {
        IPC.off(key)
        this.openingSessionDirs.delete(workDir)
        if (res?.code === 0) {
          MessageSuccess(I18nT('host.runInTerminal'))
          resolve(true)
          return
        }
        MessageError(res?.msg ?? I18nT('base.fail'))
        resolve(false)
      })
    })
  }

  isStartingSessionInTerminal(workDir: string) {
    return this.openingSessionDirs.has(workDir)
  }

  refreshMcp() {
    this.mcpLoading = true
    IPC.send('app-fork:kimi', 'listMcp').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.mcpServers = res?.data ?? []
      }
      this.mcpLoading = false
    })
  }

  addMcp(name: string, type: string, commandOrUrl: string, token = '') {
    return new Promise((resolve) => {
      IPC.send('app-fork:kimi', 'addMcp', name, type, commandOrUrl, token).then(
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
      IPC.send('app-fork:kimi', 'removeMcp', name).then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          MessageSuccess(I18nT('base.success'))
          this.refreshMcp()
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        resolve(res?.code === 0)
      })
    })
  }

  resumeSession(sessionId: string, workDir: string) {
    return new Promise((resolve) => {
      IPC.send('app-fork:kimi', 'runInTerminal', workDir, sessionId).then(
        (key: string, res: any) => {
          IPC.off(key)
          if (res?.code === 0) {
            MessageSuccess(I18nT('common.session.resumed'))
          } else {
            MessageError(res?.msg ?? I18nT('base.fail'))
          }
          resolve(true)
        }
      )
    })
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
