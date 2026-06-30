import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { execPromiseWithEnv, readFile, writeFile, remove, existsSync, mkdirp, uuid } from '../../Fn'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { ExecCommand } from '@shared/Exec'
import { isWindows } from '@shared/utils'
import type { SoftInstalled } from '@shared/app'
import { joinMcpCommand, optionalBearerHeaders } from '@shared/aiCliMcp'

const require = createRequire(import.meta.url)

export interface CopilotCliSessionItem {
  id: string
  title: string
  lastPrompt: string
  workDir: string
  updatedAt: string
}

export interface CopilotCliMcpItem {
  name: string
  type: string
  commandOrUrl: string
  scope: string
}

export interface CopilotCliSkillItem {
  name: string
  description: string
  path: string
}

class CopilotCli extends Base {
  constructor() {
    super()
    this.type = 'copilotCli'
  }

  /** GitHub Copilot CLI stores everything under `~/.copilot` (override: COPILOT_CONFIG_DIR). */
  private copilotHome() {
    return process.env.COPILOT_CONFIG_DIR || join(homedir(), '.copilot')
  }

  private sessionStoreDb() {
    return join(this.copilotHome(), 'session-store.db')
  }

  private mcpConfigFile() {
    return join(this.copilotHome(), 'mcp-config.json')
  }

  private copilotBin() {
    return 'copilot'
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
      const version = await this.runCommand(`${this.copilotBin()} --version`)
      const trimmed = version.trim()
      // `copilot --version` prints e.g. "GitHub Copilot CLI 1.0.65.".
      const match = trimmed.match(/([0-9]+\.[0-9]+\.[0-9]+)/)
      resolve({
        installed: trimmed.length > 0,
        version: match ? match[1] : trimmed
      })
    })
  }

  getConfigPath() {
    return new ForkPromise(async (resolve) => {
      const home = this.copilotHome()
      resolve({
        'config.json': join(home, 'config.json'),
        'mcp-config.json': this.mcpConfigFile()
      })
    })
  }

  // ========== Sessions ==========
  //
  // Copilot persists sessions in a SQLite store at `~/.copilot/session-store.db`.
  // The `sessions` table holds plain columns (id, cwd, repository, branch, summary,
  // created_at, updated_at) and `turns` holds the user/assistant messages, so titles
  // and prompts are cleanly readable.

  listSessions() {
    return new ForkPromise(async (resolve) => {
      const list: CopilotCliSessionItem[] = []
      const dbFile = this.sessionStoreDb()
      try {
        if (!existsSync(dbFile)) {
          resolve(list)
          return
        }
        const { DatabaseSync } = require('node:sqlite')
        const db = new DatabaseSync(dbFile, { readOnly: true })
        try {
          const rows: any[] = db
            .prepare(
              `SELECT s.id AS id, s.cwd AS cwd, s.summary AS summary, s.updated_at AS updatedAt,
                 (SELECT user_message FROM turns t WHERE t.session_id = s.id ORDER BY t.turn_index ASC LIMIT 1) AS firstMsg,
                 (SELECT user_message FROM turns t WHERE t.session_id = s.id ORDER BY t.turn_index DESC LIMIT 1) AS lastMsg
               FROM sessions s
               ORDER BY s.updated_at DESC`
            )
            .all()
          for (const r of rows) {
            const title = r.summary || r.firstMsg || r.id
            list.push({
              id: String(r.id),
              title: String(title).slice(0, 80),
              lastPrompt: r.lastMsg ? String(r.lastMsg).slice(0, 120) : '',
              workDir: r.cwd ?? '',
              updatedAt: r.updatedAt ?? ''
            })
          }
        } finally {
          db.close()
        }
      } catch (e) {
        console.log('copilotCli listSessions error: ', e)
      }
      resolve(list)
    })
  }

  deleteSession(sessionId: string) {
    return new ForkPromise(async (resolve, reject) => {
      const dbFile = this.sessionStoreDb()
      try {
        if (!existsSync(dbFile)) {
          resolve(true)
          return
        }
        const { DatabaseSync } = require('node:sqlite')
        const db = new DatabaseSync(dbFile)
        try {
          // Remove the session and its dependent rows. Tables without a row simply no-op.
          const childTables = [
            'turns',
            'checkpoints',
            'session_files',
            'session_refs',
            'forge_trajectory_events'
          ]
          for (const t of childTables) {
            try {
              db.prepare(`DELETE FROM ${t} WHERE session_id = ?`).run(sessionId)
            } catch {
              /* table may not exist in this schema version */
            }
          }
          db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
        } finally {
          db.close()
        }
        // Remove the per-session state directory if present.
        const stateDir = join(this.copilotHome(), 'session-state', sessionId)
        if (existsSync(stateDir)) {
          await remove(stateDir)
        }
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  runInTerminal(workDir: string, sessionId: string) {
    return new ForkPromise(async (resolve, reject) => {
      const copilotCommand = sessionId
        ? `${this.copilotBin()} --resume=${sessionId}`
        : this.copilotBin()
      const dir = workDir || homedir()
      const terminalCommand = isWindows()
        ? `cd "${dir}"; ${copilotCommand}`
        : `cd "${dir}" && ${copilotCommand}`
      try {
        await ExecCommand.runInTerminal(terminalCommand)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? e?.toString() ?? 'fail')
      }
    })
  }

  // ========== MCP (via official `copilot mcp` subcommands) ==========

  listMcp() {
    return new ForkPromise(async (resolve) => {
      const list: CopilotCliMcpItem[] = []
      try {
        const output = await this.runCommand(`${this.copilotBin()} mcp list --json`)
        const jsonStart = output.search(/[[{]/)
        if (jsonStart < 0) {
          resolve(list)
          return
        }
        const data = JSON.parse(output.slice(jsonStart))
        const servers: any[] = Array.isArray(data)
          ? data
          : Object.entries(data?.mcpServers ?? data ?? {}).map(([name, v]: any) => ({
              name,
              ...(v ?? {})
            }))
        servers.forEach((s) => {
          const type = s?.type ?? (s?.url || s?.httpUrl ? 'http' : 'local')
          const commandOrUrl = s?.url ?? s?.httpUrl ?? joinMcpCommand(s?.command, s?.args)
          list.push({
            name: s?.name ?? '',
            type,
            commandOrUrl,
            scope: s?.source ?? s?.scope ?? 'user'
          })
        })
      } catch (e) {
        console.log('copilotCli listMcp error: ', e)
      }
      resolve(list)
    })
  }

  addMcp(name: string, type: string, commandOrUrl: string, token?: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        if (type === 'http' || type === 'sse') {
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
          const headers = optionalBearerHeaders(token)
          data.mcpServers[name] = {
            tools: ['*'],
            type: 'http',
            url: commandOrUrl,
            source: 'user'
          }
          if (headers) {
            data.mcpServers[name].headers = headers
          }
          await mkdirp(this.copilotHome())
          await writeFile(file, JSON.stringify(data, null, 2))
          resolve(true)
          return
        }
        const bin = this.copilotBin()
        // stdio/local: everything after `--` is the command and its args.
        const cmd = `${bin} mcp add ${name} -- ${commandOrUrl}`
        const output = await this.runCommand(cmd)
        // The CLI prints an error to stdout/stderr on failure; treat known markers as errors.
        if (/error|failed|usage:/i.test(output) && !/added|success/i.test(output)) {
          reject(output.trim() || 'fail')
          return
        }
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  removeMcp(name: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await execPromiseWithEnv(`${this.copilotBin()} mcp remove ${name}`)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  // ========== Skills (via official `copilot skill list`) ==========

  listSkills() {
    return new ForkPromise(async (resolve) => {
      const list: CopilotCliSkillItem[] = []
      try {
        const output = await this.runCommand(`${this.copilotBin()} skill list --json`)
        const jsonStart = output.search(/[[{]/)
        if (jsonStart < 0) {
          resolve(list)
          return
        }
        const data = JSON.parse(output.slice(jsonStart))
        const skills: any[] = Array.isArray(data) ? data : (data?.skills ?? [])
        skills.forEach((s) => {
          const name = s?.source ? `${s?.name ?? ''} (${s.source})` : (s?.name ?? '')
          list.push({
            name,
            description: s?.description ?? '',
            path: s?.path ?? ''
          })
        })
      } catch (e) {
        console.log('copilotCli listSkills error: ', e)
      }
      resolve(list)
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
    const home = this.copilotHome()
    return [
      { name: 'config.json', path: join(home, 'config.json') },
      { name: 'mcp-config.json', path: this.mcpConfigFile() }
    ]
  }

  getLogFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    return []
  }
}

export default new CopilotCli()
