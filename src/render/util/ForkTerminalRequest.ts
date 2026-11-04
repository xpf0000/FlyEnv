import IPC from '@/util/IPC'

/** fork 启动终态里的 PID 必须是宿主实际 PID；-1 等哨兵不能登记为运行实例。 */
export function isPositiveHostPid(value: unknown): value is string | number {
  if (typeof value !== 'string' && typeof value !== 'number') return false
  const pid = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(pid) && pid > 0
}

/**
 * 等待 fork 命令的 code=0/1 终态。code=200 只代表中间进度，继续保留监听；
 * 超时/同步发送异常时移除 listener，已超时请求的迟到消息不得再修改调用方状态。
 */
export function forkTerminalRequest(
  command: string,
  args: any[],
  timeoutMessage: string,
  timeoutMs = 360_000,
  onProgress?: (info: any) => void
): Promise<any> {
  return new Promise((resolve, reject) => {
    let request: ReturnType<typeof IPC.send>
    try {
      request = IPC.send(command, ...args)
    } catch (error) {
      reject(error)
      return
    }

    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const cleanup = () => {
      if (timer) clearTimeout(timer)
      IPC.off(request.key)
    }
    timer = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(timeoutMessage))
    }, timeoutMs)

    try {
      request.then((key: string, info: any) => {
        if (settled) return
        if (info?.code === 200) {
          try {
            onProgress?.(info)
          } catch (error) {
            settled = true
            cleanup()
            reject(error)
          }
          return
        }
        settled = true
        cleanup()
        // Use the callback key too; cleanup(request.key) remains safe if a malformed response differs.
        if (key !== request.key) IPC.off(key)
        if (info?.code === 0 || info?.code === 1) resolve(info)
        else reject(new Error(info?.msg ?? 'Fork request returned an invalid terminal result'))
      })
    } catch (error) {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
  })
}
