import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { execPromiseWithEnv, readFile, writeFile, remove, existsSync, mkdirp, uuid } from '../../Fn'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { ExecCommand } from '@shared/Exec'
import { isWindows } from '@shared/utils'

export interface OpenCodeSessionItem {
  id: string
  title: string
  lastPrompt: string
  workDir: string
  updatedAt: string
}

export interface OpenCodeMcpItem {
  name: string
  type: string
  commandOrUrl: string
  scope: string
}

export interface OpenCodeProviderItem {
  id: string
  name: string
  type: string
}

export interface OpenCodeStatGroup {
  title: string
  rows: Array<{ label: string; value: string }>
}

class OpenCode extends Base {
  constructor() {
    super()
    this.type = 'openCode'
  }

  private configHome() {
    const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
    return join(base, 'opencode')
  }

  private dataHome() {
    const base = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share')
    return join(base, 'opencode')
  }

  private configFile() {
    const home = this.configHome()
    const jsonc = join(home, 'opencode.jsonc')
    if (existsSync(jsonc)) {
      return jsonc
    }
    return join(home, 'opencode.json')
  }

  private openCodeBin() {
    return 'opencode'
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
      const version = await this.runCommand(`${this.openCodeBin()} --version`)
      const v = version.trim().split('\n').pop()?.trim() ?? ''
      resolve({
        installed: v.length > 0,
        version: v
      })
    })
  }

  getConfigPath() {
    return new ForkPromise(async (resolve) => {
      resolve({
        'opencode.jsonc': this.configFile()
      })
    })
  }

  // ========== Sessions ==========

  listSessions() {
    return new ForkPromise(async (resolve) => {
      const list: OpenCodeSessionItem[] = []
      try {
        const output = await this.runCommand(`${this.openCodeBin()} session list --format json`)
        const jsonStart = output.search(/[[{]/)
        if (jsonStart < 0) {
          resolve(list)
          return
        }
        const data = JSON.parse(output.slice(jsonStart))
        const arr: any[] = Array.isArray(data) ? data : []
        arr.forEach((s) => {
          const updated = s?.updated ?? s?.created
          list.push({
            id: s?.id ?? '',
            title: s?.title ?? s?.id ?? '',
            lastPrompt: '',
            workDir: s?.directory ?? '',
            updatedAt: updated ? new Date(Number(updated)).toISOString() : ''
          })
        })
      } catch (e) {
        console.log('openCode listSessions error: ', e)
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
      try {
        await execPromiseWithEnv(`${this.openCodeBin()} session delete ${sessionId}`)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  runInTerminal(workDir: string, sessionId: string) {
    return new ForkPromise(async (resolve, reject) => {
      const command = `${this.openCodeBin()} --session ${sessionId}`
      const dir = workDir || homedir()
      const terminalCommand = isWindows() ? `cd "${dir}"; ${command}` : `cd "${dir}" && ${command}`
      try {
        await ExecCommand.runInTerminal(terminalCommand)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? e?.toString() ?? 'fail')
      }
    })
  }

  // ========== MCP ==========

  private async readConfig(): Promise<any> {
    const file = this.configFile()
    if (!existsSync(file)) {
      return {}
    }
    try {
      const raw = await readFile(file, 'utf-8')
      // strip // and /* */ comments to tolerate JSONC
      const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      return JSON.parse(stripped)
    } catch (e) {
      console.log('openCode readConfig error: ', e)
      return {}
    }
  }

  listMcp() {
    return new ForkPromise(async (resolve) => {
      const list: OpenCodeMcpItem[] = []
      try {
        const config = await this.readConfig()
        const servers = config?.mcp ?? {}
        for (const name in servers) {
          const s = servers[name] ?? {}
          const type = s?.type ?? (s?.url ? 'remote' : 'local')
          const commandOrUrl =
            s?.url ?? (Array.isArray(s?.command) ? s.command.join(' ') : (s?.command ?? ''))
          list.push({ name, type, commandOrUrl, scope: 'global' })
        }
      } catch (e) {
        console.log('openCode listMcp error: ', e)
      }
      resolve(list)
    })
  }

  addMcp(name: string, type: string, commandOrUrl: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        let cmd: string
        if (type === 'remote') {
          cmd = `${this.openCodeBin()} mcp add ${name} --url "${commandOrUrl}"`
        } else {
          cmd = `${this.openCodeBin()} mcp add ${name} -- ${commandOrUrl}`
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
      // opencode has no `mcp remove` command; edit the config directly.
      try {
        const file = this.configFile()
        const config = await this.readConfig()
        if (config?.mcp && config.mcp[name]) {
          delete config.mcp[name]
          await mkdirp(this.configHome())
          await writeFile(file, JSON.stringify(config, null, 2))
        }
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  // ========== Providers ==========

  listProviders() {
    return new ForkPromise(async (resolve) => {
      const list: OpenCodeProviderItem[] = []
      try {
        const authFile = join(this.dataHome(), 'auth.json')
        if (existsSync(authFile)) {
          const data = JSON.parse(await readFile(authFile, 'utf-8'))
          for (const id in data) {
            const v = data[id] ?? {}
            list.push({
              id,
              name: id,
              type: v?.type ?? 'api'
            })
          }
        }
      } catch (e) {
        console.log('openCode listProviders error: ', e)
      }
      resolve(list)
    })
  }

  // ========== Stats ==========

  getStats(days?: number) {
    return new ForkPromise(async (resolve) => {
      const groups: OpenCodeStatGroup[] = []
      try {
        let cmd = `${this.openCodeBin()} stats --models`
        if (days && days > 0) {
          cmd += ` --days ${days}`
        }
        const output = await this.runCommand(cmd)
        // strip ANSI escape codes
        const clean = output.replace(/\[[0-9;]*[A-Za-z]/g, '')
        const lines = clean.split('\n')
        let current: OpenCodeStatGroup | null = null
        for (const raw of lines) {
          const line = raw.replace(/\r/g, '')
          // section title row: │   TITLE   │ (all caps, no trailing value column)
          const titleMatch = line.match(/^\s*│\s*([A-Z][A-Z &]+[A-Z])\s*│\s*$/)
          if (titleMatch) {
            current = { title: titleMatch[1].trim(), rows: [] }
            groups.push(current)
            continue
          }
          // data row: │Label    Value │
          const rowMatch = line.match(/^\s*│\s*(.+?)\s{2,}(\S.*?)\s*│\s*$/)
          if (rowMatch && current) {
            const label = rowMatch[1].trim()
            const value = rowMatch[2].trim()
            if (label && !/^[─━]+$/.test(label)) {
              current.rows.push({ label, value })
            }
          }
        }
      } catch (e) {
        console.log('openCode getStats error: ', e)
      }
      resolve(groups)
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

export default new OpenCode()
