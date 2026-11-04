import { stat } from 'node:fs/promises'
import { basename, isAbsolute } from 'node:path'
import { encodePowerShellCommand } from '@shared/PowerShellCommand'

export async function validateDirectory(path: string): Promise<string> {
  if (typeof path !== 'string' || !path.trim() || path.includes('\0') || !isAbsolute(path)) {
    throw new Error('invalidDirectory')
  }
  if (!(await stat(path)).isDirectory()) throw new Error('invalidDirectory')
  return path
}

export function buildDirectoryCommand(
  path: string,
  command: string | undefined,
  platform: NodeJS.Platform
): string {
  if (
    command !== undefined &&
    (typeof command !== 'string' || !command.trim() || command.includes('\0'))
  )
    throw new Error('invalidCommand')
  if (platform === 'win32') {
    const quoted = `'${path.replace(/'/g, "''")}'`
    if (command === undefined) return `Set-Location -LiteralPath ${quoted} -ErrorAction Stop`
    return `try { Set-Location -LiteralPath ${quoted} -ErrorAction Stop } catch { Write-Error $_; return }\n${command}`
  }
  const quoted = `'${path.replace(/'/g, "'\\''")}'`
  if (command === undefined) return `cd -- ${quoted}`
  // Keep the terminal in this directory, and guard every line of the command
  // against a failed cd without exiting the user's interactive shell.
  return `if cd -- ${quoted}; then\n${command}\nelse\nfalse\nfi`
}

export function appleScriptString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`
}

export function linuxTerminalArgs(file: string, command: string): string[] {
  const name = basename(file)
  const prefix = name === 'gnome-terminal' ? '--' : name === 'xfce4-terminal' ? '--execute' : '-e'
  return [prefix, '/bin/bash', '-ic', `${command}\nexec /bin/bash -i`]
}

export function directoryTerminalBootstrap(path: string, powershell: string): string {
  const payload = encodePowerShellCommand(buildDirectoryCommand(path, undefined, 'win32'))
  const executable = `'${powershell.replace(/'/g, "''")}'`
  return `$ErrorActionPreference = 'Stop'\nStart-Process -FilePath ${executable} -WindowStyle Normal -ArgumentList @('-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', '${payload}') -ErrorAction Stop`
}
