import IPC from '@/util/IPC'
import type { DbGateNode } from './dbgateController'

/** Sensitive responses contain the local panel login URL; progress stays nonterminal. */
export function requestDbGate(
  node: DbGateNode,
  progress: (info: any) => void,
  timeoutMs = 360_000
): Promise<{ url: string }> {
  return new Promise((resolve, reject) => {
    let request: ReturnType<typeof IPC.sendSensitive> | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let settled = false
    const finish = (error?: Error, data?: { url: string }) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (request) IPC.off(request.key)
      if (error) reject(error)
      else resolve(data!)
    }
    try {
      request = IPC.sendSensitive(
        'app-fork:mysql-cluster',
        'openDbGate',
        JSON.parse(JSON.stringify(node))
      )
      timer = setTimeout(() => finish(new Error('DbGate opening timed out')), timeoutMs)
      request.then((key: string, info: any) => {
        if (settled) return
        if (info?.code === 200) {
          try {
            progress(info)
          } catch (error) {
            finish(error instanceof Error ? error : new Error(String(error)))
          }
          return
        }
        if (key !== request!.key) IPC.off(key)
        if (info?.code === 0 && typeof info.data?.url === 'string') finish(undefined, info.data)
        else finish(new Error(info?.msg || 'DbGate failed to start'))
      })
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)))
    }
  })
}
