import { ProcessKillStrict, type PItem } from './Process'
import { fetchStopProcessListLocal } from './StopProcessList'
import { timeOperation } from './OperationTiming'
import { appDebugLog, isWindows, waitTime } from './utils'
import { compareProcessCreation } from './ProcessSnapshot'
import { readFile, unlink } from 'node:fs/promises'
import {
  logServiceStop,
  serviceStopProcessRows,
  withServiceStopDiagnostics
} from './ServiceStopDiagnostics'
import { currentServiceStopContext } from './ServiceStopContext'

/**
 * 退出强制停止返回初始表及成功命令证据，不伪造最终系统快照。
 * WeakMap 只标记本次返回值，不污染其他服务共享的批次表。仅供 PID 文件
 * 清理及跳过残留扫描；数据库/UI 确认仍返回真实新表。
 */
const commandOnlyResults = new WeakMap<PItem[], ReadonlySet<string>>()
export const isCommandOnlyServiceStopResult = (list: PItem[]) => commandOnlyResults.has(list)

/** 私有 PID 文件只读取首个非空行，兼容 postmaster.pid；仅 ENOENT 表示已无文件。 */
const readPidFile = async (file: string): Promise<string> => {
  try {
    return (
      (await readFile(file, 'utf8'))
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean) ?? ''
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw error
  }
}

/**
 * 模块与非 Base 伴随服务共用 PID 文件清理。只使用最终退出快照，没有额外
 * 系统查询；文件必须仍指向本次候选、且该 PID 已缺席，删除前再次比对内容。
 * 空文件/其他实例的新 PID 保留；unlink 只处理固定文件，不递归删除目录。
 */
export const cleanupStoppedServicePidFiles = async (
  pids: string[],
  finalList: PItem[],
  files: string[]
): Promise<void> => {
  const candidates = new Set(pids.filter(Boolean))
  const alive = new Set(finalList.map(({ PID }) => PID))
  const commandCompleted = commandOnlyResults.get(finalList)
  for (const file of new Set(files.filter(Boolean))) {
    const pid = await readPidFile(file)
    if (!pid || !candidates.has(pid) || (alive.has(pid) && !commandCompleted?.has(pid))) {
      await logServiceStop('pid-file.retained', {
        file,
        pid,
        reason: !pid
          ? 'empty-or-missing'
          : !candidates.has(pid)
            ? 'outside-candidates'
            : 'pid-alive'
      })
      continue
    }
    const currentPid = await readPidFile(file)
    if (currentPid !== pid) {
      await logServiceStop('pid-file.retained', {
        file,
        pid,
        currentPid,
        reason: 'content-changed'
      })
      continue
    }
    await timeOperation('service.stop.remove-pid-file', async () => {
      try {
        await unlink(file)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    })
    await logServiceStop('pid-file.removed', {
      file,
      pid,
      basis: commandCompleted?.has(pid) ? 'stop-command-completed' : 'exit-snapshot'
    })
  }
}

/**
 * 仅表示严格查询成功、但原目标在期限内仍存在；与查询/权限失败明确区分。
 * 允许原生关闭策略在这种已知残留上回收原树，其他错误不得被解释为回退许可。
 */
export class ServiceProcessExitTimeoutError extends Error {
  constructor(
    pids: string[],
    readonly requestedPids: string[] = pids
  ) {
    // 消息只列最终仍对应原进程的 PID，不把整个停止请求误称为全部仍在运行。
    super(`Service processes are still running; PIDs=${pids.join(',')}`)
    this.name = 'ServiceProcessExitTimeoutError'
  }
}

/**
 * 所有服务/伴随进程共享的退出确认。调用方传停止前确定的完整 PID 集合，
 * 有首次快照时观察原 PID/创建时间身份是否消失，PID 被其他程序复用不算原
 * 服务残留；没有创建证据时仍保守按号码等待。不扩选、不向新 PID 重放停止。
 * 首次发现可共用 main 短缓存，但此处每轮严格取停止后的新列表，避免把首表
 * 再拿来判定仍活/已退。查询失败直接传播，不能当成“服务不存在”。首轮成功时
 * 返回该列表，让残留筛选与 PID 清理共用同一个采样时点。空集合返回 [] 仅
 * 表示无需等待，调用方不能拿它当作已查询的全系统快照。
 * Runtime 可传自己的严格查询函数和轮询间隔，保持现有依赖注入；轮询本身
 * 仍只有这一份实现，不因测试注入或平台差异复制等待逻辑。
 */
export const waitForServiceProcessExit = async (
  pids: string[],
  timeoutMs = 10_000,
  options: {
    fetchList?: () => Promise<PItem[]>
    pollDelayMs?: number
    initialList?: PItem[]
  } = {}
): Promise<PItem[]> => {
  if (!pids.length) return []
  const requested = new Set(pids)
  const original = options.initialList
    ? new Map(options.initialList.map((item) => [item.PID, item]))
    : undefined
  const deadline = Date.now() + timeoutMs
  const fetchList = options.fetchList ?? fetchStopProcessListLocal
  let poll = 0
  while (true) {
    const list = await timeOperation('service.exit.poll', fetchList)
    poll += 1
    // 两份现成完整列表在内存比身份，不为 worker 再开采样管道。字段缺失或
    // 来源不可比不能解释为退出，继续等待并记录；明确不同的创建时间才排除新占用者。
    const observed = list.filter(({ PID }) => requested.has(PID))
    const remaining = observed.filter((item) => {
      if (original && !original.has(item.PID)) return false // 首次快照已缺席的目标不补认。
      const order = compareProcessCreation(original?.get(item.PID)?.CREATED, item.CREATED)
      return order === undefined || order === 0
    })
    // 每轮都记录原目标的身份对比。仅列请求目标，不写全机进程；全量列表本来就已
    // 查询，诊断不再查一次。明确区分 PID 不在首表、PID 复用、身份未知与仍属原进程。
    await logServiceStop('exit.observed', {
      poll,
      requestedPids: [...requested],
      absentPids: [...requested].filter((pid) => !observed.some((item) => item.PID === pid)),
      remainingPids: remaining.map(({ PID }) => PID),
      observed: observed.map((item) => {
        const initial = original?.get(item.PID)
        const order = compareProcessCreation(initial?.CREATED, item.CREATED)
        return {
          ...serviceStopProcessRows([item])[0],
          originalCreated: initial?.CREATED ?? null,
          identity:
            original && !initial
              ? 'absent-in-initial'
              : order === undefined
                ? 'unknown'
                : order === 0
                  ? 'same'
                  : 'pid-reused'
        }
      })
    })
    if (!remaining.length) return list
    if (Date.now() >= deadline) {
      // 只记录 PID/创建时间，不展开进程命令；可以区分真正残留、未知身份和 PID
      // 复用，不再仅输出全部目标使用户以为十个 PHP 都没有退出。
      await appDebugLog(
        '[ServiceStop][exit-timeout]',
        JSON.stringify({
          requested: [...requested],
          remaining: remaining.map((item) => ({
            pid: item.PID,
            originalCreated: original?.get(item.PID)?.CREATED,
            currentCreated: item.CREATED
          }))
        })
      ).catch(() => {})
      throw new ServiceProcessExitTimeoutError(
        remaining.map(({ PID }) => PID),
        [...requested]
      )
    }
    await timeOperation('service.exit.poll-delay', () => waitTime(options.pollDelayMs ?? 200))
  }
}

/**
 * Windows 公共停止阶段：模块先用 list 确认实例归属和完整目标，公共执行器
 * 建树结果已有父先子后顺序，公共执行器原序发送全部 PID，不使用 /T 动态扩树。
 * 根的创建时间/EXE/启动身份由模块在发现阶段筛选；执行层不再重复校验或查询。
 * ProcessKillStrict 一次传入有序 PID，不逐 PID 启动命令或阻塞等待。
 * 普通交互停止核对原 PID 并返回新表；退出强制停止返回明确标记的命令证据。
 * 执行失败阻止文件清理，命令成功不等于已确认全树无残留。
 * 原生数据库关闭仍由模块执行，成功后可只调用 waitForServiceProcessExit。
 */
export const stopWindowsServiceProcesses = async (
  pids: string[],
  list: PItem[],
  options: { confirmExit?: boolean } = {}
): Promise<PItem[]> => {
  if (!isWindows()) throw new Error('Windows service stop is unavailable on this platform')
  if (!pids.length) return list
  // 非 PHP 调用也拥有自己的诊断 ID；若模块已建立上下文则沿用它，补停不另开 trace。
  return withServiceStopDiagnostics({}, async () => {
    await logServiceStop('service.begin', {
      requestedPids: pids,
      initial: serviceStopProcessRows(list.filter((item) => pids.includes(item.PID)))
    })
    try {
      await timeOperation('service.stop.parent-trees', () =>
        // list 留在服务层做诊断/退出确认，kill 不再接收列表并重复计算顺序。
        ProcessKillStrict('-INT', pids)
      )
      if (currentServiceStopContext()?.reason === 'quit' && !options.confirmExit) {
        // 原表保持完整；命令证据只用于清理成功目标的固定 PID 文件。
        // 没有新查询就不扫描新增 worker 或补停，不宣称已经确认全部退出。
        const result = [...list]
        commandOnlyResults.set(result, new Set(pids))
        await logServiceStop('service.command-completed', {
          requestedPids: pids,
          confirmation: 'skipped-on-quit'
        })
        return result
      }
      const finalList = await waitForServiceProcessExit(pids, 10_000, { initialList: list })
      await logServiceStop('service.completed', { requestedPids: pids })
      return finalList
    } catch (error) {
      await logServiceStop('service.failed', { requestedPids: pids, error: String(error) })
      throw error
    }
  })
}

/**
 * 原生关闭后允许树回收的服务共用收尾（目前 MySQL/MariaDB）。协议和监听归属
 * 仍由模块处理；成功发出关闭就立即观察，不再固定睡眠。只有严格确认的退出超时
 * 才进入树回退；查询失败直接传播。没有原生成功则直接用首次列表停止，不再
 * 重做全量发现。回退也保留原 PID/创建时间，不能以刷新后的 PID 建立新授权。
 * PostgreSQL/MongoDB 保留各自禁止强制回退的策略，只复用公共退出确认。
 */
export const stopWindowsServiceProcessesAfterNativeShutdown = async (
  pids: string[],
  list: PItem[],
  nativeShutdownSucceeded: boolean
): Promise<PItem[]> => {
  if (!pids.length) return list
  if (nativeShutdownSucceeded) {
    try {
      return await waitForServiceProcessExit(pids, 10_000, { initialList: list })
    } catch (error) {
      if (!(error instanceof ServiceProcessExitTimeoutError)) throw error
    }
  }
  // 数据库原生关闭失败/超时后的回退仍确认原目标，不继承退出快速策略。
  return stopWindowsServiceProcesses(pids, list, { confirmExit: true })
}
