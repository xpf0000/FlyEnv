import { join } from 'path'
import { existsSync, realpathSync } from 'fs'
import { tmpdir } from 'os'
import { readFile, writeFile, remove, execPromiseWithEnv } from '../../Fn'
import { appDebugLog, isWindows } from '@shared/utils'
import EnvSync from '@shared/EnvSync'

/** Get the env file path for n8n */
export function getEnvFilePath(): string {
  return join(global.Server.BaseDir!, 'n8n/n8n.env')
}

/** Read a specific config value from the env file */
export async function readEnvValue(key: string): Promise<string | undefined> {
  try {
    const envFile = getEnvFilePath()
    if (!existsSync(envFile)) return undefined
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
      if (k === key) return v
    }
  } catch {}
  return undefined
}

/** Get N8N_PORT from config (default 5678) */
export async function getPort(): Promise<string> {
  return (await readEnvValue('N8N_PORT')) || '5678'
}

/** Parse env file into key-value dict (skip comments and empty lines) */
export async function parseEnvFile(envFile: string): Promise<Record<string, string>> {
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

/** Read N8N_PORT / N8N_OWNER_EMAIL / N8N_OWNER_PASSWORD from the env file. */
export async function getN8nConfig(): Promise<{ port: string; email: string; password: string }> {
  const envFile = getEnvFilePath()
  const opt = await parseEnvFile(envFile)
  return {
    port: opt['N8N_PORT'] || '5678',
    email: opt['N8N_OWNER_EMAIL'] || '',
    password: opt['N8N_OWNER_PASSWORD'] || ''
  }
}

/** Resolve the effective N8N_USER_FOLDER (falls back to OS-native ~/.n8n). */
export async function resolveDataDir(): Promise<string> {
  const { homedir } = await import('os')
  const customDir = await readEnvValue('N8N_USER_FOLDER')
  return customDir || join(homedir(), '.n8n')
}

/**
 * Resolve the path to n8n's bundled node_modules directory.
 * n8n ships sqlite3 and bcryptjs inside its own node_modules.
 */
export async function resolveN8nModulesDir(): Promise<string | null> {
  try {
    const cmd = isWindows() ? 'where n8n.cmd' : 'which n8n'
    const result = await execPromiseWithEnv(cmd)
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
  } catch (e) {
    appDebugLog(`[resolveN8nModulesDir][error]`, `${e}`).catch()
    appDebugLog(`[resolveN8nModulesDir][AppEnv]`, JSON.stringify(EnvSync.AppEnv, null, 2)).catch()
  }
  return null
}

/**
 * Write a JS script to a temp file, execute it with the system `node`, return stdout.
 * Using a temp file avoids all shell quoting/escaping issues.
 * The system `node` has the correct ABI for n8n's native sqlite3 binding.
 */
export async function runNodeScript(script: string): Promise<string> {
  const tmpFile = join(tmpdir(), `flyenv-n8n-${Date.now()}.js`)
  await writeFile(tmpFile, script, 'utf-8')
  try {
    const result = await execPromiseWithEnv(`node "${tmpFile}"`)
    return result.stdout ?? ''
  } finally {
    try {
      await remove(tmpFile)
    } catch {}
  }
}

/** Helper to get sqlite3 module path or throw */
export async function getSqlite3Path(): Promise<string> {
  const n8nModules = await resolveN8nModulesDir()
  const sqlite3Path = n8nModules ? join(n8nModules, 'sqlite3', 'lib', 'sqlite3.js') : ''
  if (!sqlite3Path || !existsSync(sqlite3Path)) {
    throw new Error(
      'Could not find sqlite3 module in n8n installation. Please make sure n8n is installed globally.'
    )
  }
  return sqlite3Path
}

/** Helper to get bcryptjs module path or throw */
export async function getBcryptPath(): Promise<string> {
  const n8nModules = await resolveN8nModulesDir()
  const bcryptPath = n8nModules ? join(n8nModules, 'bcryptjs', 'index.js') : ''
  if (!bcryptPath || !existsSync(bcryptPath)) {
    throw new Error('Could not find bcryptjs module in n8n installation.')
  }
  return bcryptPath
}

/** Helper to get database file path or throw */
export async function getDbFilePath(): Promise<string> {
  const dataDir = await resolveDataDir()
  const dbFile = join(dataDir, 'database.sqlite')
  if (!existsSync(dbFile)) {
    throw new Error('n8n database not found at ' + dbFile)
  }
  return dbFile
}

/** Default env file content template */
export function getDefaultEnvContent(): string {
  return [
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
}
