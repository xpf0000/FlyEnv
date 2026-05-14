import { Base } from '../Base'
import { I18nT } from '@lang/index'
import type { CronJob, AppHost } from '@shared/app'
import { ForkPromise } from '@shared/ForkPromise'
import { uuid, readFile, writeFile, readdir, mkdirp } from '../../Fn'
import { join, dirname } from 'path'
import { existsSync } from 'fs'
import { isLinux, isMacOS, isWindows } from '@shared/utils'
import { execPromise } from '../../Fn'

interface CronStorageData {
  [hostId: number]: CronJob[]
}

export class Cron extends Base {
  private cronDataPath: string
  private schedulerTimer: NodeJS.Timeout | null = null
  private schedulerBusy = false
  private runningJobs = new Set<string>()

  constructor() {
    super()
    this.type = 'cron'
    const homePath = process.env.HOME || process.env.USERPROFILE || ''
    this.cronDataPath = join(homePath, '.flyenv', 'cron-jobs.json')
    this.startScheduler()
  }

  private startScheduler() {
    if (this.schedulerTimer) {
      return
    }

    this.schedulerTimer = setInterval(() => {
      this.tickScheduler().catch(() => {})
    }, 15000)

    this.tickScheduler().catch(() => {})
  }

  private async tickScheduler() {
    if (this.schedulerBusy) {
      return
    }
    this.schedulerBusy = true

    try {
      const data = await this.loadCronData()
      const now = new Date()
      const nowTs = now.getTime()
      const nowMinute = Math.floor(nowTs / 60000)
      let changed = false

      for (const [hostIdText, jobs] of Object.entries(data)) {
        const hostId = Number(hostIdText)

        for (let i = 0; i < jobs.length; i++) {
          const job = jobs[i]

          if (!job.enabled) {
            if ((job.nextRunTime ?? 0) !== 0) {
              job.nextRunTime = 0
              changed = true
            }
            continue
          }

          const nextTs = this.computeNextRunTime(job.schedule, now)
          if ((job.nextRunTime ?? 0) !== nextTs) {
            job.nextRunTime = nextTs
            changed = true
          }

          const lastRunMinute = job.lastRunTime ? Math.floor(job.lastRunTime / 60000) : -1
          if (lastRunMinute === nowMinute) {
            continue
          }

          if (!this.matchCronNow(job.schedule, now)) {
            continue
          }

          const runKey = `${hostId}:${job.id}`
          if (this.runningJobs.has(runKey)) {
            continue
          }

          this.runningJobs.add(runKey)
          try {
            const result = await this.executeCommand(job.command, job.workDir || '')
            jobs[i] = {
              ...jobs[i],
              lastRunTime: Date.now(),
              lastOutput: result.output,
              lastError: result.error,
              lastExitCode: result.exitCode,
              updatedAt: Date.now(),
              nextRunTime: this.computeNextRunTime(job.schedule, new Date())
            }
            changed = true
          } finally {
            this.runningJobs.delete(runKey)
          }
        }
      }

      if (changed) {
        await this.saveCronData(data)
      }
    } finally {
      this.schedulerBusy = false
    }
  }

  private parseNumber(value: string): number | null {
    if (!/^\d+$/.test(value)) {
      return null
    }
    return Number(value)
  }

  private matchField(field: string, value: number, min: number, max: number): boolean {
    const segments = field.split(',').map((s) => s.trim()).filter(Boolean)
    if (segments.length === 0) {
      return false
    }

    for (const segment of segments) {
      if (segment === '*') {
        return true
      }

      let base = segment
      let step = 1
      if (segment.includes('/')) {
        const [b, s] = segment.split('/')
        base = b
        const parsedStep = this.parseNumber(s)
        if (!parsedStep || parsedStep <= 0) {
          continue
        }
        step = parsedStep
      }

      let rangeStart = min
      let rangeEnd = max

      if (base === '*' || base === '') {
        rangeStart = min
        rangeEnd = max
      } else if (base.includes('-')) {
        const [startText, endText] = base.split('-')
        const start = this.parseNumber(startText)
        const end = this.parseNumber(endText)
        if (start === null || end === null) {
          continue
        }
        rangeStart = Math.max(min, start)
        rangeEnd = Math.min(max, end)
      } else {
        const exact = this.parseNumber(base)
        if (exact === null) {
          continue
        }
        rangeStart = exact
        rangeEnd = exact
      }

      if (value < rangeStart || value > rangeEnd) {
        continue
      }

      if ((value - rangeStart) % step === 0) {
        return true
      }
    }

    return false
  }

  private matchCronNow(schedule: string, now: Date): boolean {
    const parts = schedule.trim().split(/\s+/)
    if (parts.length !== 5) {
      return false
    }

    const [min, hour, day, month, weekday] = parts
    const weekdayValue = now.getDay()
    const weekdayField = weekday.replace(/\b7\b/g, '0')

    const minuteOk = this.matchField(min, now.getMinutes(), 0, 59)
    const hourOk = this.matchField(hour, now.getHours(), 0, 23)
    const dayOk = this.matchField(day, now.getDate(), 1, 31)
    const monthOk = this.matchField(month, now.getMonth() + 1, 1, 12)
    const weekdayOk = this.matchField(weekdayField, weekdayValue, 0, 6)

    return minuteOk && hourOk && dayOk && monthOk && weekdayOk
  }

  private computeNextRunTime(schedule: string, fromDate: Date): number {
    const probe = new Date(fromDate.getTime())
    probe.setSeconds(0, 0)
    probe.setMinutes(probe.getMinutes() + 1)

    const maxChecks = 60 * 24 * 366
    for (let i = 0; i < maxChecks; i++) {
      if (this.matchCronNow(schedule, probe)) {
        return probe.getTime()
      }
      probe.setMinutes(probe.getMinutes() + 1)
    }

    return 0
  }

  private async ensureNextRunTimes(data: CronStorageData): Promise<boolean> {
    const now = new Date()
    let changed = false

    for (const jobs of Object.values(data)) {
      for (const job of jobs) {
        const nextTs = job.enabled ? this.computeNextRunTime(job.schedule, now) : 0
        if ((job.nextRunTime ?? 0) !== nextTs) {
          job.nextRunTime = nextTs
          changed = true
        }
      }
    }

    return changed
  }

  private async executeCommand(
    command: string,
    workDir: string
  ): Promise<{ output: string; error: string; exitCode: number; duration: number }> {
    const cwd = workDir || (process.env.HOME ?? process.env.USERPROFILE ?? '')
    const start = Date.now()
    let output = ''
    let error = ''
    let exitCode = 0

    try {
      const result = await execPromise(command, { cwd, timeout: 60000 })
      output = result.stdout || ''
      error = result.stderr || ''
    } catch (err: any) {
      error = err?.stderr || err?.message || String(err)
      exitCode = err?.code ?? 1
    }

    return { output, error, exitCode, duration: Date.now() - start }
  }

  /**
   * إضافة وظيفة cron جديدة
   */
  addCronJob(hostId: number, job: Omit<CronJob, 'id' | 'createdAt' | 'updatedAt'>): ForkPromise<CronJob> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const data = await this.loadCronData()
        const newJob: CronJob = {
          ...job,
          id: uuid(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          nextRunTime: job.enabled ? this.computeNextRunTime(job.schedule, new Date()) : 0
        }

        if (!data[hostId]) {
          data[hostId] = []
        }

        data[hostId].push(newJob)
        await this.saveCronData(data)
        
        // تطبيق الـ Cron على النظام
        await this.applyCronJob(newJob)
        resolve(newJob)
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * تحديث وظيفة cron
   */
  updateCronJob(hostId: number, jobId: string, updates: Partial<CronJob>): ForkPromise<CronJob> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const data = await this.loadCronData()
        const jobs = data[hostId] || []
        const jobIndex = jobs.findIndex((j) => j.id === jobId)

        if (jobIndex === -1) {
          throw new Error('Cron job not found')
        }

        const oldJob = jobs[jobIndex]
        const updatedJob: CronJob = {
          ...oldJob,
          ...updates,
          id: jobId,
          createdAt: oldJob.createdAt,
          updatedAt: Date.now(),
          nextRunTime: (updates.enabled ?? oldJob.enabled)
            ? this.computeNextRunTime(updates.schedule ?? oldJob.schedule, new Date())
            : 0
        }

        // إزالة الوظيفة القديمة
        await this.removeCronJob(hostId, jobId)

        // إضافة الوظيفة الجديدة
        await this.applyCronJob(updatedJob)

        jobs[jobIndex] = updatedJob
        data[hostId] = jobs
        await this.saveCronData(data)

        resolve(updatedJob)
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * حذف وظيفة cron
   */
  deleteCronJob(hostId: number, jobId: string): ForkPromise<boolean> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const data = await this.loadCronData()
        const jobs = data[hostId] || []
        const jobIndex = jobs.findIndex((j) => j.id === jobId)

        if (jobIndex === -1) {
          throw new Error('Cron job not found')
        }

        const job = jobs[jobIndex]
        await this.removeCronJob(hostId, jobId)

        jobs.splice(jobIndex, 1)
        data[hostId] = jobs
        await this.saveCronData(data)

        resolve(true)
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * الحصول على جميع وظائف cron للموقع
   */
  getCronJobs(hostId: number): ForkPromise<CronJob[]> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const data = await this.loadCronData()
        const changed = await this.ensureNextRunTimes(data)
        if (changed) {
          await this.saveCronData(data)
        }
        const jobs = data[hostId] || []
        resolve(jobs)
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * تطبيق وظيفة cron على النظام
   */
  private applyCronJob(job: CronJob): ForkPromise<boolean> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        if (!job.enabled) {
          resolve(true)
          return
        }

        if (isLinux() || isMacOS()) {
          // إضافة إلى crontab
          const cronEntry = `${job.schedule} ${job.command}`
          // Implementation for crontab
          resolve(true)
        } else if (isWindows()) {
          // إضافة إلى Windows Task Scheduler
          // Implementation for Task Scheduler
          resolve(true)
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * إزالة وظيفة cron من النظام
   */
  private removeCronJob(hostId: number, jobId: string): ForkPromise<boolean> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const data = await this.loadCronData()
        const jobs = data[hostId] || []
        const job = jobs.find((j) => j.id === jobId)

        if (!job) {
          resolve(true)
          return
        }

        if (isLinux() || isMacOS()) {
          // إزالة من crontab
          // Implementation
        } else if (isWindows()) {
          // إزالة من Windows Task Scheduler
          // Implementation
        }

        resolve(true)
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * تحميل بيانات الـ Cron
   */
  private loadCronData(): ForkPromise<CronStorageData> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        if (existsSync(this.cronDataPath)) {
          const content = await readFile(this.cronDataPath)
          const data = JSON.parse(content) as CronStorageData
          resolve(data)
        } else {
          resolve({})
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * حفظ بيانات الـ Cron
   */
  private saveCronData(data: CronStorageData): ForkPromise<boolean> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await mkdirp(dirname(this.cronDataPath))
        await writeFile(this.cronDataPath, JSON.stringify(data, null, 2))
        resolve(true)
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * قائمة جميع وظائف cron النشطة
   */
  listAllCronJobs(): ForkPromise<CronStorageData> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const data = await this.loadCronData()
        resolve(data)
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * تفعيل/تعطيل وظيفة cron
   */
  toggleCronJob(hostId: number, jobId: string, enabled: boolean): ForkPromise<CronJob> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const data = await this.loadCronData()
        const jobs = data[hostId] || []
        const job = jobs.find((j) => j.id === jobId)

        if (!job) {
          throw new Error('Cron job not found')
        }

        job.enabled = enabled
        job.updatedAt = Date.now()
        job.nextRunTime = enabled ? this.computeNextRunTime(job.schedule, new Date()) : 0

        if (enabled) {
          await this.applyCronJob(job)
        } else {
          await this.removeCronJob(hostId, jobId)
        }

        data[hostId] = jobs
        await this.saveCronData(data)

        resolve(job)
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Run a cron job immediately (test run) inside the given workDir
   */
  runJobNow(
    hostId: number,
    jobId: string,
    workDir?: string
  ): ForkPromise<{ output: string; error: string; exitCode: number; duration: number }> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const data = await this.loadCronData()
        const jobs = data[hostId] || []
        const job = jobs.find((j) => j.id === jobId)

        if (!job) {
          reject(new Error('Cron job not found'))
          return
        }

        const result = await this.executeCommand(job.command, workDir || job.workDir || '')

        // Persist last run metadata
        const jobIndex = jobs.findIndex((j) => j.id === jobId)
        if (jobIndex !== -1) {
          jobs[jobIndex].lastRunTime = Date.now()
          jobs[jobIndex].lastOutput = result.output
          jobs[jobIndex].lastError = result.error
          jobs[jobIndex].lastExitCode = result.exitCode
          jobs[jobIndex].updatedAt = Date.now()
          jobs[jobIndex].nextRunTime = this.computeNextRunTime(jobs[jobIndex].schedule, new Date())
          data[hostId] = jobs
          await this.saveCronData(data)
        }

        resolve(result)
      } catch (error) {
        reject(error)
      }
    })
  }

  runCommand(
    workDir: string,
    command: string
  ): ForkPromise<{ output: string; error: string; exitCode: number; duration: number }> {
    return new ForkPromise(async (resolve) => {
      const result = await this.executeCommand(command, workDir)
      resolve(result)
    })
  }
}

export default new Cron()
