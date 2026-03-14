import { join } from 'path'
import { existsSync, realpathSync, readdirSync } from 'fs'
import { EOL, homedir, tmpdir } from 'os'
import { Base } from '../Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  execPromise,
  versionBinVersion,
  versionFixed,
  versionSort,
  mkdirp,
  readFile,
  writeFile,
  remove,
  serviceStartExec,
  serviceStartExecCMD
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { I18nT } from '@lang/index'
import { isWindows } from '@shared/utils'
import { ProcessListSearch, fetchProcessPidByPort } from '@shared/Process.win'
import { execPromise as execPromiseShared } from '@shared/child-process'
import TaskQueue from '../../TaskQueue'
import axios from 'axios'
import http from 'http'
import https from 'https'

class N8N extends Base {
  constructor() {
    super()
    this.type = 'n8n'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'n8n/n8n.pid')
  }

  _stopServer(version: SoftInstalled): ForkPromise<{ 'APP-Service-Stop-PID': string[] }> {
    if (!isWindows()) {
      return super._stopServer(version) as any
    }
    return new ForkPromise(async (resolve, _reject, on) => {
      on({ 'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceBegin', { service: this.type })) })

      // Read N8N_PORT from config (default 5678)
      let port = '5678'
      try {
        const envFile = join(global.Server.BaseDir!, 'n8n/n8n.env')
        if (existsSync(envFile)) {
          const content = await readFile(envFile, 'utf-8')
          const match = content.split('\n').find((l) => l.trim().startsWith('N8N_PORT='))
          if (match) port = match.trim().split('=')[1]?.trim() || '5678'
        }
      } catch {}

      const allPid = new Set<string>()

      // 1. Kill by saved pid file (cmd.exe wrapper + its children)
      try {
        const appPidFile = join(global.Server.BaseDir!, `pid/${this.type}.pid`)
        if (existsSync(appPidFile)) {
          const savedPid = (await readFile(appPidFile, 'utf-8')).trim()
          if (savedPid) {
            const tree = await ProcessListSearch(savedPid, false)
            tree.forEach((p) => allPid.add(p.PID!))
            allPid.add(savedPid)
          }
        }
      } catch {}

      // 2. Kill by port — most reliable: finds node.exe actually listening
      try {
        const portPids = await fetchProcessPidByPort(port)
        for (const pid of portPids) {
          const tree = await ProcessListSearch(pid, false)
          tree.forEach((p) => allPid.add(p.PID!))
          allPid.add(pid)
        }
      } catch {}

      // 3. Kill any node.exe whose command contains '\n8n\'
      try {
        const n8nProcs = await ProcessListSearch('\\n8n\\', false)
        n8nProcs.forEach((p) => allPid.add(p.PID!))
      } catch {}

      const arr = Array.from(allPid).filter(Boolean)
      if (arr.length > 0) {
        try {
          await execPromiseShared(`taskkill /f /t /pid ${arr.join(' /pid ')}`, {
            shell: 'cmd.exe'
          })
        } catch {}
      }

      // Clean up pid files
      try {
        const appPidFile = join(global.Server.BaseDir!, `pid/${this.type}.pid`)
        if (existsSync(appPidFile)) await remove(appPidFile)
      } catch {}
      try {
        if (existsSync(this.pidPath)) await remove(this.pidPath)
      } catch {}

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
        const defaultContent = [
          '# n8n Environment Configuration',
          '# https://docs.n8n.io/hosting/configuration/environment-variables/',
          '',
          '# N8N_PORT=5678',
          '# N8N_HOST=localhost',
          '# N8N_PROTOCOL=http',
          '# N8N_PATH=/',
          '',
          '# N8N_USER_FOLDER=',
          '',
          '# N8N_SKIP_OWNER_SETUP=false',
          '',
          '# N8N_OWNER_EMAIL=',
          '# N8N_OWNER_PASSWORD=',
          '',
          '# DB_TYPE=sqlite',
          '# DB_SQLITE_DATABASE=',
          '',
          '# EXECUTIONS_PROCESS=main',
          '# EXECUTIONS_MODE=regular',
          '',
          '# N8N_BASIC_AUTH_ACTIVE=false',
          '# N8N_BASIC_AUTH_USER=',
          '# N8N_BASIC_AUTH_PASSWORD=',
          '',
          '# N8N_ENCRYPTION_KEY=',
          '',
          '# WEBHOOK_URL=',
          '',
          '# N8N_LOG_LEVEL=info',
          '# N8N_LOG_OUTPUT=console',
          ''
        ].join('\n')
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

      // Parse env file into key-value dict (skip comments and empty lines)
      const getConfEnv = async (): Promise<Record<string, string>> => {
        try {
          const content = await readFile(envFile, 'utf-8')
          const dict: Record<string, string> = {}
          content
            .split('\n')
            .filter((s) => {
              const str = s.trim()
              return !!str && !str.startsWith('#')
            })
            .forEach((s) => {
              const item = s.trim().split('=')
              const k = item.shift()
              const v = item.join('=').replace(/^["']|["']$/g, '')
              if (k) dict[k] = v
            })
          return dict
        } catch {
          return {}
        }
      }

      const opt = await getConfEnv()

      // Resolve the effective data directory:
      // 1. Use N8N_USER_FOLDER from env file if explicitly set.
      // 2. Otherwise fall back to n8n's OS-native default: ~/.n8n
      const nativeDefault = join(homedir(), '.n8n')
      const effectiveDataDir = opt['N8N_USER_FOLDER'] || nativeDefault

      if (isWindows()) {
        // n8n is a .cmd script — use the standard FlyEnv CMD launcher which
        // creates proper log files and redirects n8n's stdout/stderr.
        const envs: string[] = []
        for (const k in opt) {
          envs.push(`SET ${k}=${opt[k]}`)
        }
        envs.push('')
        const execEnv = envs.join('\r\n')
        try {
          const res = await serviceStartExecCMD({
            version,
            pidPath: this.pidPath,
            baseDir,
            bin,
            execArgs: 'start',
            execEnv,
            on,
            checkPidFile: false
          })
          resolve(res)
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
      } else {
        const envs: string[] = []
        for (const k in opt) {
          const v = opt[k]
          envs.push(`export ${k}="${v}"`)
        }
        envs.push('')
        const execEnv = envs.join(EOL)
        try {
          const res = await serviceStartExec({
            version,
            pidPath: this.pidPath,
            baseDir,
            bin,
            execArgs: 'start',
            execEnv,
            on
          })
          resolve(res)
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
        const baseDir = join(global.Server.BaseDir!, 'n8n')
        const envFile = join(baseDir, 'n8n.env')
        // Default to OS-native ~/.n8n, honour explicit N8N_USER_FOLDER if set
        let dataDir = join(homedir(), '.n8n')

        try {
          if (existsSync(envFile)) {
            const content = await readFile(envFile, 'utf-8')
            const match = content.split('\n').find((l) => l.trim().startsWith('N8N_USER_FOLDER='))
            if (match) {
              const val = match
                .trim()
                .split('=')
                .slice(1)
                .join('=')
                .trim()
                .replace(/^["']|["']$/g, '')
              if (val) dataDir = val
            }
          }
        } catch {}

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
          url: `http://localhost:${port}/healthz`,
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
        url: `http://localhost:${port}/rest/owner/setup`,
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
    return new ForkPromise(async (resolve) => {
      try {
        const res = await axios({
          url: 'https://registry.npmjs.org/n8n',
          method: 'get',
          timeout: 30000,
          withCredentials: false,
          httpAgent: new http.Agent({ keepAlive: false }),
          httpsAgent: new https.Agent({ keepAlive: false }),
          proxy: this.getAxiosProxy()
        })
        const allVersions: string[] = Object.keys(res?.data?.versions ?? {})
        // Keep last 20 stable versions (exclude beta/alpha/rc)
        const stable = allVersions
          .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
          .sort((a, b) => {
            const ap = a.split('.').map(Number)
            const bp = b.split('.').map(Number)
            for (let i = 0; i < 3; i++) {
              if ((bp[i] ?? 0) !== (ap[i] ?? 0)) return (bp[i] ?? 0) - (ap[i] ?? 0)
            }
            return 0
          })
          .slice(0, 20)

        const list: OnlineVersionItem[] = stable.map((v) => ({
          url: `https://www.npmjs.com/package/n8n/v/${v}`,
          version: v,
          mVersion: v.split('.').slice(0, 2).join('.')
        }))
        resolve(list)
      } catch (e) {
        console.log('n8n fetchAllOnlineVersion err:', e)
        resolve([])
      }
    })
  }

  allInstalledVersions(_flags: any, _setup: any) {
    return new ForkPromise(async (resolve) => {
      const list: SoftInstalled[] = []
      const seen = new Set<string>()

      const candidates: string[] = []

      if (isWindows()) {
        const appData = process.env.APPDATA ?? ''
        const userProfile = process.env.USERPROFILE ?? ''
        if (appData) candidates.push(join(appData, 'npm', 'n8n.cmd'))
        if (userProfile)
          candidates.push(join(userProfile, 'AppData', 'Roaming', 'npm', 'n8n.cmd'))
      } else {
        candidates.push('/usr/local/bin/n8n')
        candidates.push('/usr/bin/n8n')
        candidates.push('/opt/homebrew/bin/n8n')
        const home = process.env.HOME ?? ''
        if (home) {
          candidates.push(join(home, '.npm-global', 'bin', 'n8n'))
          candidates.push(join(home, '.yarn', 'bin', 'n8n'))
          candidates.push(join(home, '.volta', 'bin', 'n8n'))
          candidates.push(join(home, '.nvm', 'default', 'bin', 'n8n'))
        }
      }

      // PATH lookup
      try {
        const cmd = isWindows() ? 'where n8n' : 'which n8n'
        const result = await execPromise(cmd)
        const found = result?.stdout?.trim().split('\n')[0]?.trim()
        if (found && !candidates.includes(found)) {
          candidates.push(found)
        }
      } catch {}

      for (const bin of candidates) {
        if (!existsSync(bin) || seen.has(bin)) continue
        seen.add(bin)
        try {
          const versionResult = await TaskQueue.run(
            versionBinVersion,
            bin,
            `"${bin}" --version`,
            /(.*?)(\d+(\.\d+){1,4})(.*?)/g
          )
          const versionStr = versionResult?.version
          if (!versionStr) continue
          const fixed = versionFixed(versionStr)
          list.push({
            typeFlag: 'n8n',
            bin,
            path: join(bin, '../..'),
            version: fixed,
            num: parseFloat(fixed),
            enable: true,
            run: false,
            running: false
          } as SoftInstalled)
        } catch {}
      }

      resolve(versionSort(list))
    })
  }

  /**
   * Check if n8n is accessible — first tries HTTP health endpoint,
   * then falls back to port-listener check so we also detect processes
   * that were started outside FlyEnv.
   */
  checkRunning(_version?: SoftInstalled): ForkPromise<{ running: boolean; pid: string; status: number }> {
    return new ForkPromise(async (resolve) => {
      // Determine port from config (default 5678)
      let port = '5678'
      try {
        const envFile = join(global.Server.BaseDir!, 'n8n/n8n.env')
        if (existsSync(envFile)) {
          const content = await readFile(envFile, 'utf-8')
          const match = content.split('\n').find((l) => l.trim().startsWith('N8N_PORT='))
          if (match) port = match.trim().split('=')[1]?.trim() || '5678'
        }
      } catch {}

      // 1. HTTP health check
      try {
        const res = await axios({
          url: `http://localhost:${port}/healthz`,
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
          const r = await execPromise(`lsof -ti :${port}`)
          pids = r.stdout.trim().split('\n').filter(Boolean)
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
        const res = await axios({
          url: 'http://localhost:5678/api/v1/info',
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

  // ── User management helpers ──────────────────────────────────────────────

  /** Read N8N_PORT / N8N_OWNER_EMAIL / N8N_OWNER_PASSWORD from the env file. */
  async _getN8nConfig(): Promise<{ port: string; email: string; password: string }> {
    const envFile = join(global.Server.BaseDir!, 'n8n/n8n.env')
    let port = '5678'
    let email = ''
    let password = ''
    try {
      if (existsSync(envFile)) {
        const content = await readFile(envFile, 'utf-8')
        for (const line of content.split('\n')) {
          const t = line.trim()
          if (!t || t.startsWith('#')) continue
          const eqIdx = t.indexOf('=')
          if (eqIdx < 0) continue
          const k = t.slice(0, eqIdx).trim()
          const v = t
            .slice(eqIdx + 1)
            .trim()
            .replace(/^["']|["']$/g, '')
          if (k === 'N8N_PORT') port = v
          else if (k === 'N8N_OWNER_EMAIL') email = v
          else if (k === 'N8N_OWNER_PASSWORD') password = v
        }
      }
    } catch {}
    return { port, email, password }
  }

  /** Resolve the effective N8N_USER_FOLDER (falls back to OS-native ~/.n8n). */
  async _resolveDataDir(): Promise<string> {
    const nativeDefault = join(homedir(), '.n8n')
    const envFile = join(global.Server.BaseDir!, 'n8n/n8n.env')
    try {
      if (existsSync(envFile)) {
        const content = await readFile(envFile, 'utf-8')
        for (const line of content.split('\n')) {
          const t = line.trim()
          if (!t || t.startsWith('#')) continue
          const eqIdx = t.indexOf('=')
          if (eqIdx < 0) continue
          const k = t.slice(0, eqIdx).trim()
          const v = t.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
          if (k === 'N8N_USER_FOLDER' && v) return v
        }
      }
    } catch {}
    return nativeDefault
  }

  /**
   * Resolve the path to n8n's bundled node_modules directory.
   * n8n ships sqlite3 and bcryptjs inside its own node_modules.
   */
  async _resolveN8nModulesDir(): Promise<string | null> {
    try {
      const cmd = isWindows() ? 'where n8n.cmd' : 'which n8n'
      const result = await execPromise(cmd)
      const binPath = result.stdout.trim().split('\n')[0].trim()
      if (isWindows()) {
        // binPath = C:\...\nodejs\n8n.cmd → modules at C:\...\nodejs\node_modules\n8n\node_modules
        const candidate = join(binPath, '..', 'node_modules', 'n8n', 'node_modules')
        if (existsSync(candidate)) return candidate
      } else {
        // n8n binary is usually a symlink — resolve it first
        const real: string = realpathSync(binPath) // e.g. /usr/local/lib/node_modules/n8n/bin/n8n
        const candidate = join(real, '..', '..', 'node_modules')
        if (existsSync(candidate)) return candidate
      }
    } catch {}
    return null
  }

  /**
   * Write a JS script to a temp file, execute it with the system `node`, return stdout.
   * Using a temp file avoids all shell quoting/escaping issues.
   * The system `node` has the correct ABI for n8n's native sqlite3 binding.
   */
  async _runNodeScript(script: string): Promise<string> {
    const tmpFile = join(tmpdir(), `flyenv-n8n-${Date.now()}.js`)
    await writeFile(tmpFile, script, 'utf-8')
    try {
      const result = await execPromise(`node "${tmpFile}"`)
      return result.stdout ?? ''
    } finally {
      try { await remove(tmpFile) } catch {}
    }
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
        url: `http://localhost:${port}/rest/login`,
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

  /** List all n8n users by reading directly from the SQLite database.
   *  Works offline — n8n does not need to be running, no credentials required.
   */
  userList(): ForkPromise<any[]> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const dataDir = await this._resolveDataDir()
        const dbFile = join(dataDir, 'database.sqlite')
        if (!existsSync(dbFile)) {
          resolve([])
          return
        }

        const n8nModules = await this._resolveN8nModulesDir()
        const sqlite3Path = n8nModules ? join(n8nModules, 'sqlite3', 'lib', 'sqlite3.js') : ''
        if (!sqlite3Path || !existsSync(sqlite3Path)) {
          throw new Error(
            'Could not find sqlite3 module in n8n installation. Please make sure n8n is installed globally (npm install -g n8n).'
          )
        }

        const script = `
const sqlite3 = require(${JSON.stringify(sqlite3Path)});
const d = new sqlite3.Database(${JSON.stringify(dbFile)}, sqlite3.OPEN_READONLY, function(err) {
  if (err) { process.stderr.write(err.message); process.exit(1); }
  d.all(
    'SELECT id, email, firstName, lastName, roleSlug, disabled, (CASE WHEN (password IS NULL OR password = \\'\\') THEN 1 ELSE 0 END) AS isPending FROM user',
    [],
    function(err2, rows) {
      if (err2) { process.stderr.write(err2.message); process.exit(1); }
      process.stdout.write(JSON.stringify(rows || []));
      d.close(function() { process.exit(0); });
    }
  );
});`
        const output = await this._runNodeScript(script)
        resolve(JSON.parse(output))
      } catch (e: any) {
        reject(e)
      }
    })
  }

  /** Delete an n8n user by ID. */
  /**
   * Delete an n8n user by writing directly to the SQLite database.
   * Works offline — n8n does not need to be running, no credentials required.
   * Refuses to delete the global:owner account.
   */
  userDelete(userId: string): ForkPromise<void> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        if (!userId) throw new Error('User ID is required')
        const dataDir = await this._resolveDataDir()
        const dbFile = join(dataDir, 'database.sqlite')
        if (!existsSync(dbFile)) throw new Error('n8n database not found at ' + dbFile)

        const n8nModules = await this._resolveN8nModulesDir()
        const sqlite3Path = n8nModules ? join(n8nModules, 'sqlite3', 'lib', 'sqlite3.js') : ''
        if (!sqlite3Path || !existsSync(sqlite3Path)) {
          throw new Error('Could not find sqlite3 module in n8n installation')
        }

        const script = `
const sqlite3 = require(${JSON.stringify(sqlite3Path)});
const userId  = ${JSON.stringify(userId)};
const d = new sqlite3.Database(${JSON.stringify(dbFile)}, function(err) {
  if (err) { process.stderr.write(err.message); process.exit(1); }
  d.get('SELECT id, roleSlug FROM user WHERE id = ?', [userId], function(err2, row) {
    if (err2) { process.stderr.write(err2.message); process.exit(1); }
    if (!row) { process.stderr.write('User not found'); process.exit(1); }
    if (row.roleSlug === 'global:owner') { process.stderr.write('Cannot delete the owner account'); process.exit(1); }
    d.run('DELETE FROM user WHERE id = ?', [userId], function(err3) {
      if (err3) { process.stderr.write(err3.message); process.exit(1); }
      process.stdout.write('ok');
      d.close(function() { process.exit(0); });
    });
  });
});
`
        await this._runNodeScript(script)
        resolve()
      } catch (e: any) {
        reject(e)
      }
    })
  }

  /** Enable or disable an n8n user (SQLite direct write). Refuses to disable the owner. */
  userSetDisabled(userId: string, disabled: boolean): ForkPromise<void> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        if (!userId) throw new Error('User ID is required')
        const dataDir = await this._resolveDataDir()
        const dbFile = join(dataDir, 'database.sqlite')
        if (!existsSync(dbFile)) throw new Error('n8n database not found at ' + dbFile)
        const n8nModules = await this._resolveN8nModulesDir()
        const sqlite3Path = n8nModules ? join(n8nModules, 'sqlite3', 'lib', 'sqlite3.js') : ''
        if (!sqlite3Path || !existsSync(sqlite3Path)) throw new Error('Could not find sqlite3 module in n8n installation')
        const script = `
const sqlite3 = require(${JSON.stringify(sqlite3Path)});
const userId  = ${JSON.stringify(userId)};
const disabled = ${disabled ? 1 : 0};
const now = new Date().toISOString().replace('T', ' ').slice(0, 23);
const d = new sqlite3.Database(${JSON.stringify(dbFile)}, function(err) {
  if (err) { process.stderr.write(err.message); process.exit(1); }
  d.get('SELECT roleSlug FROM user WHERE id = ?', [userId], function(err2, row) {
    if (err2) { process.stderr.write(err2.message); process.exit(1); }
    if (!row) { process.stderr.write('User not found'); process.exit(1); }
    if (row.roleSlug === 'global:owner') { process.stderr.write('Cannot disable the owner account'); process.exit(1); }
    d.run('UPDATE user SET disabled = ?, updatedAt = ? WHERE id = ?', [disabled, now, userId], function(err3) {
      if (err3) { process.stderr.write(err3.message); process.exit(1); }
      process.stdout.write('ok');
      d.close(function() { process.exit(0); });
    });
  });
});
`
        await this._runNodeScript(script)
        resolve()
      } catch (e: any) {
        reject(e)
      }
    })
  }

  /** Change an n8n user's role (SQLite direct write). Refuses to change the owner's role. */
  userSetRole(userId: string, roleSlug: string): ForkPromise<void> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        if (!userId) throw new Error('User ID is required')
        if (!roleSlug) throw new Error('Role is required')
        const dataDir = await this._resolveDataDir()
        const dbFile = join(dataDir, 'database.sqlite')
        if (!existsSync(dbFile)) throw new Error('n8n database not found at ' + dbFile)
        const n8nModules = await this._resolveN8nModulesDir()
        const sqlite3Path = n8nModules ? join(n8nModules, 'sqlite3', 'lib', 'sqlite3.js') : ''
        if (!sqlite3Path || !existsSync(sqlite3Path)) throw new Error('Could not find sqlite3 module in n8n installation')
        const script = `
const sqlite3 = require(${JSON.stringify(sqlite3Path)});
const userId   = ${JSON.stringify(userId)};
const roleSlug = ${JSON.stringify(roleSlug)};
const now = new Date().toISOString().replace('T', ' ').slice(0, 23);
const d = new sqlite3.Database(${JSON.stringify(dbFile)}, function(err) {
  if (err) { process.stderr.write(err.message); process.exit(1); }
  d.get('SELECT roleSlug FROM user WHERE id = ?', [userId], function(err2, row) {
    if (err2) { process.stderr.write(err2.message); process.exit(1); }
    if (!row) { process.stderr.write('User not found'); process.exit(1); }
    if (row.roleSlug === 'global:owner') { process.stderr.write('Cannot change the owner role'); process.exit(1); }
    d.run('UPDATE user SET roleSlug = ?, updatedAt = ? WHERE id = ?', [roleSlug, now, userId], function(err3) {
      if (err3) { process.stderr.write(err3.message); process.exit(1); }
      process.stdout.write('ok');
      d.close(function() { process.exit(0); });
    });
  });
});
`
        await this._runNodeScript(script)
        resolve()
      } catch (e: any) {
        reject(e)
      }
    })
  }

  /** Update an n8n user's first/last name (SQLite direct write). */
  userSetName(userId: string, firstName: string, lastName: string): ForkPromise<void> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        if (!userId) throw new Error('User ID is required')
        const dataDir = await this._resolveDataDir()
        const dbFile = join(dataDir, 'database.sqlite')
        if (!existsSync(dbFile)) throw new Error('n8n database not found at ' + dbFile)
        const n8nModules = await this._resolveN8nModulesDir()
        const sqlite3Path = n8nModules ? join(n8nModules, 'sqlite3', 'lib', 'sqlite3.js') : ''
        if (!sqlite3Path || !existsSync(sqlite3Path)) throw new Error('Could not find sqlite3 module in n8n installation')
        const script = `
const sqlite3   = require(${JSON.stringify(sqlite3Path)});
const userId    = ${JSON.stringify(userId)};
const firstName = ${JSON.stringify(firstName || '')};
const lastName  = ${JSON.stringify(lastName || '')};
const now = new Date().toISOString().replace('T', ' ').slice(0, 23);
const d = new sqlite3.Database(${JSON.stringify(dbFile)}, function(err) {
  if (err) { process.stderr.write(err.message); process.exit(1); }
  d.run('UPDATE user SET firstName = ?, lastName = ?, updatedAt = ? WHERE id = ?', [firstName, lastName, now, userId], function(err2) {
    if (err2) { process.stderr.write(err2.message); process.exit(1); }
    process.stdout.write('ok');
    d.close(function() { process.exit(0); });
  });
});
`
        await this._runNodeScript(script)
        resolve()
      } catch (e: any) {
        reject(e)
      }
    })
  }

  /** Reset any n8n user's password by bcrypt-hashing and writing directly to SQLite. */
  userResetPassword(userId: string, newPassword: string): ForkPromise<void> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        if (!userId) throw new Error('User ID is required')
        if (!newPassword) throw new Error('Password is required')
        const dataDir = await this._resolveDataDir()
        const dbFile = join(dataDir, 'database.sqlite')
        if (!existsSync(dbFile)) throw new Error('n8n database not found at ' + dbFile)
        const n8nModules = await this._resolveN8nModulesDir()
        const sqlite3Path = n8nModules ? join(n8nModules, 'sqlite3', 'lib', 'sqlite3.js') : ''
        const bcryptPath = n8nModules ? join(n8nModules, 'bcryptjs', 'index.js') : ''
        if (!sqlite3Path || !existsSync(sqlite3Path)) throw new Error('Could not find sqlite3 module in n8n installation')
        if (!bcryptPath || !existsSync(bcryptPath)) throw new Error('Could not find bcryptjs module in n8n installation')
        const script = `
const sqlite3 = require(${JSON.stringify(sqlite3Path)});
const bcrypt  = require(${JSON.stringify(bcryptPath)});
const userId  = ${JSON.stringify(userId)};
const hash    = bcrypt.hashSync(${JSON.stringify(newPassword)}, 10);
const now     = new Date().toISOString().replace('T', ' ').slice(0, 23);
const d = new sqlite3.Database(${JSON.stringify(dbFile)}, function(err) {
  if (err) { process.stderr.write(err.message); process.exit(1); }
  d.run('UPDATE user SET password = ?, updatedAt = ? WHERE id = ?', [hash, now, userId], function(err2) {
    if (err2) { process.stderr.write(err2.message); process.exit(1); }
    process.stdout.write('ok');
    d.close(function() { process.exit(0); });
  });
});
`
        await this._runNodeScript(script)
        resolve()
      } catch (e: any) {
        reject(e)
      }
    })
  }

  /**
   * Create a new n8n user by writing directly to the SQLite database.
   * Works offline — n8n does not need to be running, no owner credentials required.
   */
  userCreate(email: string, firstName: string, lastName: string, role: string, password: string): ForkPromise<any> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        if (!email) throw new Error('Email is required')
        if (!password) throw new Error('Password is required')
        const dataDir = await this._resolveDataDir()
        const dbFile = join(dataDir, 'database.sqlite')
        if (!existsSync(dbFile)) throw new Error('n8n database not found at ' + dbFile)

        const n8nModules = await this._resolveN8nModulesDir()
        const sqlite3Path = n8nModules ? join(n8nModules, 'sqlite3', 'lib', 'sqlite3.js') : ''
        const bcryptPath = n8nModules ? join(n8nModules, 'bcryptjs', 'index.js') : ''
        if (!sqlite3Path || !existsSync(sqlite3Path)) {
          throw new Error('Could not find sqlite3 module in n8n installation')
        }
        if (!bcryptPath || !existsSync(bcryptPath)) {
          throw new Error('Could not find bcryptjs module in n8n installation')
        }

        const script = `
const sqlite3   = require(${JSON.stringify(sqlite3Path)});
const bcrypt    = require(${JSON.stringify(bcryptPath)});
const email     = ${JSON.stringify(email)};
const firstName = ${JSON.stringify(firstName || '')};
const lastName  = ${JSON.stringify(lastName || '')};
const roleSlug  = ${JSON.stringify(role || 'global:member')};
const password  = ${JSON.stringify(password)};
const id  = require('crypto').randomUUID();
const hash = bcrypt.hashSync(password, 10);
const now  = new Date().toISOString().replace('T', ' ').slice(0, 23);
const d = new sqlite3.Database(${JSON.stringify(dbFile)}, function(err) {
  if (err) { process.stderr.write(err.message); process.exit(1); }
  d.get('SELECT id FROM user WHERE email = ?', [email], function(err2, row) {
    if (err2) { process.stderr.write(err2.message); process.exit(1); }
    if (row) { process.stderr.write('A user with this email already exists'); process.exit(1); }
    d.run(
      'INSERT INTO user (id, email, firstName, lastName, password, roleSlug, disabled, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)',
      [id, email, firstName, lastName, hash, roleSlug, now, now],
      function(err3) {
        if (err3) { process.stderr.write(err3.message); process.exit(1); }
        process.stdout.write(JSON.stringify({ id, email, firstName, lastName, roleSlug }));
        d.close(function() { process.exit(0); });
      }
    );
  });
});
`
        const output = await this._runNodeScript(script)
        resolve(JSON.parse(output))
      } catch (e: any) {
        reject(e)
      }
    })
  }

  /**
   * Change the owner's password by writing a bcrypt hash directly into the SQLite database.
   * Works offline — n8n does not need to be running.
   * Also updates N8N_OWNER_PASSWORD in the env file for parity.
   */
  userChangeOwnerPassword(newPassword: string): ForkPromise<void> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        if (!newPassword) throw new Error('New password is required')
        const dataDir = await this._resolveDataDir()
        const dbFile = join(dataDir, 'database.sqlite')
        const { email } = await this._getN8nConfig()
        if (!email) throw new Error('N8N_OWNER_EMAIL not configured in env file')

        const n8nModules = await this._resolveN8nModulesDir()
        const sqlite3Path = n8nModules ? join(n8nModules, 'sqlite3', 'lib', 'sqlite3.js') : ''
        const bcryptPath = n8nModules ? join(n8nModules, 'bcryptjs', 'index.js') : ''

        if (!sqlite3Path || !existsSync(sqlite3Path)) {
          throw new Error('Could not find sqlite3 module in n8n installation')
        }
        if (!bcryptPath || !existsSync(bcryptPath)) {
          throw new Error('Could not find bcryptjs module in n8n installation')
        }

        const script = `
const sqlite3 = require(${JSON.stringify(sqlite3Path)});
const bcrypt  = require(${JSON.stringify(bcryptPath)});
const email   = ${JSON.stringify(email)};
const next    = ${JSON.stringify(newPassword)};

const d = new sqlite3.Database(${JSON.stringify(dbFile)}, function(err) {
  if (err) { process.stderr.write(err.message); process.exit(1); }
  d.get('SELECT id FROM user WHERE email = ?', [email], function(err2, row) {
    if (err2 || !row) {
      process.stderr.write(err2 ? err2.message : 'User not found');
      process.exit(1);
    }
    const hash = bcrypt.hashSync(next, 10);
    const now  = new Date().toISOString().replace('T', ' ').slice(0, 23);
    d.run('UPDATE user SET password = ?, updatedAt = ? WHERE email = ?', [hash, now, email], function(err3) {
      if (err3) { process.stderr.write(err3.message); process.exit(1); }
      process.stdout.write('ok');
      d.close(function() { process.exit(0); });
    });
  });
});`
        await this._runNodeScript(script)

        // Keep stored password in sync
        const envFile = join(global.Server.BaseDir!, 'n8n/n8n.env')
        if (existsSync(envFile)) {
          let content = await readFile(envFile, 'utf-8')
          if (/^N8N_OWNER_PASSWORD=/m.test(content)) {
            content = content.replace(/^N8N_OWNER_PASSWORD=.*/m, `N8N_OWNER_PASSWORD="${newPassword}"`)
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
      const nativeDefault = join(homedir(), '.n8n')
      const envFile = join(global.Server.BaseDir!, 'n8n/n8n.env')
      let path = nativeDefault
      try {
        if (existsSync(envFile)) {
          const content = await readFile(envFile, 'utf-8')
          for (const line of content.split('\n')) {
            const t = line.trim()
            if (!t || t.startsWith('#')) continue
            const eqIdx = t.indexOf('=')
            if (eqIdx < 0) continue
            const k = t.slice(0, eqIdx).trim()
            const v = t
              .slice(eqIdx + 1)
              .trim()
              .replace(/^["']|["']$/g, '')
            if (k === 'N8N_USER_FOLDER' && v) {
              path = v
              break
            }
          }
        }
      } catch {}
      resolve({ path })
    })
  }

  /** Update N8N_USER_FOLDER in the env file and create the directory if needed. */
  setDataDir(newPath: string): ForkPromise<void> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const envFile = join(global.Server.BaseDir!, 'n8n/n8n.env')
        await mkdirp(newPath)
        let content = ''
        if (existsSync(envFile)) {
          content = await readFile(envFile, 'utf-8')
        }
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

      // ── Fixed / env-based candidates ─────────────────────────────────────

      // 1. OS-native default ~/.n8n
      candidates.push(join(homedir(), '.n8n'))

      // 2. N8N_USER_FOLDER env var (set outside FlyEnv)
      if (process.env['N8N_USER_FOLDER']) {
        candidates.push(process.env['N8N_USER_FOLDER'])
      }

      // 3. Path from our own env file
      try {
        const envFile = join(global.Server.BaseDir!, 'n8n/n8n.env')
        if (existsSync(envFile)) {
          const content = await readFile(envFile, 'utf-8')
          for (const line of content.split('\n')) {
            const t = line.trim()
            if (!t || t.startsWith('#')) continue
            const eqIdx = t.indexOf('=')
            if (eqIdx < 0) continue
            const k = t.slice(0, eqIdx).trim()
            const v = t.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
            if (k === 'N8N_USER_FOLDER' && v) { candidates.push(v); break }
          }
        }
      } catch {}

      // ── Filesystem search ─────────────────────────────────────────────────

      if (isWindows()) {
        // a. Well-known per-user AppData locations for the current user
        const appData     = process.env['APPDATA']
        const localApp    = process.env['LOCALAPPDATA']
        const programData = process.env['PROGRAMDATA']
        const userProfile = process.env['USERPROFILE'] ?? homedir()
        if (appData)     candidates.push(join(appData,     'n8n'))
        if (localApp)    candidates.push(join(localApp,    'n8n'))
        if (programData) candidates.push(join(programData, 'n8n'))
        candidates.push(join(userProfile, 'n8n'))
        candidates.push(join(userProfile, 'AppData', 'Roaming', 'n8n'))
        candidates.push(join(userProfile, 'AppData', 'Local',   'n8n'))

        // b. Scan ALL user profiles under C:\Users\*\.n8n and nearby
        try {
          const usersRoot = 'C:\\Users'
          if (existsSync(usersRoot)) {
            for (const profile of readdirSync(usersRoot)) {
              candidates.push(join(usersRoot, profile, '.n8n'))
              candidates.push(join(usersRoot, profile, 'n8n'))
              candidates.push(join(usersRoot, profile, 'AppData', 'Roaming', 'n8n'))
              candidates.push(join(usersRoot, profile, 'AppData', 'Local',   'n8n'))
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
      const seen  = new Set<string>()
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
