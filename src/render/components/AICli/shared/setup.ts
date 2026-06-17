import IPC from '@/util/IPC'
import { reactiveBind } from '@/util/Index'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { markRaw, nextTick, Ref } from 'vue'
import XTerm from '@/util/XTerm'
import { shell } from '@/util/NodeFn'
import type { AICliProvider, AICliTool, ShellKind } from './types'
import { AI_CLI_TOOLS, findTool } from './tools'
import { PROVIDER_PRESETS, makeProvider } from './providers'

/**
 * #712 AI Code CLI — shared reactive state/controller (singleton).
 * One instance drives the whole panel; the selected tool is swappable.
 */
class AICliStore {
  tools: AICliTool[] = AI_CLI_TOOLS
  currentFlag: string = AI_CLI_TOOLS[0]?.flag ?? 'claudecode'

  // install/version state per tool flag
  installed: Record<string, boolean> = {}
  version: Record<string, string> = {}
  depOk: Record<string, boolean> = {}
  loading = false

  // providers (persisted via main safeStorage)
  providers: AICliProvider[] = []
  providerId = ''
  model = ''
  modelList: string[] = []
  fetchingModels = false

  // run profile
  workDir = ''
  envText = ''
  shell: ShellKind = window.Server.isWindows ? 'powershell' : window.Server.isMacOS ? 'zsh' : 'bash'

  // terminal/task state
  xterm: XTerm | undefined
  running = false
  installing = false
  installEnd = false

  get tool(): AICliTool | undefined {
    return findTool(this.currentFlag)
  }
  get provider(): AICliProvider | undefined {
    return this.providers.find((p) => p.id === this.providerId)
  }
  get presets() {
    return PROVIDER_PRESETS
  }

  constructor() {}

  /** Probe install + dependency state for the current tool. */
  init() {
    const tool = this.tool
    if (!tool) {
      return
    }
    this.loading = true
    const tasks: Promise<any>[] = [this.checkInstalled()]
    if (tool.install.versionCmd && tool.depCmd) {
      tasks.push(this.checkDep())
    }
    Promise.all(tasks).finally(() => {
      this.loading = false
    })
  }

  checkInstalled(): Promise<void> {
    return new Promise((resolve) => {
      const tool = this.tool
      if (!tool) {
        resolve()
        return
      }
      IPC.send('app-fork:aicli', 'checkInstalled', tool.install.versionCmd).then(
        (key: string, res: any) => {
          IPC.off(key)
          if (res?.code === 0) {
            this.installed[this.currentFlag] = res?.data?.installed ?? false
            this.version[this.currentFlag] = res?.data?.version ?? ''
          }
          resolve()
        }
      )
    })
  }

  checkDep(): Promise<void> {
    return new Promise((resolve) => {
      const tool = this.tool
      if (!tool?.depCmd) {
        resolve()
        return
      }
      IPC.send('app-fork:aicli', 'checkDep', tool.depCmd).then((key: string, res: any) => {
        IPC.off(key)
        this.depOk[this.currentFlag] = res?.code === 0 && !!res?.data?.ok
        resolve()
      })
    })
  }

  /** Load persisted providers (apiKeys decrypted in main via safeStorage). */
  loadProviders(): Promise<void> {
    return new Promise((resolve) => {
      IPC.send('AICli:loadProviders').then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0 && Array.isArray(res?.data)) {
          this.providers = res.data
        }
        if (!this.providers.length) {
          // seed with a local Ollama provider for convenience
          const ollama = this.presets.find((p) => p.kind === 'ollama')!
          this.providers = [makeProvider(ollama)]
        }
        if (!this.providerId) {
          this.providerId = this.providers[0]?.id ?? ''
        }
        resolve()
      })
    })
  }

  saveProviders(): Promise<void> {
    return new Promise((resolve) => {
      IPC.send('AICli:saveProviders', JSON.parse(JSON.stringify(this.providers))).then(
        (key: string, res: any) => {
          IPC.off(key)
          if (res?.code !== 0) {
            MessageError(res?.msg ?? 'save failed')
          }
          resolve()
        }
      )
    })
  }

  addProvider(presetKind: string) {
    const preset = this.presets.find((p) => p.kind === presetKind)
    if (!preset) {
      return
    }
    const p = makeProvider(preset)
    this.providers.push(p)
    this.providerId = p.id
  }

  removeProvider(id: string) {
    const idx = this.providers.findIndex((p) => p.id === id)
    if (idx >= 0) {
      this.providers.splice(idx, 1)
      if (this.providerId === id) {
        this.providerId = this.providers[0]?.id ?? ''
      }
      this.saveProviders()
    }
  }

  fetchModels(): Promise<void> {
    return new Promise((resolve) => {
      const p = this.provider
      if (!p) {
        resolve()
        return
      }
      this.fetchingModels = true
      IPC.send('app-fork:aicli', 'fetchModels', {
        baseURL: p.baseURL,
        apiKey: p.apiKey,
        modelsEndpoint: p.modelsEndpoint
      }).then((key: string, res: any) => {
        IPC.off(key)
        this.fetchingModels = false
        if (res?.code === 0 && Array.isArray(res?.data)) {
          this.modelList = res.data
          p.models = res.data
        } else {
          MessageError(res?.msg ?? I18nT('aicli.fetchModelsFail'))
        }
        resolve()
      })
    })
  }

  /** Build the per-platform install command list, with proxy env injected. */
  private platformCommands(list: string[]): string[] {
    const cmds: string[] = []
    const proxy = window.Server.Proxy
    if (proxy) {
      for (const k in proxy) {
        if (window.Server.isWindows) {
          cmds.push(`$env:${k}="${proxy[k]}"`)
        } else {
          cmds.push(`export ${k}="${proxy[k]}"`)
        }
      }
    }
    return cmds.concat(list)
  }

  private platformInstall(): string[] {
    const tool = this.tool
    if (!tool) {
      return []
    }
    if (window.Server.isWindows) {
      return tool.install.Windows ?? []
    }
    if (window.Server.isMacOS) {
      return tool.install.macOS ?? []
    }
    return tool.install.Linux ?? []
  }

  async install(domRef: Ref<HTMLElement>, update = false) {
    const tool = this.tool
    if (!tool || this.installing) {
      return
    }
    this.installEnd = false
    this.installing = true
    await nextTick()
    const xterm = new XTerm()
    this.xterm = markRaw(xterm)
    await xterm.mount(domRef.value)
    let list = this.platformInstall()
    if (update && tool.install.updateCmd) {
      list = [tool.install.updateCmd]
    }
    await xterm.send(this.platformCommands(list), false)
    this.installEnd = true
  }

  /** Parse the "KEY=value" textarea into an env map. */
  private parseEnvText(): Record<string, string> {
    const env: Record<string, string> = {}
    this.envText
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('#'))
      .forEach((line) => {
        const idx = line.indexOf('=')
        if (idx > 0) {
          env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
        }
      })
    return env
  }

  configFileForPlatform(): string | undefined {
    const cf = this.tool?.configFile
    if (!cf) {
      return undefined
    }
    if (window.Server.isWindows) {
      return cf.Windows
    }
    if (window.Server.isMacOS) {
      return cf.macOS
    }
    return cf.Linux
  }

  /** Apply provider → write config (if any) → open terminal with env injected. */
  async applyAndLaunch(domRef: Ref<HTMLElement>) {
    const tool = this.tool
    const provider = this.provider
    if (!tool || !provider || this.installing) {
      return
    }
    const apply = tool.applyProvider(provider, this.model)
    await this.saveProviders()

    // write config patch if the adapter produced one
    const configFile = this.configFileForPlatform()
    if (apply.configPatch && configFile && apply.configFormat === 'json') {
      await new Promise<void>((resolve) => {
        IPC.send('app-fork:aicli', 'applyProvider', {
          configFile,
          format: 'json',
          patch: apply.configPatch
        }).then((key: string) => {
          IPC.off(key)
          resolve()
        })
      })
    }

    // merge adapter env + user env (user wins)
    const env = { ...(apply.env ?? {}), ...this.parseEnvText() }

    this.running = true
    await nextTick()
    const xterm = new XTerm()
    this.xterm = markRaw(xterm)
    await xterm.mount(domRef.value)
    const cmds: string[] = []
    for (const k in env) {
      if (window.Server.isWindows) {
        cmds.push(`$env:${k}="${env[k]}"`)
      } else {
        cmds.push(`export ${k}="${env[k]}"`)
      }
    }
    if (this.workDir) {
      cmds.push(`cd "${this.workDir}"`)
    }
    cmds.push(tool.install.launchCmd)
    // send line-by-line, keep interactive (do not append exit)
    for (const c of cmds) {
      xterm.writeToNodePty(c + (window.Server.isWindows ? '\r' : '\n'))
    }
    MessageSuccess(I18nT('aicli.launched'))
  }

  openConfig() {
    const configFile = this.configFileForPlatform()
    if (!configFile) {
      return
    }
    IPC.send('app-fork:aicli', 'configFilePath', configFile).then((key: string, res: any) => {
      IPC.off(key)
      const p = res?.data
      if (p) {
        shell.openPath(p).catch()
      }
    })
  }

  openDoc() {
    if (this.tool?.docUrl) {
      shell.openExternal(this.tool.docUrl).catch()
    }
  }

  taskConfirm() {
    this.installing = false
    this.running = false
    this.installEnd = false
    this.xterm?.destroy()
    delete this.xterm
    this.init()
  }

  taskCancel() {
    this.installing = false
    this.running = false
    this.installEnd = false
    this.xterm?.stop()?.then(() => {
      this.xterm?.destroy()
      delete this.xterm
    })
  }
}

export const AICliSetup = reactiveBind(new AICliStore())
