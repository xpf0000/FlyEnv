import { ProcessListByExactPid, type PItem } from '@shared/Process'
import { isWindows } from '@shared/utils'
import { isReadableServiceStopRoot, processSnapshotParentMatches } from '@shared/ProcessSnapshot'

export type Neo4jStartupProcess = {
  PID: string
  PPID: string
  COMMAND: string
  /** 停止直接消费同次完整列表的 Windows 身份字段；Unix/旧查询可不提供。 */
  CREATED?: string
  EXECUTABLE?: string
}

export type Neo4jStartupProcessState =
  | { status: 'ready' }
  | { status: 'exited'; message: string }
  | { status: 'command-changed'; message: string }
  | { status: 'server-command-missing'; message: string }

function normalizedCommand(value: string): string {
  const normalized = value.trim().replace(/\\/g, '/').replace(/["']/g, '')
  return isWindows() ? normalized.toLowerCase() : normalized
}

function pathMarkerMatches(command: string, path: string): boolean {
  const normalized = normalizedCommand(command)
  const marker = normalizedCommand(path).replace(/\/+$/, '')
  const start = normalized.indexOf(marker)
  if (!marker || start < 0) return false
  // 安装目录后可跟子路径，但不能把 neo4j2 这种相邻目录当成目标实例。
  const next = normalized[start + marker.length] ?? ''
  return !next || next === '/' || /[\s=]/.test(next)
}

function exactOptionPathMatches(command: string, option: string, path: string): boolean {
  const expected = normalizedCommand(path).replace(/\/+$/, '')
  if (!expected) return false
  // Neo4j 支持 `--option=value` 与 `--option value`；引号值可包含空格。
  const expression = /--([a-z-]+)(?:=|\s+)(?:"([^"]*)"|'([^']*)'|([^\s]+))/g
  for (const match of command.replace(/\\/g, '/').matchAll(expression)) {
    if (match[1].toLowerCase() !== option) continue
    const value = normalizedCommand(match[2] ?? match[3] ?? match[4] ?? '').replace(/\/+$/, '')
    if (value === expected) return true
  }
  return false
}

export function neo4jProcessCommandMatchesInstance(
  command: string,
  installationPath: string,
  configDir: string
): boolean {
  // 两个参数值必须完整相等，不能用 contains 把 /neo4j 与 /neo4j2 当成同一数据目录。
  return (
    exactOptionPathMatches(command, 'home-dir', installationPath) &&
    exactOptionPathMatches(command, 'config-dir', configDir)
  )
}

/**
 * 返回该 Neo4j 实例必须停止的完整父子树。
 * 优先使用登记的启动 PID；若 PowerShell launcher 已退出，则以 home/config
 * 两个完整参数恢复 Java server，并纳入安装目录内 wrapper 祖先及该服务全部子孙。
 */
export function neo4jStopProcessPids(
  processes: readonly Neo4jStartupProcess[],
  startupPid: string,
  installationPath: string,
  configDir: string
): string[] {
  const targets = new Set<string>()
  const processItems = processes as unknown as PItem[]
  const addTree = (pid: string) => {
    // 归属发现中的不可读根只过滤，不影响其他可确认 Java/launcher 根。
    if (!isReadableServiceStopRoot(processItems.find((item) => item.PID === pid))) return
    ProcessListByExactPid(pid, processItems).forEach((process) => {
      targets.add(process.PID)
    })
  }
  const rootPid = `${startupPid ?? ''}`.trim()
  const root = processes.find((process) => `${process.PID}`.trim() === rootPid)
  if (root && pathMarkerMatches(root.COMMAND, installationPath)) {
    addTree(rootPid)
  }

  for (const process of processes) {
    // 先过滤独立恢复根，再沿其有效祖先链恢复 wrapper；坏候选不能反向授权祖先。
    if (
      !isReadableServiceStopRoot(process) ||
      !neo4jProcessCommandMatchesInstance(process.COMMAND, installationPath, configDir)
    ) {
      continue
    }
    let parentPid = `${process.PPID ?? ''}`.trim()
    let child = process
    const visitedParents = new Set<string>()
    while (parentPid && !visitedParents.has(parentPid)) {
      visitedParents.add(parentPid)
      const parent = processes.find((item) => `${item.PID}`.trim() === parentPid)
      // 缺席父仅结束祖先恢复，不凭历史 PPID 把未知兄弟树加入目标。
      if (!parent || !processSnapshotParentMatches(child, parent)) break
      if (parentPid === rootPid) {
        addTree(rootPid)
        break
      }
      if (
        !pathMarkerMatches(parent.COMMAND, installationPath) ||
        !isReadableServiceStopRoot(parent)
      )
        break
      // 同目录且时间关系成立的祖先已确认，其完整树仍采用公共快照遍历。
      addTree(parentPid)
      child = parent
      parentPid = `${parent.PPID ?? ''}`.trim()
    }
    addTree(`${process.PID}`.trim())
  }

  return Array.from(targets).filter(Boolean)
}

export function neo4jStartupProcessState(
  processes: readonly Neo4jStartupProcess[],
  startupPid: string,
  startupCommand: string,
  installationPath: string,
  configDir: string
): Neo4jStartupProcessState {
  const rootPid = `${startupPid}`.trim()
  const root = processes.find((process) => `${process.PID}`.trim() === rootPid)
  if (!root) {
    return {
      status: 'exited',
      message: `Neo4j startup process ${rootPid} exited before startup completed`
    }
  }
  if (root.COMMAND !== startupCommand) {
    return {
      status: 'command-changed',
      message: `Neo4j startup process ${rootPid} command changed before startup completed`
    }
  }
  const pids = new Set(
    ProcessListByExactPid(rootPid, processes as unknown as PItem[]).map((process) => process.PID)
  )
  if (
    !processes.some(
      (process) =>
        pids.has(`${process.PID}`.trim()) &&
        neo4jProcessCommandMatchesInstance(process.COMMAND, installationPath, configDir)
    )
  ) {
    return {
      status: 'server-command-missing',
      message: `Neo4j server command was not found for startup process ${rootPid}`
    }
  }
  return { status: 'ready' }
}

export type Neo4jStartupProcessWaitOptions = {
  startupPid: string
  startupCommand: string
  installationPath: string
  configDir: string
  listProcesses: () => Promise<Neo4jStartupProcess[]>
  wait: (milliseconds: number) => Promise<unknown>
  attempts?: number
  intervalMilliseconds?: number
}

export async function waitForNeo4jStartupProcess(
  options: Neo4jStartupProcessWaitOptions
): Promise<void> {
  const attempts = Math.max(1, options.attempts ?? 60)
  const intervalMilliseconds = options.intervalMilliseconds ?? 500
  let lastState: Neo4jStartupProcessState | undefined

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const state = neo4jStartupProcessState(
      await options.listProcesses(),
      options.startupPid,
      options.startupCommand,
      options.installationPath,
      options.configDir
    )
    if (state.status === 'ready') return
    if (state.status !== 'server-command-missing') throw new Error(state.message)
    lastState = state
    if (attempt + 1 < attempts) {
      await options.wait(intervalMilliseconds)
    }
  }

  throw new Error(
    lastState?.status === 'server-command-missing'
      ? lastState.message
      : 'Neo4j startup process was not ready'
  )
}
