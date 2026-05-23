import type { CronJob, CronRunRecord } from '@shared/app'
import { existsSync } from 'fs'
import { dirname } from 'path'
import { appendFile, mkdirp, readFile, uuid } from '../../Fn'
import { decodeBase64, flattenJobs, runLogPath } from './utils'
import { RUN_HISTORY_LIMIT, type CronCommandResult, type CronStorageData } from './types'

export class CronRunRecords {
  constructor(private cronRoot: string) {}

  private runLogPath(jobId: string): string {
    return runLogPath(this.cronRoot, jobId)
  }

  private normalizeRunRecord(raw: any): CronRunRecord {
    return {
      ...raw,
      output: raw?.output ?? decodeBase64(raw?.outputBase64),
      error: raw?.error ?? decodeBase64(raw?.errorBase64)
    }
  }

  async read(jobId: string, limit = RUN_HISTORY_LIMIT): Promise<CronRunRecord[]> {
    const file = this.runLogPath(jobId)
    if (!existsSync(file)) {
      return []
    }

    const content = await readFile(file, 'utf-8')
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-limit)
      .map((line) => {
        try {
          return this.normalizeRunRecord(JSON.parse(line))
        } catch {
          return undefined
        }
      })
      .filter(Boolean) as CronRunRecord[]
  }

  async readLatest(jobId: string): Promise<CronRunRecord | undefined> {
    const records = await this.read(jobId, 1)
    return records[0]
  }

  async append(job: CronJob, result: CronCommandResult): Promise<CronRunRecord> {
    const finishedAt = Date.now()
    const record: CronRunRecord = {
      id: uuid(),
      jobId: job.id,
      hostId: job.hostId,
      scope: job.scope,
      startedAt: finishedAt - result.duration,
      finishedAt,
      duration: result.duration,
      exitCode: result.exitCode,
      output: result.output,
      error: result.error
    }

    const file = this.runLogPath(job.id)
    await mkdirp(dirname(file))
    await appendFile(file, `${JSON.stringify(record)}\n`)
    return record
  }

  applyToJob(job: CronJob, record: CronRunRecord): boolean {
    if (!record?.finishedAt || (job.lastRunTime ?? 0) >= record.finishedAt) {
      return false
    }
    job.lastRunTime = record.finishedAt
    job.lastOutput = record.output ?? ''
    job.lastError = record.error ?? ''
    job.lastExitCode = record.exitCode
    job.updatedAt = Math.max(job.updatedAt ?? 0, record.finishedAt)
    return true
  }

  async syncLatest(data: CronStorageData): Promise<boolean> {
    let changed = false
    for (const job of flattenJobs(data)) {
      const record = await this.readLatest(job.id)
      if (record && this.applyToJob(job, record)) {
        changed = true
      }
    }
    return changed
  }
}
