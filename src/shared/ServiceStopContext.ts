import { AsyncLocalStorage } from 'node:async_hooks'
import type { PItem } from './Process'

/**
 * stopService 的可选第二参数：主进程派发前查询一次完整列表，随原停止请求发送。
 * 不再登记 batchId 或通过 IPC 二次取表；列表只属于这轮调用，不写版本/全局配置。
 * processList 即使为空也表示有效采样结果，不能据此重新查询。
 */
export type ServiceStopContext = { processList: PItem[]; reason: 'stop' | 'quit' }

/**
 * 插件 bundle:true 会内联自己的 Base/公共工具，模块局部的 AsyncLocalStorage
 * 因而不是宿主 dispatcher 绑定的同一个实例。使用固定 Symbol 在同一 Node
 * 进程内复用容器，让插件仍按旧业务签名调用也能读取本次请求的首表/退出原因。
 * 此处共享的是异步范围容器，不是“当前批次”或进程列表：每个 run 的值仍隔离，
 * 不增加批次登记、取表 IPC 或释放协议；main 与不同 fork 的 globalThis 也互不共享。
 * 已发布的旧插件包不会自动获得此实现，需要重新构建才能复用直接传入的首表。
 */
const contextKey = Symbol.for('flyenv.service-stop-context.v1')
const contextHost = globalThis as typeof globalThis & {
  [contextKey]?: AsyncLocalStorage<ServiceStopContext | undefined>
}
const context = (contextHost[contextKey] ??= new AsyncLocalStorage<
  ServiceStopContext | undefined
>())

export const currentServiceStopContext = () => context.getStore()

/**
 * 内层 companion/公共查询复用本次 stopService 参数；不向每一层业务方法追加参数。
 * 请求异步范围互相隔离，避免同 worker 的多版本并发停止覆盖彼此列表/退出策略。
 * 这里只保存已传入的值，不管理缓存、批次生命周期或系统查询。
 */
export const withServiceStopContext = <T>(
  value: ServiceStopContext | undefined,
  task: () => T
): T => context.run(value, task)

export const isServiceStopContext = (value: unknown): value is ServiceStopContext => {
  const candidate = value as ServiceStopContext | null
  return (
    !!candidate &&
    Array.isArray(candidate.processList) &&
    (candidate.reason === 'stop' || candidate.reason === 'quit')
  )
}
