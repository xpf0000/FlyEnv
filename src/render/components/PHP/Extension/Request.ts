// PHP-module IPC requests share progress and terminal cleanup semantics.
type Response = { code?: number; data?: unknown; msg?: unknown }
type Transport = {
  send: (...args: any[]) => {
    then: (callback: (key: string, response: Response) => void) => unknown
  }
  off: (key: string) => void
}

export function extensionRequest<T>(
  transport: Transport,
  method: string,
  args: unknown[],
  progress?: (text: string) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    transport.send('app-fork:php', method, ...args).then((key, response) => {
      if (response?.code === 200) {
        progress?.(String(response.msg ?? ''))
        return
      }
      transport.off(key)
      if (response?.code === 0) resolve(response.data as T)
      else reject(new Error(String(response?.msg ?? 'PHP extension operation failed')))
    })
  })
}
