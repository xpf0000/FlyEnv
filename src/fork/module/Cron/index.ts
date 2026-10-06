import { Base } from '../Base'
import type { CronJob, CronRunRecord, SoftInstalled, SystemScheduledTask } from '@shared/app'
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
import { performance } from 'node:perf_hooks'
import { logServiceStopBoundary, timeServiceStopBoundary } from '@shared/ServiceStopDiagnostics'

// ESM 的静态依赖已执行完才到这里；此计时仅覆盖 Cron 模块正文及单例构造。
// 模块按请求导入时才记录，不能用这段时间表示完整依赖加载耗时；按 workerPid 关联。
const moduleEvaluationStarted = performance.now()
logServiceStopBoundary('cron.module-evaluation.begin', { module: 'cron', workerPid: process.pid })

export class Cron extends Base {
  private cronRoot: string
  private initStarted = false
  private storage: CronStorage
  private runRecords: CronRunRecords
  private systemScheduler: CronSystemScheduler

  constructor() {
    super()
    // 只计 Cron 自身字段/伴随对象构造；Base 的 super 属于外层模块执行时间。
    const started = performance.now()
    logServiceStopBoundary('cron.constructor.begin', { module: 'cron', workerPid: process.pid })
    this.type = 'cron'
    this.cronRoot = cronBaseDir()
    this.storage = new CronStorage(join(this.cronRoot, 'cron-jobs.json'))
    this.runRecords = new CronRunRecords(this.cronRoot)
    this.systemScheduler = new CronSystemScheduler(this.cronRoot)
    logServiceStopBoundary('cron.constructor.completed', {
      module: 'cron',
      workerPid: process.pid,
      durationMs: Math.round(performance.now() - started)
    })
  }

  // 由 Cron 请求的通用派发器调用；保留单例防重及后台同步，不修复旧脚本。
  // UI 查询自身也会同步展示数据，后台失败不能阻断当前请求或其他模块命令。
  init() {
    const traceData = {
      module: 'cron',
      workerPid: process.pid
    }
    if (this.initStarted) {
      logServiceStopBoundary('cron.init.skipped', { ...traceData, reason: 'already-started' })
      return
    }
    this.initStarted = true
    // 仍是后台任务，不 await。记录完整同步终态，不把同步 init 返回伪报为元数据完成。
    timeServiceStopBoundary('cron.metadata-sync', traceData, () =>
      this.syncCronMetadata(traceData)
    ).catch((e) => {
      // 原错误接收者保持不变；计时包装记录后重抛的业务错误在此吸收，不影响服务命令。
      console.error('[Cron] sync cron metadata failed:', e)
    })
  }

  private async syncCronMetadata(traceData: Record<string, unknown>): Promise<void> {
    // 复用公共非阻塞计时/日志；不输出定时任务命令、运行输出或配置文件内容。
    // 每一步依然只执行一次；读取失败仍进入原后台 catch，不继续保存半成品。
    // 初始化只更新元数据，已有系统任务脚本的生成由明确的新增/修改/启用操作负责。
    const data = await timeServiceStopBoundary('cron.storage-load', traceData, () =>
      this.storage.load()
    )
    const jobs = flattenJobs(data)
    const metadataTrace = { ...traceData, jobCount: jobs.length }
    const nextRunsStarted = performance.now()
    logServiceStopBoundary('cron.next-runs.begin', metadataTrace)
    const nextRunsChanged = ensureNextRunTimes(data)
    logServiceStopBoundary('cron.next-runs.completed', {
      ...metadataTrace,
      durationMs: Math.round(performance.now() - nextRunsStarted),
      changed: nextRunsChanged
    })
    // 原条件用 ||：下次运行时间变更时不会同步运行记录，不能因细化日志而多做一次同步。
    let recordsChanged = false
    if (nextRunsChanged) {
      logServiceStopBoundary('cron.run-records-sync.skipped', {
        ...metadataTrace,
        reason: 'next-runs-changed'
      })
    } else {
      recordsChanged = await timeServiceStopBoundary('cron.run-records-sync', metadataTrace, () =>
        this.runRecords.syncLatest(data)
      )
    }
    if (nextRunsChanged || recordsChanged) {
      await timeServiceStopBoundary('cron.storage-save', metadataTrace, () =>
        this.storage.save(data)
      )
    } else {
      logServiceStopBoundary('cron.storage-save.skipped', { ...metadataTrace, reason: 'no-change' })
    }
  }

  private systemTaskJobId(systemTaskId: string): string | undefined {
    const unix = systemTaskId.match(/^flyenv:(.+)$/)
    if (unix) {
      return unix[1]
    }

    const task = systemTaskId.match(/(?:^|[\\/])FlyEnv-Cron-([^\\/]+)$/)
    return task?.[1]
  }

  private async removeLocalJobBySystemTaskId(systemTaskId: string): Promise<void> {
    const jobId = this.systemTaskJobId(systemTaskId)
    if (!jobId) {
      return
    }

    const data = await this.storage.load()
    const found = findJob(data, undefined, jobId)
    if (!found) {
      return
    }

    await this.systemScheduler.remove(jobId).catch(() => {})
    found.jobs.splice(found.index, 1)
    data[found.key] = found.jobs
    await this.storage.save(data)
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

  listSystemTasks(): ForkPromise<SystemScheduledTask[]> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const tasks = await this.systemScheduler.listSystemTasks()
        const data = (await this.storage.load().catch(() => ({}))) as CronStorageData
        const jobMap = new Map(flattenJobs(data).map((job) => [job.id, job]))

        resolve(
          tasks.map((task) => {
            const jobId = task.jobId ?? this.systemTaskJobId(task.id)
            const job = jobId ? jobMap.get(jobId) : undefined
            if (!job) {
              return task
            }

            return {
              ...task,
              name: job.name || task.name,
              description: job.description || task.description,
              isFlyEnv: true,
              jobId
            }
          })
        )
      } catch (error) {
        reject(error)
      }
    })
  }

  deleteSystemTask(id: string): ForkPromise<boolean> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await this.systemScheduler.deleteSystemTask(id)
        await this.removeLocalJobBySystemTaskId(id)
        resolve(true)
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

  getConfigFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    return [{ name: 'Cron Jobs', path: join(this.cronRoot, 'cron-jobs.json') }]
  }

  getLogFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    return []
  }
}

// 默认导出仍为同一个 Cron 单例；只在原构造之后记录模块执行完成，不触发额外 init。
const cron = new Cron()
logServiceStopBoundary('cron.module-evaluation.completed', {
  module: 'cron',
  workerPid: process.pid,
  durationMs: Math.round(performance.now() - moduleEvaluationStarted)
})
export default cron
