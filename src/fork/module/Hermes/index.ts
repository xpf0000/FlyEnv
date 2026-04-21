import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { execPromiseWithEnv, readFile, remove, existsSync, waitTime, readdir, writeFile } from '../../Fn'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { uuid } from '../../Fn'
import { appDebugLog, isWindows } from '@shared/utils'
import { PItem, ProcessKill, ProcessListFetch, ProcessPidsByPid } from '@shared/Process'
import { ProcessPidList } from '@shared/Process.win'
import { I18nT } from '@lang/index'

interface SkillItem {
  name: string
  category: string
  source: string
  trust: string
  isBuiltin: boolean
  isHub: boolean
  isLocal: boolean
  enabled: boolean
}

interface BrowseSkillItem {
  num: number
  name: string
  description: string
  source: string
  trust: string
}

interface SearchSkillItem {
  name: string
  description: string
  source: string
  trust: string
  identifier: string
}

class Hermes extends Base {
  constructor() {
    super()
    this.type = 'hermes'
  }

  private hermesHome() {
    return join(homedir(), '.hermes')
  }

  private hermesBin() {
    return 'hermes'
  }

  private async runCommand(command: string): Promise<string> {
    const tmp = join(tmpdir(), `${uuid()}.txt`)
    try {
      await execPromiseWithEnv(`${command} > "${tmp}" 2>&1`)
      const content = await readFile(tmp, 'utf-8')
      return content
    } finally {
      if (existsSync(tmp)) {
        await remove(tmp)
      }
    }
  }

  private parseListOutput(output: string): Array<{
    name: string
    category: string
    source: string
    trust: string
  }> {
    const list: Array<{ name: string; category: string; source: string; trust: string }> = []
    const lines = output.trim().split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('│') || trimmed.startsWith('│ ' + '─') || trimmed.includes('Name')) {
        continue
      }
      const parts = trimmed.split('│').map((p) => p.trim())
      if (parts.length >= 5) {
        const name = parts[1]
        const category = parts[2]
        const source = parts[3]
        const trust = parts[4]
        if (name && name !== 'Name') {
          list.push({ name, category, source, trust })
        }
      }
    }
    return list
  }

  private parseBrowseOutput(output: string): BrowseSkillItem[] {
    const list: BrowseSkillItem[] = []
    const lines = output.trim().split('\n')
    let current: BrowseSkillItem | null = null

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('│') || trimmed.startsWith('│ ' + '─') || trimmed.includes('#')) {
        continue
      }
      const parts = trimmed.split('│').map((p) => p.trim())
      if (parts.length < 6) {
        continue
      }
      const numStr = parts[1]
      const name = parts[2]
      const desc = parts[3]
      const source = parts[4]
      const trust = parts[5]

      if (numStr && !isNaN(Number(numStr))) {
        if (current) {
          list.push(current)
        }
        current = {
          num: Number(numStr),
          name,
          description: desc,
          source,
          trust
        }
      } else if (current && desc) {
        current.description += ' ' + desc
      }
    }
    if (current) {
      list.push(current)
    }
    return list
  }

  private parseSearchOutput(output: string): SearchSkillItem[] {
    const list: SearchSkillItem[] = []
    const lines = output.trim().split('\n')
    let current: SearchSkillItem | null = null

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('│') || trimmed.startsWith('│ ' + '─') || trimmed.includes('Name')) {
        continue
      }
      const parts = trimmed.split('│').map((p) => p.trim())
      if (parts.length < 6) {
        continue
      }
      const name = parts[1]
      const desc = parts[2]
      const source = parts[3]
      const trust = parts[4]
      const identifier = parts[5]

      if (name && name !== 'Name') {
        if (current) {
          list.push(current)
        }
        current = {
          name,
          description: desc,
          source,
          trust,
          identifier
        }
      } else if (current && desc) {
        current.description += ' ' + desc
      }
    }
    if (current) {
      list.push(current)
    }
    return list
  }

  private async getDisabledSkills(): Promise<Set<string>> {
    try {
      const configPath = join(this.hermesHome(), 'config.yaml')
      if (!existsSync(configPath)) {
        return new Set()
      }
      const content = await readFile(configPath, 'utf-8')
      const match = content.match(/skills:\s*\n(?:\s+.*\n)*\s+disabled:\s*\n((?:\s*-\s*[^\n]+\n)*)/)
      if (match) {
        const disabledLines = match[1]
        const disabled: string[] = []
        const lineMatches = disabledLines.matchAll(/-\s*(\S+)/g)
        for (const m of lineMatches) {
          disabled.push(m[1].trim())
        }
        return new Set(disabled)
      }
      // Also try simple list format: disabled: [skill-a, skill-b]
      const simpleMatch = content.match(/skills:\s*\n(?:\s+.*\n)*\s+disabled:\s*\[([^\]]*)\]/)
      if (simpleMatch) {
        const items = simpleMatch[1].split(',').map((s) => s.trim()).filter(Boolean)
        return new Set(items)
      }
      return new Set()
    } catch {
      return new Set()
    }
  }

  checkInstalled() {
    return new ForkPromise(async (resolve) => {
      let version = ''
      const tmp = join(tmpdir(), `${uuid()}.txt`)
      try {
        await execPromiseWithEnv(`${this.hermesBin()} --version > "${tmp}" 2>&1`)
        const content = await readFile(tmp, 'utf-8')
        version = content.trim()
      } catch (e) {
        console.log('hermes --version error: ', e)
        version = ''
      } finally {
        if (existsSync(tmp)) {
          await remove(tmp)
        }
      }
      resolve({
        installed: version.length > 0,
        version
      })
    })
  }

  getGatewayStatus() {
    return new ForkPromise(async (resolve) => {
      let status = ''
      const tmp = join(tmpdir(), `${uuid()}.txt`)
      try {
        await execPromiseWithEnv(`${this.hermesBin()} gateway status > "${tmp}" 2>&1`)
        const content = await readFile(tmp, 'utf-8')
        status = content.trim()
      } catch (e) {
        console.log('hermes gateway status error: ', e)
        status = ''
      } finally {
        if (existsSync(tmp)) {
          await remove(tmp)
        }
      }

      appDebugLog('[Hermes][getGatewayStatus]', status).catch()

      const isRunning = status.includes('Gateway service is loaded') && status.includes('"PID"')
      const isInstalled =
        isRunning ||
        status.includes('Gateway service is not loaded') ||
        status.includes('Service definition matches')

      resolve({
        status,
        isInstalled,
        isRunning
      })
    })
  }

  startGateway() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await execPromiseWithEnv(`${this.hermesBin()} gateway start`)
      } catch {}

      try {
        await waitTime(3000)
        let res: any = await this.getGatewayStatus()
        if (res?.isRunning) {
          return resolve(true)
        }
        await waitTime(3000)
        res = await this.getGatewayStatus()
        if (res?.isRunning) {
          return resolve(true)
        }
        reject(I18nT('hermes.startGatewayFail'))
      } catch (e: any) {
        reject(e?.message ?? I18nT('hermes.startGatewayFail'))
      }
    })
  }

  stopGateway() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await execPromiseWithEnv(`${this.hermesBin()} gateway stop`)
        let all: PItem[] = []
        if (isWindows()) {
          all = await ProcessPidList()
        } else {
          all = await ProcessListFetch()
        }

        if (!all.length) {
          resolve(true)
          return
        }

        const find = all.find(
          (f) =>
            f?.COMMAND &&
            (f.COMMAND.includes('hermes-gateway') ||
              (f.COMMAND.includes('hermes') && f.COMMAND.includes('gateway')))
        )

        if (find) {
          const arr = ProcessPidsByPid(find.PID, all)
          await ProcessKill('-9', arr)
        }

        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  getConfigPath() {
    return new ForkPromise(async (resolve) => {
      const hermesHome = this.hermesHome()
      resolve({
        'config.yaml': join(hermesHome, 'config.yaml'),
        '.env': join(hermesHome, '.env'),
        'SOUL.md': join(hermesHome, 'SOUL.md')
      })
    })
  }

  listSessions() {
    return new ForkPromise(async (resolve) => {
      const tmp = join(tmpdir(), `${uuid()}.txt`)
      let list: any[] = []
      try {
        await execPromiseWithEnv(`${this.hermesBin()} sessions list > "${tmp}" 2>&1`)
        const content = await readFile(tmp, 'utf-8')
        const lines = content
          .trim()
          .split('\n')
          .filter((l) => l.trim().length > 0)
        list = lines.map((line) => ({ name: line.trim() }))
      } catch (e) {
        console.log('hermes sessions list error: ', e)
      } finally {
        if (existsSync(tmp)) {
          await remove(tmp)
        }
      }
      resolve(list)
    })
  }

  listSkills() {
    return new ForkPromise(async (resolve) => {
      const tmp = join(tmpdir(), `${uuid()}.txt`)
      let list: string[] = []
      try {
        await execPromiseWithEnv(`${this.hermesBin()} skills list > "${tmp}" 2>&1`)
        const content = await readFile(tmp, 'utf-8')
        list = content
          .trim()
          .split('\n')
          .filter((l) => l.trim().length > 0)
      } catch (e) {
        console.log('hermes skills list error: ', e)
      } finally {
        if (existsSync(tmp)) {
          await remove(tmp)
        }
      }
      resolve(list)
    })
  }

  installSkill(name: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await execPromiseWithEnv(`${this.hermesBin()} skills install "${name}"`)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  openDashboard(port = 9119) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await execPromiseWithEnv(`${this.hermesBin()} dashboard --port ${port} --no-open`)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  runChat(query: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await execPromiseWithEnv(`${this.hermesBin()} chat -q "${query}"`)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  getLogFiles() {
    return new ForkPromise(async (resolve) => {
      const hermesHome = this.hermesHome()
      const logDir = join(hermesHome, 'logs')
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
        console.log('hermes getLogFiles error: ', e)
      }
      resolve(files)
    })
  }

  getLogs(type: string, lines = 100) {
    return new ForkPromise(async (resolve) => {
      const tmp = join(tmpdir(), `${uuid()}.txt`)
      let logs = ''
      try {
        await execPromiseWithEnv(`${this.hermesBin()} logs ${type} -n ${lines} > "${tmp}" 2>&1`)
        logs = await readFile(tmp, 'utf-8')
      } catch {
        const hermesHome = this.hermesHome()
        const fallback = join(hermesHome, 'logs', `${type}.log`)
        if (existsSync(fallback)) {
          logs = await readFile(fallback, 'utf-8')
        }
      } finally {
        if (existsSync(tmp)) {
          await remove(tmp)
        }
      }
      resolve(logs)
    })
  }

  // ========== Skills Management ==========

  listInstalledSkills() {
    return new ForkPromise(async (resolve) => {
      try {
        const output = await this.runCommand(`${this.hermesBin()} skills list --source all`)
        const parsed = this.parseListOutput(output)
        const disabled = await this.getDisabledSkills()
        const skills: SkillItem[] = parsed.map((item) => ({
          ...item,
          isBuiltin: item.source === 'builtin',
          isHub: item.source === 'hub',
          isLocal: item.source === 'local',
          enabled: !disabled.has(item.name)
        }))
        resolve(skills)
      } catch (e) {
        console.log('hermes listInstalledSkills error: ', e)
        resolve([])
      }
    })
  }

  browseSkills(page: number, size: number, source?: string) {
    return new ForkPromise(async (resolve) => {
      try {
        let cmd = `${this.hermesBin()} skills browse --page ${page} --size ${size}`
        if (source) {
          cmd += ` --source ${source}`
        }
        const output = await this.runCommand(cmd)
        const list = this.parseBrowseOutput(output)
        // Extract total pages info
        const pageMatch = output.match(/page\s*(\d+)\/(\d+)/)
        const totalMatch = output.match(/(\d+)\s+skills?\s+loaded/)
        resolve({
          list,
          currentPage: pageMatch ? Number(pageMatch[1]) : page,
          totalPages: pageMatch ? Number(pageMatch[2]) : 1,
          total: totalMatch ? Number(totalMatch[1]) : list.length
        })
      } catch (e) {
        console.log('hermes browseSkills error: ', e)
        resolve({ list: [], currentPage: page, totalPages: 1, total: 0 })
      }
    })
  }

  searchSkills(query: string, limit = 20) {
    return new ForkPromise(async (resolve) => {
      try {
        const output = await this.runCommand(`${this.hermesBin()} skills search "${query}" --limit ${limit}`)
        const list = this.parseSearchOutput(output)
        resolve(list)
      } catch (e) {
        console.log('hermes searchSkills error: ', e)
        resolve([])
      }
    })
  }

  inspectSkill(identifier: string) {
    return new ForkPromise(async (resolve) => {
      try {
        const output = await this.runCommand(`${this.hermesBin()} skills inspect "${identifier}"`)
        resolve(output)
      } catch (e) {
        console.log('hermes inspectSkill error: ', e)
        resolve('')
      }
    })
  }

  updateSkill(name?: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const cmd = name
          ? `${this.hermesBin()} skills update "${name}"`
          : `${this.hermesBin()} skills update`
        await execPromiseWithEnv(cmd)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  uninstallSkill(name: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await execPromiseWithEnv(`${this.hermesBin()} skills uninstall "${name}"`)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  resetSkill(name: string, restore = false) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        let cmd = `${this.hermesBin()} skills reset "${name}" --yes`
        if (restore) {
          cmd += ' --restore'
        }
        await execPromiseWithEnv(cmd)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  checkSkills(name?: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const cmd = name
          ? `${this.hermesBin()} skills check "${name}"`
          : `${this.hermesBin()} skills check`
        const output = await this.runCommand(cmd)
        resolve(output)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  auditSkills(name?: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const cmd = name
          ? `${this.hermesBin()} skills audit "${name}"`
          : `${this.hermesBin()} skills audit`
        const output = await this.runCommand(cmd)
        resolve(output)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  getSkillConfig() {
    return new ForkPromise(async (resolve) => {
      try {
        const configPath = join(this.hermesHome(), 'config.yaml')
        if (!existsSync(configPath)) {
          resolve({ disabled: [] })
          return
        }
        const content = await readFile(configPath, 'utf-8')
        const match = content.match(/skills:\s*\n(?:\s+.*\n)*\s+disabled:\s*\n((?:\s*-\s*[^\n]+\n)*)/)
        const disabled: string[] = []
        if (match) {
          const disabledLines = match[1]
          const lineMatches = disabledLines.matchAll(/-\s*(\S+)/g)
          for (const m of lineMatches) {
            disabled.push(m[1].trim())
          }
        }
        const simpleMatch = content.match(/skills:\s*\n(?:\s+.*\n)*\s+disabled:\s*\[([^\]]*)\]/)
        if (simpleMatch) {
          const items = simpleMatch[1].split(',').map((s) => s.trim()).filter(Boolean)
          disabled.push(...items)
        }
        resolve({ disabled: [...new Set(disabled)] })
      } catch (e) {
        console.log('hermes getSkillConfig error: ', e)
        resolve({ disabled: [] })
      }
    })
  }

  setSkillConfig(disabled: string[]) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const configPath = join(this.hermesHome(), 'config.yaml')
        let content = ''
        if (existsSync(configPath)) {
          content = await readFile(configPath, 'utf-8')
        }

        const disabledYaml = disabled.length > 0 ? disabled.map((d) => `  - ${d}`).join('\n') : '  []'

        if (content.includes('skills:')) {
          // Replace existing skills.disabled
          const newContent = content.replace(
            /(skills:\s*\n(?:\s+.*\n)*?)(\s+disabled:\s*(?:\[[^\]]*\]|(?:\n(?:\s+-\s*[^\n]+\n?)*))?)/,
            `$1  disabled:\n${disabledYaml}\n`
          )
          await writeFile(configPath, newContent)
        } else {
          content += `\nskills:\n  disabled:\n${disabledYaml}\n`
          await writeFile(configPath, content)
        }
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  openSkillsDir() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const skillsDir = join(this.hermesHome(), 'skills')
        if (isWindows()) {
          await execPromiseWithEnv(`explorer "${skillsDir}"`)
        } else if (process.platform === 'darwin') {
          await execPromiseWithEnv(`open "${skillsDir}"`)
        } else {
          await execPromiseWithEnv(`xdg-open "${skillsDir}"`)
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
}

export default new Hermes()
