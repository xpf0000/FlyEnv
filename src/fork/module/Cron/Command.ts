import { existsSync } from 'fs'
import { resolve } from 'path'
import EnvSync from '@shared/EnvSync'
import { isMacOS, isWindows } from '@shared/utils'
import { execPromise } from '../../Fn'
import { homePath } from './utils'
import type { CronCommandResult } from './types'

function sanitizeCommand(command: string): string {
  if (!command || typeof command !== 'string') {
    return ''
  }
  const trimmed = command.trim()
  if (!trimmed) {
    return ''
  }
  const dangerousPatterns = /[;&|`$(){}[\]<>!#*?~]|(\$\()|(`)|(\$\{)|(\()|(\))|(\[)|(\])|(\\\n)/
  if (dangerousPatterns.test(trimmed)) {
    throw new Error('Command contains potentially dangerous characters')
  }
  return trimmed
}

function sanitizeWorkDir(workDir: string): string {
  if (!workDir || typeof workDir !== 'string') {
    return homePath()
  }
  try {
    const resolved = resolve(workDir)
    if (resolved.includes('\0')) {
      return homePath()
    }
    return resolved
  } catch {
    return homePath()
  }
}

export async function executeCronCommand(
  command: string,
  workDir: string
): Promise<CronCommandResult> {
  let sanitizedCommand: string
  try {
    sanitizedCommand = sanitizeCommand(command)
  } catch {
    return {
      output: '',
      error: 'Invalid command: command contains potentially dangerous characters',
      exitCode: 1,
      duration: 0
    }
  }

  if (!sanitizedCommand) {
    return {
      output: '',
      error: 'Invalid command: empty or invalid command',
      exitCode: 1,
      duration: 0
    }
  }

  const sanitizedWorkDir = sanitizeWorkDir(workDir)
  const cwd = sanitizedWorkDir && existsSync(sanitizedWorkDir) ? sanitizedWorkDir : homePath()
  const start = Date.now()
  let output = ''
  let error = ''
  let exitCode = 0

  try {
    const env = await EnvSync.sync().catch(() => process.env)
    const result = await execPromise(sanitizedCommand, {
      cwd,
      env,
      timeout: 60000,
      shell: isWindows()
        ? EnvSync.CMDPath || 'cmd.exe'
        : process.env.SHELL || (isMacOS() ? '/bin/zsh' : '/bin/bash')
    })
    output = result.stdout?.toString() || ''
    error = result.stderr?.toString() || ''
  } catch (err: any) {
    output = err?.stdout?.toString?.() || ''
    error = err?.stderr?.toString?.() || err?.message || String(err)
    exitCode = typeof err?.code === 'number' ? err.code : 1
  }

  return { output, error, exitCode, duration: Date.now() - start }
}
