import type { CronJob } from '@shared/app'

export type CronStorageData = Record<string, CronJob[]>

export interface CronFindResult {
  key: string
  hostId: number
  jobs: CronJob[]
  index: number
  job: CronJob
}

export interface CronCommandResult {
  output: string
  error: string
  exitCode: number
  duration: number
}

export type CronTaskScriptExt = 'sh' | 'ps1' | 'cmd'

export const GLOBAL_HOST_ID = 0
export const RUN_HISTORY_LIMIT = 50
