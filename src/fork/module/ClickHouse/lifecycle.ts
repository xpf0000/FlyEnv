import { join } from 'node:path'
import { md5 } from '@shared/utils'

export function clickHouseVersionPidFile(baseDir: string, bin: string): string {
  return join(baseDir, 'pid', `clickhouse-${md5(bin)}.pid`)
}
