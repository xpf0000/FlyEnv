import { Base } from '../Base'
import type { CronJob, CronRunRecord } from '@shared/app'
import { ForkPromise } from '@shared/ForkPromise'
import { uuid } from '../../Fn'
import { join } from 'path'
import { executeCronCommand } from './Command'
import { CronRunRecords } from './RunRecords'
import { CronStorage } from './Storage'
import { CronSystemScheduler } from './SystemScheduler'
import {
  GLOBAL_HOST_ID,
  RUN_HISTORY_LIMIT,
  type CronCommandResult,
  type CronStorageData
} from './types'
import {
  computeNextRunTime,
  cronBaseDir,
  ensureNextRunTimes,
  findJob,
  flattenJobs,
  normalizeHostId,
  storageKey
} from './utils'

export class Cron extends Base {
  private cronRoot: string
  private initStarted = false
  private storage: CronStorage
  private runRecords: CronRunRecords
  private systemScheduler: CronSystemScheduler

  constructor() {
    super()
    this.type = 'cron'
    this.cronRoot = cronBaseDir()
    this.storage = new CronStorage(join(this.cronRoot, 'cron-jobs.json'))
    this.runRecords = new CronRunRecords(this.cronRoot)
    this.systemScheduler = new CronSystemScheduler(this.cronRoot)
  }

  init() {
    if (this.initStarted) {
      return
    }
    this.initStarted = true
    this.syncCronMetadata().catch((e) => {
      console.error('[Cron] sync cron metadata failed:', e)
    })
  }

  private async syncCronMetadata(): Promise<void> {
    const data = await this.storage.load()
    if (ensureNextRunTimes(data) || (await this.runRecords.syncLatest(data))) {
      await this.storage.save(data)
    }
  }

  private resolveJobHostId(hostId: number | undefined | null, job: Partial<CronJob>): number {
    if (job.scope === 'global') {
      return GLOBAL_HOST_ID
    }
    return normalizeHostId(job.hostId ?? hostId)
  }

  addCronJob(
    hostId: number | undefined | null,
    job: Omit<CronJob, 'id' | 'createdAt' | 'updatedAt'>
  ): ForkPromise<CronJob> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const data = await this.storage.load()
        const targetHostId = this.resolveJobHostId(hostId, job)
        const scope = targetHostId > 0 ? 'host' : 'global'
        const newJob: CronJob = {
          ...job,
          id: uuid(),
          hostId: targetHostId > 0 ? targetHostId : undefined,
          scope,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          nextRunTime: job.enabled ? computeNextRunTime(job.schedule, new Date()) : 0
        }
        const appliedJob = await this.systemScheduler.apply(newJob)
        const key = storageKey(targetHostId)
        data[key] = data[key] || []
        data[key].push(appliedJob)
        await this.storage.save(data)
        resolve(appliedJob)
      } catch (error) {
        reject(error)
      }
    })
  }

  updateCronJob(
    hostId: number | undefined | null,
    jobId: string,
    updates: Partial<CronJob>
  ): ForkPromise<CronJob> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const data = await this.storage.load()
        const found = findJob(data, hostId, jobId)

        if (!found) {
          throw new Error('Cron job not found')
        }

        const targetHostId = this.resolveJobHostId(found.hostId, updates)
        const targetKey = storageKey(targetHostId)
        const updatedJob: CronJob = {
          ...found.job,
          ...updates,
          id: jobId,
          hostId: targetHostId > 0 ? targetHostId : undefined,
          scope: targetHostId > 0 ? 'host' : 'global',
          createdAt: found.job.createdAt,
          updatedAt: Date.now(),
          nextRunTime:
            (updates.enabled ?? found.job.enabled)
              ? computeNextRunTime(updates.schedule ?? found.job.schedule, new Date())
              : 0
        }

        const appliedJob = await this.systemScheduler.apply(updatedJob)
        found.jobs.splice(found.index, 1)
        data[found.key] = found.jobs
        data[targetKey] = data[targetKey] || []
        data[targetKey].push(appliedJob)
        await this.storage.save(data)

        resolve(appliedJob)
      } catch (error) {
        reject(error)
      }
    })
  }

  deleteCronJob(hostId: number | undefined | null, jobId: string): ForkPromise<boolean> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const data = await this.storage.load()
        const found = findJob(data, hostId, jobId)

        if (!found) {
          throw new Error('Cron job not found')
        }

        await this.systemScheduler.remove(jobId)
        found.jobs.splice(found.index, 1)
        data[found.key] = found.jobs
        await this.storage.save(data)

        resolve(true)
      } catch (error) {
        reject(error)
      }
    })
  }

  getCronJobs(hostId?: number | null): ForkPromise<CronJob[]> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const data = await this.storage.load()
        const changedNext = ensureNextRunTimes(data)
        const changedRuns = await this.runRecords.syncLatest(data)
        if (changedNext || changedRuns) {
          await this.storage.save(data)
        }
        if (typeof hostId === 'number') {
          resolve(data[storageKey(hostId)] || [])
          return
        }
        resolve(flattenJobs(data))
      } catch (error) {
        reject(error)
      }
    })
  }

  listAllCronJobs(): ForkPromise<CronStorageData> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const data = await this.storage.load()
        if (await this.runRecords.syncLatest(data)) {
          await this.storage.save(data)
        }
        resolve(data)
      } catch (error) {
        reject(error)
      }
    })
  }

  listRunRecords(jobId: string, limit = RUN_HISTORY_LIMIT): ForkPromise<CronRunRecord[]> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        resolve(await this.runRecords.read(jobId, limit))
      } catch (error) {
        reject(error)
      }
    })
  }

  toggleCronJob(
    hostId: number | undefined | null,
    jobId: string,
    enabled: boolean
  ): ForkPromise<CronJob> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const data = await this.storage.load()
        const found = findJob(data, hostId, jobId)

        if (!found) {
          throw new Error('Cron job not found')
        }

        const job: CronJob = {
          ...found.job,
          enabled,
          updatedAt: Date.now(),
          nextRunTime: enabled ? computeNextRunTime(found.job.schedule, new Date()) : 0
        }
        const appliedJob = await this.systemScheduler.apply(job)
        found.jobs[found.index] = appliedJob
        data[found.key] = found.jobs
        await this.storage.save(data)

        resolve(appliedJob)
      } catch (error) {
        reject(error)
      }
    })
  }

  runJobNow(
    hostId: number | undefined | null,
    jobId: string,
    workDir?: string
  ): ForkPromise<CronCommandResult> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const data = await this.storage.load()
        const found = findJob(data, hostId, jobId)

        if (!found) {
          reject(new Error('Cron job not found'))
          return
        }

        const result = await executeCronCommand(
          found.job.command,
          workDir || found.job.workDir || ''
        )
        const record = await this.runRecords.append(found.job, result)

        found.jobs[found.index] = {
          ...found.job,
          lastRunTime: record.finishedAt,
          lastOutput: result.output,
          lastError: result.error,
          lastExitCode: result.exitCode,
          updatedAt: record.finishedAt,
          nextRunTime: computeNextRunTime(found.job.schedule, new Date(record.finishedAt))
        }
        data[found.key] = found.jobs
        await this.storage.save(data)

        resolve(result)
      } catch (error) {
        reject(error)
      }
    })
  }

  runCommand(workDir: string, command: string): ForkPromise<CronCommandResult> {
    return new ForkPromise(async (resolve) => {
      const result = await executeCronCommand(command, workDir)
      resolve(result)
    })
  }
}

export default new Cron()
