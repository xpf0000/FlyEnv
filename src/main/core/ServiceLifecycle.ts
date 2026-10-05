import { AsyncLocalStorage } from 'node:async_hooks'

type ServiceLifecyclePermit = 'accepted' | 'shutdown'
type ServiceLifecycleContext = {
  permit: ServiceLifecyclePermit
  active: boolean
  cancel?: (error: Error) => void
  onCancel: Set<(error: Error) => void>
}

/** 用户请求含排队最多六分钟；正常退出只给已受理请求三十秒结算窗口。 */
export const SERVICE_REQUEST_TIMEOUT_MS = 360_000
export const SERVICE_DRAIN_TIMEOUT_MS = 30_000
const acceptedContexts = new Set<ServiceLifecycleContext>()

const lifecyclePermit = new AsyncLocalStorage<ServiceLifecycleContext>()

/**
 * main 对同一分类器同时用于 UI/MCP 入队与 ForkManager 最后一层门禁，防止某条 raw
 * start/open 旁路绕过退出时的 drain。open* 包含打开数据库、管理面板等会启动伴随进程的命令。
 */
export function serviceLifecycleAction(
  module: string,
  command: unknown
): 'start' | 'stop' | undefined {
  if (command === 'stopService') return 'stop'
  if (
    command === 'startService' ||
    command === 'startUiServer' ||
    command === 'startGroupServer' ||
    (module === 'cloudflare-tunnel' && command === 'start') ||
    (typeof command === 'string' && command.startsWith('open'))
  )
    return 'start'
  if (command === 'stopGroupService') return 'stop'
  return undefined
}

/**
 * 只给关门前已接纳的整条异步调用链发临时通行证。AsyncLocalStorage 让排队任务恢复后仍
 * 能通过 fork 门禁；任务终态立即撤销 active，脱离请求的后台回调不能继承退出许可。
 */
export async function withServiceLifecyclePermit<T>(
  permit: ServiceLifecyclePermit,
  task: () => T | PromiseLike<T>,
  timeoutMs = SERVICE_REQUEST_TIMEOUT_MS
): Promise<T> {
  const context: ServiceLifecycleContext = { permit, active: true, onCancel: new Set() }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    // timeout 不会取消 OS 进程，所以同时撤销此上下文的发送/登记许可；迟到消费者
    // 不能在退出快照之后登记新服务，也不能把未知停止改写成成功。底层请求由 ForkItem 收口。
    const canceled = new Promise<never>((_resolve, reject) => {
      context.cancel = (error) => {
        if (!context.active) return
        context.active = false
        // 先退休此上下文正在等待的真实 worker，不能只释放队列却让旧启动继续并行。
        for (const cancel of [...context.onCancel]) {
          try {
            cancel(error)
          } catch {
            // 某个收口 hook 失败不能阻止其他请求退休；外层仍返回未知结果。
          }
        }
        reject(error)
      }
      if (timeoutMs > 0) {
        timer = setTimeout(
          () =>
            context.cancel?.(new Error('Service lifecycle request timed out; result is unknown')),
          timeoutMs
        )
      }
    })
    if (permit === 'accepted') acceptedContexts.add(context)
    return await Promise.race([Promise.resolve(lifecyclePermit.run(context, task)), canceled])
  } finally {
    // Detached work spawned by a completed request must not retain shutdown admission.
    context.active = false
    if (timer) clearTimeout(timer)
    acceptedContexts.delete(context)
    context.onCancel.clear()
  }
}

/** 只取消关门前接纳的用户操作，退出自身的并行停止许可不在此集合内。 */
export function cancelAcceptedServiceLifecycleOperations(error: Error) {
  for (const context of acceptedContexts) context.cancel?.(error)
}

/** 退出等待有界；超时是未知结果，调用方必须撤销许可/收口 transport 后才能继续。 */
export async function waitForServiceDrain(
  task: Promise<unknown>,
  timeoutMs = SERVICE_DRAIN_TIMEOUT_MS
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      task,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('Shutdown drain timed out; pending results are unknown')),
          timeoutMs
        )
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export function hasServiceLifecyclePermit() {
  return lifecyclePermit.getStore()?.active === true
}

/** 区分普通无上下文调用和已经超时的旧调用，后者在正常运行期也不得再提交副作用。 */
export function isServiceLifecycleContextExpired() {
  return lifecyclePermit.getStore()?.active === false
}

/** EventEmitter 回调不恢复注册时 ALS；捕获对象引用供回调检查，不能只捕获当时的布尔值。 */
export function captureServiceLifecycleValidity() {
  const context = lifecyclePermit.getStore()
  return () => context?.active !== false
}

/** fork 请求把传输收口绑定到所属操作；正常终态解除绑定，避免取消后来复用的 worker。 */
export function onServiceLifecycleCancellation(cancel: (error: Error) => void) {
  const context = lifecyclePermit.getStore()
  context?.onCancel.add(cancel)
  return () => context?.onCancel.delete(cancel)
}
