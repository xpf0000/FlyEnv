import type { MCPRequest } from './connect-service'
type IPC = {
  sendSensitive(
    command: string,
    ...args: any[]
  ): { key: string; then(cb: (key: string, response: any) => void): void }
  off(key: string): void
}
export function createConnectRequest(ipc: IPC, defaultTimeout = 30_000): MCPRequest {
  return <T>(command: string, args: unknown[] = [], timeoutMs = defaultTimeout) =>
    new Promise<T>((resolve, reject) => {
      let done = false
      let key = ''
      let timer: ReturnType<typeof setTimeout> | undefined
      const finish = (response?: any) => {
        if (done) return
        done = true
        if (timer) clearTimeout(timer)
        if (key) ipc.off(key)
        if (response?.code === 0) resolve(response.data)
        else reject(new Error(response ? 'service_unavailable' : 'operation_unknown'))
      }
      try {
        const call = ipc.sendSensitive(command, ...JSON.parse(JSON.stringify(args)))
        key = call.key
        timer = setTimeout(() => finish(), timeoutMs)
        call.then((_key, response) => {
          if (response?.code !== 200) finish(response)
        })
      } catch {
        finish()
      }
    })
}
