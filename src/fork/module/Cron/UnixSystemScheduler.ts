import type { CronJob, SystemScheduledTask } from '@shared/app'
import EnvSync from '@shared/EnvSync'
import { isMacOS } from '@shared/utils'
import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { chmod, execPromise, mkdirp, remove, uuid, writeFile } from '../../Fn'
import {
  computeNextRunTime,
  homePath,
  runLogPath,
  shellQuote,
  systemTaskName,
  taskScriptPath
} from './utils'

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
      const env = (await EnvSync.sync()) ?? {}
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

  private async writeCrontab(content: string): Promise<void> {
    const tmpFile = join(tmpdir(), `flyenv-crontab-${uuid()}`)
    await writeFile(tmpFile, content.trimEnd() ? `${content.trimEnd()}\n` : '')
    try {
      await execPromise(`crontab ${shellQuote(tmpFile)}`)
    } finally {
      await remove(tmpFile).catch(() => {})
    }
  }

  private cronLineId(line: string, occurrence: number): string {
    const hash = createHash('sha1').update(line).digest('hex').slice(0, 16)
    return `line:${hash}:${occurrence}`
  }

  private isCronEnvLine(line: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line)
  }

  private parseCronLine(line: string): { schedule: string; command: string } | undefined {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || this.isCronEnvLine(trimmed)) {
      return undefined
    }

    const special = trimmed.match(/^(@\S+)\s+(.+)$/)
    if (special) {
      return {
        schedule: special[1],
        command: special[2]
      }
    }

    const normal = trimmed.match(/^(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.+)$/)
    if (!normal) {
      return undefined
    }

    return {
      schedule: normal[1],
      command: normal[2]
    }
  }

  private nextRunTime(schedule?: string): number {
    if (!schedule) {
      return 0
    }

    const aliases: Record<string, string> = {
      '@yearly': '0 0 1 1 *',
      '@annually': '0 0 1 1 *',
      '@monthly': '0 0 1 * *',
      '@weekly': '0 0 * * 0',
      '@daily': '0 0 * * *',
      '@midnight': '0 0 * * *',
      '@hourly': '0 * * * *'
    }
    const normalized = aliases[schedule.toLowerCase()] || schedule
    return computeNextRunTime(normalized, new Date())
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

    await this.writeCrontab(next)
  }

  private async removeCrontab(jobId: string) {
    const current = await this.readCrontab()
    const withoutJob = this.removeCronBlock(current, jobId)
    await this.writeCrontab(withoutJob)
  }

  private async removeCrontabLine(taskId: string): Promise<void> {
    const current = await this.readCrontab()
    const counters = new Map<string, number>()
    const result: string[] = []
    let removed = false

    const lines = current.split(/\r?\n/)
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const start = line.trim().match(/^# FlyEnv Cron Start (.+)$/)
      if (start) {
        result.push(line)
        index += 1
        while (index < lines.length) {
          result.push(lines[index])
          if (lines[index].trim() === `# FlyEnv Cron End ${start[1]}`) {
            break
          }
          index += 1
        }
        continue
      }

      const parsed = this.parseCronLine(line)
      if (parsed && !removed) {
        const trimmed = line.trim()
        const occurrence = counters.get(trimmed) ?? 0
        counters.set(trimmed, occurrence + 1)
        if (this.cronLineId(trimmed, occurrence) === taskId) {
          removed = true
          continue
        }
      }
      result.push(line)
    }

    if (!removed) {
      throw new Error('System task not found')
    }

    await this.writeCrontab(result.join('\n'))
  }

  async install(job: CronJob) {
    const scriptPath = await this.writeWrapper(job)
    await this.installCrontab(job, scriptPath)
  }

  async remove(jobId: string) {
    await this.removeCrontab(jobId)
    await remove(this.taskScriptPath(jobId)).catch(() => {})
  }

  async listSystemTasks(): Promise<SystemScheduledTask[]> {
    const content = await this.readCrontab()
    const lines = content.split(/\r?\n/)
    const counters = new Map<string, number>()
    const tasks: SystemScheduledTask[] = []

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const start = line.trim().match(/^# FlyEnv Cron Start (.+)$/)
      if (start) {
        const jobId = start[1]
        const block: string[] = []
        index += 1
        while (index < lines.length) {
          const current = lines[index]
          if (current.trim() === `# FlyEnv Cron End ${jobId}`) {
            break
          }
          block.push(current)
          index += 1
        }

        const cronLine = block.map((item) => this.parseCronLine(item)).find(Boolean)
        tasks.push({
          id: `flyenv:${jobId}`,
          platform: 'unix',
          name: systemTaskName(jobId),
          fullName: systemTaskName(jobId),
          schedule: cronLine?.schedule || '',
          command: cronLine?.command || '',
          nextRunTime: this.nextRunTime(cronLine?.schedule),
          state: 'Enabled',
          enabled: true,
          isFlyEnv: true,
          jobId,
          raw: block.join('\n')
        })
        continue
      }

      const parsed = this.parseCronLine(line)
      if (!parsed) {
        continue
      }

      const trimmed = line.trim()
      const occurrence = counters.get(trimmed) ?? 0
      counters.set(trimmed, occurrence + 1)
      tasks.push({
        id: this.cronLineId(trimmed, occurrence),
        platform: 'unix',
        name: parsed.command.slice(0, 80),
        fullName: `crontab:${index + 1}`,
        schedule: parsed.schedule,
        command: parsed.command,
        nextRunTime: this.nextRunTime(parsed.schedule),
        state: 'Enabled',
        enabled: true,
        isFlyEnv: false,
        raw: trimmed
      })
    }

    return tasks
  }

  async deleteSystemTask(id: string): Promise<void> {
    if (!id?.trim()) {
      throw new Error('System task id is required')
    }

    const flyEnv = id.match(/^flyenv:(.+)$/)
    if (flyEnv) {
      await this.remove(flyEnv[1])
      return
    }

    await this.removeCrontabLine(id)
  }
}
