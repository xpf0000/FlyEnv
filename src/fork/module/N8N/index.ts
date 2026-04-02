import { join } from 'path'
import { existsSync, readdirSync } from 'fs'
import { EOL, homedir } from 'os'
import { Base } from '../Base'
import type { SoftInstalled } from '@shared/app'
import {
  AppLog,
  execPromise,
  mkdirp,
  readFile,
  writeFile,
  remove,
  serviceStartExec,
  serviceStartExecCMD,
  waitTime
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { I18nT } from '@lang/index'
import { isWindows } from '@shared/utils'
import {
  ProcessListSearch,
  fetchProcessPidByPort,
  ProcessPidList,
  ProcessPidListByPid
} from '@shared/Process.win'
import axios from 'axios'
import http from 'http'
import {
  getEnvFilePath,
  getPort,
  parseEnvFile,
  getN8nConfig,
  resolveDataDir,
  getDefaultEnvContent
} from './utils'
import {
  userList,
  userDelete,
  userSetDisabled,
  userSetRole,
  userSetName,
  userResetPassword,
  userCreate,
  userChangeOwnerPassword
} from './database'
import {
  ProcessKill,
  fetchProcessPidByPort as fetchPidByPort,
  PItem,
  ProcessListFetch
} from '@shared/Process'
import { allInstalledVersions, fetchAllOnlineVersion } from './version'

class N8N extends Base {
  constructor() {
    super()
    this.type = 'n8n'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'n8n/n8n.pid')
  }

  /** Clean up pid files */
  private async _cleanupPidFiles(): Promise<void> {
    try {
      const appPidFile = join(global.Server.BaseDir!, `pid/${this.type}.pid`)
      if (existsSync(appPidFile)) await remove(appPidFile)
    } catch {}
    try {
      if (existsSync(this.pidPath)) await remove(this.pidPath)
    } catch {}
  }

  _stopServer(version: SoftInstalled): ForkPromise<{ 'APP-Service-Stop-PID': string[] }> {
    if (!isWindows()) {
      return super._stopServer(version) as any
    }
    return new ForkPromise(async (resolve, _reject, on) => {
      on({ 'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceBegin', { service: this.type })) })

      const port = await getPort()
      const allPid = new Set<string>()

      const processList = await ProcessPidList()

      // 1. Kill by saved pid file (cmd.exe wrapper + its children)
      try {
        const appPidFile = join(global.Server.BaseDir!, `pid/${this.type}.pid`)
        if (existsSync(appPidFile)) {
          const savedPid = (await readFile(appPidFile, 'utf-8')).trim()
          if (savedPid) {
            const tree = await ProcessPidListByPid(savedPid, processList)
            tree.forEach((p) => allPid.add(p))
            allPid.add(savedPid)
          }
        }
      } catch {}

      // 2. Kill by port — most reliable: finds node.exe actually listening
      try {
        const portPids = await fetchProcessPidByPort(port)
        for (const pid of portPids) {
          const tree = await ProcessPidListByPid(pid, processList)
          tree.forEach((p) => allPid.add(p))
          allPid.add(pid)
        }
      } catch {}

      // 3. Kill any node.exe whose command contains '\\n8n\\'
      try {
        const n8nProcs = await ProcessListSearch('\\n8n\\', false, processList)
        n8nProcs.forEach((p) => allPid.add(p.PID!))
      } catch {}

      const arr = Array.from(allPid).filter(Boolean)
      if (arr.length > 0) {
        await ProcessKill('-9', arr)
      }

      await this._cleanupPidFiles()

      on({ 'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceEnd', { service: this.type })) })
      resolve({ 'APP-Service-Stop-PID': arr })
    })
  }

  /**
   * Initialize the n8n config env file (.env) in BaseDir/n8n/
   */
  initConfig(): ForkPromise<string> {
    return new ForkPromise(async (resolve, _reject, on) => {
      const baseDir = join(global.Server.BaseDir!, 'n8n')
      await mkdirp(baseDir)
      const envFile = join(baseDir, 'n8n.env')
      if (!existsSync(envFile)) {
        on({ 'APP-On-Log': AppLog('info', I18nT('appLog.confInit')) })
        const defaultContent = getDefaultEnvContent()
        await writeFile(envFile, defaultContent)
        const defaultEnvFile = join(baseDir, 'n8n.env.default')
        await writeFile(defaultEnvFile, defaultContent)
        on({ 'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: envFile })) })
      }
      resolve(envFile)
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `n8n-${version.version}` })
        )
      })

      const baseDir = join(global.Server.BaseDir!, 'n8n')
      await mkdirp(baseDir)

      const envFile = await this.initConfig().on(on)
      const bin = version.bin

      const opt = await parseEnvFile(envFile)

      // Resolve the effective data directory:
      // 1. Use N8N_USER_FOLDER from env file if explicitly set.
      // 2. Otherwise fall back to n8n's OS-native default: ~/.n8n
      const nativeDefault = join(homedir(), '.n8n')
      const effectiveDataDir = opt['N8N_USER_FOLDER'] || nativeDefault

      // Build execEnv and start service
      const execEnv = isWindows()
        ? Object.entries(opt)
            .map(([k, v]) => `SET ${k}=${v}`)
            .join('\r\n') + '\r\n'
        : Object.entries(opt)
            .map(([k, v]) => `export ${k}="${v}"`)
            .join(EOL) + EOL

      const startService = isWindows()
        ? () =>
            serviceStartExecCMD({
              version,
              pidPath: this.pidPath,
              baseDir,
              bin,
              execArgs: 'start',
              execEnv,
              on,
              checkPidFile: false
            })
        : () =>
            serviceStartExec({
              version,
              pidPath: this.pidPath,
              baseDir,
              bin,
              execArgs: 'start',
              execEnv,
              on,
              checkPidFile: false
            })

      const checkPid = async (times = 0) => {
        if (times > 10) {
          throw new Error(I18nT('fork.startFail'))
        }
        /**
         * Fetch Process List
         */
        let all: PItem[] = []
        try {
          if (isWindows()) {
            all = await ProcessPidList()
          } else {
            all = await ProcessListFetch()
          }
        } catch {
          await waitTime(2000)
          return await checkPid(times + 1)
        }
        /**
         * Check Is n8n start success
         */
        const find = all.find(
          (a) => a?.COMMAND && a.COMMAND.includes('n8n') && a.COMMAND.includes('start')
        )
        if (find) {
          return find.PID
        }
        await waitTime(2000)
        return await checkPid(times + 1)
      }

      try {
        await startService()
      } catch (e) {
        reject(e)
        return
      }

      try {
        const pid = await checkPid()
        resolve({
          'APP-Service-Start-PID': pid
        })
        const ownerEmail = opt['N8N_OWNER_EMAIL']?.trim()
        const ownerPassword = opt['N8N_OWNER_PASSWORD']?.trim()
        const n8nPort = opt['N8N_PORT']?.trim() || '5678'
        const dbFile = join(effectiveDataDir, 'database.sqlite')
        if (ownerEmail && ownerPassword && !existsSync(dbFile)) {
          this._autoSetupOwner(n8nPort, ownerEmail, ownerPassword, on).catch(() => {})
        }
      } catch (e: any) {
        reject(e)
      }
    })
  }

  /**
   * Delete the n8n user database to allow fresh owner setup on next start.
   * Workflows and node credentials stored in the DB are also removed,
   * but the workflow JSON exports and binary data remain intact.
   */
  resetOwnerDB(): ForkPromise<void> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const dataDir = await resolveDataDir()
        const dbFile = join(dataDir, 'database.sqlite')
        if (existsSync(dbFile)) await remove(dbFile)

        // n8n < 1.x stored user management state here
        const umFile = join(dataDir, '.n8n-user-management.json')
        if (existsSync(umFile)) await remove(umFile)

        resolve()
      } catch (e: any) {
        reject(e)
      }
    })
  }

  /**
   * Auto-configure the n8n owner account on first start.
   * Polls until n8n HTTP is ready, checks if setup wizard is pending,
   * then POSTs credentials to the owner setup endpoint.
   */
  async _autoSetupOwner(port: string, email: string, password: string, on: any): Promise<void> {
    let ready = false
    for (let i = 0; i < 30; i++) {
      await new Promise<void>((r) => setTimeout(r, 2000))
      try {
        const res = await axios({
          url: `http://127.0.0.1:${port}/healthz`,
          method: 'get',
          timeout: 3000,
          httpAgent: new http.Agent({ keepAlive: false }),
          proxy: false as any
        })
        if (res.status === 200) {
          ready = true
          break
        }
      } catch {}
    }
    if (!ready) return
    try {
      await axios({
        url: `http://127.0.0.1:${port}/rest/owner/setup`,
        method: 'post',
        timeout: 10000,
        httpAgent: new http.Agent({ keepAlive: false }),
        proxy: false as any,
        data: { email, firstName: 'n8n', lastName: 'Admin', password }
      })
      on({ 'APP-On-Log': AppLog('info', 'n8n: Owner account configured successfully') })
    } catch (e: any) {
      const status = e?.response?.status
      if (status === 400 || status === 401 || status === 403) {
        // 400/401/403 = owner already set up — not an error
        on({ 'APP-On-Log': AppLog('info', 'n8n: Owner account already configured') })
      } else {
        on({ 'APP-On-Log': AppLog('info', `n8n: Auto owner setup: ${e?.message ?? String(e)}`) })
      }
    }
  }

  /**
   * Fetch available n8n versions from npm registry
   */
  fetchAllOnlineVersion() {
    return fetchAllOnlineVersion.call(this)
  }

  allInstalledVersions() {
    return allInstalledVersions.call(this)
  }

  /**
   * Check if n8n is accessible — first tries HTTP health endpoint,
   * then falls back to port-listener check so we also detect processes
   * that were started outside FlyEnv.
   */
  checkRunning(): ForkPromise<{ running: boolean; pid: string; status: number }> {
    return new ForkPromise(async (resolve) => {
      const port = await getPort()

      // 1. HTTP health check
      try {
        const res = await axios({
          url: `http://127.0.0.1:${port}/healthz`,
          method: 'get',
          timeout: 3000,
          withCredentials: false,
          httpAgent: new http.Agent({ keepAlive: false }),
          proxy: false as any
        })
        if (res.status === 200) {
          // Also grab the PID via port listener so the UI can track it
          let pid = ''
          try {
            if (isWindows()) {
              const pids = await fetchProcessPidByPort(port)
              if (pids.length > 0) pid = pids[0]
            } else {
              const r = await execPromise(`lsof -ti :${port}`)
              pid = r.stdout.trim().split('\n').filter(Boolean)[0] ?? ''
            }
          } catch {}
          resolve({ running: true, pid, status: res.status })
          return
        }
      } catch {}

      // 2. Port-listener fallback (process running but not yet serving HTTP)
      try {
        let pids: string[] = []
        if (isWindows()) {
          pids = await fetchProcessPidByPort(port)
        } else {
          pids = (await fetchPidByPort(port)).map((p) => p.PID)
        }
        if (pids.length > 0) {
          resolve({ running: true, pid: pids[0], status: 0 })
          return
        }
      } catch {}

      resolve({ running: false, pid: '', status: 0 })
    })
  }

  /**
   * Get n8n version from running instance
   */
  getRunningVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const { port } = await getN8nConfig()
        const url = `http://127.0.0.1:${port}/api/v1/info`
        const res = await axios({
          url,
          method: 'get',
          timeout: 3000,
          withCredentials: false,
          httpAgent: new http.Agent({ keepAlive: false }),
          proxy: false as any
        })
        resolve({ version: res?.data?.n8n?.version ?? '' })
      } catch {
        resolve({ version: '' })
      }
    })
  }

  /** POST /rest/login → return session cookie string.
   *  n8n v1.32+ requires a `browserId` UUID for CSRF protection.
   */
  async _n8nLogin(port: string, email: string, password: string): Promise<string> {
    // Generate a stable-ish browserId — n8n only validates that it is present and a string
    const browserId = `flyenv-${port}-${Buffer.from(email).toString('base64').slice(0, 12)}`
    let res: any
    try {
      res = await axios({
        url: `http://127.0.0.1:${port}/rest/login`,
        method: 'post',
        timeout: 10000,
        httpAgent: new http.Agent({ keepAlive: false }),
        proxy: false as any,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        data: { emailOrLdapLoginId: email, password, browserId }
      })
    } catch (e: any) {
      const body = e?.response?.data
      const msg = body?.message ?? body?.error ?? JSON.stringify(body)
      throw new Error(`n8n login failed (${e?.response?.status ?? 'network'}): ${msg ?? e.message}`)
    }
    const setCookie = (res.headers['set-cookie'] as string[] | undefined) ?? []
    if (setCookie.length === 0) throw new Error('Login failed: no session cookie returned')
    return setCookie.map((c: string) => c.split(';')[0]).join('; ')
  }

  // ── User management methods (delegated to database.ts) ────────────────────

  userList = userList
  userDelete = userDelete
  userSetDisabled = userSetDisabled
  userSetRole = userSetRole
  userSetName = userSetName
  userResetPassword = userResetPassword
  userCreate = userCreate

  /**
   * Change the owner's password by writing a bcrypt hash directly into the SQLite database.
   * Works offline — n8n does not need to be running.
   * Also updates N8N_OWNER_PASSWORD in the env file for parity.
   */
  userChangeOwnerPassword(newPassword: string): ForkPromise<void> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        if (!newPassword) throw new Error('New password is required')
        const { email } = await getN8nConfig()
        if (!email) throw new Error('N8N_OWNER_EMAIL not configured in env file')

        await userChangeOwnerPassword(newPassword, email)

        // Keep stored password in sync
        const envFile = getEnvFilePath()
        if (existsSync(envFile)) {
          let content = await readFile(envFile, 'utf-8')
          if (/^N8N_OWNER_PASSWORD=/m.test(content)) {
            content = content.replace(
              /^N8N_OWNER_PASSWORD=.*/m,
              `N8N_OWNER_PASSWORD="${newPassword}"`
            )
          } else {
            content = content.replace(
              /^# N8N_OWNER_PASSWORD=.*/m,
              `N8N_OWNER_PASSWORD="${newPassword}"`
            )
          }
          await writeFile(envFile, content)
        }
        resolve()
      } catch (e: any) {
        reject(e)
      }
    })
  }

  /** Return the current N8N_USER_FOLDER path (or n8n's OS-native default ~/.n8n if not set). */
  getDataDir(): ForkPromise<{ path: string }> {
    return new ForkPromise(async (resolve) => {
      const path = await resolveDataDir()
      resolve({ path })
    })
  }

  /** Update N8N_USER_FOLDER in the env file and create the directory if needed. */
  setDataDir(newPath: string): ForkPromise<void> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const envFile = getEnvFilePath()
        await mkdirp(newPath)
        let content = existsSync(envFile) ? await readFile(envFile, 'utf-8') : ''
        const escaped = `N8N_USER_FOLDER="${newPath}"`
        if (/^N8N_USER_FOLDER=/m.test(content)) {
          content = content.replace(/^N8N_USER_FOLDER=.*/m, escaped)
        } else if (/^# N8N_USER_FOLDER=/m.test(content)) {
          content = content.replace(/^# N8N_USER_FOLDER=.*/m, escaped)
        } else {
          content = escaped + '\n' + content
        }
        await writeFile(envFile, content)
        resolve()
      } catch (e: any) {
        reject(e)
      }
    })
  }

  /**
   * Scan common locations on the system where n8n might store its data.
   * Returns every candidate path that actually contains a database.sqlite file.
   */
  scanDataDir(): ForkPromise<string[]> {
    return new ForkPromise(async (resolve) => {
      const candidates: string[] = []
      const { readEnvValue } = await import('./utils')

      // ── Fixed / env-based candidates ─────────────────────────────────────

      // 1. OS-native default ~/.n8n
      candidates.push(join(homedir(), '.n8n'))

      // 2. N8N_USER_FOLDER env var (set outside FlyEnv)
      if (process.env['N8N_USER_FOLDER']) {
        candidates.push(process.env['N8N_USER_FOLDER'])
      }

      // 3. Path from our own env file
      const userFolder = await readEnvValue('N8N_USER_FOLDER')
      if (userFolder) candidates.push(userFolder)

      // ── Filesystem search ─────────────────────────────────────────────────

      if (isWindows()) {
        // a. Well-known per-user AppData locations for the current user
        const appData = process.env['APPDATA']
        const localApp = process.env['LOCALAPPDATA']
        const programData = process.env['PROGRAMDATA']
        const userProfile = process.env['USERPROFILE'] ?? homedir()
        if (appData) candidates.push(join(appData, 'n8n'))
        if (localApp) candidates.push(join(localApp, 'n8n'))
        if (programData) candidates.push(join(programData, 'n8n'))
        candidates.push(join(userProfile, 'n8n'))
        candidates.push(join(userProfile, 'AppData', 'Roaming', 'n8n'))
        candidates.push(join(userProfile, 'AppData', 'Local', 'n8n'))

        // b. Scan ALL user profiles under C:\Users\*\.n8n and nearby
        try {
          const usersRoot = 'C:\\Users'
          if (existsSync(usersRoot)) {
            for (const profile of readdirSync(usersRoot)) {
              candidates.push(join(usersRoot, profile, '.n8n'))
              candidates.push(join(usersRoot, profile, 'n8n'))
              candidates.push(join(usersRoot, profile, 'AppData', 'Roaming', 'n8n'))
              candidates.push(join(usersRoot, profile, 'AppData', 'Local', 'n8n'))
            }
          }
        } catch {}

        // c. Root of common drive letters
        for (const drive of ['C:', 'D:', 'E:', 'F:']) {
          candidates.push(join(drive + '\\', 'n8n'))
          candidates.push(join(drive + '\\', '.n8n'))
        }

        // d. nvm / nvm4w adjacent user-data dirs
        const nvmHome = process.env['NVM_HOME'] ?? process.env['NVM_SYMLINK']
        if (nvmHome) {
          candidates.push(join(nvmHome, '..', '.n8n'))
        }
      } else {
        // Unix / macOS
        candidates.push('/var/lib/n8n')
        candidates.push(join(homedir(), 'n8n'))
        try {
          if (existsSync('/home')) {
            for (const u of readdirSync('/home')) {
              candidates.push(join('/home', u, '.n8n'))
            }
          }
        } catch {}
      }

      // ── Deduplicate and return only paths with database.sqlite ────────────
      const seen = new Set<string>()
      const found: string[] = []
      for (const p of candidates) {
        if (!p || seen.has(p)) continue
        seen.add(p)
        try {
          if (existsSync(join(p, 'database.sqlite'))) found.push(p)
        } catch {}
      }

      resolve(found)
    })
  }
}

export default new N8N()
