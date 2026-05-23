import { existsSync } from 'fs'
import { dirname } from 'path'
import { mkdirp, readFile, writeFile } from '../../Fn'
import { normalizeCronData } from './utils'
import type { CronStorageData } from './types'

export class CronStorage {
  constructor(private cronDataPath: string) {}

  async load(): Promise<CronStorageData> {
    if (existsSync(this.cronDataPath)) {
      const content = await readFile(this.cronDataPath, 'utf-8')
      const data = JSON.parse(content || '{}') as CronStorageData
      return normalizeCronData(data)
    }
    return normalizeCronData({})
  }

  async save(data: CronStorageData): Promise<boolean> {
    await mkdirp(dirname(this.cronDataPath))
    await writeFile(this.cronDataPath, JSON.stringify(normalizeCronData(data), null, 2))
    return true
  }
}
