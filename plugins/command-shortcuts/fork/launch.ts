import { spawn } from 'node:child_process'
import { access, constants, realpath } from 'node:fs/promises'
import { delimiter, isAbsolute, join } from 'node:path'
import EnvSync from '@shared/EnvSync'
import { spawnPromiseWithEnv } from '@shared/child-process'
import { buildWindowsTerminalInlineScript } from '@shared/WindowsTerminal'
import { powerShellInlineArgs } from '@shared/PowerShellCommand'
import { resolveWindowsPowerShellPath } from '@shared/WindowsSystemPaths'
import {
  appleScriptString,
  buildDirectoryCommand,
  directoryTerminalBootstrap,
  linuxTerminalArgs,
  validateDirectory
} from './terminal'
import type { TerminalRequest } from '../shared'

async function executable(name: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  const paths = isAbsolute(name)
    ? [name]
    : (env.PATH ?? '')
        .split(delimiter)
        .filter(Boolean)
        .map((dir) => join(dir, name))
  for (const path of paths) {
    try {
      await access(path, constants.X_OK)
      return await realpath(path)
    } catch {
      /* Try next PATH entry. */
    }
  }
  return undefined
}

type TerminalRunner = (
  file: string,
  args: string[],
  options?: Record<string, unknown>
) => Promise<unknown>

export async function openTerminal(
  request: TerminalRequest,
  run: TerminalRunner = async (file, args, options) => spawnPromiseWithEnv(file, args, options)
): Promise<void> {
  const path = await validateDirectory(request?.path)
  const command = buildDirectoryCommand(path, request?.command, process.platform)
  if (process.platform === 'darwin') {
    await run(
      '/usr/bin/osascript',
      [
        '-e',
        `tell application "Terminal"\nactivate\ndo script ${appleScriptString(command)}\nend tell`
      ],
      { shell: false }
    )
    return
  }
  if (process.platform === 'win32') {
    const powershell = resolveWindowsPowerShellPath()
    await run(
      powershell,
      powerShellInlineArgs(
        request.command === undefined
          ? directoryTerminalBootstrap(path, powershell)
          : `$ErrorActionPreference = 'Stop'\n${buildWindowsTerminalInlineScript(command, powershell)}`
      ),
      { windowsHide: true, shell: false }
    )
    return
  }
  if (process.platform !== 'linux') throw new Error('unsupportedPlatform')
  const env = await EnvSync.sync()
  const candidates = [
    env.TERMINAL,
    'x-terminal-emulator',
    'gnome-terminal',
    'konsole',
    'xfce4-terminal',
    'kitty',
    'alacritty',
    'xterm'
  ].filter(Boolean) as string[]
  for (const name of [...new Set(candidates)]) {
    const file = await executable(name, env)
    if (!file) continue
    const args = linuxTerminalArgs(file, command)
    await new Promise<void>((resolve, reject) => {
      const child = spawn(file, args, { env, cwd: path, detached: true, stdio: 'ignore' })
      child.once('error', reject)
      child.once('spawn', () => {
        child.unref()
        resolve()
      })
    })
    return
  }
  throw new Error('terminalMissing')
}
