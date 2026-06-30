import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import {
  execPromiseWithEnv,
  readFile,
  writeFile,
  remove,
  existsSync,
  readdir,
  mkdirp,
  uuid
} from '../../Fn'
import { tmpdir, homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseToml, stringifyToml } from '@shared/toml'
import { ExecCommand } from '@shared/Exec'
import { isWindows } from '@shared/utils'
import type { SoftInstalled } from '@shared/app'
import { joinMcpCommand, optionalBearerHeaders } from '@shared/aiCliMcp'

export interface CodexSessionItem {
  id: string
  title: string
  lastPrompt: string
  workDir: string
  updatedAt: string
}

export interface CodexPluginItem {
  pluginId: string
  name: string
  description: string
  marketplaceName: string
  installCount: number
  installed: boolean
  enabled: boolean
}

export interface CodexMcpItem {
  name: string
  type: string
  commandOrUrl: string
  scope: string
}

class Codex extends Base {
  constructor() {
    super()
    this.type = 'codex'
  }

  private codexHome() {
    return process.env.CODEX_HOME || join(homedir(), '.codex')
  }

  private codexBin() {
    return 'codex'
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
      const version = await this.runCommand(`${this.codexBin()} --version`)
      resolve({
        installed: version.trim().length > 0,
        version: version.trim()
      })
    })
  }

  getConfigPath() {
    return new ForkPromise(async (resolve) => {
      const home = this.codexHome()
      resolve({
        'config.toml': join(home, 'config.toml'),
        'auth.json': join(home, 'auth.json')
      })
    })
  }

  // ========== Sessions ==========

  private async collectSessionFiles(dir: string, out: string[]) {
    let entries: string[] = []
    try {
      entries = await readdir(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry)
      if (entry.endsWith('.jsonl')) {
        out.push(full)
      } else if (!entry.includes('.')) {
        // date-segment directory (YYYY/MM/DD); recurse
        await this.collectSessionFiles(full, out)
      }
    }
  }

  listSessions() {
    return new ForkPromise(async (resolve) => {
      const list: CodexSessionItem[] = []
      const sessionsDir = join(this.codexHome(), 'sessions')
      try {
        if (!existsSync(sessionsDir)) {
          resolve(list)
          return
        }
        const files: string[] = []
        await this.collectSessionFiles(sessionsDir, files)
        for (const filePath of files) {
          const meta = await this.parseSessionFile(filePath)
          if (!meta.id) {
            continue
          }
          list.push({
            id: meta.id,
            title: meta.title || meta.id,
            lastPrompt: meta.lastPrompt,
            workDir: meta.workDir,
            updatedAt: meta.updatedAt
          })
        }
      } catch (e) {
        console.log('codex listSessions error: ', e)
      }
      list.sort((a, b) => {
        if (!a.updatedAt || !b.updatedAt) return 0
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      })
      resolve(list)
    })
  }

  private isInjectedUserText(text: string): boolean {
    const t = text.trimStart()
    return (
      t.startsWith('#') ||
      t.startsWith('<') ||
      t.startsWith('AGENTS.md') ||
      t.includes('<environment_context>') ||
      t.includes('<permissions instructions>')
    )
  }

  private async parseSessionFile(filePath: string): Promise<{
    id: string
    title: string
    lastPrompt: string
    workDir: string
    updatedAt: string
  }> {
    const meta = { id: '', title: '', lastPrompt: '', workDir: '', updatedAt: '' }
    try {
      const content = await readFile(filePath, 'utf-8')
      const lines = content.split('\n').filter((l) => l.trim().length > 0)
      const userTexts: string[] = []
      for (const line of lines) {
        let record: any
        try {
          record = JSON.parse(line)
        } catch {
          continue
        }
        if (record?.timestamp) {
          meta.updatedAt = record.timestamp
        }
        if (record?.type === 'session_meta') {
          const p = record?.payload ?? {}
          if (p?.id) {
            meta.id = p.id
          }
          if (p?.cwd) {
            meta.workDir = p.cwd
          }
        }
        if (record?.type === 'response_item') {
          const p = record?.payload ?? {}
          if (p?.type === 'message' && p?.role === 'user' && Array.isArray(p?.content)) {
            for (const c of p.content) {
              if ((c?.type === 'input_text' || c?.type === 'text') && c?.text) {
                if (!this.isInjectedUserText(c.text)) {
                  userTexts.push(c.text)
                }
              }
            }
          }
        }
      }
      if (userTexts.length > 0) {
        meta.title = userTexts[0].slice(0, 80)
        meta.lastPrompt = userTexts[userTexts.length - 1].slice(0, 120)
      }
    } catch (e) {
      console.log('codex parseSessionFile error: ', e)
    }
    return meta
  }

  deleteSession(sessionId: string) {
    return new ForkPromise(async (resolve, reject) => {
      const sessionsDir = join(this.codexHome(), 'sessions')
      try {
        if (!existsSync(sessionsDir)) {
          resolve(true)
          return
        }
        const files: string[] = []
        await this.collectSessionFiles(sessionsDir, files)
        for (const filePath of files) {
          if (filePath.includes(sessionId)) {
            await remove(filePath)
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
      const codexCommand = `${this.codexBin()} resume ${sessionId}`
      const dir = workDir || homedir()
      const terminalCommand = isWindows()
        ? `cd "${dir}"; ${codexCommand}`
        : `cd "${dir}" && ${codexCommand}`
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
        const output = await this.runCommand(`${this.codexBin()} plugin list --available --json`)
        const jsonStart = output.search(/[[{]/)
        if (jsonStart < 0) {
          resolve([])
          return
        }
        const data = JSON.parse(output.slice(jsonStart))
        // `--available --json` returns a flat array; each item self-reports `installed`.
        const arr: any[] = Array.isArray(data)
          ? data
          : [...(data?.installed ?? []), ...(data?.available ?? [])]
        const merged = new Map<string, CodexPluginItem>()
        arr.forEach((p) => {
          const pluginId = p?.pluginId ?? p?.id ?? p?.name ?? ''
          if (!pluginId) {
            return
          }
          const existing = merged.get(pluginId)
          const item: CodexPluginItem = {
            pluginId,
            name: p?.name ?? pluginId.split('@')[0],
            description: p?.description ?? '',
            marketplaceName: p?.marketplaceName ?? pluginId.split('@')[1] ?? '',
            installCount: Number(p?.installCount ?? 0),
            installed: p?.installed === true,
            enabled: p?.enabled === true
          }
          if (!existing || item.installed) {
            merged.set(pluginId, item)
          }
        })
        resolve(Array.from(merged.values()))
      } catch (e) {
        console.log('codex listPlugins error: ', e)
        resolve([])
      }
    })
  }

  enablePlugin(pluginId: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await execPromiseWithEnv(`${this.codexBin()} plugin add ${pluginId}`)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  disablePlugin(pluginId: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await execPromiseWithEnv(`${this.codexBin()} plugin remove ${pluginId}`)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  uninstallPlugin(pluginId: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await execPromiseWithEnv(`${this.codexBin()} plugin remove ${pluginId}`)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  // ========== MCP ==========

  listMcp() {
    return new ForkPromise(async (resolve) => {
      const list: CodexMcpItem[] = []
      try {
        const output = await this.runCommand(`${this.codexBin()} mcp list --json`)
        const jsonStart = output.search(/[[{]/)
        if (jsonStart < 0) {
          resolve(list)
          return
        }
        const data = JSON.parse(output.slice(jsonStart))
        const servers: any[] = Array.isArray(data)
          ? data
          : Object.entries(data ?? {}).map(([name, v]: any) => ({ name, ...v }))
        servers.forEach((s) => {
          const transport = s?.transport ?? {}
          const type = transport?.type ?? s?.type ?? (transport?.url || s?.url ? 'http' : 'stdio')
          const commandOrUrl =
            transport?.url ??
            s?.url ??
            joinMcpCommand(s?.command, Array.isArray(s?.args) ? s.args : [])
          list.push({
            name: s?.name ?? '',
            type,
            commandOrUrl,
            scope: 'user'
          })
        })
      } catch (e) {
        console.log('codex listMcp error: ', e)
      }
      resolve(list)
    })
  }

  addMcp(name: string, type: string, commandOrUrl: string, token?: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        if (type === 'http' || type === 'sse') {
          const file = join(this.codexHome(), 'config.toml')
          let data: any = {}
          if (existsSync(file)) {
            data = parseToml(await readFile(file, 'utf-8'))
          }
          const httpHeaders = optionalBearerHeaders(token)
          data.features = data.features ?? {}
          data.features.rmcp_client = true
          data.mcp_servers = data.mcp_servers ?? {}
          data.mcp_servers[name] = {
            url: commandOrUrl
          }
          if (httpHeaders) {
            data.mcp_servers[name].http_headers = httpHeaders
          }
          await mkdirp(dirname(file))
          await writeFile(file, stringifyToml(data))
          resolve(true)
          return
        }
        const cmd = `${this.codexBin()} mcp add ${name} -- ${commandOrUrl}`
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
        await execPromiseWithEnv(`${this.codexBin()} mcp remove ${name}`)
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

  getConfigFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    const home = this.codexHome()
    return [
      { name: 'config.toml', path: join(home, 'config.toml') },
      { name: 'auth.json', path: join(home, 'auth.json') }
    ]
  }

  getLogFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    return []
  }
}

export default new Codex()
