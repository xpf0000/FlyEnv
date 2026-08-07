import { dirname, join } from 'node:path'
import type { SoftInstalled } from '@shared/app'

export type Neo4jStartCommand = {
  bin: string
  execArgs: string[]
  execEnv?: Record<string, string>
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
