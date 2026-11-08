import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { PItem } from '@shared/Process'
import type { ServiceStopTarget } from '@shared/ServiceStopContext'
import { collectProcessSnapshotTree } from '@shared/ProcessSnapshot'

const canonical = async (path: string) => realpath(path).catch(() => resolve(path))
const run = promisify(execFile)
export async function processExecutables(pid: string): Promise<string[]> {
  if (!/^[1-9]\d*$/.test(pid)) throw new Error('Cannot verify PHP process identity')
  if (process.platform === 'linux') return [await realpath(`/proc/${pid}/exe`)]
  if (process.platform !== 'darwin') throw new Error('Cannot verify PHP process executable')
  const { stdout } = await run('/usr/sbin/lsof', ['-a', '-p', pid, '-d', 'txt', '-Fn'], {
    timeout: 10_000,
    maxBuffer: 1024 * 1024
  })
  return stdout
    .split('\n')
    .filter((line) => line.startsWith('n/'))
    .map((line) => line.slice(1))
}

/** An installation mutation must not recover a different root from shared series config/PID files. */
export async function selectScopedPhpStop(
  target: ServiceStopTarget,
  list: PItem[],
  executables = processExecutables
): Promise<string[]> {
  const root = list.find((item) => item.PID === target.pid)
  if (!root) {
    if (list.some((item) => item.PPID === target.pid))
      throw new Error('Cannot verify descendants of missing PHP root')
    return []
  }
  const expected = await canonical(target.bin)
  const paths = await executables(target.pid)
  if (!(await Promise.all(paths.map(canonical))).includes(expected))
    throw new Error('Cannot verify registered PHP root executable; update stopped')
  return collectProcessSnapshotTree(target.pid, list).map((item) => item.PID)
}
