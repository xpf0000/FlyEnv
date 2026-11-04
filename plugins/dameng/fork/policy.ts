import {
  defaultDamengSettings,
  validateDamengSettings,
  DAMENG_INITIAL_STORAGE,
  type DamengInitParams
} from '../shared'
import { posix, win32 } from 'node:path'

export const parseIni = (text: string): Record<string, string> =>
  Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.replace(/#.*$/, '').trim())
      .filter((line) => line.includes('='))
      .map((line) => {
        const index = line.indexOf('=')
        return [
          line.slice(0, index).trim().toUpperCase(),
          line
            .slice(index + 1)
            .trim()
            .replace(/^"(.*)"$/, '$1')
        ]
      })
  )

export function assertPlatform(platform: string, arch: string, osRelease = '', nativeArch = arch) {
  const values = parseIni(osRelease)
  if (
    arch !== 'x64' ||
    nativeArch.toLowerCase().includes('arm') ||
    !['win32', 'linux'].includes(platform) ||
    (platform === 'linux' &&
      (values.ID?.toLowerCase() !== 'ubuntu' || values.VERSION_ID !== '22.04'))
  ) {
    throw new Error(
      'DM8 requires native Windows x64 or Ubuntu 22.04 x86_64. This platform is not supported.'
    )
  }
}

export function credential(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 128 ||
    /[\s"\\\x00-\x1f\x7f]/.test(value)
  ) {
    throw new Error(
      'DM password is missing or contains unsupported whitespace, quotes, backslashes or control characters.'
    )
  }
  return value
}

export function validateInit(input: unknown): DamengInitParams {
  if (!input || typeof input !== 'object') throw new Error('Invalid DM initialization request.')
  const value = { ...defaultDamengSettings(), ...input } as DamengInitParams
  for (const key of ['sysdbaPassword', 'auditorPassword'] as const) {
    const password = credential(value[key])
    if (
      password.length < 9 ||
      password.length > 48 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/[0-9]/.test(password) ||
      !/[^A-Za-z0-9]/.test(password)
    ) {
      throw new Error(
        'Initial DM passwords require 9–48 characters with uppercase, lowercase, digit and special character.'
      )
    }
  }
  validateDamengSettings(value)
  return value
}

export function assertVendorPath(path: string, windows = false) {
  const body = windows ? path.replace(/^[A-Za-z]:[\\/]/, '') : path.replace(/^\//, '')
  if (
    !path ||
    path.length > 220 ||
    !(windows ? /^[A-Za-z]:[\\/]/.test(path) : path.startsWith('/')) ||
    !body
      .split(windows ? /[\\/]/ : /\//)
      .every((part) =>
        /^[A-Za-z0-9_\u4e00-\u9fa5](?:[A-Za-z0-9_\u4e00-\u9fa5 ]*[A-Za-z0-9_\u4e00-\u9fa5])?$/.test(
          part
        )
      )
  ) {
    throw new Error(
      `DM installer path is unsupported (characters or length): ${path}. Choose an installation directory with letters, digits, underscore, spaces or Chinese characters.`
    )
  }
}

/** Installer XML is stricter than native CONTROL data paths. */
export function assertDataPath(path: string, windows = false) {
  if (
    !path ||
    path.length > 220 ||
    /["\x00-\x1f\x7f]/.test(path) ||
    !(windows ? /^[A-Za-z]:[\\/]/.test(path) : posix.isAbsolute(path)) ||
    path.split(windows ? /[\\/]/ : /\//).some((part) => part === '.' || part === '..') ||
    (windows &&
      (/[<>|?*:]/.test(path.slice(2)) || path.split(/[\\/]/).some((part) => /[. ]$/.test(part))))
  )
    throw new Error(`Invalid DM database data path: ${path}`)
}

/** Only the user's existing custom-version roots determine registration. */
export function registeredProgramPaths(setup: unknown, windows = false): string[] {
  const dirs = (setup as { dameng?: { dirs?: unknown } } | undefined)?.dameng?.dirs
  if (!Array.isArray(dirs)) return []
  const paths = windows ? win32 : posix
  const result: string[] = [],
    seen = new Set<string>()
  for (const dir of dirs) {
    if (typeof dir !== 'string' || !paths.isAbsolute(dir) || /[\x00-\x1f]/.test(dir)) continue
    const normalized = paths.resolve(dir),
      key = windows ? normalized.toLowerCase() : normalized
    if (!seen.has(key)) {
      seen.add(key)
      result.push(normalized)
    }
  }
  return result
}

const literalValue = (value: string) => {
  if (/["\r\n\x00]/.test(value)) throw new Error('Invalid DM parameter value.')
  return value
}
const quoted = (value: string) => `"${literalValue(value)}"`
// CONTROL uses native INI quoting: single quotes with doubled apostrophes.
// Double quotes are literal; unquoted '#' and ';' start inline comments.
const controlValue = (value: string) => `'${literalValue(value).replaceAll("'", "''")}'`
const xmlEscape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
export const installerXml = (path: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<DATABASE><LANGUAGE>EN</LANGUAGE><TIME_ZONE>+00:00</TIME_ZONE><KEY></KEY><INSTALL_TYPE>0</INSTALL_TYPE><INSTALL_PATH>${xmlEscape(path)}</INSTALL_PATH><INIT_DB>N</INIT_DB><CREATE_DB_SERVICE>N</CREATE_DB_SERVICE><STARTUP_DB_SERVICE>N</STARTUP_DB_SERVICE></DATABASE>\n`

export function dminitControl(root: string, instance: string, input: DamengInitParams): string {
  const p = validateInit(input)
  if (!/^FLYENV[A-Z0-9]{1,10}$/.test(instance)) throw new Error('Invalid DM instance name.')
  const paths = /^[A-Za-z]:[\\/]/.test(root) ? win32 : posix
  const database = paths.join(root, 'DAMENG')
  // CONTROL values use native INI escaping, separately from DIsql credentials.
  // Shell-style double quotes become part of the filename (SYSTEM_PATH value error).
  // CONTROL's file defaults can resolve to cwd rather than SYSTEM_PATH.
  // Explicit file locations keep all database storage outside program/bin.
  return `[${instance}]\nSYSTEM_PATH = ${controlValue(root)}\nDB_NAME = DAMENG\nINSTANCE_NAME = ${instance}\nPORT_NUM = ${p.port}\nPAGE_SIZE = ${p.pageSize}\nEXTENT_SIZE = ${p.extentSize}\nUNICODE_FLAG = ${p.charset}\nCASE_SENSITIVE = ${p.caseSensitive ? 'Y' : 'N'}\nBUFFER = ${p.bufferMB}\nMAIN = ${controlValue(paths.join(database, 'MAIN.DBF'))}\nMAIN_SIZE = ${DAMENG_INITIAL_STORAGE.tablespaceMB}\nSYSTEM = ${controlValue(paths.join(database, 'SYSTEM.DBF'))}\nSYSTEM_SIZE = ${DAMENG_INITIAL_STORAGE.tablespaceMB}\nROLL = ${controlValue(paths.join(database, 'ROLL.DBF'))}\nROLL_SIZE = ${DAMENG_INITIAL_STORAGE.tablespaceMB}\nCTL_PATH = ${controlValue(paths.join(database, 'dm.ctl'))}\nLOG_PATH = ${controlValue(paths.join(database, 'DAMENG01.log'))}\nLOG_PATH = ${controlValue(paths.join(database, 'DAMENG02.log'))}\nLOG_SIZE = ${p.logSizeMB}\nAUTO_OVERWRITE = 0\nSYSDBA_PWD = ${controlValue(p.sysdbaPassword)}\nSYSAUDITOR_PWD = ${controlValue(p.auditorPassword)}\n`
}

export function disqlInput(password: string, port: number, info: boolean): string {
  credential(password)
  if (!Number.isInteger(port) || port < 1024 || port > 65534) throw new Error('Invalid DM port.')
  return `SET ECHO OFF\nSET DEFINE OFF\nWHENEVER SQLERROR EXIT 1\nCONNECT SYSDBA/${quoted(password)}@127.0.0.1:${port}\nSET HEADING OFF\nSET FEEDBACK OFF\nSET LINESHOW OFF\nSET TIMING OFF\nSELECT 'FLYENV_DM_READY=' || INSTANCE_NAME || ':' || STATUS$ FROM V$INSTANCE;\n${info ? `SELECT 'FLYENV_DM_LICENSE=' || EXPIRED_DATE FROM SYS."V$LICENSE";\nSELECT BANNER FROM V$VERSION;\n` : ''}EXIT 0\n`
}
