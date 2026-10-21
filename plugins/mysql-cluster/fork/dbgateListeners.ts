import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { loopbackListeningPidsFromLsof } from '@shared/Process'
import { fetchLoopbackListeningPids as windowsListeners } from '@shared/Process.win'

/** DbGate binds an IPv6 wildcard by default; runtime still verifies private process ownership. */
export async function dbGateListeningPids(port: string): Promise<string[]> {
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    throw new Error('Invalid DbGate port')
  if (process.platform === 'win32') return windowsListeners(port)
  try {
    const { stdout } = await promisify(execFile)(
      process.platform === 'darwin' ? '/usr/sbin/lsof' : 'lsof',
      ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'],
      { timeout: 15_000, maxBuffer: 1024 * 1024 }
    )
    if (!stdout.trim()) throw new Error('Empty DbGate listener query result')
    return loopbackListeningPidsFromLsof(stdout)
  } catch (error) {
    const result = error as { code?: number; stdout?: string; stderr?: string }
    if (result.code === 1 && !result.stdout?.trim() && !result.stderr?.trim()) return []
    throw error
  }
}
