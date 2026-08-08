import { dirname, join } from 'node:path'
import type { SoftInstalled } from '@shared/app'

export type Neo4jStartCommand = {
  bin: string
  execArgs: string[]
  execEnv?: Record<string, string>
}

/**
 * Build the PATH used by the Neo4j launcher. Packaged macOS apps can be
 * started without a shell and therefore inherit an incomplete PATH; retain
 * the synced environment and add the system directories required by the
 * launcher itself (`dirname`, `uname`, etc.).
 */
export function neo4jPathEnv(
  javaHome: string,
  neo4jBin: string,
  currentPath: string | undefined,
  windows: boolean
): string {
  const separator = windows ? ';' : ':'
  const systemEntries = windows ? [] : ['/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']
  const entries = [
    join(javaHome, 'bin'),
    dirname(neo4jBin),
    ...(currentPath ?? '').split(separator),
    ...systemEntries
  ]
  return Array.from(new Set(entries.map((entry) => entry.trim()).filter(Boolean))).join(separator)
}

export function neo4jStartCommand(
  version: SoftInstalled,
  windows: boolean,
  scriptExists: (path: string) => boolean,
  powershellPath: string
): Neo4jStartCommand {
  if (!windows) return { bin: version.bin, execArgs: ['console'] }

  const powershellScript = join(dirname(version.bin), 'neo4j.ps1')
  if (scriptExists(powershellScript)) {
    return {
      bin: powershellPath,
      execArgs: [
        '-NoProfile',
        '-NonInteractive',
        '-NoLogo',
        '-ExecutionPolicy',
        'Bypass',
        '-WindowStyle',
        'Hidden',
        '-File',
        powershellScript,
        'console'
      ]
    }
  }

  return {
    bin: 'cmd.exe',
    execArgs: ['/d', '/s', '/c', '"%FLYENV_NEO4J_BIN%" console'],
    execEnv: { FLYENV_NEO4J_BIN: version.bin }
  }
}
