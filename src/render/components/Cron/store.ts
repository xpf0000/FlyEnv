import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { CronJob } from '@shared/app'

export const useCronStore = defineStore('cron', () => {
  const cronJobs = ref<Map<number, CronJob[]>>(new Map())
  const loading = ref(false)
  const selectedHostId = ref<number | null>(null)

  const getHostCronJobs = computed(() => (hostId: number) => {
    return cronJobs.value.get(hostId) || []
  })

  const setHostCronJobs = (hostId: number, jobs: CronJob[]) => {
    cronJobs.value.set(hostId, jobs)
  }

  const addCronJob = (hostId: number, job: CronJob) => {
    const jobs = cronJobs.value.get(hostId) || []
    jobs.push(job)
    cronJobs.value.set(hostId, jobs)
  }

  const updateCronJob = (hostId: number, jobId: string, updates: Partial<CronJob>) => {
    const jobs = cronJobs.value.get(hostId) || []
    const index = jobs.findIndex((j) => j.id === jobId)
    if (index !== -1) {
      jobs[index] = { ...jobs[index], ...updates }
      cronJobs.value.set(hostId, jobs)
    }
  }

  const removeCronJob = (hostId: number, jobId: string) => {
    const jobs = cronJobs.value.get(hostId) || []
    const index = jobs.findIndex((j) => j.id === jobId)
    if (index !== -1) {
      jobs.splice(index, 1)
      cronJobs.value.set(hostId, jobs)
    }
  }

  const clearHostCronJobs = (hostId: number) => {
    cronJobs.value.delete(hostId)
  }

  return {
    cronJobs,
    loading,
    selectedHostId,
    getHostCronJobs,
    setHostCronJobs,
    addCronJob,
    updateCronJob,
    removeCronJob,
    clearHostCronJobs
  }
})
