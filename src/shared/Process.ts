import Helper from '../fork/Helper'
import { AppHelperCheck } from '@shared/AppHelperCheck'
import { execPromiseWithEnv } from '@shared/child-process'
import { appDebugLog, isWindows } from '@shared/utils'
import { logServiceStop } from './ServiceStopDiagnostics'
import { collectProcessSnapshotTree, isReadableServiceStopRoot } from './ProcessSnapshot'

const isEmptyLsofNoMatch = (error: unknown) => {
  const result = error as {
    code?: unknown
    stdout?: unknown
    stderr?: unknown
  } | null
  const isEmpty = (value: unknown) =>
    value === undefined ||
    value === null ||
    value === '' ||
    (Buffer.isBuffer(value) && value.length === 0)
  return result?.code === 1 && isEmpty(result.stdout) && isEmpty(result.stderr)
}

export type PItem = {
  PID: string
  PPID: string
  COMMAND: string
  /** Windows CIM CreationDate 的 UTC invariant 原文；旧/非 Windows provider 可省略。 */
  CREATED?: string
  /** Windows 查询返回的实际程序路径；用于孤立进程归属，不能仅凭相同程序名结束。 */
  EXECUTABLE?: string
  USER: string
  children?: PItem[]
}

export const ProcessListFetch = async (): Promise<PItem[]> => {
  if (isWindows()) {
    // 查询本机进程不应安装/健康检查常驻程序；严格普通查询失败可由服务层判定。
    const { ProcessPidListStrict } = await import('./Process.win')
    return ProcessPidListStrict()
  }
  let useHelper = false
  try {
    if (Helper.enable) {
      useHelper = true
    } else if (await AppHelperCheck()) {
      useHelper = true
    }
  } catch {
    useHelper = false
  }
  if (useHelper) {
    return (await Helper.send('tools', 'processList')) as any
  }
  const command = `ps axo user,pid,ppid,command`
  const std = await execPromiseWithEnv(command)
  const stdout = std.stdout.trim()
  if (!stdout) throw new Error('ps returned an empty process list')
  const processes: PItem[] = []
  for (const line of stdout.split('\n').filter((item) => !!item.trim())) {
    const fields = line.trim().split(/\s+/)
    // ps 会输出固定列名；只丢弃该已知行，其他格式错误都拒绝，避免把不完整快照
    // 当成完整进程列表继续执行停止流程。
    if (fields[1]?.toUpperCase() === 'PID' && fields[2]?.toUpperCase() === 'PPID') continue
    if (fields.length < 3 || !/^\d+$/.test(fields[1]) || !/^\d+$/.test(fields[2])) {
      throw new Error('Invalid ps process list output')
    }
    processes.push({
      USER: fields[0],
      PID: fields[1],
      PPID: fields[2],
      COMMAND: fields.slice(3).join(' ')
    })
  }
  return processes
}

export const ProcessPidsByPid = (pid: string, arr: PItem[]): string[] => {
  const tree = collectProcessSnapshotTree(pid, arr, true)
  // 兼容历史查询接口：根缺席但有后代时仍返回所查询的根号码；服务停止调用方
  // 必须独立证明有效父。实际建树共享创建时间判断，排除复用 PPID 的旧进程。
  return tree.length ? [...new Set([pid, ...tree.map(({ PID }) => PID)])] : []
}

/**
 * 按精确 PID 获取该根进程及其完整子进程树。
 * 只接受 PID 完全相等的根节点，避免把数字 PID 当搜索词做模糊扩散匹配。
 */
export const ProcessListByExactPid = (pid: string, arr: PItem[]): PItem[] => {
  const rootPid = `${pid}`.trim()
  if (!rootPid) {
    return []
  }
  return collectProcessSnapshotTree(rootPid, arr)
}

export const ProcessListByPid = (pid: string, arr: PItem[]): PItem[] => {
  const tree = collectProcessSnapshotTree(pid, arr, true)
  if (tree.length && tree[0].PID !== pid) {
    // 保留旧接口对缺席根的占位行；不得把占位行当成真实根的身份信息。
    return [{ USER: '', PID: pid, PPID: '', COMMAND: '' }, ...tree]
  }
  return tree
}

/**
 * Electron/Chromium 的 renderer、gpu、utility 子进程不应被当作服务根进程回收。
 * stale PID 被这些子进程复用时，必须直接拒绝清理，避免误杀整棵应用进程树。
 */
export const ProcessCommandLooksLikeElectronChild = (command = '') => {
  if (!command) {
    return false
  }
  return (
    command.includes(' --type=renderer') ||
    command.includes(' --type=gpu-process') ||
    command.includes(' --type=utility')
  )
}

const normalizeWindowsOwnershipText = (value: string) =>
  value
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/^\\\\\?\\/, '')
    .replace(/\//g, '\\')
    .toLocaleLowerCase('en-US')

/** Windows 只在已读取到的非空命令行证据中规范化大小写和路径分隔符。
 * 可执行映像路径不能替代命令行归属证据，因为同一映像可能承载多个服务实例。
 */
const processMatchesOwnedMarker = (item: PItem, markerValue: string) => {
  const marker = `${markerValue}`.trim()
  if (!marker) return false
  if (!isWindows()) return item.COMMAND.includes(marker)

  const rawCommand = `${item.COMMAND ?? ''}`.trim()
  if (!rawCommand) return false
  const command = normalizeWindowsOwnershipText(rawCommand)
  const normalizedMarker = normalizeWindowsOwnershipText(marker)
  return command.includes(normalizedMarker)
}

/**
 * 仅当 PID 当前仍归属于 FlyEnv 管理的服务时，才返回可安全回收的进程树。
 * 这里既校验 root PID 精确存在，也要求非空 root 命令行仍匹配服务标记；
 * Windows 仅规范命令文本中的斜杠/大小写。根不可读或短路径无法匹配时返回空集合，
 * 过滤当前候选；已确认父的正常后代直接属于整棵树，不逐 worker 判断归属。
 */
export const ProcessOwnedPidsByPid = (
  pid: string,
  arr: PItem[],
  ownedMarkers: Array<string | null | undefined>
): string[] => {
  // 一个不可读的恢复候选只产生空集合；其他候选继续。已确认根的子孙不在此
  // 逐个校验，Windows 所需首次执行身份也只要求根字段齐备。
  if (!isReadableServiceStopRoot(arr.find((item) => item.PID === `${pid}`.trim()))) return []
  const tree = ProcessListByExactPid(pid, arr)
  if (tree.length === 0) {
    return []
  }
  const rootPid = `${pid}`.trim()
  const root = tree.find((item) => item.PID === rootPid)
  const command = root?.COMMAND ?? ''
  if (!command || ProcessCommandLooksLikeElectronChild(command)) {
    return []
  }
  const markers = ownedMarkers
    .map((marker) => `${marker ?? ''}`.trim())
    .filter((marker) => marker.length > 0)
  if (markers.length === 0) {
    return []
  }
  if (!markers.some((marker) => processMatchesOwnedMarker(root!, marker))) {
    return []
  }
  return tree.map((item) => item.PID)
}

/**
 * Accept either an exact service root, or a known watchdog root whose descendant
 * command contains an exact owned marker. ClickHouse uses the latter shape:
 * `clickhouse-watchdog` is the root and the version binary is its child.
 */
export const ProcessOwnedPidsByPidOrDescendant = (
  pid: string,
  arr: PItem[],
  ownedMarkers: Array<string | null | undefined>,
  watchdogMarkers: Array<string | null | undefined>
): string[] => {
  if (!isReadableServiceStopRoot(arr.find((item) => item.PID === `${pid}`.trim()))) return []
  const tree = ProcessListByExactPid(pid, arr)
  if (tree.length === 0) {
    return []
  }
  const rootPid = `${pid}`.trim()
  const root = tree.find((item) => item.PID === rootPid)
  const rootCommand = root?.COMMAND ?? ''
  if (!rootCommand || ProcessCommandLooksLikeElectronChild(rootCommand)) {
    return []
  }
  const markers = ownedMarkers.map((marker) => `${marker ?? ''}`.trim()).filter(Boolean)
  const watchdogs = watchdogMarkers.map((marker) => `${marker ?? ''}`.trim()).filter(Boolean)
  if (markers.length === 0) {
    return []
  }
  if (markers.some((marker) => processMatchesOwnedMarker(root!, marker))) {
    return tree.map((item) => item.PID)
  }
  if (!watchdogs.some((marker) => processMatchesOwnedMarker(root!, marker))) {
    return []
  }
  const hasOwnedDescendant = tree.some(
    (item) =>
      item.PID !== rootPid && markers.some((marker) => processMatchesOwnedMarker(item, marker))
  )
  if (!hasOwnedDescendant) {
    return []
  }
  return tree.map((item) => item.PID)
}

/**
 * 仅当 root PID 仍存在，且当前完整命令行与启动后保存的快照完全相等时，
 * 才返回其进程树。严格相等可拦住 PID 被终端、Codex 等进程复用的情况。
 */
export const ProcessOwnedPidsByPidAndCommand = (
  pid: string,
  expectedCommand: string | undefined,
  arr: PItem[]
): string[] => {
  // 旧命令快照入口也采用逐候选过滤；不把缺少首次执行身份的根送入严格停止器。
  if (!isReadableServiceStopRoot(arr.find((item) => item.PID === `${pid}`.trim()))) return []
  const tree = ProcessListByExactPid(pid, arr)
  if (tree.length === 0) {
    return []
  }
  const rootPid = `${pid}`.trim()
  const root = tree.find((item) => item.PID === rootPid)
  const command = root?.COMMAND ?? ''
  if (!expectedCommand || !command || ProcessCommandLooksLikeElectronChild(command)) {
    return []
  }
  if (command !== expectedCommand) {
    return []
  }
  return tree.map((item) => item.PID)
}

export const ProcessSearch = (search: string, aA = true, arr: PItem[]) => {
  const all: PItem[] = []
  if (!search) {
    return all
  }
  const find = (ppid: string) => {
    for (const item of arr) {
      if (item.PPID === ppid) {
        if (!all.find((f) => f.PID === item.PID)) {
          all.push(item)
          find(item.PID!)
        }
      }
    }
  }
  for (const item of arr) {
    const b = `${item.PID}` === `${search}`
    const c = `${item.PPID}` === `${search}`

    if (!aA) {
      search = search.toLowerCase()
      const a = item?.COMMAND && item.COMMAND.toLowerCase().includes(search)
      if (a || b || c) {
        if (!all.find((f) => f.PID === item.PID)) {
          all.push(item)
          find(item.PID!)
        }
      }
    } else {
      const a = item?.COMMAND && item.COMMAND.includes(search)
      if (a || b || c) {
        if (!all.find((f) => f.PID === item.PID)) {
          all.push(item)
          find(item.PID!)
        }
      }
    }
  }
  return all
}

/**
 * 所有模块/进程工具共用的严格停止入口，同时是唯一实际执行实现。
 * 服务发现/建树阶段负责归属和父先子后顺序；这里保留传入顺序去重，不重新
 * 查表、扩树、排序或校验身份。Windows 当前权限一次 taskkill，失败直接传播。
 */
export const ProcessKillStrict = async (sig: string, pids: string[]) => {
  if (!pids.length) {
    return
  }
  // 保留调用方顺序并去重；不能将 renderer/命令字符串直接拼进 shell。
  pids = [...new Set(pids.map((pid) => String(pid).trim()))]
  // 调用方已经从进程列表筛选归属。执行层不重复校验 PID、创建时间和路径，
  // 避免一个候选使整批已确认目标无法发出停止命令；这里只保留顺序并去重。
  if (isWindows()) {
    // FlyEnv 的 Windows 服务使用当前账户权限启动，停止沿用相同权限即可。
    // 即使命令非零，也可能是目标自然退出、启动失败或其他执行错误，不能据此
    // 重放 PowerShell 或触发 UAC/Helper。taskkill 自身负责幂等判断和详细日志；
    // 尚未证实成功的失败直接传播，由模块/批量调用方保留错误并继续结算其他服务。
    const { runWindowsTaskkill } = await import('./WindowsTaskkill')
    // 日志记录去重后的实际命令顺序，而不是执行层重新推导的根/深度。
    await logServiceStop('kill.dispatch', { orderedPids: pids })
    try {
      await runWindowsTaskkill(pids)
      await logServiceStop('kill.returned', { orderedPids: pids })
    } catch (error) {
      await logServiceStop('kill.failed', { orderedPids: pids, error: String(error) })
      throw error
    }
    return
  }
  let useHelper = false
  try {
    if (Helper.enable) {
      useHelper = true
    } else if (await AppHelperCheck()) {
      useHelper = true
    }
  } catch {
    useHelper = false
  }
  if (useHelper) {
    await Helper.send('tools', 'kill', sig, pids)
    return
  }
  const command = `kill ${sig} ${pids.join(' ')}`
  await execPromiseWithEnv(command)
}

export const ProcessKill = async (sig: string, pids: string[]) => {
  try {
    await ProcessKillStrict(sig, pids)
  } catch (e) {
    appDebugLog(`[ProcessKill][command][error]`, `${e}`).catch()
    // 还有服务使用兼容入口；Windows 命令失败必须向调用方传播，
    // 否则 N8N、网关等会清空 PID 并误报已停止。Unix 保留既有尽力清理语义。
    if (isWindows()) throw e
  }
}

export const fetchProcessPidByPort = async (port: string): Promise<PItem[]> => {
  // Windows 返回结构化端口进程列表；普通可读查询不会申请 UAC 或检查 Helper。
  if (isWindows()) return await Helper.send('tools', 'getPortPids', port)
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('Invalid port')
  }
  let pItems: PItem[] = []

  let useHelper = false
  try {
    if (Helper.enable) {
      useHelper = true
    } else if (await AppHelperCheck()) {
      useHelper = true
    }
  } catch {
    useHelper = false
  }
  if (useHelper) {
    pItems = await Helper.send<PItem[]>('tools', 'getPortPids', `${port}`)
  } else {
    // 端口先通过数字范围校验，再插入现有 shell 命令；直接读取 lsof 输出，
    // 避免管道覆盖 lsof 的退出码。
    const command = `lsof -nP -i:${port}`
    let content = ''
    try {
      const res = await execPromiseWithEnv(command)
      content = res.stdout.trim()
      if (!content) throw new Error('lsof returned an empty process query result')
    } catch (error) {
      // lsof 仅在退出码 1 且标准输出/错误均为空时表示无匹配；其他失败代表归属
      // 不可读，不能伪装成空停止目标。
      if (isEmptyLsofNoMatch(error)) return []
      throw error
    }

    const list: string[] = content.split('\n').filter((line) => line.trim().length > 0)
    for (const item of list) {
      const arr: string[] = item.trim().split(/\s+/)
      if (arr[0]?.toUpperCase() === 'COMMAND' && arr[1]?.toUpperCase() === 'PID') continue
      if (arr.length < 3 || !/^\d+$/.test(arr[1])) {
        throw new Error('Invalid lsof process list output')
      }
      const [command, pid, user] = arr
      pItems.push({
        COMMAND: command,
        PID: pid,
        USER: user,
        PPID: ''
      })
    }
    if (pItems.length === 0) throw new Error('lsof returned no process rows')
  }
  pItems = pItems.filter((p: PItem) => {
    return p.PID !== 'PID' && p.PPID !== 'PPID'
  })
  if (pItems.length > 0) {
    const allPitems: PItem[] = []
    const all = await ProcessListFetch()
    pItems.forEach((item) => {
      // 端口结果已经给出 PID；必须从该完整 PID 建树，不让 PID 数字作为模糊
      // 命令搜索词额外选中其他进程。
      const finds = ProcessListByExactPid(item.PID, all)
      finds.forEach((fitem) => {
        if (!allPitems.some((p) => p.PID === fitem.PID)) {
          allPitems.push(fitem)
        }
      })
    })
    return allPitems
  }
  return []
}

export function loopbackListeningPidsFromLsof(content: string): string[] {
  const pids = new Set<string>()
  for (const line of content.split('\n')) {
    const pid = line.trim()
    if (!pid) continue
    if (!/^\d+$/.test(pid)) throw new Error('Invalid lsof listener PID output')
    pids.add(pid)
  }
  return [...pids]
}

export const fetchLoopbackListeningPids = async (port: string): Promise<string[]> => {
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('Invalid port')
  }
  // Windows 监听查询使用系统 TCP State 枚举，不解析本地化 netstat 状态文本。
  if (isWindows()) {
    const { fetchLoopbackListeningPids: fetchWindowsListeners } = await import('./Process.win')
    return fetchWindowsListeners(port)
  }
  try {
    const result = await execPromiseWithEnv(`lsof -nP -iTCP@127.0.0.1:${port} -sTCP:LISTEN -t`)
    if (!result.stdout.trim()) throw new Error('lsof returned an empty listener query result')
    return loopbackListeningPidsFromLsof(result.stdout)
  } catch (error) {
    // 仅 lsof 退出码 1 且输出为空表示无监听者；归属查询失败必须传播，避免数据库
    // 在端口身份无法确认时继续停止。
    if (isEmptyLsofNoMatch(error)) return []
    throw error
  }
}
