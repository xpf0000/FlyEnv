import type { CronJob } from '@shared/app'
import EnvSync from '@shared/EnvSync'
import { isMacOS } from '@shared/utils'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { chmod, execPromise, mkdirp, remove, uuid, writeFile } from '../../Fn'
import { homePath, runLogPath, shellQuote, taskScriptPath } from './utils'

export class UnixSystemScheduler {
  constructor(private cronRoot: string) {}

  private runLogPath(jobId: string): string {
    return runLogPath(this.cronRoot, jobId)
  }

  private taskScriptPath(jobId: string): string {
    return taskScriptPath(this.cronRoot, jobId, 'sh')
  }

  private resolveShell(): string {
    const fallback = isMacOS() ? '/bin/zsh' : '/bin/bash'
    const shell = process.env.SHELL || fallback
    return existsSync(shell) ? shell : fallback
  }

  private async resolvePath(): Promise<string> {
    try {
      const env = await EnvSync.sync()
      return `${env.PATH || env.Path || process.env.PATH || ''}`
    } catch {
      return process.env.PATH || ''
    }
  }

  private async writeWrapper(job: CronJob): Promise<string> {
    const file = this.taskScriptPath(job.id)
    const workDir = job.workDir || homePath()
    const runDir = join(this.cronRoot, 'tmp')
    const logFile = this.runLogPath(job.id)
    const shell = this.resolveShell()
    const envPath = await this.resolvePath()
    const scope = job.scope ?? (job.hostId ? 'host' : 'global')
    const shellHostId = '${HOST_ID:-null}'

    const content = `#!/bin/sh
JOB_ID=${shellQuote(job.id)}
HOST_ID=${shellQuote(job.hostId ? `${job.hostId}` : '')}
SCOPE=${shellQuote(scope)}
COMMAND=${shellQuote(job.command)}
WORK_DIR=${shellQuote(workDir)}
RUN_DIR=${shellQuote(runDir)}
LOG_FILE=${shellQuote(logFile)}
RUN_SHELL=${shellQuote(shell)}
PATH=${shellQuote(envPath)}
export PATH
LOCK_DIR="$RUN_DIR/$JOB_ID.lock"

mkdir -p "$RUN_DIR" "$(dirname "$LOG_FILE")"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  exit 0
fi

RUN_ID="$(date +%Y%m%d%H%M%S)-$$"
OUT_FILE="$RUN_DIR/$JOB_ID-$RUN_ID.out"
ERR_FILE="$RUN_DIR/$JOB_ID-$RUN_ID.err"
STARTED_AT=$(($(date +%s) * 1000))

cleanup() {
  rm -f "$OUT_FILE" "$ERR_FILE"
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

if [ ! -d "$WORK_DIR" ]; then
  printf '%s' "Work directory not found: $WORK_DIR" > "$ERR_FILE"
  : > "$OUT_FILE"
  EXIT_CODE=1
else
  cd "$WORK_DIR" || true
  "$RUN_SHELL" -lc "$COMMAND" > "$OUT_FILE" 2> "$ERR_FILE"
  EXIT_CODE=$?
fi

FINISHED_AT=$(($(date +%s) * 1000))
DURATION=$((FINISHED_AT - STARTED_AT))
OUT_B64=$(base64 < "$OUT_FILE" | tr -d '\\n')
ERR_B64=$(base64 < "$ERR_FILE" | tr -d '\\n')

printf '{"id":"%s","jobId":"%s","hostId":%s,"scope":"%s","startedAt":%s,"finishedAt":%s,"duration":%s,"exitCode":%s,"outputBase64":"%s","errorBase64":"%s"}\\n' \\
  "$RUN_ID" "$JOB_ID" "${shellHostId}" "$SCOPE" "$STARTED_AT" "$FINISHED_AT" "$DURATION" "$EXIT_CODE" "$OUT_B64" "$ERR_B64" >> "$LOG_FILE"
exit "$EXIT_CODE"
`

    await mkdirp(dirname(file))
    await writeFile(file, content)
    await chmod(file, 0o755)
    return file
  }

  private async readCrontab(): Promise<string> {
    try {
      const res = await execPromise('crontab -l')
      return res.stdout?.toString() || ''
    } catch {
      return ''
    }
  }

  private removeCronBlock(content: string, jobId: string): string {
    const start = `# FlyEnv Cron Start ${jobId}`
    const end = `# FlyEnv Cron End ${jobId}`
    const result: string[] = []
    let removing = false

    for (const line of content.split(/\r?\n/)) {
      if (line.trim() === start) {
        removing = true
        continue
      }
      if (line.trim() === end) {
        removing = false
        continue
      }
      if (!removing && line.trim()) {
        result.push(line)
      }
    }

    return result.join('\n')
  }

  private async installCrontab(job: CronJob, scriptPath: string) {
    const current = await this.readCrontab()
    const withoutJob = this.removeCronBlock(current, job.id)
    const start = `# FlyEnv Cron Start ${job.id}`
    const end = `# FlyEnv Cron End ${job.id}`
    const line = `${job.schedule} ${shellQuote(scriptPath)} >/dev/null 2>&1`
    const next = [withoutJob, start, line, end]
      .filter((part) => `${part}`.trim().length > 0)
      .join('\n')
      .trimEnd()

    const tmpFile = join(tmpdir(), `flyenv-crontab-${uuid()}`)
    await writeFile(tmpFile, `${next}\n`)
    try {
      await execPromise(`crontab ${shellQuote(tmpFile)}`)
    } finally {
      await remove(tmpFile).catch(() => {})
    }
  }

  private async removeCrontab(jobId: string) {
    const current = await this.readCrontab()
    const withoutJob = this.removeCronBlock(current, jobId)
    const tmpFile = join(tmpdir(), `flyenv-crontab-${uuid()}`)
    await writeFile(tmpFile, withoutJob.trimEnd() ? `${withoutJob.trimEnd()}\n` : '')
    try {
      await execPromise(`crontab ${shellQuote(tmpFile)}`)
    } finally {
      await remove(tmpFile).catch(() => {})
    }
  }

  async install(job: CronJob) {
    const scriptPath = await this.writeWrapper(job)
    await this.installCrontab(job, scriptPath)
  }

  async remove(jobId: string) {
    await this.removeCrontab(jobId)
    await remove(this.taskScriptPath(jobId)).catch(() => {})
  }
}
