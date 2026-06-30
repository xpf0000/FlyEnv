import IPC from '@/util/IPC'
import { AsyncComponentShow } from '@/util/AsyncComponent'
import { reactiveBind } from '@/util/Index'
import { shell, clipboard } from '@/util/NodeFn'
import { markRaw, nextTick, Ref } from 'vue'
import XTerm from '@/util/XTerm'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { getAntigravitySkillDir, type AntigravitySkillLike } from '@shared/antigravitySkills'
import { getAntigravityInstallCommandLines, resolveAntigravityInstallPlatform } from './install'
import CommandData from './command.json'

let SkillViewVM: any

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

export interface SkillItem extends AntigravitySkillLike {
  description: string
  enabled: boolean
}

class Antigravity {
  xterm: XTerm | undefined
  installing = false
  installEnd = false
  installed = false
  version = ''
  loading = false

  configPaths: Record<string, string> = {}
  sessions: SessionItem[] = []

  mcpServers: McpItem[] = []
  mcpLoading = false

  skills: SkillItem[] = []
  skillsLoading = false
  skillViewTab: 'code' | 'both' | 'preview' = 'both'

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
      IPC.send('app-fork:antigravity', 'checkInstalled').then((key: string, res: any) => {
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
      IPC.send('app-fork:antigravity', 'getConfigPath').then((key: string, res: any) => {
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
      shell.openExternal('https://antigravity.google/product/antigravity-cli').catch()
    } else if (flag === 'docs') {
      shell.openExternal('https://antigravity.google/docs/cli-using').catch()
    }
  }

  async installAntigravity(domRef: Ref<HTMLElement>) {
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
    const installPlatform = resolveAntigravityInstallPlatform(
      window.Server.isWindows ? 'win32' : window.Server.isMacOS ? 'darwin' : 'linux'
    )
    const command = getAntigravityInstallCommandLines(
      installPlatform,
      (window.Server.Proxy ?? {}) as Record<string, string>
    )
    console.log('command: ', command)
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
    IPC.send('app-fork:antigravity', 'listSessions').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.sessions = res?.data ?? []
      }
    })
  }

  deleteSession(sessionId: string) {
    return new Promise((resolve) => {
      IPC.send('app-fork:antigravity', 'deleteSession', sessionId).then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          MessageSuccess(I18nT('antigravity.sessionDeleted'))
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
      IPC.send('app-fork:antigravity', 'runInTerminal', workDir, sessionId).then(
        (key: string, res: any) => {
          IPC.off(key)
          if (res?.code === 0) {
            MessageSuccess(I18nT('antigravity.sessionResumed'))
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

  // ========== MCP ==========

  refreshMcp() {
    this.mcpLoading = true
    IPC.send('app-fork:antigravity', 'listMcp').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.mcpServers = res?.data ?? []
      }
      this.mcpLoading = false
    })
  }

  addMcp(name: string, type: string, commandOrUrl: string, token = '') {
    return new Promise((resolve) => {
      IPC.send('app-fork:antigravity', 'addMcp', name, type, commandOrUrl, token).then(
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
      IPC.send('app-fork:antigravity', 'removeMcp', name).then((key: string, res: any) => {
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

  // ========== Skills ==========

  refreshSkills() {
    this.skillsLoading = true
    IPC.send('app-fork:antigravity', 'listSkills').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.skills = res?.data ?? []
      }
      this.skillsLoading = false
    })
  }

  openSkillsDir() {
    IPC.send('app-fork:antigravity', 'openSkillsDir').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0 && res?.data) {
        shell.openPath(res.data).catch()
      } else {
        MessageError(res?.msg ?? I18nT('base.fail'))
      }
    })
  }

  openSkillDir(item: SkillItem) {
    shell.openPath(getAntigravitySkillDir(item.path)).catch()
  }

  revealSkillFile(item: SkillItem) {
    shell.showItemInFolder(item.path).catch()
  }

  viewSkill(item: SkillItem) {
    const showDrawer = () => {
      AsyncComponentShow(SkillViewVM, { skill: item }).then()
    }

    if (!SkillViewVM) {
      import('./SkillView.vue').then((res) => {
        SkillViewVM = res.default
        showDrawer()
      })
      return
    }

    showDrawer()
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

export const AntigravitySetup = reactiveBind(new Antigravity())
