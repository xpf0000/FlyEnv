import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { execPromiseWithEnv, readFile, remove, existsSync, readdir, uuid } from '../../Fn'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { ExecCommand } from '@shared/Exec'
import { isWindows } from '@shared/utils'

export interface ClaudeCodeSessionItem {
  id: string
  title: string
  lastPrompt: string
  workDir: string
  updatedAt: string
}

export interface ClaudeCodePluginItem {
  pluginId: string
  name: string
  description: string
  marketplaceName: string
  installCount: number
  installed: boolean
  enabled: boolean
}

export interface ClaudeCodeMarketplaceItem {
  name: string
  source: string
}

export interface ClaudeCodeMcpItem {
  name: string
  type: string
  commandOrUrl: string
  scope: string
}

class ClaudeCode extends Base {
  constructor() {
    super()
    this.type = 'claudeCode'
  }

  private claudeHome() {
    return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
  }

  private claudeBin() {
    return 'claude'
  }

  private runCommand(command: string) {
    return new ForkPromise<string>(async (resolve) => {
      const tmp = join(tmpdir(), `${uuid()}.txt`)
      try {
        await execPromiseWithEnv(`${command} > "${tmp}" 2>&1`)
        const content = await readFile(tmp, 'utf-8')
        resolve(content)
      } catch {
        resolve('')
      } finally {
        if (existsSync(tmp)) {
          await remove(tmp)
        }
      }
    })
  }

  checkInstalled() {
    return new ForkPromise(async (resolve) => {
      const version = await this.runCommand(`${this.claudeBin()} --version`)
      resolve({
        installed: version.trim().length > 0,
        version: version.trim()
      })
    })
  }

  getConfigPath() {
    return new ForkPromise(async (resolve) => {
      const home = this.claudeHome()
      resolve({
        'settings.json': join(home, 'settings.json'),
        'settings.local.json': join(home, 'settings.local.json')
      })
    })
  }

  // ========== Sessions ==========

  listSessions() {
    return new ForkPromise(async (resolve) => {
      const list: ClaudeCodeSessionItem[] = []
      const projectsDir = join(this.claudeHome(), 'projects')
      try {
        if (!existsSync(projectsDir)) {
          resolve(list)
          return
        }
        const projects = await readdir(projectsDir)
        for (const project of projects) {
          const projectPath = join(projectsDir, project)
          let entries: string[] = []
          try {
            entries = await readdir(projectPath)
          } catch {
            continue
          }
          for (const entry of entries) {
            if (!entry.endsWith('.jsonl')) {
              continue
            }
            const sessionId = entry.replace(/\.jsonl$/, '')
            const filePath = join(projectPath, entry)
            const meta = await this.parseSessionFile(filePath)
            list.push({
              id: sessionId,
              title: meta.title || sessionId,
              lastPrompt: meta.lastPrompt,
              workDir: meta.workDir,
              updatedAt: meta.updatedAt
            })
          }
        }
      } catch (e) {
        console.log('claudeCode listSessions error: ', e)
      }
      list.sort((a, b) => {
        if (!a.updatedAt || !b.updatedAt) return 0
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      })
      resolve(list)
    })
  }

  private async parseSessionFile(filePath: string): Promise<{
    title: string
    lastPrompt: string
    workDir: string
    updatedAt: string
  }> {
    const meta = { title: '', lastPrompt: '', workDir: '', updatedAt: '' }
    try {
      const content = await readFile(filePath, 'utf-8')
      const lines = content.split('\n').filter((l) => l.trim().length > 0)
      let firstUserText = ''
      for (const line of lines) {
        let record: any
        try {
          record = JSON.parse(line)
        } catch {
          continue
        }
        if (record?.cwd) {
          meta.workDir = record.cwd
        }
        if (record?.timestamp) {
          meta.updatedAt = record.timestamp
        }
        if (record?.type === 'ai-title' && record?.aiTitle) {
          meta.title = record.aiTitle
        }
        if (record?.type === 'last-prompt' && record?.lastPrompt) {
          meta.lastPrompt = record.lastPrompt
        }
        if (!firstUserText && record?.type === 'user') {
          const msg = record?.message?.content
          if (typeof msg === 'string') {
            firstUserText = msg
          } else if (Array.isArray(msg)) {
            const textPart = msg.find((p: any) => p?.type === 'text')
            if (textPart?.text) {
              firstUserText = textPart.text
            }
          }
        }
      }
      if (!meta.title) {
        meta.title = firstUserText.slice(0, 80)
      }
      if (!meta.lastPrompt) {
        meta.lastPrompt = firstUserText.slice(0, 120)
      }
    } catch (e) {
      console.log('claudeCode parseSessionFile error: ', e)
    }
    return meta
  }

  deleteSession(sessionId: string) {
    return new ForkPromise(async (resolve, reject) => {
      const projectsDir = join(this.claudeHome(), 'projects')
      try {
        if (!existsSync(projectsDir)) {
          resolve(true)
          return
        }
        const projects = await readdir(projectsDir)
        for (const project of projects) {
          const projectPath = join(projectsDir, project)
          const sessionFile = join(projectPath, `${sessionId}.jsonl`)
          const sessionDir = join(projectPath, sessionId)
          if (existsSync(sessionFile)) {
            await remove(sessionFile)
          }
          if (existsSync(sessionDir)) {
            await remove(sessionDir)
          }
        }
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  runInTerminal(workDir: string, sessionId: string) {
    return new ForkPromise(async (resolve, reject) => {
      const claudeCommand = `${this.claudeBin()} --resume ${sessionId}`
      const dir = workDir || homedir()
      const terminalCommand = isWindows()
        ? `cd "${dir}"; ${claudeCommand}`
        : `cd "${dir}" && ${claudeCommand}`
      try {
        await ExecCommand.runInTerminal(terminalCommand)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? e?.toString() ?? 'fail')
      }
    })
  }

  // ========== Plugins ==========

  listPlugins() {
    return new ForkPromise(async (resolve) => {
      try {
        const output = await this.runCommand(`${this.claudeBin()} plugin list --available --json`)
        const jsonStart = output.indexOf('{')
        if (jsonStart < 0) {
          resolve([])
          return
        }
        const data = JSON.parse(output.slice(jsonStart))
        const installedList: any[] = Array.isArray(data?.installed) ? data.installed : []
        const availableList: any[] = Array.isArray(data?.available) ? data.available : []
        // installed[] entries use `id`; available[] entries use `pluginId`.
        const canonId = (p: any): string => p?.pluginId ?? p?.id ?? p?.name ?? ''
        const merged = new Map<string, ClaudeCodePluginItem>()
        // Base metadata from the available catalog (has name/description/installCount).
        availableList.forEach((p) => {
          const pluginId = canonId(p)
          if (!pluginId) {
            return
          }
          merged.set(pluginId, {
            pluginId,
            name: p?.name ?? pluginId.split('@')[0],
            description: p?.description ?? '',
            marketplaceName: p?.marketplaceName ?? pluginId.split('@')[1] ?? '',
            installCount: Number(p?.installCount ?? 0),
            installed: false,
            enabled: false
          })
        })
        // Installed entries carry only `id`/`enabled`; merge onto catalog data,
        // or synthesize an item (deriving name/marketplace from the id) when absent.
        installedList.forEach((p) => {
          const pluginId = canonId(p)
          if (!pluginId) {
            return
          }
          const existing = merged.get(pluginId)
          if (existing) {
            existing.installed = true
            existing.enabled = p?.enabled !== false
          } else {
            const [name, marketplaceName] = pluginId.split('@')
            merged.set(pluginId, {
              pluginId,
              name: name || pluginId,
              description: p?.description ?? '',
              marketplaceName: marketplaceName ?? '',
              installCount: Number(p?.installCount ?? 0),
              installed: true,
              enabled: p?.enabled !== false
            })
          }
        })
        resolve(Array.from(merged.values()))
      } catch (e) {
        console.log('claudeCode listPlugins error: ', e)
        resolve([])
      }
    })
  }

  enablePlugin(pluginId: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await execPromiseWithEnv(`${this.claudeBin()} plugin enable ${pluginId}`)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  disablePlugin(pluginId: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await execPromiseWithEnv(`${this.claudeBin()} plugin disable ${pluginId}`)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  uninstallPlugin(pluginId: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await execPromiseWithEnv(`${this.claudeBin()} plugin uninstall ${pluginId}`)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  listMarketplaces() {
    return new ForkPromise(async (resolve) => {
      const list: ClaudeCodeMarketplaceItem[] = []
      try {
        const file = join(this.claudeHome(), 'plugins', 'known_marketplaces.json')
        if (existsSync(file)) {
          const data = JSON.parse(await readFile(file, 'utf-8'))
          for (const name in data) {
            const src = data[name]?.source
            let source = ''
            if (src?.repo) {
              source = src.repo
            } else if (src?.url) {
              source = src.url
            } else if (src?.source) {
              source = String(src.source)
            }
            list.push({ name, source })
          }
        }
      } catch (e) {
        console.log('claudeCode listMarketplaces error: ', e)
      }
      resolve(list)
    })
  }

  addMarketplace(source: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await execPromiseWithEnv(`${this.claudeBin()} plugin marketplace add "${source}"`)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  removeMarketplace(name: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await execPromiseWithEnv(`${this.claudeBin()} plugin marketplace remove ${name}`)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  // ========== MCP ==========

  listMcp() {
    return new ForkPromise(async (resolve) => {
      const list: ClaudeCodeMcpItem[] = []
      try {
        const file = join(homedir(), '.claude.json')
        if (existsSync(file)) {
          const data = JSON.parse(await readFile(file, 'utf-8'))
          const servers = data?.mcpServers ?? {}
          for (const name in servers) {
            const s = servers[name] ?? {}
            const type = s?.type ?? (s?.url ? 'http' : 'stdio')
            const commandOrUrl =
              s?.url ??
              [s?.command, ...(Array.isArray(s?.args) ? s.args : [])].filter(Boolean).join(' ')
            list.push({ name, type, commandOrUrl, scope: 'user' })
          }
        }
      } catch (e) {
        console.log('claudeCode listMcp error: ', e)
      }
      resolve(list)
    })
  }

  addMcp(name: string, type: string, commandOrUrl: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        let cmd: string
        if (type === 'http' || type === 'sse') {
          cmd = `${this.claudeBin()} mcp add --transport ${type} ${name} "${commandOrUrl}"`
        } else {
          cmd = `${this.claudeBin()} mcp add ${name} -- ${commandOrUrl}`
        }
        await execPromiseWithEnv(cmd)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  removeMcp(name: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await execPromiseWithEnv(`${this.claudeBin()} mcp remove ${name}`)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      resolve([])
    })
  }

  allInstalledVersions() {
    return new ForkPromise(async (resolve) => {
      resolve([])
    })
  }
}

export default new ClaudeCode()
