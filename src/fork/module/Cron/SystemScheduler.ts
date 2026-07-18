import type { CronJob, SystemScheduledTask } from '@shared/app'
import { assertPortableCronExpression } from '@shared/CronExpression'
import { isLinux, isMacOS, isWindows } from '@shared/utils'
import { mkdirp } from '../../Fn'
import { systemTaskName } from './utils'
import { UnixSystemScheduler } from './UnixSystemScheduler'
import { WindowsSystemScheduler } from './WindowsSystemScheduler'

interface PlatformSystemScheduler {
  install(job: CronJob): Promise<void>
  remove(jobId: string): Promise<void>
  repair?(jobs: CronJob[]): Promise<void>
  listSystemTasks(): Promise<SystemScheduledTask[]>
  deleteSystemTask(id: string): Promise<void>
}

export class CronSystemScheduler {
  private unixScheduler: UnixSystemScheduler
  private windowsScheduler: WindowsSystemScheduler

  constructor(private cronRoot: string) {
    this.unixScheduler = new UnixSystemScheduler(cronRoot)
    this.windowsScheduler = new WindowsSystemScheduler(cronRoot)
  }

  private platformScheduler(): PlatformSystemScheduler | undefined {
    if (isLinux() || isMacOS()) {
      return this.unixScheduler
    }
    if (isWindows()) {
      return this.windowsScheduler
    }
    return undefined
  }

  async remove(jobId: string) {
    await this.platformScheduler()?.remove(jobId)
  }

  async repair(jobs: CronJob[]): Promise<void> {
    await this.platformScheduler()?.repair?.(jobs)
  }

  async listSystemTasks(): Promise<SystemScheduledTask[]> {
    return (await this.platformScheduler()?.listSystemTasks()) || []
  }

  async deleteSystemTask(id: string) {
    await this.platformScheduler()?.deleteSystemTask(id)
  }

  async apply(job: CronJob): Promise<CronJob> {
    const scheduler = this.platformScheduler()

    if (!job.enabled) {
      await scheduler?.remove(job.id)
      return {
        ...job,
        systemRegistered: false,
        systemTaskName: undefined,
        systemError: undefined
      }
    }

    assertPortableCronExpression(job.schedule)
    if (!scheduler) {
      throw new Error('Cron system scheduler is not supported on this platform')
    }

    try {
      await mkdirp(this.cronRoot)
      await scheduler.remove(job.id)
      await scheduler.install(job)

      return {
        ...job,
        systemRegistered: true,
        systemTaskName: systemTaskName(job.id),
        systemError: undefined
      }
    } catch (e: any) {
      return {
        ...job,
        systemRegistered: false,
        systemTaskName: systemTaskName(job.id),
        systemError: e?.message || `${e}`
      }
    }
  }
}
