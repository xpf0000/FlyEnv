import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import {
  execPromiseWithEnv,
  readFile,
  writeFile,
  remove,
  existsSync,
  readdir,
  mkdirp
} from '../../Fn'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { readdirSync } from 'node:fs'
import { uuid } from '../../Fn'
import { ExecCommand } from '@shared/Exec'
import { isWindows } from '@shared/utils'
import type { SoftInstalled } from '@shared/app'

export interface KimiSessionItem {
  id: string
  title: string
  lastPrompt: string
  workDir: string
  updatedAt: string
}

class Kimi extends Base {
  constructor() {
    super()
    this.type = 'kimi'
  }

  private kimiHome() {
    return process.env.KIMI_CODE_HOME || join(homedir(), '.kimi-code')
  }

  private kimiBin() {
    return 'kimi'
  }

  private mcpFile() {
    return join(this.kimiHome(), 'mcp.json')
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
      const version = await this.runCommand(`${this.kimiBin()} --version`)
      resolve({
        installed: version.trim().length > 0,
        version: version.trim()
      })
    })
  }

  getConfigPath() {
    return new ForkPromise(async (resolve) => {
      const home = this.kimiHome()
      resolve({
        'config.toml': join(home, 'config.toml'),
        'tui.toml': join(home, 'tui.toml'),
        'mcp.json': this.mcpFile()
      })
    })
  }

  addMcp(name: string, type: string, commandOrUrl: string, token?: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        if (type !== 'http' && type !== 'sse') {
          reject('Kimi only supports HTTP/SSE MCP config files')
          return
        }
        const file = this.mcpFile()
        let data: any = {}
        if (existsSync(file)) {
          data = JSON.parse(await readFile(file, 'utf-8'))
        }
        data.mcpServers = data.mcpServers ?? {}
        data.mcpServers[name] = {
          url: commandOrUrl,
          headers: {
            Authorization: `Bearer ${token ?? ''}`
          }
        }
        if (type === 'sse') {
          data.mcpServers[name].transport = 'sse'
        }
        await mkdirp(this.kimiHome())
        await writeFile(file, JSON.stringify(data, null, 2))
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  getLogFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    const logDir = join(this.kimiHome(), 'logs')
    const files: Array<{ name: string; path: string }> = []
    try {
      if (existsSync(logDir)) {
        const list = readdirSync(logDir)
        list.forEach((name) => {
          if (name.endsWith('.log')) {
            files.push({
              name: name.replace('.log', ''),
              path: join(logDir, name)
            })
          }
        })
      }
    } catch (e) {
      console.log('kimi getLogFiles error: ', e)
    }
    return files
  }

  getLogs(type: string) {
    return new ForkPromise(async (resolve) => {
      const logFile = join(this.kimiHome(), 'logs', `${type}.log`)
      let logs = ''
      try {
        if (existsSync(logFile)) {
          logs = await readFile(logFile, 'utf-8')
        }
      } catch (e) {
        console.log('kimi getLogs error: ', e)
      }
      resolve(logs)
    })
  }

  private async loadSessionWorkDirMap(): Promise<Record<string, string>> {
    const map: Record<string, string> = {}
    const indexFile = join(this.kimiHome(), 'session_index.jsonl')
    try {
      if (!existsSync(indexFile)) {
        return map
      }
      const content = await readFile(indexFile, 'utf-8')
      const lines = content.split('\n').filter((l) => l.trim().length > 0)
      for (const line of lines) {
        try {
          const record = JSON.parse(line)
          if (record?.sessionId) {
            map[String(record.sessionId)] = record.workDir || ''
          }
        } catch {
          // ignore malformed line
        }
      }
    } catch (e) {
      console.log('kimi loadSessionWorkDirMap error: ', e)
    }
    return map
  }

  runInTerminal(workDir: string, sessionId: string) {
    return new ForkPromise(async (resolve, reject) => {
      const kimiCommand = `kimi --session "${sessionId}"`
      const terminalCommand = isWindows()
        ? `cd "${workDir}"; ${kimiCommand}`
        : `cd "${workDir}" && ${kimiCommand}`
      try {
        await ExecCommand.runInTerminal(terminalCommand)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? e?.toString() ?? 'fail')
      }
    })
  }

  listSessions() {
    return new ForkPromise(async (resolve) => {
      const list: KimiSessionItem[] = []
      const sessionsDir = join(this.kimiHome(), 'sessions')
      const workDirMap = await this.loadSessionWorkDirMap()
      try {
        if (!existsSync(sessionsDir)) {
          resolve(list)
          return
        }
        const buckets = await readdir(sessionsDir)
        for (const bucket of buckets) {
          const bucketPath = join(sessionsDir, bucket)
          try {
            const entries = await readdir(bucketPath)
            for (const sessionId of entries) {
              if (sessionId === '.DS_Store') {
                continue
              }
              const sessionDir = join(bucketPath, sessionId)
              const stateFile = join(sessionDir, 'state.json')
              let title = sessionId
              let lastPrompt = ''
              let updatedAt = ''
              try {
                if (existsSync(stateFile)) {
                  const state = JSON.parse(await readFile(stateFile, 'utf-8'))
                  title = state?.title || sessionId
                  lastPrompt = state?.lastPrompt || ''
                  updatedAt = state?.updatedAt || state?.lastActive || ''
                }
              } catch {
                // ignore
              }
              list.push({
                id: sessionId,
                title,
                lastPrompt,
                workDir: workDirMap[sessionId] || '',
                updatedAt
              })
            }
          } catch (e) {
            console.log('kimi listSessions bucket error: ', e)
          }
        }
      } catch (e) {
        console.log('kimi listSessions error: ', e)
      }
      // Sort by updatedAt desc
      list.sort((a, b) => {
        if (!a.updatedAt || !b.updatedAt) return 0
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      })
      resolve(list)
    })
  }

  deleteSession(sessionId: string) {
    return new ForkPromise(async (resolve, reject) => {
      const sessionsDir = join(this.kimiHome(), 'sessions')
      try {
        if (!existsSync(sessionsDir)) {
          resolve(true)
          return
        }
        const buckets = await readdir(sessionsDir)
        for (const bucket of buckets) {
          const sessionDir = join(sessionsDir, bucket, sessionId)
          if (existsSync(sessionDir)) {
            await remove(sessionDir)
            resolve(true)
            return
          }
        }
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
    const home = this.kimiHome()
    return [
      { name: 'config.toml', path: join(home, 'config.toml') },
      { name: 'tui.toml', path: join(home, 'tui.toml') },
      { name: 'mcp.json', path: this.mcpFile() }
    ]
  }
}

export default new Kimi()
