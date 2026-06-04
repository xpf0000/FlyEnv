import type { CronJob } from '@shared/app'
import { computeNextCronRun } from '@shared/CronExpression'
import { homedir } from 'os'
import { join } from 'path'
import {
  GLOBAL_HOST_ID,
  type CronFindResult,
  type CronStorageData,
  type CronTaskScriptExt
} from './types'

export function homePath(): string {
  return homedir() || process.env.HOME || process.env.USERPROFILE || ''
}

export function cronBaseDir(): string {
  return join(global.Server.BaseDir!, 'cron')
}

export function storageKey(hostId?: number | null): string {
  const id = Number(hostId ?? GLOBAL_HOST_ID)
  return Number.isFinite(id) && id > 0 ? `${id}` : `${GLOBAL_HOST_ID}`
}

export function normalizeHostId(hostId?: number | null): number {
  const id = Number(hostId ?? GLOBAL_HOST_ID)
  return Number.isFinite(id) && id > 0 ? id : GLOBAL_HOST_ID
}

export function normalizeJob(job: CronJob, hostId: number): CronJob {
  const normalizedHostId = normalizeHostId(job.hostId ?? hostId)
  const scope = job.scope ?? (normalizedHostId > 0 ? 'host' : 'global')
  return {
    ...job,
    hostId: normalizedHostId > 0 ? normalizedHostId : undefined,
    scope
  }
}

export function normalizeCronData(data: CronStorageData): CronStorageData {
  const normalized: CronStorageData = {}
  for (const [key, jobs] of Object.entries(data || {})) {
    const hostId = normalizeHostId(Number(key))
    const keyName = storageKey(hostId)
    const normalizedJobs = Array.isArray(jobs) ? jobs.map((job) => normalizeJob(job, hostId)) : []
    normalized[keyName] = [...(normalized[keyName] || []), ...normalizedJobs]
  }
  if (!normalized[storageKey(GLOBAL_HOST_ID)]) {
    normalized[storageKey(GLOBAL_HOST_ID)] = []
  }
  return normalized
}

export function flattenJobs(data: CronStorageData): CronJob[] {
  return Object.values(data)
    .flat()
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

export function findJob(
  data: CronStorageData,
  hostId: number | undefined | null,
  jobId: string
): CronFindResult | undefined {
  const preferredKey = typeof hostId === 'number' ? storageKey(hostId) : ''
  const keys = preferredKey
    ? [preferredKey, ...Object.keys(data).filter((key) => key !== preferredKey)]
    : Object.keys(data)

  for (const key of keys) {
    const jobs = data[key] || []
    const index = jobs.findIndex((job) => job.id === jobId)
    if (index >= 0) {
      return {
        key,
        hostId: normalizeHostId(Number(key)),
        jobs,
        index,
        job: jobs[index]
      }
    }
  }

  return undefined
}

export function computeNextRunTime(schedule: string, fromDate: Date): number {
  try {
    return computeNextCronRun(schedule, fromDate)
  } catch {
    return 0
  }
}

export function ensureNextRunTimes(data: CronStorageData): boolean {
  const now = new Date()
  let changed = false

  for (const jobs of Object.values(data)) {
    for (const job of jobs) {
      const nextTs = job.enabled ? computeNextRunTime(job.schedule, now) : 0
      if ((job.nextRunTime ?? 0) !== nextTs) {
        job.nextRunTime = nextTs
        changed = true
      }
    }
  }

  return changed
}

export function runLogPath(cronRoot: string, jobId: string): string {
  return join(cronRoot, 'runs', `${jobId}.jsonl`)
}

export function taskScriptPath(cronRoot: string, jobId: string, ext: CronTaskScriptExt): string {
  return join(cronRoot, 'tasks', `${jobId}.${ext}`)
}

export function systemTaskName(jobId: string): string {
  return `FlyEnv-Cron-${jobId}`
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function base64(value: string): string {
  return Buffer.from(value, 'utf-8').toString('base64')
}

export function decodeBase64(value?: string): string {
  if (!value) {
    return ''
  }
  try {
    return Buffer.from(value, 'base64').toString('utf-8')
  } catch {
    return ''
  }
}
