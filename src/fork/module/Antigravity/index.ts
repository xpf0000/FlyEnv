import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, remove, existsSync, readdir, mkdirp, stat } from '../../Fn'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { ExecCommand } from '@shared/Exec'
import { isWindows } from '@shared/utils'
import type { SoftInstalled } from '@shared/app'
import { joinMcpCommand, optionalBearerHeaders } from '@shared/aiCliMcp'
import { checkAiCliVersion, resolveAiCliTerminalCommand } from '../../util/AiCli'

const require = createRequire(import.meta.url)

export interface AntigravitySessionItem {
  id: string
  title: string
  lastPrompt: string
  workDir: string
  updatedAt: string
}

export interface AntigravityMcpItem {
  name: string
  type: string
  commandOrUrl: string
  scope: string
}

export interface AntigravitySkillItem {
  name: string
  description: string
  path: string
  builtin: boolean
  enabled: boolean
}

class Antigravity extends Base {
  constructor() {
    super()
    this.type = 'antigravity'
  }

  /**
   * The agy CLI shares the Gemini CLI config root (`~/.gemini`).
   * - CLI data (settings, conversations, skills) lives under `~/.gemini/antigravity-cli`.
   * - MCP servers are configured in `~/.gemini/config/mcp_config.json`.
   */
  private geminiHome() {
    return process.env.GEMINI_HOME || join(homedir(), '.gemini')
  }

  private antigravityHome() {
    return join(this.geminiHome(), 'antigravity-cli')
  }

  private settingsFile() {
    return join(this.antigravityHome(), 'settings.json')
  }

  private mcpConfigFile() {
    return join(this.geminiHome(), 'config', 'mcp_config.json')
  }

  checkInstalled() {
    return new ForkPromise(async (resolve) => {
      const version = await checkAiCliVersion('agy')
      resolve({
        installed: version.trim().length > 0,
        version: version.trim()
      })
    })
  }

  getConfigPath() {
    return new ForkPromise(async (resolve) => {
      resolve({
        'settings.json': this.settingsFile(),
        'mcp_config.json': this.mcpConfigFile()
      })
    })
  }

  // ========== Sessions (conversations) ==========
  //
  // Each conversation is a SQLite database (`<conversation-id>.db`) under
  // `~/.gemini/antigravity-cli/conversations`. The conversation id (used by
  // `agy --conversation <id>`) is `trajectory_meta.cascade_id`, which also matches the
  // file name. The workspace path is encoded in the `trajectory_metadata_blob` BLOB;
  // step payloads are binary protobuf, so the prompt text is not cleanly extractable —
  // we surface id + workDir + modified time and leave title/lastPrompt best-effort.

  private async listSessionDbFiles(dir: string): Promise<string[]> {
    const out: string[] = []
    let entries: string[] = []
    try {
      entries = await readdir(dir)
    } catch {
      return out
    }
    for (const entry of entries) {
      if (entry.endsWith('.db')) {
        out.push(join(dir, entry))
      }
    }
    return out
  }

  private parseSessionDb(filePath: string): {
    id: string
    workDir: string
  } {
    const meta = { id: '', workDir: '' }
    try {
      // Node >= 22 ships a built-in synchronous SQLite client (Electron 39 bundles it).
      const { DatabaseSync } = require('node:sqlite')
      const db = new DatabaseSync(filePath, { readOnly: true })
      try {
        const traj: any = db.prepare('SELECT cascade_id FROM trajectory_meta LIMIT 1').get()
        if (traj?.cascade_id) {
          meta.id = String(traj.cascade_id)
        }
        const blobRow: any = db
          .prepare("SELECT data FROM trajectory_metadata_blob WHERE id = 'main' LIMIT 1")
          .get()
        if (blobRow?.data) {
          const buf = Buffer.from(blobRow.data)
          // The workspace path is stored as a `file:///...` URI inside the blob.
          const match = buf.toString('latin1').match(/file:\/\/\/([^\s\x00-\x1f"z]+)/)
          if (match) {
            let p = decodeURIComponent(match[1])
            // Normalize `/C:/Users/...` -> `C:/Users/...` on Windows.
            if (/^\/[a-zA-Z]:\//.test(p)) {
              p = p.slice(1)
            }
            meta.workDir = p
          }
        }
      } finally {
        db.close()
      }
    } catch (e) {
      console.log('antigravity parseSessionDb error: ', e)
    }
    if (!meta.id) {
      const fileName = filePath.split(/[\\/]/).pop() ?? ''
      meta.id = fileName.replace(/\.db$/, '')
    }
    return meta
  }

  listSessions() {
    return new ForkPromise(async (resolve) => {
      const list: AntigravitySessionItem[] = []
      const sessionsDir = join(this.antigravityHome(), 'conversations')
      try {
        if (!existsSync(sessionsDir)) {
          resolve(list)
          return
        }
        const files = await this.listSessionDbFiles(sessionsDir)
        for (const filePath of files) {
          const meta = this.parseSessionDb(filePath)
          if (!meta.id) {
            continue
          }
          let updatedAt = ''
          try {
            const st = await stat(filePath)
            updatedAt = new Date(st.mtimeMs).toISOString()
          } catch {
            updatedAt = ''
          }
          list.push({
            id: meta.id,
            title: meta.id,
            lastPrompt: '',
            workDir: meta.workDir,
            updatedAt
          })
        }
      } catch (e) {
        console.log('antigravity listSessions error: ', e)
      }
      list.sort((a, b) => {
        if (!a.updatedAt || !b.updatedAt) return 0
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      })
      resolve(list)
    })
  }

  deleteSession(sessionId: string) {
    return new ForkPromise(async (resolve, reject) => {
      const sessionsDir = join(this.antigravityHome(), 'conversations')
      try {
        if (!existsSync(sessionsDir)) {
          resolve(true)
          return
        }
        const files = await this.listSessionDbFiles(sessionsDir)
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
      const agyCommand = sessionId
        ? `${resolveAiCliTerminalCommand('agy')} --conversation ${sessionId}`
        : resolveAiCliTerminalCommand('agy')
      const dir = workDir || homedir()
      const terminalCommand = isWindows()
        ? `cd "${dir}"; ${agyCommand}`
        : `cd "${dir}" && ${agyCommand}`
      try {
        await ExecCommand.runInTerminal(terminalCommand)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? e?.toString() ?? 'fail')
      }
    })
  }

  // ========== MCP (~/.gemini/config/mcp_config.json) ==========

  listMcp() {
    return new ForkPromise(async (resolve) => {
      const list: AntigravityMcpItem[] = []
      try {
        const file = this.mcpConfigFile()
        if (!existsSync(file)) {
          resolve(list)
          return
        }
        const raw = await readFile(file, 'utf-8')
        if (!raw.trim()) {
          resolve(list)
          return
        }
        const data = JSON.parse(raw)
        const servers = data?.mcpServers ?? data ?? {}
        Object.entries(servers).forEach(([name, v]: any) => {
          const s = v ?? {}
          const remoteUrl = s?.serverUrl ?? s?.url ?? s?.httpUrl ?? ''
          const type = s?.type ?? (remoteUrl ? 'http' : 'stdio')
          const commandOrUrl = remoteUrl || joinMcpCommand(s?.command, s?.args)
          list.push({
            name,
            type,
            commandOrUrl,
            scope: 'shared'
          })
        })
      } catch (e) {
        console.log('antigravity listMcp error: ', e)
      }
      resolve(list)
    })
  }

  addMcp(name: string, type: string, commandOrUrl: string, token?: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const file = this.mcpConfigFile()
        let data: any = {}
        if (existsSync(file)) {
          const raw = await readFile(file, 'utf-8')
          if (raw.trim()) {
            try {
              data = JSON.parse(raw)
            } catch {
              data = {}
            }
          }
        }
        data.mcpServers = data.mcpServers ?? {}
        if (type === 'http' || type === 'sse') {
          const headers = optionalBearerHeaders(token)
          data.mcpServers[name] = {
            serverUrl: commandOrUrl
          }
          if (headers) {
            data.mcpServers[name].headers = headers
          }
        } else {
          const parts = commandOrUrl.split(' ').filter(Boolean)
          data.mcpServers[name] = {
            command: parts.shift() ?? '',
            args: parts
          }
        }
        await mkdirp(join(this.geminiHome(), 'config'))
        await writeFile(file, JSON.stringify(data, null, 2))
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  removeMcp(name: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const file = this.mcpConfigFile()
        if (existsSync(file)) {
          const raw = await readFile(file, 'utf-8')
          let data: any = {}
          if (raw.trim()) {
            try {
              data = JSON.parse(raw)
            } catch {
              data = {}
            }
          }
          if (data?.mcpServers?.[name]) {
            delete data.mcpServers[name]
            await writeFile(file, JSON.stringify(data, null, 2))
          }
        }
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  // ========== Skills ==========

  private async collectSkills(skillsDir: string, builtin: boolean, list: AntigravitySkillItem[]) {
    let entries: string[] = []
    try {
      entries = await readdir(skillsDir)
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(skillsDir, entry)
      const skillFile = join(full, 'SKILL.md')
      let name = entry
      let description = ''
      let skillPath = full
      if (existsSync(skillFile)) {
        // Directory-based skill: metadata in SKILL.md frontmatter.
        skillPath = skillFile
        try {
          const content = await readFile(skillFile, 'utf-8')
          const nameMatch = content.match(/name:\s*(.+)/i)
          const descMatch = content.match(/description:\s*(.+)/i)
          if (nameMatch) {
            name = nameMatch[1].trim().replace(/^['"]|['"]$/g, '')
          }
          if (descMatch) {
            description = descMatch[1].trim().replace(/^['"]|['"]$/g, '')
          }
        } catch {
          description = ''
        }
      } else if (entry.endsWith('.md')) {
        name = entry.replace(/\.md$/, '')
        try {
          const content = await readFile(full, 'utf-8')
          const descMatch = content.match(/description:\s*(.+)/i)
          if (descMatch) {
            description = descMatch[1].trim().replace(/^['"]|['"]$/g, '')
          }
        } catch {
          description = ''
        }
      } else {
        continue
      }
      list.push({
        name,
        description,
        path: skillPath,
        builtin,
        enabled: true
      })
    }
  }

  listSkills() {
    return new ForkPromise(async (resolve) => {
      const list: AntigravitySkillItem[] = []
      try {
        // User skills first, then bundled builtin skills.
        await this.collectSkills(join(this.antigravityHome(), 'skills'), false, list)
        await this.collectSkills(join(this.antigravityHome(), 'builtin', 'skills'), true, list)
      } catch (e) {
        console.log('antigravity listSkills error: ', e)
      }
      resolve(list)
    })
  }

  openSkillsDir() {
    return new ForkPromise(async (resolve) => {
      const dir = join(this.antigravityHome(), 'skills')
      try {
        await mkdirp(dir)
      } catch {}
      resolve(dir)
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
    return [
      { name: 'settings.json', path: this.settingsFile() },
      { name: 'mcp_config.json', path: this.mcpConfigFile() }
    ]
  }

  getLogFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    return []
  }
}

export default new Antigravity()
