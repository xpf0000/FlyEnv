import { existsSync } from 'fs'
import EnvSync from '@shared/EnvSync'
import { isMacOS, isWindows } from '@shared/utils'
import { execPromise } from '../../Fn'
import { homePath } from './utils'
import type { CronCommandResult } from './types'

export async function executeCronCommand(
  command: string,
  workDir: string
): Promise<CronCommandResult> {
  const cwd = workDir && existsSync(workDir) ? workDir : homePath()
  const start = Date.now()
  let output = ''
  let error = ''
  let exitCode = 0

  try {
    const env = await EnvSync.sync().catch(() => process.env)
    const result = await execPromise(command, {
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
