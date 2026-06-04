import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CronJob, SystemScheduledTask } from '@shared/app'

export const useCronStore = defineStore('cron', () => {
  const cronJobs = ref<Map<string, CronJob[]>>(new Map())
  const systemTasks = ref<SystemScheduledTask[]>([])
  const systemTasksLoaded = ref(false)
  const loading = ref(false)
  const selectedHostId = ref<number | null>(null)

  const hostCacheKey = (hostId?: number) => {
    return typeof hostId === 'number' ? `${hostId}` : 'all'
  }

  const getHostCronJobs = (hostId?: number) => {
    return cronJobs.value.get(hostCacheKey(hostId)) || []
  }

  const hasHostCronJobs = (hostId?: number) => {
    return cronJobs.value.has(hostCacheKey(hostId))
  }

  const setHostCronJobs = (hostId: number | undefined, jobs: CronJob[]) => {
    cronJobs.value.set(hostCacheKey(hostId), jobs)
  }

  const addCronJob = (hostId: number, job: CronJob) => {
    const jobs = cronJobs.value.get(hostCacheKey(hostId)) || []
    jobs.push(job)
    cronJobs.value.set(hostCacheKey(hostId), jobs)
  }

  const updateCronJob = (hostId: number, jobId: string, updates: Partial<CronJob>) => {
    const jobs = cronJobs.value.get(hostCacheKey(hostId)) || []
    const index = jobs.findIndex((j) => j.id === jobId)
    if (index !== -1) {
      jobs[index] = { ...jobs[index], ...updates }
      cronJobs.value.set(hostCacheKey(hostId), jobs)
    }
  }

  const removeCronJob = (hostId: number, jobId: string) => {
    const jobs = cronJobs.value.get(hostCacheKey(hostId)) || []
    const index = jobs.findIndex((j) => j.id === jobId)
    if (index !== -1) {
      jobs.splice(index, 1)
      cronJobs.value.set(hostCacheKey(hostId), jobs)
    }
  }

  const upsertCronJob = (job: CronJob) => {
    for (const [key, jobs] of cronJobs.value.entries()) {
      const index = jobs.findIndex((item) => item.id === job.id)
      if (index >= 0) {
        jobs[index] = job
        cronJobs.value.set(key, [...jobs])
      }
    }
  }

  const clearHostCronJobs = (hostId?: number) => {
    cronJobs.value.delete(hostCacheKey(hostId))
  }

  const clearAllCronJobs = () => {
    cronJobs.value.clear()
  }

  const setSystemTasks = (tasks: SystemScheduledTask[]) => {
    systemTasks.value = tasks
    systemTasksLoaded.value = true
  }

  const clearSystemTasks = () => {
    systemTasks.value = []
    systemTasksLoaded.value = false
  }

  return {
    cronJobs,
    systemTasks,
    systemTasksLoaded,
    loading,
    selectedHostId,
    hostCacheKey,
    getHostCronJobs,
    hasHostCronJobs,
    setHostCronJobs,
    addCronJob,
    updateCronJob,
    removeCronJob,
    upsertCronJob,
    clearHostCronJobs,
    clearAllCronJobs,
    setSystemTasks,
    clearSystemTasks
  }
})
