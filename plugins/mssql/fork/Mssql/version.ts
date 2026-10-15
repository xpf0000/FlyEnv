/**
 * Pure helpers for the MSSQL plugin fork module: online version discovery
 * metadata, apt repository mapping, deb822 (Packages.gz) parsing and Windows
 * `reg query` output parsing. No Node/fork imports so the offline contract
 * test can exercise every function directly.
 */

export type MssqlWindowsInstaller = {
  /** Product major version used for display and zip naming, e.g. '2022'. */
  version: string
  edition: 'Express' | 'Developer'
  url: string
  fileName: string
  licenseNote: string
  installerKind: 'ssei-bootstrapper'
}

/**
 * Known SQL Server bootstrapper (SSEI) download links. Every URL is a
 * perpetual go.microsoft.com fwlink that redirects to the current installer
 * build; all were verified to return HTTP 200 during research.
 */
export const MSSQL_WINDOWS_INSTALLERS: MssqlWindowsInstaller[] = [
  {
    version: '2025',
    edition: 'Express',
    url: 'https://go.microsoft.com/fwlink/?linkid=2216019',
    fileName: 'SQL2025-SSEI-Expr.exe',
    licenseNote: 'Express: free, redistribution allowed with registration',
    installerKind: 'ssei-bootstrapper'
  },
  {
    version: '2022',
    edition: 'Express',
    url: 'https://go.microsoft.com/fwlink/?LinkID=2215160',
    fileName: 'SQL2022-SSEI-Expr.exe',
    licenseNote: 'Express: free, redistribution allowed with registration',
    installerKind: 'ssei-bootstrapper'
  },
  {
    version: '2022',
    edition: 'Developer',
    url: 'https://go.microsoft.com/fwlink/?linkid=2215158',
    fileName: 'SQL2022-SSEI-Dev.exe',
    licenseNote: 'Developer: free, development/testing only, not for production',
    installerKind: 'ssei-bootstrapper'
  },
  {
    version: '2019',
    edition: 'Express',
    url: 'https://go.microsoft.com/fwlink/?linkid=866658',
    fileName: 'SQL2019-SSEI-Expr.exe',
    licenseNote: 'Express: free, redistribution allowed with registration',
    installerKind: 'ssei-bootstrapper'
  }
]

export type OsReleaseInfo = {
  id: string
  versionId: string
}

/** Parse /etc/os-release into the two fields the repository mapping needs. */
export const parseOsRelease = (content: string): OsReleaseInfo => {
  const values: Record<string, string> = {}
  for (const rawLine of `${content ?? ''}`.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }
  return {
    id: (values.ID ?? '').toLowerCase(),
    versionId: values.VERSION_ID ?? ''
  }
}

export type UbuntuMssqlRepo = {
  /** Product major: '2025' | '2022'. */
  major: string
  codename: string
  /** Repository root, e.g. https://packages.microsoft.com/ubuntu/22.04/mssql-server-2022 */
  repoBase: string
  /** Packages index URL to probe/download. */
  packagesUrl: string
}

const UBUNTU_CODENAMES: Record<string, string> = {
  '22.04': 'jammy',
  '24.04': 'noble'
}

export const MSSQL_LINUX_MAJORS = ['2025', '2022'] as const

/**
 * Map a distribution to the candidate apt repositories. Only Ubuntu
 * 22.04/24.04 x64 are covered in this iteration; anything else maps to an
 * empty list and the caller reports an empty online list.
 */
export const ubuntuMssqlRepoCandidates = (info: OsReleaseInfo): UbuntuMssqlRepo[] => {
  if (info.id !== 'ubuntu') return []
  const codename = UBUNTU_CODENAMES[info.versionId]
  if (!codename) return []
  return MSSQL_LINUX_MAJORS.map((major) => {
    const repoBase = `https://packages.microsoft.com/ubuntu/${info.versionId}/mssql-server-${major}`
    return {
      major,
      codename,
      repoBase,
      packagesUrl: `${repoBase}/dists/${codename}/main/binary-amd64/Packages.gz`
    }
  })
}

export type DebPackageEntry = {
  packageName: string
  version: string
  filename: string
  size: number
  sha256: string
  description: string
}

/**
 * Parse a deb822-style Packages index (already gunzipped). Field values may
 * wrap onto continuation lines that start with a space; only the fields the
 * plugin needs are kept. Broken stanzas are skipped individually.
 */
export const parsePackagesIndex = (text: string): DebPackageEntry[] => {
  const entries: DebPackageEntry[] = []
  const stanzas = `${text ?? ''}`.split(/\r?\n\r?\n/)
  for (const stanza of stanzas) {
    const fields: Record<string, string> = {}
    let lastKey = ''
    for (const line of stanza.split('\n')) {
      if (!line.trim()) continue
      if (/^[ \t]/.test(line)) {
        if (lastKey) fields[lastKey] += `\n${line.trimEnd()}`
        continue
      }
      const colon = line.indexOf(':')
      if (colon <= 0) continue
      lastKey = line.slice(0, colon).trim()
      fields[lastKey] = line.slice(colon + 1).trim()
    }
    const packageName = fields.Package ?? ''
    const version = fields.Version ?? ''
    const filename = fields.Filename ?? ''
    if (!packageName || !version || !filename) continue
    entries.push({
      packageName,
      version,
      filename,
      size: Number(fields.Size ?? 0) || 0,
      sha256: fields.SHA256 ?? '',
      description: (fields.Description ?? '').split('\n')[0] ?? ''
    })
  }
  return entries
}

/** Absolute download URL for a pool file relative to the repository root. */
export const debDownloadUrl = (repoBase: string, filename: string): string => {
  const base = repoBase.replace(/\/+$/, '')
  const rel = `${filename ?? ''}`.replace(/^\/+/, '')
  return `${base}/${rel}`
}

export type RegInstanceName = {
  /** Instance name as shown to users, e.g. MSSQLSERVER or SQLEXPRESS. */
  name: string
  /** Instance ID, e.g. MSSQL16.MSSQLSERVER. */
  instanceId: string
}

const REG_SZ_LINE = /^\s+(\S+)\s+REG_SZ\s+(.+?)\s*$/i

/**
 * Parse `reg query "HKLM\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL"`
 * output. Each value line maps an instance name to its instance ID. Header and
 * blank lines are ignored; malformed value lines are skipped individually.
 */
export const parseRegInstanceNames = (stdout: string): RegInstanceName[] => {
  const result: RegInstanceName[] = []
  for (const rawLine of `${stdout ?? ''}`.split(/\r?\n/)) {
    const match = rawLine.match(REG_SZ_LINE)
    if (!match) continue
    const name = match[1].trim()
    const instanceId = match[2].trim()
    if (!name || !instanceId) continue
    result.push({ name, instanceId })
  }
  return result
}

export type RegInstanceSetup = {
  version: string
  edition: string
  sqlBinRoot: string
  sqlDataRoot: string
}

/**
 * Parse `reg query "HKLM\...\MSSQLxx.<id>\Setup"` output into the values the
 * plugin needs. Missing values stay empty strings; the caller validates.
 */
export const parseRegInstanceSetup = (stdout: string): RegInstanceSetup => {
  const setup: RegInstanceSetup = { version: '', edition: '', sqlBinRoot: '', sqlDataRoot: '' }
  const keyMap: Record<string, keyof RegInstanceSetup> = {
    version: 'version',
    edition: 'edition',
    sqlbinroot: 'sqlBinRoot',
    sqldataroot: 'sqlDataRoot'
  }
  for (const rawLine of `${stdout ?? ''}`.split(/\r?\n/)) {
    const match = rawLine.match(REG_SZ_LINE)
    if (!match) continue
    const key = keyMap[match[1].toLowerCase()]
    if (key) setup[key] = match[2].trim()
  }
  return setup
}

/**
 * Windows service name for an instance: the default instance (MSSQLSERVER)
 * uses `MSSQLSERVER`, named instances use `MSSQL$<name>`.
 */
export const windowsServiceName = (instanceName: string): string => {
  const name = `${instanceName ?? ''}`.trim()
  if (!name) return ''
  return name.toUpperCase() === 'MSSQLSERVER' ? 'MSSQLSERVER' : `MSSQL$${name}`
}

export type ScQueryExResult = {
  state: string
  pid: number
}

/** Parse `sc.exe queryex <service>` output for the STATE and PID fields. */
export const parseScQueryEx = (stdout: string): ScQueryExResult => {
  let state = ''
  let pid = 0
  for (const rawLine of `${stdout ?? ''}`.split(/\r?\n/)) {
    const line = rawLine.trim()
    const stateMatch = line.match(/^STATE\s*:\s*(\d+)/i)
    if (stateMatch) {
      state =
        (
          {
            1: 'STOPPED',
            2: 'START_PENDING',
            3: 'STOP_PENDING',
            4: 'RUNNING',
            5: 'CONTINUE_PENDING',
            6: 'PAUSE_PENDING',
            7: 'PAUSED'
          } as Record<number, string>
        )[Number(stateMatch[1])] ?? ''
      continue
    }
    const pidMatch = line.match(/^PID\s*:\s*(\d+)/i)
    if (pidMatch) pid = Number(pidMatch[1])
  }
  return { state, pid }
}

/** `sc.exe` failure output -> whether it is an access-denied (exit code 5) case. */
export const isScAccessDenied = (output: string): boolean => {
  return /access is denied|拒绝访问|FAILED\s+5(?:\D|$)/i.test(`${output ?? ''}`)
}

export type WindowsInstanceScan = {
  name: string
  instanceId: string
  version: string
  edition: string
  bin: string
  sqlDataRoot: string
  serviceName: string
}

const joinWindowsPath = (dir: string, leaf: string): string => {
  const base = `${dir ?? ''}`.replace(/[\\/]+$/, '')
  return base ? `${base}\\${leaf}` : ''
}

/**
 * Convert one parsed Setup key into a usable instance record. Returns null
 * (skip this instance, keep scanning the rest) when the entry is broken:
 * missing Version or a SQLBinRoot without sqlservr.exe.
 */
export const windowsInstanceFromSetup = (
  inst: RegInstanceName,
  setup: RegInstanceSetup,
  binExists: (bin: string) => boolean
): WindowsInstanceScan | null => {
  const bin = joinWindowsPath(setup.sqlBinRoot, 'sqlservr.exe')
  if (!setup.version || !bin || !binExists(bin)) return null
  return {
    name: inst.name,
    instanceId: inst.instanceId,
    version: setup.version,
    edition: setup.edition,
    bin,
    sqlDataRoot: setup.sqlDataRoot,
    serviceName: windowsServiceName(inst.name)
  }
}

/** SQL Server major product version ('16' from '16.0.4305.5-1'), used for the data dir name. */
export const mssqlMajorOfVersion = (version: string): string => {
  const match = `${version ?? ''}`.trim().match(/^(\d+)/)
  return match?.[1] ?? ''
}

/** sa password strength: 8+ chars, three of lowercase/uppercase/digit/symbol. */
export const isStrongSaPassword = (password: string): boolean => {
  const value = `${password ?? ''}`
  if (value.length < 8 || value.length > 128) return false
  let classes = 0
  if (/[a-z]/.test(value)) classes += 1
  if (/[A-Z]/.test(value)) classes += 1
  if (/[0-9]/.test(value)) classes += 1
  if (/[^a-zA-Z0-9]/.test(value)) classes += 1
  return classes >= 3
}
