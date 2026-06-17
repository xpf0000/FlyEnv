import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import {
  execPromiseWithEnv,
  readFile,
  remove,
  existsSync,
  readdir,
  writeFile
} from '../../Fn'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { uuid } from '../../Fn'
import { parse as TOMLParse, stringify as TOMLStringify } from '@iarna/toml'

export interface KimiSessionItem {
  id: string
  title: string
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

  private runCommand(command: string) {
    return new ForkPromise<string>(async (resolve) => {
      const tmp = join(tmpdir(), `${uuid()}.txt`)
      try {
        await execPromiseWithEnv(`${command} > "${tmp}" 2>&1`)
        const content = await readFile(tmp, 'utf-8')
        resolve(content)
      } catch (e) {
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
        'tui.toml': join(home, 'tui.toml')
      })
    })
  }

  getLogFiles() {
    return new ForkPromise(async (resolve) => {
      const logDir = join(this.kimiHome(), 'logs')
      const files: Array<{ name: string; path: string }> = []
      try {
        if (existsSync(logDir)) {
          const list = await readdir(logDir)
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
      resolve(files)
    })
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
              const sessionDir = join(bucketPath, sessionId)
              const stateFile = join(sessionDir, 'state.json')
              let title = sessionId
              let updatedAt = ''
              try {
                if (existsSync(stateFile)) {
                  const state = JSON.parse(await readFile(stateFile, 'utf-8'))
                  title = state?.title || state?.lastPrompt || sessionId
                  updatedAt = state?.updatedAt || state?.lastActive || ''
                }
              } catch {
                // ignore
              }
              list.push({
                id: sessionId,
                title,
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

  getQuickSettings() {
    return new ForkPromise(async (resolve) => {
      const configFile = join(this.kimiHome(), 'config.toml')
      const defaults = {
        default_permission_mode: 'manual',
        default_thinking: false,
        default_plan_mode: false,
        telemetry: true
      }
      try {
        if (!existsSync(configFile)) {
          resolve(defaults)
          return
        }
        const content = await readFile(configFile, 'utf-8')
        const config: any = TOMLParse(content)
        resolve({
          default_permission_mode: config?.default_permission_mode ?? defaults.default_permission_mode,
          default_thinking: config?.default_thinking ?? defaults.default_thinking,
          default_plan_mode: config?.default_plan_mode ?? defaults.default_plan_mode,
          telemetry: config?.telemetry ?? defaults.telemetry
        })
      } catch (e) {
        console.log('kimi getQuickSettings error: ', e)
        resolve(defaults)
      }
    })
  }

  setQuickSettings(settings: {
    default_permission_mode?: string
    default_thinking?: boolean
    default_plan_mode?: boolean
    telemetry?: boolean
  }) {
    return new ForkPromise(async (resolve, reject) => {
      const configFile = join(this.kimiHome(), 'config.toml')
      try {
        let config: any = {}
        if (existsSync(configFile)) {
          try {
            const content = await readFile(configFile, 'utf-8')
            config = TOMLParse(content)
          } catch {
            config = {}
          }
        }
        config.default_permission_mode = settings.default_permission_mode ?? config.default_permission_mode ?? 'manual'
        config.default_thinking = settings.default_thinking ?? config.default_thinking ?? false
        config.default_plan_mode = settings.default_plan_mode ?? config.default_plan_mode ?? false
        config.telemetry = settings.telemetry ?? config.telemetry ?? true
        await writeFile(configFile, TOMLStringify(config))
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

export default new Kimi()
