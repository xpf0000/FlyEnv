import { dirname, join } from 'path'
import { chmod, execPromise, existsSync, remove, uuid, writeFile } from '../Fn'
import { appDebugLog } from '@shared/utils'

type TerminalCommand = {
  commandType: string
  command?: string
  commandFile?: string
  isSudo?: boolean
  env?: Record<string, string>
  binBin?: string
  workDir?: string
}

function shellQuoted(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

/** Sudo stays inside the visible Terminal session and never receives a saved password. */
export async function runMacTerminalCommand(params: TerminalCommand): Promise<void> {
  const lines: string[] = []
  if (params.workDir) lines.push(`cd ${shellQuoted(params.workDir)} || exit $?`)
  for (const [key, value] of Object.entries(params.env ?? {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`Invalid environment name: ${key}`)
    lines.push(`export ${key}=${shellQuoted(value)}`)
  }
  if (params.binBin && existsSync(params.binBin)) {
    lines.push(`export PATH=${shellQuoted(dirname(params.binBin))}:"$PATH"`)
  }
  lines.push(
    params.commandType === 'file' ? shellQuoted(params.commandFile ?? '') : (params.command ?? '')
  )
  let command = lines.join('\n')
  if (params.isSudo) command = `/usr/bin/sudo -- /bin/zsh -lc ${shellQuoted(command)}`
  const literal = command
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
  const script = `tell application "Terminal"
  activate
  do script "${literal}"
end tell`
  const file = join(global.Server.Cache!, `${uuid()}.scpt`)
  try {
    await writeFile(file, script)
    await chmod(file, '0600')
    await execPromise(`/usr/bin/osascript ${shellQuoted(file)}`, { cwd: global.Server.Cache! })
  } finally {
    // Cleanup cannot turn an already dispatched command into a failed launch/replay.
    try {
      await remove(file)
    } catch (error) {
      void appDebugLog('[MacTerminal][cleanup]', `${error}`).catch(() => {})
    }
  }
}
