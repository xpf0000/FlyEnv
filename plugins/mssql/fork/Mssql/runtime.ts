import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join, win32 } from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'

/** A cache filename only becomes visible after the complete stream is on disk. */
export async function downloadMssqlFile(
  target: string,
  request: () => Promise<{ data: Readable; headers: Record<string, any> }>
) {
  await mkdir(dirname(target), { recursive: true })
  const partial = `${target}.${randomUUID()}.part`
  try {
    const response = await request()
    await pipeline(response.data, createWriteStream(partial, { flags: 'wx' }))
    const expected = Number(response.headers['content-length'])
    if (Number.isFinite(expected) && expected > 0 && (await stat(partial)).size !== expected) {
      throw new Error('Incomplete SQL Server package download')
    }
    await rename(partial, target)
  } finally {
    await rm(partial, { force: true }).catch((error) =>
      console.warn('[mssql] partial cache cleanup failed', error)
    )
  }
}

/** stdout is the result; stderr is diagnostic. Errors, non-zero exits and timeouts reject. */
export function spawnMssqlCommand(
  bin: string,
  args: string[],
  timeoutMs = 40 * 60 * 1000,
  spawnCommand: typeof spawn = spawn
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawnCommand(bin, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let diagnostics = ''
    let settled = false
    let timedOut = false
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (cleanupTimer) clearTimeout(cleanupTimer)
      if (error) reject(error)
      else resolve(output)
    }
    const timer = setTimeout(() => {
      timedOut = true
      cleanupTimer = setTimeout(
        () => finish(new Error('SQL Server command timed out; cleanup result is unknown')),
        10000
      )
      try {
        child.kill()
      } catch {
        finish(new Error('SQL Server command timed out; cleanup result is unknown'))
      }
    }, timeoutMs)
    const collect = (data: Buffer) => {
      diagnostics = `${diagnostics}${data.toString()}`.slice(-16000)
    }
    child.stdout?.on('data', (data: Buffer) => {
      output = `${output}${data.toString()}`.slice(-16000)
      collect(data)
    })
    child.stderr?.on('data', collect)
    child.once('error', (error) => finish(error))
    child.once('close', (code, signal) => {
      finish(
        timedOut
          ? new Error('SQL Server external command timed out')
          : code === 0
            ? undefined
            : new Error(`SQL Server command exited ${code ?? signal}: ${diagnostics.trim()}`)
      )
    })
  })
}

export const windowsMediaDownloadArgs = (edition: string, mediaDir: string): string[] => [
  '/ACTION=Download',
  `/MEDIATYPE=${edition === 'Developer' ? 'ISO' : 'Core'}`,
  `/MEDIAPATH=${mediaDir}`,
  '/ENU',
  // Download complete media before running the separate quiet Setup.
  '/QUIET'
]

export function windowsSetupArgs(version: string, appRoot: string, serverRoot: string): string[] {
  const instance = `FLYENV${version.split('-')[0]}`
  const dataRoot = win32.join(serverRoot, 'mssql')
  const data = win32.join(dataRoot, `data-${instance}`)
  // Setup refuses existing tempdb files, including those preserved on uninstall.
  // Keep old files intact and give this install its own tempdb data/log location.
  const temp = win32.join(data, 'temp', randomUUID())
  return [
    '/ACTION=Install',
    '/Q',
    '/IACCEPTSQLSERVERLICENSETERMS',
    '/SUPPRESSPRIVACYSTATEMENTNOTICE',
    '/FEATURES=SQLENGINE',
    `/INSTANCENAME=${instance}`,
    `/SQLSVCACCOUNT=NT Service\\MSSQL$${instance}`,
    '/SQLSVCSTARTUPTYPE=Manual',
    `/INSTANCEDIR=${win32.join(appRoot, 'mssql', version)}`,
    `/INSTALLSQLDATADIR=${dataRoot}`,
    `/SQLUSERDBDIR=${win32.join(data, 'data')}`,
    `/SQLUSERDBLOGDIR=${win32.join(data, 'log')}`,
    `/SQLTEMPDBDIR=${temp}`,
    `/SQLTEMPDBLOGDIR=${temp}`,
    `/SQLBACKUPDIR=${win32.join(dataRoot, `backup-${instance}`)}`
  ]
}

const psString = (value: string) => `'${value.replaceAll("'", "''")}'`
// ProcessStartInfo.Arguments follows Windows CRT quoting, not PowerShell quoting.
export const windowsArgument = (value: string) =>
  `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`

/** ShellExecute honors the official installer's own manifest and UAC behavior. */
export function windowsLaunchScript(file: string, args: string[], wait: boolean): string {
  const launch = `$p=Start-Process -FilePath ${psString(file)} -ArgumentList ${psString(args.map(windowsArgument).join(' '))} -WorkingDirectory ${psString(win32.dirname(file))}${wait ? ' -WindowStyle Hidden' : ' -Verb RunAs'} -PassThru;`
  if (!wait)
    return `$ErrorActionPreference='Stop'; ${launch} if (!$p) { throw "SQL Server installer was not launched" }; if ($p.WaitForExit(1500) -and $p.ExitCode -ne 0) { throw "SQL Server Setup exited $($p.ExitCode)" }`
  // The downloader is owned work. Its wrapper watches the worker lifetime and
  // confirms termination before returning a failure; interactive Setup is independent.
  return `$ErrorActionPreference='Stop'; $owner=Get-Process -Id ${process.pid}; $stamp=$owner.StartTime.ToUniversalTime().Ticks; $p=$null; try { ${launch} $deadline=[DateTime]::UtcNow.AddMinutes(39); while (!$p.WaitForExit(500)) { $owner=Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue; if (!$owner -or $owner.StartTime.ToUniversalTime().Ticks -ne $stamp) { throw "SQL Server media download owner exited" }; if ([DateTime]::UtcNow -ge $deadline) { throw "SQL Server media download timed out" } }; $p.WaitForExit(); if ($p.ExitCode -ne 0) { throw "SQL Server media download exited $($p.ExitCode)" } } finally { if ($p -and !$p.HasExited) { $p.Kill(); if (!$p.WaitForExit(10000)) { throw "SQL Server media cleanup result is unknown" } } }`
}

export function linuxMssqlLayout(root: string) {
  return {
    root,
    dataDir: join(root, 'data'),
    logDir: join(root, 'log'),
    backupDir: join(root, 'backup'),
    systemDir: join(root, '.system'),
    masterDataFile: join(root, 'data/master.mdf'),
    masterLogFile: join(root, 'data/mastlog.ldf'),
    errorLogFile: join(root, 'log/errorlog')
  }
}

/** Native sqlservr keeps its official absolute paths inside a private mount namespace. */
export function linuxMssqlLaunch(
  bin: string,
  layout: ReturnType<typeof linuxMssqlLayout>,
  port: number,
  edition: string
) {
  return {
    bin: '/usr/bin/bwrap',
    args: [
      '--unshare-user',
      '--ro-bind',
      '/',
      '/',
      '--dev-bind',
      '/dev',
      '/dev',
      '--tmpfs',
      '/tmp',
      '--tmpfs',
      '/var/opt',
      '--bind',
      layout.root,
      '/var/opt/mssql',
      '--ro-bind',
      dirname(dirname(bin)),
      dirname(dirname(bin)),
      '--chdir',
      '/var/opt/mssql',
      '--',
      bin
    ],
    env: {
      ACCEPT_EULA: 'Y',
      MSSQL_PID: edition,
      MSSQL_TCP_PORT: `${port}`,
      MSSQL_DATA_DIR: '/var/opt/mssql/data',
      MSSQL_LOG_DIR: '/var/opt/mssql/log',
      MSSQL_BACKUP_DIR: '/var/opt/mssql/backup',
      MSSQL_DUMP_DIR: '/var/opt/mssql/log',
      MSSQL_MASTER_DATA_FILE: '/var/opt/mssql/data/master.mdf',
      MSSQL_MASTER_LOG_FILE: '/var/opt/mssql/data/mastlog.ldf',
      MSSQL_ERROR_LOG_FILE: '/var/opt/mssql/log/errorlog'
    } as Record<string, string>
  }
}

export async function waitForMssqlReady(options: {
  alive: () => boolean
  ready: () => Promise<boolean>
  wait: () => Promise<unknown>
  attempts: number
}) {
  for (let attempt = 0; attempt < options.attempts; attempt++) {
    if (!options.alive()) throw new Error('sqlservr exited during startup')
    if (await options.ready()) return
    await options.wait()
  }
  throw new Error('Timed out waiting for SQL Server to become ready')
}
