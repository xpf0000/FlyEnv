import { existsSync } from 'fs'
import { dirname } from 'path'
import { mkdirp, readFile, writeFile, copyFile } from '../../Fn'
import { normalizeCronData } from './utils'
import type { CronStorageData } from './types'

export class CronStorage {
  constructor(private cronDataPath: string) {}

  async load(): Promise<CronStorageData> {
    if (existsSync(this.cronDataPath)) {
      try {
        const content = await readFile(this.cronDataPath, 'utf-8')
        const data = JSON.parse(content || '{}') as CronStorageData
        return normalizeCronData(data)
      } catch (e) {
        console.error('[CronStorage] failed to parse cron-jobs.json:', e)
        try {
          await copyFile(this.cronDataPath, `${this.cronDataPath}.bak`)
        } catch {}
      }
    }
    return normalizeCronData({})
  }

  async save(data: CronStorageData): Promise<boolean> {
    await mkdirp(dirname(this.cronDataPath))
    await writeFile(this.cronDataPath, JSON.stringify(normalizeCronData(data), null, 2))
    return true
  }
}
