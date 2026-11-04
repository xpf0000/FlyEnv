import { writePerformanceLog } from '@shared/PerformanceDiagnostics'
import type { SoftInstalled } from '@shared/app'
import { ProcessOwnedPidsByPidAndCommand } from '@shared/Process'
import type { PItem } from '@shared/Process'
import { appDebugLog, isWindows } from '@shared/utils'
import { win32 } from 'node:path'
import { phpServiceLifecycleScope } from '../../fork/module/Php/lifecycle'
import type { ForkManager } from './ForkManager'
import { withServiceStopContext } from '@shared/ServiceStopContext'
import {
  withServiceLifecyclePermit,
  hasServiceLifecyclePermit,
  cancelAcceptedServiceLifecycleOperations,
  waitForServiceDrain,
  isServiceLifecycleContextExpired
} from './ServiceLifecycle'

export { serviceLifecycleAction } from './ServiceLifecycle'

export type ServiceProcessItem = {
  item: SoftInstalled
  pid: string
  command?: string
  /** fork 模块提供的同实例 stopService 参数快照，仅属于本次运行登记。 */
  stopArgs?: any[]
  /** 独立打开的面板也要停止，但不作为其数据库/服务的运行实例展示。 */
  companion?: boolean
  /** Monotonic identity for this registration; PID/bin can be reused by a later start. */
  generation: number
}

export type ServiceStopSnapshot = {
  args: any[]
  /** Requested root can already be gone; successful stop still retires this exact generation. */
  rootPid: string
  rootGeneration: number
  /** Registrations visible at dispatch time, used to avoid deleting a later replacement. */
  registrations: Array<{ pid: string; generation: number }>
}

export type ServiceRegistrationSnapshot = Array<{
  pid: string
  generation: number
  bin?: string
}>

/** 公共批量停止的逐实例终态；一项失败不取消其他项，调用方自行决定是否允许退出/卸载。 */
export type ServiceStopBatchItem = {
  module: string
  pid: string
  label: string
  status: 'stopped' | 'skipped' | 'failed'
  error?: string
}

/**
 * Only return process trees whose registered root command still exactly matches its snapshot.
 * Compatibility export for existing inspection scripts; production stop now calls fork stopService.
 */
export const ownedServicePids = (
  serviceItems: ServiceProcessItem[],
  processList: PItem[]
): string[] => {
  const pids = serviceItems.flatMap(({ command, pid }) =>
    ProcessOwnedPidsByPidAndCommand(pid, command, processList)
  )
  return Array.from(new Set(pids))
}

/** Compatibility helper for inspection scripts; production no longer captures commands in main. */
export const applyServiceProcessCommandSnapshots = (
  serviceItems: ServiceProcessItem[],
  pids: Set<string>,
  processList: PItem[]
) => {
  const commandByPid = new Map(processList.map((item) => [item.PID, item.COMMAND]))
  for (const serviceItem of serviceItems) {
    const pid = `${serviceItem.pid}`
    if (!pids.has(pid)) {
      continue
    }
    serviceItem.command = commandByPid.get(pid) || undefined
  }
}

/** 单个运行中实例的标识（bin 是唯一键——同一 version 可能装在不同路径） */
export type RunningInstance = {
  bin: string
  path?: string
  version?: string | null
  pid: string
}

export type ServiceStatusItem = {
  flag: string
  running: boolean
  /** 当前该模块所有运行中的实例（可能多版本并行，如 php-fpm） */
  instances: RunningInstance[]
  /** 通知/终态共享的单调序号，用于 renderer 拒绝迟到的旧空状态。 */
  revision: number
}

type StatusChangeCallback = (status: ServiceStatusItem) => void

/** 队列只保留受理时序、范围解析和终态 Promise，不保存模块参数或凭据。 */
type ServiceLifecycleQueueEntry = {
  scope: Promise<string>
  completed: Promise<void>
}

class ServiceProcess {
  forkManager?: ForkManager
  servicePID: Record<string, ServiceProcessItem[]> = {}
  private onChangeCallbacks: StatusChangeCallback[] = []
  /** 多个退出触发共享同一轮实例停止，避免重复关闭数据库或重复请求 UAC。 */
  private stopPromise?: Promise<void>
  private nextGeneration = 1
  private nextStatusRevision = 1
  private readonly statusRevisions = new Map<string, number>()
  private lifecycleClosing = false
  // 同模块按受理时序保存请求；空 scope 为模块屏障，其他 scope 为独立实例。
  private readonly lifecycleQueues = new Map<string, Set<ServiceLifecycleQueueEntry>>()
  private readonly lifecycleScopeResolvers = new Map<
    string,
    (target: unknown) => string | undefined
  >()
  private readonly lifecycleOperations = new Set<Promise<unknown>>()

  /** 注册状态变更回调（供 main 进程广播给 render 用） */
  onStatusChange(cb: StatusChangeCallback) {
    this.onChangeCallbacks.push(cb)
  }

  private emitChange(type: string) {
    this.statusRevisions.set(type, this.nextStatusRevision++)
    const status = this.statusOf(type)
    for (const cb of this.onChangeCallbacks) {
      try {
        cb(status)
      } catch (e) {
        console.log('ServiceProcess onChange callback error: ', e)
      }
    }
  }

  /** 单个模块的运行态（纯读内存，不做进程探测）。bin 为实例唯一键 */
  statusOf(type: string): ServiceStatusItem {
    const list = (this.servicePID[type] ?? []).filter((i) => !!i.pid && !i.companion)
    const instances: RunningInstance[] = list.map((i) => ({
      bin: i.item?.bin,
      path: i.item?.path,
      version: i.item?.version ?? undefined,
      pid: i.pid
    }))
    return {
      flag: type,
      running: instances.length > 0,
      instances,
      revision: this.statusRevisions.get(type) ?? 0
    }
  }

  /** 批量查询运行态。flags 省略则返回当前所有有记录的模块 */
  getStatus(flags?: string[]): Record<string, ServiceStatusItem> {
    const keys = flags && flags.length ? flags : Object.keys(this.servicePID)
    const out: Record<string, ServiceStatusItem> = {}
    for (const k of keys) {
      out[k] = this.statusOf(k)
    }
    return out
  }

  addPid(type: string, pid: string, item: SoftInstalled, stopArgs?: any[], companion = false) {
    // 已受理请求超时后即使底层迟到，也不能在退出清理快照之后添登记。
    if (
      isServiceLifecycleContextExpired() ||
      (this.lifecycleClosing && !hasServiceLifecyclePermit())
    )
      return
    // 保留真实运行 PID 及模块提供的停止参数；JSON 快照避免 renderer 后续编辑
    // 当前版本/目录影响已启动实例。只存内存，不新增持久配置或模块专用字段。
    pid = `${pid}`.trim()
    // -1 等是 fork 对一次性命令/无守护进程的哨兵值，不代表可被 stopService 管理的宿主进程。
    // 只要求真实正整数，不用任意阈值猜测 PID 合法性；各启动消费入口共用此边界。
    const numericPid = Number(pid)
    if (!/^\d+$/.test(pid) || !Number.isSafeInteger(numericPid) || numericPid <= 0) return
    // 启动 PID 可在最终响应前登记/广播；此时就撤销启动前缓存，避免用户立即停止
    // 命中旧表。仅清表，不查询；后续并行停止仍共用 main 的首次新列表。
    this.forkManager?.invalidateStopProcessList('service-pid-registered')
    // 统一十进制表示，避免 '00123' 与进程表中的 '123' 被当成两个根。
    pid = `${numericPid}`
    // DNS 等 fork 内服务没有版本参数，仍以宿主 PID 登记退出清理，不能 JSON.parse(undefined)。
    item = JSON.parse(JSON.stringify(item ?? { pid }))
    const args = JSON.parse(JSON.stringify(stopArgs ?? [{ ...item, pid }]))
    if (!this.servicePID[type]) {
      this.servicePID[type] = []
    }
    // 按 bin 去重：同一可执行文件已登记则更新其 pid，避免重复登记（如重复 start）
    const bin = item?.bin
    // PID 签名的项目/自定义服务可共享同一语言 bin，不能按 bin 合并多个项目；
    // companion 与真实服务分别登记，避免打开面板覆盖数据库父 PID。
    const existing = this.servicePID[type].find(
      (entry) =>
        !!entry.companion === companion &&
        (bin && args[0]?.bin === bin ? entry.item?.bin === bin : entry.pid === pid)
    )
    if (existing) {
      existing.pid = pid
      existing.item = item
      existing.command = undefined
      existing.stopArgs = args
      existing.companion = companion
      existing.generation = this.nextGeneration++
    } else {
      this.servicePID[type].push({
        item,
        pid,
        stopArgs: args,
        companion,
        generation: this.nextGeneration++
      })
    }
    this.emitChange(type)
  }

  /** 模块自己的纯策略决定多版本启动键；不把模块专属判断散落在 UI/MCP 公共入口。 */
  registerLifecycleScope(type: string, resolver: (target: unknown) => string | undefined) {
    this.lifecycleScopeResolvers.set(type, resolver)
  }

  /**
   * UI/MCP 共用实例队列。默认 start 为模块屏障，保留独占版本切换；模块可注册
   * 多版本键。标准 stop 按 bin/PID 排队，不同安装可并行，无目标的 stop_all 则为
   * 模块屏障。实例请求等待本键和先前模块屏障，模块请求等待此前全部实例。
   * 目标解析、等待、fork 及终态登记都在受理许可/预算内，退出先 drain 再取表。
   */
  runLifecycle<T>(
    type: string,
    action: 'start' | 'stop',
    task: (target: any) => Promise<T>,
    target?: unknown | (() => Promise<unknown>)
  ): Promise<T> {
    if (this.lifecycleClosing)
      return Promise.reject(new Error(`Cannot ${action} ${type}: application is shutting down`))
    const queues = this.lifecycleQueues.get(type) ?? new Set<ServiceLifecycleQueueEntry>()
    this.lifecycleQueues.set(type, queues)
    // 必须在异步选版本之前冻结前驱：MCP 查询慢时，后来 stop_all 也要等待它，
    // 但较早的 start 不能反过来等待后来 stop_all，否则会构成环形等待。
    const predecessors = [...queues]
    let resolveScope!: (scope: string) => void
    let releaseQueue!: () => void
    const entry: ServiceLifecycleQueueEntry = {
      scope: new Promise<string>((resolve) => {
        resolveScope = resolve
      }),
      completed: new Promise<void>((resolve) => {
        releaseQueue = resolve
      })
    }
    queues.add(entry)
    // 排队时间也占请求预算。取消后 previous 即使结算，也不能再派发原请求。
    const operation = withServiceLifecyclePermit('accepted', async () => {
      // MCP 选版本可能需要异步查询；必须在被接纳的操作内做，不能在退出 drain 表外
      // 先查询再入队。UI 已有快照直接使用，同一版本两入口得到相同实例键。
      const selected = typeof target === 'function' ? await target() : target
      if (!hasServiceLifecyclePermit()) throw new Error('Service lifecycle request has expired')
      let scope = this.lifecycleScopeResolvers.get(type)?.(selected)
      if (scope === undefined && action === 'stop') {
        const item =
          selected && typeof selected === 'object'
            ? (selected as { bin?: unknown; pid?: unknown })
            : undefined
        const bin = item?.bin
        const pid = typeof selected === 'string' ? selected : item?.pid
        if (typeof bin === 'string' && bin.trim()) {
          scope = `bin:${isWindows() ? win32.normalize(bin.trim()).toLowerCase() : bin.trim()}`
        } else if (/^[1-9]\d*$/.test(`${pid ?? ''}`)) scope = `pid:${pid}`
      }
      scope ??= ''
      resolveScope(scope)
      await Promise.all(
        predecessors.map(async (previous) => {
          const previousScope = await previous.scope
          // 只等待此前同实例或模块屏障。不同 PHP 版本只等待范围解析，不等待服务
          // 启动完成；独占模块的 start/stop_all 使用空范围，等待全部此前请求。
          if (!scope || !previousScope || scope === previousScope) await previous.completed
        })
      )
      if (!hasServiceLifecyclePermit()) throw new Error('Service lifecycle request has expired')
      return task(selected)
    })
    let tracked!: Promise<T>
    tracked = operation.finally(() => {
      // 目标解析失败或请求在排队中超时也必须结算范围/终态。后来请求的前驱集合
      // 已冻结，取消第二项不会让第三项越过仍存活的第一项。
      resolveScope('')
      releaseQueue()
      queues.delete(entry)
      if (!queues.size && this.lifecycleQueues.get(type) === queues)
        this.lifecycleQueues.delete(type)
      this.lifecycleOperations.delete(tracked)
    }) as Promise<T>
    // 在当前调用返回前登记完整消费者 Promise；drain 等到终态回调完成，确保启动 PID
    // 已由 IPC/MCP 消费者写入登记表，再由退出代码取得最终快照。
    this.lifecycleOperations.add(tracked)
    return tracked
  }

  beginLifecycleShutdown() {
    this.lifecycleClosing = true
  }

  async drainLifecycleRequests() {
    // Repeat because an operation already accepted before closure can enqueue a follow-up
    // lifecycle call as part of its terminal consumer. New external admissions are closed.
    try {
      await waitForServiceDrain(
        (async () => {
          while (this.lifecycleOperations.size) {
            await Promise.allSettled([...this.lifecycleOperations])
          }
        })()
      )
    } catch (error) {
      // 有界退出不能只 race 后放任原请求：撤销全部已受理上下文并让队列真正 settle。
      const failure = error instanceof Error ? error : new Error(String(error))
      cancelAcceptedServiceLifecycleOperations(failure)
      this.forkManager?.cancelPendingRequests(failure.message)
      await Promise.allSettled([...this.lifecycleOperations])
      await appDebugLog('[ServiceProcess][quit][drain-unknown]', failure.message).catch(() => {})
    }
  }

  /** Bind a stop command to the exact registration generations visible when it is dispatched. */
  stopSnapshotFor(type: string, target: any): ServiceStopSnapshot | undefined {
    const entries = this.servicePID[type] ?? []
    const value = typeof target === 'string' ? target : target?.pid
    const text = `${value ?? ''}`.trim()
    const pid =
      /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) && Number(text) > 0
        ? `${Number(text)}`
        : text
    // 有 PID 时只按 PID 命中：旧页面/迟到 stop 不能被改写成停止同 bin 的新一代实例。
    const entry = pid
      ? entries.find((candidate) => candidate.pid === `${pid}`)
      : entries.find(
          (candidate) => !candidate.companion && !!target?.bin && candidate.item?.bin === target.bin
        )
    if (!entry) return undefined
    return {
      args: JSON.parse(JSON.stringify(entry.stopArgs ?? [{ ...entry.item, pid: entry.pid }])),
      rootPid: entry.pid,
      rootGeneration: entry.generation,
      registrations: entries.map(({ pid: registeredPid, generation }) => ({
        pid: registeredPid,
        generation
      }))
    }
  }

  registrationSnapshot(type: string): ServiceRegistrationSnapshot {
    return (this.servicePID[type] ?? []).map(({ pid, generation, item }) => ({
      pid,
      generation,
      bin: item?.bin
    }))
  }

  /** Prune only stale-bin generations that existed when the start request was dispatched. */
  finishStaleBins(type: string, bins: string[], snapshot: ServiceRegistrationSnapshot) {
    if (
      isServiceLifecycleContextExpired() ||
      (this.lifecycleClosing && !hasServiceLifecyclePermit())
    )
      return
    const stale = new Set(bins)
    // fork 的旧版本清理结果只能作用于 start 派发前已存在且 bin 命中的代次；若这期间
    // 同 bin 已重启并取得新 generation，迟到结果不会把新服务从登记表中删除。
    const generations = new Set(
      snapshot.filter(({ bin }) => !!bin && stale.has(bin)).map(({ generation }) => generation)
    )
    this.servicePID[type] = (this.servicePID[type] ?? []).filter(
      (entry) => !generations.has(entry.generation)
    )
    this.emitChange(type)
  }

  /** Only remove registrations from the dispatch snapshot that the fork confirmed stopped. */
  finishStopSnapshot(type: string, snapshot: ServiceStopSnapshot, stoppedPids: string[]) {
    // 同模块 stop 可能连带关掉同一服务的 companion；只接受本次快照里的 PID/代次，
    // root 即使已自然退出也只注销原 generation，PID 重用或后来重启都不会受影响。
    const registrations = snapshot.registrations.filter(
      ({ pid, generation }) => pid !== snapshot.rootPid || generation === snapshot.rootGeneration
    )
    this.finishStoppedRegistrations(type, registrations, [...stoppedPids, snapshot.rootPid])
  }

  finishStoppedRegistrations(
    type: string,
    snapshot: ServiceRegistrationSnapshot,
    stoppedPids: string[]
  ) {
    if (
      isServiceLifecycleContextExpired() ||
      (this.lifecycleClosing && !hasServiceLifecyclePermit())
    )
      return
    const stopped = new Set(stoppedPids.map(String))
    const generations = new Set(
      snapshot.filter(({ pid }) => stopped.has(pid)).map(({ generation }) => generation)
    )
    const current = this.servicePID[type] ?? []
    this.servicePID[type] = current.filter((entry) => !generations.has(entry.generation))
    this.emitChange(type)
  }

  /**
   * 退出/MCP/插件停用共用登记快照的并行编排。与 UI 一键停止一样，先提交各实例
   * stopService，再等待全部终态；不逐实例 await，也不在 main 另建 kill 分支。
   * 参数和代次在本轮冻结，失败仅属于当前项，其他树继续。数据库原生关闭与
   * companion 顺序仍由 fork 模块负责，同一 worker 内的重复清理沿用原 stop flight。
   */
  async stopRegisteredInstances(
    types?: string[],
    reason: 'stop' | 'quit' = 'stop'
  ): Promise<ServiceStopBatchItem[]> {
    const selectedTypes = types ? new Set(types) : undefined
    const instances = Object.entries(this.servicePID).flatMap(([module, items]) =>
      (selectedTypes && !selectedTypes.has(module) ? [] : items)
        .filter(({ pid }) => !!pid)
        .map((entry) => {
          // 展示标签取运行登记，不猜 stopArgs 的签名：项目/面板可能以 PID 字符串开头。
          // 同一份深拷贝同时用于派发和快照，避免复制两次或引用后来变化的版本对象。
          const args = JSON.parse(
            JSON.stringify(entry.stopArgs ?? [{ ...entry.item, pid: entry.pid }])
          )
          return {
            module,
            pid: entry.pid,
            generation: entry.generation,
            label: String(entry.item?.version ?? entry.item?.bin ?? entry.pid),
            snapshot: {
              args,
              rootPid: entry.pid,
              rootGeneration: entry.generation,
              registrations: items.map(({ pid, generation }) => ({ pid, generation }))
            }
          }
        })
    )
    // 一轮 main 批量停止只清一次旧表；不能在 map 内逐服务清理，否则失去查询合并。
    if (!instances.length) return []
    const manager = this.forkManager
    if (!manager) throw new Error('Fork manager is not initialized')
    manager.invalidateStopProcessList('batch-stop-begin')
    // 首表查询先于任何停止派发；列表由本轮局部变量持有并随原请求发送。
    // 晚进入模块的请求也直接使用传入表，不需要 batchId 或后续取表 IPC。
    // 查询失败使本批各项明确失败；不派发裸 PID 停止，也不清登记，退出仍可继续。
    let processList: PItem[]
    try {
      processList = await manager.fetchStopProcessListSnapshot()
    } catch (error) {
      await appDebugLog('[ServiceProcess][batch-stop][snapshot-error]', String(error)).catch(
        () => {}
      )
      return instances.map(({ module, pid, label }) => ({
        module,
        pid,
        label,
        status: 'failed' as const,
        error: String(error)
      }))
    }
    await writePerformanceLog(appDebugLog, '[ServiceProcess][batch-stop][snapshot]', () => ({
      reason,
      processCount: processList.length,
      serviceCount: instances.length
    }))
    // ForkItem 随每条停止命令发送此可选参数。IPC 复制列表，各 fork 不会修改 main
    // 的首表；本轮完成后局部引用自然释放，不再需要批次注册、结束或释放异常分支。
    return await withServiceStopContext({ processList, reason }, () =>
      Promise.all(
        instances.map(async ({ module, pid, generation, label, snapshot }) => {
          try {
            // 已由其他停止请求回收的登记不重复调用；失败登记保留供记录/重试。
            if (!this.servicePID[module]?.some((entry) => entry.generation === generation)) {
              return { module, pid, label, status: 'skipped' as const }
            }
            await writePerformanceLog(
              appDebugLog,
              '[ServiceProcess][batch-stop][stopping]',
              () => ({ module, pid, reason })
            )
            const result = await manager.send(module, 'stopService', ...snapshot.args).on(() => {})
            // ForkItem 对两种终态都 resolve；检查 code，失败不能注销当前代登记。
            if (result?.code !== 0) {
              throw new Error(
                typeof result?.msg === 'string' ? result.msg : `Failed to stop ${module}`
              )
            }
            const stopped = (result.data?.['APP-Service-Stop-PID'] ?? []).map(String)
            this.finishStopSnapshot(module, snapshot, stopped)
            await writePerformanceLog(
              appDebugLog,
              '[ServiceProcess][batch-stop][completed]',
              () => ({ module, pid, reason })
            )
            return { module, pid, label, status: 'stopped' as const }
          } catch (error) {
            // 按实例隔离错误：保留本代登记，其他模块/版本继续完成。
            const failure = { module, pid, error: String(error) }
            await appDebugLog(
              '[ServiceProcess][batch-stop][error]',
              JSON.stringify({ ...failure, reason })
            ).catch(() => {})
            return { ...failure, label, status: 'failed' as const }
          }
        })
      )
    )
  }

  async stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise
    const pending = this.stopAfterDrain()
    this.stopPromise = pending
    try {
      await pending
    } finally {
      // 并发退出共享本轮；独立的后续调用可重试之前保留的失败实例。
      if (this.stopPromise === pending) this.stopPromise = undefined
    }
  }

  private async stopAfterDrain() {
    this.beginLifecycleShutdown()
    await this.drainLifecycleRequests()
    // 先结算旧请求，再对最终登记并行停止；所有 fork 自带终态上限，不能在一项
    // 超时后提前销毁其他 worker/撤销清理许可。退出记录失败但继续等待其他项。
    const results = await withServiceLifecyclePermit(
      'shutdown',
      () => this.stopRegisteredInstances(undefined, 'quit'),
      0
    )
    const failures = results.filter(({ status }) => status === 'failed')
    if (failures.length) {
      await appDebugLog('[ServiceProcess][quit][incomplete]', JSON.stringify(failures)).catch(
        () => {}
      )
    }
  }
}

const serviceProcess = new ServiceProcess()
// 只在集成处连接 PHP 自己的策略；队列类和公共服务类型保持模块无关。
serviceProcess.registerLifecycleScope('php', phpServiceLifecycleScope)
export default serviceProcess
